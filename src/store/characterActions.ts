// Паспорт сигнатур операций стора (серия «Стор на TypeScript», патчи 245–246).
//
// Часть 2 серии (245): сеттеры, запись с семантикой, именованные операции.
// Часть 3 (246): CRUD предметов/эффектов, generic modifier actions and
// setting-owned feature actions dispatched through one typed engine bridge.
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
//   - CRUD_OP_KEYS — shared CRUD for items/effects and parameter modifiers.
//     Setting mechanics are dispatched through the single generic bridge.
//     Контрактный тест требует, чтобы паспорт покрывал ВСЕ root-действия
//     стора в обе стороны: новое действие без паспорта падает
//     тестом — «тихо проскочить мимо типизации» не выйдет.
//
// Динамическая проверка семьи апдейтеров — __tests__/saves/action-passports.test.js.

import type {
  CatalogEntityRef,
  CharacterPersistedData,
  ConditionRecord,
  EquippedArmor,
  EquipmentKit,
  ParameterEntry,
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
  [settingContextKey: string]: unknown;
}

/**
 * Универсальный исход операции «сделано/отказ с причиной» (инвариант
 * «нельзя купить на больше, чем есть», прецедент spendCurrency/227).
 * Успех может нести полезный груз (id, стоимость…), отказ — всегда reason.
 */
export type OkReason<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; reason: string; [extra: string]: unknown };

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
  setSceneCounter: UpdaterSetter<number>;
  setTraitEffects: UpdaterSetter<CharacterPersistedData['traitEffects']>;
  setModifiedItems: UpdaterSetter<CharacterPersistedData['modifiedItems']>;
  setSelectedPerks: UpdaterSetter<SelectedPerkRecord[]>;
  setSelectedSkills: UpdaterSetter<string[]>;
  setExtraTaggedSkills: UpdaterSetter<string[]>;
  setForcedSelectedSkills: UpdaterSetter<string[]>;
  setConditions: UpdaterSetter<ConditionRecord[]>;
  setSceneRiskStates: UpdaterSetter<CharacterPersistedData['sceneRiskStates']>;
  setEquipment: UpdaterSetter<EquipmentKit | null>;
  setEquippedWeapons: UpdaterSetter<CharacterPersistedData['equippedWeapons']>;
  setEquippedArmor: UpdaterSetter<EquippedArmor>;

  // ── Запись с собственной семантикой (без апдейтера) ──
  /** Абсолютная установка ресурса с клампом не ниже нуля. */
  setCurrency: (amount: number) => void;
  /** Флаги UI создания персонажа. */
  setAttributesSaved: (value: boolean) => void;
  setSkillsSaved: (value: boolean) => void;
  /** Абсолютная установка словарей параметров из legacy-массива (+пересчёт). */
  setBaseAttributes: (legacyArray: LegacyParameterRecord[]) => void;
  setBaseSkills: (legacyArray: LegacyParameterRecord[]) => void;
  /** Generic, lazily resolved action from the active setting's feature API. */
  getSettingAction: (featureId: string, actionId: string) => (...args: unknown[]) => unknown;
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
  applySettingResourceMutation: (
    resourceId: string,
    valueOrUpdater: number | ((previous: number) => number),
    options?: Record<string, unknown>,
  ) => unknown;
  /** Правило книги (патч 232): усталость бьёт текущими ОЗ. */
  applySurvivalHpLoss: (loss: number) => void;

  // ── Оркестраторы (orchestratorsSlice, патчи 239–240) ──
  commitAttributeChanges: (newAttributes: LegacyParameterRecord[], pointsSpent: number) => void;
  advanceScene: () => void;
  applyConsumableTimedEffects: (item: StoreItem) => void;
  applyConsumableFull: (item: StoreItem, options?: Record<string, unknown>) => Record<string, unknown>;
  advanceEffectsByGameHours: (hours: number) => Record<string, unknown>;
  reducePersistentDiseaseRanks: (amount: number) => { healed: boolean; diseasesLeft: number };
  resistDisease: (conditionId: string) => ResistDiseaseOutcome;
  applyDiseaseExposureEvent: (eventId: string) => Record<string, unknown> | null;

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
  /** МК-3 (317): каскад пересчитывает автоматически; действие — публичная
   * точка форс-пересчёта (опции-переопределения — как раньше). */
  recalculateDerivedStats: (options?: {
    trait?: CatalogEntityRef | null;
    level?: number;
    equipmentState?: EquipmentStatePush;
  }) => void;
  recalculatePerkBonuses: () => void;
  /** 412: мигратор перков при загрузке («книга приоритетнее», серые перки). */
  reconcilePerksAtLoad: () => {
    changed: boolean;
    removed: Array<{ id: string | null; rank: number | null; reason: string }>;
    dormant: Array<{ id: string; rank: number; reason: string; need?: number; have?: number; code?: string; otherId?: string }>;
    shouldNotify: boolean;
  };
  /** Фабрика полей сеттингов (экс-эффект провайдера, патч 243). */
  ensureStateExtensionFields: () => void;
  /** Мост legacy-формата (массивы) → словари стора. */
  loadFromLegacyData: (legacyData: Record<string, unknown>) => void;
  exportToLegacyData: () => Record<string, unknown>;

  // ── Часть 3 (246): предметы и эффекты (CRUD) ──
  /** Добавить предмет, вернуть его id (стеки склеиваются по instanceId). */
  addNewItem: (item: StoreItem) => string;
  updateItem: (itemId: string, patch: Partial<StoreItem>) => void;
  /** 344: количество (продажа/трата/выброс); удаление при нуле уводит
   * установленные моды вместе с предметом (правило живёт в одной копии). */
  adjustItemQuantity: (itemId: string, delta: number) => void;
  equipItem: (itemId: string) => void;
  unequipItem: (itemId: string) => void;
  /** 343: установить мод брони на предмет-носитель (флаг «экипирован» +
   * привязка installedOn; мода нет в сумке — свободная установка, null). */
  installArmorMod: (args: { modId: string; hostKey: string | null }) => string | null;
  /** 343: снять мод — теряет «экипирован» и снова виден в сумке. */
  uninstallArmorMod: (args: { modId: string; hostKey?: string | null }) => void;
  /** 343: предмет-носитель удалён — установленные моды уходят с ним. */
  releaseModsBoundTo: (hostKey: string) => void;
  /** Списать патроны/износ при выстреле (инварианты в слайсе). */
  spendAmmoForWeapon: (args: {
    weaponInstanceId: string;
    ammoIds: string[];
    ammoAmount: number;
    allowUntrackedWeapon?: boolean;
    itemUsePolicy?: (context: { item: StoreItem; amount: number }) =>
      | { ok: true; item?: StoreItem }
      | { ok: false; reason: string };
  }) => OkReason;
  /**
   * Атомарное списание стоков по каноническим id каталога (патч 251, движок
   * крафта; разборка хлама встанет на него же). Отказ НЕ трогает состояние —
   * контракт как у spendCurrency. Надетое и locked-комплекты не расходуются.
   */
  spendItemStacks: (args: { spend: Array<{ itemId: string; count: number }> }) =>
    | { ok: true; spent: Array<{ itemId: string; count: number; instanceId: string }> }
    | { ok: false; reason: string; itemId?: string };
  addEffect: (effect: TimedEffectRecord) => void;
  updateEffect: (effectId: string, patch: Partial<TimedEffectRecord>) => void;
  expireEffect: (effectId: string) => void;
  pruneExpiredEffects: () => void;

  // ── Модификаторы параметров и зависимости ──
  addAttributeModifier: (attrId: string, source: string, value: number, operation?: string) => void;
  removeAttributeModifier: (attrId: string, source: string) => void;
  addSkillModifier: (skillId: string, source: string, value: number, operation?: string) => void;
  removeSkillModifier: (skillId: string, source: string) => void;
  /** Дельта ограничивается правилами из активного setting capability. */
  updateAttribute: (attrId: string, delta: number) => void;
  updateSkill: (skillId: string, delta: number) => void;
  markSkillsAsRewarded: (skills: string[]) => void;
  /** Псевдоним recalculateDerivedStats (МК-3, 317: обычно избыточен — каскад). */
  triggerDependentCalculations: () => void;

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
  'setSceneCounter',
  'setTraitEffects',
  'setModifiedItems',
  'setSelectedPerks',
  'setSelectedSkills',
  'setExtraTaggedSkills',
  'setForcedSelectedSkills',
  'setConditions',
  'setSceneRiskStates',
  'setEquipment',
  'setEquippedWeapons',
  'setEquippedArmor',
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
  'applySettingResourceMutation',
  'applySurvivalHpLoss',
  'commitAttributeChanges',
  'advanceScene',
  'applyConsumableTimedEffects',
  'applyConsumableFull',
  'advanceEffectsByGameHours',
  'reducePersistentDiseaseRanks',
  'resistDisease',
  'applyDiseaseExposureEvent',
  'getSettingAction',
  'resetCharacter',
  'resetCharacterStore',
  'resetKitAndRewards',
  'recalculateAll',
  'recalculateDerivedStats',
  'recalculatePerkBonuses',
  'reconcilePerksAtLoad',
  'ensureStateExtensionFields',
  'loadFromLegacyData',
  'exportToLegacyData',
  // CRUD предметов/эффектов и прочее — исключения, типизируются патчами серии.
] as const satisfies readonly (keyof CharacterActions)[];

/**
 * Общие CRUD operations for items/effects and parameter modifiers.
 */
export const CRUD_OP_KEYS = [
  'addAttributeModifier',
  'addEffect',
  'addNewItem',
  'addSkillModifier',
  'adjustItemQuantity',
  'equipItem',
  'expireEffect',
  'installArmorMod',
  'markSkillsAsRewarded',
  'pruneExpiredEffects',
  'removeAttributeModifier',
  'removeSkillModifier',
  'releaseModsBoundTo',
  'spendAmmoForWeapon',
  'spendItemStacks',
  'triggerDependentCalculations',
  'unequipItem',
  'uninstallArmorMod',
  'updateAttribute',
  'updateEffect',
  'updateItem',
  'updateSkill',
] as const;

// Псевдо-использования типов: интерфейс CharacterActions ссылается на каждый
// импортированный тип (проверка, что паспорт данных согласован с операциями).
export type ActionDataLinks =
  | ParameterEntry
  | TimedEffectRecord
  | SelectedPerkRecord;
