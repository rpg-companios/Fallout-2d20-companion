// src/saves/characterSaves.js
//
// Блокнот сохранений — Шаг 8б миграции (патч 242): save/load/список/удаление
// и автосохранение переехали из CharacterContext в ОБЫЧНЫЙ модуль без React.
// React-контекст больше не участвует в судьбе сейвов: данные берутся из
// characterStore (getState), записи идут в db (SQLite/web-адаптер), облако —
// синхронизируется отдельно (components/cloudSync, уже было автономно).
//
// КОНТРАКТЫ (не менялись):
//   - формат сейва: buildSnapshot → mergeSnapshotWithStoreData →
//     serializeState → slimSaveData; исторические ключи сохранены
//     (caps/effects/modifiedItems-пары/schemaVersion);
//   - старые сейвы читаются (миграции migrations.js + гидрация расширений);
//   - автосейв: debounce 500 мс, только для уже сохранённого персонажа
//     (isSaved + currentCharacterId), облако — фоном;
//   - идентичность: канонические id (origin/trait/equipment — только по id).
//
// Текущий сейв (currentCharacterId/isSaved) — runtime-состояние стора
// (не персистится): при перезапуске приложения персонаж выбирается из списка,
// как и раньше.

import * as db from '../../db';
import { debugLog } from '../debug/falloutDebug';
import { showRawAlert } from '../../components/alerts/alertService';
import ruPerksAndTraitsScreen from '../../modules/fallout/i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../../modules/fallout/i18n/en-EN/screens/perksAndTraits/screen.json';
import useCharacterStore from '../store/characterStore';
import {
  denormalizeCharacterState,
  denormalizeEffects,
  migrateCharacterState,
  mergeEquippedWeapons,
} from '../store/migrations.js';
import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from '../store/saveSchema.js';
import { slimSaveData, restoreSaveData } from '../../domain/saveSlimming';
import { resolveItem, findCatalogEntry } from '../../domain/resolveItem';
import { getItemId } from '../../domain/itemIdentity';
import { canonizeLoadedCharacterItems } from '../../domain/kitItemCanonical';
import { findEnrichedOrigin, getBuiltinBaseWeapon } from '../../domain/origins';
import {
  createInitialAttributes,
  ALL_SKILLS,
  getLuckPoints,
  getAttributeValue,
  getAttributeLimits,
} from '../../domain/characterCreation';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { getCurrentLocale, getCurrentModuleLocale } from '../../i18n/locale';
import { migrateSkillsToCanonical } from '../../domain/skillCanonical';
import { resolveBodyPlan } from '../../domain/bodyplan';
import { resolveKitItems } from '../../domain/kitResolver';
import { inspectSelectedPerkRecords } from '../../domain/perks';
import { getPerks } from '../../domain/registry';
import {
  createStateExtensionFields,
  hydrateStateExtensionFields,
} from '../store/stateExtensions';
import { selectLegacyAttributes, selectLegacySkills } from '../store/selectors';
import { CHEM_DOSE_WINDOW_MS } from '../store/orchestratorsSlice';

const AUTOSAVE_DEBOUNCE_MS = 500;

const generateId = () => `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const PERK_ALERTS_DICT = {
  'ru-RU': ruPerksAndTraitsScreen.alerts,
  'en-EN': enPerksAndTraitsScreen.alerts,
};
const tPerkAlert = (key) => PERK_ALERTS_DICT[getCurrentLocale()][key];
// Диалоги идут через общий AlertHost — одна React-модалка на вебе и на нативе.
const paAlert = (title, message = '') => showRawAlert({ title, message });

// Resolve saved-character origin through the single source of truth:
// domain/origins.findEnrichedOrigin(id) returns the localized origin enriched
// with image + equipmentKits. A missing id/catalog entry is a data error.
const resolveOrigin = (storedOrigin) => {
  if (!storedOrigin) return null;
  const id = typeof storedOrigin === 'string' ? storedOrigin : storedOrigin.id;
  if (!id) throw new Error('[characterSaves] Сохранённый ориджин не содержит id');
  const resolved = findEnrichedOrigin(id);
  if (!resolved) {
    throw new Error(`[characterSaves] Ориджин "${id}" отсутствует в данных активного сеттинга`);
  }
  return resolved;
};

const clampAttributesToRules = (rawAttributes, trait) => {
  const attributes = Array.isArray(rawAttributes) ? rawAttributes : createInitialAttributes();
  return attributes.map((attribute) => {
    if (!attribute?.name) return attribute;

    const value = Number(attribute.value);
    if (!Number.isFinite(value)) return attribute;

    const { max } = getAttributeLimits(trait, attribute.name);
    if (value <= max) return attribute;

    debugLog('character.attribute.clampedOnLoad', {
      attribute: attribute.name,
      value,
      max,
    });
    return { ...attribute, value: max };
  });
};

const serializeState = (state) => {
  const serialized = {
    ...state,
    origin: state.origin?.id ? { id: state.origin.id } : null,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  // Формат-v2 (патч 247): картотека модификаций в запись не идёт — ключ
  // отсутствует целиком; миграции/загрузка трактуют отсутствие как
  // «альбома нет». Нормализация Map→пары при чтении сохранена для старых
  // сейвов (см. deserializeState).
  delete serialized.modifiedItems;
  return serialized;
};

// Каталог активной локали. Если построение каталога падает (дефект данных),
// возвращаем null и ужимание/восстановление просто пропускается — сейв
// сохраняется/грузится как есть, без поломки.
const catalogForCurrentLocale = () => {
  try { return getEquipmentCatalog(getCurrentModuleLocale()); }
  catch (e) { return null; }
};

// Обёртки над resolveItem/findCatalogEntry: каталог активной локали, с защитой
// от «кривого» предмета в старом сейве — при ошибке предмет остаётся как есть.
const resolveItemInCatalog = (item, catalog) => {
  try { return resolveItem(item, catalog); }
  catch (e) {
    return item;
  }
};

const findCatalogEntryInCatalog = (id, itemType, catalog) => {
  try { return findCatalogEntry(id, itemType, catalog); }
  catch (e) {
    return null;
  }
};

const deserializeState = (data) => {
  // Прогоняем сохранение через миграции: если формат старый (v0), приводим к
  // текущей версии. Миграции покрывают будущие изменения формата — вместо
  // «плодящихся fallback» в loadCharacter.
  const migrated = migrateCharacterState(data);
  // «Худые» сейвы (schemaVersion 19+) хранят только состояние экземпляра;
  // восстанавливаем каталожные данные (имя/цену/вес/статы/моды) здесь, чтобы
  // старые «жирные» и новые «худые» сейвы давали одинаковый рендер.
  // Каталог строим один раз на загрузку, а не на каждый предмет.
  const catalog = catalogForCurrentLocale();
  const restored = catalog
    ? restoreSaveData(migrated, { resolve: (item) => resolveItemInCatalog(item, catalog) })
    : migrated;
  // ── Формат-v2 (патч 247): мост картотеки модификаций НА ПРЕДМЕТЫ ──
  // Картотека (modifiedItems) в запись сейва больше не пишется; в СТАРЫХ
  // сейвах (до патча 237) в ней лежат полные копии модифицированных
  // предметов той эпохи. Один раз при загрузке переносим их на сами
  // предметы (схема «база + id модов на предмете»): запись альбома
  // заменяет худую запись в комплекте и на надетом оружии — дальше сейв
  // пересохранится уже без картотеки, а предметы не потеряют вид.
  // Записи без пары (предмет продан/потерян) оседают в стор-альбоме
  // как раньше (read-only поддержка инвентаря). Мост стоит ДО
  // канонизации id (canonizeLoadedCharacterItems), чтобы переехавшие
  // предметы прошли починку битых id на общих основаниях.
  const albumPairs = Array.isArray(restored.modifiedItems) ? restored.modifiedItems : [];
  if (albumPairs.length > 0) {
    const albumById = new Map(albumPairs.map(([albumItemId, albumItem]) => [albumItemId, albumItem]));
    const applyAlbumEntry = (item) => (item ? (albumById.get(getItemId(item)) || item) : item);
    if (Array.isArray(restored.equipment?.items)) {
      restored.equipment.items = restored.equipment.items.map(applyAlbumEntry);
    }
    if (Array.isArray(restored.equippedWeapons)) {
      restored.equippedWeapons = restored.equippedWeapons.map(applyAlbumEntry);
    }
  }

  return {
    ...restored,
    origin: resolveOrigin(restored.origin),
    modifiedItems: new Map(Array.isArray(restored.modifiedItems) ? restored.modifiedItems : []),
    schemaVersion: restored.schemaVersion ?? LEGACY_SCHEMA_VERSION,
  };
};

/**
 * Программа заточена на id: origin/trait/equipment — объекты с id, и их НИКОГДА
 * нельзя затирать «голым» объектом без id из стора. Если стор-значение — объект
 * без id, а снапшот имеет id — берём снапшот (метаданные), иначе preferFilled.
 */
// пустой массив [] при пустом сторе, а `[] ?? snapshot` оставляет [] (массив не nullish)
// и затирает реальные атрибуты/навыки снапшота → сохранёнка теряла данные (#5).
const preferFilled = (storeVal, snapshotVal) => {
  if (storeVal == null) return snapshotVal;
  if (Array.isArray(storeVal)) return storeVal.length > 0 ? storeVal : snapshotVal;
  if (typeof storeVal === 'object') return Object.keys(storeVal).length > 0 ? storeVal : snapshotVal;
  return storeVal;
};

const mergeSnapshotWithStoreData = (snapshot) => {
  const legacyData = denormalizeCharacterState(useCharacterStore.getState());
  return {
    ...snapshot,
    attributes: preferFilled(legacyData.attributes, snapshot.attributes),
    skills: preferFilled(legacyData.skills, snapshot.skills),
    equippedWeapons: mergeEquippedWeapons(snapshot.equippedWeapons, legacyData.equippedWeapons),
    activeTimedEffects: preferFilled(legacyData.activeTimedEffects, snapshot.activeTimedEffects),
    rewardedSkills: legacyData.rewardedSkills,
  };
};

/**
 * Снимок персонажа для сейва — целиком из состояния стора (Шаг 8б).
 * Исторические ключи формата: caps (ресурс), effects («эффекты трейтов»,
 * стор-поле traitEffects), activeTimedEffects (денормализация словаря
 * timed-эффектов), modifiedItems (Map), equippedRobotSlots (null для
 * «не робот»). Производные (maxLuckPoints, carryWeight, meleeBonus,
 * initiative, defense) в сейв НЕ идут — вычисляются при загрузке
 * (docs/architecture/counters-storage.md, правило 1).
 */
export const buildSnapshot = () => {
  const state = useCharacterStore.getState();
  const slots = state.robot?.slots ?? null;
  return {
    characterName: state.characterName,
    level: state.level,
    attributes: selectLegacyAttributes({ attributes: state.attributes }),
    skills: selectLegacySkills({ skills: state.skills }),
    selectedSkills: state.selectedSkills,
    extraTaggedSkills: state.extraTaggedSkills,
    forcedSelectedSkills: state.forcedSelectedSkills,
    origin: state.origin,
    trait: state.trait,
    equipment: state.equipment,
    // «Эффекты трейтов» — стор-поле traitEffects; сейв-ключ effects.
    effects: state.traitEffects,
    // Временные эффекты — из словаря стора: денормализация dict→array.
    activeTimedEffects: denormalizeEffects(state.effects || {}),
    sceneCounter: state.sceneCounter,
    equippedWeapons: state.equippedWeapons,
    // Слоты робота: пустой словарь («робота нет») пишется как null —
    // прежний формат сейва не меняется.
    equippedRobotSlots: (slots && Object.keys(slots).length > 0) ? slots : null,
    equippedRobotModules: state.robot?.modules ?? [],
    // ОС Mk II (Секьюритрон) — часть robot-состояния, обязана переживать сейв/загрузку.
    mk2Installed: state.robot?.mk2Installed ?? false,
    equippedArmor: state.equippedArmor,
    equippedPowerArmor: state.equippedPowerArmor,
    powerArmorRuntime: state.powerArmorRuntime,
    // Рантайм-имя ресурса — currency (стор), поле сейва остаётся caps:
    // персистентный формат не меняем (совместимость со старыми сохранениями
    // и migrations.js).
    caps: state.currency,
    currentHealth: state.currentHealth,
    radiation: state.radiation,
    // Формат-v2 (247): картотека модификаций в снапшот не входит —
    // моды живут на предметах (id+моды); содержимое старых сейвов
    // переносится на предметы при загрузке (мост в deserializeState).
    availablePerkAttributePoints: state.availablePerkAttributePoints,
    luckPoints: state.luckPoints,
    attributesSaved: state.attributesSaved,
    skillsSaved: state.skillsSaved,
    selectedPerks: state.selectedPerks,
    conditions: state.conditions,
    chemDosesLog: state.chemDosesLog,
    sceneRiskStates: state.sceneRiskStates,
    lastDiseaseResistAt: state.lastDiseaseResistAt,
    ...state.stateExtensions,
  };
};

/** Снимок → худая форма для БД ( slimSaveData по каталогу активной локали). */
const toSerialized = (snapshot) => {
  const merged = serializeState(mergeSnapshotWithStoreData(snapshot));
  const saveCatalog = catalogForCurrentLocale();
  return saveCatalog
    ? slimSaveData(merged, { getEntry: (id, itemType) => findCatalogEntryInCatalog(id, itemType, saveCatalog) })
    : merged;
};

/**
 * Сохранить персонажа (первое сохранение или переименование — зовёт экран
 * создания). Возвращает id записи или null при ошибке.
 */
export const saveCharacter = async (name) => {
  try {
    const state = useCharacterStore.getState();
    const id = state.currentCharacterId || generateId();
    useCharacterStore.setState({ currentCharacterId: id });

    const snapshot = { ...buildSnapshot(), characterName: name };
    const serialized = toSerialized(snapshot);

    await db.saveCharacter(
      id,
      name,
      snapshot.level ?? 1,
      snapshot.origin?.id || snapshot.origin?.name || null,
      serialized
    );
    await db.clearCharacterRenameRequest(id);

    // Флаг ставим СРАЗУ после записи в БД: локальное сохранение состоялось,
    // и UI не должен ждать облако (исторический дефект блокировки UI см.
    // в истории патчей: попап Google мог зависать до setIsSaved).
    useCharacterStore.setState({ isSaved: true });
    rememberLastSerialized(serialized);

    // Облако — фоном: его отказ не влияет на локальное состояние и UI.
    void syncCharacterToCloudIfEnabledSafe(id);

    return id;
  } catch (e) {
    return null;
  }
};

// Облако — опционально: Google может быть не сконфигурирован (сборка без облака).
const syncCharacterToCloudIfEnabledSafe = async (id) => {
  try {
    const { syncCharacterToCloudIfEnabled } = await import('../../components/cloudSync/googleDriveSync');
    await syncCharacterToCloudIfEnabled(id);
  } catch (e) {
    debugLog('sync.cloudUnavailable', { message: e?.message });
  }
};

// Последняя записанная сериализация — автосейв не пишет то же самое повторно
// (производные пересчёты стора не будят лишних записей).
let lastSerializedJson = null;
const rememberLastSerialized = (serialized) => {
  try { lastSerializedJson = JSON.stringify(serialized); } catch (e) { /* no-op */ }
};

/**
 * Загрузить персонажа по id: читает строку БД, прогоняет через миграции/
// канонизацию/гидрацию и раскладывает в стор через стор-действия.
 * @returns {Promise<boolean>} успех
 */
export const loadCharacter = async (id) => {
  try {
    const row = await db.loadCharacterById(id);
    if (!row) return false;
    // Мост канонизации (по образцу патча 225): битые id предметов китов
    // (фальшивая вода food_purified_water) переименовываются в канонические.
    // См. domain/kitItemCanonical.js; версия схемы сейва не меняется.
    const data = canonizeLoadedCharacterItems(deserializeState(row.data));
    // Автосейв загружаемые данные не перезаписывает: блокируем флагом.
    useCharacterStore.setState({ isSaved: false });

    const loadedTrait = data.trait || null;
    const loadedAttributes = clampAttributesToRules(data.attributes, loadedTrait);

    const st = useCharacterStore.getState();
    useCharacterStore.setState({
      currentCharacterId: id,
      characterName: row.name,
      level: data.level ?? 1,
    });
    st.setBaseAttributes(loadedAttributes);
    st.setBaseSkills(migrateSkillsToCanonical(data.skills) || ALL_SKILLS.map((sk) => ({ ...sk, value: 0 })));
    st.setSelectedSkills(data.selectedSkills || []);
    st.setExtraTaggedSkills(data.extraTaggedSkills || []);
    st.setForcedSelectedSkills(data.forcedSelectedSkills || []);
    st.setOrigin(data.origin || null);
    st.setTrait(loadedTrait);
    st.setEquipment(data.equipment || null);
    st.setTraitEffects(data.effects || []); // сейв-ключ effects → traitEffects
    // activeTimedEffects: массив из сейва уходит в словарь effects стора
    // через loadFromLegacyData (normalizeEffects), см. ниже.
    st.setSceneCounter(data.sceneCounter ?? 0);
    st.setSceneRiskStates(data.sceneRiskStates);
    // Поля сеттинговых расширений: hydrate расширения сам решает, как
    // нормализовать своё поле (идемпотентно, без подъёма версии схемы).
    useCharacterStore.getState().setStateExtensions(hydrateStateExtensionFields(data, {
      origin: resolveOrigin(data.origin),
      trait: data.trait || null,
    }));
    // Migrate old [null, null] format to dynamic array
    const rawWeapons = data.equippedWeapons || [];
    let migratedWeapons = Array.isArray(rawWeapons) ? rawWeapons.filter((w) => w !== null) : [];
    // Ensure the archetype's built-in unarmed weapon is present on load
    // (non-robots get fists; robots get melee via a manipulator, so nothing to inject).
    const loadedOrigin = resolveOrigin(data.origin);
    const builtin = getBuiltinBaseWeapon({ origin: loadedOrigin, trait: loadedTrait });
    if (builtin && !migratedWeapons.some((w) => w?.id === builtin.id)) {
      migratedWeapons = [builtin, ...migratedWeapons];
    }
    useCharacterStore.getState().setEquippedWeapons(migratedWeapons);
    // Seed the store's robot body plan first so derived carry-weight resolves
    // correctly, then load slots/modules (экшены слайса robot).
    useCharacterStore.getState().loadRobotState({
      bodyPlan: resolveBodyPlan({ origin: loadedOrigin, trait: loadedTrait }),
      slots: data.equippedRobotSlots ?? {},
      modules: data.equippedRobotModules ?? [],
      mk2Installed: data.mk2Installed ?? false,
    });
    // Встроенное оружие конечностей (манипуляторы, ладонные орудия) НЕ хранится
    // в equippedWeapons: экраны читают его из слотов стора — единый источник.
    // Слой брони/СБ из сейва — одним стор-действием; недоодетый диалог выбора
    // блока при загрузке всегда сбрасывается.
    useCharacterStore.getState().loadPowerArmorState({
      equippedArmor: data.equippedArmor,
      equippedPowerArmor: data.equippedPowerArmor,
      powerArmorRuntime: data.powerArmorRuntime,
    });
    // Абсолютная установка из сейва: инкрементальные earnCurrency/spendCurrency
    // для этого не годятся. Поле сейва — data.caps: формат не переименовываем.
    useCharacterStore.getState().setCurrency(data.caps ?? 0);
    useCharacterStore.setState({
      currentHealth: data.currentHealth ?? 0,
      radiation: Math.max(0, data.radiation ?? 0),
      lastDiseaseResistAt: data.lastDiseaseResistAt ?? null,
      modifiedItems: Object.fromEntries(
        data.modifiedItems instanceof Map
          ? data.modifiedItems.entries()
          : (Array.isArray(data.modifiedItems) ? data.modifiedItems : []),
      ),
      availablePerkAttributePoints: data.availablePerkAttributePoints ?? 0,
      luckPoints: data.luckPoints ?? 0,
      // Максимум удачи — производная (атрибуты + трейт), а не хранимое
      // значение: считаем его при загрузке, а не читаем из сейва. Иначе это
      // второй источник правды (counters-storage.md, правило 1).
      maxLuckPoints: getLuckPoints(data.attributes || createInitialAttributes(), loadedTrait),
      attributesSaved: data.attributesSaved ?? false,
      skillsSaved: data.skillsSaved ?? false,
      conditions: data.conditions || [],
      chemDosesLog: (data.chemDosesLog || []).filter((d) => Date.now() - d.takenAt < CHEM_DOSE_WINDOW_MS),
      // Журнал «одноразовые награды за tagged-навыки выданы» (патч 244:
      // паспорт сейва вскрыл рассинхрон — ключ писался мерджем со стором,
      // но загрузкой не читался; после сейв→загрузка игра забывала о
      // выданных наградах и могла вручить их заново). Старые сейвы без
      // ключа дают [] — поведение прежнее.
      rewardedSkills: Array.isArray(data.rewardedSkills) ? data.rewardedSkills : [],
    });
    st.setSelectedPerks(data.selectedPerks || []);
    if (data.pendingPerkDuplicateNotice) {
      paAlert(tPerkAlert('duplicatePerksFixedTitle'), tPerkAlert('duplicatePerksFixedMessage'));
    }
    const perkInspection = inspectSelectedPerkRecords(data.selectedPerks || [], getPerks());
    const brokenPerkLabels = [
      ...perkInspection.missingId,
      ...perkInspection.unknownId,
    ].map((entry) => entry.label);
    if (brokenPerkLabels.length > 0) {
      paAlert(
        tPerkAlert('perkMissingIdTitle'),
        brokenPerkLabels
          .map((label) => tPerkAlert('perkMissingIdMessage').replace('{perk}', label))
          .join('\n'),
      );
    }
    // carryWeight/meleeBonus/initiative/defense из сейва НЕ читаем: сразу
    // после загрузки их перетирает пересчёт derivedStats из стора.

    // Task 4.4: Migrate old format data to Zustand Store
    // This normalizes attributes, skills, items, and effects into the store
    useCharacterStore.getState().loadFromLegacyData({
      ...data,
      attributes: loadedAttributes,
    });

    // v14: Тень со старым комплектом → выдать предметы NIGHTKIN.
    // resolveKitItems асинхронный (rollTable бросает кубики), поэтому
    // выдаём здесь, после загрузки. Крышки: старый комплект (100) уже
    // в data.caps — оставляем как есть (комплект NIGHTKIN крышек не даёт).
    if (data.nightkinKitPending && data.equipment?.id === 'nightkin') {
      try {
        const catalog = getEquipmentCatalog();
        const kit = catalog?.equipmentKits?.nightkin;
        if (!kit?.name || !Array.isArray(kit.items)) {
          throw new Error('[loadCharacter] Комплект nightkin отсутствует в локализованном каталоге');
        }
        const resolved = await resolveKitItems({ id: 'nightkin', items: kit.items });
        (resolved.items || []).forEach((item) => {
          useCharacterStore.getState().addNewItem({ ...item, equipped: false, locked: false });
        });
        st.setEquipment({ id: 'nightkin', name: kit.name, items: resolved.items || [] });
        // снимаем флаг — чтобы не выдавать повторно при следующей загрузке
        data.nightkinKitPending = false;
      } catch (e) {
        debugLog('character.load.nightkinKitGrantFailed', { message: e?.message });
      }
    }

    const saved = !row.renamePending;
    useCharacterStore.setState({ isSaved: saved });
    // Только что загруженное — «уже записано»: автосейв не перезаписывает сейв
    // сразу после загрузки без реальных изменений.
    rememberLastSerialized(row.data);

    return true;
  } catch (e) {
    debugLog('character.load.failed', { message: e?.message });
    return false;
  }
};

/** Список сохранённых персонажей (строки БД). */
export const getCharactersList = async () => {
  try {
    return await db.getCharactersList();
  } catch (e) {
    return [];
  }
};

/** Удалить персонажа по id (облако чистит вызывающий — HomeScreen). */
export const deleteCharacter = async (id) => {
  try {
    await db.deleteCharacter(id);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Автосохранение: подписка на стор (zustand subscribe) с debounce 500 мс.
 * Пишет ТОЛЬКО уже сохранённого персонажа (isSaved + currentCharacterId);
 * пропускает запись, если сериализация не изменилась. Запускается из App.js
 * после готовности БД; возвращает функцию отписки.
 */
export const startCharacterAutosave = () => {
  let timer = null;
  const schedule = () => {
    const { isSaved, currentCharacterId } = useCharacterStore.getState();
    if (!isSaved || !currentCharacterId) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      try {
        const snapshot = buildSnapshot();
        const serialized = toSerialized(snapshot);
        let json = null;
        try { json = JSON.stringify(serialized); } catch (e) { /* no-op */ }
        if (json !== null && json === lastSerializedJson) return; // без изменений

        await db.saveCharacter(
          currentCharacterId,
          snapshot.characterName,
          snapshot.level ?? 1,
          snapshot.origin?.id || snapshot.origin?.name || null,
          serialized
        );
        rememberLastSerialized(serialized);
        // Облако — фоном, без await: задержка Google не тормозит следующий
        // цикл автосейва (ошибки гасятся внутри, sync.cloudFailed).
        void syncCharacterToCloudIfEnabledSafe(currentCharacterId);
      } catch (e) {
        // Автосейв молчит: следующее изменение состояния повторит попытку.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  return useCharacterStore.subscribe(schedule);
};
