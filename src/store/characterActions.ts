// Паспорт сигнатур операций стора (серия «Стор на TypeScript», патч 245).
//
// Часть 2 серии: типизированные контракты ДЕЙСТВИЙ characterStore после
// Шага 8 (CharacterContext снесён — стор единственный источник, экшены
// расселены по characterStore/robotSlice/powerArmorSlice/orchestratorsSlice).
//
// Составляющие паспорта:
//   - SETTER_UPDATER_KEYS — сеттеры, обязанные принимать значение ИЛИ
//     функциональный апдейтер (prev => next). Обязательное требование
//     владельца к НОВЫМ сеттерам (прецедент setEquippedWeapons, патч 218);
//   - SETTER_VALUE_KEYS — операции записи с собственной семантикой
//     (абсолютная установка/clamp/нормализация legacy-массива); апдейтер
//     им не нужен по смыслу;
//   - NAMED_OP_KEYS — именованные операции (каунтеры, ресурс, оркестраторы,
//     пересчёты, сбросы) с точными сигнатурами ниже;
//   - EXEMPT_ACTION_KEYS — CRUD предметов/эффектов, робот/СБ и прочее,
//     типизируемое следующими патчами серии. Контрактный тест требует,
//     чтобы паспорт ∪ исключения покрывали ВСЕ действия стора в обе
//     стороны: новое действие без паспорта/исключения падает тестом.
//
// Динамическая проверка семьи апдейтеров — __tests__/saves/action-passports.test.js.

import type {
  ArmorSlot,
  BodySlotKey,
  CatalogEntityRef,
  CharacterPersistedData,
  ConditionRecord,
  EquippedArmor,
  EquippedPowerArmor,
  EquipmentKit,
  ParameterEntry,
  PowerArmorRuntime,
  RobotState,
  SelectedPerkRecord,
  StoreItem,
  TimedEffectRecord,
} from './characterState';
import type { LegacyParameterRecord } from '../saves/saveSnapshot';

// domain/types.js держит SpendOutcome JSDoc-typedef'ом (JS); до перевода
// домена на TS паспорт дублирует форму структурно.
export type SpendOutcome = { ok: true } | { ok: false; reason: string };

/** Сеттер с обязательной поддержкой функционального апдейтера. */
export type UpdaterSetter<T> = (valueOrUpdater: T | ((prev: T) => T)) => void;

/** Форма equipmentState, пушимая derived-самосинхронизацией (патч 243). */
export interface EquipmentStatePush {
  equippedArmor?: EquippedArmor | null;
  equippedRobotSlots?: RobotState['slots'] | null;
  powerArmorFrameId?: string | null;
}

/** Результат превью радиации расходника (патч 239). */
export interface ConsumableRadiationPreview {
  requestedAmount: number;
  receivedRadiationDamage: number;
  rolls: unknown[];
  canOfferReroll: boolean;
  [extraKey: string]: unknown;
}

/** Итог «Сопротивляться» болезни (одна попытка в сутки, патч 215). */
export type ResistDiseaseOutcome =
  | { ok: true; [extraKey: string]: unknown }
  | { ok: false; reason: 'cooldown' | 'notFound' | string; retryInMs?: number };

/**
 * Действия стора (пасспортизированная часть). Состояние целиком:
 * CharacterPersistedData & CharacterRuntimeData & CharacterActions.
 */
export interface CharacterActions {
  // ── Сеттеры семьи апдейтеров (значение | (prev) => next) ──
  setCharacterName: UpdaterSetter<string>;
  setLevel: UpdaterSetter<number>;
  setOrigin: UpdaterSetter<CatalogEntityRef | null>;
  setTrait: UpdaterSetter<CatalogEntityRef | null>;
  setLuckPoints: UpdaterSetter<number>;
  setMaxLuckPoints: UpdaterSetter<number>;
  setAvailablePerkAttributePoints: UpdaterSetter<number>;
  setCurrentHealth: UpdaterSetter<number>;
  setRadiation: UpdaterSetter<number>; // кламп не ниже нуля внутри
  setSceneCounter: UpdaterSetter<number>;
  setTraitEffects: UpdaterSetter<CharacterPersistedData['traitEffects']>;
  setModifiedItems: UpdaterSetter<CharacterPersistedData['modifiedItems']>;
  setSelectedPerks: UpdaterSetter<SelectedPerkRecord[]>;
  setSelectedSkills: UpdaterSetter<string[]>;
  setExtraTaggedSkills: UpdaterSetter<string[]>;
  setForcedSelectedSkills: UpdaterSetter<string[]>;
  setConditions: UpdaterSetter<ConditionRecord[]>;
  setChemDosesLog: UpdaterSetter<CharacterPersistedData['chemDosesLog']>;
  setLastDiseaseResistAt: UpdaterSetter<number | null>;
  setSceneRiskStates: UpdaterSetter<CharacterPersistedData['sceneRiskStates']>;
  setEquipment: UpdaterSetter<EquipmentKit | null>;
  setEquippedWeapons: UpdaterSetter<CharacterPersistedData['equippedWeapons']>;
  setEquippedArmor: UpdaterSetter<EquippedArmor>;
  setEquippedPowerArmor: UpdaterSetter<EquippedPowerArmor>;
  setPowerArmorRuntime: UpdaterSetter<PowerArmorRuntime>;
  setEquippedRobotSlots: UpdaterSetter<RobotState['slots']>;
  setEquippedRobotModules: UpdaterSetter<RobotState['modules']>;
  setPendingCoreChoice: UpdaterSetter<StoreItem | null>;

  // ── Запись с собственной семантикой (без апдейтера) ──
  /** Абсолютная установка ресурса с клампом не ниже нуля. */
  setCurrency: (amount: number) => void;
  /** Флаги UI создания персонажа. */
  setAttributesSaved: (value: boolean) => void;
  setSkillsSaved: (value: boolean) => void;
  /** Абсолютная установка словарей параметров из legacy-массива (+пересчёт). */
  setBaseAttributes: (legacyArray: LegacyParameterRecord[]) => void;
  setBaseSkills: (legacyArray: LegacyParameterRecord[]) => void;
  /** Расширения сеттингов: весь словарь / одно поле по ключу. */
  setStateExtensions: (dict: CharacterPersistedData['stateExtensions']) => void;
  setStateExtension: (fieldKey: string, value: unknown) => void;
  /** Пуш производственных данных экипировки (derived-мост, патч 243). */
  setCharacterContext: (context: { equipmentState?: EquipmentStatePush }) => void;

  // ── Каунтеры: именованные операции (правила — domain/counters.js) ──
  earnCurrency: (amount: number) => void;
  spendCurrency: (amount: number) => SpendOutcome;
  /** Начисление очков перков (Шаг 7). */
  addPerkAttributePoints: (points: number) => void;
  healCharacter: (amount: number, maxOverride?: number) => void;
  damageCharacter: (amount: number) => void;
  addRadiation: (amount: number) => void;
  healRadiation: (amount: number) => void;
  /** Правило книги (патч 232): усталость бьёт текущими ОЗ. */
  applySurvivalHpLoss: (loss: number) => void;

  // ── Оркестраторы (orchestratorsSlice, патчи 239–240) ──
  commitAttributeChanges: (newAttributes: LegacyParameterRecord[], pointsSpent: number) => void;
  advanceScene: () => void;
  previewConsumableRadiation: (item: StoreItem) => ConsumableRadiationPreview;
  applyConsumableTimedEffects: (item: StoreItem) => void;
  applyConsumableFull: (item: StoreItem, options?: Record<string, unknown>) => Record<string, unknown>;
  advanceEffectsByGameHours: (hours: number) => Record<string, unknown>;
  reducePersistentDiseaseRanks: (amount: number) => { healed: boolean; diseasesLeft: number };
  resistDisease: (conditionId: string) => ResistDiseaseOutcome;
  applyDiseaseExposureEvent: (eventId: string) => Record<string, unknown> | null;

  // ── Силовая броня: таймер расхода блока (§5.3/§5.4) ──
  tickPowerArmorCore: (tickMs: number) => void;

  // ── Сбросы и пересчёты ──
  /** Полный сброс персонажа (патч 242: стор-экшен; preserveOrigin упразднён). */
  resetCharacter: () => void;
  /** «Жёсткий» сброс стора; без аргументов сеет стартовые словари создания. */
  resetCharacterStore: (legacyDefaults?: {
    attributes?: LegacyParameterRecord[];
    skills?: LegacyParameterRecord[];
    selectedPerks?: SelectedPerkRecord[];
    rewardedSkills?: string[];
  }) => void;
  /** Смена комплекта; keepSkills — не чистить tagged-навыки (патч 241). */
  resetKitAndRewards: (opts?: { keepSkills?: boolean }) => void;
  recalculateAll: () => void;
  recalculateDerivedStats: (options?: {
    trait?: CatalogEntityRef | null;
    level?: number;
    equipmentState?: EquipmentStatePush;
  }) => void;
  recalculatePerkBonuses: () => void;
  /** Фабрика полей сеттингов (экс-эффект провайдера, патч 243). */
  ensureStateExtensionFields: () => void;
  /** Мост legacy-формата (массивы) → словари стора. */
  loadFromLegacyData: (legacyData: Record<string, unknown>) => void;
  exportToLegacyData: () => Record<string, unknown>;
}

/** Сеттеры семьи апдейтеров — проверяются динамически (identity (prev)=>prev). */
export const SETTER_UPDATER_KEYS = [
  'setCharacterName',
  'setLevel',
  'setOrigin',
  'setTrait',
  'setLuckPoints',
  'setMaxLuckPoints',
  'setAvailablePerkAttributePoints',
  'setCurrentHealth',
  'setRadiation',
  'setSceneCounter',
  'setTraitEffects',
  'setModifiedItems',
  'setSelectedPerks',
  'setSelectedSkills',
  'setExtraTaggedSkills',
  'setForcedSelectedSkills',
  'setConditions',
  'setChemDosesLog',
  'setLastDiseaseResistAt',
  'setSceneRiskStates',
  'setEquipment',
  'setEquippedWeapons',
  'setEquippedArmor',
  'setEquippedPowerArmor',
  'setPowerArmorRuntime',
  'setEquippedRobotSlots',
  'setEquippedRobotModules',
  'setPendingCoreChoice',
] as const satisfies readonly (keyof CharacterActions)[];

/** Запись с собственной семантикой (апдейтер по смыслу не нужен). */
export const SETTER_VALUE_KEYS = [
  'setCurrency',
  'setAttributesSaved',
  'setSkillsSaved',
  'setBaseAttributes',
  'setBaseSkills',
  'setStateExtensions',
  'setStateExtension',
  'setCharacterContext',
] as const satisfies readonly (keyof CharacterActions)[];

/** Именованные операции с точными сигнатурами. */
export const NAMED_OP_KEYS = [
  'earnCurrency',
  'spendCurrency',
  'addPerkAttributePoints',
  'healCharacter',
  'damageCharacter',
  'addRadiation',
  'healRadiation',
  'applySurvivalHpLoss',
  'commitAttributeChanges',
  'advanceScene',
  'previewConsumableRadiation',
  'applyConsumableTimedEffects',
  'applyConsumableFull',
  'advanceEffectsByGameHours',
  'reducePersistentDiseaseRanks',
  'resistDisease',
  'applyDiseaseExposureEvent',
  'tickPowerArmorCore',
  'resetCharacter',
  'resetCharacterStore',
  'resetKitAndRewards',
  'recalculateAll',
  'recalculateDerivedStats',
  'recalculatePerkBonuses',
  'ensureStateExtensionFields',
  'loadFromLegacyData',
  'exportToLegacyData',
  // CRUD предметов/эффектов и прочее — исключения, типизируются патчами серии.
] as const satisfies readonly (keyof CharacterActions)[];

/**
 * Действия, НЕ паспортизированные в 245 (CRUD предметов/эффектов, робот/СБ,
 * модификаторы параметров). Следующие патчи серии обязаны либо паспортизировать,
 * либо осознанно оставить здесь.
 */
export const EXEMPT_ACTION_KEYS = [
  'addAttributeModifier',
  'addEffect',
  'addNewItem',
  'addSkillModifier',
  'addRobotModule',
  'adjustPowerArmorDurability',
  'applyMk2Driver',
  'equipHeldWeapon',
  'equipItem',
  'equipPowerArmorPackage',
  'equipPowerArmorPieceInto',
  'expireEffect',
  'initRobot',
  'initRobotFromKit',
  'loadPowerArmorState',
  'loadRobotState',
  'markSkillsAsRewarded',
  'pruneExpiredEffects',
  'removeAttributeModifier',
  'removeRobotModule',
  'removeSkillModifier',
  'repairPowerArmorPieceAt',
  'repairPowerArmorStack',
  'repairWeapon',
  'replaceLimb',
  'resetRobot',
  'resolveCoreChoice',
  'setRobotArmorLayer',
  'spendAmmoForWeapon',
  'triggerDependentCalculations',
  'unequipHeldWeapon',
  'unequipItem',
  'unequipPowerArmorPackage',
  'unequipPowerArmorPieceAt',
  'updateAttribute',
  'updateEffect',
  'updateItem',
  'updateSkill',
] as const;

// Псевдо-использования типов: интерфейс CharacterActions ссылается на каждый
// импортированный тип (проверка, что паспорт данных согласован с операциями).
export type ActionDataLinks =
  | ArmorSlot
  | BodySlotKey
  | ParameterEntry
  | TimedEffectRecord
  | SelectedPerkRecord;
