# Implementation Plan

- [x] 1. Добавить поддержку qualities и damageType в weapons.json




  - Добавить поле `qualities` (массив `{qualityId, value?}`) к существующим записям в `data/equipment/weapons.json`
  - Добавить поле `damageType` (`"physical"`, `"energy"`, `"radiation"`) к существующим записям
  - Создать `data/equipment/weapon_qualities.json` со справочником всех качеств
  - Расширить `i18n/en-EN/data/system/qualities.json` и `i18n/ru-RU/data/system/qualities.json` недостающими качествами (`thrown`, `silent`, `parry`, `concealed`)
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Импортировать новое оружие из _external_data/weapons.ts





  - Добавить в `data/equipment/weapons.json` оружие, которого нет в текущем файле (сравнить по `imageName`/`id`)
  - Новые записи должны включать поля `qualities` и `damageType`
  - Добавить i18n-записи в `i18n/en-EN/data/equipment/weapons/weapons.json` и `i18n/ru-RU/data/equipment/weapons/weapons.json`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Создать файл силовой брони



  - Создать `data/equipment/powerArmor.json` со всеми наборами из `_external_data/armor.ts` (массив `powerArmor`)
  - Наборы: `frame`, `raiderPower`, `t45`, `t51`, `t60`, `x01`
  - Маппинг `location` → `protectedAreas`: `head→Head`, `torso→Body`, `armLeft→Hand`, `legLeft→Leg`, `all→[Head,Body,Hand,Leg]`
  - Создать `i18n/en-EN/data/equipment/armor/powerArmor.json` и `i18n/ru-RU/data/equipment/armor/powerArmor.json`
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 4. Импортировать новую одежду из _external_data/clothing.ts





  - Сравнить `_external_data/clothing.ts` с `data/equipment/clothes.json` и добавить отсутствующие предметы
  - Добавить i18n-записи в `i18n/en-EN/data/equipment/armor/clothes.json` и `i18n/ru-RU/data/equipment/armor/clothes.json`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 5. Создать файл еды





  - Создать `data/consumables/food.json` со всеми элементами `type: 'food'` из `_external_data/food.ts`
  - Поля: `id`, `itemType: "food"`, `weight`, `cost`, `rarity`, `hpHealed`, `irradiated`, `effectKey`
  - Создать `i18n/en-EN/data/consumables/food.json` и `i18n/ru-RU/data/consumables/food.json`
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 6. Расширить файл напитков





  - Добавить в `data/consumables/drinks.json` все элементы `type: 'drink'` из `_external_data/food.ts`, которых ещё нет
  - Добавить поля `hpHealed` и `irradiated` к новым записям
  - Расширить `i18n/en-EN/data/consumables/drinks.json` и `i18n/ru-RU/data/consumables/drinks.json`
  - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [x] 7. Создать файл перков






  - Создать директорию `data/perks/` и файл `data/perks/perks.json`
  - Импортировать все перки из `_external_data/perks.ts`
  - Маппинг SPECIAL атрибутов: `charisma→CHA`, `strength→STR`, `perception→PER`, `endurance→END`, `agility→AGI`, `intelligence→INT`, `luck→LCK`
  - Создать `i18n/en-EN/data/perks/perks.json` и `i18n/ru-RU/data/perks/perks.json` с полями `id`, `name`, `effect`
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 8. Создать файл общих предметов
  - Расширить или создать `data/equipment/items.json` с предметами из `_external_data/generalGoods.ts`
  - Поля: `id`, `itemType: "item"`, `weight`, `cost`, `rarity`, `category`, `effectKey`
  - Расширить `i18n/en-EN/data/equipment/items.json` и `i18n/ru-RU/data/equipment/items.json`
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 9. Проверить полноту i18n для химикатов
  - Сравнить `data/consumables/chems.json` с `i18n/en-EN/data/consumables/chems.json` и `i18n/ru-RU/data/consumables/chems.json`
  - Добавить недостающие записи в оба файла
  - _Requirements: 4.3, 13.1, 13.2_
