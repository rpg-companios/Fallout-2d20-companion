import { debugLog } from '../src/debug/falloutDebug';
import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import * as db from '../db';
import {
  createInitialAttributes,
  ALL_SKILLS,
  ALL_SKILL_KEYS,
  getLuckPoints,
  calculateMaxHealth,
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
import { findEnrichedOrigin, getBuiltinBaseWeapon } from '../domain/origins';
import { createStateExtensionFields, hydrateStateExtensionFields, resetStateExtensionFields } from '../src/store/stateExtensions';
import { CHEM_DOSE_WINDOW_MS } from '../src/store/orchestratorsSlice';
import { inspectSelectedPerkRecords } from '../domain/perks';
import { pruneExpiredTimedEffects } from '../domain/effects';
import { createSceneRiskTracker } from '../domain/sceneRiskChecks';
import { syncCharacterToCloudIfEnabled } from './cloudSync/googleDriveSync';

import { resolveBodyPlan } from '../domain/bodyplan';
import { migrateSkillsToCanonical } from '../domain/skillCanonical';
import { selectLegacyAttributes, selectLegacySkills } from '../src/store/selectors';
import { resolveItem, findCatalogEntry } from '../domain/resolveItem';
import { slimSaveData, restoreSaveData } from '../domain/saveSlimming';
import { resolveKitItems } from '../domain/kitResolver';
import { canonizeLoadedCharacterItems } from '../domain/kitItemCanonical';
import { getCurrentLocale, getCurrentModuleLocale } from '../i18n/locale';
import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import ruPerksAndTraitsScreen from '../i18n/ru-RU/screens/perksAndTraits/screen.json';
import enPerksAndTraitsScreen from '../i18n/en-EN/screens/perksAndTraits/screen.json';
import { getPerks } from '../domain/registry';
import { Platform } from 'react-native';

// Zustand Store integration (Task 4.1)
import useCharacterStore from '../src/store/characterStore';
import { showRawAlert } from './alerts/alertService';
import { denormalizeCharacterState, denormalizeEffects, migrateCharacterState, mergeEquippedWeapons } from '../src/store/migrations.js';
import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } from '../src/store/saveSchema.js';

const INITIAL_LEVEL = 1;
// Журнал доз/антибиотик/атрибут болезней — константы orchestratorsSlice
// (патч 240); CHEM_DOSE_WINDOW_MS импортируется оттуда же.

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
  // ═══ Профиль персонажа: стор — единственный источник (Шаг 7). ═══
  // Сеттеры — стор-экшены (функциональный апдейтер), точки записи не менялись.
  // Фасад эти поля больше не отдаёт: экраны читают/пишут стор напрямую.
  const characterName = useCharacterStore((s) => s.characterName);
  const setCharacterName = useCharacterStore((s) => s.setCharacterName);
  const [characterId, setCharacterId] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  const level = useCharacterStore((s) => s.level);
  const setLevel = useCharacterStore((s) => s.setLevel);
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
  const origin = useCharacterStore((s) => s.origin);
  const setOrigin = useCharacterStore((s) => s.setOrigin);
  const trait = useCharacterStore((s) => s.trait);
  const setTrait = useCharacterStore((s) => s.setTrait);
  // ═══ Шаг 8а (часть 3): сцены и «эффекты трейтов» — стор. ═══
  // В снапшоте сейва traitEffects лежит под историческим ключом effects
  // (формат не менялся); timed-эффекты — отдельный словарь effects стора.
  const traitEffects = useCharacterStore((s) => s.traitEffects);
  const setTraitEffects = useCharacterStore((s) => s.setTraitEffects);
  const sceneCounter = useCharacterStore((s) => s.sceneCounter);
  const setSceneCounter = useCharacterStore((s) => s.setSceneCounter);
  // ═══ Робот: состояние — слайс robot стора (слайс жил там с патча 218; ═══
  // Шаг 8а: прямые действия setEquippedRobotSlots/setEquippedRobotModules).
  // Контекст держит подписку только ради снапшота сейва и derived-пуша;
  // экраны читают/пишут стор напрямую.
  const equippedRobotSlots = useCharacterStore((s) => s.robot?.slots ?? null);
  const equippedRobotModules = useCharacterStore((s) => s.robot?.modules ?? []);
  // Сеттеры — для внутренних вызовов (загрузка сейва, сброс); на фасад не выходят.
  const setEquippedRobotSlots = useCharacterStore((s) => s.setEquippedRobotSlots);
  const setEquippedRobotModules = useCharacterStore((s) => s.setEquippedRobotModules);
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

  // setEquippedRobotSlots/setEquippedRobotModules — Шаг 8а: действия слайса
  // robot стора (сеттеры с функциональным апдейтером); useState-обёртки с
  // зеркалом loadRobotState и микрозадачей (патч 218) сняты.

  // ═══ Здоровье/радиация: стор-каунтеры — единственный источник (Шаг 8а). ═══
  // Потолки/границы собирают стор-экшены (domain/counters.js); здесь —
  // подписки для снапшота сейва, автосейва и оркестратора расходников.
  // Экраны читают/пишут стор напрямую, фасад эти поля больше не отдаёт.
  const currentHealth = useCharacterStore((s) => s.currentHealth);
  const setCurrentHealth = useCharacterStore((s) => s.setCurrentHealth);
  const radiation = useCharacterStore((s) => s.radiation);
  const setRadiation = useCharacterStore((s) => s.setRadiation);

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

  // healCharacter/damageCharacter/addRadiation/healRadiation — Шаг 8а:
  // стор-экшены (правила каунтеров — domain/counters.js в слайсе стора).

  // Изменённые предметы: в сторе — словарь { [itemId]: item }; здесь —
  // Map для снапшота сейва (формат: массив пар) и подписка на изменения.
  const storeModifiedItems = useCharacterStore((s) => s.modifiedItems);
  const setModifiedItems = useCharacterStore((s) => s.setModifiedItems);
  const modifiedItems = useMemo(
    () => new Map(Object.entries(storeModifiedItems || {})),
    [storeModifiedItems],
  );
  const availablePerkAttributePoints = useCharacterStore((s) => s.availablePerkAttributePoints);
  const setAvailablePerkAttributePoints = useCharacterStore((s) => s.setAvailablePerkAttributePoints);
  const luckPoints = useCharacterStore((s) => s.luckPoints);
  const setLuckPoints = useCharacterStore((s) => s.setLuckPoints);
  const maxLuckPoints = useCharacterStore((s) => s.maxLuckPoints);
  const setMaxLuckPoints = useCharacterStore((s) => s.setMaxLuckPoints);
  const attributesSaved = useCharacterStore((s) => s.attributesSaved);
  const setAttributesSaved = useCharacterStore((s) => s.setAttributesSaved);
  const skillsSaved = useCharacterStore((s) => s.skillsSaved);
  const setSkillsSaved = useCharacterStore((s) => s.setSkillsSaved);
  // Выбранные перки — стор (Шаг 8а): экшен setSelectedPerks поддерживает
  // функциональный апдейтер и пересчитывает perkBonuses/derivedStats.
  // Сеттер — для внутренних вызовов (загрузка сейва, сброс); на фасад не выходит.
  const setSelectedPerks = useCharacterStore((s) => s.setSelectedPerks);

  // carryWeight/meleeBonus/initiative/defense — Шаг 8а: зеркала derivedStats
  // сняты. В API фасада они не были нужны никому, кроме carryWeight инвентаря
  // (селектор selectCarryWeight); W&A считает производные локально.

  // ═══ Заболевания/состояния: стор-словари — единственный источник (Шаг 6). ═══
  // Сеттеры — стор-экшены (поддерживают функциональный апдейтер), поэтому
  // точки записи ниже не менялись. Тень activeTimedEffects удалена: канон —
  // словарь effects стора (каждая запись шла парой syncTimedEffectsToStore +
  // сеттер тени; экраны выводят эффекты из словаря; сейв предпочитал стор).
  const conditions = useCharacterStore((s) => s.conditions);
  const setConditions = useCharacterStore((s) => s.setConditions);
  // Журнал доз препаратов [{ chemId, takenAt }].
  const chemDosesLog = useCharacterStore((s) => s.chemDosesLog);
  const setChemDosesLog = useCharacterStore((s) => s.setChemDosesLog);
  // Момент последней попытки «Сопротивляться» болезни (патч 215): одна
  // попытка в сутки; null = сопротивляться можно. Поле сейва (v25).
  const lastDiseaseResistAt = useCharacterStore((s) => s.lastDiseaseResistAt);
  const setLastDiseaseResistAt = useCharacterStore((s) => s.setLastDiseaseResistAt);
  // Состояния проверок риска сцен (ruleId → scene state).
  const sceneRiskStates = useCharacterStore((s) => s.sceneRiskStates);
  const setSceneRiskStates = useCharacterStore((s) => s.setSceneRiskStates);
  // Словарь effects стора: канон временных эффектов (Шаг 6). Нужен провайдеру
  // для снапшота сейва (activeTimedEffects) и пробуждения автосейва при
  // изменениях эффектов (лечение постелью больше не пишет контекстных полей).
  const storeEffects = useCharacterStore((s) => s.effects);
  const sceneRiskTrackerRef = useRef(null);
  if (sceneRiskTrackerRef.current === null) {
    sceneRiskTrackerRef.current = createSceneRiskTracker(useCharacterStore.getState().sceneRiskStates || {});
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

      // Прокидываем производственные данные экипировки → пересчёт derivedStats.
      // Шаг 7: trait/level/origin не зеркалируются — стор читает их сам;
      // isRobot считается внутри recalculateDerivedStats.
      current.setCharacterContext({
        equipmentState: {
          equippedArmor,
          equippedRobotSlots,
          powerArmorFrameId: equippedPowerArmor?.frame ? equippedPowerArmor.frame.catalogId : null,
        },
      });
    });
  }, [attributes, trait, level, origin, equippedArmor, equippedRobotSlots, equippedPowerArmor]);

  // Подписываемся на derivedStats стора и зеркалим их в локальный стейт,
  // чтобы все экраны, читающие carryWeight/meleeBonus/defense/initiative из
  // useCharacter(), получали ЕДИНОЕ каноническое значение из стора.
  // (Шаг 8а) derived-мост-подписка (applyDerived → локальные зеркала) снят:
  // зеркал больше нет, экраны читают derivedStats стора селекторами.



  // (Шаг 6) Секундный тик тени activeTimedEffects удалён: тень больше не
  // существует, а словарь effects стора он не трогал никогда; все пути
  // чтения/записи временных эффектов делают pruneExpiredTimedEffects на месте.

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


  // applySurvivalHpLoss — Шаг 8а: стор-экшен (патч 232, правило книги).

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
    // «Эффекты трейтов» — стор-поле traitEffects (Шаг 8а); сейв-ключ effects.
    effects: traitEffects,
    // Временные эффекты — из словаря стора (Шаг 6): денормализация dict→array.
    activeTimedEffects: denormalizeEffects(storeEffects),
    sceneCounter,
    equippedWeapons,
    // Слоты робота: пустой словарь («робота нет») пишется как null —
    // прежний формат сейва не меняется (раньше здесь жил useState с null).
    equippedRobotSlots: (equippedRobotSlots && Object.keys(equippedRobotSlots).length > 0)
      ? equippedRobotSlots
      : null,
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
    forcedSelectedSkills, origin, trait, equipment, traitEffects, storeEffects,
    sceneCounter, equippedWeapons, equippedRobotSlots, equippedRobotModules,
    equippedArmor, equippedPowerArmor, powerArmorRuntime,
    currency, currentHealth, radiation, storeModifiedItems, availablePerkAttributePoints,
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
    forcedSelectedSkills, origin, trait, equipment, effects, storeEffects,
    sceneCounter, equippedWeapons, equippedRobotSlots, equippedRobotModules,
    equippedArmor, equippedPowerArmor, powerArmorRuntime,
    currency, currentHealth, radiation, storeModifiedItems, availablePerkAttributePoints,
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
      // Мост канонизации (по образцу патча 225): битые id предметов китов
      // (фальшивая вода food_purified_water) переименовываются в канонические.
      // См. domain/kitItemCanonical.js; версия схемы сейва не меняется.
      const data = canonizeLoadedCharacterItems(deserializeState(row.data));
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
      setTraitEffects(data.effects || []); // сейв-ключ effects → traitEffects (Шаг 8а)
      // activeTimedEffects: тени больше нет — массив из сейва уходит в словарь
      // effects стора через loadFromLegacyData (normalizeEffects), см. ниже.
      setSceneCounter(data.sceneCounter ?? 0); // стор-экшен (Шаг 8а)
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
      setRadiation(Math.max(0, data.radiation ?? 0));
      setLastDiseaseResistAt(data.lastDiseaseResistAt ?? null);
      setModifiedItems(Object.fromEntries(
        data.modifiedItems instanceof Map
          ? data.modifiedItems.entries()
          : (Array.isArray(data.modifiedItems) ? data.modifiedItems : []),
      ));
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

  // getModifiedItem/saveModifiedItem/removeModifiedItem/getItemId — Шаг 8а
  // (часть 3): стор-экшены modifiedItems и domain/itemIdentity.

  // addPerkAttributePoints — Шаг 7: стор-экшен, перковый экран зовёт напрямую.

  /**
   * Записывает дозу препарата и возвращает общий размер пула доз за последние 24 ч.
   */
  // recordChemDose/applyDiseaseExposureEvent — Шаг 8а (патч 240): стор.

  // reducePersistentDiseaseRanks/resistDisease/applyDiseaseExposureForConsumable/
  // advanceEffectsByGameHours — Шаг 8а (патч 240): стор (orchestratorsSlice).

  /**
   * Применяет расходник: мгновенное лечение/радиация, timed-эффекты,
   * removeCondition, проверку зависимости и явно объявленный риск заражения.
   */
  // previewConsumableRadiation — Шаг 8а (патч 239): стор-экшен.

  // applyConsumableFull — Шаг 8а (патч 240): стор (orchestratorsSlice).

  // advanceScene/applyConsumableTimedEffects/previewConsumableRadiation —
  // Шаг 8а (патч 239): стор-экшены; тик сцен/эффектов живёт в сторе.

  // commitAttributeChanges — Шаг 8а (патч 238): стор-экшен, экран создания
  // персонажа зовёт напрямую.

  const resetCharacter = (preserveOrigin = false) => {
    const initialAttributes = createInitialAttributes();
    const initialSkills = ALL_SKILLS.map(s => ({ ...s, value: 0 }));
    // Профиль (уровень/имя/флаги/origin/trait/удача-в-ноль) сеет
    // resetCharacterStore (Шаги 5/7); ниже — потолок удачи по стартовым
    // атрибутам. preserveOrigin исторически сохранял ориджин выборочно —
    // полный сброс его обнуляет (семейство reset* уточняется в Шаге 8).
    const initialLuck = getLuckPoints(initialAttributes);
    setMaxLuckPoints(initialLuck);
    setLuckPoints(initialLuck);
    setEquipment(null);
    setTraitEffects([]);
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
    // Производные пересчитывает resetCharacterStore → recalculateAll (Шаг 8а).
    // Фикс регрессии Шага 7: initialLevel был удалён вместе с useState.
    const currentMaxHealth = calculateMaxHealth(initialAttributes, INITIAL_LEVEL);
    setCurrentHealth(currentMaxHealth);
    setModifiedItems({});
    // Reset save status.
    setCharacterName('');
    setCharacterId(null);
    setIsSaved(false);
    isSavedRef.current = false;
    characterIdRef.current = null;
  };

  // resetKitAndRewards/resetKitOnly — Шаг 8а (патч 241): стор-экшен
  // (resetKitOnly был мёртв — удалён вовсе).

  const value = {
    // characterName/setCharacterName — Шаг 7: только в сторе.
    characterId,
    isSaved,
    saveCharacter,
    loadCharacter,
    getCharactersList,
    deleteCharacter,
    // level/setLevel — Шаг 7: только в сторе.
    // Атрибуты/навыки (данные) — Шаг 5: экраны читают производные массивы
    // отсюда, пишут ТОЛЬКО в стор (setBaseAttributes/setBaseSkills +
    // selection-экшены useCharacterStore). Сеттеры из фасада убраны.
    // attributes/skills/selection-списки — Шаг 8а (патч 241): стор-селекторы.
    // origin/setOrigin/trait/setTrait — Шаг 7: только в сторе.
    // equipment/setEquipment, effects/setEffects (→ traitEffects), sceneCounter —
    // Шаг 8а (часть 3): стор напрямую (поле equipment живёт в сторе с Шага 1).
    // sceneRiskStates — Шаг 6: экраны читают стор напрямую (useCharacterStore).
    // sceneDurationMinutes удалён (мёртвый член).
    // previewConsumableRadiation/applyConsumableTimedEffects/applyConsumableFull —
    // Шаг 8а (патчи 239/240): стор.
    // conditions/setConditions/chemDosesLog — Шаг 6: только в сторе.
    // advanceScene — Шаг 8а (патч 239): стор.
    // equippedRobotSlots/Modules и их сеттеры — Шаг 8а: только в сторе.
    // Броня и силовая броня (состояние, рантайм блока, диалог выбора блока и
    // действия слоя) — Шаг 4 миграции: экраны читают/пишут стор напрямую
    // (useCharacterStore: equippedArmor/equippedPowerArmor/powerArmorRuntime,
    // экшены powerArmorSlice). Фасад эти поля больше не отдаёт.
    // Ресурсы наружу — числом, как и раньше. Менять их можно только
    // именованными операциями: правило границ живёт в domain/counters.js,
    // а не переписывается заново на каждом экране.
    // currency/earnCurrency/spendCurrency — Шаг 8а (патч 241): стор (с Шага 2).
    // currentHealth/radiation и их действия — Шаг 8а: только в сторе.
    // luckPoints/maxLuckPoints/attributesSaved/skillsSaved — Шаг 7: только в сторе.
    // selectedPerks/setSelectedPerks — Шаг 8а: только в сторе.
    // modifiedItems/setModifiedItems/getModifiedItem — Шаг 8а (часть 3): стор.
    // carryWeight/meleeBonus/initiative/defense — Шаг 8а: зеркала сняты
    // (derivedStats стора; carryWeight инвентаря — selectCarryWeight).
    // Расширения состояния (src/store/stateExtensions.js): сеттинги
    // регистрируют поля и читают/меняют их через эти методы.
    // stateExtensions/setStateExtension — Шаг 8а (патч 240): стор напрямую.
    // advanceEffectsByGameHours/reducePersistentDiseaseRanks/resistDisease/
    // applyDiseaseExposureEvent (resolveSceneRiskEventById) — Шаг 8а (патч 240): стор.
    // lastDiseaseResistAt — Шаг 6: экраны читают стор напрямую.
    resetCharacter,
    // resetKitAndRewards — Шаг 8а (патч 241): стор; resetKitOnly удалён (мёртв).
    // availablePerkAttributePoints/addPerkAttributePoints — Шаг 7: только в сторе.
    // commitAttributeChanges — Шаг 8а (патч 238): только в сторе.
    // meetsPerkRequirements/getPerkUnmetReasons/annotatePerks — Шаг 8а:
    // доменные функции domain/perks.js, экран зовёт напрямую со стор-данными.
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
