# Requirements Document

## Introduction

Импорт игровых данных из внешнего проекта [Fallout-2d20-helper](https://github.com/handylinux/Fallout-2d20-helper) и адаптация их под существующую структуру данных приложения. Цель — расширить контент приложения: добавить недостающие происхождения, оружие, броню, расходники (химикаты, еда, напитки), перки, одежду и общие предметы. Перевод не требуется на данном этапе — английские значения дублируются в обоих языковых файлах (en-EN и ru-RU).

Исходные данные внешнего проекта скопированы в `_external_data/` (TypeScript-файлы). Структура данных нашего приложения разделена на два слоя:
- `data/` — структурные данные (механики, числа, идентификаторы)
- `i18n/{locale}/data/` — локализованные тексты (названия, описания, подписи эффектов)

Категории данных для импорта из `_external_data/`:
- `armor.ts` — броня (обычная, силовая, роботов, одежда)
- `weapons.ts` — оружие всех типов
- `chems.ts` — химикаты и медикаменты
- `food.ts` — еда и напитки
- `perks.ts` — перки персонажа
- `clothing.ts` — одежда
- `items.ts` — общие предметы и инструменты

## Requirements

### Requirement 1: Импорт происхождений (Origins)

**User Story:** As a game master, I want more origin options available, so that players have a wider variety of character backgrounds to choose from.

#### Acceptance Criteria

1. WHEN the user opens the origin selection screen THEN the system SHALL display all origins imported from the external project that are not already present in `data/origins/origins.json`
2. WHEN a new origin is added THEN the system SHALL include the required fields: `id`, `displayNameKey`, `isRobot`, `canWearStandardArmor`, `canWearRobotArmor`, `canWearMutantArmor`, `traitIds`, `equipmentKitIds`
3. WHEN a new origin is added THEN the system SHALL have a corresponding i18n entry in both `i18n/en-EN` and `i18n/ru-RU` with the same English text in both locales
4. IF an origin from the external project already exists in the local data THEN the system SHALL skip it to avoid duplicates

### Requirement 2: Импорт оружия (Weapons)

**User Story:** As a player, I want access to more weapons, so that I can equip my character with a wider range of options.

#### Acceptance Criteria

1. WHEN the user browses the weapons list THEN the system SHALL display all weapons imported from the external project that are not already present in `data/equipment/weapons.json`
2. WHEN a new weapon is added THEN the system SHALL include the required fields: `id`, `itemType`, `damage`, `fireRate`, `weight`, `cost`, `rarity`, `ammoId`, `range`, `imageName`, `mainAttr`, `mainSkill`, `hasStockVariant`
3. WHEN a new weapon is added THEN the system SHALL have a corresponding i18n entry with `name` field in both locales
4. IF a weapon id already exists in the local data THEN the system SHALL skip it

### Requirement 3: Импорт брони (Armor)

**User Story:** As a player, I want more armor types available, so that I can better protect my character.

#### Acceptance Criteria

1. WHEN the user browses the armor list THEN the system SHALL display all armor types imported from the external project that are not already present in `data/equipment/armor.json`
2. WHEN a new armor type is added THEN the system SHALL follow the existing tiered structure: `{ allowedModCategories, allowedUniqueModCategories, tiers: { standard, sturdy, heavy } }`
3. WHEN a new armor piece is added THEN the system SHALL include: `id`, `itemType`, `protectedAreas`, `imageName`, `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `weight`, `cost`, `rarity`
4. WHEN a new armor type is added THEN the system SHALL have corresponding i18n entries for each piece in both locales
5. IF an armor type already exists in the local data THEN the system SHALL skip it

### Requirement 4: Импорт химикатов (Chems)

**User Story:** As a player, I want more chemical items and medical supplies, so that I have more tactical options during gameplay.

#### Acceptance Criteria

1. WHEN the user browses chems THEN the system SHALL display all chems imported from `_external_data/chems.ts` not already present in `data/consumables/chems.json`
2. WHEN a new chem is added THEN the system SHALL include: `id`, `itemType`, `weight`, `cost`, `rarity`, `positiveEffect`, `negativeEffect`, `positiveEffectDuration`, `negativeEffectDuration`, `addictionLevel`
3. WHEN a new chem is added THEN the system SHALL have a corresponding i18n entry with `name`, `positiveEffectLabel`, `negativeEffectLabel` in both locales
4. IF a chem id already exists in the local data THEN the system SHALL skip it

### Requirement 5: Импорт еды и напитков (Food & Drinks)

**User Story:** As a player, I want more food and drink items, so that I can manage my character's survival needs.

#### Acceptance Criteria

1. WHEN the user browses food/drinks THEN the system SHALL display all items imported from `_external_data/food.ts` not already present in `data/consumables/`
2. WHEN a new food/drink item is added THEN the system SHALL include: `id`, `itemType`, `weight`, `cost`, `rarity`, `hpHealed`, `irradiated`, `effectKey`
3. WHEN a new food/drink item is added THEN the system SHALL have a corresponding i18n entry with `name` and optional `effectLabel` in both locales
4. IF a food/drink id already exists in the local data THEN the system SHALL skip it
5. WHEN a food item has `type: 'food'` THEN the system SHALL store it in `data/consumables/food.json`
6. WHEN a drink item has `type: 'drink'` THEN the system SHALL store it in `data/consumables/drinks.json`

### Requirement 6: Импорт перков (Perks)

**User Story:** As a player, I want access to more perks, so that I can customize my character's abilities.

#### Acceptance Criteria

1. WHEN the user browses perks THEN the system SHALL display all perks imported from `_external_data/perks.ts` not already present in `data/perks/perks.json`
2. WHEN a new perk is added THEN the system SHALL include: `id`, `nameKey`, `maxRanks`, `prerequisites`, `effectKey`
3. WHEN a new perk is added THEN the system SHALL have corresponding i18n entries with `name` and `effect` in both locales
4. IF a perk id already exists in the local data THEN the system SHALL skip it
5. WHEN a perk has prerequisites THEN the system SHALL preserve the prerequisite structure: `special`, `level`, `skills`, `perks`, `excludedPerks`, `notForRobots`, `levelIncreasePerRank`

### Requirement 7: Импорт одежды (Clothing)

**User Story:** As a player, I want more clothing options, so that I can customize my character's appearance and protection.

#### Acceptance Criteria

1. WHEN the user browses clothing THEN the system SHALL display all clothing imported from `_external_data/clothing.ts` not already present in `data/equipment/clothes.json`
2. WHEN a new clothing item is added THEN the system SHALL follow the existing structure in `data/equipment/clothes.json`: `id`, `itemType`, `clothingType`, `allowsArmor`, `protectedAreas`, `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `weight`, `cost`, `rarity`, `specialEffects`
3. WHEN a new clothing item is added THEN the system SHALL have a corresponding i18n entry with `name` and optional `effectLabel` in both locales
4. IF a clothing id already exists in the local data THEN the system SHALL skip it

### Requirement 8: Импорт общих предметов (General Goods)

**User Story:** As a player, I want more utility items and tools, so that I can solve problems in different ways.

#### Acceptance Criteria

1. WHEN the user browses general goods THEN the system SHALL display all items imported from `_external_data/generalGoods.ts` not already present in `data/equipment/`
2. WHEN a new general good is added THEN the system SHALL be stored in a new file `data/equipment/items.json` with fields: `id`, `itemType`, `weight`, `cost`, `rarity`, `type`, `effectKey`
3. WHEN a new general good is added THEN the system SHALL have a corresponding i18n entry with `name` and optional `effectLabel` in both locales
4. IF a general good id already exists in the local data THEN the system SHALL skip it

### Requirement 9: Импорт перков (Perks)

**User Story:** As a player, I want access to more perks, so that I can customize my character's abilities.

#### Acceptance Criteria

1. WHEN the user browses perks THEN the system SHALL display all perks imported from `_external_data/perks.ts` stored in a new file `data/perks/perks.json`
2. WHEN a new perk is added THEN the system SHALL include: `id`, `nameKey`, `maxRanks`, `prerequisites`, `effectKey`
3. WHEN a new perk is added THEN the system SHALL have corresponding i18n entries with `name` and `effect` in both locales
4. WHEN a perk has prerequisites THEN the system SHALL preserve the prerequisite structure: `special`, `level`, `skills`, `perks`, `excludedPerks`, `notForRobots`, `levelIncreasePerRank`

### Requirement 10: Поддержка качеств оружия (Weapon Qualities)

**User Story:** As a player, I want weapon qualities to be visible, so that I know the special properties of each weapon.

#### Acceptance Criteria

1. WHEN a weapon is imported from `_external_data/weapons.ts` THEN the system SHALL include the `qualities` array in the weapon data
2. WHEN a weapon quality is referenced THEN the system SHALL have a corresponding definition in `data/equipment/weapon_qualities.json` with `id`, `nameKey`, `descriptionKey`, and optional `value`
3. WHEN a weapon quality is displayed THEN the system SHALL resolve its name and description from i18n

### Requirement 11: Силовая броня (Power Armor)

**User Story:** As a player, I want to equip power armor, so that my character has access to the most powerful protection in the wasteland.

#### Acceptance Criteria

1. WHEN the user browses armor THEN the system SHALL display power armor sets imported from `_external_data/armor.ts` (powerArmor array)
2. WHEN power armor is added THEN the system SHALL be stored in a new file `data/equipment/powerArmor.json` with fields: `id`, `itemType`, `set`, `protectedAreas`, `physicalDamageRating`, `energyDamageRating`, `radiationDamageRating`, `hp`, `weight`, `cost`, `rarity`
3. WHEN power armor is added THEN the system SHALL have corresponding i18n entries in both locales

### Requirement 12: Импорт черт (Traits)

**User Story:** As a player, I want more origin traits available, so that my character has unique abilities tied to their background.

#### Acceptance Criteria

1. WHEN a new origin is imported THEN the system SHALL also import its associated traits into `data/traits/traits.json`
2. WHEN a new trait is added THEN the system SHALL include: `id`, `originId`, `displayNameKey`, `descriptionKey`, `modifiers`
3. WHEN a new trait is added THEN the system SHALL have corresponding i18n entries with `name` and `description` in both locales
4. IF a trait id already exists in the local data THEN the system SHALL skip it

### Requirement 13: Локализация (i18n)

**User Story:** As a developer, I want all new data to have i18n entries, so that the app doesn't break due to missing translation keys.

#### Acceptance Criteria

1. WHEN any new data item is added THEN the system SHALL create matching entries in `i18n/en-EN/data/` with English text
2. WHEN any new data item is added THEN the system SHALL create matching entries in `i18n/ru-RU/data/` with the same English text (as placeholder until translated)
3. WHEN a `displayNameKey`, `nameKey`, or `descriptionKey` is referenced in structural data THEN the system SHALL have a corresponding key resolvable in the i18n files
