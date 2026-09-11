import { debugLog } from '../src/debug/falloutDebug';
import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import * as db from '../db';
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
  getAttributeLimits,
} from '../domain/characterCreation';

// Мост канонизации навыков (legacy RU-имена → ключи) переехал в
// domain/skillCanonical.js — тестируемый домен-модуль без React.

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
import { findEnrichedOrigin, isRobotCharacter, getBuiltinBaseWeapon } from '../domain/origins';
import { createStateExtensionFields, hydrateStateExtensionFields, resetStateExtensionFields, notifyConditionEvent, notifyConsumableApplied } from '../src/store/stateExtensions';
import { meetsPerkRequirements, getPerkUnmetReasons, annotatePerks, inspectSelectedPerkRecords } from '../domain/perks';
import { applyConsumableToEffects, recordDoseWithinWindow, checkAddiction, applyRemoveConditions, advanceEffectsByScene, advanceEffectsByScenes, pruneExpiredTimedEffects, resolveConsumableRadiationRoll, resolveConsumableVitalChanges, SCENE_RULES } from '../domain/effects';
import { hasDamageImmunity, hasRadiationImmunity } from '../domain/immunities';
import { createSceneRiskTracker, getSceneRiskEventForRule } from '../domain/sceneRiskChecks';
import { isSkillTagged } from '../domain/d20Checks';
import {
  addPersistentDiseaseEffect,
  DISEASE_RESIST_COOLDOWN_MS,
  effectDiseaseRank,
  increaseDiseaseRank,
  reduceDiseaseRanks,
  removePersistentDiseaseEffects,
  resistDiseaseRoll,
  rollDiseaseFromCatalog,
} from '../domain/diseaseConditions';
import { syncCharacterToCloudIfEnabled } from './cloudSync/googleDriveSync';

import { resolveBodyPlan } from '../domain/bodyplan';
import { createCounter, consume, restore, set as setCounter } from '../domain/counters';
import { migrateSkillsToCanonical } from '../domain/skillCanonical';
import { selectLegacyAttributes, selectLegacySkills } from '../src/store/selectors';
import { resolveItem, findCatalogEntry } from '../domain/resolveItem';
import { slimSaveData, restoreSaveData } from '../domain/saveSlimming';
import { resolveKitItems } from '../domain/kitResolver';
import { getCurrentLocale, getCurrentModuleLocale } from '../i18n/locale';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import ruPerksAndTraitsScreen from '../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../i18n/en-EN/screens/perksAndTraits/screen.json';
import { getConditionCatalog, getPerks, getSceneRiskRules } from '../domain/registry';
import { Platform } from 'react-native';

// Zustand Store integration (Task 4.1)
import useCharacterStore from '../src/store/characterStore';
import { showRawAlert } from './alerts/alertService';
import { denormalizeCharacterState, migrateCharacterState, mergeEquippedWeapons } from '../src/store/migrations.js';
import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from '../src/store/saveSchema.js';
import { effectsDictToLegacyArray, syncTimedEffectsToStore } from '../src/store/effectsSync.js';

const INITIAL_LEVEL = 1;
const CHEM_DOSE_WINDOW_MS = 24 * 60 * 60 * 1000;
// Патч 215: антибиотик — не более одной дозы в 24 часа. Кулдаун
// сопротивления — DISEASE_RESIST_COOLDOWN_MS из domain/diseaseConditions.
const ANTIBIOTIC_CHEM_WINDOW_MS = 24 * 60 * 60 * 1000;
const DISEASE_ATTRIBUTE = 'END';
const DISEASE_SKILL = 'SURVIVAL';

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
const PERK_ALERTS_DICT = {
  'ru-RU': ruPerksAndTraitsScreen.alerts,
  'en-EN': enPerksAndTraitsScreen.alerts,
};
const tPerkAlert = (key) => PERK_ALERTS_DICT[getCurrentLocale()][key];
// Диалоги идут через общий AlertHost — одна React-модалка на вебе и на нативе.
// (Раньше помощник назывался paAlert и жил рядом с actions слоя СБ; после
// Шага 4 миграции слоя СБ в стор остался только общим алертом контекста.)
const paAlert = (title, message = '') => showRawAlert({ title, message });
// Лейблы инвентаря (левая/правая конечность) — те же ключи, что использует
// обычная броня при выборе слота. Кнопка отмены теперь приходит из каталога
// алертов, поэтому отдельный словарь действий здесь больше не нужен.
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
  // ═══ Атрибуты/навыки: стор-словари — единственный источник (Шаг 5). ═══
  // Экраны пишут ТОЛЬКО в стор (setBaseAttributes/setBaseSkills и
  // selection-экшены); «массивы» здесь — производные представления словарей
  // (selectLegacy*), нужны снапшоту сейва и доменным расчётам, чья сигнатура —
  // legacy-массив. Фасад больше не отдаёт сеттеры этих полей.
  const storeAttributes = useCharacterStore((s) => s.attributes);
  const storeSkills = useCharacterStore((s) => s.skills);
  const attributes = useMemo(() => selectLegacyAttributes({ attributes: storeAttributes }), [storeAttributes]);
  const skills = useMemo(() => selectLegacySkills({ skills: storeSkills }), [storeSkills]);
  const selectedSkills = useCharacterStore((s) => s.selectedSkills);
  const extraTaggedSkills = useCharacterStore((s) => s.extraTaggedSkills);
  const forcedSelectedSkills = useCharacterStore((s) => s.forcedSelectedSkills);
  const [origin, setOrigin] = useState(null);
  const [trait, setTrait] = useState(null);
  const [effects, setEffects] = useState([]);
  const [activeTimedEffects, setActiveTimedEffects] = useState([]);
  const [sceneCounter, setSceneCounter] = useState(0);
  const [equippedRobotSlots, setEquippedRobotSlotsRaw] = useState(null);
  const [equippedRobotModules, setEquippedRobotModulesRaw] = useState([]);
  // Расширения состояния персонажа (src/store/stateExtensions.js): поля сейва,
  // которыми владеют сеттинги (например, survival у Fallout). Движок правил
  // не знает — применяет фабрики/hydrate/reset из реестра.
  // С патча 209 хранилище — слайс `stateExtensions` зустанд-стора (как
  // items/effects): единственный источник истины, все экраны подписаны,
  // мутации — только действия стора. Контекст читает слайс селектором и
  // раскладывает его в снапшот сейва под теми же ключами.
  const stateExtensions = useCharacterStore((s) => s.stateExtensions);

  // Комплект снаряжения: единственный источник — Zustand стор (Шаг 1 миграции
  // из CharacterContext). Context — тонкий фасад для обратной совместимости
  // существующих экранов (useCharacter().equipment / setEquipment).
  const equipment = useCharacterStore((s) => s.equipment);
  const setEquipment = useCharacterStore((s) => s.setEquipment);

  // Новый персонаж: как только выбран ориджин — сеттинговые фабрики
  // заполняют ещё не созданные поля (null = «не создано»). При загрузке
  // сейва поля заданы миграцией/гидратацией — эффект их не трогает.
  useEffect(() => {
    if (!origin) return;
    const created = createStateExtensionFields({ origin, trait });
    let changed = false;
    const merged = { ...stateExtensions };
    for (const [fieldKey, value] of Object.entries(created)) {
      if (merged[fieldKey] === undefined || merged[fieldKey] === null) {
        if (merged[fieldKey] === value) continue; // null → null: менять нечего
        merged[fieldKey] = value;
        changed = true;
      }
    }
    if (changed) useCharacterStore.getState().setStateExtensions(merged);
  }, [origin, trait, stateExtensions]);

  // Запись поля расширения — стабильная функция, делегирует действию стора:
  // используется и в значении контекста, и в уведомлениях расширений
  // (расходники, патч 208).
  const setStateExtension = useCallback((fieldKey, value) => {
    useCharacterStore.getState().setStateExtension(fieldKey, value);
  }, []);

  // ── Robot equipment: single source of truth = Zustand robot slice ──────────
  // These wrappers keep the legacy useState (used by buildSnapshot / DB save) in
  // sync while ALSO writing through to the store. Screens keep calling the same
  // setter name; data flows into one place (Fix #2, Step 3). Functional updates
  // (prev => next) are preserved.
  const setEquippedRobotSlots = useCallback((updater) => {
    setEquippedRobotSlotsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Mirror into the store slice. ВАЖНО (патч 218): апдейтер useState
      // исполняется React'ом ВО ВРЕМЯ рендера — стор-действие внутри него
      // обновляло стор прямо из рендера и давало
      // «Cannot update a component (CharacterProvider) while rendering a
      // different component (CharacterProvider)». Микротаск выполняется после
      // commit-фазы, до передачи управления event loop (тот же приём, что и
      // для синхронизации derivedStats ниже).
      queueMicrotask(() => {
        useCharacterStore.getState().loadRobotState({
          bodyPlan: useCharacterStore.getState().robot?.bodyPlan ?? null,
          slots: next || {},
          modules: useCharacterStore.getState().robot?.modules ?? [],
        });
      });
      return next;
    });
  }, []);

  const setEquippedRobotModules = useCallback((updater) => {
    setEquippedRobotModulesRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Зеркало в стор — в микрозадаче: стор-действие в апдейтере исполняется
      // во время рендера (патч 218, см. setEquippedRobotSlots выше).
      queueMicrotask(() => {
        useCharacterStore.getState().loadRobotState({
          bodyPlan: useCharacterStore.getState().robot?.bodyPlan ?? null,
          slots: useCharacterStore.getState().robot?.slots ?? {},
          modules: next || [],
        });
      });
      return next;
    });
  }, []);

  const [currentHealth, setCurrentHealth] = useState(0);
  const [radiation, setRadiationRaw] = useState(0);

  /**
   * Ресурс (в Fallout — крышки): единственный источник — Zustand стор
   * (Шаг 2 миграции из CharacterContext). earnCurrency/spendCurrency —
   * стор-экшены, не локальный setState. Контекст — тонкий фасад для
   * существующих экранов (useCharacter().currency / earnCurrency /
   * spendCurrency).
   * @type {number}
   */
  const currency = useCharacterStore((s) => s.currency);
  /** @type {(amount: number) => void} */
  const earnCurrency = useCharacterStore((s) => s.earnCurrency);
  /** @type {(amount: number) => import('../domain/types').SpendOutcome} */
  const spendCurrency = useCharacterStore((s) => s.spendCurrency);

  // Надетая броня / пакет СБ / рантайм блока: единственный источник — стор
  // (Шаг 4 миграции, powerArmorSlice). Имена переменных сохранены:
  // buildSnapshot, derived-эффекты и автосейв читают их как раньше, но теперь
  // это стор-селекторы. Экраны читают/пишут стор напрямую, фасад эти поля
  // больше не отдаёт.
  const equippedArmor = useCharacterStore((s) => s.equippedArmor);
  const equippedPowerArmor = useCharacterStore((s) => s.equippedPowerArmor);
  const powerArmorRuntime = useCharacterStore((s) => s.powerArmorRuntime);

  // Надетое оружие (метаданные): единственный источник — Zustand стор
  // (Шаг 3 миграции). Экраны читают/пишут стор НАПРЯМОУЮ (селектор/экшен
  // useCharacterStore), фасад это поле больше не отдаёт; контекст держит
  // подписку только ради buildSnapshot/автосейва.
  const equippedWeapons = useCharacterStore((s) => s.equippedWeapons);

  // Ресурсы персонажа — движковые каунтеры (domain/counters.js). В состоянии
  // и в сейве лежит только текущее значение числом; потолок и нижняя граница
  // — вычисляемые, они собираются здесь в момент операции.
  // См. docs/architecture/counters-storage.md.
  //
  // (Ресурс мигрировал в стор — экшены earnCurrency/spendCurrency выше;
  // правило «не ниже нуля» теперь живёт в стор-слайсе.)

  // Здоровье: потолок — формула сеттинга от атрибутов и уровня. Текущее
  // значение может оказаться ВЫШЕ потолка (радиация опускает максимум ОЗ,
  // не нанося урона) — это законное состояние, лечение его не снимает и,
  // что важно, не уменьшает здоровье.
  // maxOverride — потолок, уже уменьшенный вызывающим (экран вычитает
  // радиацию). Без него берётся базовая формула сеттинга.
  const healthCounter = (maxOverride) => createCounter({
    id: 'health',
    current: currentHealth,
    max: maxOverride ?? calculateMaxHealth(attributes, level),
  });
  const healCharacter = (amount, maxOverride) =>
    setCurrentHealth(restore(healthCounter(maxOverride), amount).current);
  // Урон списывается без потолка базовой формулы: текущее ОЗ может быть
  // законно ВЫШЕ базового максимума (бонус «прекрасно отдохнувший», патч 213
  // снижает максимум от усталости) — зажим createCounter к базовому max
  // молча отрезал бы разницу. Ограничение — только нижняя граница 0.
  const damageCharacter = (amount) =>
    setCurrentHealth(consume(createCounter({ id: 'health', current: currentHealth, max: null }), amount).current);

  // Радиация: ресурс с обратным знаком — «хорошо» быть у нуля. Потолка нет,
  // ограничение только снизу.
  const radiationCounter = () => createCounter({ id: 'radiation', current: radiation, max: null });
  const addRadiation = (amount) => setRadiationRaw(restore(radiationCounter(), amount).current);
  const healRadiation = (amount) => setRadiationRaw(consume(radiationCounter(), amount).current);
  const setRadiation = (updater) => setRadiationRaw((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return setCounter({ id: 'radiation', current: prev, max: null, min: 0 }, next).current;
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
      // Зеркало в стор — в микрозадаче: стор-действие в апдейтере исполняется
      // во время рендера (патч 218, см. setEquippedRobotSlots выше).
      queueMicrotask(() => {
        useCharacterStore.getState().setSelectedPerks(next || []);
      });
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
  // Момент последней попытки «Сопротивляться» болезни (патч 215): одна
  // попытка в сутки; null = сопротивляться можно. Поле сейва (v25).
  const [lastDiseaseResistAt, setLastDiseaseResistAt] = useState(null);
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
      // (Шаг 5) Подсев атрибутов «если dict пуст» убран: стор — единственный
      // источник и сеется дефолтами в начальном состоянии/сбросе/загрузке;
      // синхронизировать нечего.
      const current = useCharacterStore.getState();

      // Прокидываем реальный контекст → корректный пересчёт derivedStats.
      // isRobot управляет правилом переносимого веса (от корпуса/брони, без STR).
      const isRobot = isRobotCharacter({ origin, trait });
      current.setCharacterContext({
        trait,
        level,
        // origin нужен правилам экипировки слоя СБ (powerArmorSlice.characterRules).
        origin,
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

  // ═══ Силовая броня: состояние и действия — в стор-слайсе (Шаг 4 миграции,   ═══
  // powerArmorSlice.js: equip/unequip пакета и частей, починка, диалог блока). ═══
  // Таймер расхода блока (§5.3/§5.4) остаётся React-эффектом: тикает только
  // пока приложение открыто («приложение закрыто — отсчёт на паузе»), но
  // читает/пишет состояние через стор-действие, а не через ref+useState.
  useEffect(() => {
    const interval = setInterval(() => {
      useCharacterStore.getState().tickPowerArmorCore(PA_CORE_TICK_MS);
    }, PA_CORE_TICK_MS);
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
    // ОС Mk II (Секьюритрон) — часть robot-состояния, обязана переживать сейв/загрузку.
    mk2Installed: useCharacterStore.getState().robot?.mk2Installed ?? false,
    equippedArmor,
    equippedPowerArmor,
    powerArmorRuntime,
    // Рантайм-имя ресурса — currency (стор), поле сейва остаётся caps:
    // персистентный формат не меняем (совместимость со старыми сохранениями
    // и migrations.js).
    caps: currency,
    currentHealth,
    radiation,
    modifiedItems,
    availablePerkAttributePoints,
    luckPoints,
    attributesSaved,
    skillsSaved,
    selectedPerks,
    // Производные (maxLuckPoints, carryWeight, meleeBonus, initiative,
    // defense) в сейв НЕ идут: они вычисляются при загрузке из атрибутов,
    // уровня и трейта. Хранить их значит держать второй источник правды.
    // См. docs/architecture/counters-storage.md, правило 1.
    conditions,
    chemDosesLog,
    sceneRiskStates,
    lastDiseaseResistAt,
    ...stateExtensions,
  }), [
    characterName, level, attributes, skills, selectedSkills, extraTaggedSkills,
    forcedSelectedSkills, origin, trait, equipment, effects, activeTimedEffects,
    sceneCounter, equippedWeapons, equippedRobotSlots, equippedRobotModules,
    equippedArmor, equippedPowerArmor, powerArmorRuntime,
    currency, currentHealth, radiation, modifiedItems, availablePerkAttributePoints,
    luckPoints, attributesSaved, skillsSaved, selectedPerks,
    conditions, chemDosesLog, sceneRiskStates, lastDiseaseResistAt, stateExtensions,
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
    currency, currentHealth, radiation, modifiedItems, availablePerkAttributePoints,
    luckPoints, attributesSaved, skillsSaved, selectedPerks,
    // Производные убраны и отсюда: они не попадают в снимок, а их пересчёт
    // зря будил автосохранение (запись в БД + синхронизация с облаком).
    buildSnapshot,
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

       const loadedTrait = data.trait || null;
       const loadedAttributes = clampAttributesToRules(data.attributes, loadedTrait);

       setCharacterId(id);
      setCharacterName(row.name);
      setLevel(data.level ?? INITIAL_LEVEL);
       // Базовые статы и selection-списки — напрямую в стор (Шаг 5).
      const st = useCharacterStore.getState();
      st.setBaseAttributes(loadedAttributes);
      st.setBaseSkills(migrateSkillsToCanonical(data.skills) || ALL_SKILLS.map(sk => ({ ...sk, value: 0 })));
      st.setSelectedSkills(data.selectedSkills || []);
      st.setExtraTaggedSkills(data.extraTaggedSkills || []);
      st.setForcedSelectedSkills(data.forcedSelectedSkills || []);
       setOrigin(data.origin || null);
       setTrait(loadedTrait);
      setEquipment(data.equipment || null);
      setEffects(data.effects || []);
      setActiveTimedEffects(pruneExpiredTimedEffects(data.activeTimedEffects || []).effects);
      setSceneCounter(data.sceneCounter ?? 0);
      sceneRiskTrackerRef.current.replaceStates(data.sceneRiskStates);
      setSceneRiskStates(data.sceneRiskStates);
      // Поля сеттинговых расширений: hydrate расширения сам решает, как
      // нормализовать своё поле (идемпотентно, без подъёма версии схемы).
      // Хранилище — слайс stateExtensions стора (патч 209).
      useCharacterStore.getState().setStateExtensions(hydrateStateExtensionFields(data, {
        origin: resolveOrigin(data.origin),
        trait: data.trait || null,
      }));
      // Migrate old [null, null] format to dynamic array
      const rawWeapons = data.equippedWeapons || [];
      let migratedWeapons = Array.isArray(rawWeapons) ? rawWeapons.filter(w => w !== null) : [];
      // Ensure the archetype's built-in unarmed weapon is present on load
      // (non-robots get fists; robots get melee via a manipulator, so nothing to inject).
      const loadedOrigin = resolveOrigin(data.origin);
      const builtin = getBuiltinBaseWeapon({ origin: loadedOrigin, trait: loadedTrait });
      if (builtin && !migratedWeapons.some(w => w?.id === builtin.id)) {
        migratedWeapons = [builtin, ...migratedWeapons];
      }
      useCharacterStore.getState().setEquippedWeapons(migratedWeapons);
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
      // Слой брони/СБ из сейва — одним стор-действием (Шаг 4 миграции);
      // недоодетый диалог выбора блока при загрузке всегда сбрасывается.
      useCharacterStore.getState().loadPowerArmorState({
        equippedArmor: data.equippedArmor,
        equippedPowerArmor: data.equippedPowerArmor,
        powerArmorRuntime: data.powerArmorRuntime,
      });
      // Абсолютная установка из сейва: инкрементальные earnCurrency/spendCurrency
      // для этого не годятся (Шаг 2 миграции ресурса в стор). Поле сейва —
      // data.caps: персистентный формат не переименовываем.
      useCharacterStore.getState().setCurrency(data.caps ?? 0);
      setCurrentHealth(data.currentHealth ?? 0);
      setRadiationRaw(Math.max(0, data.radiation ?? 0));
      setLastDiseaseResistAt(data.lastDiseaseResistAt ?? null);
      setModifiedItems(data.modifiedItems instanceof Map ? data.modifiedItems : new Map());
      setAvailablePerkAttributePoints(data.availablePerkAttributePoints ?? 0);
      setLuckPoints(data.luckPoints ?? 0);
      // Максимум удачи — производная (атрибуты + трейт), а не хранимое
      // значение: считаем его при загрузке, а не читаем из сейва. Иначе это
      // второй источник правды, который разъезжается с формулой.
      // См. docs/architecture/counters-storage.md, правило 1.
      setMaxLuckPoints(getLuckPoints(data.attributes || createInitialAttributes(), loadedTrait));
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
      // carryWeight/meleeBonus/initiative/defense из сейва НЕ читаем: сразу
      // после загрузки их перетирает пересчёт derivedStats из стора (см.
      // applyDerived ниже), так что это был мёртвый груз. Значения придут
      // из единого источника — стора.
      setConditions(data.conditions || []);
      setChemDosesLog(
        (data.chemDosesLog || []).filter((d) => Date.now() - d.takenAt < CHEM_DOSE_WINDOW_MS)
      );
      
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

  const applyDiseaseExposureEvent = (eventId) => {
    const ruleMatches = getSceneRiskRules()
      .map((rule) => ({
        rule,
        event: Array.isArray(rule.eventTypes) && rule.eventTypes.includes(eventId)
          ? { eventId }
          : null,
      }))
      .filter(({ event }) => event !== null);
    if (ruleMatches.length === 0) return null;
    if (ruleMatches.length > 1) {
      throw new Error(`[CharacterContext] Событие риска "${eventId}" объявлено несколькими правилами`);
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

    if (applied.added) {
      // Усталость от болезни (патч 215): +1 источник «болезнь». Движок
      // уведомляет сеттинг — модуль Fallout двигает усталость
      // (modules/fallout/survival/index.js, слушатель событий состояний).
      notifyConditionEvent(
        { kind: 'disease', event: 'infected', conditionId: disease.id },
        { stateExtensions, setStateExtension },
      );
    }

    return {
      ...riskResult,
      diseaseRoll,
      disease,
      infectionStatus: applied.added ? 'infected' : 'duplicate',
    };
  };

  /**
   * Лечение болезней (патч 215): снимает `amount` единиц с КАЖДОЙ активной
   * болезни (антибиотик — 1 за раз, отдых в постели — по порциям сна).
   * Излеченные болезни удаляются из эффектов; сеттинг уведомляется о каждой
   * (модуль Fallout снимает усталость источника «болезнь»). Условие
   * 'diseased' остаётся, пока есть хотя бы одна болезнь.
   * @returns {{ healed: string[], diseasesLeft: number }}
   */
  const reducePersistentDiseaseRanks = (amount) => {
    const storeNow = useCharacterStore.getState();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(storeNow.effects)).effects;
    const treated = reduceDiseaseRanks(currentEffects, amount);
    syncTimedEffectsToStore(treated.effects, storeNow);
    setActiveTimedEffects(treated.effects);
    for (const conditionId of treated.healed) {
      notifyConditionEvent(
        { kind: 'disease', event: 'cured', conditionId },
        { stateExtensions, setStateExtension },
      );
    }
    const diseasesLeft = treated.effects.filter((e) => e.effectType === 'disease').length;
    if (diseasesLeft === 0 && conditions.includes('diseased')) {
      setConditions((previous) => previous.filter((c) => c !== 'diseased'));
    }
    return { healed: treated.healed, diseasesLeft };
  };

  /**
   * Проверка «Сопротивляться» болезни (патч 215): 2d20, успех грани —
   * <= ВЫН + Выживание (1 на грани — 2 успеха; отмеченный навык «Выживание»
   * и грань <= его ранга — 2 успеха). Сумма успехов >= ранга болезни
   * излечивает её; каждая грань 20 повышает ранг болезни на 1. Одна
   * попытка в сутки.
   */
  const resistDisease = (conditionId) => {
    const now = Date.now();
    if (lastDiseaseResistAt != null && now - lastDiseaseResistAt < DISEASE_RESIST_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown', retryInMs: DISEASE_RESIST_COOLDOWN_MS - (now - lastDiseaseResistAt) };
    }
    const storeNow = useCharacterStore.getState();
    const currentEffects = pruneExpiredTimedEffects(effectsDictToLegacyArray(storeNow.effects)).effects;
    const effect = currentEffects.find((e) => e.effectType === 'disease' && e.conditionId === conditionId);
    if (!effect) return { ok: false, reason: 'notFound' };

    const attribute = attributes.find((entry) => entry?.name === DISEASE_ATTRIBUTE);
    const skill = skills.find((entry) => entry?.name === DISEASE_SKILL);
    if (!attribute || !skill) {
      throw new Error(`[CharacterContext] Для сопротивления болезни отсутствует ${DISEASE_ATTRIBUTE} или ${DISEASE_SKILL}`);
    }
    const isTagged = isSkillTagged({
      skillId: DISEASE_SKILL,
      primaryTaggedSkillIds: selectedSkills,
      extraTaggedSkillIds: extraTaggedSkills,
    });

    const rankBefore = effectDiseaseRank(effect);
    const roll = resistDiseaseRoll({
      targetNumber: getAttributeValue(attributes, DISEASE_ATTRIBUTE) + skill.value,
      taggedSurvivalRank: isTagged ? skill.value : null,
      diseaseRank: rankBefore,
    });

    setLastDiseaseResistAt(now);

    let rankAfter = rankBefore;
    if (roll.cured) {
      const withoutDisease = currentEffects.filter((e) => e !== effect);
      syncTimedEffectsToStore(withoutDisease, storeNow);
      setActiveTimedEffects(withoutDisease);
      notifyConditionEvent(
        { kind: 'disease', event: 'cured', conditionId },
        { stateExtensions, setStateExtension },
      );
      if (!withoutDisease.some((e) => e.effectType === 'disease') && conditions.includes('diseased')) {
        setConditions((previous) => previous.filter((c) => c !== 'diseased'));
      }
    } else if (roll.rankIncrease > 0) {
      rankAfter = rankBefore + roll.rankIncrease;
      const withRank = increaseDiseaseRank(currentEffects, conditionId, roll.rankIncrease);
      syncTimedEffectsToStore(withRank, storeNow);
      setActiveTimedEffects(withRank);
    }

    return {
      ok: true,
      diseaseName: effect.effectName,
      ...roll,
      rankBefore,
      rankAfter,
    };
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

    // Единая механика проверки болезни (§7 дока): событие расходника
    // (rawFood / dirtyWater) разрешается тем же кодом, что и sleepOnGround.
    return applyDiseaseExposureEvent(ruleMatches[0].event.eventId);
  };

  /**
   * Родовой мост времени и эффектов: продвигает таймеры временных эффектов
   * на N игровых часов (N × 12 сцен). Используется расширениями сеттингов
   * (например, сон выживания Fallout: docs/survival-system-design.md §5).
   * Возвращает { effects, expired }.
   */
  const advanceEffectsByGameHours = (hours) => {
    const store = useCharacterStore.getState();
    const currentLegacy = effectsDictToLegacyArray(store.effects);
    const normalizedCurrent = pruneExpiredTimedEffects(currentLegacy);
    normalizedCurrent.expired.forEach((effect) => store.expireEffect(effect.id));
    const { effects: nextEffects, expired } = advanceEffectsByScenes(
      normalizedCurrent.effects,
      hours * SCENE_RULES.SCENES_PER_GAME_HOUR,
    );
    syncTimedEffectsToStore(nextEffects, store);
    setActiveTimedEffects(nextEffects);
    return { effects: nextEffects, expired: [...normalizedCurrent.expired, ...expired] };
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
      removed: removedRaw,
      requested: conditionRemovalsRequested,
    } = applyRemoveConditions(item, conditions);
    let removed = removedRaw;
    // Лечение болезней (патч 215): антибиотик снимает 1 единицу с КАЖДОЙ
    // болезни (ранги), а не лечит всё разом; не более 1 дозы в 24 часа.
    let diseaseTreatment = null;
    const antibioticRequested = conditionRemovalsRequested.includes('diseased') && item?.antibiotic === true;
    if (antibioticRequested && removedRaw.includes('diseased')) {
      const lastAntibioticDose = chemDosesLog
        .filter((d) => d.chemId === item.id)
        .map((d) => d.takenAt)
        .sort((a, b) => b - a)[0];
      const onCooldown = lastAntibioticDose != null && Date.now() - lastAntibioticDose < ANTIBIOTIC_CHEM_WINDOW_MS;
      if (onCooldown) {
        diseaseTreatment = { blocked: true };
        removed = removedRaw.filter((c) => c !== 'diseased');
      } else {
        const treatment = reducePersistentDiseaseRanks(1);
        diseaseTreatment = { blocked: false, ...treatment };
        removed = treatment.diseasesLeft === 0 ? removedRaw : removedRaw.filter((c) => c !== 'diseased');
      }
      // Условие 'diseased' пересчитывается в reducePersistentDiseaseRanks
      // (снимается только при полном излечении); nextConditions без него
      // при частичном лечении не применяем.
      setConditions(nextConditions);
    } else if (removedRaw.length > 0) {
      setConditions(nextConditions);
      // Снятие зависимости (аддиктол): удаляем перманентный эффект
      // «Зависимость: Стелс-бой» из активных эффектов.
      if (removedRaw.includes('addicted')) {
        const storeNow = useCharacterStore.getState();
        const currentEffects = effectsDictToLegacyArray(storeNow.effects);
        const withoutAddiction = currentEffects.filter(
          (effect) => !(effect.isPermanent && String(effect.effectName || '').includes('Зависимость')),
        );
        syncTimedEffectsToStore(withoutAddiction, storeNow);
        setActiveTimedEffects(withoutAddiction);
      }
      if (removedRaw.includes('diseased')) {
        // Не-антибиотик, снимающий болезни целиком (историческое поведение):
        // удаляем все болезненные эффекты и уведомляем сеттинг о каждой
        // излеченной болезни (усталость источника «болезнь» снимается).
        const storeNow = useCharacterStore.getState();
        const currentEffects = effectsDictToLegacyArray(storeNow.effects);
        const withoutDiseases = removePersistentDiseaseEffects(currentEffects);
        syncTimedEffectsToStore(withoutDiseases.effects, storeNow);
        setActiveTimedEffects(withoutDiseases.effects);
        for (const cured of withoutDiseases.removed) {
          notifyConditionEvent(
            { kind: 'disease', event: 'cured', conditionId: cured.conditionId },
            { stateExtensions, setStateExtension },
          );
        }
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

    // Расходник применён на себя — уведомляем расширения сеттингов
    // (реестр stateExtensions, патч 208). Например, Fallout двигает
    // шкалы еды/воды выживания при употреблении еды/напитков ЛЮБЫМ путём
    // (инвентарь или модалка выживания). Движок правил не знает.
    const extensionResults = notifyConsumableApplied(item, {
      stateExtensions,
      setStateExtension,
    });

    debugLog('consumable.apply.result', {
      timedResult,
      addictionResult,
      diseaseRiskResult,
      extensionResults,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      healAmount: vitalChanges.healAmount,
      radiationAmount: vitalChanges.radiationAmount,
    });

    return {
      timedResult: { ...timedResult, expired: normalizedCurrent.expired },
      addictionResult,
      diseaseRiskResult,
      extensionResults,
      conditionsRemoved: removed,
      conditionRemovalsRequested,
      diseaseTreatment,
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

    // Calculate deltas from the canonical store, not from the legacy Context
    // mirror. The mirror can lag by one render and otherwise makes a second
    // +1 allocation become +2 in the store.
    const currentAttributesArray = attributes;
    const currentAttributesMap = {};
    currentAttributesArray.forEach(attr => {
      currentAttributesMap[attr.name] = attr.value;
    });

    const store = useCharacterStore.getState();
    const committedAttributes = (newAttributes || []).map((newAttr) => {
      if (!newAttr?.name) return newAttr;
      const { max } = getAttributeLimits(trait, newAttr.name);
      const value = Math.min(Number(newAttr.value) || 0, max);
      return value === newAttr.value ? newAttr : { ...newAttr, value };
    });

    committedAttributes.forEach(newAttr => {
      if (!newAttr?.name) return;
      const currentAttr = store.attributes?.[newAttr.name]?.base
        ?? currentAttributesMap[newAttr.name]
        ?? 0;
      const delta = newAttr.value - currentAttr;

      if (delta !== 0) {
        // Use Zustand Store action
        store.updateAttribute(newAttr.name, delta);
      }
    });

    // (Шаг 5) Зеркало setAttributes убрано: стор — единственный источник,
    // производный массив контекста пересчитывается из словаря автоматически.
    // Perk-экран оценивает требования через тот же производный массив.
    // Update other state fields
    setAvailablePerkAttributePoints(prev => prev - pointsSpent);
    const newLuck = getLuckPoints(committedAttributes, trait);
    setMaxLuckPoints(newLuck);
    setLuckPoints(prevLuck => Math.min(prevLuck, newLuck));
    setCarryWeight(calculateCarryWeight(committedAttributes, trait, { equippedArmor, equippedRobotSlots }));
    setMeleeBonus(calculateMeleeBonus(committedAttributes, trait));
    setInitiative(calculateInitiative(committedAttributes));
    setDefense(calculateDefense(committedAttributes));
    const newMaxHealth = calculateMaxHealth(newAttributes, level);
    setCurrentHealth(prevHealth => Math.min(prevHealth, newMaxHealth));
  };

  const resetCharacter = (preserveOrigin = false) => {
    const initialAttributes = createInitialAttributes();
    const initialLevel = INITIAL_LEVEL;
    setLevel(initialLevel);
    const initialSkills = ALL_SKILLS.map(s => ({ ...s, value: 0 }));
    // Атрибуты/навыки/selection-списки сеет resetCharacterStore (слайс, Шаг 5).
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
    // Список надетого оружия обнуляет resetCharacterStore (слайс
    // equippedWeapons, Шаг 3 миграции).
    useCharacterStore.persist?.clearStorage?.();
    useCharacterStore.getState().resetCharacterStore({
      attributes: initialAttributes,
      skills: initialSkills,
    });
    setEquippedRobotSlots(null);
    setEquippedRobotModules([]);
    // Поля сеттинговых расширений сбрасываются (reset расширения); при
    // следующем выборе ориджина фабрики заполнят их заново.
    useCharacterStore.getState().setStateExtensions(resetStateExtensionFields());
    // Броня/СБ/рантайм блока/диалог сбрасываются resetCharacterStore (Шаг 4 миграции).
    // Ресурс обнуляет resetCharacterStore (слайс currency, Шаг 2 миграции).
    setSelectedPerks([]);
    setConditions([]);
    setChemDosesLog([]);
    setLastDiseaseResistAt(null);
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
    // equippedWeapons обнуляет resetCharacterStore (Шаг 3 миграции).
    setEquippedRobotSlots(null);
    setEquippedRobotModules([]);
    // Броня/СБ/рантайм блока сбрасываются resetCharacterStore (Шаг 4 миграции;
    // раньше надетый пакет СБ здесь не сбрасывался и «повисал» над пустым
    // инвентарём — теперь консистентно спадает).
    // Ресурс обнуляет resetCharacterStore (слайс currency, Шаг 2 миграции).
    // resetCharacterStore принимает legacy-формат (массивы) — денормализуем.
    const { attributes: legacyAttributes, skills: legacySkills } =
      denormalizeCharacterState(useCharacterStore.getState());
    useCharacterStore.getState().resetCharacterStore({
      attributes: legacyAttributes,
      skills: legacySkills,
      rewardedSkills: [],
    });
    if (!keepSkills) {
      const resetSt = useCharacterStore.getState();
      resetSt.setSelectedSkills([]);
      resetSt.setExtraTaggedSkills([]);
      resetSt.setForcedSelectedSkills([]);
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
    // Атрибуты/навыки (данные) — Шаг 5: экраны читают производные массивы
    // отсюда, пишут ТОЛЬКО в стор (setBaseAttributes/setBaseSkills +
    // selection-экшены useCharacterStore). Сеттеры из фасада убраны.
    attributes, skills,
    selectedSkills,
    extraTaggedSkills,
    forcedSelectedSkills,
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
    equippedRobotSlots, setEquippedRobotSlots,
    equippedRobotModules, setEquippedRobotModules,
    // Броня и силовая броня (состояние, рантайм блока, диалог выбора блока и
    // действия слоя) — Шаг 4 миграции: экраны читают/пишут стор напрямую
    // (useCharacterStore: equippedArmor/equippedPowerArmor/powerArmorRuntime,
    // экшены powerArmorSlice). Фасад эти поля больше не отдаёт.
    // Ресурсы наружу — числом, как и раньше. Менять их можно только
    // именованными операциями: правило границ живёт в domain/counters.js,
    // а не переписывается заново на каждом экране.
    currency, earnCurrency, spendCurrency,
    currentHealth, healCharacter, damageCharacter, setCurrentHealth,
    radiation, setRadiation, addRadiation, healRadiation,
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
    // Расширения состояния (src/store/stateExtensions.js): сеттинги
    // регистрируют поля и читают/меняют их через эти методы.
    stateExtensions,
    setStateExtension,
    advanceEffectsByGameHours,
    resolveSceneRiskEventById: applyDiseaseExposureEvent,
    // Болезни (патч 215): лечение по единицам (антибиотики, отдых в
    // постели) и проверка «Сопротивляться». Правила усталости от болезни
    // остаются в модуле Fallout (уведомления о событиях состояний).
    reducePersistentDiseaseRanks,
    resistDisease,
    lastDiseaseResistAt,
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
