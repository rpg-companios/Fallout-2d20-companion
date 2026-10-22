// СЕТТИНГ «Fallout 2d20» — ДВЕРЬ МОДУЛЯ (патч 292).
//
// Публичная дверь ПОЛНЫХ данных модуля (движок, экраны, тесты).
// Метаданные без загрузки каталога доступны через соседний manifest.js;
// сырые JSON и внутренние файлы снаружи не импортируются.
// Экспорт полного входа — SETTING. Внутри модуль читает свои файлы свободно.
//
// ── КОНТРАКТ СЕТТИНГА (единый для всех сеттингов; для ИИ-агентов) ──────────
//
// 1. ОПЕРИРУЕМ ДАННЫМИ. Все игровые значения — в data/**/*.json. Хардкоды
//    значений в коде запрещены: новое значение = строка в json, не правка
//    кода.
// 2. ДАННЫЕ МОЛЧАТ. В данных — id и числа. Всё, что видит игрок, — имена
//    из i18n/<locale>/. Текстов интерфейса в данных нет.
// 3. ПУБЛИЧНЫЕ ДВЕРИ. Полные данные снаружи читаются через этот index.js;
//    лёгкие метаданные — через manifest.js. Прямые импорты manifest.json,
//    data/** и i18n/** из потребителей запрещены — держит тест границы
//    __tests__/settings/settings-boundary.test.js (известный долг — в allowlist
//    и docs/architecture/domain-map.md).
// 4. ОДНА ТОЧКА ЧТЕНИЯ ДАННЫХ. Движок и экраны получают данные сеттинга через
//    active runtime capabilities. Локализованный каталог и данные механик
//    объявляются через SETTING.catalogs/ runtime services, а общий adapter
//    i18n/equipmentCatalog.js не строит Fallout-структуру.
// 5. НОВЫЕ ДАННЫЕ = json-файл + импорт здесь + место в SETTING (+ геттер
//    в реестре, если появилась новая ГРУППА). Форма полей — конвенция
//    живого потребителя (пример: domain/enrichItem.js applyWeaponMods
//    требует плоские аддитивные cost/weight — патч 291).
// 6. I18N ОБЯЗАТЕЛЕН. Каждая видимая игроку строка — в обеих локалях
//    (ru-RU, en-EN).
// 7. СТРУКТУРА ЕДИНА. Любой сеттинг держит скелет: index.js (дверь +
//    контракт), data/ (значения), i18n/ (имена), screens/ (экраны
//    сеттинга). Другой сеттинг = другое наполнение, не другая архитектура.
// 8. ГДЕ ЖИВЁТ ЛОГИКА. Механика = универсальная формула в domain/ (движки
//    механик: «берём одни данные, проверяем их наличие, выдаём другие,
//    старые списываем; а ЧТО это за данные — хлам, еда или детали оружия —
//    скажет сеттинг на основе своей формулы»). Правила конкретного сеттинга,
//    не выражаемые данными, живут в modules/<сеттинг>/ — не в domain/.
//    Карта слоёв домена и план разделения: docs/architecture/domain-map.md.
//
// ── СХЕМА SETTING ──────────────────────────────────────────────────────────
//
//   SETTING.meta          — валидированный manifest (id/name/version/locales)
//   SETTING.userData      — схемы локально/облачно загружаемых данных и порядок
//                           восстановления (user equipment до character saves)
//   SETTING.data          — значения: equipment (включая robot), consumables,
//                           junk, recipes, equipmentKits, origins, traits,
//                           perks, bodyplans, rules
//   SETTING.names[locale] — имена данных плюс setting-owned UI-словари:
//                           app, system, equipment, consumables, junk, screens
//
// Порядок разделов ниже повторяет структуру SETTING — сверху вниз.

import { SETTING_MANIFEST } from './manifest.js';
import bodyplans from './data/bodyplans/bodyplans.json';
import origins from './data/origins/origins.json';
import fitProfiles from './data/origins/fitProfiles.json';
import traits from './data/traits/traits.json';
import perks from './data/perks/perks.json';
import diseaseExposure from './data/rules/diseaseExposure.json';
import diseases from './data/conditions/diseases.json';

// — снаряжение —
import categories from './data/equipment/categories.json';
import weapons from './data/equipment/weapons.json';
import weaponMods from './data/equipment/weapon_mods.json';
import weaponModSlots from './data/equipment/weapon_mod_slots.json';
import generalGoods from './data/equipment/general_goods.json';
import uniqQualities from './data/equipment/uniq_qualities.json';
import armor from './data/equipment/armor.json';
import powerArmor from './data/equipment/powerArmor.json';
import clothes from './data/equipment/clothes.json';
import oddities from './data/equipment/oddities.json';
import ammo from './data/equipment/ammo.json';
import armorMods from './data/equipment/armor_mods.json';
import uniqArmorMods from './data/equipment/uniq_armor_mods.json';
import armorEffects from './data/equipment/armor_effects.json';
import robotParts from './data/equipment/robotparts.json';

// — роботы —
import robotLimbs from './data/equipment/robot/limbs.json';
import robotWeaponAsLimb from './data/equipment/robot/weaponAsLimb.json';
import robotWeapons from './data/equipment/robot/weapons.json';
import robotArmor from './data/equipment/robot/armor.json';
import robotArmorPlating from './data/equipment/robot/armor_plating.json';
import robotFrames from './data/equipment/robot/frames.json';
import robotWeaponMods from './data/equipment/robot/weapon_mods.json';

// — расходники —
import food from './data/consumables/food.json';
import drinks from './data/consumables/drinks.json';
import chems from './data/consumables/chems.json';
import magazines from './data/consumables/magazines.json';

// — разбор (хлам, материалы, d20-таблицы) —
import junkItems from './data/junk/junk.json';
import junkMaterials from './data/junk/material.json';
import junkTables from './data/junk/tables.json';

// — рецептура (манифест порядка, правила категорий, разделы) —
import recipesManifest from './data/recipes/index.json';
import recipesCategoryRules from './data/recipes/categoryRules.json';
import recipesAmmo from './data/recipes/ammo.json';
import recipesExplosives from './data/recipes/explosives.json';
import recipesArmor from './data/recipes/armor.json';
import recipesWeapons from './data/recipes/weapons.json';
import recipesChems from './data/recipes/chems.json';
import recipesFood from './data/recipes/food.json';
import recipesDrinks from './data/recipes/drinks.json';

// — комплекты (по файлу на фракцию/группу; слияние — здесь, 270) —
import kitAssaultron from './data/equipmentKits/assaultron.json';
import kitBrotherhood from './data/equipmentKits/brotherhood.json';
import kitBrotherhoodOutcast from './data/equipmentKits/brotherhoodOutcast.json';
import kitChildOfAtom from './data/equipmentKits/childOfAtom.json';
import kitDefault from './data/equipmentKits/default.json';
import kitEnclave from './data/equipmentKits/enclave.json';
import kitMinuteman from './data/equipmentKits/minuteman.json';
import kitMisterHandy from './data/equipmentKits/misterHandy.json';
import kitNcr from './data/equipmentKits/ncr.json';
import kitNightkin from './data/equipmentKits/nightkin.json';
import kitProtectron from './data/equipmentKits/protectron.json';
import kitPurchase from './data/equipmentKits/purchase.json';
import kitRobobrain from './data/equipmentKits/robobrain.json';
import kitSecuritron from './data/equipmentKits/securitron.json';
import kitSuperMutant from './data/equipmentKits/superMutant.json';
import kitTreefamilies from './data/equipmentKits/treefamilies.json';
import kitVaultDweller from './data/equipmentKits/vaultDweller.json';
import kitWastelander from './data/equipmentKits/wastelander.json';

// — имена: ru-RU —
import ruSystemOrigins from './i18n/ru-RU/data/system/origins.json';
import ruSystemTraits from './i18n/ru-RU/data/system/traits.json';
import ruSystemEquipmentKits from './i18n/ru-RU/data/system/equipmentKits.json';
import ruSystemUniqQualities from './i18n/ru-RU/data/system/uniq_qualities.json';
import ruSystemQualities from './i18n/ru-RU/data/system/qualities.json';
import ruSystemEffects from './i18n/ru-RU/data/system/effects.json';
import ruSystemDamageEffects from './i18n/ru-RU/data/system/damageEffects.json';
import ruSystemSettings from './i18n/ru-RU/data/system/settings.json';
import ruEquipmentWeapons from './i18n/ru-RU/data/equipment/weapons/weapons.json';
import ruEquipmentClothes from './i18n/ru-RU/data/equipment/armor/clothes.json';
import ruEquipmentGeneralGoods from './i18n/ru-RU/data/equipment/general_goods.json';
import ruEquipmentWeaponMods from './i18n/ru-RU/data/equipment/weapon_mods.json';
import ruEquipmentItems from './i18n/ru-RU/data/equipment/items.json';
import ruEquipmentOddities from './i18n/ru-RU/data/equipment/oddities.json';
import ruEquipmentAmmoTypes from './i18n/ru-RU/data/equipment/ammo/ammo_types.json';
import ruArmorSets from './i18n/ru-RU/data/equipment/armor/armor.json';
import ruArmorPowerArmor from './i18n/ru-RU/data/equipment/armor/powerArmor.json';
import ruArmorMods from './i18n/ru-RU/data/equipment/armor/armor_mods.json';
import ruArmorUniqMods from './i18n/ru-RU/data/equipment/armor/uniq_armor_mods.json';
import ruArmorEffects from './i18n/ru-RU/data/equipment/armor/armor_effects.json';
import ruRobotWeapons from './i18n/ru-RU/data/equipment/robot/weapons.json';
import ruRobotArms from './i18n/ru-RU/data/equipment/robot/robotarms.json';
import ruRobotArmor from './i18n/ru-RU/data/equipment/robot/armor.json';
import ruRobotPlating from './i18n/ru-RU/data/equipment/robot/plating.json';
import ruRobotFrames from './i18n/ru-RU/data/equipment/robot/frames.json';
import ruRobotModules from './i18n/ru-RU/data/equipment/robot/modules.json';
import ruRobotItems from './i18n/ru-RU/data/equipment/robot/items.json';
import ruRobotBody from './i18n/ru-RU/data/equipment/robot/robotbody.json';
import ruRobotHeads from './i18n/ru-RU/data/equipment/robot/robotheads.json';
import ruRobotLegs from './i18n/ru-RU/data/equipment/robot/robotlegs.json';
import ruRobotWeaponMods from './i18n/ru-RU/data/equipment/robot/weapon_mods.json';
import ruConsumablesFood from './i18n/ru-RU/data/consumables/food.json';
import ruConsumablesDrinks from './i18n/ru-RU/data/consumables/drinks.json';
import ruConsumablesChems from './i18n/ru-RU/data/consumables/chems.json';
import ruConsumablesMagazines from './i18n/ru-RU/data/consumables/magazines.json';
import ruPerksNames from './i18n/ru-RU/data/perks/perks.json';
import ruDiseases from './i18n/ru-RU/data/conditions/diseases.json';
import ruAppI18n from './i18n/ru-RU/App.json';
import enAppI18n from './i18n/en-EN/App.json';
import ruCharacterScreenI18n from './i18n/ru-RU/screens/character/screen.json';
import ruPerksScreenI18n from './i18n/ru-RU/screens/perksAndTraits/screen.json';
import ruInventoryScreenI18n from './i18n/ru-RU/screens/inventory/screen.json';
import ruInventoryAddItemI18n from './i18n/ru-RU/screens/inventory/modals/addItemModal.json';
import ruInventoryCapsI18n from './i18n/ru-RU/screens/inventory/modals/capsModal.json';
import ruInventoryBuyItemI18n from './i18n/ru-RU/screens/inventory/modals/buyItemModal.json';
import ruInventorySellItemI18n from './i18n/ru-RU/screens/inventory/modals/sellItemModal.json';
import ruJunkItems from './i18n/ru-RU/data/junk/junk.json';
import ruJunkMaterials from './i18n/ru-RU/data/junk/material.json';
import ruJunkTableLabels from './i18n/ru-RU/data/junk/tables.json';

// — имена: en-EN —
import enSystemOrigins from './i18n/en-EN/data/system/origins.json';
import enSystemTraits from './i18n/en-EN/data/system/traits.json';
import enSystemEquipmentKits from './i18n/en-EN/data/system/equipmentKits.json';
import enSystemUniqQualities from './i18n/en-EN/data/system/uniq_qualities.json';
import enSystemQualities from './i18n/en-EN/data/system/qualities.json';
import enSystemEffects from './i18n/en-EN/data/system/effects.json';
import enSystemDamageEffects from './i18n/en-EN/data/system/damageEffects.json';
import enSystemSettings from './i18n/en-EN/data/system/settings.json';
import enEquipmentWeapons from './i18n/en-EN/data/equipment/weapons/weapons.json';
import enEquipmentClothes from './i18n/en-EN/data/equipment/armor/clothes.json';
import enEquipmentGeneralGoods from './i18n/en-EN/data/equipment/general_goods.json';
import enEquipmentWeaponMods from './i18n/en-EN/data/equipment/weapon_mods.json';
import enEquipmentItems from './i18n/en-EN/data/equipment/items.json';
import enEquipmentOddities from './i18n/en-EN/data/equipment/oddities.json';
import enEquipmentAmmoTypes from './i18n/en-EN/data/equipment/ammo/ammo_types.json';
import enArmorSets from './i18n/en-EN/data/equipment/armor/armor.json';
import enArmorPowerArmor from './i18n/en-EN/data/equipment/armor/powerArmor.json';
import enArmorMods from './i18n/en-EN/data/equipment/armor/armor_mods.json';
import enArmorUniqMods from './i18n/en-EN/data/equipment/armor/uniq_armor_mods.json';
import enArmorEffects from './i18n/en-EN/data/equipment/armor/armor_effects.json';
import enRobotWeapons from './i18n/en-EN/data/equipment/robot/weapons.json';
import enRobotArms from './i18n/en-EN/data/equipment/robot/robotarms.json';
import enRobotArmor from './i18n/en-EN/data/equipment/robot/armor.json';
import enRobotPlating from './i18n/en-EN/data/equipment/robot/plating.json';
import enRobotFrames from './i18n/en-EN/data/equipment/robot/frames.json';
import enRobotModules from './i18n/en-EN/data/equipment/robot/modules.json';
import enRobotItems from './i18n/en-EN/data/equipment/robot/items.json';
import enRobotBody from './i18n/en-EN/data/equipment/robot/robotbody.json';
import enRobotHeads from './i18n/en-EN/data/equipment/robot/robotheads.json';
import enRobotLegs from './i18n/en-EN/data/equipment/robot/robotlegs.json';
import enRobotWeaponMods from './i18n/en-EN/data/equipment/robot/weapon_mods.json';
import enConsumablesFood from './i18n/en-EN/data/consumables/food.json';
import enConsumablesDrinks from './i18n/en-EN/data/consumables/drinks.json';
import enConsumablesChems from './i18n/en-EN/data/consumables/chems.json';
import enConsumablesMagazines from './i18n/en-EN/data/consumables/magazines.json';
import enPerksNames from './i18n/en-EN/data/perks/perks.json';
import enDiseases from './i18n/en-EN/data/conditions/diseases.json';
import enCharacterScreenI18n from './i18n/en-EN/screens/character/screen.json';
import enPerksScreenI18n from './i18n/en-EN/screens/perksAndTraits/screen.json';
import enInventoryScreenI18n from './i18n/en-EN/screens/inventory/screen.json';
import enInventoryAddItemI18n from './i18n/en-EN/screens/inventory/modals/addItemModal.json';
import enInventoryCapsI18n from './i18n/en-EN/screens/inventory/modals/capsModal.json';
import enInventoryBuyItemI18n from './i18n/en-EN/screens/inventory/modals/buyItemModal.json';
import enInventorySellItemI18n from './i18n/en-EN/screens/inventory/modals/sellItemModal.json';
import enJunkItems from './i18n/en-EN/data/junk/junk.json';
import enJunkMaterials from './i18n/en-EN/data/junk/material.json';
import enJunkTableLabels from './i18n/en-EN/data/junk/tables.json';

// Setting-owned mechanics are exposed as capabilities on SETTING.logic;
// the engine resolves them from the active package through domain/registry.js.
import * as derivedStatsLogic from './logic/derivedStats.js';
import * as characterCreationLogic from './logic/characterCreation.js';
import { SURVIVAL_RULES } from './survival/survival';
import {
  getEquipmentCatalog as getFalloutEquipmentCatalog,
  getEquipmentData as getFalloutEquipmentData,
} from './catalog/equipmentCatalog.js';
import { FALLOUT_CATALOG_DATABASE_ROWS } from './catalog/databaseRows.js';

// Full-data consumers use this module doorway; metadata-only consumers import
// the lightweight manifest doorway and avoid loading setting rule code.
const settingManifest = SETTING_MANIFEST;

export const SETTING = Object.freeze({
  meta: settingManifest,
  catalogs: Object.freeze({
    equipment: Object.freeze({
      getLocalized: getFalloutEquipmentCatalog,
      getMechanics: getFalloutEquipmentData,
      databaseRows: FALLOUT_CATALOG_DATABASE_ROWS,
    }),
  }),

  // Runtime user equipment is kept outside immutable setting data. This
  // descriptor is the setting registry contract for local loading and cloud
  // restore; Drive uses the same hidden setting folder as character saves.
  userData: {
    equipment: {
      schemaVersion: 1,
      kinds: ['weapons', 'armor', 'weaponMods', 'armorMods'],
      fileNames: {
        weapons: 'usrdataWeapon.json',
        armor: 'usrdataArmor.json',
        weaponMods: 'usrdataWeaponMods.json',
        armorMods: 'usrdataArmorMods.json',
      },
      localStore: 'src/store/userEquipmentStore.js',
      reader: 'domain/userEquipment.js',
      drive: {
        space: 'appDataFolder',
        parent: 'setting-folder',
        sameFolderAs: 'character-saves',
      },
      restoreOrder: 'before-character-saves',
    },
  },

  data: {
    bodyplans,
    origins,
    fitProfiles,
    traits,
    perks,
    rules: { diseaseExposure },
    conditions: { diseases },

    equipment: {
      categories,
      weapons,
      weaponMods,
      weaponModSlots,
      generalGoods,
      uniqQualities,
      armor,
      powerArmor,
      clothes,
      oddities,
      ammo,
      armorMods,
      uniqArmorMods,
      armorEffects,
      robotParts,
      robot: {
        limbs: robotLimbs,
        weaponAsLimb: robotWeaponAsLimb,
        weapons: robotWeapons,
        armor: robotArmor,
        armorPlating: robotArmorPlating,
        frames: robotFrames,
        weaponMods: robotWeaponMods,
      },
    },

    consumables: { food, drinks, chems, magazines },

    junk: {
      items: junkItems,
      materials: junkMaterials,
      tables: junkTables,
    },

    recipes: {
      manifest: recipesManifest,
      categoryRules: recipesCategoryRules,
      sections: {
        ammo: recipesAmmo,
        explosives: recipesExplosives,
        armor: recipesArmor,
        weapons: recipesWeapons,
        chems: recipesChems,
        food: recipesFood,
        drinks: recipesDrinks,
      },
    },

    equipmentKits: {
      ...kitAssaultron,
      ...kitBrotherhood,
      ...kitBrotherhoodOutcast,
      ...kitChildOfAtom,
      ...kitDefault,
      ...kitEnclave,
      ...kitMinuteman,
      ...kitMisterHandy,
      ...kitNcr,
      ...kitNightkin,
      ...kitProtectron,
      ...kitPurchase,
      ...kitRobobrain,
      ...kitSecuritron,
      ...kitSuperMutant,
      ...kitTreefamilies,
      ...kitVaultDweller,
      ...kitWastelander,
    },
  },

  // Character creation and derived formulas are setting-owned capabilities.
  // The engine reads these only through domain/registry.js; nothing is defaulted.
  logic: {
    characterCreation: characterCreationLogic,
    derivedStats: derivedStatsLogic,
    survivalRules: SURVIVAL_RULES,
  },

  names: {
    'ru-RU': {
      app: ruAppI18n,
      // Строки настроек движок читает как settings.<ключ> в корне словаря
      // (SettingsModal: labelKey/descriptionKey/sectionKey из settings.json).
      settings: ruSystemSettings,
      system: {
        origins: ruSystemOrigins,
        traits: ruSystemTraits,
        equipmentKits: ruSystemEquipmentKits,
        uniqQualities: ruSystemUniqQualities,
        qualities: ruSystemQualities,
        effects: ruSystemEffects,
        damageEffects: ruSystemDamageEffects,
      },
      equipment: {
        weapons: ruEquipmentWeapons,
        clothes: ruEquipmentClothes,
        generalGoods: ruEquipmentGeneralGoods,
        weaponMods: ruEquipmentWeaponMods,
        items: ruEquipmentItems,
        oddities: ruEquipmentOddities,
        ammoTypes: ruEquipmentAmmoTypes,
        armor: {
          sets: ruArmorSets,
          powerArmor: ruArmorPowerArmor,
          mods: ruArmorMods,
          uniqMods: ruArmorUniqMods,
          effects: ruArmorEffects,
        },
        robot: {
          weapons: ruRobotWeapons,
          arms: ruRobotArms,
          armor: ruRobotArmor,
          plating: ruRobotPlating,
          frames: ruRobotFrames,
          modules: ruRobotModules,
          items: ruRobotItems,
          body: ruRobotBody,
          heads: ruRobotHeads,
          legs: ruRobotLegs,
          weaponMods: ruRobotWeaponMods,
        },
      },
      consumables: {
        food: ruConsumablesFood,
        drinks: ruConsumablesDrinks,
        chems: ruConsumablesChems,
        magazines: ruConsumablesMagazines,
      },
      junk: {
        items: ruJunkItems,
        materials: ruJunkMaterials,
        tableLabels: ruJunkTableLabels,
      },
      perks: ruPerksNames,
      conditions: { diseases: ruDiseases },
      screens: {
        character: ruCharacterScreenI18n,
        perksAndTraits: ruPerksScreenI18n,
        inventory: {
          screen: ruInventoryScreenI18n,
          modals: {
            addItemModal: ruInventoryAddItemI18n,
            capsModal: ruInventoryCapsI18n,
            buyItemModal: ruInventoryBuyItemI18n,
            sellItemModal: ruInventorySellItemI18n,
          },
        },
      },
    },
    'en-EN': {
      app: enAppI18n,
      settings: enSystemSettings,
      system: {
        origins: enSystemOrigins,
        traits: enSystemTraits,
        equipmentKits: enSystemEquipmentKits,
        uniqQualities: enSystemUniqQualities,
        qualities: enSystemQualities,
        effects: enSystemEffects,
        damageEffects: enSystemDamageEffects,
      },
      equipment: {
        weapons: enEquipmentWeapons,
        clothes: enEquipmentClothes,
        generalGoods: enEquipmentGeneralGoods,
        weaponMods: enEquipmentWeaponMods,
        items: enEquipmentItems,
        oddities: enEquipmentOddities,
        ammoTypes: enEquipmentAmmoTypes,
        armor: {
          sets: enArmorSets,
          powerArmor: enArmorPowerArmor,
          mods: enArmorMods,
          uniqMods: enArmorUniqMods,
          effects: enArmorEffects,
        },
        robot: {
          weapons: enRobotWeapons,
          arms: enRobotArms,
          armor: enRobotArmor,
          plating: enRobotPlating,
          frames: enRobotFrames,
          modules: enRobotModules,
          items: enRobotItems,
          body: enRobotBody,
          heads: enRobotHeads,
          legs: enRobotLegs,
          weaponMods: enRobotWeaponMods,
        },
      },
      consumables: {
        food: enConsumablesFood,
        drinks: enConsumablesDrinks,
        chems: enConsumablesChems,
        magazines: enConsumablesMagazines,
      },
      junk: {
        items: enJunkItems,
        materials: enJunkMaterials,
        tableLabels: enJunkTableLabels,
      },
      perks: enPerksNames,
      conditions: { diseases: enDiseases },
      screens: {
        character: enCharacterScreenI18n,
        perksAndTraits: enPerksScreenI18n,
        inventory: {
          screen: enInventoryScreenI18n,
          modals: {
            addItemModal: enInventoryAddItemI18n,
            capsModal: enInventoryCapsI18n,
            buyItemModal: enInventoryBuyItemI18n,
            sellItemModal: enInventorySellItemI18n,
          },
        },
      },
    },
  },
});
