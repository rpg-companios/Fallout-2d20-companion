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
import { loadOriginsData, findEnrichedOrigin } from '../domain/origins';
import { meetsPerkRequirements, getPerkUnmetReasons, annotatePerks } from '../domain/perks';
import { applyConsumableToEffects, checkAddiction, applyRemoveConditions, advanceEffectsByScene, pruneExpiredTimedEffects, SCENE_RULES } from '../domain/effects';
import { syncCharacterToCloudIfEnabled } from './cloudSync/googleDriveSync';
import { isRobotCharacter } from '../domain/origins';
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
  powerArmorFrameStackKey,
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
import dataPowerArmor from '../data/equipment/powerArmor.json';
import dataAmmo from '../data/equipment/ammo.json';
import { getCurrentLocale } from '../i18n/locale';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import ruInventoryScreen from '../i18n/ru-RU/screens/inventory/screen.json';
import enInventoryScreen from '../i18n/en-EN/screens/inventory/screen.json';
import { Alert, Platform } from 'react-native';

// Zustand Store integration (Task 4.1)
import useCharacterStore from '../src/store/characterStore';
import { denormalizeCharacterState } from '../src/store/migrations.js';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from '../src/store/effectsSync.js';

const UNARMED_HUMAN_WEAPON = { id: 'unarmed_human', isBuiltin: true, itemType: 'weapon' };
const INITIAL_LEVEL = 1;

const CharacterContext = createContext();
const BARE_ORIGINS = loadOriginsData();

// Resolve saved-character origin through the single source of truth:
// domain/origins.findEnrichedOrigin(id) returns the origin enriched with image + equipmentKits.
const resolveOrigin = (storedOrigin) => {
  if (!storedOrigin) return null;
  const id = typeof storedOrigin === 'string' ? storedOrigin : storedOrigin.id;
  return findEnrichedOrigin(id) || BARE_ORIGINS.find((origin) => origin.id === id) || null;
};

const generateId = () => `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const serializeState = (state) => ({
  ...state,
  origin: state.origin?.id ? { id: state.origin.id } : null,
  modifiedItems: state.modifiedItems instanceof Map
    ? Array.from(state.modifiedItems.entries())
    : (Array.isArray(state.modifiedItems) ? state.modifiedItems : []),
  schemaVersion: 1,
});

const deserializeState = (data) => ({
  ...data,
  origin: resolveOrigin(data.origin),
  modifiedItems: new Map(Array.isArray(data.modifiedItems) ? data.modifiedItems : []),
  schemaVersion: data.schemaVersion ?? 0,
});

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
  const localized = (getEquipmentCatalog(getCurrentLocale())?.powerArmorList || [])
    .find((p) => p.id === catalogId);
  return localized || PA_CATALOG_BY_ID[catalogId];
};
const INV_ALERTS_DICT = { 'ru-RU': ruInventoryScreen.alerts, 'en-EN': enInventoryScreen.alerts };
// ПРАВИЛО (владелец): никаких фолбэков — ключ обязан быть в обеих локалях
// (контроль — инвариант-тест __tests__/i18n/no-fallbacks.test.js).
const tPA = (key) => INV_ALERTS_DICT[getCurrentLocale()][key];
// Лейблы/действия инвентаря (левая/правая конечность, отмена) — те же ключи,
// что использует обычная броня при выборе слота.
const INV_LABELS_DICT = { 'ru-RU': ruInventoryScreen.labels, 'en-EN': enInventoryScreen.labels };
const INV_ACTIONS_DICT = { 'ru-RU': ruInventoryScreen.actions, 'en-EN': enInventoryScreen.actions };
const tPALabel = (key) => INV_LABELS_DICT[getCurrentLocale()][key];
const tPAAction = (key) => INV_ACTIONS_DICT[getCurrentLocale()][key];
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

const mergeSnapshotWithStoreData = (snapshot) => {
  const legacyData = denormalizeCharacterState(useCharacterStore.getState());
  return {
    ...snapshot,
    attributes: preferFilled(legacyData.attributes, snapshot.attributes),
    skills: preferFilled(legacyData.skills, snapshot.skills),
    equipment: preferFilled(legacyData.equipment, snapshot.equipment),
    equippedWeapons: preferFilled(legacyData.equippedWeapons, snapshot.equippedWeapons),
    activeTimedEffects: preferFilled(legacyData.activeTimedEffects, snapshot.activeTimedEffects),
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

    // Подсев атрибутов в стор, если dict пуст, но в Context уже есть значения.
    const dictEmpty = Object.keys(store.attributes || {}).length === 0;
    const arrayHasValues = Array.isArray(attributes) && attributes.length > 0;
    if (dictEmpty && arrayHasValues) {
      store.loadFromLegacyData({ attributes });
    }

    // Прокидываем реальный контекст → корректный пересчёт derivedStats.
    // isRobot управляет правилом переносимого веса (от корпуса/брони, без STR).
    const isRobot = isRobotCharacter({ origin, trait });
    store.setCharacterContext({
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
    const check = canEquipPowerArmorPiece(equippedPowerArmorRef.current, piece);
    if (!check.ok) {
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
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const promptText = tPA('bothSlotsBusyPrompt')
        .replace('{leftLabel}', leftLabel)
        .replace('{rightLabel}', rightLabel);
      const answer = window.prompt(promptText, '1');
      if (answer === '1') doEquip(leftSlot);
      else if (answer === '2') doEquip(rightSlot);
      return;
    }
    Alert.alert(tPA('replaceEquipmentTitle'), tPA('bothSlotsBusy'), [
      { text: leftLabel, onPress: () => doEquip(leftSlot) },
      { text: rightLabel, onPress: () => doEquip(rightSlot) },
      { text: tPAAction('cancel'), style: 'cancel' },
    ]);
  }, [paDecrementStoreStack, paAddStackToInventory, paPieceToStackItem]);

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

  // Починка части ВНУТРИ снятого пакета (стопка-каркас в инвентаре). Состав пакета
  // входит в подпись стопки (powerArmorFrameStackKey) → после починки стопка либо
  // переподписывается, либо сливается с уже существующей идентичной (как у part-стопок).
  // ПРАВИЛО владельца: бесплатно до максимума, то же условие hp < max.
  const repairPowerArmorPackagePiece = useCallback((storeItemId, slot) => {
    const { items } = useCharacterStore.getState();
    const item = items[storeItemId];
    if (!item || !isPowerArmorFrame(item)) return;
    const piece = item.installedPieces?.[slot];
    if (!piece) return;
    const maxHp = PA_CATALOG_BY_ID[piece.catalogId]?.hp;
    if (!Number.isFinite(maxHp) || !needsRepair(piece, maxHp)) return;
    const installedPieces = { ...item.installedPieces, [slot]: repairPowerArmorPiece(piece, maxHp) };
    // Ключ считается от КАНОНИЧЕСКОГО id (weaponId), как в getStackKey инвентаря.
    const catalogId = item.weaponId || item.id;
    const newStackKey = powerArmorFrameStackKey({ ...item, id: catalogId, installedPieces });
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
    useCharacterStore.getState().updateItem(storeItemId, { installedPieces, stackKey: newStackKey });
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
  }), [
    characterName, level, attributes, skills, selectedSkills, extraTaggedSkills,
    forcedSelectedSkills, origin, trait, equipment, effects, activeTimedEffects,
    sceneCounter, equippedWeapons, equippedRobotSlots, equippedRobotModules,
    equippedArmor, equippedPowerArmor, powerArmorRuntime,
    caps, currentHealth, radiation, modifiedItems, availablePerkAttributePoints,
    luckPoints, maxLuckPoints, attributesSaved, skillsSaved, selectedPerks,
    carryWeight, meleeBonus, initiative, defense, conditions, chemDosesLog,
  ]);

  // Realtime save for already persisted characters.
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (!isSavedRef.current || !characterIdRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const snapshot = buildSnapshot();
        const serialized = serializeState(mergeSnapshotWithStoreData(snapshot));
        await db.saveCharacter(
          characterIdRef.current,
          snapshot.characterName,
          snapshot.level ?? 1,
          snapshot.origin?.id || snapshot.origin?.name || null,
          serialized
        );
        await syncCharacterToCloudIfEnabled(characterIdRef.current);
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
      const serialized = serializeState(mergeSnapshotWithStoreData(snapshotWithName));

      await db.saveCharacter(
        id,
        name,
        snapshot.level ?? 1,
        snapshot.origin?.id || snapshot.origin?.name || null,
        serialized
      );
      await syncCharacterToCloudIfEnabled(id);

      setIsSaved(true);
      isSavedRef.current = true;
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

      setCharacterId(id);
      setCharacterName(data.characterName || '');
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
      // Migrate old [null, null] format to dynamic array
      const rawWeapons = data.equippedWeapons || [];
      let migratedWeapons = Array.isArray(rawWeapons) ? rawWeapons.filter(w => w !== null) : [];
      // Add unarmed_human for human characters if not present (Requirement 13.1)
      const loadedOrigin = resolveOrigin(data.origin);
      const loadedTrait = data.trait || null;
      if (!isRobotCharacter({ origin: loadedOrigin, trait: loadedTrait })) {
        if (!migratedWeapons.some(w => w?.id === 'unarmed_human')) {
          migratedWeapons = [UNARMED_HUMAN_WEAPON, ...migratedWeapons];
        }
      }
      setEquippedWeapons(migratedWeapons);
      // Seed the store's robot body plan first so derived carry-weight resolves
      // correctly, then mirror slots/modules through the wrapped setters.
      useCharacterStore.getState().loadRobotState({
        bodyPlan: resolveBodyPlan({ origin: loadedOrigin, trait: loadedTrait }),
        slots: data.equippedRobotSlots ?? {},
        modules: data.equippedRobotModules ?? [],
      });
      setEquippedRobotSlots(data.equippedRobotSlots ?? null);
      setEquippedRobotModules(data.equippedRobotModules ?? []);
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
      setCarryWeight(data.carryWeight ?? 150);
      setMeleeBonus(data.meleeBonus ?? 0);
      setInitiative(data.initiative ?? 0);
      setDefense(data.defense ?? 1);
      setConditions(data.conditions || []);
      setChemDosesLog(
        (data.chemDosesLog || []).filter((d) => Date.now() - d.takenAt < 24 * 60 * 60 * 1000)
      );
      
      // Task 4.4: Migrate old format data to Zustand Store
      // This normalizes attributes, skills, items, and effects into the store
      useCharacterStore.getState().loadFromLegacyData(data);
      
      setIsSaved(true);
      isSavedRef.current = true;
      characterIdRef.current = id;
      return true;
    } catch (e) {
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
    setAvailablePerkAttributePoints(prev => prev + points);
  };

  /**
   * Записывает дозу препарата и возвращает количество доз за последние 24 ч.
   */
  const recordChemDose = (chemId) => {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    let updatedLog;
    setChemDosesLog((prev) => {
      updatedLog = [...prev.filter((d) => d.takenAt > cutoff), { chemId, takenAt: now }];
      return updatedLog;
    });
    // Синхронный подсчёт: фильтруем текущий лог + новая доза
    const todayDoses = chemDosesLog
      .filter((d) => d.takenAt > cutoff && d.chemId === chemId)
      .length + 1;
    return todayDoses;
  };

  /**
   * Применяет расходник: timed-эффекты + removeCondition + проверка зависимости.
   * Возвращает { timedResult, addictionResult, conditionsRemoved }.
   */
  const applyConsumableFull = (item) => {
    console.log('[applyConsumableFull] START:', {
      itemName: item?.name || item?.Name,
      itemId: item?.id || item?.code,
      positiveEffect: item?.positiveEffect,
      positiveEffectType: typeof item?.positiveEffect,
    });

    // 1. Timed-эффекты через Zustand Store
    const store = useCharacterStore.getState();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));

    const timedResult = applyConsumableToEffects(item, normalizedCurrent.effects);
    const normalizedResult = pruneExpiredTimedEffects(timedResult.effects);
    syncTimedEffectsToStore(normalizedResult.effects, store);
    setActiveTimedEffects(normalizedResult.effects);

    // 2. removeCondition (аддиктол, антибиотики)
    const { conditions: nextConditions, removed } = applyRemoveConditions(item, conditions);
    if (removed.length > 0) setConditions(nextConditions);

    // 3. Зависимость
    let addictionResult = null;
    if (item?.addictionLevel > 0 && item?.negativeEffect === 'addiction') {
      const dosesToday = recordChemDose(item.id || item.name);
      addictionResult = checkAddiction(item, dosesToday);
      if (addictionResult.addicted && !conditions.includes('addicted')) {
        setConditions((prev) => [...prev, 'addicted']);
      }
    }

    console.log('[applyConsumableFull] RESULT:', {
      timedResult,
      addictionResult,
      conditionsRemoved: removed,
    });

    return {
      timedResult: { ...timedResult, expired: normalizedCurrent.expired },
      addictionResult,
      conditionsRemoved: removed,
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
      console.log(`[TimedEffects] ${timerPreview}`);
    } else {
      console.log('[TimedEffects] No active effects.');
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
    console.warn(
      '[CharacterContext] commitAttributeChanges is deprecated. Use Zustand Store actions instead: updateAttribute(attrId, delta)'
    );

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
    sceneDurationMinutes: SCENE_RULES.SCENE_DURATION_MINUTES,
    applyConsumableTimedEffects,
    applyConsumableFull,
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
    repairPowerArmorPackagePiece,
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
    availablePerkAttributePoints,
    addPerkAttributePoints,
    commitAttributeChanges,
    meetsPerkRequirements: (perk) => meetsPerkRequirements(perk, attributes, level),
    getPerkUnmetReasons: (perk) => getPerkUnmetReasons(perk, attributes, level),
    annotatePerks: (perks) => annotatePerks(perks, attributes, level),
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
    console.warn(`[useCharacterAttribute] Attribute ${attrId} not found in store`);
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
    console.warn(`[useCharacterItem] Item ${itemId} not found in store`);
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
    console.warn(`[useCharacterEffect] Effect ${effectId} not found in store`);
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
