// Паспорт снапшота сейва персонажа (серия «Стор на TypeScript», патч 244).
//
// Описывает форму записи НА ДИСКЕ (строка data в SQLite / облаке / файловом
// экспорте) в текущей версии схемы. Конвейер записи (src/saves/characterSaves.js):
//   buildSnapshot() → mergeSnapshotWithStoreData → serializeState → slimSaveData;
// паспорт соответствует результату serializeState (до слима — слим убирает
// только восстановимые по каталогу поля предметов, ключи верхнего уровня
// не трогает).
//
// Исторические особенности формата (НЕ менять без владельца — формат сейва):
//   - caps (не currency): ресурс назывался крышками до переименования рантайма;
//   - effects — «эффекты трейтов» (в сторе поле traitEffects);
//   - attributes/skills — legacy-массивы { name, value };
//   - Формат-v2 (патч 247): ключ modifiedItems В ЗАПИСЬ НЕ ПИШЕТСЯ —
//     моды живут на предметах (id+моды). Читающая сторона по-прежнему
//     принимает пары [itemId, item] из старых сейвов и переносит их на
//     предметы при загрузке (мост в deserializeState);
//   - origin — { id } без локализованных полей;
//   - maxLuckPoints в сейв НЕ пишется (Правило 1 counters-storage.md);
//   - rewardedSkills едет в сейве «попутным грузом»: конвейер мерджит
//     снапшот со стором (mergeSnapshotWithStoreData) и стор-ключ попадает
//     в запись; загрузкой не читается (награды восстанавливаются иначе) —
//     ключ задокументирован, чтобы паспорт не расходился с байтами;
//   - schemaVersion проставляет serializeState (CURRENT_SCHEMA_VERSION);
//   - поля расширений сеттингов (survival и др.) лежат рядом, верхним уровнем.
//
// Контрактная проверка паспорта — __tests__/saves/data-passports.test.js:
// реальный сейв (mock-db) сверяется с CHARACTER_SAVE_KEYS в обе стороны.

import type {
  CatalogEntityRef,
  ChemDoseEntry,
  ConditionRecord,
  EquippedArmor,
  EquippedPowerArmor,
  EquipmentKit,
  PowerArmorRuntime,
  SelectedPerkRecord,
  StoreItem,
  TimedEffectRecord,
  TraitEffectRecord,
} from '../store/characterState';

/** Legacy-запись параметра сейва: { name: 'STR', value: 4 }. */
export interface LegacyParameterRecord {
  name: string;
  value: number;
}

/**
 * Снапшот сейва на диске (schemaVersion CURRENT, saveSchema.js).
 * Расширения сеттингов приходят верхним уровнем — потому индексная подпись.
 */
export type CharacterSaveData = {
  characterName: string;
  level: number;
  attributes: LegacyParameterRecord[];
  skills: LegacyParameterRecord[];
  selectedSkills: string[];
  extraTaggedSkills: string[];
  forcedSelectedSkills: string[];
  origin: { id: string } | null;
  trait: CatalogEntityRef | null;
  equipment: EquipmentKit | null;
  /** «Эффекты трейтов» — исторический ключ (в сторе traitEffects). */
  effects: TraitEffectRecord[];
  /** Timed-эффекты — денормализация словаря стора в массив. */
  activeTimedEffects: TimedEffectRecord[];
  sceneCounter: number;
  equippedWeapons: StoreItem[];
  /** Робо-поля присутствуют только у персонажа с робо-состоянием. */
  equippedRobotSlots?: Record<string, Record<string, unknown>>;
  equippedRobotModules?: StoreItem[];
  /** ОС Mk II присутствует только у Секьюритрона. */
  mk2Installed?: boolean;
  equippedArmor: EquippedArmor;
  equippedPowerArmor: EquippedPowerArmor;
  powerArmorRuntime: PowerArmorRuntime;
  /** Персистентный контракт: рантайм-имя currency, поле сейва caps. */
  caps: number;
  currentHealth: number;
  radiation: number;
  availablePerkAttributePoints: number;
  luckPoints: number;
  attributesSaved: boolean;
  skillsSaved: boolean;
  selectedPerks: SelectedPerkRecord[];
  conditions: ConditionRecord[];
  chemDosesLog: ChemDoseEntry[];
  /** Попутный ключ мерджа со стором (загрузкой не читается). */
  rewardedSkills: string[];
  sceneRiskStates: Record<string, Record<string, unknown>>;
  lastDiseaseResistAt: number | null;
  schemaVersion: number;
} & {
  /** Поля расширений сеттингов ({ survival: … } и т.п.) — верхним уровнем. */
  [settingField: string]: unknown;
};

/**
 * Ключи паспорта сейва (без расширений сеттингов — они принадлежат сеттингам,
 * не движку). Рантайм-зеркало для контрактного теста.
 */
export const CHARACTER_SAVE_KEYS = [
  'characterName',
  'level',
  'attributes',
  'skills',
  'selectedSkills',
  'extraTaggedSkills',
  'forcedSelectedSkills',
  'origin',
  'trait',
  'equipment',
  'effects',
  'activeTimedEffects',
  'sceneCounter',
  'equippedWeapons',
  'equippedArmor',
  'equippedPowerArmor',
  'powerArmorRuntime',
  'caps',
  'currentHealth',
  'radiation',
  'availablePerkAttributePoints',
  'luckPoints',
  'attributesSaved',
  'skillsSaved',
  'selectedPerks',
  'conditions',
  'chemDosesLog',
  'rewardedSkills',
  'sceneRiskStates',
  'lastDiseaseResistAt',
  'schemaVersion',
] as const;
