// Fallout-owned equipment catalog projection. Data and localized names are
// read from the active package only when requested.
import { getActiveSettingRuntime } from '../../../src/engine/settings/activeSettingRuntime.js';
import { getCurrentModuleLocale } from '../../../i18n/locale.js';
import { buildUserEquipmentOverlay } from '../../../domain/userEquipment.js';
import { getActiveModuleId } from '../../../domain/moduleLocale.js';
import useUserEquipmentStore from '../../../src/store/userEquipmentStore.js';

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

const expandCatalogItems = (entries = [], baseEntries = []) => {
  const expand = getActiveSettingRuntime()?.services?.inventory?.expandCatalogItems;
  return typeof expand === 'function' ? expand(entries, baseEntries) : entries;
};

const EMPTY_EQUIPMENT_CATALOG = Object.freeze({
  weapons: EMPTY_ARRAY,
  armor: Object.freeze({ armor: EMPTY_ARRAY }),
  armorList: EMPTY_ARRAY,
  armorIndex: Object.freeze({ byId: new Map() }),
  armorRaw: EMPTY_OBJECT,
  powerArmor: Object.freeze({ powerArmor: EMPTY_ARRAY }),
  powerArmorList: EMPTY_ARRAY,
  powerArmorRaw: EMPTY_OBJECT,
  clothes: Object.freeze({ clothes: EMPTY_ARRAY }),
  ammoTypes: EMPTY_ARRAY,
  qualities: EMPTY_ARRAY,
  effects: EMPTY_OBJECT,
  damageEffects: EMPTY_ARRAY,
  miscellaneous: EMPTY_ARRAY,
  chems: EMPTY_ARRAY,
  drinks: EMPTY_ARRAY,
  food: EMPTY_ARRAY,
  magazines: EMPTY_ARRAY,
  generalGoods: EMPTY_ARRAY,
  junk: EMPTY_ARRAY,
  materials: EMPTY_ARRAY,
  oddities: EMPTY_ARRAY,
  weaponMods: EMPTY_ARRAY,
  robotWeaponMods: EMPTY_ARRAY,
  robotWeaponModSlots: EMPTY_OBJECT,
  armorMods: EMPTY_ARRAY,
  uniqArmorMods: EMPTY_ARRAY,
  modsOverrides: EMPTY_OBJECT,
  armorEffects: EMPTY_OBJECT,
  robotWeaponsOnly: EMPTY_ARRAY,
  robotArms: EMPTY_ARRAY,
  robotPlating: EMPTY_ARRAY,
  robotArmorLayer: EMPTY_ARRAY,
  robotFrames: EMPTY_ARRAY,
  robotModules: EMPTY_ARRAY,
  robotItems: EMPTY_ARRAY,
  robotBody: EMPTY_ARRAY,
  robotHeads: EMPTY_ARRAY,
  robotLegs: EMPTY_ARRAY,
  equipmentKits: EMPTY_OBJECT,
});

const EMPTY_EQUIPMENT_DATA = Object.freeze({
  weapons: EMPTY_ARRAY,
  armor: EMPTY_OBJECT,
  weaponMods: EMPTY_ARRAY,
  robotWeaponMods: EMPTY_ARRAY,
  armorMods: EMPTY_ARRAY,
  uniqArmorMods: EMPTY_ARRAY,
  ammo: EMPTY_ARRAY,
  robotItems: EMPTY_ARRAY,
  robotModules: EMPTY_ARRAY,
  robotLimbs: EMPTY_ARRAY,
});

const createLocaleI18n = (localeNames = EMPTY_OBJECT) => {
  const system = localeNames.system ?? EMPTY_OBJECT;
  const equipment = localeNames.equipment ?? EMPTY_OBJECT;
  const armor = equipment.armor ?? EMPTY_OBJECT;
  const robot = equipment.robot ?? EMPTY_OBJECT;
  const consumables = localeNames.consumables ?? EMPTY_OBJECT;
  const junk = localeNames.junk ?? EMPTY_OBJECT;
  return {
    armor: armor.sets ?? EMPTY_OBJECT,
    powerArmor: armor.powerArmor ?? EMPTY_OBJECT,
    ammoTypes: equipment.ammoTypes ?? EMPTY_ARRAY,
    miscellaneous: equipment.items ?? EMPTY_ARRAY,
    qualities: system.qualities ?? EMPTY_ARRAY,
    effects: system.effects ?? EMPTY_OBJECT,
    damageEffects: system.damageEffects ?? EMPTY_ARRAY,
    oddities: equipment.oddities ?? EMPTY_ARRAY,
    armorMods: armor.mods ?? EMPTY_ARRAY,
    uniqArmorMods: armor.uniqMods ?? EMPTY_ARRAY,
    armorEffects: armor.effects ?? EMPTY_OBJECT,
    origins: system.origins ?? EMPTY_OBJECT,
    traits: system.traits ?? EMPTY_OBJECT,
    equipmentKits: system.equipmentKits ?? EMPTY_OBJECT,
    weapons: equipment.weapons ?? EMPTY_ARRAY,
    clothes: equipment.clothes ?? EMPTY_ARRAY,
    generalGoods: equipment.generalGoods ?? EMPTY_ARRAY,
    weaponMods: equipment.weaponMods ?? EMPTY_ARRAY,
    robotWeaponMods: robot.weaponMods ?? EMPTY_ARRAY,
    food: consumables.food ?? EMPTY_ARRAY,
    drinks: consumables.drinks ?? EMPTY_ARRAY,
    chems: consumables.chems ?? EMPTY_ARRAY,
    magazines: consumables.magazines ?? EMPTY_ARRAY,
    junk: junk.items ?? EMPTY_ARRAY,
    materials: junk.materials ?? EMPTY_ARRAY,
  };
};

const createSettingCatalogContext = (setting) => {
  const data = setting?.data ?? EMPTY_OBJECT;
  const equipment = data.equipment ?? EMPTY_OBJECT;
  const robot = equipment.robot ?? EMPTY_OBJECT;
  const names = setting?.names ?? EMPTY_OBJECT;
  const moduleI18nByLocale = Object.fromEntries(
    Object.entries(names).map(([locale, localeNames]) => [locale, createLocaleI18n(localeNames)]),
  );
  const equipmentByLocale = Object.fromEntries(Object.entries(names).map(([locale, localeNames]) => {
    const localizedRobot = localeNames?.equipment?.robot ?? EMPTY_OBJECT;
    return [locale, {
      robotWeapons: localizedRobot.weapons ?? EMPTY_ARRAY,
      robotArms: localizedRobot.arms ?? EMPTY_ARRAY,
      robotArmor: localizedRobot.armor ?? EMPTY_ARRAY,
      robotPlating: localizedRobot.plating ?? EMPTY_ARRAY,
      robotFrames: localizedRobot.frames ?? EMPTY_ARRAY,
      robotModules: localizedRobot.modules ?? EMPTY_ARRAY,
      robotItems: localizedRobot.items ?? EMPTY_ARRAY,
      robotBody: localizedRobot.body ?? EMPTY_ARRAY,
      robotHeads: localizedRobot.heads ?? EMPTY_ARRAY,
      robotLegs: localizedRobot.legs ?? EMPTY_ARRAY,
    }];
  }));
  return {
    moduleI18nByLocale,
    equipmentByLocale,
    moduleWeapons: equipment.weapons ?? EMPTY_ARRAY,
    moduleGeneralGoods: equipment.generalGoods ?? EMPTY_ARRAY,
    moduleEquipmentKits: data.equipmentKits ?? EMPTY_OBJECT,
    moduleArmor: equipment.armor ?? EMPTY_OBJECT,
    modulePowerArmor: equipment.powerArmor ?? EMPTY_OBJECT,
    moduleOddities: equipment.oddities ?? EMPTY_ARRAY,
    moduleAmmo: equipment.ammo ?? EMPTY_ARRAY,
    moduleArmorMods: equipment.armorMods ?? EMPTY_ARRAY,
    moduleUniqArmorMods: equipment.uniqArmorMods ?? EMPTY_ARRAY,
    moduleArmorEffects: equipment.armorEffects ?? EMPTY_OBJECT,
    moduleClothesData: equipment.clothes ?? EMPTY_OBJECT,
    moduleFood: data.consumables?.food ?? EMPTY_ARRAY,
    moduleDrinks: data.consumables?.drinks ?? EMPTY_ARRAY,
    moduleChems: data.consumables?.chems ?? EMPTY_ARRAY,
    moduleMagazines: data.consumables?.magazines ?? EMPTY_ARRAY,
    moduleWeaponMods: equipment.weaponMods ?? EMPTY_ARRAY,
    moduleRobotWeaponMods: robot.weaponMods ?? EMPTY_ARRAY,
    moduleRobotParts: equipment.robotParts ?? EMPTY_OBJECT,
    moduleWeaponModSlots: equipment.weaponModSlots ?? EMPTY_OBJECT,
    moduleRobotLimbs: robot.limbs ?? EMPTY_ARRAY,
    moduleRobotWeaponAsLimb: robot.weaponAsLimb ?? EMPTY_ARRAY,
    moduleRobotArmor: robot.armor ?? EMPTY_OBJECT,
    moduleRobotPlating: robot.armorPlating ?? EMPTY_OBJECT,
    moduleRobotFrames: robot.frames ?? EMPTY_OBJECT,
    moduleRobotWeapons: robot.weapons ?? EMPTY_ARRAY,
    moduleScrapJunk: data.junk?.items ?? EMPTY_ARRAY,
    moduleScrapMaterials: data.junk?.materials ?? EMPTY_ARRAY,
    ALL_KIT_DATA: data.equipmentKits ?? EMPTY_OBJECT,
  };
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
  const setting = getActiveSettingRuntime()?.setting;
  if (!setting) return EMPTY_EQUIPMENT_CATALOG;
  const {
    moduleI18nByLocale,
    equipmentByLocale,
    moduleWeapons,
    moduleGeneralGoods,
    moduleArmor,
    modulePowerArmor,
    moduleOddities,
    moduleAmmo,
    moduleArmorMods,
    moduleUniqArmorMods,
    moduleArmorEffects,
    moduleClothesData,
    moduleFood,
    moduleDrinks,
    moduleChems,
    moduleMagazines,
    moduleWeaponMods,
    moduleRobotWeaponMods,
    moduleRobotParts,
    moduleWeaponModSlots,
    moduleRobotLimbs,
    moduleRobotWeaponAsLimb,
    moduleRobotArmor,
    moduleRobotPlating,
    moduleRobotFrames,
    moduleRobotWeapons,
    moduleScrapJunk,
    moduleScrapMaterials,
    ALL_KIT_DATA,
  } = createSettingCatalogContext(setting);
  const i18n = equipmentByLocale[locale];
  if (!i18n || !moduleI18nByLocale[locale]) {
    throw new Error(`[equipmentCatalog] Setting "${setting.meta?.id ?? 'unknown'}" has no catalogue for locale "${locale}"`);
  }

  // Weapons: mechanics and names are both supplied by the active setting.
  // Оружие в модуле самодостаточно: варианты (trueItemId) ссылаются на
  // полные записи в том же файле. Базой для разворачивания служит сам
  // локализованный список модуля — чтения data/ нет.
  const moduleI18n = moduleI18nByLocale[locale];
  const moduleWeaponsLocalized = mergeById(moduleWeapons || [], moduleI18n.weapons || []);
  // replaceOriginalNameTo: имя берётся из i18n-словаря по указанному ключу
  // (у бритвы — weapon_straight_razor → «Опасная бритва»).
  const weaponNameByKey = new Map(
    (moduleI18n.weapons || [])
      .filter((e) => e?.id && e?.name)
      .map((e) => [e.id, e.name]),
  );
  const weapons = expandCatalogItems(moduleWeaponsLocalized, moduleWeaponsLocalized)
    .map((w) => {
      const renameKey = w?.modifiers?.replaceOriginalNameTo;
      if (renameKey && weaponNameByKey.has(renameKey)) {
        return { ...w, name: weaponNameByKey.get(renameKey) };
      }
      return w;
    })
    .map((w) => ({ ...w, itemType: 'weapon' }));
  const robotWeapons = expandCatalogItems(
    mergeById(
      (moduleRobotWeapons || []).filter((item) => item.itemType === 'weapon'),
      i18n.robotWeapons || [],
    ),
    moduleWeaponsLocalized,
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
  const mergedJunk = mergeById(moduleScrapJunk, moduleI18n.junk);
  const mergedScrapMaterials = mergeById(moduleScrapMaterials, moduleI18n.materials);

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

  const settingId = getActiveModuleId();
  const userEquipmentData = useUserEquipmentStore.getState().getSettingData(settingId);
  const baseCatalog = {
    weapons: allWeapons,
    armorList,
    armorIndex,
    armorRaw: moduleArmor,
    weaponMods: [...mergedWeaponMods, ...mergedRobotWeaponMods],
    armorMods: mergedArmorMods,
    uniqArmorMods: mergedUniqArmorMods,
    ammoTypes: mergedAmmo,
    qualities: mergedQualities,
    damageEffects: mergedDamageEffects,
    armorEffects,
    modsOverrides: moduleWeaponModSlots,
  };
  const userOverlay = buildUserEquipmentOverlay({
    settingId,
    userData: userEquipmentData,
    locale,
    catalog: baseCatalog,
  });
  const customWeapons = expandCatalogItems(
    userOverlay.weapons,
    [...allWeapons, ...userOverlay.weapons],
  ).map((weapon) => ({ ...weapon, itemType: 'weapon' }));
  const allWeaponsWithUserData = [...allWeapons, ...customWeapons];
  const customArmor = expandCatalogItems(
    userOverlay.armor,
    [...armorList, ...userOverlay.armor],
  ).map((item) => ({ ...item, itemType: 'armor' }));
  const armorGroupsWithUserData = armorGroups.map((group) => ({
    ...group,
    items: [
      ...group.items,
      ...customArmor.filter((item) => item.armorCategoryKey === group.categoryKey),
    ],
  }));
  const armorListWithUserData = flattenArmorGroups({ armor: armorGroupsWithUserData });
  const armorIndexWithUserData = buildArmorIndex([
    ...armorListWithUserData,
    ...robotPlatingList,
    ...robotArmorList,
    ...robotFramesList,
  ]);
  const userWeaponMods = userOverlay.weaponMods;
  const allWeaponMods = [...mergedWeaponMods, ...mergedRobotWeaponMods, ...userWeaponMods];
  const userArmorMods = userOverlay.armorMods.filter((mod) => mod.modType === 'armor');
  const userUniqueArmorMods = userOverlay.armorMods.filter((mod) => mod.modType === 'armorUnique');
  const armorModsWithUserData = [...mergedArmorMods, ...userArmorMods];
  const uniqueArmorModsWithUserData = [...mergedUniqArmorMods, ...userUniqueArmorMods];

  const finalModsOverrides = Object.fromEntries(
    Object.entries(moduleWeaponModSlots).map(([weaponId, slots]) => [
      weaponId,
      Object.fromEntries(Object.entries(slots).map(([slot, ids]) => [slot, [...ids]])),
    ]),
  );
  const customWeaponsById = new Map(customWeapons.map((weapon) => [weapon.id, weapon]));
  const resolveInheritedWeaponSlots = (weaponId, visiting = new Set()) => {
    if (visiting.has(weaponId)) return {};
    visiting.add(weaponId);
    if (finalModsOverrides[weaponId]) return finalModsOverrides[weaponId];
    const parentId = customWeaponsById.get(weaponId)?.trueItemId;
    return parentId ? resolveInheritedWeaponSlots(parentId, visiting) : {};
  };
  for (const weapon of customWeapons) {
    if (weapon.trueItemId) {
      const inherited = resolveInheritedWeaponSlots(weapon.trueItemId);
      finalModsOverrides[weapon.id] = Object.fromEntries(
        Object.entries(inherited).map(([slot, ids]) => [slot, [...ids]]),
      );
    }
  }
  for (const mod of userWeaponMods) {
    if (!mod.slot) continue;
    for (const weaponId of mod.applies_to_ids || []) {
      (finalModsOverrides[weaponId] ??= {});
      (finalModsOverrides[weaponId][mod.slot] ??= []);
      if (!finalModsOverrides[weaponId][mod.slot].includes(mod.id)) {
        finalModsOverrides[weaponId][mod.slot].push(mod.id);
      }
    }
  }

  return {
    ...i18n,
    weapons: allWeaponsWithUserData,
    // armorRaw keyed by categoryKey for ArmorModificationModal allowedModCategories lookup
    armorRaw: moduleArmor,
    armor: { armor: armorGroupsWithUserData },
    armorList: armorListWithUserData,
    armorIndex: armorIndexWithUserData,
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
    weaponMods: allWeaponMods,
    robotWeaponMods: mergedRobotWeaponMods,
    robotWeaponModSlots,
    armorMods: armorModsWithUserData,
    uniqArmorMods: uniqueArmorModsWithUserData,
    modsOverrides: finalModsOverrides,
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
export const getEquipmentData = () => {
  const setting = getActiveSettingRuntime()?.setting;
  if (!setting) return EMPTY_EQUIPMENT_DATA;
  const {
    moduleWeapons,
    moduleArmor,
    moduleWeaponMods,
    moduleRobotWeaponMods,
    moduleArmorMods,
    moduleUniqArmorMods,
    moduleAmmo,
    moduleRobotParts,
    moduleRobotLimbs,
    moduleRobotWeaponAsLimb,
  } = createSettingCatalogContext(setting);
  return {
    weapons: moduleWeapons,
    armor: moduleArmor,
    weaponMods: moduleWeaponMods,
    robotWeaponMods: moduleRobotWeaponMods,
    armorMods: moduleArmorMods,
    uniqArmorMods: moduleUniqArmorMods,
    ammo: moduleAmmo,
    robotItems: moduleRobotParts.robotItems ?? EMPTY_ARRAY,
    robotModules: moduleRobotParts.robotModules ?? EMPTY_ARRAY,
    robotLimbs: [...moduleRobotLimbs, ...moduleRobotWeaponAsLimb],
  };
};
