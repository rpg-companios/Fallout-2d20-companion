// Locale-specific display data (names, descriptions, flavour text)
// Дверь сеттинга (292): каталог отображения читает данные Fallout только через
// modules/fallout/index.js; привязки — карта «локальное имя → путь SETTING».
import { SETTING } from '../modules/fallout/index.js';
const moduleRuRobotWeaponsI18n = SETTING.names['ru-RU'].equipment.robot.weapons;
const moduleRuRobotArmsI18n = SETTING.names['ru-RU'].equipment.robot.arms;
const moduleRuRobotArmorI18n = SETTING.names['ru-RU'].equipment.robot.armor;
const moduleRuRobotPlatingI18n = SETTING.names['ru-RU'].equipment.robot.plating;
const moduleRuRobotFramesI18n = SETTING.names['ru-RU'].equipment.robot.frames;
const moduleRuRobotModulesI18n = SETTING.names['ru-RU'].equipment.robot.modules;
const moduleRuRobotItemsI18n = SETTING.names['ru-RU'].equipment.robot.items;
const moduleRuRobotBodyI18n = SETTING.names['ru-RU'].equipment.robot.body;
const moduleRuRobotHeadsI18n = SETTING.names['ru-RU'].equipment.robot.heads;
const moduleRuRobotLegsI18n = SETTING.names['ru-RU'].equipment.robot.legs;
const moduleRuRobotWeaponModsI18n = SETTING.names['ru-RU'].equipment.robot.weaponMods;
const moduleEnRobotWeaponsI18n = SETTING.names['en-EN'].equipment.robot.weapons;
const moduleEnRobotArmsI18n = SETTING.names['en-EN'].equipment.robot.arms;
const moduleEnRobotArmorI18n = SETTING.names['en-EN'].equipment.robot.armor;
const moduleEnRobotPlatingI18n = SETTING.names['en-EN'].equipment.robot.plating;
const moduleEnRobotFramesI18n = SETTING.names['en-EN'].equipment.robot.frames;
const moduleEnRobotModulesI18n = SETTING.names['en-EN'].equipment.robot.modules;
const moduleEnRobotWeaponModsI18n = SETTING.names['en-EN'].equipment.robot.weaponMods;
const moduleEnRobotItemsI18n = SETTING.names['en-EN'].equipment.robot.items;
const moduleEnRobotBodyI18n = SETTING.names['en-EN'].equipment.robot.body;
const moduleEnRobotHeadsI18n = SETTING.names['en-EN'].equipment.robot.heads;
const moduleEnRobotLegsI18n = SETTING.names['en-EN'].equipment.robot.legs;
const moduleWeapons = SETTING.data.equipment.weapons;
const moduleGeneralGoods = SETTING.data.equipment.generalGoods;
const moduleEquipmentKits = SETTING.data.equipmentKits;
const moduleRuOriginsI18n = SETTING.names['ru-RU'].system.origins;
const moduleEnOriginsI18n = SETTING.names['en-EN'].system.origins;
const moduleRuTraitsI18n = SETTING.names['ru-RU'].system.traits;
const moduleEnTraitsI18n = SETTING.names['en-EN'].system.traits;
const moduleRuEquipmentKitsI18n = SETTING.names['ru-RU'].system.equipmentKits;
const moduleEnEquipmentKitsI18n = SETTING.names['en-EN'].system.equipmentKits;
const moduleRuArmorI18n = SETTING.names['ru-RU'].equipment.armor.sets;
const moduleEnArmorI18n = SETTING.names['en-EN'].equipment.armor.sets;
const moduleRuPowerArmorI18n = SETTING.names['ru-RU'].equipment.armor.powerArmor;
const moduleEnPowerArmorI18n = SETTING.names['en-EN'].equipment.armor.powerArmor;
const moduleRuOdditiesI18n = SETTING.names['ru-RU'].equipment.oddities;
const moduleEnOdditiesI18n = SETTING.names['en-EN'].equipment.oddities;
const moduleRuItemsI18n = SETTING.names['ru-RU'].equipment.items;
const moduleEnItemsI18n = SETTING.names['en-EN'].equipment.items;
const moduleRuQualitiesI18n = SETTING.names['ru-RU'].system.qualities;
const moduleEnQualitiesI18n = SETTING.names['en-EN'].system.qualities;
const moduleRuEffectsI18n = SETTING.names['ru-RU'].system.effects;
const moduleEnEffectsI18n = SETTING.names['en-EN'].system.effects;
const moduleRuDamageEffectsI18n = SETTING.names['ru-RU'].system.damageEffects;
const moduleEnDamageEffectsI18n = SETTING.names['en-EN'].system.damageEffects;
const moduleRuAmmoI18n = SETTING.names['ru-RU'].equipment.ammoTypes;
const moduleEnAmmoI18n = SETTING.names['en-EN'].equipment.ammoTypes;
const moduleRuArmorModsI18n = SETTING.names['ru-RU'].equipment.armor.mods;
const moduleEnArmorModsI18n = SETTING.names['en-EN'].equipment.armor.mods;
const moduleRuUniqArmorModsI18n = SETTING.names['ru-RU'].equipment.armor.uniqMods;
const moduleEnUniqArmorModsI18n = SETTING.names['en-EN'].equipment.armor.uniqMods;
const moduleRuArmorEffectsI18n = SETTING.names['ru-RU'].equipment.armor.effects;
const moduleEnArmorEffectsI18n = SETTING.names['en-EN'].equipment.armor.effects;
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
const moduleRuChemsI18n = SETTING.names['ru-RU'].consumables.chems;
const moduleEnChemsI18n = SETTING.names['en-EN'].consumables.chems;
const moduleRuMagazinesI18n = SETTING.names['ru-RU'].consumables.magazines;
const moduleEnMagazinesI18n = SETTING.names['en-EN'].consumables.magazines;
const moduleArmor = SETTING.data.equipment.armor;
const modulePowerArmor = SETTING.data.equipment.powerArmor;
const moduleOddities = SETTING.data.equipment.oddities;
const moduleAmmo = SETTING.data.equipment.ammo;
const moduleArmorMods = SETTING.data.equipment.armorMods;
const moduleUniqArmorMods = SETTING.data.equipment.uniqArmorMods;
const moduleArmorEffects = SETTING.data.equipment.armorEffects;
const moduleClothesData = SETTING.data.equipment.clothes;
const moduleFood = SETTING.data.consumables.food;
const moduleDrinks = SETTING.data.consumables.drinks;
const moduleChems = SETTING.data.consumables.chems;
const moduleMagazines = SETTING.data.consumables.magazines;
const moduleWeaponMods = SETTING.data.equipment.weaponMods;
const moduleRobotWeaponMods = SETTING.data.equipment.robot.weaponMods;
const moduleRobotParts = SETTING.data.equipment.robotParts;
const moduleWeaponModSlots = SETTING.data.equipment.weaponModSlots;
const moduleRobotLimbs = SETTING.data.equipment.robot.limbs;
const moduleRobotWeaponAsLimb = SETTING.data.equipment.robot.weaponAsLimb;
const moduleRobotArmor = SETTING.data.equipment.robot.armor;
const moduleRobotPlating = SETTING.data.equipment.robot.armorPlating;
const moduleRobotFrames = SETTING.data.equipment.robot.frames;
const moduleRobotWeapons = SETTING.data.equipment.robot.weapons;

import { getCurrentModuleLocale } from './locale';
import { expandTrueItems } from '../domain/packMerge';

/**
 * i18n-словари модуля сеттинга, собранные из файлов по категориям.
 * Форма объекта совпадает с прежним единым файлом modules/fallout/i18n/<locale>.json.
 */
const moduleRuI18n = {
  armor: moduleRuArmorI18n,
  powerArmor: moduleRuPowerArmorI18n,
  ammoTypes: moduleRuAmmoI18n,
  miscellaneous: moduleRuItemsI18n,
  qualities: moduleRuQualitiesI18n,
  effects: moduleRuEffectsI18n,
  damageEffects: moduleRuDamageEffectsI18n,
  oddities: moduleRuOdditiesI18n,
  armorMods: moduleRuArmorModsI18n,
  uniqArmorMods: moduleRuUniqArmorModsI18n,
  armorEffects: moduleRuArmorEffectsI18n,
  origins: moduleRuOriginsI18n,
  traits: moduleRuTraitsI18n,
  equipmentKits: moduleRuEquipmentKitsI18n,
  weapons: moduleRuWeaponsI18n,
  clothes: moduleRuClothesI18n,
  generalGoods: moduleRuGeneralGoodsI18n,
  weaponMods: moduleRuWeaponModsI18n,
  robotWeaponMods: moduleRuRobotWeaponModsI18n,
  food: moduleRuFoodI18n,
  drinks: moduleRuDrinksI18n,
  chems: moduleRuChemsI18n,
  magazines: moduleRuMagazinesI18n,
  junk: SETTING.names['ru-RU'].junk.items,
  materials: SETTING.names['ru-RU'].junk.materials,
};

const moduleEnI18n = {
  armor: moduleEnArmorI18n,
  powerArmor: moduleEnPowerArmorI18n,
  ammoTypes: moduleEnAmmoI18n,
  miscellaneous: moduleEnItemsI18n,
  qualities: moduleEnQualitiesI18n,
  effects: moduleEnEffectsI18n,
  damageEffects: moduleEnDamageEffectsI18n,
  oddities: moduleEnOdditiesI18n,
  armorMods: moduleEnArmorModsI18n,
  uniqArmorMods: moduleEnUniqArmorModsI18n,
  armorEffects: moduleEnArmorEffectsI18n,
  origins: moduleEnOriginsI18n,
  traits: moduleEnTraitsI18n,
  equipmentKits: moduleEnEquipmentKitsI18n,
  weapons: moduleEnWeaponsI18n,
  clothes: moduleEnClothesI18n,
  generalGoods: moduleEnGeneralGoodsI18n,
  weaponMods: moduleEnWeaponModsI18n,
  robotWeaponMods: moduleEnRobotWeaponModsI18n,
  food: moduleEnFoodI18n,
  drinks: moduleEnDrinksI18n,
  chems: moduleEnChemsI18n,
  magazines: moduleEnMagazinesI18n,
  junk: SETTING.names['en-EN'].junk.items,
  materials: SETTING.names['en-EN'].junk.materials,
};

const ALL_KIT_DATA = {
  ...moduleEquipmentKits,
};

const EQUIPMENT_BY_LOCALE = {
  'ru-RU': {
    robotWeapons: moduleRuRobotWeaponsI18n,
    robotArms: moduleRuRobotArmsI18n,
    robotArmor: moduleRuRobotArmorI18n,
    robotPlating: moduleRuRobotPlatingI18n,
    robotFrames: moduleRuRobotFramesI18n,
    robotModules: moduleRuRobotModulesI18n,
    robotItems: moduleRuRobotItemsI18n,
    robotBody: moduleRuRobotBodyI18n,
    robotHeads: moduleRuRobotHeadsI18n,
    robotLegs: moduleRuRobotLegsI18n,
  },
  'en-EN': {
    robotWeapons: moduleEnRobotWeaponsI18n,
    robotArms: moduleEnRobotArmsI18n,
    robotArmor: moduleEnRobotArmorI18n,
    robotPlating: moduleEnRobotPlatingI18n,
    robotFrames: moduleEnRobotFramesI18n,
    robotModules: moduleEnRobotModulesI18n,
    robotItems: moduleEnRobotItemsI18n,
    robotBody: moduleEnRobotBodyI18n,
    robotHeads: moduleEnRobotHeadsI18n,
    robotLegs: moduleEnRobotLegsI18n,
  },
};

/**
 * Merges two arrays by `id`, with i18n fields (name, etc.) overlaid on data fields.
 * Строгий контракт: у каждой позиции данных обязан быть локализованный name —
 * иначе это дефект данных и каталог строится только с ошибкой (никаких фолбэков на id).
 */
export const mergeById = (dataArr, i18nArr) => {
  const i18nMap = new Map((i18nArr || []).map((item) => [item.id, item]));
  return (dataArr || []).map((dataItem) => {
    const i18nItem = i18nMap.get(dataItem.id);
    if (!i18nItem?.name) {
      throw new Error(`[equipmentCatalog] Missing i18n name for id: ${dataItem.id}`);
    }
    return { ...dataItem, ...i18nItem, name: i18nItem.name };
  });
};

// Локализация бронемода содержит описания specialEffects с теми же id,
// а механические value/type находятся в data. Обычный верхнеуровневый spread
// заменял весь массив локализованной версией и терял механику. Объединяем
// вложенные записи строго по id: data задаёт состав и значения, i18n — текст.
const mergeArmorModsById = (dataArr, i18nArr) => {
  const localizedByModId = new Map((i18nArr || []).map((item) => [item.id, item]));
  return (dataArr || []).map((dataItem) => {
    const i18nItem = localizedByModId.get(dataItem.id);
    if (!i18nItem?.name) {
      throw new Error(`[equipmentCatalog] Missing armor mod i18n name for id: ${dataItem.id}`);
    }
    const localizedEffects = new Map(
      (i18nItem.specialEffects || []).map((effect) => [effect.id, effect]),
    );
    const specialEffects = (dataItem.specialEffects || []).map((effect) => {
      const description = localizedEffects.get(effect.id)?.description;
      return {
        ...effect,
        ...(typeof description === 'string' ? { description } : {}),
      };
    });
    return {
      ...dataItem,
      name: i18nItem.name,
      specialEffects,
    };
  });
};

const mergeAmmoById = (dataArr, i18nArr) => {
  const i18nMap = new Map((i18nArr || []).map((item) => [item.id, item]));
  return (dataArr || []).map((dataItem) => {
    const i18nItem = i18nMap.get(dataItem.id);
    if (!i18nItem?.name) {
      throw new Error(`[equipmentCatalog] Missing ammo i18n name for id: ${dataItem.id}`);
    }
    return {
      ...dataItem,
      ...i18nItem,
      id: dataItem.id,
      name: i18nItem.name,
      itemType: 'ammo',
      type: 'ammo',
    };
  });
};

/**
 * Flattens armor groups array into a single list of items.
 * Expects {armor: [{type, categoryKey, items}]} format.
 */
const flattenArmorGroups = (armorData) =>
  (armorData?.armor || []).flatMap((group) =>
    (group.items || []).map((item) => ({ ...item, armorCategoryKey: item.armorCategoryKey || group.categoryKey })),
  );

/**
 * Builds a Map index of armor items by id.
 */
const buildArmorIndex = (items) => {
  const byId = new Map();
  items.forEach((item) => { if (item.id) byId.set(item.id, item); });
  return { byId };
};

// Проекция типа конечности в привычное экранам имя: витрина, инвентарь и
// модалки исторически различают конечности по itemType (robotArm, robotHead…).
// Данные пишут limbType — это единственный источник, имя для экрана считается здесь.
const LIMB_ITEM_TYPE_BY_LIMB_TYPE = Object.freeze({
  arm: 'robotArm',
  head: 'robotHead',
  body: 'robotBody',
  mover: 'robotLeg',
});

export const getEquipmentCatalog = (locale = getCurrentModuleLocale()) => {
  const i18n = EQUIPMENT_BY_LOCALE[locale];
  if (!i18n) {
    throw new Error(`[equipmentCatalog] Для языка сеттинга "${locale}" нет каталога`);
  }

  // Weapons: механика и имена — из модуля сеттинга (патч 102).
  // Оружие в модуле самодостаточно: варианты (trueItemId) ссылаются на
  // полные записи в том же файле. Базой для разворачивания служит сам
  // локализованный список модуля — чтения data/ нет.
  const moduleI18n = locale === 'en-EN' ? moduleEnI18n : moduleRuI18n;
  const moduleWeaponsLocalized = mergeById(moduleWeapons || [], moduleI18n.weapons || []);
  // replaceOriginalNameTo: имя берётся из i18n-словаря по указанному ключу
  // (у бритвы — weapon_straight_razor → «Опасная бритва»).
  const weaponNameByKey = new Map(
    (moduleI18n.weapons || [])
      .filter((e) => e?.id && e?.name)
      .map((e) => [e.id, e.name]),
  );
  const weapons = expandTrueItems(moduleWeaponsLocalized, moduleWeaponsLocalized)
    .map((w) => {
      const renameKey = w?.modifiers?.replaceOriginalNameTo;
      if (renameKey && weaponNameByKey.has(renameKey)) {
        return { ...w, name: weaponNameByKey.get(renameKey) };
      }
      return w;
    })
    .map((w) => ({ ...w, itemType: 'weapon' }));
  const robotWeapons = mergeById(
    (moduleRobotWeapons || []).filter((item) => item.itemType === 'weapon'),
    i18n.robotWeapons || [],
  )
    .map((w) => ({ ...w, itemType: 'weapon', isRobotWeapon: true }));
  // Конечности робота: источник один — limbs.json + weaponAsLimb.json.
  // «Руки/головы/корпуса/движители» для экранов — проекция по limbType,
  // а не четыре разных файла данных.
  const robotLimbsI18n = [
    ...(i18n.robotArms || []),
    ...(i18n.robotHeads || []),
    ...(i18n.robotBody || []),
    ...(i18n.robotLegs || []),
    ...(i18n.robotWeapons || []),
  ].filter((item, index, arr) => item?.id && arr.findIndex((x) => x?.id === item.id) === index);
  const robotLimbs = mergeById(
    [...(moduleRobotLimbs || []), ...(moduleRobotWeaponAsLimb || [])],
    robotLimbsI18n,
  ).map((limb) => ({ ...limb, itemType: LIMB_ITEM_TYPE_BY_LIMB_TYPE[limb.limbType] ?? limb.itemType }));
  const limbsOfType = (limbType) => robotLimbs.filter((limb) => limb.limbType === limbType);
  const robotArms = limbsOfType('arm').map((arm) => ({ ...arm, isRobotArm: true }));
  const allWeapons = [...weapons, ...robotWeapons];

  // Robot plating and armor: merge data stats with i18n names, add to armorIndex
  const robotPlatingList = mergeById(moduleRobotPlating.plating || [], i18n.robotPlating || [])
    .map((item) => ({ ...item, itemType: 'plating' }));
  const robotArmorList = mergeById(moduleRobotArmor.armor || [], i18n.robotArmor || [])
    .map((item) => ({ ...item, itemType: 'robotArmor' }));
  const robotFramesList = mergeById(moduleRobotFrames.frames || [], i18n.robotFrames || [])
    .map((item) => ({ ...item, itemType: 'robotFrame' }));

  // Armor: i18n file has {armor:[{type, categoryKey, items}]}, data file has allowedModCategories per categoryKey
  // Броня: единый источник механики — data/equipment/armor.json (как у
  // weapons/clothes/powerArmor). i18n-файл несёт только отображаемые поля
  // (type группы, name предмета). Тощая i18n-запись (как ранее en-EN) больше
  // не даёт «молчаливую» неэкипируемую броню — protectedAreas всегда из data.
  const armorPiecesByCategory = Object.fromEntries(
    Object.entries(moduleArmor || {}).map(([categoryKey, category]) => [
      categoryKey,
      Object.values(category?.tiers || {}).flatMap((tier) => tier?.pieces || []),
    ]),
  );
  const armorGroups = (moduleI18n.armor?.armor || []).map((g) => ({
    ...g,
    items: mergeById(armorPiecesByCategory[g.categoryKey], g.items)
      .map((item) => ({ ...item, armorCategoryKey: g.categoryKey })),
  }));
  const armorList = flattenArmorGroups({ armor: armorGroups });
  const armorIndex = buildArmorIndex([...armorList, ...robotPlatingList, ...robotArmorList, ...robotFramesList]);

  // Power armor: i18n file carries group titles/item names ({powerArmor:[{categoryKey,type,items}]}),
  // data file carries mechanics per set ({<setKey>:{pieces:[...]}}).
  const powerArmorGroups = (moduleI18n.powerArmor?.powerArmor || []).map((group) => {
    const statsById = Object.fromEntries(
      (modulePowerArmor[group.categoryKey]?.pieces || []).map((piece) => [piece.id, piece]),
    );
    return {
      ...group,
      items: (group.items || []).map((item) => ({
        ...statsById[item.id],
        ...item,
        powerArmorSetKey: group.categoryKey,
      })),
    };
  });
  const powerArmorList = powerArmorGroups.flatMap((group) => group.items);

  // Clothes: механика и имена — из модуля сеттинга (патч 112).
  const moduleI18nClothesMap = Object.fromEntries(
    (moduleI18n.clothes?.clothes || []).flatMap((g) => (g.items || []).map((item) => [item.id, item]))
  );
  const clothes = (moduleClothesData?.clothes || []).map((group) => ({
    ...group,
    type: (moduleI18n.clothes?.clothes || []).find((g) => g.clothingType === group.clothingType)?.type || group.type,
    items: (group.items || []).map((dataItem) => {
      const i18nItem = moduleI18nClothesMap[dataItem.id];
      if (!i18nItem?.name) {
        throw new Error(`[equipmentCatalog] Missing module clothes i18n name for id: ${dataItem.id}`);
      }
      return { ...dataItem, ...i18nItem, name: i18nItem.name };
    }),
  }));
  const allClothesGroups = [...clothes];

  // Consumables
  const mergedAmmo = mergeAmmoById(moduleAmmo, moduleI18n.ammoTypes);
  const mergedQualities = moduleI18n.qualities || [];
  const mergedEffects = moduleI18n.effects || {};
  const mergedDamageEffects = moduleI18n.damageEffects || [];
  const mergedChems = mergeById(moduleChems, moduleI18n.chems);
  const mergedDrinks = mergeById(moduleDrinks, moduleI18n.drinks);
  const mergedFood = mergeById(moduleFood, moduleI18n.food);
  const mergedMagazines = mergeById(moduleMagazines, moduleI18n.magazines);
  const moduleGeneralGoodsLocalized = mergeById(moduleGeneralGoods || [], moduleI18n.generalGoods || []);
  const mergedGeneralGoods = [...moduleGeneralGoodsLocalized];
  // Разбор (260): хлам и материалы — те же правила сборки, что у остальных
  // каталогов: данные задают механику, i18n — имя; отсутствие имени — падение.
  const mergedJunk = mergeById(SETTING.data.junk.items, moduleI18n.junk);
  const mergedScrapMaterials = mergeById(SETTING.data.junk.materials, moduleI18n.materials);

  const mergedOddities = mergeById(moduleOddities, moduleI18n.oddities || []);
  const mergedRobotBody = limbsOfType('body');
  const mergedRobotHeads = limbsOfType('head');
  const mergedRobotLegs = limbsOfType('mover');
  const mergedWeaponMods = mergeById(moduleWeaponMods, moduleI18n.weaponMods);
  const mergedRobotWeaponMods = mergeById(moduleRobotWeaponMods, moduleI18n.robotWeaponMods);
  // Слоты модов робо-оружия — ПРОИЗВОДНЫЕ от самих модов (слово владельца,
  // патч 306): мод заявляет слот (slot) и применимость (applies_to_ids);
  // отдельный файл-дубль robot/weapon_mod_slots.json удалён. Порядок модов
  // в слоте — порядок записей в данных.
  const robotWeaponModSlots = {};
  for (const mod of mergedRobotWeaponMods) {
    if (!mod.slot) continue;
    for (const weaponId of mod.applies_to_ids || []) {
      (robotWeaponModSlots[weaponId] ??= {});
      (robotWeaponModSlots[weaponId][mod.slot] ??= []).push(mod.id);
    }
  }
  const mergedArmorMods = mergeArmorModsById(moduleArmorMods, moduleI18n.armorMods);
  const mergedUniqArmorMods = mergeArmorModsById(moduleUniqArmorMods, moduleI18n.uniqArmorMods);

  // Equipment kits: merge locale-independent items with i18n names
  const kitNames = { ...(i18n.equipmentKits || {}), ...(moduleI18n.equipmentKits || {}) };
  const equipmentKits = Object.fromEntries(
    Object.entries(ALL_KIT_DATA).map(([kitId, kitData]) => {
      const name = kitNames[kitId]?.name;
      if (!name) {
        throw new Error(`[equipmentCatalog] Missing equipment kit i18n name for id: ${kitId}`);
      }
      return [kitId, { name, ...kitData }];
    })
  );

  const armorEffects = Object.fromEntries(
    Object.entries(moduleArmorEffects || {}).map(([effectId, effect]) => {
      const description = moduleI18n.armorEffects?.[effectId]?.description;
      return [effectId, {
        ...effect,
        ...(typeof description === 'string' ? { description } : {}),
      }];
    }),
  );

  return {
    ...i18n,
    weapons: allWeapons,
    // armorRaw keyed by categoryKey for ArmorModificationModal allowedModCategories lookup
    armorRaw: moduleArmor,
    armor: { armor: armorGroups },
    armorList,
    armorIndex,
    powerArmor: { powerArmor: powerArmorGroups },
    powerArmorList,
    powerArmorRaw: modulePowerArmor,
    clothes: { clothes: allClothesGroups },
    ammoTypes: mergedAmmo,
    qualities: mergedQualities,
    effects: mergedEffects,
    damageEffects: mergedDamageEffects,
    miscellaneous: moduleI18n.miscellaneous || [],
    chems: mergedChems,
    drinks: mergedDrinks,
    food: mergedFood,
    magazines: mergedMagazines,
    generalGoods: mergedGeneralGoods,
    junk: mergedJunk,
    materials: mergedScrapMaterials,
    oddities: mergedOddities,
    // Пул weaponMods включает и моды оружия роботов (290): экранный каталог —
    // источник для enrichWeaponItem (карточки оружия на экране снаряжения), и
    // конденсаторы Головного лазера Штурмотрона обязаны находиться в том же
    // пуле, что и в реестре конечностей (ROBOT_LIMB_CATALOG.weaponMods).
    // Без этого установленный мод молча терялся: урон карточки возвращался
    // к базе, хотя превью модалки и план списания зарядов мод видели.
    weaponMods: [...mergedWeaponMods, ...mergedRobotWeaponMods],
    robotWeaponMods: mergedRobotWeaponMods,
    robotWeaponModSlots,
    armorMods: mergedArmorMods,
    uniqArmorMods: mergedUniqArmorMods,
    modsOverrides: moduleWeaponModSlots,
    armorEffects,
    robotWeaponsOnly: robotWeapons,
    robotArms,
    robotPlating: robotPlatingList,
    robotArmorLayer: robotArmorList,
    robotFrames: robotFramesList,
    robotModules: mergeById(moduleRobotParts.robotModules || [], i18n.robotModules || []).map((m) => ({ ...m, itemType: 'module' })),
    robotItems: Array.isArray(i18n.robotItems) ? i18n.robotItems : [],
    robotBody: mergedRobotBody,
    robotHeads: mergedRobotHeads,
    robotLegs: mergedRobotLegs,
    equipmentKits,
  };
};

/**
 * Returns locale-independent technical equipment data from data/equipment/.
 * Use this when you need game mechanics data without display strings.
 */
export const getEquipmentData = () => ({
  weapons: moduleWeapons,
  armor: moduleArmor,
  weaponMods: moduleWeaponMods,
  robotWeaponMods: moduleRobotWeaponMods,
  armorMods: moduleArmorMods,
  uniqArmorMods: moduleUniqArmorMods,
  ammo: moduleAmmo,
  robotItems: moduleRobotParts.robotItems,
  robotModules: moduleRobotParts.robotModules,
  robotLimbs: [...moduleRobotLimbs, ...moduleRobotWeaponAsLimb],
});
