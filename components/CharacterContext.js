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

// Zustand Store integration (Task 4.1)
import useCharacterStore from '../src/store/characterStore';
import { denormalizeCharacterState } from '../src/store/migrations.js';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from '../src/store/effectsSync.js';

const UNARMED_HUMAN_WEAPON = { id: 'unarmed_human', isBuiltin: true, itemType: 'weapon' };

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

  const [level, setLevel] = useState(1);
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
  const [equippedArmor, setEquippedArmor] = useState({
    head: { armor: null, clothing: null },
    body: { armor: null, clothing: null },
    leftArm: { armor: null, clothing: null },
    rightArm: { armor: null, clothing: null },
    leftLeg: { armor: null, clothing: null },
    rightLeg: { armor: null, clothing: null },
  });
  const [caps, setCaps] = useState(0);
  const [currentHealth, setCurrentHealth] = useState(0);
  const [modifiedItems, setModifiedItems] = useState(new Map());
  const [availablePerkAttributePoints, setAvailablePerkAttributePoints] = useState(0);
  const [luckPoints, setLuckPoints] = useState(0);
  const [maxLuckPoints, setMaxLuckPoints] = useState(0);
  const [attributesSaved, setAttributesSaved] = useState(false);
  const [skillsSaved, setSkillsSaved] = useState(false);
  const [selectedPerks, setSelectedPerks] = useState([]);
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
      equipmentState: { equippedArmor, equippedRobotSlots, isRobot },
    });
  }, [attributes, trait, level, origin, equippedArmor, equippedRobotSlots]);

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
    caps,
    currentHealth,
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
    equippedArmor, caps, currentHealth, modifiedItems, availablePerkAttributePoints,
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
    equippedArmor, caps, currentHealth, modifiedItems, availablePerkAttributePoints,
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
      setLevel(data.level ?? 1);
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
      setEquippedArmor(data.equippedArmor || {
        head: { armor: null, clothing: null },
        body: { armor: null, clothing: null },
        leftArm: { armor: null, clothing: null },
        rightArm: { armor: null, clothing: null },
        leftLeg: { armor: null, clothing: null },
        rightLeg: { armor: null, clothing: null },
      });
      setCaps(data.caps ?? 0);
      setCurrentHealth(data.currentHealth ?? 0);
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
    return item.weaponId || item.code || item.Name || item.Название;
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
    setAttributes(initialAttributes);
    setSkills(ALL_SKILLS.map(s => ({ ...s, value: 0 })));
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
    useCharacterStore.setState({
      attributes: {},
      skills: {},
      items: {},
      effects: {},
    });
    useCharacterStore.getState().resetRobot();
    setEquippedRobotSlots(null);
    setEquippedRobotModules([]);
    setEquippedArmor({
      head: { armor: null, clothing: null },
      body: { armor: null, clothing: null },
      leftArm: { armor: null, clothing: null },
      rightArm: { armor: null, clothing: null },
      leftLeg: { armor: null, clothing: null },
      rightLeg: { armor: null, clothing: null },
    });
    setCaps(0);
    setSelectedPerks([]);
    setConditions([]);
    setChemDosesLog([]);
    setMeleeBonus(0);
    setInitiative(calculateInitiative(initialAttributes));
    setDefense(calculateDefense(initialAttributes));
    const currentMaxHealth = calculateMaxHealth(initialAttributes, level);
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
    caps, setCaps,
    currentHealth, setCurrentHealth,
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
