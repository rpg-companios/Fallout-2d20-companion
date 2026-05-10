import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import * as db from '../db';
import { 
  createInitialAttributes, 
  ALL_SKILLS, 
  getLuckPoints, 
  calculateMaxHealth,
  calculateInitiative,
  calculateDefense,
  calculateMeleeBonus,
  calculateCarryWeight,
  getAttributeValue,
} from '../domain/characterCreation';
import { loadOriginsData } from '../domain/traits';
import { meetsPerkRequirements, getPerkUnmetReasons, annotatePerks } from '../domain/perks';
import { applyConsumableToEffects, checkAddiction, applyRemoveConditions, advanceEffectsByScene, pruneExpiredTimedEffects, SCENE_RULES } from '../domain/effects';
import { syncCharacterToCloudIfEnabled } from './cloudSync/googleDriveSync';
import { isRobotCharacter } from '../domain/robotEquip';

const UNARMED_HUMAN_WEAPON = { id: 'unarmed_human', isBuiltin: true, itemType: 'weapon' };

const CharacterContext = createContext();
const ORIGINS = loadOriginsData();

const generateId = () => `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const resolveOrigin = (storedOrigin) => {
  if (!storedOrigin) return null;
  const id = typeof storedOrigin === 'string' ? storedOrigin : storedOrigin.id;
  return ORIGINS.find((origin) => origin.id === id) || null;
};

const serializeState = (state) => ({
  ...state,
  origin: state.origin?.id ? { id: state.origin.id } : null,
  modifiedItems: state.modifiedItems instanceof Map
    ? Array.from(state.modifiedItems.entries())
    : (Array.isArray(state.modifiedItems) ? state.modifiedItems : []),
});

const deserializeState = (data) => ({
  ...data,
  origin: resolveOrigin(data.origin),
  modifiedItems: new Map(Array.isArray(data.modifiedItems) ? data.modifiedItems : []),
});

export const CharacterProvider = ({ children }) => {
  const [characterName, setCharacterName] = useState('');
  const [characterId, setCharacterId] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  const [level, setLevel] = useState(1);
  const [attributes, setAttributes] = useState(createInitialAttributes());
  const [skills, setSkills] = useState(ALL_SKILLS.map(s => ({...s, value: 0})));
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
  const [equippedRobotSlots, setEquippedRobotSlots] = useState(null);
  const [equippedRobotModules, setEquippedRobotModules] = useState([]);
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
    150 + 10 * getAttributeValue(attributes, 'STR'),
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
        const serialized = serializeState(snapshot);
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
      const serialized = serializeState(snapshotWithName);

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
      setSkills(data.skills || ALL_SKILLS.map(s => ({...s, value: 0})));
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

    // 1. Timed-эффекты
    const normalizedCurrent = pruneExpiredTimedEffects(activeTimedEffects);
    const timedResult = applyConsumableToEffects(item, normalizedCurrent.effects);
    const normalizedResult = pruneExpiredTimedEffects(timedResult.effects);
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
    const normalizedCurrent = pruneExpiredTimedEffects(activeTimedEffects);
    const result = applyConsumableToEffects(item, normalizedCurrent.effects);
    const normalizedResult = pruneExpiredTimedEffects(result.effects);
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
    const normalizedCurrent = pruneExpiredTimedEffects(activeTimedEffects);
    const { effects: nextEffects, expired } = advanceEffectsByScene(normalizedCurrent.effects);
    setActiveTimedEffects(nextEffects);
    setSceneCounter(prev => prev + 1);
    return { active: nextEffects, expired: [...normalizedCurrent.expired, ...expired] };
  };

  const commitAttributeChanges = (newAttributes, pointsSpent) => {
    setAttributes(newAttributes);
    setAvailablePerkAttributePoints(prev => prev - pointsSpent);
    const newLuck = getLuckPoints(newAttributes, trait);
    setMaxLuckPoints(newLuck);
    setLuckPoints(prevLuck => Math.min(prevLuck, newLuck));
    setCarryWeight(calculateCarryWeight(newAttributes, trait));
    setMeleeBonus(calculateMeleeBonus(newAttributes, trait));
    setInitiative(calculateInitiative(newAttributes));
    setDefense(calculateDefense(newAttributes));
    const newMaxHealth = calculateMaxHealth(newAttributes, level);
    setCurrentHealth(prevHealth => Math.min(prevHealth, newMaxHealth));
  };

  const resetCharacter = (preserveOrigin = false) => {
    const initialAttributes = createInitialAttributes();
    setAttributes(initialAttributes);
    setSkills(ALL_SKILLS.map(s => ({...s, value: 0})));
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
    hasTrait: (traitName) => !!(
      trait &&
      (
        trait.name === traitName ||
        (Array.isArray(trait?.modifiers?.selectedTraitNames) && trait.modifiers.selectedTraitNames.includes(traitName))
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
