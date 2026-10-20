/**
 * @file characterStore.js
 * @description Zustand store for normalized character state with localStorage persistence.
 *
 * Architecture overview
 * ─────────────────────
 * State shape (all mutable data lives here):
 *   attributes : { [attrId]: { base, modifiers[], total } }
 *   skills     : { [skillId]: { base, modifiers[], total } }
 *   items      : { [instanceId]: NormalizedItem }
 *   effects    : { [effectId]: NormalizedEffect }
 *
 * Item identity rules
 * ───────────────────
 * The active inventory capability resolves catalog identity and package-owned
 * instance keys. The store preserves declared setting payload without parsing it.
 *
 * Kit → Inventory flow
 * ─────────────────────
 * 1. EquipmentKitModal resolves kit items via the active setting package's kit resolver
 *    (catalog lookup: weapons/armor/clothing/consumables)
 * 2. toInventoryItems() converts resolved entries to inventory-ready objects
 * 3. CharacterScreen.handleSelectKit() calls addNewItem(item) for each object
 * 4. InventoryScreen reads items via selectItemsByEquipped(state, false)
 *
 * Persistence
 * ───────────
 * The `persist` middleware serializes `attributes`, `skills`, `items`, `effects`
 * to localStorage under the key `character-store`.
 * On load, `normalizeForStore` converts legacy (array-based) saved data to the
 * normalized dict format used here.
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateAttributeTotal,
  calculateSkillTotal,
  normalizeItemParameters,
  calculateParameterTotal
} from './resolvers.js';

// Derived formulas are resolved dynamically through the active setting registry.
// The engine neither bundles nor selects a default rule implementation.
import { getCharacterCreationLogic, getDerivedStatsLogic, getPerks, getSettingService } from '../../domain/registry.js';
import { getActiveSettingRuntime, subscribeToActiveSettingRuntime } from '../engine/settings/activeSettingRuntime.js';

// Empty capability results keep the engine's inactive-setting state empty.
// Actual formulas are only supplied by the currently active package.
const calculateDerivedStats = (...args) => (
  getDerivedStatsLogic()?.calculateDerivedStats?.(...args) ?? {}
);
const calculateMaxHealth = (...args) => (
  getDerivedStatsLogic()?.calculateMaxHealth?.(...args) ?? 0
);
// Optional setting-provided perk rules; absence means no setting-specific flags.
const getPerkService = () => getSettingService('perks');

import { normalizeForStore, denormalizeForSave, migrateCharacterState } from './migrations.js';
import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from './saveSchema.js';
import { legacyEffectToStore, effectsDictToLegacyArray, syncTimedEffectsToStore } from './effectsSync.js';
import { advanceEffectsByScene, pruneExpiredTimedEffects } from '../../domain/effects';
import { createSettingActionActions } from './settingActions.js';
import { createOrchestrationActions } from './orchestratorsSlice.js';
import { denormalizeCharacterState } from './migrations.js';
import { createInitialEquipmentState, createEquipmentActions } from './equipmentSlice.js';
import { debugLog } from '../engine/debug/runtimeTrace.js';
import { selectPerkBonuses, reconcileSelectedPerksWithCatalog } from '../../domain/perks.js';
// Generic store identity adapters forward item records to active-setting capabilities.
import { generateItemIdForItem, generateStackKeyForItem, getItemId } from '../../domain/itemIdentity';
// Character-creation defaults are supplied by the active setting. Without a
// package, the engine keeps attribute and skill dictionaries empty.
import { createInitialAttributes, getAllSkills, getLuckPoints, getAttributeLimits } from '../../domain/characterCreation';
// Каунтеры ресурсов (domain/counters.js): персонажный счётный ресурс —
// число с нижней границей 0 без потолка. Тот же паттерн, что раньше жил
// в CharacterContext.
import { createCounter, consume, restore, set as setCounter } from '../../domain/counters';
import { selectLegacyAttributes } from './selectors.js';
import {
  createStateExtensionFields,
  getRegisteredStateExtensions,
  resetStateExtensionFields,
  serializeStateExtensionFields,
} from './stateExtensions.js';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { findCatalogEntry, inferItemType } from '../../domain/resolveItem';

// Helper function to generate unique IDs
const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Normalize a parameter value to Parameter<T> format
 * @param {*} value - Raw parameter value (number or object)
 * @param {Object} modifier - Optional modifier from mod
 * @returns {Object} Normalized parameter object with {base, modifiers, total}
 */
const normalizeParameter = (value, modifier = null) => {
  if (value === undefined || value === null) return undefined;

  const baseValue = typeof value === 'number' ? value : value?.base ?? 0;

  const parameter = {
    base: baseValue,
    modifiers: [],
    total: baseValue,
  };

  // Apply modifier if present
  if (modifier && modifier.value !== undefined) {
    const modValue = Number(modifier.value) || 0;
    parameter.modifiers.push({
      source: `mod_${modifier.id || 'unknown'}`,
      value: modValue,
      operation: modifier.op || '+',
    });
    // Recalculate total
    parameter.total = calculateParameterTotal(baseValue, parameter.modifiers);
  }

  return parameter;
};

const getSettingItemParameterFields = () => {
  const fields = getSettingService('inventory')?.itemParameterFields;
  return Array.isArray(fields) ? fields.filter((field) => typeof field === 'string') : [];
};

const normalizeSettingItemParameters = (item) => Object.fromEntries(
  getSettingItemParameterFields().map((field) => [
    field,
    normalizeParameter(item?.[field], item?.[`${field}Modifier`]),
  ]),
);

const getSettingItemInstanceFields = (item) => {
  const declaredFields = getSettingService('inventory')?.itemInstanceFields;
  if (!Array.isArray(declaredFields)) return {};
  return Object.fromEntries(
    declaredFields
      .filter((field) => typeof field === 'string' && Object.hasOwn(item ?? {}, field))
      .map((field) => [field, item[field]]),
  );
};

const normalizeStoreItemParameters = (item) => {
  const normalized = normalizeItemParameters(item, getSettingItemParameterFields());
  const normalizeSettingItem = getSettingService('inventory')?.normalizeItemState;
  return typeof normalizeSettingItem === 'function' ? normalizeSettingItem(normalized) : normalized;
};

// Main store creation
// ── МК-3, шаг 2 (патч 317): каскад производных ──────────────────────────────
// Любое действие, меняющее вход пересчёта (атрибуты, эффекты, бонусы,
// профиль персонажа, setting extensions или контекст экипировки), теперь само
// пересчитывает derivedStats через правила активного пакета.
// Ручные вызовы recalculateDerivedStats/triggerDependentCalculations из
// обычных действий удалены; action providers активного setting-а доступны
// через generic setting-action dispatcher.
// Сравнение входов по ссылке корректно, потому что стор обновляется
// иммутабельно; флаг deriving гасит повторный вход (set из самого каскада
// не порождает новый каскад).

// Входы вывода производных (все — иммутабельно заменяемые ключи состояния).
const DERIVED_INPUT_KEYS = [
  'attributes',
  'effects',
  'perkBonuses',
  'trait',
  'level',
  'origin',
  'stateExtensions',
  '_characterContext',
];

// Единая функция вывода: снимок состояния (+ опции-переопределения) → derivedStats.
// Пакет правил получает общее состояние и сам интерпретирует свои расширения.
const deriveFromSnapshot = (state, options = {}) => {
  const context = {
    trait: state.trait,
    level: state.level,
    ...(state._characterContext || {}),
    ...options,
  };
  const perkCharacterContext = getPerkService()?.getCharacterContext?.({
    origin: state.origin,
    trait: context.trait,
    stateExtensions: state.stateExtensions,
    equipmentState: context.equipmentState,
  }) ?? {};
  const perkEquipmentContext = getPerkService()?.getEquipmentContext?.(state.equippedArmor || {}) ?? {};
  const equipmentState = {
    ...(context.equipmentState || {}),
    ...perkCharacterContext,
    ...perkEquipmentContext,
  };
  return calculateDerivedStats(
    state.attributes,
    { ...state.effects, perkBonuses: state.perkBonuses },
    context.trait,
    context.level,
    { ...equipmentState, perkBonuses: state.perkBonuses },
  );
};

const withDerivedCascade = (config) => (set, get, api) => {
  let deriving = false;
  const cascadedSet = (partial, replace, actionName) => {
    const prev = get();
    set(partial, replace, actionName);
    if (deriving) return;
    const next = get();
    const dirty = DERIVED_INPUT_KEYS.some((key) => prev[key] !== next[key]);
    if (!dirty) return;
    deriving = true;
    try {
      const derivedStats = deriveFromSnapshot(next);
      if (next.derivedStats !== derivedStats) set({ derivedStats });
    } finally {
      deriving = false;
    }
  };
  return config(cascadedSet, get, api);
};

/**
 * 343: ключи модов, установленных на предмет-носитель hostKey (чистый —
 * используется и внутри транзакций, где set() должен случиться один раз).
 */
const collectModsBoundTo = (items, hostKey) => Object.entries(items || {})
  .filter(([, item]) => item?.installedOn && item.installedOn === hostKey)
  .map(([key]) => key);

let characterStoreHydrated = false;

const useCharacterStore = create(withDerivedCascade(devtools(
  persist(
    (set, get) => ({
      // --- Initial State ---
      // Package-provided character catalog; no package means empty maps.
      ...normalizeForStore({
        attributes: createInitialAttributes(),
        skills: getAllSkills().map((skill) => ({ ...skill, value: 0 })),
      }),
      selectedSkills: [],
      extraTaggedSkills: [],
      forcedSelectedSkills: [],
      // Профиль персонажа — Шаг 7 миграции (источник — стор).
      origin: null,
      trait: null,
      level: 1,
      characterName: '',
      attributesSaved: false,
      skillsSaved: false,
      luckPoints: 0,
      maxLuckPoints: 0,
      availablePerkAttributePoints: 0,
      // ═══ Каунтеры персонажа — Шаг 8а миграции (источник — стор). ═══
      // Текущее значение общего ресурса; формула потолка и границы задаются
      // активным setting capability через операции domain/counters.js.
      currentHealth: 0,
      // ═══ Шаг 8а (часть 3): счётчик сцен, эффекты трейтов, изменённые предметы. ═══
      // sceneCounter — сколько сцен сменилось с начала персонажа (данные).
      // traitEffects — «эффекты трейтов» (в сейве ключ effects; смена трейта
      // вычитает старые и дописывает новые — пишутся только из trait-логики).
      // modifiedItems — модифицированные предметы: словарь { [itemId]: item };
      // в снапшот сейва идёт как Map→массив пар (формат не менялся), поэтому
      // в сторе держим JSON-дружелюбный объект, а не Map.
      sceneCounter: 0,
      traitEffects: [],
      modifiedItems: {},
      // Текущий сейв — runtime-состояние (НЕ персистится): персонаж выбирается
      // из списка при старте; автосейв работает только для isSaved+id.
      currentCharacterId: null,
      isSaved: false,
      // Shared condition/status records and scene-risk tracking.
      conditions: [],
      sceneRiskStates: {},
      items: {},
      effects: {},
      // Поля расширений состояния сеттингов (src/store/stateExtensions.js):
      // движок хранит их как непрозрачный словарь { [fieldKey]: payload }.
      // Единый
      // источник истины: мутации только через действия стора
      // (setStateExtensions / setStateExtension), экраны подписаны
      // селекторами. В сейв поля идут под своими ключами верхнего уровня
      // (buildSnapshot контекста раскладывает словарь).
      stateExtensions: {},
      // Комплект снаряжения { id, name, weight, price, items,
      // purchaseMaxRarity } | null — единственный источник истины, мигрирован
      // из useState в CharacterContext. Мутации — только через setEquipment
      // (поддерживает и функциональный апдейтер prev => next).
      equipment: null,
      /**
       * Персонажный счётный ресурс без верхней границы. Единственный источник
       * правды; конкретные название, иконка и локализация поставляются UI-слоем
       * активного сеттинга.
       * @type {number}
       */
      currency: 0,
      selectedPerks: [],
      pendingPerksDormant: [],
      dormantNoticeFingerprint: null,
      // Per-character journal: tagged skills whose one-time starting reward was issued.
      rewardedSkills: [],
      // Надетое оружие персонажа: МЕТАДАННЫЕ (встроенные кулаки/манипуляторы,
      // sourceSlot и т.п.) — «живые» предметы лежат в items (equipped: true),
      // этот список их дополняет (Шаг 3 миграции из CharacterContext).
      // Мутации — только через setEquippedWeapons (поддерживает и
      // функциональный апдейтер prev => next).
      equippedWeapons: [],
      derivedStats: {}, // Calculated derived stats

      perkBonuses: {},

      // Shared worn-armor layer state; setting-owned payloads live in extensions.
      ...createInitialEquipmentState(),

      // Status flags (not part of persistence)
      isEffectsProcessing: false,

      // --- Actions: Perks ---
      /**
       * Выбранные перки: массивом или функцией от предыдущего (Шаг 8а;
       * функциональный апдейтер — обязательное требование к сеттерам).
       */
      setSelectedPerks: (updater) => {
        const prev = get().selectedPerks || [];
        const next = typeof updater === 'function' ? (updater(prev) || []) : (updater || []);
        set({ selectedPerks: next });
        get().recalculatePerkBonuses();
      },

      /**
       * 412 (публичное приложение): мигратор перков при загрузке персонажа.
       * Слово владельца: «пусть сам решает» — недоступные по книге перки
       * (уровень/характеристики/робот/«или-или»/ранг сверх книжного) НЕ
       * снимаются: остаются в списке серыми и НЕ ДЕЙСТВУЮТ (гасит
       * evaluateSelectedPerkPicks — и бонусы, и гейты рецептов), снова
       * заработают, когда выполнятся условия, либо игрок заменит их сам.
       * Снимаются только неизвестные каталогу id (нет имени — нечего
       * показывать серым). pendingPerksDormant (не персистится) — список
       * погасших для уведомления; dormantNoticeFingerprint — то же
       * множество повторно не уведомляет (один показ на изменение).
       */
      reconcilePerksAtLoad: () => {
        const state = get();
        const result = reconcileSelectedPerksWithCatalog(
          state.selectedPerks || [],
          getPerks(),
          {
            attributes: state.attributes,
            level: state.level,
            origin: state.origin,
            trait: state.trait,
          },
        );
        const dormant = result.inactivePicks;
        const fingerprint = JSON.stringify(dormant.map((p) => [p.id, p.rank, p.reason]));
        const shouldNotify = fingerprint !== state.dormantNoticeFingerprint;
        if (result.changed) {
          set({ selectedPerks: result.selectedPerks });
          get().recalculatePerkBonuses();
          debugLog('perks.reconcileAtLoad.removedUnknown', { removed: result.removed });
        }
        set({
          pendingPerksDormant: dormant,
          dormantNoticeFingerprint: fingerprint,
        });
        return { changed: result.changed, removed: result.removed, dormant, shouldNotify };
      },

      markSkillsAsRewarded: (skills = []) => set((state) => ({
        rewardedSkills: [...new Set([...(state.rewardedSkills || []), ...skills])],
      })),

      recalculatePerkBonuses: () => {
        set({ perkBonuses: selectPerkBonuses(get(), getPerks()) });
      },

      // Generic bridge to action factories exposed by the active setting.
      ...createSettingActionActions(set, get),
      ...createEquipmentActions(set),
      ...createOrchestrationActions(set, get),

      // --- Actions: Attributes ---

      /**
       * Update an attribute's base value
       * @param {string} attrId - Attribute ID (e.g., 'STR', 'END')
       * @param {number} delta - Change to apply to base value
       */
      updateAttribute: (attrId, delta) => {
        const state = get();
        const attributes = { ...state.attributes };

        if (!attributes[attrId]) {
          debugLog('store.attrNotFound', { attrId });
          return;
        }

        // Create a copy of the attribute and update base value
        const updatedAttribute = {
          ...attributes[attrId],
          base: (attributes[attrId].base || 0) + delta,
        };

        // Recalculate total
        updatedAttribute.total = calculateAttributeTotal(updatedAttribute);
        attributes[attrId] = updatedAttribute;

        set({ attributes });
      },

      /**
       * Add a modifier to an attribute
       * @param {string} attrId - Attribute ID
       * @param {string} source - Source of the modifier (effect, perk, etc.)
       * @param {number} value - Modifier value
       * @param {string} operation - Operation: '+' (add) or '-' (subtract)
       */
      addAttributeModifier: (attrId, source, value, operation = '+') => {
        const state = get();
        const attributes = { ...state.attributes };

        if (!attributes[attrId]) {
          debugLog('store.attrNotFound', { attrId });
          return;
        }

        // Create a copy of the attribute
        const updatedAttribute = { ...attributes[attrId] };

        // Add the new modifier
        updatedAttribute.modifiers = [
          ...(updatedAttribute.modifiers || []),
          { source, value, operation }
        ];

        // Recalculate total
        updatedAttribute.total = calculateAttributeTotal(updatedAttribute);
        attributes[attrId] = updatedAttribute;

        set({ attributes });
      },

      /**
       * Remove a modifier from an attribute
       * @param {string} attrId - Attribute ID
       * @param {string} source - Source ID to remove
       */
      removeAttributeModifier: (attrId, source) => {
        const state = get();
        const attributes = { ...state.attributes };

        if (!attributes[attrId]) {
          debugLog('store.attrNotFound', { attrId });
          return;
        }

        // Create a copy of the attribute
        const updatedAttribute = { ...attributes[attrId] };

        // Remove modifiers with matching source
        updatedAttribute.modifiers = (updatedAttribute.modifiers || [])
          .filter(mod => mod.source !== source);

        // Recalculate total
        updatedAttribute.total = calculateAttributeTotal(updatedAttribute);
        attributes[attrId] = updatedAttribute;

        set({ attributes });
      },

      // --- Actions: Skills ---

      /**
       * Update a skill's base value
       * @param {string} skillId - Skill ID (e.g., 'SMALL_GUNS', 'MEDICINE')
       * @param {number} delta - Change to apply to base value
       */
      updateSkill: (skillId, delta) => {
        const state = get();
        const skills = { ...state.skills };

        if (!skills[skillId]) {
          debugLog('store.skillNotFound', { skillId });
          return;
        }

        // Create a copy of the skill and update base value
        const updatedSkill = {
          ...skills[skillId],
          base: (skills[skillId].base || 0) + delta,
        };

        // Recalculate total
        updatedSkill.total = calculateSkillTotal(updatedSkill);
        skills[skillId] = updatedSkill;

        set({ skills });
      },

      /**
       * Add a modifier to a skill
       * @param {string} skillId - Skill ID
       * @param {string} source - Source of the modifier (effect, perk, etc.)
       * @param {number} value - Modifier value
       * @param {string} operation - Operation: '+' (add) or '-' (subtract)
       */
      addSkillModifier: (skillId, source, value, operation = '+') => {
        const state = get();
        const skills = { ...state.skills };

        if (!skills[skillId]) {
          debugLog('store.skillNotFound', { skillId });
          return;
        }

        // Create a copy of the skill
        const updatedSkill = { ...skills[skillId] };

        // Add the new modifier
        updatedSkill.modifiers = [
          ...(updatedSkill.modifiers || []),
          { source, value, operation }
        ];

        // Recalculate total
        updatedSkill.total = calculateSkillTotal(updatedSkill);
        skills[skillId] = updatedSkill;

        set({ skills });
      },

      /**
       * Remove a modifier from a skill
       * @param {string} skillId - Skill ID
       * @param {string} source - Source ID to remove
       */
      removeSkillModifier: (skillId, source) => {
        const state = get();
        const skills = { ...state.skills };

        if (!skills[skillId]) {
          debugLog('store.skillNotFound', { skillId });
          return;
        }

        // Create a copy of the skill
        const updatedSkill = { ...skills[skillId] };

        // Remove modifiers with matching source
        updatedSkill.modifiers = (updatedSkill.modifiers || [])
          .filter(mod => mod.source !== source);

        // Recalculate total
        updatedSkill.total = calculateSkillTotal(updatedSkill);
        skills[skillId] = updatedSkill;

        set({ skills });
      },

      // --- Actions: Items ---

      /**
       * Update an item with partial changes
       * @param {string} itemId - Item ID
       * @param {object} patch - Partial item data to merge
       */
      updateItem: (itemId, patch) => {
        const state = get();
        const items = { ...state.items };

        if (!items[itemId]) {
          debugLog('store.itemNotFound', { itemId });
          return;
        }

        debugLog('store.updateItem.before', { itemId, oldItem: items[itemId], patch });
        // Merge the patch with existing item data
        const updatedItem = { ...items[itemId], ...patch };

        // Normalize item parameters (recalculate totals)
        const normalizedItem = normalizeStoreItemParameters(updatedItem);
        debugLog('store.updateItem.after', { itemId, updatedItem, normalizedItem });
        items[itemId] = normalizedItem;

        set({ items });
      },

      /** Spend ammunition; optional item-use rules return an opaque item update. */
      spendAmmoForWeapon: ({ weaponInstanceId, ammoIds, ammoAmount, allowUntrackedWeapon = false, itemUsePolicy }) => {
        const state = get();
        const weapon = state.items[weaponInstanceId] || null;
        const amount = Math.max(1, Math.floor(Number(ammoAmount) || 1));
        if (!weapon && !allowUntrackedWeapon) return { ok: false, reason: 'weapon-not-found' };

        const itemUseResult = weapon && typeof itemUsePolicy === 'function'
          ? itemUsePolicy({ item: weapon, amount })
          : null;
        if (itemUseResult?.ok === false) return itemUseResult;
        const updatedWeapon = itemUseResult?.item && typeof itemUseResult.item === 'object'
          ? itemUseResult.item
          : weapon;

        const acceptedAmmoIds = new Set(ammoIds || []);
        const inventoryService = getSettingService('inventory');
        const isAmmoItem = inventoryService?.isAmmoItem;
        const getCatalogItemId = inventoryService?.getCatalogItemId;
        const ammoEntries = Object.entries(state.items).filter(([, item]) => {
          const itemIsAmmo = typeof isAmmoItem === 'function'
            ? isAmmoItem(item)
            : item.itemType === 'ammo';
          const catalogItemId = typeof getCatalogItemId === 'function'
            ? getCatalogItemId(item)
            : item.catalogId || item.id;
          return itemIsAmmo && acceptedAmmoIds.has(catalogItemId);
        });
        const available = ammoEntries.reduce((sum, [, item]) => sum + (Number(item.quantity) || 1), 0);
        if (available < amount) return { ok: false, reason: 'not-enough-ammo' };

        const items = { ...state.items };
        let remaining = amount;
        for (const [itemId, ammo] of ammoEntries) {
          if (!remaining) break;
          const quantity = Number(ammo.quantity) || 1;
          const spent = Math.min(quantity, remaining);
          if (quantity === spent) {
            delete items[itemId];
            // 343: моды уходят с предметом — удаляем из ЭТОЙ копии (set() ниже
            // перезапишет стор целиком, отдельный set() внутри откатится)
            for (const modKey of collectModsBoundTo(items, itemId)) delete items[modKey];
          }
          else items[itemId] = { ...ammo, quantity: quantity - spent };
          remaining -= spent;
        }
        if (weapon && updatedWeapon !== weapon) items[weaponInstanceId] = updatedWeapon;
        set({ items });
        return { ok: true };
      },

      /**
       * Атомарное списание стоков по КАНОНИЧЕСКИМ id каталога (патч 251, для
       * универсального движка крафта; разборка хлама потом встанет на него же).
       *
       * `{ ok: true, spent }` или `{ ok: false, reason, itemId }`; при отказе
       * состояние не трогается вообще — тот же контракт, что у spendCurrency
       * («нельзя купить на больше, чем есть»). Списание ищет экземпляры по
       * цепочке getItemId (канон предмета), quantity||1, и не трогает надетое
       * и запертое комплектом (equipped/locked — их нельзя «разобрать» молча).
       */
      spendItemStacks: ({ spend = [] }) => {
        const needs = new Map();
        for (const entry of spend) {
          const catalogId = String(entry?.itemId ?? '').trim();
          const count = Math.floor(Number(entry?.count));
          if (!catalogId || !Number.isInteger(count) || count <= 0) {
            throw new Error('[store.spendItemStacks] spend entries must be { itemId, count > 0 }');
          }
          needs.set(catalogId, (needs.get(catalogId) || 0) + count);
        }
        if (needs.size === 0) return { ok: true, spent: [] };

        const state = get();
        const items = { ...state.items };

        // Сначала всё посчитали — и только потом пишем. Первая же нехватка —
        // отказ без единой мутации.
        const plan = [];
        for (const [catalogId, need] of needs) {
          const keys = Object.entries(items)
            .filter(([, item]) => item && !item.equipped && !item.locked && getItemId(item) === catalogId)
            .map(([key]) => key);
          const available = keys.reduce((sum, key) => sum + (Number(items[key].quantity) || 1), 0);
          if (available < need) {
            return { ok: false, reason: 'not-enough-items', itemId: catalogId };
          }
          plan.push({ catalogId, need, keys });
        }

        const spent = [];
        for (const { catalogId, need, keys } of plan) {
          let remaining = need;
          for (const key of keys) {
            if (remaining <= 0) break;
            const quantity = Number(items[key].quantity) || 1;
            if (quantity <= remaining) {
              delete items[key];
              // 343: моды уходят с предметом — из этой же копии (см. выше)
              for (const modKey of collectModsBoundTo(items, key)) delete items[modKey];
              remaining -= quantity;
              spent.push({ itemId: catalogId, count: quantity, instanceId: key });
            } else {
              items[key] = { ...items[key], quantity: quantity - remaining };
              spent.push({ itemId: catalogId, count: remaining, instanceId: key });
              remaining = 0;
            }
          }
        }

        set({ items });
        return { ok: true, spent };
      },

      /**
       * Equip an item (set equipped = true)
       * @param {string} itemId - Item ID
       */
      equipItem: (itemId) => {
        const state = get();
        const items = { ...state.items };

        if (!items[itemId]) {
          debugLog('store.itemNotFound', { itemId });
          return;
        }

        // Create a copy of the item and set equipped to true
        const updatedItem = { ...items[itemId], equipped: true };
        items[itemId] = updatedItem;

        set({ items });
      },

      /**
       * 344: изменить количество предмета (кнопки «Продать»/«Потратить»/
       * «Выбросить» в инвентаре, расход по одной штуке). Удаление при нуле —
       * ТОЛЬКО здесь (одна копия правила): установленные моды уходят вместе
       * с предметом (слово владельца, 343 — «продали предмет с модом — ушли
       * оба»).
       */
      adjustItemQuantity: (itemId, delta) => {
        const items = { ...get().items };
        const item = items[itemId];
        if (!item) return;
        const newQty = (item.quantity || 1) + Number(delta) || 0;
        if (newQty <= 0) {
          delete items[itemId];
          for (const modKey of collectModsBoundTo(items, itemId)) delete items[modKey];
          set({ items });
          debugLog('item.quantity.deleted', { itemId, releasedMods: true });
          return;
        }
        items[itemId] = { ...item, quantity: newQty };
        set({ items });
      },

      /**
       * 343 (слово владельца): установить мод на предмет брони/одежды.
       * Мод-экземпляр получает флаг «экипирован» (equipped: true — исчезает
       * из сумки) и привязку к хосту (installedOn = ключ предмета-носителя).
       * Если экземпляра в сумке нет (настройка «требовать мод в сумке»
       * выключена) — ничего не делаем: мод «виртуальный», установка свободна.
       * @returns {string|null} ключ экземпляра мода или null.
       */
      // 399: необязательный slot — на записи остаётся «в какой слот встал»
      // (закон владельца «мод знает, куда он вставлен»); броня слот не
      // передаёт — поведение 343/344 без изменений.
      installArmorMod: ({ modId, hostKey, slot }) => {
        if (!modId) return null;
        // 344: привязка — к ПРЕДМЕТУ-носителю. Экземпляра нет (одежда кита,
        // стартовая запись без ключа в сумке) — мод НЕ флагается: остаётся
        // видимым в сумке, привязывать не к чему.
        if (!hostKey || !get().items[hostKey]) return null;
        const items = { ...get().items };
        const getModifierId = getSettingService('inventory')?.features?.modifierStorage?.getModifierId;
        const entry = Object.entries(items).find(([key, item]) => {
          const modifierRecordId = typeof getModifierId === 'function'
            ? getModifierId(item)
            : item?.catalogId || item?.id;
          return modifierRecordId === modId && !item.equipped && !item.installedOn;
        });
        if (!entry) return null;
        const [key, item] = entry;
        items[key] = {
          ...item,
          equipped: true,
          installedOn: hostKey || null,
          ...(slot ? { installedSlot: slot } : {}),
        };
        set({ items });
        debugLog('armorMod.installed', { modId, instanceKey: key, hostKey });
        return key;
      },

      /**
       * 343: снять мод с предмета (замена или «без мода») — теряет флаг
       * «экипирован» и снова виден в сумке.
       */
      uninstallArmorMod: ({ modId, hostKey }) => {
        if (!modId) return;
        const items = { ...get().items };
        const getModifierId = getSettingService('inventory')?.features?.modifierStorage?.getModifierId;
        const entry = Object.entries(items).find(([key, item]) => {
          const modifierRecordId = typeof getModifierId === 'function'
            ? getModifierId(item)
            : item?.catalogId || item?.id;
          return modifierRecordId === modId && item.installedOn
            && (!hostKey || item.installedOn === hostKey);
        });
        if (!entry) return;
        const [key, item] = entry;
        items[key] = { ...item, equipped: false };
        delete items[key].installedOn;
        delete items[key].installedSlot;
        set({ items });
        debugLog('armorMod.uninstalled', { modId, instanceKey: key });
      },

      /**
       * 343: предмет-носитель удалён (продан/потерян) — установленные на него
       * моды уходят вместе с ним («продали предмет с модом — ушли оба»).
       */
      releaseModsBoundTo: (hostKey) => {
        if (!hostKey) return;
        const items = { ...get().items };
        let changed = false;
        for (const [key, item] of Object.entries(items)) {
          if (item?.installedOn === hostKey) {
            delete items[key];
            changed = true;
            debugLog('armorMod.releasedWithHost', { key, hostKey });
          }
        }
        if (changed) set({ items });
      },

      /**
       * Unequip an item (set equipped = false)
       * @param {string} itemId - Item ID
       */
      unequipItem: (itemId) => {
        const state = get();
        const items = { ...state.items };

        if (!items[itemId]) {
          debugLog('store.itemNotFound', { itemId });
          return;
        }

        // Locked inventory entries are released only through their
        // setting-owned replacement or removal flow.
        if (items[itemId].locked) {
          debugLog('store.lockedUnequipRefused', { itemId });
          return;
        }

        // Create a copy of the item and set equipped to false
        const updatedItem = { ...items[itemId], equipped: false };
        items[itemId] = updatedItem;

        set({ items });
      },

      /**
       * Add an item record to the shared inventory store.
       * Catalog identity and item-specific payload are resolved by the active
       * setting; this action owns common quantity/equipped/stack transactions.
       *
       * @param {Object} item - Setting catalog or instance record
       */
      addNewItem: (item) => {
        const state = get();
        const items = { ...state.items };
        debugLog('items.add.received', {
          name: item?.name,
          itemType: item?.itemType,
          id: getSettingService('inventory')?.resolveCatalogIdForNewItem?.(item)
            ?? item?.catalogId
            ?? item?.id,
        });

        if (!item) {
          debugLog('items.add.invalid', { reason: 'null-or-undefined' });
          return;
        }

        const inventoryService = getSettingService('inventory');
        const resolveCatalogId = inventoryService?.resolveCatalogIdForNewItem;
        const catalogItemId = typeof resolveCatalogId === 'function'
          ? resolveCatalogId(item)
          : item.catalogId || item.id;

        if (!catalogItemId) {
          debugLog('items.add.invalid', { reason: 'no-catalog-id', item });
          return;
        }
        debugLog('items.add.canonicalId', { catalogItemId });

        // Callers may provide only a catalog reference. Resolve the active
        // package entry once, then preserve common state and declared payload.
        const catalog = getEquipmentCatalog();
        const requestedType = item.itemType || inferItemType(item);
        // Active packages may infer their own legacy catalog type from IDs;
        // the engine has no setting-specific prefix list.
        const idPrefixType = inventoryService?.inferItemTypeFromId?.(catalogItemId) ?? null;
        const settingTypeCandidates = getSettingService('inventory')?.catalogItemTypeCandidates;
        const lookupTypes = [...new Set([
          requestedType,
          idPrefixType,
          ...(Array.isArray(settingTypeCandidates) ? settingTypeCandidates : []),
        ].filter(Boolean))];
        const catalogItem = lookupTypes
          .map((type) => ({ type, entry: findCatalogEntry(catalog, catalogItemId, type) }))
          .find((result) => result.entry);
        const itemType = item.itemType || catalogItem?.entry?.itemType || catalogItem?.entry?.item_type || catalogItem?.type || requestedType;
        const sourceItem = catalogItem ? { ...catalogItem.entry, ...item, itemType } : { ...item, itemType };
        const settingItemFields = getSettingItemInstanceFields(sourceItem);
        const consumableStoreFields = getSettingService('consumables')?.getItemStoreFields?.(sourceItem) ?? {};

        const identityOptions = { identityId: catalogItemId };
        const createIdentityFields = inventoryService?.createItemIdentityFields;
        const identityFields = typeof createIdentityFields === 'function'
          ? createIdentityFields(sourceItem, { catalogItemId })
          : { catalogId: catalogItemId };
        const getStoredItemName = inventoryService?.getStoredItemName;
        const storedItemName = typeof getStoredItemName === 'function'
          ? getStoredItemName(sourceItem, { catalogItemId })
          : sourceItem.name || catalogItemId;
        const itemId = generateItemIdForItem(sourceItem, identityOptions);
        const stackKey = generateStackKeyForItem(sourceItem, identityOptions);

        const normalizedItem = {
          // Setting-owned instance payload and identity fields are copied opaquely.
          ...settingItemFields,
          ...identityFields,
          ...consumableStoreFields,
          id: itemId,
          instanceId: itemId,
          name: storedItemName,
          itemType,
          equipped: sourceItem.equipped || false,
          // Locked entries require a setting-owned replacement path rather than
          // the generic unequip action.
          locked: Boolean(sourceItem.locked),
          quantity: sourceItem.quantity || 1,
          stackKey: stackKey,

          // Normalize the shared numeric item parameters.
          damage: normalizeParameter(sourceItem.damage, sourceItem.damageModifier),
          fireRate: normalizeParameter(sourceItem.fireRate, sourceItem.fireRateModifier),
          // Additional numeric fields are declared by the active setting.
          ...normalizeSettingItemParameters(sourceItem),

          // Shared commerce fields remain part of the generic item record.
          cost: sourceItem.cost,
          rarity: sourceItem.rarity,
          weight: sourceItem.weight,
        };

        // Apply mod modifiers to parameters
        const applyStoredItemModifiers = inventoryService?.features?.itemModifiers?.applyStoredItemModifiers;
        const finalItem = typeof applyStoredItemModifiers === 'function'
          ? applyStoredItemModifiers(normalizedItem)
          : normalizedItem;

        const normalizedFinalItem = normalizeStoreItemParameters(finalItem);
        const addedQuantity = Number(normalizedFinalItem.quantity) || 1;
        const existingItemKey = Object.keys(items).find((key) => {
          const existing = items[key];
          return existing
            && (existing.stackKey || existing.id) === (normalizedFinalItem.stackKey || normalizedFinalItem.id)
            && Boolean(existing.equipped) === Boolean(normalizedFinalItem.equipped)
            && Boolean(existing.locked) === Boolean(normalizedFinalItem.locked);
        });

        if (existingItemKey) {
          const existingItem = items[existingItemKey];
          const existingQuantity = Number(existingItem.quantity) || 1;
          items[existingItemKey] = {
            ...existingItem,
            ...normalizedFinalItem,
            id: existingItem.id,
            quantity: existingQuantity + addedQuantity,
          };

          debugLog('items.add.stacked', { key: existingItemKey, quantity: items[existingItemKey].quantity });
          set({ items });

          return existingItemKey;
        }

        // Add item to store
        items[itemId] = normalizedFinalItem;

        debugLog('items.add.stored', { key: itemId, equipped: finalItem.equipped, itemType: finalItem.itemType });
        set({ items });

        return itemId;
      },

      // --- Actions: Effects ---

      /**
       * Add an effect to the store
       * @param {object} effect - Effect data (without id if new)
       */
      addEffect: (effect) => {
        const state = get();
        const effects = { ...state.effects };

        // Generate ID if not provided
        const effectId = effect.id || generateId();

        // Add effect to store with active flag
        effects[effectId] = {
          ...effect,
          id: effectId,
          active: true,
          createdAt: effect.createdAt || Date.now(),
        };

        set({ effects });
      },

      /**
       * Mark an effect as expired (set active = false)
       * @param {string} effectId - Effect ID
       */
      expireEffect: (effectId) => {
        const state = get();
        const effects = { ...state.effects };

        if (!effects[effectId]) {
          debugLog('store.effectNotFound', { effectId });
          return;
        }

        // Mark effect as inactive
        effects[effectId] = {
          ...effects[effectId],
          active: false,
        };

        set({ effects });
      },

      /**
       * Update an existing effect (e.g. scenesLeft after advancing scene)
       */
      updateEffect: (effectId, patch) => {
        const state = get();
        const effects = { ...state.effects };

        if (!effects[effectId]) {
          debugLog('store.effectNotFound', { effectId });
          return;
        }

        effects[effectId] = { ...effects[effectId], ...patch };
        set({ effects });
      },

      /**
       * Remove expired effects from the store
       */
      pruneExpiredEffects: () => {
        const state = get();
        const effects = { ...state.effects };

        // Filter out effects that are not active
        const activeEffects = {};
        Object.entries(effects).forEach(([id, effect]) => {
          if (effect.active) {
            activeEffects[id] = effect;
          }
        });

        if (Object.keys(activeEffects).length !== Object.keys(effects).length) {
          set({ effects: activeEffects });
        }
      },

      /**
       * Recalculate derived stats when effects or equipment change
       */
      triggerDependentCalculations: () => {
        get().recalculateDerivedStats();
      },

      // --- Helper Actions ---

      /**
       * Trigger recalculation of all parameter totals
       */
      recalculateAll: () => {
        const state = get();
        const { attributes, skills, items } = state;

        // Recalculate all attributes
        const updatedAttributes = { ...attributes };
        Object.keys(updatedAttributes).forEach(attrId => {
          const attribute = updatedAttributes[attrId];
          if (attribute) {
            updatedAttributes[attrId] = {
              ...attribute,
              total: calculateAttributeTotal(attribute),
            };
          }
        });

        // Recalculate all skills
        const updatedSkills = { ...skills };
        Object.keys(updatedSkills).forEach(skillId => {
          const skill = updatedSkills[skillId];
          if (skill) {
            updatedSkills[skillId] = {
              ...skill,
              total: calculateSkillTotal(skill),
            };
          }
        });

        // Recalculate all items
        const updatedItems = { ...items };
        Object.keys(updatedItems).forEach(itemId => {
          const item = updatedItems[itemId];
          if (item) {
            updatedItems[itemId] = normalizeStoreItemParameters(item);
          }
        });

        set({
          attributes: updatedAttributes,
          skills: updatedSkills,
          items: updatedItems,
        });

        get().recalculatePerkBonuses();
      },

      /**
       * Recalculate derived stats based on current state
       * This should be called when trait, level, or equipment changes
       * @param {Object} options - Optional: { trait, level, equipmentState }
       */
      recalculateDerivedStats: (options = {}) => {
        // МК-3 (патч 317): каскад пересчитывает автоматически после каждого
        // изменения входов; действие — публичная точка форс-пересчёта
        // (совместимость и явные опции-переопределения).
        set({ derivedStats: deriveFromSnapshot(get(), options) });
      },

      /**
       * Шаг 8в (патч 243): заполнить ещё не созданные поля сеттинговых
       * расширений (src/store/stateExtensions.js) по текущим origin/trait.
       * Раньше это делал эффект CharacterProvider (патч 207); после сноса
       * контекста действие зовут setOrigin/setTrait и колбэк реидратации.
       * null = «не создано»: фабрика заполняет ТОЛЬКО отсутствующие поля
       * (undefined/null); заданные сейвом/миграциями не трогает.
       */
      ensureStateExtensionFields: () => {
        const current = get();
        const { origin, trait } = current;
        const merged = { ...current.stateExtensions };
        const nextState = { ...current };
        let changed = false;
        let removedLegacyFlatFields = false;

        // Earlier persisted stores held setting extension values as flat root
        // keys. Lift only fields declared by the active extension registry and
        // remove those root aliases without knowing any setting field names.
        for (const extension of getRegisteredStateExtensions()) {
          const { fieldKey } = extension;
          if (!Object.hasOwn(current, fieldKey)) continue;
          if (!Object.hasOwn(merged, fieldKey)) merged[fieldKey] = current[fieldKey];
          delete nextState[fieldKey];
          removedLegacyFlatFields = true;
          changed = true;
        }

        if (origin) {
          const created = createStateExtensionFields({ origin, trait });
          for (const [fieldKey, value] of Object.entries(created)) {
            if (merged[fieldKey] === undefined || merged[fieldKey] === null) {
              if (merged[fieldKey] === value) continue; // null → null: менять нечего
              merged[fieldKey] = value;
              changed = true;
            }
          }
        }

        if (!changed) return;
        nextState.stateExtensions = merged;
        if (removedLegacyFlatFields) {
          set(nextState, true);
        } else {
          set({ stateExtensions: merged });
        }
      },

      /**
       * Set character context for derived stats calculation
       * @param {Object} context - { trait, level, equipmentState }
       */
      setCharacterContext: (context = {}) => {
        // Шаг 7: зеркалируются ТОЛЬКО производственные данные экипировки
        // (переносимый вес/СБ); trait/level/origin — публичные поля стора,
        // читаются deriveFromSnapshot и characterRules напрямую.
        // МК-3 (317): явный пересчёт отсюда удалён — set выше меняет
        // _characterContext, и каскад пересчитывает derivedStats сам.
        set({
          _characterContext: {
            equipmentState: context.equipmentState || {},
          }
        });
      },

      // --- Migration Actions ---

      /**
       * Загрузить данные в store из старого формата (массивов)
       * Используется при начальной загрузке из базы данных
       */
      loadFromLegacyData: (legacyData) => {
        const normalizedState = normalizeForStore(legacyData);
        set({ ...normalizedState, selectedPerks: legacyData?.selectedPerks || [] });
        get().recalculatePerkBonuses();
        get().recalculateAll();
      },

      /**
       * Поля расширений состояния (stateExtensions.js, патч 209): движок
       * хранит непрозрачный словарь, сеттинг сам кладёт/читает своё поле.
       */
      setStateExtensions: (dict = {}) => {
        set({ stateExtensions: dict });
      },

      setStateExtension: (fieldKey, value) => {
        set((state) => ({
          stateExtensions: { ...state.stateExtensions, [fieldKey]: value },
        }));
      },

      /** Generic dispatch to a setting-declared resource mutation capability. */
      applySettingResourceMutation: (resourceId, valueOrUpdater, options = {}) => {
        const applyMutation = getSettingService('characterResources')?.applyMutation;
        if (typeof applyMutation !== 'function') {
          return { ok: false, reason: 'unavailable' };
        }
        return applyMutation({ resourceId, valueOrUpdater, options, get, set });
      },

      /**
       * Комплект снаряжения персонажа: { id, name, weight, price, items,
       * purchaseMaxRarity } | null. Единственный источник — стор (мигрировано
       * из CharacterContext). Поддерживает функциональный апдейтер (prev => next)
       * для обратной совместимости с существующими вызовами.
       */
      setEquipment: (updater) => {
        set((state) => ({
          equipment: typeof updater === 'function' ? updater(state.equipment) : updater,
        }));
      },

      /**
       * Начислить ресурс. Без верхней границы; отрицательная/некорректная
       * сумма — no-op.
       * @param {number} amount
       */
      earnCurrency: (amount) => {
        const state = get();
        const counter = createCounter({ id: 'currency', current: state.currency, max: null });
        set({ currency: restore(counter, amount).current });
      },

      /**
       * Потратить ресурс. Транзакционная операция: при недостатке средств
       * баланс не меняется, возвращается явный отказ.
       * @param {number} amount
       * @returns {import('../../domain/types').SpendOutcome}
       */
      spendCurrency: (amount) => {
        const state = get();
        const delta = Number(amount);
        // Мусор (NaN и т.п.) — ошибка вызывающего: no-op вместо порчи ресурса
        // (раньше эту защиту давал toFiniteOrNull внутри consume).
        if (!Number.isFinite(delta)) return { ok: true };
        if (delta < 0) return { ok: true };
        if (delta > state.currency) {
          debugLog('store.currency.insufficient', { current: state.currency, amount });
          return { ok: false, reason: 'not-enough-currency' };
        }
        set({ currency: state.currency - delta });
        return { ok: true };
      },

      /**
       * Установить абсолютное значение — только при загрузке сейва.
       * @param {number} amount
       */
      setCurrency: (amount) => set({ currency: Math.max(0, Number(amount) || 0) }),

      /**
       * Список надетого оружия (метаданные: встроенные кулаки, манипуляторы,
       * sourceSlot). Единственный источник — стор (Шаг 3 миграции из
       * CharacterContext). Поддерживает функциональный апдейтер (prev => next)
       * для обратной совместимости с существующими вызовами.
       */
      setEquippedWeapons: (updater) => {
        set((state) => ({
          equippedWeapons: typeof updater === 'function' ? updater(state.equippedWeapons) : updater,
        }));
      },

      /**
       * Абсолютная запись базовых атрибутов из legacy-массива [{name, value}]
       * (создание персонажа, смена трейта, загрузка сейва). Словарь —
       * единственный источник (Шаг 5); дельта-обновления поверх — updateAttribute.
       */
      setBaseAttributes: (legacyArray) => {
        const normalized = normalizeForStore({ attributes: legacyArray });
        set({ attributes: normalized.attributes });
      },

      /**
       * Абсолютная запись базовых навыков из legacy-массива [{name, value}]
       * (тегирование, прокачка, загрузка сейва). Дельта-обновления — updateSkill.
       */
      setBaseSkills: (legacyArray) => {
        const normalized = normalizeForStore({ skills: legacyArray });
        set({ skills: normalized.skills });
      },

      /**
       * Отмеченные (tagged) навыки — список имён. Поддерживает функциональный
       * апдейтер (прецедент setEquippedWeapons): (prev) => next.
       */
      setSelectedSkills: (updater) => {
        set((state) => ({
          selectedSkills: typeof updater === 'function' ? updater(state.selectedSkills) : [...(updater || [])],
        }));
      },
      /** Дополнительные тегированные (трейт/перк) — как setSelectedSkills. */
      setExtraTaggedSkills: (updater) => {
        set((state) => ({
          extraTaggedSkills: typeof updater === 'function' ? updater(state.extraTaggedSkills) : [...(updater || [])],
        }));
      },
      /** Навязанные трейтом (forced) — как setSelectedSkills. */
      setForcedSelectedSkills: (updater) => {
        set((state) => ({
          forcedSelectedSkills: typeof updater === 'function' ? updater(state.forcedSelectedSkills) : [...(updater || [])],
        }));
      },

      /**
       * Состояния персонажа (['addicted', 'diseased', ...]) — Шаг 6.
       * Поддерживает функциональный апдейтер (прецедент setEquippedWeapons).
       */
      setConditions: (updater) => {
        set((state) => ({
          conditions: typeof updater === 'function' ? updater(state.conditions) : [...(updater || [])],
        }));
      },

      /** Состояния проверок риска сцен (ruleId → scene state) — Шаг 6. */
      setSceneRiskStates: (updater) => {
        set((state) => ({
          sceneRiskStates: typeof updater === 'function' ? updater(state.sceneRiskStates) : { ...(updater || {}) },
        }));
      },

      // ── Профиль персонажа (Шаг 7): сеттеры с функциональным апдейтером ──

      /** Ориджин (объект каталога | null). */
      setOrigin: (updater) => {
        set((state) => ({
          origin: typeof updater === 'function' ? updater(state.origin) : updater,
        }));
        // Шаг 8в (патч 243): эффект провайдера снесён — фабрики полей
        // сеттингов заполняются действием стора.
        get().ensureStateExtensionFields();
      },
      /** Трейт (объект каталога | null). */
      setTrait: (updater) => {
        set((state) => ({
          trait: typeof updater === 'function' ? updater(state.trait) : updater,
        }));
        get().ensureStateExtensionFields();
      },
      /** Уровень персонажа. */
      setLevel: (updater) => set((state) => ({
        level: typeof updater === 'function' ? updater(state.level) : updater,
      })),
      /** Имя персонажа. */
      setCharacterName: (updater) => set((state) => ({
        characterName: typeof updater === 'function' ? updater(state.characterName) : updater,
      })),
      /** Флаг «атрибуты сохранены» (UI создания). */
      setAttributesSaved: (value) => set({ attributesSaved: Boolean(value) }),
      /** Флаг «навыки сохранены» (UI создания). */
      setSkillsSaved: (value) => set({ skillsSaved: Boolean(value) }),
      /** Текущие очки удачи (current; потолок — производная, не персистится). */
      setLuckPoints: (updater) => set((state) => ({
        luckPoints: typeof updater === 'function' ? updater(state.luckPoints) : updater,
      })),
      /** Потолок очков удачи (производная getLuckPoints; хранится для UI). */
      setMaxLuckPoints: (updater) => set((state) => ({
        maxLuckPoints: typeof updater === 'function' ? updater(state.maxLuckPoints) : updater,
      })),
      /** Свободные очки атрибутов перков. */
      setAvailablePerkAttributePoints: (updater) => set((state) => ({
        availablePerkAttributePoints: typeof updater === 'function'
          ? updater(state.availablePerkAttributePoints)
          : updater,
      })),
      /** Начислить/списать очки атрибутов перков (не ниже 0). */
      addPerkAttributePoints: (points = 0) => set((state) => ({
        availablePerkAttributePoints: Math.max(0, state.availablePerkAttributePoints + points),
      })),

      /**
       * Reset all per-character Zustand data before starting a new character.
       *
       * The store is a working cache for the currently opened character, while
       * characters themselves are saved in the app DB. Seed default attributes
       * and skills immediately so queued React effects from the previously
       * opened character cannot refill an empty store with stale values.
       */
      // ── Каунтеры: здоровье/радиация (Шаг 8а миграции из CharacterContext) ──
      /**
       * Прямая установка здоровья (значение или функция от предыдущего).
       * Без клампов: вызывающий отвечает за границы (оркестратор расходников
       * передаёт посчитанный результат, выживание режет в 0).
       */
      setCurrentHealth: (valueOrUpdater) => set((state) => ({
        currentHealth: typeof valueOrUpdater === 'function'
          ? valueOrUpdater(state.currentHealth)
          : valueOrUpdater,
      })),
      /**
       * Лечение до потолка. Потолок — переданный вызывающим (уже уменьшенный
       * на радиацию) либо формула сеттинга от атрибутов и уровня.
       */
      healCharacter: (amount, maxOverride) => {
        const state = get();
        const legacyAttributes = selectLegacyAttributes({ attributes: state.attributes });
        const ceiling = maxOverride ?? calculateMaxHealth(legacyAttributes, state.level);
        set({
          currentHealth: restore(
            createCounter({ id: 'health', current: state.currentHealth, max: ceiling }),
            amount,
          ).current,
        });
      },
      /**
       * Урон — без потолка базовой формулы: текущее ОЗ может быть законно
       * ВЫШЕ базового максимума (бонус «прекрасно отдохнувший», патч 213,
       * радиация опускает максимум, не нанося урона). Граница — только 0.
       */
      damageCharacter: (amount) => {
        const state = get();
        set({
          currentHealth: consume(
            createCounter({ id: 'health', current: state.currentHealth, max: null }),
            amount,
          ).current,
        });
      },
      /**
       * Потеря ТЕКУЩИХ ОЗ от усталости за игровой час (патч 232, решение
       * владельца — по книге): без сопротивлений, до нуля включительно.
       * Зовёт SurvivalClock (тип выживания) и часы сна потерь не дают.
       */
      applySurvivalHpLoss: (loss) => {
        if (!(loss > 0)) return;
        set((state) => ({ currentHealth: Math.max(0, state.currentHealth - loss) }));
      },

      /** Счётчик сменённых сцен: значением или функцией от предыдущего. */
      setSceneCounter: (valueOrUpdater) => set((state) => ({
        sceneCounter: typeof valueOrUpdater === 'function'
          ? valueOrUpdater(state.sceneCounter)
          : valueOrUpdater,
      })),
      /**
       * «Эффекты трейтов» (в сейве — ключ effects; поле traitEffects): значением
       * или функцией. Пишутся только из логики смены трейта (CharacterScreen).
       */
      setTraitEffects: (valueOrUpdater) => set((state) => ({
        traitEffects: typeof valueOrUpdater === 'function'
          ? (valueOrUpdater(state.traitEffects) || [])
          : (valueOrUpdater || []),
      })),
      /**
       * Модифицированные предметы: словарь { [itemId]: item } (значение или
       * функция). Патч 237: альбом ПЕРЕСТАЛ ПИСАТЬСЯ — моды кладутся прямо на
       * предмет. Setting-owned fields and their interpretation are delegated
       * to active package capabilities; the engine retains the legacy read path.
       * Осталась роль: ЧТЕНИЕ старых сейвов (записи альбома продолжают
       * работать через getModifiedItem инвентаря) + загрузка сейва
       * (setModifiedItems). В снапшот сейва провайдер кладёт Map→массив пар —
       * формат сейва не менялся.
       */
      setModifiedItems: (valueOrUpdater) => set((state) => ({
        modifiedItems: typeof valueOrUpdater === 'function'
          ? (valueOrUpdater(state.modifiedItems) || {})
          : (valueOrUpdater || {}),
      })),

      /**
       * Подтвердить распределение атрибутов (экран создания персонажа).
       * Принимает legacy-массив нового распределения и потраченные perk-очки:
       *   - значения клампятся к потолку трейта (getAttributeLimits);
       *   - дельты пишутся в стор через updateAttribute (тот сам пересчитывает
       *     производные — perkBonuses, вес, инициативу и т.д.);
       *   - списываются очки perk-атрибутов;
       *   - потолок удачи следует за УДАЧ+модификатором трейта, текущая
       *     удача подрезается сверху (понижение УДАЧ не возвращает очки);
       *   - здоровье подрезается к новому потолку (уровень мог упасть).
       * Шаг 8а (патч 238): переехал из CharacterContext 1-в-1; в контексте
       * при этом ушла работа с локальным зеркалом-массивом — теперь и «текущие
       * значения» берутся из словаря стора напрямую.
       */
      commitAttributeChanges: (newAttributes, pointsSpent) => {
        const creationRules = getCharacterCreationLogic();
        const maxHealthRule = getDerivedStatsLogic()?.calculateMaxHealth;
        if (typeof creationRules?.getAttributeLimits !== 'function'
          || typeof maxHealthRule !== 'function') return false;

        const state = get();
        const { trait } = state;
        const committedAttributes = (newAttributes || []).map((newAttr) => {
          if (!newAttr?.name) return newAttr;
          const limits = getAttributeLimits(trait, newAttr.name);
          if (!limits || !Number.isFinite(Number(limits.max))) return newAttr;
          const { max } = limits;
          const value = Math.min(Number(newAttr.value) || 0, max);
          return value === newAttr.value ? newAttr : { ...newAttr, value };
        });

        committedAttributes.forEach((newAttr) => {
          if (!newAttr?.name) return;
          const currentAttr = state.attributes?.[newAttr.name]?.base ?? 0;
          const delta = newAttr.value - currentAttr;
          if (delta !== 0) get().updateAttribute(newAttr.name, delta);
        });

        set((s) => ({ availablePerkAttributePoints: s.availablePerkAttributePoints - pointsSpent }));
        const newLuck = getLuckPoints(committedAttributes, trait);
        set((s) => ({
          maxLuckPoints: newLuck,
          luckPoints: Math.min(s.luckPoints, newLuck),
        }));
        const newMaxHealth = calculateMaxHealth(newAttributes, get().level);
        set((s) => ({ currentHealth: Math.min(s.currentHealth, newMaxHealth) }));
      },

      // ── Сцены/эффекты/расходники-превью (Шаг 8а, патч 239) ──────────────
      /**
       * Применить ТОЛЬКО временные эффекты расходника (без витальных,
       * условий и журнала доз). Истёкшие эффекты гасятся до применения.
       */
      applyConsumableTimedEffects: (item) => {
        const store = get();
        const currentLegacy = effectsDictToLegacyArray(store.effects);
        const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
        normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

        const result = getSettingService('consumables')?.applyTimedEffects?.(
          item,
          normalizedCurrent.effects,
        ) ?? {
          effects: normalizedCurrent.effects,
          events: [],
          notificationEvents: [],
        };
        const normalizedResult = pruneExpiredTimedEffects(result.effects);
        syncTimedEffectsToStore(normalizedResult.effects, store);

        if (normalizedResult.effects.length > 0) {
          const timerPreview = normalizedResult.effects
            .map((effect) => `${effect.effectName || effect.effectLabel}: ${effect.scenesLeft} scenes`)
            .join(' | ');
          debugLog('consumable.timedEffects', { timerPreview });
        } else {
          debugLog('consumable.timedEffects', { timerPreview: null });
        }

        return { ...result, expired: normalizedCurrent.expired };
      },

      /**
       * Смена сцены: тик временных эффектов (истёкшие гаснут, у живых
       * уменьшается счётчик) и +1 к счётчику сцен. Сцены в приложении не
       * тикают сами (выживание тикает игровыми часами) — действие оставлено
       * для полноты конвейера (спящий код, как и раньше).
       */
      advanceScene: () => {
        const store = get();
        const currentLegacy = effectsDictToLegacyArray(store.effects);
        const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
        normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

        const { effects: nextEffects, expired } = advanceEffectsByScene(normalizedCurrent.effects);
        expired.forEach((effect) => store.expireEffect(effect.id));

        nextEffects.forEach((effect) => {
          if (store.effects[effect.id]) {
            store.updateEffect(effect.id, {
              scenesLeft: effect.scenesLeft,
              expiresAt: effect.expiresAt,
              durationMs: effect.durationMs,
            });
          }
        });

        set((state) => ({ sceneCounter: state.sceneCounter + 1 }));
        return { active: nextEffects, expired: [...normalizedCurrent.expired, ...expired] };
      },

      /**
       * Initialize an empty working store from the active package after cache
       * hydration. Without a character-creation capability, stale setting data
       * is cleared instead of being interpreted as engine defaults.
       */
      initializeCharacterCreationDefaults: () => {
        characterStoreHydrated = true;
        const rules = getCharacterCreationLogic();
        if (typeof rules?.createInitialAttributes !== 'function' || !Array.isArray(rules.ALL_SKILLS)) {
          const state = get();
          if (Object.keys(state.attributes || {}).length || Object.keys(state.skills || {}).length) {
            get().resetCharacterStore({ attributes: [], skills: [] });
          }
          return false;
        }

        const state = get();
        const hasCharacterData = Boolean(
          state.currentCharacterId
          || state.characterName
          || Object.keys(state.attributes || {}).length
          || Object.keys(state.skills || {}).length,
        );
        if (hasCharacterData) return false;

        const attributes = rules.createInitialAttributes();
        const skills = rules.ALL_SKILLS.map((skill) => ({ ...skill, value: 0 }));
        if (!attributes.length && !skills.length) return false;
        get().resetCharacterStore({ attributes, skills });
        const luck = rules.getLuckPoints?.(attributes) ?? 0;
        const health = getDerivedStatsLogic()?.calculateMaxHealth?.(attributes, 1) ?? 0;
        set({ currentHealth: health, maxLuckPoints: luck, luckPoints: luck });
        return true;
      },

      /**
       * Полный сброс персонажа («создать нового»): стартовые атрибуты/навыки,
       * здоровье на полный потолок, удача по стартовым атрибутам, чистый сейв-
       * статус. Шаг 8б (патч 242): переехал из CharacterContext; вся рутинная
       * часть — resetCharacterStore (профиль/счётчики/условия/снаряжение/робот/
       * броня/расширения), здесь — только то, что он не сеет.
       * Параметр preserveOrigin исторический: полному сбросу нечего сохранять.
       */
      resetCharacter: () => {
        useCharacterStore.persist?.clearStorage?.();
        get().resetCharacterStore({});
        const initialAttributes = createInitialAttributes();
        const initialLuck = getLuckPoints(initialAttributes);
        set({
          currentHealth: calculateMaxHealth(initialAttributes, 1),
          maxLuckPoints: initialLuck,
          luckPoints: initialLuck,
          currentCharacterId: null,
          isSaved: false,
        });
      },

      /**
       * Сброс комплекта снаряжения (смена ориджина/комплекта): очищает
       * инвентарь, награды за навыки, снаряжение, слоты робота, броню/СБ,
       * крышки — но СОХРАНЯЕТ атрибуты/навыки/профиль/здоровье.
       * keepSkills: true — не чистит tagged-skills и skillsSaved (смена
       * комплекта без сброса навыков). Шаг 8а (патч 241): переехал из
       * CharacterContext 1-в-1.
       */
      resetKitAndRewards: (opts = {}) => {
        const keepSkills = Boolean(opts.keepSkills);
        const legacy = denormalizeCharacterState(get());
        // resetCharacterStore сеет «полный сброс», но смена комплекта — НЕ
        // полный сброс: пока эти поля жили в CharacterContext, они сброс
        // переживали (в противоположность инвентарю/крышкам/наградам).
        // Захватываем и возвращаем — поведение 1-в-1 с до-миграционным.
        const survivorState = {
          currentHealth: get().currentHealth,
          sceneCounter: get().sceneCounter,
          traitEffects: get().traitEffects,
          modifiedItems: get().modifiedItems,
          conditions: get().conditions,
          stateExtensions: get().stateExtensions,
          // Tagged-skills и skillsSaved: при keepSkills выживают (смена
          // комплекта без сброса навыков); при !keepSkills чистятся ниже.
          // С Шага 5 resetCharacterStore их затирал — keepSkills не работал,
          // восстановлено в 241.
          selectedSkills: get().selectedSkills,
          extraTaggedSkills: get().extraTaggedSkills,
          forcedSelectedSkills: get().forcedSelectedSkills,
          skillsSaved: get().skillsSaved,
        };
        get().resetCharacterStore({
          attributes: legacy.attributes,
          skills: legacy.skills,
          rewardedSkills: [],
        });
        set(survivorState);
        if (!keepSkills) {
          set({
            selectedSkills: [],
            extraTaggedSkills: [],
            forcedSelectedSkills: [],
            skillsSaved: false,
          });
        }
      },

      resetCharacterStore: (legacyDefaults = {}) => {
        // Инвариант Шага 5: словари атрибутов/навыков никогда не пусты.
        // Вызывающий не передал дефолты → сеем стартовые значения создания.
        const defaultsSource = (legacyDefaults && (legacyDefaults.attributes || legacyDefaults.skills))
          ? legacyDefaults
          : { attributes: createInitialAttributes(), skills: getAllSkills().map((skill) => ({ ...skill, value: 0 })) };
        const normalizedDefaults = normalizeForStore(defaultsSource);

        set({
          attributes: normalizedDefaults.attributes || {},
          skills: normalizedDefaults.skills || {},
          selectedSkills: [],
          extraTaggedSkills: [],
          forcedSelectedSkills: [],
          conditions: [],
          sceneRiskStates: {},
          // Профиль — Шаг 7.
          origin: null,
          trait: null,
          level: 1,
          characterName: '',
          attributesSaved: false,
          skillsSaved: false,
          luckPoints: 0,
          maxLuckPoints: 0,
          availablePerkAttributePoints: 0,
          items: {},
          effects: {},
          stateExtensions: resetStateExtensionFields(),
          // Здоровье устанавливается формулой resetCharacter после сброса.
          currentHealth: 0,
          // Шаг 8а (часть 3).
          sceneCounter: 0,
          traitEffects: [],
          modifiedItems: {},
          // Текущий сейв — runtime (Шаг 8б).
          currentCharacterId: null,
          isSaved: false,
          selectedPerks: legacyDefaults?.selectedPerks || [],
          rewardedSkills: legacyDefaults?.rewardedSkills || [],
          perkBonuses: {},
          derivedStats: {},
          equipment: null,
          currency: 0,
          equippedWeapons: [],
          _characterContext: undefined,
          ...createInitialEquipmentState(),
        });

        get().recalculatePerkBonuses();
        get().recalculateAll();
      },

      /**
       * Экспортировать данные в старый формат для сохранения в БД
       */
      exportToLegacyData: () => {
        const state = get();
        return denormalizeForSave(state);
      },

    }),
    {
      name: 'character-store',
      // Storage adapter — works on both React Native (AsyncStorage) and web
      // (react-native-web maps AsyncStorage onto window.localStorage).
      // Без этого на native localStorage отсутствует и персист молча не работает.
      storage: createJSONStorage(() => AsyncStorage),

      // Версия схемы для Zustand persist. При несовпадении сохранённой версии
      // с текущей Zustand вызывает migrate() ДО onRehydrateStorage.
      // Синхронизирована с CURRENT_SCHEMA_VERSION из saveSchema.js — единственным
      // источником истины. При бампе версии: поднять CURRENT_SCHEMA_VERSION
      // и добавить функцию в MIGRATIONS[] в migrations.js.
      version: CURRENT_SCHEMA_VERSION,

      // Прогоняем сохранённое состояние через тот же конвейер миграций,
      // что и SQLite-загрузка (CharacterContext.deserializeState).
      // storedVersion — версия, с которой была записана запись в AsyncStorage.
      migrate: (persistedState, storedVersion) => {
        return migrateCharacterState({
          ...persistedState,
          schemaVersion: Number.isInteger(storedVersion) ? storedVersion : LEGACY_SCHEMA_VERSION,
        });
      },

      partialize: (state) => ({
        attributes: state.attributes,
        skills: state.skills,
        items: state.items,
        effects: state.effects,
        selectedPerks: state.selectedPerks,
        rewardedSkills: state.rewardedSkills,
        stateExtensions: serializeStateExtensionFields(state.stateExtensions),
        equipment: state.equipment,
        currency: state.currency,
        equippedWeapons: state.equippedWeapons,
        equippedArmor: state.equippedArmor,
        selectedSkills: state.selectedSkills,
        extraTaggedSkills: state.extraTaggedSkills,
        forcedSelectedSkills: state.forcedSelectedSkills,
        conditions: state.conditions,
        sceneRiskStates: state.sceneRiskStates,
        // Профиль — Шаг 7 (maxLuckPoints не персистится: производная,
        // правило 1 counters-storage.md).
        origin: state.origin,
        trait: state.trait,
        level: state.level,
        characterName: state.characterName,
        attributesSaved: state.attributesSaved,
        skillsSaved: state.skillsSaved,
        luckPoints: state.luckPoints,
        availablePerkAttributePoints: state.availablePerkAttributePoints,
        // Счётчики — текущее значение общего ресурса, не производная.
        currentHealth: state.currentHealth,
        // Шаг 8а (часть 3): сцены/эффекты трейтов/модификации предметов.
        sceneCounter: state.sceneCounter,
        traitEffects: state.traitEffects,
        modifiedItems: state.modifiedItems,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      }),
      // On rehydrate, ensure all totals are recalculated
      onRehydrateStorage: () => (state) => {
        if (state) {
          // The Zustand cache is a rebuildable web/native working cache. A
          // stale equipped item must not make the whole PWA fail before the
          // canonical character row can be loaded from SQLite.
          try {
            // Шаг 8в (патч 243): сначала фабрики расширений (эффект
            // провайдера снесён), затем пересчёт производных.
            state.ensureStateExtensionFields?.();
            // 411: мигратор перков («книга приоритетнее») — до пересчёта,
            // чтобы производные считались уже по сверенному списку.
            state.reconcilePerksAtLoad?.();
            state.recalculateAll();
          } catch (error) {
            debugLog('characterStore.rehydrate.recalculateFailed', {
              message: error?.message || String(error),
            });
            throw error;
          }
        }
      },
      // App.js explicitly awaits hydration before mounting CharacterProvider.
      // This prevents a persisted cache from racing with a character loaded
      // from the canonical SQLite/WebAdapter row.
      skipHydration: true,
    }
  ),
  {
    name: 'CharacterStore',
    // Only enable devtools in development
    enabled: process.env.NODE_ENV !== 'production',
  }
)));

// ── Шаг 8в (патч 243): derived-самосинхронизация стора ─────────────────────
// Эффект CharacterProvider (пуш equipmentState → setCharacterContext) снесён
// вместе с контекстом: стор сам следит за экипировкой/профилем. Наблюдаемые
// ключи — deps бывшего эффекта провайдера (атрибуты не смотрим: их входы
// каскад патча 317 подхватывает напрямую). Подписка
// срабатывает вне рендера (микрозадача патча 218 больше не нужна), повторный
// пуш с теми же ссылками гасится сравнением сигнатуры — цикла нет.
const derivedSnapshot = (state) => [
  state.trait,
  state.level,
  state.origin,
  state.equippedArmor,
];

const pushDerivedContext = () => {
  const state = useCharacterStore.getState();
  useCharacterStore.getState().setCharacterContext({
    equipmentState: {
      equippedArmor: state.equippedArmor,
    },
  });
};

let lastDerivedSignature = null;
useCharacterStore.subscribe((state) => {
  const signature = derivedSnapshot(state);
  if (lastDerivedSignature !== null
    && signature.length === lastDerivedSignature.length
    && signature.every((value, index) => value === lastDerivedSignature[index])) {
    return;
  }
  lastDerivedSignature = signature;
  pushDerivedContext();
});

// When a package is removed or replaced, clear its working state so catalog
// entries and rules cannot leak across settings. Saved character rows remain in
// the database; a later package activation may initialize a fresh working state.
let activeCreationSettingId = getActiveSettingRuntime()?.id ?? null;
subscribeToActiveSettingRuntime((runtime) => {
  const previousSettingId = activeCreationSettingId;
  const nextSettingId = runtime?.id ?? null;
  activeCreationSettingId = nextSettingId;

  if (!runtime || (previousSettingId !== null && previousSettingId !== nextSettingId)) {
    useCharacterStore.getState().resetCharacterStore({ attributes: [], skills: [] });
  }
  if (runtime && characterStoreHydrated) {
    useCharacterStore.getState().initializeCharacterCreationDefaults();
  }
});

// Startup sync is safe without a setting; derived stats remain empty until a
// package supplies the corresponding capability.
pushDerivedContext();
lastDerivedSignature = derivedSnapshot(useCharacterStore.getState());

export default useCharacterStore;
