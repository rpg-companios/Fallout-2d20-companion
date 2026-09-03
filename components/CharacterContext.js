import { debugLog } from '../src/debug/falloutDebug';
import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import * as db from '../db';
import ruCharacterScreen from '../i18n/ru-RU/screens/character/screen.json';
import {
  createInitialAttributes,
  ALL_SKILLS,
  ALL_SKILL_KEYS,
  getLuckPoints,
  calculateMaxHealth,
  calculateInitiative,
  calculateDefense,
  calculateMeleeBonus,
  calculateCarryWeight,
  getAttributeValue,
} from '../domain/characterCreation';

// One-time migration: legacy saves stored skills with Russian display names as
// `skill.name` (e.g. "Ремонт"). After the canonical-id refactor, identity is
// the UPPER_SNAKE_CASE key (e.g. "REPAIR"). This bridge runs only at load.
const RU_SKILL_NAME_TO_KEY = Object.entries(ruCharacterScreen?.skillsCatalog || {}).reduce(
  (acc, [key, ruName]) => { acc[ruName] = key; return acc; },
  {},
);
const migrateSkillsToCanonical = (rawSkills) => {
  if (!Array.isArray(rawSkills)) return null;
  return rawSkills.map((s) => {
    if (!s || typeof s.name !== 'string') return s;
    if (ALL_SKILL_KEYS.includes(s.name)) return s;             // already canonical
    const canonical = RU_SKILL_NAME_TO_KEY[s.name];            // legacy Russian
    return canonical ? { ...s, name: canonical } : s;
  });
};
import { findEnrichedOrigin, isRobotCharacter, getBuiltinBaseWeapon } from '../domain/origins';
import { meetsPerkRequirements, getPerkUnmetReasons, annotatePerks, inspectSelectedPerkRecords } from '../domain/perks';
import { applyConsumableToEffects, recordDoseWithinWindow, checkAddiction, applyRemoveConditions, advanceEffectsByScene, pruneExpiredTimedEffects, resolveConsumableRadiationRoll, resolveConsumableVitalChanges, SCENE_RULES } from '../domain/effects';
import { hasDamageImmunity, hasRadiationImmunity } from '../domain/immunities';
import { createSceneRiskTracker, getSceneRiskEventForRule } from '../domain/sceneRiskChecks';
import { isSkillTagged } from '../domain/d20Checks';
import { addPersistentDiseaseEffect, removePersistentDiseaseEffects, rollDiseaseFromCatalog } from '../domain/diseaseConditions';
import { syncCharacterToCloudIfEnabled } from './cloudSync/googleDriveSync';
import { showAlert as showCatalogAlert } from './alerts/alertService';

import { resolveBodyPlan } from '../domain/bodyplan';
import { createEmptyEquippedArmor } from '../domain/equippedArmor';
import {
  createEmptyEquippedPowerArmor,
  createEmptyPowerArmorRuntime,
  tickCoreAccumulator,
  drainActiveCore,
  packPackage,
  unpackPackage,
  insertCore,
  equipPowerArmorPiece,
  canEquipPowerArmorPiece,
  findChargedFusionCores,
  pickFusionCore,
  powerArmorPieceStackKey,
  powerArmorSlotsFor,
  resolvePowerArmorPieceTarget,
  repairPowerArmorPiece,
  adjustPieceHp,
  needsRepair,
  hasFrame,
  isPieceBroken,
  isPowerArmorFrame,
  FUSION_CORE_ID,
} from '../domain/powerArmor';
import { canEquipArmor } from '../domain/equipEquip';
import { resolveItem, findCatalogEntry } from '../domain/resolveItem';
import { slimSaveData, restoreSaveData } from '../domain/saveSlimming';
import { resolveKitItems } from '../domain/kitResolver';
import dataPowerArmor from '../modules/fallout/data/equipment/powerArmor.json';
import dataAmmo from '../modules/fallout/data/equipment/ammo.json';
import { getCurrentLocale, getCurrentModuleLocale } from '../i18n/locale';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { INVENTORY_DICTIONARIES } from './screens/InventoryScreen/logic/inventoryI18n';
import ruPerksAndTraitsScreen from '../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../i18n/en-EN/screens/perksAndTraits/screen.json';
import { getConditionCatalog, getPerks, getSceneRiskRules } from '../domain/registry';
import { Alert, Platform } from 'react-native';

// Zustand Store integration (Task 4.1)
import useCharacterStore from '../src/store/characterStore';
import { denormalizeCharacterState, migrateCharacterState, mergeEquipmentWithStore, mergeEquippedWeapons } from '../src/store/migrations.js';
import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from '../src/store/saveSchema.js';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from '../src/store/effectsSync.js';

const INITIAL_LEVEL = 1;
const CHEM_DOSE_WINDOW_MS = 24 * 60 * 60 * 1000;

const CharacterContext = createContext();

// Resolve saved-character origin through the single source of truth:
// domain/origins.findEnrichedOrigin(id) returns the localized origin enriched
// with image + equipmentKits. A missing id/catalog entry is a data error.
const resolveOrigin = (storedOrigin) => {
  if (!storedOrigin) return null;
  const id = typeof storedOrigin === 'string' ? storedOrigin : storedOrigin.id;
  if (!id) throw new Error('[CharacterContext] Сохранённый ориджин не содержит id');
  const resolved = findEnrichedOrigin(id);
  if (!resolved) {
    throw new Error(`[CharacterContext] Ориджин "${id}" отсутствует в данных активного сеттинга`);
  }
  return resolved;
};

const generateId = () => `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const serializeState = (state) => ({
  ...state,
  origin: state.origin?.id ? { id: state.origin.id } : null,
  modifiedItems: state.modifiedItems instanceof Map
    ? Array.from(state.modifiedItems.entries())
    : (Array.isArray(state.modifiedItems) ? state.modifiedItems : []),
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

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
  catch (e) { return item; }
};
const findCatalogEntryInCatalog = (id, itemType, catalog) => {
  try { return findCatalogEntry(catalog, id, itemType); }
  catch (e) { return null; }
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
  return {
    ...restored,
    origin: resolveOrigin(restored.origin),
    modifiedItems: new Map(Array.isArray(restored.modifiedItems) ? restored.modifiedItems : []),
    schemaVersion: restored.schemaVersion ?? LEGACY_SCHEMA_VERSION,
  };
};

// ─── Силовая броня: каталожные справочники и тексты алертов ────────────────
// Механика — domain/powerArmor.js; специфика — docs/architecture/power-armor-plan.md.
const PA_CATALOG_BY_ID = Object.fromEntries(
  Object.values(dataPowerArmor).flatMap((set) => set.pieces).map((p) => [p.id, p]),
);
// Каталожная запись Ядерного блока: предел зарядов (maxCharges) живёт в данных боеприпаса.
const findCatalogEntryById = (node, id) => {
  if (Array.isArray(node)) {
    for (const entry of node) {
      const hit = findCatalogEntryById(entry, id);
      if (hit) return hit;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    if (node.id === id) return node;
    return findCatalogEntryById(node.items ?? Object.values(node), id);
  }
  return null;
};
const FUSION_CORE_CATALOG = findCatalogEntryById(dataAmmo, FUSION_CORE_ID);
// Каталожные данные части PA в текущей локали (имя); механика — из canonical data.
const paLocalizedCatalogItem = (catalogId) => {
  const localized = (getEquipmentCatalog(getCurrentModuleLocale())?.powerArmorList || [])
    .find((p) => p.id === catalogId);
  if (!localized) {
    throw new Error(`[CharacterContext] Для силовой брони "${catalogId}" нет локализованных данных`);
  }
  return localized;
};
const INV_ALERTS_DICT = {
  'ru-RU': INVENTORY_DICTIONARIES['ru-RU'].screen.alerts,
  'en-EN': INVENTORY_DICTIONARIES['en-EN'].screen.alerts,
};
// ПРАВИЛО (владелец): никаких фолбэков — ключ обязан быть в обеих локалях
// (контроль — инвариант-тест __tests__/i18n/no-fallbacks.test.js).
const tPA = (key) => INV_ALERTS_DICT[getCurrentLocale()][key];
const PERK_ALERTS_DICT = {
  'ru-RU': ruPerksAndTraitsScreen.alerts,
  'en-EN': enPerksAndTraitsScreen.alerts,
};
const tPerkAlert = (key) => PERK_ALERTS_DICT[getCurrentLocale()][key];
// Лейблы инвентаря (левая/правая конечность) — те же ключи, что использует
// обычная броня при выборе слота. Кнопка отмены теперь приходит из каталога
// алертов, поэтому отдельный словарь действий здесь больше не нужен.
const INV_LABELS_DICT = {
  'ru-RU': INVENTORY_DICTIONARIES['ru-RU'].screen.labels,
  'en-EN': INVENTORY_DICTIONARIES['en-EN'].screen.labels,
};
const tPALabel = (key) => INV_LABELS_DICT[getCurrentLocale()][key];
// Алерты слоя СБ: в web-превью Expo Alert.alert молчит — показываем window.alert,
// как showAlert в InventoryScreen.
const paAlert = (title, message = '') => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  if (message) Alert.alert(title, message);
  else Alert.alert(title);
};
// Тик таймера расхода блока (§5.3): заряд сгорает за 12 минут аптайма,
// точность тика на порядок ниже — расход ведёт накопитель, а не тик.
const PA_CORE_TICK_MS = 15000;

// Берём данные из стора ТОЛЬКО если они реально заполнены. denormalize* возвращает
// пустой массив [] при пустом сторе, а `[] ?? snapshot` оставляет [] (массив не nullish)
// и затирает реальные атрибуты/навыки снапшота → сохранёнка теряла данные (#5).
const preferFilled = (storeVal, snapshotVal) => {
  if (storeVal == null) return snapshotVal;
  if (Array.isArray(storeVal)) return storeVal.length > 0 ? storeVal : snapshotVal;
  if (typeof storeVal === 'object') return Object.keys(storeVal).length > 0 ? storeVal : snapshotVal;
  return storeVal;
};

/**
 * Программа заточена на id: origin/trait/equipment — объекты с id, и их НИКОГДА
 * нельзя затирать «голым» объектом без id из стора. Если стор-значение — объект
 * без id, а снапшот имеет id — берём снапшот (метаданные), иначе preferFilled.
 */
const mergeSnapshotWithStoreData = (snapshot) => {
  const legacyData = denormalizeCharacterState(useCharacterStore.getState());
  return {
    ...snapshot,
    attributes: preferFilled(legacyData.attributes, snapshot.attributes),
    skills: preferFilled(legacyData.skills, snapshot.skills),
    equipment: mergeEquipmentWithStore(snapshot.equipment, legacyData.equipment),
    equippedWeapons: mergeEquippedWeapons(snapshot.equippedWeapons, legacyData.equippedWeapons),
    activeTimedEffects: preferFilled(legacyData.activeTimedEffects, snapshot.activeTimedEffects),
    rewardedSkills: legacyData.rewardedSkills,
  };
};

export const CharacterProvider = ({ children }) => {
  const [characterName, setCharacterName] = useState('');
  const [characterId, setCharacterId] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  const [level, setLevel] = useState(INITIAL_LEVEL);
  const [attributes, setAttributes] = useState(createInitialAttributes());
  const [skills, setSkills] = useState(ALL_SKILLS.map(s => ({ ...s, value: 0 })));
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [extraTaggedSkills, setExtraTaggedSkills] = useState([]);
  const [forcedSelectedSkills, setForcedSelectedSkills] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [trait, setTrait] = useState(null);
  const [equipment, setEquipment] = useState(null);
  const [effects, setEffects] = useState([]);
  const [activeTimedEffects, setActiveTimedEffects] = useState([]);
  const [sceneCounter, setSceneCounter] = useState(0);
  const [equippedWeapons, setEquippedWeapons] = useState([]);
  const [equippedRobotSlots, setEquippedRobotSlotsRaw] = useState(null);
  const [equippedRobotModules, setEquippedRobotModulesRaw] = useState([]);

  // ── Robot equipment: single source of truth = Zustand robot slice ──────────
  // These wrappers keep the legacy useState (used by buildSnapshot / DB save) in
  // sync while ALSO writing through to the store. Screens keep calling the same
  // setter name; data flows into one place (Fix #2, Step 3). Functional updates
  // (prev => next) are preserved.
  const setEquippedRobotSlots = useCallback((updater) => {
    setEquippedRobotSlotsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // mirror into the store slice
      useCharacterStore.getState().loadRobotState({
        bodyPlan: useCharacterStore.getState().robot?.bodyPlan ?? null,
        slots: next || {},
        modules: useCharacterStore.getState().robot?.modules ?? [],
      });
      return next;
    });
  }, []);

  const setEquippedRobotModules = useCallback((updater) => {
    setEquippedRobotModulesRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      useCharacterStore.getState().loadRobotState({
        bodyPlan: useCharacterStore.getState().robot?.bodyPlan ?? null,
        slots: useCharacterStore.getState().robot?.slots ?? {},
        modules: next || [],
      });
      return next;
    });
  }, []);
  const [equippedArmor, setEquippedArmor] = useState(() => createEmptyEquippedArmor());
  const [equippedPowerArmor, setEquippedPowerArmor] = useState(() => createEmptyEquippedPowerArmor());
  const [powerArmorRuntime, setPowerArmorRuntime] = useState(() => createEmptyPowerArmorRuntime());
  // Диалог выбора Ядерного Блока (§5.1/§5.4): null, или
  // { kind: 'equip'|'depleted', equipped, frameItem?, cores: [] }
  const [pendingCoreChoice, setPendingCoreChoice] = useState(null);

  // Refs: таймер расхода и алерты читают актуальное состояние без пересоздания.
  const equippedPowerArmorRef = useRef(equippedPowerArmor);
  const powerArmorRuntimeRef = useRef(powerArmorRuntime);
  const pendingCoreChoiceRef = useRef(pendingCoreChoice);
  useEffect(() => { equippedPowerArmorRef.current = equippedPowerArmor; }, [equippedPowerArmor]);
  useEffect(() => { powerArmorRuntimeRef.current = powerArmorRuntime; }, [powerArmorRuntime]);
  useEffect(() => { pendingCoreChoiceRef.current = pendingCoreChoice; }, [pendingCoreChoice]);

  const [caps, setCaps] = useState(0);
  const [currentHealth, setCurrentHealth] = useState(0);
  const [radiation, setRadiationRaw] = useState(0);
  const setRadiation = (updater) => setRadiationRaw((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return Math.max(0, next);
  });
  const [modifiedItems, setModifiedItems] = useState(new Map());
  const [availablePerkAttributePoints, setAvailablePerkAttributePoints] = useState(0);
  const [luckPoints, setLuckPoints] = useState(0);
  const [maxLuckPoints, setMaxLuckPoints] = useState(0);
  const [attributesSaved, setAttributesSaved] = useState(false);
  const [skillsSaved, setSkillsSaved] = useState(false);
  const [selectedPerks, setSelectedPerksRaw] = useState([]);
  const setSelectedPerks = useCallback((updater) => {
    setSelectedPerksRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      useCharacterStore.getState().setSelectedPerks(next || []);
      return next || [];
    });
  }, []);
  const [carryWeight, setCarryWeight] = useState(
    calculateCarryWeight(attributes, null),
  );
  const [meleeBonus, setMeleeBonus] = useState(0);
  const [initiative, setInitiative] = useState(0);
  const [defense, setDefense] = useState(1);
  const [conditions, setConditions] = useState([]);       // ['addicted', 'diseased', ...]
  const [chemDosesLog, setChemDosesLog] = useState([]);   // [{ chemId, takenAt }]
  const [sceneRiskStates, setSceneRiskStates] = useState({});
  const sceneRiskTrackerRef = useRef(null);
  if (sceneRiskTrackerRef.current === null) {
    sceneRiskTrackerRef.current = createSceneRiskTracker(sceneRiskStates);
  }

  const isSavedRef = useRef(isSaved);
  const characterIdRef = useRef(characterId);
  useEffect(() => { isSavedRef.current = isSaved; }, [isSaved]);
  useEffect(() => { characterIdRef.current = characterId; }, [characterId]);

  // ── Derived stats bridge (Fix #3 + #4) ──────────────────────────────
  // Производные значения (carryWeight, meleeBonus, defense, initiative …)
  // считаются ОДИН раз внутри Zustand-стора (calculateDerivedStats) и читаются
  // обратно сюда, чтобы не было двух источников правды.
  //
  // Здесь мы лишь прокидываем в стор актуальные trait / level / экипировку
  // (раньше стор считал их с заглушкой trait:null, level:1 — баг #4),
  // а также подстраховываемся, заполняя dict атрибутов из массива Context,
  // если он ещё пуст (новый несохранённый персонаж).
  useEffect(() => {
    const store = useCharacterStore.getState();

    // Планируем синхронизацию со стором в микротаск, чтобы она вышла
    // за пределы commit-фазы <CharacterProvider>. Иначе set(...) стора
    // триггерит forceStoreRerender для уже-смонтированных подписчиков
    // (например, CharacterScreen через Tab.Navigator), что React запрещает:
    //   "Cannot update a component (CharacterScreen) while rendering
    //    a different component (CharacterProvider)".
    //
    // Микротаск выполняется ДО следующего рендера, но ПОСЛЕ commit-фазы —
    // стор обновится до того, как React отдаст control обратно в event loop,
    // а doчерние компоненты в первом рендере успеют безопасно подписаться.
    // Сейвы не затрагиваются: подсев атрибутов и derivedStats — это
    // производный кеш для UI, а не данные, которые идут в localStorage.
    queueMicrotask(() => {
      // re-read store inside the microtask: dependency values are captured
      // here, so this useEffect doesn't re-fire when these are stable.
      const current = useCharacterStore.getState();

      // Подсев атрибутов в стор, если dict пуст, но в Context уже есть значения.
      const dictEmpty = Object.keys(current.attributes || {}).length === 0;
      const arrayHasValues = Array.isArray(attributes) && attributes.length > 0;
      if (dictEmpty && arrayHasValues) {
        current.loadFromLegacyData({ attributes });
      }

      // Прокидываем реальный контекст → корректный пересчёт derivedStats.
      // isRobot управляет правилом переносимого веса (от корпуса/брони, без STR).
      const isRobot = isRobotCharacter({ origin, trait });
      current.setCharacterContext({
        trait,
        level,
        isRobot,
        // Надетый каркас СБ → модификаторы атрибутов (СИЛ=set 11) в производных, §5.6.
        equipmentState: {
          equippedArmor,
          equippedRobotSlots,
          isRobot,
          powerArmorFrameId: equippedPowerArmor?.frame ? equippedPowerArmor.frame.catalogId : null,
        },
      });
    });
  }, [attributes, trait, level, origin, equippedArmor, equippedRobotSlots, equippedPowerArmor]);

  // Подписываемся на derivedStats стора и зеркалим их в локальный стейт,
  // чтобы все экраны, читающие carryWeight/meleeBonus/defense/initiative из
  // useCharacter(), получали ЕДИНОЕ каноническое значение из стора.
  useEffect(() => {
    const applyDerived = (derivedStats) => {
      if (!derivedStats) return;
      const num = (p, fallback) =>
        typeof p === 'number' ? p : (p && typeof p.total === 'number' ? p.total : fallback);
      setCarryWeight(num(derivedStats.carryWeight, calculateCarryWeight(attributes, trait, { equippedArmor, equippedRobotSlots })));
      setMeleeBonus(num(derivedStats.meleeBonus, 0));
      setInitiative(num(derivedStats.initiative, 0));
      setDefense(num(derivedStats.defense, 1));
    };
    // применить сразу + подписаться на дальнейшие изменения
    applyDerived(useCharacterStore.getState().derivedStats);
    const unsub = useCharacterStore.subscribe((state) => applyDerived(state.derivedStats));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributes, trait, equippedArmor, equippedRobotSlots]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTimedEffects((prev) => {
        const { effects: nextEffects, changed } = pruneExpiredTimedEffects(prev);
        return changed ? nextEffects : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ═══ Силовая броня: действия (специфика docs/architecture/power-armor-plan.md) ═══
  // Слой СБ отдельный от equippedArmor: надевание ИЗЫМАЕТ предмет из стековой
  // записи инвентаря (quantity −1, при 0 запись удаляется — декремент-модель,
  // как adjustStoreItemQuantity в InventoryScreen), снятие возвращает стопку
  // через addNewItem (сливается с существующей по stackKey).

  const paDecrementStoreStack = useCallback((storeItemId, count = 1) => {
    const { items } = useCharacterStore.getState();
    const item = items[storeItemId];
    if (!item) return;
    const newQty = (item.quantity || 1) - count;
    if (newQty <= 0) {
      const updated = { ...items };
      delete updated[storeItemId];
      useCharacterStore.setState({ items: updated });
      return;
    }
    useCharacterStore.getState().updateItem(storeItemId, { quantity: newQty });
  }, []);

  // Положить стек-предмет в инвентарь. Ключ записи = stackKey: для каждого
  // состояния (заряд/прочность/состав частей) ключ уникален, а одинаковые
  // стопки всё равно сольются стек-поиском addNewItem по тому же stackKey.
  const paAddStackToInventory = useCallback((stackItem) => {
    useCharacterStore.getState().addNewItem({ ...stackItem, uniqueId: stackItem.stackKey, quantity: 1 });
  }, []);

  // Надетая часть → инвентарный стек-предмет (подпись: каталожный id + моды + прочность).
  const paPieceToStackItem = useCallback((piece) => ({
    ...paLocalizedCatalogItem(piece.catalogId),
    appliedMods: piece.appliedMods || {},
    hpCurrent: piece.hpCurrent,
    stackKey: powerArmorPieceStackKey(piece),
  }), []);

  // Надетый пакет → инвентарная стопка-каркас: packPackage даёт контракт полей
  // и stackKey; вес/цена/имя добираем из каталога текущей локали.
  const paPackageToStackItem = useCallback((equipped) => {
    const packed = packPackage(equipped);
    return { ...paLocalizedCatalogItem(packed.id), ...packed };
  }, []);

  // ── §5.1 Надеть пакет (каркас + установленные части + блок, если он внутри) ──
  const equipPowerArmorPackage = useCallback((frameStackItem) => {
    // ПРАВИЛО (от владельца): супермутантам силовая запрещена. И роботам — политика
    // экипировки брони общая (domain/equipEquip.canEquipArmor).
    const check = canEquipArmor(frameStackItem, { origin, trait });
    if (!check.allowed) {
      if (check.reason === 'equip.error.robotCannotWearStandardArmor') {
        paAlert(tPA('robotArmorOnlyTitle'), tPA('robotArmorOnlyMessage'));
      } else {
        paAlert(tPA('mutantCannotWearStandardArmorTitle'), tPA('mutantCannotWearStandardArmorMessage'));
      }
      return;
    }
    if (hasFrame(equippedPowerArmorRef.current)) return; // второй пакет поверх не надевается

    const equipped = unpackPackage(frameStackItem);
    if (equipped.frame.core) {
      // Блок уже в пакете → надеваем молча.
      paDecrementStoreStack(frameStackItem.id);
      setEquippedPowerArmor(equipped);
      return;
    }
    const pick = pickFusionCore(findChargedFusionCores(Object.values(useCharacterStore.getState().items || {})));
    if (pick.kind === 'none') {
      paAlert(tPA('powerArmorNeedsCoreTitle'), tPA('powerArmorNeedsCoreMessage'));
      return;
    }
    if (pick.kind === 'auto') {
      // Заряд одинаковый у всех блоков → молча берём первый из стопки (ПРАВИЛО владельца).
      paDecrementStoreStack(pick.core.id);
      paDecrementStoreStack(frameStackItem.id);
      setEquippedPowerArmor(insertCore(equipped, pick.core));
      return;
    }
    // Разный заряд → игрок выбирает; пакет снимем со стопки после выбора (resolveCoreChoice).
    setPendingCoreChoice({ kind: 'equip', equipped, frameStoreKey: frameStackItem.id, cores: pick.cores });
  }, [origin, trait, paDecrementStoreStack]);

  // Разрешение диалога выбора блока (§5.1/§5.4): coreStoreKey — ключ записи в сторе, null — отмена.
  const resolveCoreChoice = useCallback((coreStoreKey) => {
    const pending = pendingCoreChoiceRef.current;
    setPendingCoreChoice(null);
    if (!pending) return;

    if (!coreStoreKey) {
      if (pending.kind === 'depleted') {
        // От замены отказались → пакет снимается в инвентарь, как при отсутствии блоков.
        paAddStackToInventory(paPackageToStackItem(pending.equipped));
        setEquippedPowerArmor(createEmptyEquippedPowerArmor());
        paAlert(tPA('powerArmorDepletedTitle'), tPA('powerArmorDepletedMessage'));
      }
      // kind 'equip' + отмена → надевание не состоялось, инвентарь не тронут.
      return;
    }

    const coreItem = useCharacterStore.getState().items[coreStoreKey];
    if (!coreItem || !(coreItem.charges > 0)) return;
    paDecrementStoreStack(coreStoreKey);
    if (pending.kind === 'equip' && pending.frameStoreKey) {
      paDecrementStoreStack(pending.frameStoreKey);
    }
    setEquippedPowerArmor(insertCore(pending.equipped, coreItem));
  }, [paDecrementStoreStack, paAddStackToInventory, paPackageToStackItem]);

  // ── Снять весь пакет: части и блок уезжают в инвентарь ВНУТРИ стопки-каркаса (§4) ──
  const unequipPowerArmorPackage = useCallback(() => {
    const equipped = equippedPowerArmorRef.current;
    if (!hasFrame(equipped)) return;
    paAddStackToInventory(paPackageToStackItem(equipped));
    setEquippedPowerArmor(createEmptyEquippedPowerArmor());
  }, [paAddStackToInventory, paPackageToStackItem]);

  // ── §5.2 Надеть часть из инвентаря; вытесненная часть слота уходит в инвентарь ──
  // Наруч/понож — один предмет на любую сторону (как обычная броня): свободный
  // слот пары → туда; обе стороны заняты → игрок выбирает L/R тем же алертом.
  const equipPowerArmorPieceInto = useCallback((pieceStackItem) => {
    // Каталожный id: у стор-предмета — weaponId, у свежего из каталога — id.
    const catalogId = pieceStackItem.weaponId || pieceStackItem.id;
    const piece = {
      catalogId,
      appliedMods: pieceStackItem.appliedMods || {},
      hpCurrent: pieceStackItem.hpCurrent,
    };
    const candidateSlots = powerArmorSlotsFor(PA_CATALOG_BY_ID[catalogId]);
    if (candidateSlots.length === 0) return;
    const check = canEquipPowerArmorPiece(equippedPowerArmorRef.current, piece, { origin, trait });
    if (!check.ok) {
      if (check.reason === 'robotCannotWear') {
        paAlert(tPA('robotArmorOnlyTitle'), tPA('robotArmorOnlyMessage'));
        return;
      }
      paAlert(
        tPA('powerArmorNeedsCoreTitle'),
        tPA(check.reason === 'needsFrame' ? 'powerArmorNeedsFrameMessage' : 'powerArmorBrokenPieceMessage'),
      );
      return;
    }

    const doEquip = (slot) => {
      const equipped = equippedPowerArmorRef.current;
      const replaced = equipped.pieces[slot];
      setEquippedPowerArmor(equipPowerArmorPiece(equipped, slot, piece));
      paDecrementStoreStack(pieceStackItem.id);
      if (replaced) paAddStackToInventory(paPieceToStackItem(replaced));
    };

    const target = resolvePowerArmorPieceTarget(equippedPowerArmorRef.current, candidateSlots);
    if (target.kind === 'slot') {
      doEquip(target.slot);
      return;
    }

    // Пара занята → выбор стороны, формулировки — как у обычной брони.
    const [leftSlot, rightSlot] = target.slots;
    const leftLabel = tPALabel(leftSlot);
    const rightLabel = tPALabel(rightSlot);
    // Тот же диалог, что и у обычной брони (InventoryScreen): единая запись
    // каталога, три кнопки на обеих платформах. Раньше на вебе здесь стоял
    // window.prompt с вводом номера стороны.
    showCatalogAlert('bothSlotsBusy', { leftLabel, rightLabel }).then((side) => {
      if (side === 'left') doEquip(leftSlot);
      else if (side === 'right') doEquip(rightSlot);
    });
  }, [paDecrementStoreStack, paAddStackToInventory, paPieceToStackItem, origin, trait]);

  // Снять часть слота → в инвентарь своей стопкой.
  const unequipPowerArmorPieceAt = useCallback((slot) => {
    const equipped = equippedPowerArmorRef.current;
    const piece = equipped?.pieces?.[slot];
    if (!piece) return;
    setEquippedPowerArmor({ ...equipped, pieces: { ...equipped.pieces, [slot]: null } });
    paAddStackToInventory(paPieceToStackItem(piece));
  }, [paAddStackToInventory, paPieceToStackItem]);

  // ── §5.7 Кнопки −/+ прочности части; упала до 0 → часть сама слетает в инвентарь ──
  const adjustPowerArmorDurability = useCallback((slot, delta) => {
    const equipped = equippedPowerArmorRef.current;
    const piece = equipped?.pieces?.[slot];
    if (!piece) return;
    const maxHp = PA_CATALOG_BY_ID[piece.catalogId]?.hp;
    if (!Number.isFinite(maxHp)) return;
    const adjusted = adjustPieceHp(piece, delta, maxHp);
    if (isPieceBroken(adjusted)) {
      setEquippedPowerArmor({ ...equipped, pieces: { ...equipped.pieces, [slot]: null } });
      paAddStackToInventory(paPieceToStackItem(adjusted));
      return;
    }
    setEquippedPowerArmor({ ...equipped, pieces: { ...equipped.pieces, [slot]: adjusted } });
  }, [paAddStackToInventory, paPieceToStackItem]);

  // Починка надетой части (ПРАВИЛО владельца: бесплатно до максимума).
  const repairPowerArmorPieceAt = useCallback((slot) => {
    const equipped = equippedPowerArmorRef.current;
    const piece = equipped?.pieces?.[slot];
    if (!piece) return;
    const maxHp = PA_CATALOG_BY_ID[piece.catalogId]?.hp;
    if (!Number.isFinite(maxHp) || !needsRepair(piece, maxHp)) return;
    setEquippedPowerArmor({ ...equipped, pieces: { ...equipped.pieces, [slot]: repairPowerArmorPiece(piece, maxHp) } });
  }, []);

  // Починка части прямо в инвентаре (кнопка «Починить» на строке). Прочность входит
  // в подпись стопки → после починки стопка либо переподписывается, либо сливается
  // с уже существующей целой (quantity переносится).
  const repairPowerArmorStack = useCallback((storeItemId) => {
    const { items } = useCharacterStore.getState();
    const item = items[storeItemId];
    if (!item || item.itemType !== 'powerArmor' || isPowerArmorFrame(item)) return;
    const catalogId = item.weaponId || item.id;
    const maxHp = PA_CATALOG_BY_ID[catalogId]?.hp;
    if (!Number.isFinite(maxHp) || !needsRepair({ hpCurrent: item.hpCurrent }, maxHp)) return;
    const newStackKey = powerArmorPieceStackKey({ catalogId, appliedMods: item.appliedMods || {}, hpCurrent: maxHp });
    const wholeTwinKey = Object.keys(items).find(
      (key) => key !== storeItemId && (items[key]?.stackKey || items[key]?.id) === newStackKey,
    );
    if (wholeTwinKey) {
      const updated = { ...items };
      updated[wholeTwinKey] = { ...updated[wholeTwinKey], quantity: (updated[wholeTwinKey].quantity || 1) + (item.quantity || 1) };
      delete updated[storeItemId];
      useCharacterStore.setState({ items: updated });
      return;
    }
    useCharacterStore.getState().updateItem(storeItemId, { hpCurrent: maxHp, stackKey: newStackKey });
  }, []);


  // ── §5.3/§5.4 Таймер расхода Ядерного блока ──
  // Тикает только пока приложение открыто («приложение закрыто — отсчёт на паузе»);
  // накопитель аптайма персистентный (сохраняется со снапшотом персонажа).
  useEffect(() => {
    const interval = setInterval(() => {
      const equipped = equippedPowerArmorRef.current;
      if (!hasFrame(equipped) || !equipped.frame.core) return;

      const tick = tickCoreAccumulator(powerArmorRuntimeRef.current, PA_CORE_TICK_MS);
      setPowerArmorRuntime({ coreAccumulatorMs: tick.coreAccumulatorMs });
      if (tick.chargesConsumed <= 0) return;

      const { equipped: drained, depleted } = drainActiveCore(equipped, tick.chargesConsumed);
      if (!depleted) {
        setEquippedPowerArmor(drained);
        return;
      }

      // Блок исчерпан: есть замена — молча (одинаковый заряд) или выбором (разный);
      // блоков нет совсем — пакет снимается в инвентарь (ПРАВИЛО владельца §5.4).
      const pick = pickFusionCore(findChargedFusionCores(Object.values(useCharacterStore.getState().items || {})));
      if (pick.kind === 'auto') {
        paDecrementStoreStack(pick.core.id);
        setEquippedPowerArmor(insertCore(drained, pick.core));
        return;
      }
      if (pick.kind === 'choice') {
        setPendingCoreChoice({ kind: 'depleted', equipped: drained, cores: pick.cores });
        return;
      }
      paAddStackToInventory(paPackageToStackItem(drained));
      setEquippedPowerArmor(createEmptyEquippedPowerArmor());
      paAlert(tPA('powerArmorDepletedTitle'), tPA('powerArmorDepletedMessage'));
    }, PA_CORE_TICK_MS);
    return () => clearInterval(interval);
  }, [paDecrementStoreStack, paAddStackToInventory, paPackageToStackItem]);

  // Build a full character state snapshot.
  const buildSnapshot = useCallback(() => ({
    characterName,
    level,
    attributes,
    skills,
    selectedSkills,
    extraTaggedSkills,
    forcedSelectedSkills,
    origin,
    trait,
    equipment,
    effects,
    activeTimedEffects,
    sceneCounter,
    equippedWeapons,
    equippedRobotSlots,
    equippedRobotModules,
    // ОС Mk II (Секьюритрон) — часть robot-состояния, обязана переживать сейв/загрузку.
    mk2Installed: useCharacterStore.getState().robot?.mk2Installed ?? false,
    equippedArmor,
    equippedPowerArmor,
    powerArmorRuntime,
    caps,
    currentHealth,
    radiation,
    modifiedItems,
    availablePerkAttributePoints,
    luckPoints,
    maxLuckPoints,
    attributesSaved,
    skillsSaved,
    selectedPerks,
    carryWeight,
    meleeBonus,
    initiative,
    defense,
    conditions,
    chemDosesLog,
    sceneRiskStates,
  }), [
    characterName, level, attributes, skills, selectedSkills, extraTaggedSkills,
    forcedSelectedSkills, origin, trait, equipment, effects, activeTimedEffects,
    sceneCounter, equippedWeapons, equippedRobotSlots, equippedRobotModules,
    equippedArmor, equippedPowerArmor, powerArmorRuntime,
    caps, currentHealth, radiation, modifiedItems, availablePerkAttributePoints,
    luckPoints, maxLuckPoints, attributesSaved, skillsSaved, selectedPerks,
    carryWeight, meleeBonus, initiative, defense, conditions, chemDosesLog, sceneRiskStates,
  ]);

  // Realtime save for already persisted characters.
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (!isSavedRef.current || !characterIdRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const snapshot = buildSnapshot();
        const merged = serializeState(mergeSnapshotWithStoreData(snapshot));
        const saveCatalog = catalogForCurrentLocale();
        const serialized = saveCatalog
          ? slimSaveData(merged, { getEntry: (id, itemType) => findCatalogEntryInCatalog(id, itemType, saveCatalog) })
          : merged;
        await db.saveCharacter(
          characterIdRef.current,
          snapshot.characterName,
          snapshot.level ?? 1,
          snapshot.origin?.id || snapshot.origin?.name || null,
          serialized
        );
        // Облако — фоном, без await. Локальное сохранение уже состоялось, и
        // задержка Google (окно OAuth, медленная сеть, отозванный доступ) не
        // должна тормозить следующий цикл автосейва. Свои ошибки функция
        // гасит внутри и пишет их в трассировку (sync.cloudFailed).
        void syncCharacterToCloudIfEnabled(characterIdRef.current);
      } catch (e) {
      }
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [
    characterName, level, attributes, skills, selectedSkills, extraTaggedSkills,
    forcedSelectedSkills, origin, trait, equipment, effects, activeTimedEffects,
    sceneCounter, equippedWeapons, equippedRobotSlots, equippedRobotModules,
    equippedArmor, equippedPowerArmor, powerArmorRuntime,
    caps, currentHealth, radiation, modifiedItems, availablePerkAttributePoints,
    luckPoints, maxLuckPoints, attributesSaved, skillsSaved, selectedPerks,
    carryWeight, meleeBonus, initiative, defense, buildSnapshot,
  ]);

  // Initial save triggered from CharacterScreen.
  const saveCharacter = useCallback(async (name) => {
    try {
      const id = characterIdRef.current || generateId();
      setCharacterId(id);
      characterIdRef.current = id;

      const snapshot = buildSnapshot();
      const snapshotWithName = { ...snapshot, characterName: name };
      const merged = serializeState(mergeSnapshotWithStoreData(snapshotWithName));
      const saveCatalog = catalogForCurrentLocale();
      const serialized = saveCatalog
        ? slimSaveData(merged, { getEntry: (id, itemType) => findCatalogEntryInCatalog(id, itemType, saveCatalog) })
        : merged;

      await db.saveCharacter(
        id,
        name,
        snapshot.level ?? 1,
        snapshot.origin?.id || snapshot.origin?.name || null,
        serialized
      );
      await db.clearCharacterRenameRequest(id);

      // Флаг ставим СРАЗУ после записи в БД: локальное сохранение состоялось,
      // и UI не должен ждать облако.
      //
      // История дефекта: раньше здесь был `await syncCharacterToCloudIfEnabled(id)`
      // ПЕРЕД setIsSaved. Если попап Google зависал (например, под заголовком
      // Cross-Origin-Opener-Policy: same-origin окно теряет window.opener и
      // ничего не возвращает), промис не резолвился, и setIsSaved(true) не
      // выполнялся. Персонаж при этом уже был в базе, но экран оставался
      // заблокированным: disabledOverlay поверх карточки, disabled на выборе
      // происхождения/трейта/комплекта, editable={!isSaved} на поле имени.
      // Разблокировать удавалось только сменой таба (экран перечитывал
      // персонажа из БД).
      setIsSaved(true);
      isSavedRef.current = true;

      // Облако — фоном: его отказ не влияет на локальное состояние и UI.
      void syncCharacterToCloudIfEnabled(id);

      return id;
    } catch (e) {
      return null;
    }
  }, [buildSnapshot]);

  // Load character by ID.
  const loadCharacter = useCallback(async (id) => {
    try {
      const row = await db.loadCharacterById(id);
      if (!row) return false;
      const data = deserializeState(row.data);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      isSavedRef.current = false;

      setCharacterId(id);
      setCharacterName(row.name);
      setLevel(data.level ?? INITIAL_LEVEL);
      setAttributes(data.attributes || createInitialAttributes());
      setSkills(migrateSkillsToCanonical(data.skills) || ALL_SKILLS.map(s => ({ ...s, value: 0 })));
      setSelectedSkills(data.selectedSkills || []);
      setExtraTaggedSkills(data.extraTaggedSkills || []);
      setForcedSelectedSkills(data.forcedSelectedSkills || []);
      setOrigin(data.origin || null);
      setTrait(data.trait || null);
      setEquipment(data.equipment || null);
      setEffects(data.effects || []);
      setActiveTimedEffects(pruneExpiredTimedEffects(data.activeTimedEffects || []).effects);
      setSceneCounter(data.sceneCounter ?? 0);
      sceneRiskTrackerRef.current.replaceStates(data.sceneRiskStates);
      setSceneRiskStates(data.sceneRiskStates);
      // Migrate old [null, null] format to dynamic array
      const rawWeapons = data.equippedWeapons || [];
      let migratedWeapons = Array.isArray(rawWeapons) ? rawWeapons.filter(w => w !== null) : [];
      // Ensure the archetype's built-in unarmed weapon is present on load
      // (non-robots get fists; robots get melee via a manipulator, so nothing to inject).
      const loadedOrigin = resolveOrigin(data.origin);
      const loadedTrait = data.trait || null;
      const builtin = getBuiltinBaseWeapon({ origin: loadedOrigin, trait: loadedTrait });
      if (builtin && !migratedWeapons.some(w => w?.id === builtin.id)) {
        migratedWeapons = [builtin, ...migratedWeapons];
      }
      setEquippedWeapons(migratedWeapons);
      // Seed the store's robot body plan first so derived carry-weight resolves
      // correctly, then mirror slots/modules through the wrapped setters.
      useCharacterStore.getState().loadRobotState({
        bodyPlan: resolveBodyPlan({ origin: loadedOrigin, trait: loadedTrait }),
        slots: data.equippedRobotSlots ?? {},
        modules: data.equippedRobotModules ?? [],
        mk2Installed: data.mk2Installed ?? false,
      });
      setEquippedRobotSlots(data.equippedRobotSlots ?? null);
      setEquippedRobotModules(data.equippedRobotModules ?? []);
      // Встроенное оружие конечностей (манипуляторы, ладонные орудия) НЕ хранится
      // в equippedWeapons: экраны читают его из слотов стора (getBuiltinWeaponsFromSlots)
      // — единый источник, ничего восстанавливать не нужно.
      setEquippedArmor(data.equippedArmor || createEmptyEquippedArmor());
      setEquippedPowerArmor(data.equippedPowerArmor || createEmptyEquippedPowerArmor());
      setPowerArmorRuntime(data.powerArmorRuntime || createEmptyPowerArmorRuntime());
      setPendingCoreChoice(null);
      setCaps(data.caps ?? 0);
      setCurrentHealth(data.currentHealth ?? 0);
      setRadiationRaw(Math.max(0, data.radiation ?? 0));
      setModifiedItems(data.modifiedItems instanceof Map ? data.modifiedItems : new Map());
      setAvailablePerkAttributePoints(data.availablePerkAttributePoints ?? 0);
      setLuckPoints(data.luckPoints ?? 0);
      setMaxLuckPoints(data.maxLuckPoints ?? 0);
      setAttributesSaved(data.attributesSaved ?? false);
      setSkillsSaved(data.skillsSaved ?? false);
      setSelectedPerks(data.selectedPerks || []);
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
      setCarryWeight(data.carryWeight ?? 150);
      setMeleeBonus(data.meleeBonus ?? 0);
      setInitiative(data.initiative ?? 0);
      setDefense(data.defense ?? 1);
      setConditions(data.conditions || []);
      setChemDosesLog(
        (data.chemDosesLog || []).filter((d) => Date.now() - d.takenAt < CHEM_DOSE_WINDOW_MS)
      );
      
      // Task 4.4: Migrate old format data to Zustand Store
      // This normalizes attributes, skills, items, and effects into the store
      useCharacterStore.getState().loadFromLegacyData(data);
      
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
          setEquipment({ id: 'nightkin', name: kit.name, items: resolved.items || [] });
          // снимаем флаг — чтобы не выдавать повторно при следующей загрузке
          data.nightkinKitPending = false;
        } catch (e) {
          debugLog('character.load.nightkinKitGrantFailed', { message: e?.message });
        }
      }
      
      const saved = !row.renamePending;
      setIsSaved(saved);
      isSavedRef.current = saved;
      characterIdRef.current = id;
      return true;
    } catch (e) {
      debugLog('character.load.failed', { message: e?.message });
      return false;
    }
  }, []);

  // Get all character records.
  const getCharactersList = useCallback(async () => {
    try {
      return await db.getCharactersList();
    } catch (e) {
      return [];
    }
  }, []);

  // Delete character by ID.
  const deleteCharacter = useCallback(async (id) => {
    try {
      await db.deleteCharacter(id);
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  const getItemId = (item) => {
    if (item.uniqueId) return item.uniqueId;
    return item.weaponId || item.code || item.id || item.Name;
  };

  const getModifiedItem = (item) => {
    const itemId = getItemId(item);
    const modifiedItem = modifiedItems.get(itemId);
    if (modifiedItem) return modifiedItem;
    if (item.itemType !== 'weapon' && item.itemType !== 'armor' && item.itemType !== 'clothing') return item;
    return item;
  };

  const saveModifiedItem = (originalItem, modifiedItem) => {
    const itemId = getItemId(originalItem);
    setModifiedItems(prev => new Map(prev).set(itemId, modifiedItem));
  };

  const removeModifiedItem = (item) => {
    const itemId = getItemId(item);
    setModifiedItems(prev => {
      const newMap = new Map(prev);
      newMap.delete(itemId);
      return newMap;
    });
  };

  const addPerkAttributePoints = (points) => {
    setAvailablePerkAttributePoints(prev => Math.max(0, prev + points));
  };

  /**
   * Записывает дозу препарата и возвращает общий размер пула доз за последние 24 ч.
   */
  const recordChemDose = (chemId) => {
    const now = Date.now();
    const result = recordDoseWithinWindow(
      chemDosesLog,
      { chemId, takenAt: now },
      { now, windowMs: CHEM_DOSE_WINDOW_MS },
    );
    setChemDosesLog(result.doseLog);
    return result.doseCount;
  };

  const applyDiseaseExposureForConsumable = (item) => {
    if (
      item?.id === 'drink_dirty_water'
      && Boolean(useCharacterStore.getState().perkBonuses?.dirtyWaterDiseaseImmune)
    ) {
      return null;
    }
    const ruleMatches = getSceneRiskRules()
      .map((rule) => ({ rule, event: getSceneRiskEventForRule(item, rule.id) }))
      .filter(({ event }) => event !== null);
    if (ruleMatches.length === 0) return null;
    if (ruleMatches.length > 1) {
      throw new Error('[CharacterContext] Расходник объявляет несколько проверок риска одной сцены');
    }

    const { rule, event } = ruleMatches[0];
    if (rule.resultTable !== 'diseases') {
      throw new Error(`[CharacterContext] Неизвестная таблица результата проверки риска: ${rule.resultTable}`);
    }

    const attribute = attributes.find((entry) => entry?.name === rule.test.attribute);
    const skill = skills.find((entry) => entry?.name === rule.test.skill);
    if (!attribute || !skill) {
      throw new Error(
        `[CharacterContext] Для проверки ${rule.id} отсутствует `
        + `${rule.test.attribute} или ${rule.test.skill}`,
      );
    }

    const { result: riskResult, states: nextStates } = sceneRiskTrackerRef.current.resolveEvent({
      rule,
      eventId: event.eventId,
      attributeValue: getAttributeValue(attributes, rule.test.attribute),
      skillValue: skill.value,
      isTagged: isSkillTagged({
        skillId: skill.name,
        primaryTaggedSkillIds: selectedSkills,
        extraTaggedSkillIds: extraTaggedSkills,
      }),
    });

    if (riskResult.status === 'duplicate') return riskResult;

    setSceneRiskStates(nextStates);

    if (riskResult.check.passed) {
      return { ...riskResult, diseaseRoll: null, disease: null, infectionStatus: null };
    }

    const { roll: diseaseRoll, disease } = rollDiseaseFromCatalog(
      getConditionCatalog('disease', getCurrentModuleLocale()),
    );
    if (hasDamageImmunity({ origin, trait }, rule.immunity)) {
      return { ...riskResult, diseaseRoll, disease, infectionStatus: 'immune' };
    }

    const store = useCharacterStore.getState();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(store.effects)).effects;
    const applied = addPersistentDiseaseEffect(currentEffects, disease);
    if (applied.added) {
      syncTimedEffectsToStore(applied.effects, store);
      setActiveTimedEffects(applied.effects);
    }
    setConditions((previous) => (
      previous.includes('diseased') ? previous : [...previous, 'diseased']
    ));

    return {
      ...riskResult,
      diseaseRoll,
      disease,
      infectionStatus: applied.added ? 'infected' : 'duplicate',
    };
  };

  /**
   * Применяет расходник: мгновенное лечение/радиация, timed-эффекты,
   * removeCondition, проверку зависимости и явно объявленный риск заражения.
   */
  const previewConsumableRadiation = (item) => {
    const {
      irradiatedConsumableRadiationImmune = false,
      irradiatedConsumableRadiationRerollIfDamage = 0,
    } = useCharacterStore.getState().perkBonuses || {};
    const roll = resolveConsumableRadiationRoll(item, {
      radiationImmune: hasRadiationImmunity({ origin, trait }),
      skipIrradiatedRadiation: Boolean(irradiatedConsumableRadiationImmune),
    });
    const receivedRadiationDamage = roll.requestedAmount == null
      ? 0
      : Math.max(0, radiation + roll.requestedAmount) - radiation;
    return {
      requestedAmount: roll.requestedAmount,
      receivedRadiationDamage,
      rolls: roll.rolls,
      canOfferReroll: Boolean(
        item?.irradiated
        && Number(irradiatedConsumableRadiationRerollIfDamage) > 0
        && receivedRadiationDamage > 0
        && Array.isArray(roll.rolls)
      ),
    };
  };

  const applyConsumableFull = (item, options = {}) => {
    debugLog('consumable.apply.start', {
      itemName: item?.name || item?.Name,
      itemId: item?.id || item?.code,
      positiveEffect: item?.positiveEffect,
      positiveEffectType: typeof item?.positiveEffect,
    });

    // 1. Мгновенные показатели: сначала лечение, затем радиация.
    const perkBonuses = useCharacterStore.getState().perkBonuses || {};
    const {
      hpHealBonus = 0,
      irradiatedConsumableRadiationImmune = false,
      colaNutDrinkIds,
      colaNutHealMultiplier = 1,
    } = perkBonuses;
    const hpHealMultiplier = Array.isArray(colaNutDrinkIds) && colaNutDrinkIds.includes(item?.id)
      ? Number(colaNutHealMultiplier) || 1
      : 1;
    const vitalOptions = {
      currentHealth,
      maxHealth: calculateMaxHealth(attributes, level),
      radiation,
      hpHealBonus,
      hpHealMultiplier,
      radiationImmune: hasRadiationImmunity({ origin, trait }),
      skipIrradiatedRadiation: Boolean(irradiatedConsumableRadiationImmune),
    };
    if (Object.hasOwn(options, 'radiationRequestedAmount')) {
      vitalOptions.radiationRequestedAmount = options.radiationRequestedAmount;
    }
    const vitalChanges = resolveConsumableVitalChanges(item, vitalOptions);
    if (vitalChanges.healAmount > 0) {
      setCurrentHealth(vitalChanges.healthAfter);
    }
    if (vitalChanges.radiationAmount !== null) {
      // Радиация расходника напрямую меняет счётчик: DR частей тела не участвует.
      setRadiation(vitalChanges.radiationAfter);
    }

    // 2. Timed-эффекты через Zustand Store
    const store = useCharacterStore.getState();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

    const timedResult = applyConsumableToEffects(item, normalizedCurrent.effects);
    const normalizedResult = pruneExpiredTimedEffects(timedResult.effects);
    syncTimedEffectsToStore(normalizedResult.effects, store);
    setActiveTimedEffects(normalizedResult.effects);

    // 3. removeCondition (аддиктол, антибиотики)
    const {
      conditions: nextConditions,
      removed,
      requested: conditionRemovalsRequested,
    } = applyRemoveConditions(item, conditions);
    if (removed.length > 0) {
      setConditions(nextConditions);
      // Снятие зависимости (аддиктол): удаляем перманентный эффект
      // «Зависимость: Стелс-бой» из активных эффектов.
      if (removed.includes('addicted')) {
        const storeNow = useCharacterStore.getState();
        const currentEffects = effectsDictToLegacyArray(storeNow.effects);
        const withoutAddiction = currentEffects.filter(
          (effect) => !(effect.isPermanent && String(effect.effectName || '').includes('Зависимость')),
        );
        syncTimedEffectsToStore(withoutAddiction, storeNow);
        setActiveTimedEffects(withoutAddiction);
      }
      if (removed.includes('diseased')) {
        const storeNow = useCharacterStore.getState();
        const currentEffects = effectsDictToLegacyArray(storeNow.effects);
        const withoutDiseases = removePersistentDiseaseEffects(currentEffects).effects;
        syncTimedEffectsToStore(withoutDiseases, storeNow);
        setActiveTimedEffects(withoutDiseases);
      }
    }

    // 4. Зависимость. Каждая химическая доза входит в общий пул за 24 часа,
    // даже если у текущего препарата нет свойства зависимости.
    const dosesToday = item?.itemType === 'chem'
      ? recordChemDose(item.id)
      : 0;

    // partyBoy: невосприимчив к алко-зависимости (item.isAlcohol === true)
    const hasPartyBoyImmunity =
      item?.isAlcohol === true &&
      Boolean(perkBonuses.alcoholAddictionImmune);
    const isChemItem = item?.itemType === 'chem' || item?.itemType === 'chems';
    const hasChemAddictionImmunity = isChemItem && Boolean(perkBonuses.chemAddictionImmune);

    let addictionResult = null;
    // Стелс-бой: зависимость возможна ТОЛЬКО у Тени (решение владельца).
    // У остальных ориджинов применения Стелс-боя не дают зависимости
    // (ни броска, ни негативного эффекта).
    const isShadowCharacter = origin?.id === 'shadow' || trait?.id === 'shadow';
    const isStealthBoy = item?.id === 'chem_stealth_boy' || item?.id === 'stealth_boy';
    if (
      item?.addictionLevel > 0 &&
      item?.negativeEffect === 'addiction' &&
      !hasPartyBoyImmunity &&
      !hasChemAddictionImmunity &&
      (!isStealthBoy || isShadowCharacter)
    ) {
      // Тень: зависимость при ЛЮБОМ эффекте на боевом кубике
      // (бросок CD, грани 5/6 = эффект).
      const anyEffect = isShadowCharacter && isStealthBoy;
      addictionResult = checkAddiction(item, dosesToday, {
        anyEffect,
        dicePenalty: isChemItem ? (Number(perkBonuses.chemAddictionDicePenalty) || 0) : 0,
      });
      if (addictionResult.addicted && !conditions.includes('addicted')) {
        setConditions((prev) => [...prev, 'addicted']);
        // Перманентный эффект зависимости: отображается в карточке эффектов,
        // не истекает по сценам; снимается аддиктолом (removeCondition).
        if (isStealthBoy) {
          const addictionEffect = {
            id: `negative-addiction-stealth-boy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            effectName: 'Зависимость: Стелс-бой',
            effectLabel: 'Сложность тестов на восприятие и интеллект повышается на +2, а тестов на харизму на +1, пока не вылечитесь.',
            effectKind: 'negative',
            sourceName: 'Стелс-бой',
            createdAt: Date.now(),
            isPermanent: true,
            scenesLeft: 9999,
          };
          const store2 = useCharacterStore.getState();
          syncTimedEffectsToStore([...normalizedResult.effects, addictionEffect], store2);
          setActiveTimedEffects([...normalizedResult.effects, addictionEffect]);
        }
      }
    }

    const diseaseRiskResult = applyDiseaseExposureForConsumable(item);

    debugLog('consumable.apply.result', {
      timedResult,
      addictionResult,
      diseaseRiskResult,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      healAmount: vitalChanges.healAmount,
      radiationAmount: vitalChanges.radiationAmount,
    });

    return {
      timedResult: { ...timedResult, expired: normalizedCurrent.expired },
      addictionResult,
      diseaseRiskResult,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      healAmount: vitalChanges.healAmount,
      radiationAmount: vitalChanges.radiationAmount,
    };
  };

  const applyConsumableTimedEffects = (item) => {
    const store = useCharacterStore.getState();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

    const result = applyConsumableToEffects(item, normalizedCurrent.effects);
    const normalizedResult = pruneExpiredTimedEffects(result.effects);
    syncTimedEffectsToStore(normalizedResult.effects, store);
    setActiveTimedEffects(normalizedResult.effects);

    if (normalizedResult.effects.length > 0) {
      const timerPreview = normalizedResult.effects
        .map((effect) => `${effect.effectName || effect.effectLabel}: ${effect.scenesLeft} scenes`)
        .join(' | ');
      debugLog('consumable.timedEffects', { timerPreview });
    } else {
      debugLog('consumable.timedEffects', { timerPreview: null });
    }

    return {
      ...result,
      expired: normalizedCurrent.expired,
    };
  };

  const advanceScene = () => {
    const store = useCharacterStore.getState();
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

    setActiveTimedEffects(nextEffects);
    setSceneCounter((prev) => prev + 1);
    store.triggerDependentCalculations();
    return { active: nextEffects, expired: [...normalizedCurrent.expired, ...expired] };
  };

  const commitAttributeChanges = (newAttributes, pointsSpent) => {
    debugLog('ctx.deprecatedCommitAttributeChanges');

    // Calculate deltas from current attributes to new attributes
    const currentAttributesArray = attributes;
    const currentAttributesMap = {};
    currentAttributesArray.forEach(attr => {
      currentAttributesMap[attr.name] = attr.value;
    });

    newAttributes.forEach(newAttr => {
      const currentAttr = currentAttributesMap[newAttr.name];
      const delta = newAttr.value - (currentAttr || 0);

      if (delta !== 0) {
        // Use Zustand Store action
        useCharacterStore.getState().updateAttribute(newAttr.name, delta);
      }
    });

    // Update other state fields
    setAvailablePerkAttributePoints(prev => prev - pointsSpent);
    const newLuck = getLuckPoints(newAttributes, trait);
    setMaxLuckPoints(newLuck);
    setLuckPoints(prevLuck => Math.min(prevLuck, newLuck));
    setCarryWeight(calculateCarryWeight(newAttributes, trait, { equippedArmor, equippedRobotSlots }));
    setMeleeBonus(calculateMeleeBonus(newAttributes, trait));
    setInitiative(calculateInitiative(newAttributes));
    setDefense(calculateDefense(newAttributes));
    const newMaxHealth = calculateMaxHealth(newAttributes, level);
    setCurrentHealth(prevHealth => Math.min(prevHealth, newMaxHealth));
  };

  const resetCharacter = (preserveOrigin = false) => {
    const initialAttributes = createInitialAttributes();
    const initialLevel = INITIAL_LEVEL;
    setLevel(initialLevel);
    const initialSkills = ALL_SKILLS.map(s => ({ ...s, value: 0 }));
    setAttributes(initialAttributes);
    setSkills(initialSkills);
    setSelectedSkills([]);
    setExtraTaggedSkills([]);
    setForcedSelectedSkills([]);
    setAttributesSaved(false);
    setSkillsSaved(false);
    const initialLuck = getLuckPoints(initialAttributes);
    setMaxLuckPoints(initialLuck);
    setLuckPoints(initialLuck);
    if (!preserveOrigin) setOrigin(null);
    setTrait(null);
    setEquipment(null);
    setEffects([]);
    setActiveTimedEffects([]);
    setSceneCounter(0);
    const emptySceneRiskStates = {};
    sceneRiskTrackerRef.current.replaceStates(emptySceneRiskStates);
    setSceneRiskStates(emptySceneRiskStates);
    setEquippedWeapons([]);
    useCharacterStore.persist?.clearStorage?.();
    useCharacterStore.getState().resetCharacterStore({
      attributes: initialAttributes,
      skills: initialSkills,
    });
    setEquippedRobotSlots(null);
    setEquippedRobotModules([]);
    setEquippedArmor(createEmptyEquippedArmor());
    setEquippedPowerArmor(createEmptyEquippedPowerArmor());
    setPowerArmorRuntime(createEmptyPowerArmorRuntime());
    setPendingCoreChoice(null);
    setCaps(0);
    setSelectedPerks([]);
    setConditions([]);
    setChemDosesLog([]);
    setMeleeBonus(0);
    setInitiative(calculateInitiative(initialAttributes));
    setDefense(calculateDefense(initialAttributes));
    const currentMaxHealth = calculateMaxHealth(initialAttributes, initialLevel);
    setCurrentHealth(currentMaxHealth);
    setModifiedItems(new Map());
    // Reset save status.
    setCharacterName('');
    setCharacterId(null);
    setIsSaved(false);
    isSavedRef.current = false;
    characterIdRef.current = null;
  };

  /**
   * Сброс комплекта снаряжения (при смене ориджина или комплекта):
   * очищает инвентарь, награды за навыки (rewardedSkills), снаряжение, слоты
   * робота и крышки. Атрибуты/навыки и сам персонаж сохраняются.
   * @param {object} opts - { keepSkills: boolean } — если true, не сбрасывает tagged skills и skillsSaved (смена комплекта без сброса персонажа)
   */
  const resetKitAndRewards = useCallback((opts = {}) => {
    const keepSkills = Boolean(opts.keepSkills);
    setEquipment(null);
    setEquippedWeapons([]);
    setEquippedRobotSlots(null);
    setEquippedRobotModules([]);
    setEquippedArmor(createEmptyEquippedArmor());
    setCaps(0);
    // resetCharacterStore принимает legacy-формат (массивы) — денормализуем.
    const { attributes: legacyAttributes, skills: legacySkills } =
      denormalizeCharacterState(useCharacterStore.getState());
    useCharacterStore.getState().resetCharacterStore({
      attributes: legacyAttributes,
      skills: legacySkills,
      rewardedSkills: [],
    });
    if (!keepSkills) {
      setSelectedSkills([]);
      setExtraTaggedSkills([]);
      setForcedSelectedSkills([]);
      setSkillsSaved(false);
    }
  }, []);

  // Сброс только комплекта без сброса навыков (для смены комплекта без сброса персонажа)
  const resetKitOnly = useCallback(() => {
    resetKitAndRewards({ keepSkills: true });
  }, [resetKitAndRewards]);

  const value = {
    characterName, setCharacterName,
    characterId,
    isSaved,
    saveCharacter,
    loadCharacter,
    getCharactersList,
    deleteCharacter,
    level, setLevel,
    attributes, setAttributes,
    skills, setSkills,
    selectedSkills, setSelectedSkills,
    extraTaggedSkills, setExtraTaggedSkills,
    forcedSelectedSkills, setForcedSelectedSkills,
    origin, setOrigin,
    trait, setTrait,
    equipment, setEquipment,
    effects, setEffects,
    activeTimedEffects, setActiveTimedEffects,
    sceneCounter,
    sceneRiskStates,
    sceneDurationMinutes: SCENE_RULES.SCENE_DURATION_MINUTES,
    applyConsumableTimedEffects,
    applyConsumableFull,
    previewConsumableRadiation,
    conditions, setConditions,
    chemDosesLog,
    advanceScene,
    equippedWeapons, setEquippedWeapons,
    equippedRobotSlots, setEquippedRobotSlots,
    equippedRobotModules, setEquippedRobotModules,
    equippedArmor, setEquippedArmor,
    // Силовая броня (docs/architecture/power-armor-plan.md): состояние пакета,
    // накопитель расхода блока, диалог выбора блока и действия слоя.
    equippedPowerArmor, setEquippedPowerArmor,
    powerArmorRuntime,
    pendingCoreChoice,
    resolveCoreChoice,
    equipPowerArmorPackage,
    unequipPowerArmorPackage,
    equipPowerArmorPiece: equipPowerArmorPieceInto,
    unequipPowerArmorPieceAt,
    adjustPowerArmorDurability,
    repairPowerArmorPieceAt,
    repairPowerArmorStack,
    caps, setCaps,
    currentHealth, setCurrentHealth,
    radiation, setRadiation,
    luckPoints, setLuckPoints,
    maxLuckPoints, setMaxLuckPoints,
    attributesSaved, setAttributesSaved,
    skillsSaved, setSkillsSaved,
    selectedPerks, setSelectedPerks,
    modifiedItems, setModifiedItems,
    carryWeight,
    meleeBonus,
    initiative,
    defense,
    // Canonical id only. No alias/fallback to localized name.
    // Single-trait: trait.id matches. Multi-trait (NCR/Survivor): trait.ids[] contains it.
    hasTrait: (id) => !!(
      trait && (
        trait.id === id ||
        (Array.isArray(trait?.ids) && trait.ids.includes(id))
      )
    ),
    getItemId,
    getModifiedItem,
    saveModifiedItem,
    removeModifiedItem,
    resetCharacter,
    resetKitAndRewards,
    resetKitOnly,
    availablePerkAttributePoints,
    addPerkAttributePoints,
    commitAttributeChanges,
    meetsPerkRequirements: (perk, options) => meetsPerkRequirements(perk, attributes, level, selectedPerks, options),
    getPerkUnmetReasons: (perk, options) => getPerkUnmetReasons(perk, attributes, level, selectedPerks, options),
    annotatePerks: (perks, options) => annotatePerks(perks, attributes, level, selectedPerks, options),
  };

  return (
    <CharacterContext.Provider value={value}>
      {children}
    </CharacterContext.Provider>
  );
};

export const useCharacter = () => {
  return useContext(CharacterContext);
};

// --- Wrapper Hooks for Zustand Store (Task 4.1) ---

/**
 * Hook to access character attributes through Zustand Store
 * @param {string} attrId - Attribute ID (e.g., 'STR', 'END', 'PER')
 * @returns {Object} Attribute with base, modifiers, and total
 */
export const useCharacterAttribute = (attrId) => {
  const attribute = useCharacterStore((state) => state.attributes[attrId]);

  // Warn if attribute doesn't exist (should be created on load)
  if (!attribute) {
    debugLog('store.attrNotFound', { attrId, where: 'useCharacterAttribute' });
  }

  return attribute;
};

/**
 * Hook to access character items through Zustand Store
 * @param {string} itemId - Item ID
 * @returns {Object} Item object with all parameters
 */
export const useCharacterItem = (itemId) => {
  const item = useCharacterStore((state) => state.items[itemId]);

  // Warn if item doesn't exist
  if (!item) {
    debugLog('store.itemNotFound', { itemId, where: 'useCharacterItem' });
  }

  return item;
};

/**
 * Hook to access active effects through Zustand Store
 * @param {string} effectId - Effect ID
 * @returns {Object} Effect object with parameters
 */
export const useCharacterEffect = (effectId) => {
  const effect = useCharacterStore((state) => state.effects[effectId]);

  // Warn if effect doesn't exist
  if (!effect) {
    debugLog('store.effectNotFound', { effectId, where: 'useCharacterEffect' });
  }

  return effect;
};

/**
 * Hook to get all attributes from Zustand Store
 * @returns {Object} Dictionary of all attributes
 */
export const useCharacterAttributes = () => {
  return useCharacterStore((state) => state.attributes);
};

/**
 * Hook to get all items from Zustand Store
 * @returns {Object} Dictionary of all items
 */
export const useCharacterItems = () => {
  return useCharacterStore((state) => state.items);
};

/**
 * Hook to get all active effects from Zustand Store
 * @returns {Object} Dictionary of all active effects
 */
export const useCharacterEffects = () => {
  return useCharacterStore((state) => state.effects);
};

// ── Robot selectors (read-only) — экраны читают робо-состояние из стора ──────
// Используйте эти хуки вместо чтения equippedRobotSlots/Modules из useCharacter(),
// чтобы UI реактивно обновлялся из единого источника правды и не мутировал данные.

/** Все слоты робота { [slotKey]: SlotData }. */
export const useRobotSlots = () => {
  return useCharacterStore((state) => state.robot?.slots || {});
};

/** Установленные модули робота. */
export const useRobotModules = () => {
  return useCharacterStore((state) => state.robot?.modules || []);
};

/** Текущий body plan робота (e.g. 'protectron'). */
export const useRobotBodyPlan = () => {
  return useCharacterStore((state) => state.robot?.bodyPlan ?? null);
};
