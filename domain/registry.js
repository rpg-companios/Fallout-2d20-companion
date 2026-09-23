// domain/registry.js
// Реестр данных движка — ЕДИНАЯ точка чтения данных сеттинга.
//
// Источники:
//   base   — встроенные данные data/ (движок поставляется без сеттинга,
//            но для обратной совместимости пока читает data/);
//   module — модуль сеттинга modules/fallout/ (новый контент пишется сюда).
//
// Приоритет: module > base (по id для массивов, deep merge для словарей i18n).
// Все потребители (domain/*, компоненты) читают данные ТОЛЬКО через реестр.

// ── Модуль сеттинга (modules/fallout) ──────────────────────────────────────
// Дверь сеттинга (292): единственный импорт данных Fallout — modules/fallout/index.js
// (контракт — в шапке двери). Привязки ниже — карта «прежнее локальное имя →
// канонический путь SETTING»; новые данные = файл + строка в двери, не здесь.
import { SETTING } from '../modules/fallout/index.js';

const bodyplansJson = SETTING.data.bodyplans;
const robotLimbsJson = SETTING.data.equipment.robot.limbs;
const robotWeaponAsLimbJson = SETTING.data.equipment.robot.weaponAsLimb;
const robotWeaponsJson = SETTING.data.equipment.robot.weapons;
const robotArmorJson = SETTING.data.equipment.robot.armor;
const robotArmorPlatingJson = SETTING.data.equipment.robot.armorPlating;
const robotFramesJson = SETTING.data.equipment.robot.frames;
const robotWeaponModsJson = SETTING.data.equipment.robot.weaponMods;
const moduleOrigins = SETTING.data.origins;
const moduleFitProfiles = SETTING.data.fitProfiles;
const moduleCategories = SETTING.data.equipment.categories;
const moduleTraits = SETTING.data.traits;
const modulePerks = SETTING.data.perks;
const moduleWeapons = SETTING.data.equipment.weapons;
const moduleWeaponMods = SETTING.data.equipment.weaponMods;
const moduleGeneralGoods = SETTING.data.equipment.generalGoods;
const moduleDiseaseExposureRule = SETTING.data.rules.diseaseExposure;
const moduleEquipmentKits = SETTING.data.equipmentKits;
const moduleRuOriginsI18n = SETTING.names['ru-RU'].system.origins;
const moduleEnOriginsI18n = SETTING.names['en-EN'].system.origins;
const moduleRuTraitsI18n = SETTING.names['ru-RU'].system.traits;
const moduleEnTraitsI18n = SETTING.names['en-EN'].system.traits;
const moduleRuEquipmentKitsI18n = SETTING.names['ru-RU'].system.equipmentKits;
const moduleEnEquipmentKitsI18n = SETTING.names['en-EN'].system.equipmentKits;
const moduleRuUniqQualitiesI18n = SETTING.names['ru-RU'].system.uniqQualities;
const moduleEnUniqQualitiesI18n = SETTING.names['en-EN'].system.uniqQualities;
const moduleRuWeaponsI18n = SETTING.names['ru-RU'].equipment.weapons;
const moduleEnWeaponsI18n = SETTING.names['en-EN'].equipment.weapons;
const moduleRuClothesI18n = SETTING.names['ru-RU'].equipment.clothes;
const moduleEnClothesI18n = SETTING.names['en-EN'].equipment.clothes;
const moduleRuGeneralGoodsI18n = SETTING.names['ru-RU'].equipment.generalGoods;
const moduleEnGeneralGoodsI18n = SETTING.names['en-EN'].equipment.generalGoods;
const moduleRuWeaponModsI18n = SETTING.names['ru-RU'].equipment.weaponMods;
const moduleEnWeaponModsI18n = SETTING.names['en-EN'].equipment.weaponMods;
const moduleRuFoodI18n = SETTING.names['ru-RU'].consumables.food;
const moduleEnFoodI18n = SETTING.names['en-EN'].consumables.food;
const moduleRuDrinksI18n = SETTING.names['ru-RU'].consumables.drinks;
const moduleEnDrinksI18n = SETTING.names['en-EN'].consumables.drinks;
const moduleRuSettingsI18n = SETTING.names['ru-RU'].system.settings;
const moduleEnSettingsI18n = SETTING.names['en-EN'].system.settings;
const moduleUniqQualities = SETTING.data.equipment.uniqQualities;
// Разбор и рецептура: листы групп (junk/index.js, recipes/index.js) растворены
// в двери (292) — сборка здесь, по каноническим путям.
const moduleScrapJunk = SETTING.data.junk.items;
const moduleScrapMaterials = SETTING.data.junk.materials;
const moduleScrapTables = SETTING.data.junk.tables;
const moduleCraftingCategoryRules = SETTING.data.recipes.categoryRules;
const CRAFTING_FILES = {
  'ammo.json': SETTING.data.recipes.sections.ammo,
  'explosives.json': SETTING.data.recipes.sections.explosives,
  'armor.json': SETTING.data.recipes.sections.armor,
  'chems.json': SETTING.data.recipes.sections.chems,
  'food.json': SETTING.data.recipes.sections.food,
  'drinks.json': SETTING.data.recipes.sections.drinks,
};
const moduleCraftingIndex = SETTING.data.recipes.manifest;

import { getEquipmentCatalog } from '../i18n/equipmentCatalog';
import { getDiseasesCatalog } from '../i18n/conditionsCatalog';
import { getCurrentModuleLocale } from '../i18n/locale';
import { expandTrueItems } from './packMerge';

const requireModuleLocale = (locale) => {
  if (locale !== 'ru-RU' && locale !== 'en-EN') {
    throw new Error(`[registry] Для языка сеттинга "${locale}" нет каталога данных`);
  }
  return locale;
};

/**
 * Все ориджины: база + модуль (модуль перекрывает по id).
 */
export function getOrigins() {
  return moduleOrigins;
}

/**
 * Профили fitProfile по characterType (данные сеттинга). Заменяет
 * цепочку origins.armorPolicy → canEquip → allowlist.
 */
export function getFitProfileData() {
  return moduleFitProfiles;
}

/**
 * Справочник категорий предметов (данные сеттинга). Категории используются
 * матчерами fitProfile и соответствуют наборам данных (поля/id данных).
 */
export function getCategories() {
  return moduleCategories;
}

/**
 * Все трейты: база + модуль.
 */
export function getTraits() {
  return moduleTraits;
}

/**
 * Перки активного сеттинга. Каталог живёт в модуле; движок читает его
 * только через реестр.
 */
export function getPerks() {
  return modulePerks;
}

/**
 * Планы тела (движковые данные; сеттинг может добавить свои).
 */
export function getBodyPlans() {
  return bodyplansJson;
}

/**
 * Каталоги конечностей роботов новой модели (этап 1): конечности, оружие
 * вместо конечности, атаки, слои защиты.
 *
 * Собирается один раз: JSON импортируются статически, объект неизменяем
 * для потребителей (не мутируйте его).
 */
const ROBOT_LIMB_CATALOG = Object.freeze({
  limbs: robotLimbsJson,
  weaponAsLimb: robotWeaponAsLimbJson,
  weapons: robotWeaponsJson,
  // Общий каталог оружия сеттинга: то, что робот может держать в ладони и что
  // в конечность устанавливается (человеческое оружие — рельсотрон, дробовик,
  // лазерный пистолет). Боевые характеристики оружия живут только здесь и в
  // robot/weapons.json; в сейве хранится один id.
  generalWeapons: moduleWeapons,
  // Моды оружия: сейв хранит id установленных модов, характеристики
  // восстанавливаются применением модов к базе (domain/enrichItem.js).
  // Пул включает и моды оружия роботов (290): уникальные конденсаторы
  // Головного лазера Штурмотрона живут в robot/weapon_mods.json и
  // восстанавливаются тем же конвейером.
  weaponMods: [...moduleWeaponMods, ...robotWeaponModsJson],
  // Моды оружия роботов (290) отдельным списком. Слоты — ПРОИЗВОДНЫЕ от
  // самих модов (slot + applies_to_ids, патч 306): их собирает экранный
  // каталог (i18n/equipmentCatalog), файл-дубль удалён.
  robotWeaponMods: robotWeaponModsJson,
  // Слои защиты плоским списком; принадлежность слою — в поле layer.
  armorLayers: [
    ...(robotArmorJson.armor || []),
    ...(robotArmorPlatingJson.plating || []),
    ...(robotFramesJson.frames || []),
  ],
});

export function getRobotLimbCatalog() {
  return ROBOT_LIMB_CATALOG;
}

/**
 * Словарь имён ориджинов для локали (база + модуль).
 * Формат: { [originId]: string }
 */
export function getOriginI18n(locale) {
  return requireModuleLocale(locale) === 'en-EN' ? moduleEnOriginsI18n : moduleRuOriginsI18n;
}

/**
 * Словарь трейтов для локали (база + модуль, deep merge).
 * Формат: { traits: { [originKey]: { [traitKey]: { name, description } } } }
 */
export function getTraitI18n(locale) {
  return requireModuleLocale(locale) === 'en-EN' ? moduleEnTraitsI18n : moduleRuTraitsI18n;
}

/**
 * Оружие модуля (самодостаточно, патч 102): полный список сеттинга,
 * варианты (trueItemId) разворачиваются внутри самого модуля — чтения
 * движковой базы data/ нет.
 */
export function getModuleWeapons() {
  return expandTrueItems(moduleWeapons, moduleWeapons);
}

/**
 * Дополнительные предметы модуля (general goods / misc).
 */
export function getModuleGeneralGoods() {
  return moduleGeneralGoods;
}

/**
 * Комплекты модуля: { [kitId]: { items } }.
 */
/** Силовая броня: множества и части (id, прочность, зоны защиты). Экраны — через этот геттер, не по путям данных (292). */
export function getPowerArmorData() {
  return SETTING.data.equipment.powerArmor;
}

export function getModuleEquipmentKits() {
  return moduleEquipmentKits;
}

/**
 * Логика сеттинга (МК-3, патч 316): формулы производных параметров
 * (инициатива, защита, бонус ближнего боя, макс. ОЗ, грузоподъёмность,
 * сборка calculateDerivedStats). Движку — только сюда, прямые импорты
 * из modules/fallout/logic/* в src/store/** запрещены (тест границы).
 */
export function getDerivedStatsLogic() {
  return SETTING.logic.derivedStats;
}

/**
 * Рецепты крафта, собранные из файлов категории по индексу (порядок — как в
 * index.json). Собирается один раз; consumers обязаны относиться к записи как
 * к неизменяемой (движок механики ничего не пишет в данные).
 */
const CRAFTING_RECIPES = (() => {
  const byId = new Map();
  const list = [];
  for (const entry of moduleCraftingIndex.recipes ?? []) {
    const rows = CRAFTING_FILES[entry.file] ?? [];
    for (const recipe of rows) {
      if (byId.has(recipe.id)) {
        throw new Error(`[registry] Дубликат id рецепта крафта: ${recipe.id}`);
      }
      // Категория (еда, препараты, …) — свойство раздела, в которомrecipe лежит
      // (реестр знает файлы; сам рецепт о категориях не сообщает).
      const augmented = Object.freeze({ ...recipe, category: entry.category });
      byId.set(recipe.id, augmented);
      list.push(augmented);
    }
    if (rows.length !== entry.count) {
      throw new Error(`[registry] Индекс крафта не совпадает с файлом ${entry.file}: ${entry.count} vs ${rows.length}`);
    }
  }
  return Object.freeze({ list: Object.freeze(list), byId });
})();

export function getCraftingRecipes() {
  return CRAFTING_RECIPES.list;
}

export function getCraftingRecipeById(recipeId) {
  return CRAFTING_RECIPES.byId.get(recipeId) ?? null;
}

/** Категории рецептов — порядок и состав манифеста (file → category). */
export function getCraftingCategories() {
  return (moduleCraftingIndex.recipes ?? []).map((entry) => entry.category);
}

/**
 * Параметры категории крафта из единого манифеста рецептов. Здесь живут
 * правила раздела, а не в отдельных рецептах: например, при каких навыках
 * материалы сгорают после неудачной проверки. Возвращаем неизменяемую копию,
 * чтобы механика не могла испортить данные реестра.
 */
export function getCraftingCategoryRules(category) {
  const entry = (moduleCraftingIndex.recipes ?? []).find((item) => item.category === category);
  if (!entry) return null;
  return Object.freeze({ ...(moduleCraftingCategoryRules[entry.category] ?? {}) });
}

/** Все правила категорий для проверок целостности и будущего UI. */
export function getCraftingCategoryRuleRegistry() {
  return Object.freeze(Object.fromEntries((moduleCraftingIndex.recipes ?? []).map((entry) => [
    entry.category,
    getCraftingCategoryRules(entry.category),
  ])));
}

/** Каталог хлама (предметы разбора; составы — отдельным справочником). */
export function getScrapJunkItems() {
  return moduleScrapJunk;
}

/** Справочник материалов: пачковые + именованные (id = слаг имени). */
export function getScrapMaterials() {
  return moduleScrapMaterials;
}

/** Подписи d20-таблиц разбора — словарь i18n (269: данные молчат). */
export function getScrapTableLabels(locale) {
  return (SETTING.names[locale] ?? SETTING.names['ru-RU']).junk.tableLabels;
}

/**
 * Печатный состав разбора предмета. Единый источник (реформа 2026-09-17):
 * карточка предмета и есть носитель состава — у хлама это запись junk.json,
 * у линкованных предметов каталога (радио) — их собственная запись. Реестр
 * собирает индекс обходом карточек; отдельного файла составов нет.
 */
const SALVAGE_COMPOSITIONS = (() => {
  const byId = new Map();
  const collect = (node) => {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && Array.isArray(node.composition)) {
      if (byId.has(node.id)) {
        throw new Error(`[registry] Двойной состав разбора для ${node.id}`);
      }
      byId.set(node.id, { options: node.composition });
    }
    Object.values(node).forEach(collect);
  };
  collect(moduleScrapJunk);
  collect(moduleGeneralGoods);
  return byId;
})();

export function getSalvageComposition(itemId) {
  return SALVAGE_COMPOSITIONS.get(itemId) ?? null;
}

/** Таблицы разбора для ГМ-секции: d20 категорий, девять таблиц, добыча. */
export function getScrapTables() {
  return moduleScrapTables;
}

/**
 * Полный i18n-словарь модуля для локали. Собирается из файлов по категориям
 * (modules/fallout/i18n/<locale>/data/...): origins, traits, equipmentKits,
 * uniqQualities, weapons, clothes, generalGoods, weaponMods, food, drinks.
 */
export function getModuleI18n(locale) {
  const isEn = requireModuleLocale(locale) === 'en-EN';
  return {
    origins: isEn ? moduleEnOriginsI18n : moduleRuOriginsI18n,
    traits: isEn ? moduleEnTraitsI18n : moduleRuTraitsI18n,
    equipmentKits: isEn ? moduleEnEquipmentKitsI18n : moduleRuEquipmentKitsI18n,
    uniqQualities: isEn ? moduleEnUniqQualitiesI18n : moduleRuUniqQualitiesI18n,
    weapons: isEn ? moduleEnWeaponsI18n : moduleRuWeaponsI18n,
    clothes: isEn ? moduleEnClothesI18n : moduleRuClothesI18n,
    generalGoods: isEn ? moduleEnGeneralGoodsI18n : moduleRuGeneralGoodsI18n,
    weaponMods: isEn ? moduleEnWeaponModsI18n : moduleRuWeaponModsI18n,
    food: isEn ? moduleEnFoodI18n : moduleRuFoodI18n,
    drinks: isEn ? moduleEnDrinksI18n : moduleRuDrinksI18n,
    settings: isEn ? moduleEnSettingsI18n : moduleRuSettingsI18n,
  };
}

/**
 * Уникальные качества (uniq qualities): навешиваемые на экипировку
 * модификаторы (имя + эффекты). База + модуль (модуль перекрывает по id).
 * Сейчас каталог пустой — определения добавляет владелец в модуль.
 */
export function getUniqQualities() {
  return moduleUniqQualities;
}

/**
 * Имя уникального качества из i18n модуля по id (для локали).
 * Пустая строка — имя не задано (качество есть, но имени нет).
 */
export function getUniqQualityName(id, locale = getCurrentModuleLocale()) {
  if (!id) return '';
  const i18n = requireModuleLocale(locale) === 'en-EN'
    ? moduleEnUniqQualitiesI18n
    : moduleRuUniqQualitiesI18n;
  const entry = (i18n || []).find((q) => q?.id === id);
  return entry?.name || '';
}

/**
 * Каталог снаряжения (оружие/броня/комплекты/i18n).
 */
export function getEquipmentCatalogForLocale(locale) {
  return getEquipmentCatalog(locale);
}

/**
 * Canonical real-time scene risk rules declared by the active setting.
 * Consumables opt into these rules through explicit sceneRiskEvents metadata.
 */
export function getSceneRiskRules() {
  return [moduleDiseaseExposureRule];
}

/** Localized condition catalog supplied by the active setting. */
export function getConditionCatalog(conditionType, locale = getCurrentModuleLocale()) {
  if (conditionType === 'disease') return getDiseasesCatalog(locale);
  throw new Error(`[registry] Неизвестный тип состояния "${conditionType}"`);
}
