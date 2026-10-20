// Паспорт данных персонажа в Zustand-сторе (серия «Стор на TypeScript»,
// патч 244 — Шаг 8 завершён, CharacterContext снесён).
//
// Паспорт = структурный контракт ДАННЫХ стора: то, что движок хранит и
// персистирует (partialize в characterStore.js) плюс runtime-идентификация
// текущего сейва. Сигнатуры операций (действий) в паспорт не входят — они
// составят следующий патч серии.
//
// Держать паспорт в сходимости со стором обязан контрактный тест
// __tests__/saves/data-passports.test.js: расхождение состава ключей
// partialize с CHARACTER_PERSISTED_KEYS падает тестом. Константа
// CHARACTER_PERSISTED_KEYS проверяется и компилятором (`satisfies`):
// переименуешь поле в интерфейсе — tsc укажет на устаревший список.
//
// Производные/служебные поля состояния (maxLuckPoints — Правило 1
// counters-storage.md, derivedStats, perkBonuses, isEffectsProcessing,
// _characterContext) в паспорт не входят: это кеш и рантайм-мостики.
//
// Формы, которые движок держит «непрозрачными» (payload предметов, эффектов,
// расширений сеттингов), типизированы минимально: обязательный идентификатор
// + индексная подпись. Ужесточение — по мере перевода слоёв на TS.

/**
 * Предмет инвентаря/экипировки. Схема «база + id модов НА ПРЕДМЕТЕ»
 * (патч 237): id кодирует экземпляр и установленные моды, каталог даёт
 * остальное (имя/цену/вес — восстанавливаются на загрузке).
 */
export interface StoreItem {
  id: string;
  [payloadKey: string]: unknown;
}

/** Параметр словаря атрибутов/навыков стора (Шаг 5 миграции). */
export interface ParameterEntry {
  id: string;
  base: number;
  modifiers: unknown[];
  total: number;
}

/** Слот надетой брони (domain/equippedArmor.js). */
export interface ArmorSlot {
  armor: StoreItem | null;
  clothing: StoreItem | null;
}

export type BodySlotKey = 'head' | 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export type EquippedArmor = Record<BodySlotKey, ArmorSlot>;

/** «Эффект трейта» (стор-поле traitEffects; в сейве ключ effects). */
export interface TraitEffectRecord {
  id: string;
  [payloadKey: string]: unknown;
}

/** Запись словаря timed-эффектов (стор-поле effects). */
export interface TimedEffectRecord {
  id: string;
  active?: boolean;
  [payloadKey: string]: unknown;
}

/** Заболевание/состояние (Шаг 6 миграции). */
export interface ConditionRecord {
  id: string;
  [payloadKey: string]: unknown;
}

/** Выбранный перк (с индексом колонки). */
export interface SelectedPerkRecord {
  perkId: string;
  [payloadKey: string]: unknown;
}

/** Комплект снаряжения (слайс equipment, Шаг 1 миграции). */
export interface EquipmentKit {
  id: string;
  name: string;
  [payloadKey: string]: unknown;
}

/** Ориджин/трейт — объекты каталога: идентичность только по id. */
export interface CatalogEntityRef {
  id: string;
  [payloadKey: string]: unknown;
}

/**
 * Персистируемые данные персонажа — ровно то, что выписывает partialize()
 * characterStore ( AsyncStorage-кеш; canonical-источник — строка SQLite).
 */
export interface CharacterPersistedData {
  /** Словари параметров — единственный источник (Шаг 5), никогда не пусты. */
  attributes: Record<string, ParameterEntry>;
  skills: Record<string, ParameterEntry>;
  /** Словарь «живых» предметов (equipped: true — надето). */
  items: Record<string, StoreItem>;
  /** Словарь timed-эффектов (канон, Шаг 6): dict, не массив. */
  effects: Record<string, TimedEffectRecord>;
  selectedPerks: SelectedPerkRecord[];
  /** Tagged-навыки, чья стартовая награда уже выдана. */
  rewardedSkills: string[];
  /** Поля расширений активных setting packages, патч 209. */
  stateExtensions: Record<string, unknown>;
  equipment: EquipmentKit | null;
  /** Персональный счётный ресурс; правила границ приходят от активного setting. */
  currency: number;
  /** Метаданные надетого оружия (кулаки/манипуляторы); предметы — в items. */
  equippedWeapons: StoreItem[];
  equippedArmor: EquippedArmor;
  /** Selection-списки создания персонажа (Шаг 5). */
  selectedSkills: string[];
  extraTaggedSkills: string[];
  forcedSelectedSkills: string[];
  conditions: ConditionRecord[];
  /** Состояния проверок рисков в сценах: ruleId → состояние. */
  sceneRiskStates: Record<string, Record<string, unknown>>;
  origin: CatalogEntityRef | null;
  trait: CatalogEntityRef | null;
  level: number;
  characterName: string;
  attributesSaved: boolean;
  skillsSaved: boolean;
  luckPoints: number;
  availablePerkAttributePoints: number;
  /** Текущее значение общего ресурса персонажа. */
  currentHealth: number;
  /** Сколько сцен сменилось с начала персонажа. */
  sceneCounter: number;
  traitEffects: TraitEffectRecord[];
  /** Модифицированные предметы: { [itemId]: item }; в сейв — массив пар. */
  modifiedItems: Record<string, StoreItem>;
  /** Версия схемы сейва (CURRENT_SCHEMA_VERSION, saveSchema.js). */
  schemaVersion: number;
}

/**
 * Runtime-поля стора (НЕ персистятся): идентификация текущего сейва.
 * currentCharacterId ставят saveCharacter/loadCharacter; isSaved=true
 * разрешает автосейв (src/saves/characterSaves.js).
 */
export interface CharacterRuntimeData {
  currentCharacterId: string | null;
  isSaved: boolean;
}

/**
 * Ключи персистируемого слоя — рантайм-зеркало паспорта для контрактного
 * теста. `satisfies` держит список в сходимости с интерфейсом: поле из
 * CHARACTER_PERSISTED_KEYS, отсутствующее в CharacterPersistedData (или
 * опечатка), ломает tsc.
 */
export const CHARACTER_PERSISTED_KEYS = [
  'attributes',
  'skills',
  'items',
  'effects',
  'selectedPerks',
  'rewardedSkills',
  'stateExtensions',
  'equipment',
  'currency',
  'equippedWeapons',
  'equippedArmor',
  'selectedSkills',
  'extraTaggedSkills',
  'forcedSelectedSkills',
  'conditions',
  'sceneRiskStates',
  'origin',
  'trait',
  'level',
  'characterName',
  'attributesSaved',
  'skillsSaved',
  'luckPoints',
  'availablePerkAttributePoints',
  'currentHealth',
  'sceneCounter',
  'traitEffects',
  'modifiedItems',
  'schemaVersion',
] as const satisfies readonly (keyof CharacterPersistedData)[];

/** Ключи runtime-слоя (НЕ входят в partialize). */
export const CHARACTER_RUNTIME_KEYS = [
  'currentCharacterId',
  'isSaved',
] as const satisfies readonly (keyof CharacterRuntimeData)[];
