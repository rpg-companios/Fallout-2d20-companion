import { applyNumericModifier, NUMERIC_MODIFIER_OPERATORS } from './numericModifier.js';
import { rangeToIndex } from './range.js';

export const USER_EQUIPMENT_SCHEMA_VERSION = 1;
export const USER_EQUIPMENT_KINDS = Object.freeze(['weapons', 'armor', 'weaponMods', 'armorMods']);

export const USER_EQUIPMENT_FILE_NAMES = Object.freeze({
  weapons: 'usrdataWeapon.json',
  armor: 'usrdataArmor.json',
  weaponMods: 'usrdataWeaponMods.json',
  armorMods: 'usrdataArmorMods.json',
});

const KIND_ITEM_TYPES = Object.freeze({
  weapons: 'weapon',
  armor: 'armor',
  weaponMods: 'weaponMod',
  armorMods: 'armorMod',
});

const NUMERIC_FIELDS = Object.freeze({
  weapons: ['damage', 'fireRate', 'weight', 'cost', 'rarity', 'ammoPerShot', 'physicalDamageRating', 'energyDamageRating', 'radiationDamageRating'],
  armor: ['physicalDamageRating', 'energyDamageRating', 'radiationDamageRating', 'weight', 'cost', 'rarity'],
  weaponMods: ['damageModifier', 'fireRateModifier', 'rangeModifier', 'weightModifier', 'costModifier', 'ammoPerShotDelta'],
  armorMods: ['costModifier', 'weightModifier', 'physicalDamageRating', 'energyDamageRating', 'radiationDamageRating'],
});

const INTEGER_FIELDS = new Set([
  'damage',
  'fireRate',
  'rarity',
  'physicalDamageRating',
  'energyDamageRating',
  'radiationDamageRating',
  'cost',
  'ammoPerShotDelta',
  'rangeModifier',
  'damageModifier',
  'fireRateModifier',
  'costModifier',
]);

const ALLOWED_FIELDS = Object.freeze({
  weapons: new Set([
    'id', 'names', 'itemType', 'trueItemId', 'modifiers',
    'damage', 'fireRate', 'weight', 'cost', 'rarity', 'ammoId', 'range',
    'range_index', 'range_name', 'imageName', 'mainAttr', 'mainSkill',
    'hasStockVariant', 'damageType', 'qualities', 'weaponType', 'effects',
    'withoutMods', 'stockNames', 'ammoPerShot',
  ]),
  armor: new Set([
    'id', 'names', 'itemType', 'trueItemId', 'modifiers', 'armorCategoryKey',
    'protectedAreas', 'imageName', 'physicalDamageRating', 'energyDamageRating',
    'radiationDamageRating', 'weight', 'cost', 'rarity', 'specialEffects',
  ]),
  weaponMods: new Set([
    'id', 'names', 'modType', 'slot', 'prefix', 'complexity', 'perk1', 'perk2',
    'skill', 'rarity', 'materials', 'cost', 'weight', 'applies_to_ids',
    'damageModifier', 'fireRateModifier', 'rangeModifier', 'damageType',
    'damageTypeOverride', 'ammoOverride', 'effectChanges', 'qualityChanges',
    'ammoPerShotDelta', 'weightModifier', 'costModifier',
  ]),
  armorMods: new Set([
    'id', 'names', 'modType', 'modCategory', 'protectedAreas', 'complexity',
    'requiredPerk', 'requiredSkill', 'costModifier', 'weightModifier',
    'statModifiers', 'specialEffects',
  ]),
});

const asError = (code, message, itemId = null) => ({ code, message, itemId });
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const normalizeText = (value) => typeof value === 'string' ? value.trim() : '';

export const getUserEquipmentKindFromFileName = (fileName) => {
  const normalized = String(fileName || '').toLowerCase();
  return USER_EQUIPMENT_KINDS.find((kind) => USER_EQUIPMENT_FILE_NAMES[kind].toLowerCase() === normalized) || null;
};

const idFrom = (entry, keys = ['id']) => {
  if (typeof entry === 'string') return entry;
  for (const key of keys) {
    if (typeof entry?.[key] === 'string') return entry[key];
  }
  return null;
};

const knownIds = (entries, keys) => new Set((entries || []).map((entry) => idFrom(entry, keys)).filter(Boolean));

const validateNameRecord = (names, itemId, errors) => {
  if (!isRecord(names)) {
    errors.push(asError('missingNames', 'Для каждого предмета нужны имена ru-RU и en-EN.', itemId));
    return;
  }
  for (const locale of ['ru-RU', 'en-EN']) {
    if (!normalizeText(names[locale])) {
      errors.push(asError('missingLocaleName', `Не заполнено имя для ${locale}.`, itemId));
    }
  }
};

const validateNumericValue = (value, field, itemId, errors, { integer = INTEGER_FIELDS.has(field) } = {}) => {
  if (!finiteNumber(value) || value < 0) {
    errors.push(asError('invalidNumber', `Поле ${field} должно быть неотрицательным числом.`, itemId));
    return;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push(asError('fractionalInteger', `Поле ${field} должно быть целым числом.`, itemId));
  }
};

const validateOperation = (modifier, field, baseValue, itemId, errors, { integer = false } = {}) => {
  if (!isRecord(modifier) || !NUMERIC_MODIFIER_OPERATORS.includes(modifier.op) || !finiteNumber(modifier.value)) {
    errors.push(asError('invalidModifier', `Для ${field} нужны op из +, -, *, / и числовое value.`, itemId));
    return;
  }
  if (modifier.op === '/' && modifier.value === 0) {
    errors.push(asError('divisionByZero', `Для ${field} нельзя делить на ноль.`, itemId));
    return;
  }
  if (finiteNumber(baseValue)) {
    try {
      applyNumericModifier(baseValue, modifier, { field, integer, min: 0 });
    } catch (error) {
      errors.push(asError('invalidModifierResult', error.message, itemId));
    }
  }
};

const validateIdArray = (value, field, itemId, errors, allowedIds = null, idKeys = ['id']) => {
  if (!Array.isArray(value)) {
    errors.push(asError('invalidList', `${field} должно быть массивом ID.`, itemId));
    return;
  }
  const valid = allowedIds ? knownIds(allowedIds, idKeys) : null;
  value.forEach((entry) => {
    const id = idFrom(entry, idKeys);
    if (!id) errors.push(asError('invalidReference', `В ${field} найден элемент без ID.`, itemId));
    else if (valid && !valid.has(id)) errors.push(asError('unknownReference', `Неизвестный ID "${id}" в ${field}.`, itemId));
  });
};

const validateEffectAndQualityChanges = (changes, field, itemId, errors, ids) => {
  if (!Array.isArray(changes)) {
    errors.push(asError('invalidList', `${field} должно быть массивом.`, itemId));
    return;
  }
  const allowed = ids ? knownIds(ids, ['id', 'qualityId', 'effectId']) : null;
  for (const change of changes) {
    const id = idFrom(change, ['id', 'qualityId', 'effectId']);
    if (!id || !['gain', 'lose'].includes(change?.op)) {
      errors.push(asError('invalidChange', `Каждое изменение в ${field} требует ID и op gain/lose.`, itemId));
    } else if (allowed && !allowed.has(id)) {
      errors.push(asError('unknownReference', `Неизвестный ID "${id}" в ${field}.`, itemId));
    }
  }
};

const validateUnknownFields = (item, kind, errors) => {
  const allowed = ALLOWED_FIELDS[kind];
  for (const key of Object.keys(item)) {
    if (!allowed.has(key) && key !== '_updatedAt') {
      errors.push(asError('unknownField', `Поле "${key}" не поддерживается для ${kind}.`, item.id));
    }
  }
};

const validateCommonNumbers = (item, kind, errors) => {
  for (const field of NUMERIC_FIELDS[kind]) {
    const value = item[field];
    if (value === undefined || value === null) continue;
    if (kind === 'weaponMods' && ['damageModifier', 'fireRateModifier', 'rangeModifier', 'weightModifier', 'costModifier'].includes(field)) {
      validateOperation(value, field, null, item.id, errors, { integer: INTEGER_FIELDS.has(field) });
      continue;
    }
    if (kind === 'armorMods' && ['costModifier', 'weightModifier'].includes(field)) {
      validateOperation(value, field, null, item.id, errors, { integer: field === 'costModifier' });
      continue;
    }
    if (kind === 'armorMods' && ['physicalDamageRating', 'energyDamageRating', 'radiationDamageRating'].includes(field)) continue;
    if (kind === 'weaponMods' && field === 'ammoPerShotDelta') {
      if (!finiteNumber(value)) errors.push(asError('invalidNumber', `${field} должно быть числом.`, item.id));
      else if (!Number.isInteger(value)) errors.push(asError('fractionalInteger', `${field} должно быть целым числом.`, item.id));
      continue;
    }
    validateNumericValue(value, field, item.id, errors);
  }
  if (kind === 'weapons' && item.range_index !== undefined) {
    if (!Number.isInteger(item.range_index) || item.range_index < 0 || item.range_index > 3) {
      errors.push(asError('invalidNumber', 'range_index должен быть целым числом от 0 до 3.', item.id));
    }
  }
};

const validateItem = (item, kind, catalog, errors) => {
  if (!isRecord(item)) {
    errors.push(asError('invalidItem', 'Запись снаряжения должна быть JSON-объектом.'));
    return;
  }
  const itemId = normalizeText(item.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(itemId)) {
    errors.push(asError('invalidId', 'ID должен содержать латинские буквы, цифры, _ или - (до 96 знаков).', itemId || null));
  }
  validateNameRecord(item.names, itemId, errors);
  validateUnknownFields(item, kind, errors);

  if (kind === 'weapons' || kind === 'armor') {
    const expectedType = KIND_ITEM_TYPES[kind];
    if (item.itemType !== undefined && item.itemType !== expectedType) {
      errors.push(asError('wrongItemType', `itemType для ${kind} должен быть "${expectedType}".`, itemId));
    }
    if (item.trueItemId !== undefined && (typeof item.trueItemId !== 'string' || !item.trueItemId.trim())) {
      errors.push(asError('invalidBaseReference', 'trueItemId должен быть ID базового предмета.', itemId));
    }
  }

  if (kind === 'weapons') {
    if (!item.trueItemId) {
      for (const field of ['damage', 'fireRate', 'weight', 'cost', 'rarity']) {
        if (!finiteNumber(item[field]) || item[field] < 0) {
          errors.push(asError('missingOrInvalidStat', `Для самостоятельного оружия нужно заполнить ${field}.`, itemId));
        }
      }
      for (const field of ['ammoId', 'range']) {
        if (typeof item[field] !== 'string') {
          errors.push(asError('missingField', `Для самостоятельного оружия нужно задать ${field} (пустая строка допустима для оружия без патронов/дальности).`, itemId));
        }
      }
      for (const field of ['mainAttr', 'mainSkill', 'weaponType']) {
        if (typeof item[field] !== 'string' || !item[field].trim()) {
          errors.push(asError('missingField', `Для самостоятельного оружия нужно заполнить ${field}.`, itemId));
        }
      }
      const damageTypes = Array.isArray(item.damageType) ? item.damageType : [item.damageType];
      if (!damageTypes.length || damageTypes.some((type) => typeof type !== 'string' || !type.trim())) {
        errors.push(asError('missingField', 'Для самостоятельного оружия нужно задать damageType.', itemId));
      }
    }
    if (item.trueItemId && catalog?.weapons && !catalog.weapons.some((weapon) => weapon.id === item.trueItemId)) {
      errors.push(asError('unknownReference', `Базовое оружие "${item.trueItemId}" не найдено.`, itemId));
    }
    if (item.ammoId && catalog?.ammoTypes && !knownIds(catalog.ammoTypes, ['id']).has(item.ammoId)) {
      errors.push(asError('unknownReference', `Неизвестный ammoId "${item.ammoId}".`, itemId));
    }
    if (catalog?.weapons) {
      const knownSkills = new Set(catalog.weapons.map((weapon) => weapon.mainSkill).filter(Boolean));
      const knownAttributes = new Set(catalog.weapons.map((weapon) => weapon.mainAttr).filter(Boolean));
      const knownWeaponTypes = new Set(catalog.weapons.map((weapon) => weapon.weaponType).filter(Boolean));
      const knownDamageTypes = new Set(catalog.weapons.flatMap((weapon) => (
        Array.isArray(weapon.damageType) ? weapon.damageType : [weapon.damageType]
      )).filter(Boolean));
      if (item.mainSkill && knownSkills.size && !knownSkills.has(item.mainSkill)) {
        errors.push(asError('unknownReference', `Неизвестный mainSkill "${item.mainSkill}".`, itemId));
      }
      if (item.mainAttr && knownAttributes.size && !knownAttributes.has(item.mainAttr)) {
        errors.push(asError('unknownReference', `Неизвестный mainAttr "${item.mainAttr}".`, itemId));
      }
      if (item.weaponType && knownWeaponTypes.size && !knownWeaponTypes.has(item.weaponType)) {
        errors.push(asError('unknownReference', `Неизвестный weaponType "${item.weaponType}".`, itemId));
      }
      const damageTypes = item.damageType === undefined
        ? []
        : (Array.isArray(item.damageType) ? item.damageType : [item.damageType]);
      if (knownDamageTypes.size && damageTypes.some((type) => !knownDamageTypes.has(type))) {
        errors.push(asError('unknownReference', 'damageType должен содержать существующие типы урона.', itemId));
      }
    }
    if (item.qualities !== undefined) validateIdArray(item.qualities, 'qualities', itemId, errors, catalog?.qualities, ['id', 'qualityId']);
    if (item.effects !== undefined) validateIdArray(item.effects, 'effects', itemId, errors, catalog?.damageEffects, ['id', 'effectId']);
    if (item.modifiers !== undefined && !isRecord(item.modifiers)) {
      errors.push(asError('invalidModifiers', 'modifiers должно быть JSON-объектом.', itemId));
    }
    if (isRecord(item.modifiers)) {
      const baseWeapon = item.trueItemId
        ? catalog?.weapons?.find((weapon) => weapon.id === item.trueItemId)
        : item;
      for (const [key, value] of Object.entries(item.modifiers)) {
        if (key === 'replaceOriginalNameTo') continue;
        if (key === 'qualityChanges') {
          validateEffectAndQualityChanges(value, key, itemId, errors, catalog?.qualities);
          continue;
        }
        if (key === 'effectChanges') {
          validateEffectAndQualityChanges(value, key, itemId, errors, catalog?.damageEffects);
          continue;
        }
        if (key === 'rangeModifier') {
          const range = rangeToIndex(baseWeapon?.range_index ?? baseWeapon?.range_name ?? baseWeapon?.rangeName ?? baseWeapon?.range);
          validateOperation(value, 'range', range ?? 0, itemId, errors, { integer: true });
          continue;
        }
        const field = key.endsWith('Modifier') ? key.slice(0, -'Modifier'.length) : null;
        if (!field || !NUMERIC_FIELDS.weapons.includes(field)) {
          errors.push(asError('unknownModifier', `Модификатор "${key}" не поддерживается для оружия.`, itemId));
          continue;
        }
        const baseValue = item[field] !== undefined ? item[field] : baseWeapon?.[field];
        validateOperation(value, field, baseValue, itemId, errors, { integer: INTEGER_FIELDS.has(field) });
      }
    }
  }

  if (kind === 'armor') {
    if (!item.trueItemId) {
      for (const field of ['physicalDamageRating', 'energyDamageRating', 'radiationDamageRating', 'weight', 'cost', 'rarity']) {
        if (!finiteNumber(item[field]) || item[field] < 0) {
          errors.push(asError('missingOrInvalidStat', `Для самостоятельной брони нужно заполнить ${field}.`, itemId));
        }
      }
      if (!Array.isArray(item.protectedAreas) || item.protectedAreas.length === 0) {
        errors.push(asError('missingField', 'Для самостоятельной брони нужно задать protectedAreas.', itemId));
      }
      if (!item.armorCategoryKey || (catalog?.armorRaw && !catalog.armorRaw[item.armorCategoryKey])) {
        errors.push(asError('unknownReference', 'armorCategoryKey должен ссылаться на существующий тип брони.', itemId));
      }
    }
    if (item.trueItemId && catalog?.armorIndex?.byId && !catalog.armorIndex.byId.has(item.trueItemId)) {
      errors.push(asError('unknownReference', `Базовая броня "${item.trueItemId}" не найдена.`, itemId));
    }
    const armorAreas = new Set((catalog?.armorList || []).flatMap((armorItem) => armorItem.protectedAreas || []));
    if (Array.isArray(item.protectedAreas) && armorAreas.size && item.protectedAreas.some((area) => !armorAreas.has(area))) {
      errors.push(asError('unknownReference', 'protectedAreas содержит неизвестную зону брони.', itemId));
    }
    if (item.specialEffects !== undefined) {
      if (!Array.isArray(item.specialEffects)) {
        errors.push(asError('invalidList', 'specialEffects должно быть массивом ID эффектов брони.', itemId));
      } else {
        const effectIds = new Set(Object.keys(catalog?.armorEffects || {}));
        item.specialEffects.forEach((effect) => {
          if (!effect?.id || (effectIds.size && !effectIds.has(effect.id))) {
            errors.push(asError('unknownReference', `Неизвестный эффект брони "${effect?.id || ''}".`, itemId));
          }
        });
      }
    }
    if (item.modifiers !== undefined && !isRecord(item.modifiers)) {
      errors.push(asError('invalidModifiers', 'modifiers должно быть JSON-объектом.', itemId));
    }
    if (item.modifiers && isRecord(item.modifiers)) {
      const baseArmor = item.trueItemId
        ? catalog?.armorIndex?.byId?.get(item.trueItemId)
        : item;
      for (const [key, value] of Object.entries(item.modifiers)) {
        if (key === 'qualityChanges') {
          validateEffectAndQualityChanges(value, key, itemId, errors, catalog?.qualities);
          continue;
        }
        if (key === 'effectChanges') {
          validateEffectAndQualityChanges(value, key, itemId, errors, catalog?.damageEffects);
          continue;
        }
        if (key === 'replaceOriginalNameTo') continue;
        const field = key.endsWith('Modifier') ? key.slice(0, -'Modifier'.length) : null;
        if (!field || !NUMERIC_FIELDS.armor.includes(field)) {
          errors.push(asError('unknownModifier', `Модификатор "${key}" не поддерживается для брони.`, itemId));
          continue;
        }
        const baseValue = item[field] !== undefined ? item[field] : baseArmor?.[field];
        validateOperation(value, field, baseValue, itemId, errors, { integer: INTEGER_FIELDS.has(field) });
      }
    }
  }

  if (kind === 'weaponMods') {
    if (item.modType !== 'weapon') errors.push(asError('wrongModType', 'modType для usrdataWeaponMods должен быть "weapon".', itemId));
    if (!item.slot || typeof item.slot !== 'string') errors.push(asError('missingField', 'Для мода оружия нужен slot.', itemId));
    const knownSlots = new Set((catalog?.weaponMods || []).map((mod) => String(mod.slot || '').toLowerCase()));
    if (item.slot && knownSlots.size && !knownSlots.has(String(item.slot).toLowerCase())) {
      errors.push(asError('unknownReference', `Неизвестный слот оружия "${item.slot}".`, itemId));
    }
    validateIdArray(item.applies_to_ids, 'applies_to_ids', itemId, errors, catalog?.weapons, ['id']);
    for (const field of ['cost', 'weight', 'complexity']) {
      if (item[field] === undefined) continue;
      if (!finiteNumber(item[field]) || item[field] < 0) {
        errors.push(asError('invalidNumber', `${field} должен быть неотрицательным числом.`, itemId));
      } else if (field !== 'weight' && !Number.isInteger(item[field])) {
        errors.push(asError('fractionalInteger', `${field} должен быть целым числом.`, itemId));
      }
    }
    const numericTargets = {
      damageModifier: { field: 'damage', integer: true },
      fireRateModifier: { field: 'fireRate', integer: true },
      rangeModifier: { field: 'range', integer: true },
      weightModifier: { field: 'weight', integer: false },
      costModifier: { field: 'cost', integer: true },
    };
    for (const [modifierKey, config] of Object.entries(numericTargets)) {
      if (!item[modifierKey]) continue;
      for (const weaponId of Array.isArray(item.applies_to_ids) ? item.applies_to_ids : []) {
        const weapon = catalog?.weapons?.find((entry) => entry.id === weaponId);
        if (!weapon) continue;
        const baseValue = config.field === 'range'
          ? rangeToIndex(weapon.range_index ?? weapon.range_name ?? weapon.rangeName ?? weapon.range) ?? 0
          : weapon[config.field];
        validateOperation(item[modifierKey], config.field, baseValue, itemId, errors, { integer: config.integer, min: 0 });
      }
    }
    if (item.qualityChanges !== undefined) validateEffectAndQualityChanges(item.qualityChanges, 'qualityChanges', itemId, errors, catalog?.qualities);
    if (item.effectChanges !== undefined) validateEffectAndQualityChanges(item.effectChanges, 'effectChanges', itemId, errors, catalog?.damageEffects);
    if (item.ammoOverride && catalog?.ammoTypes && !knownIds(catalog.ammoTypes, ['id']).has(item.ammoOverride)) {
      errors.push(asError('unknownReference', `Неизвестный ammoOverride "${item.ammoOverride}".`, itemId));
    }
    if (item.damageType) {
      const knownDamageTypes = new Set((catalog?.weapons || []).flatMap((weapon) => (
        Array.isArray(weapon.damageType) ? weapon.damageType : [weapon.damageType]
      )).filter(Boolean));
      if (typeof item.damageType !== 'string' || (knownDamageTypes.size && !knownDamageTypes.has(item.damageType))) {
        errors.push(asError('unknownReference', `Неизвестный damageType "${item.damageType}".`, itemId));
      }
    }
    if (item.damageTypeOverride) {
      const types = Array.isArray(item.damageTypeOverride.value) ? item.damageTypeOverride.value : [item.damageTypeOverride.value];
      const knownTypes = new Set((catalog?.weapons || []).flatMap((weapon) => Array.isArray(weapon.damageType) ? weapon.damageType : [weapon.damageType]).filter(Boolean));
      if (!['set', 'add'].includes(item.damageTypeOverride.op) || (knownTypes.size && types.some((type) => !knownTypes.has(type)))) {
        errors.push(asError('unknownReference', 'damageTypeOverride должен использовать известные типы урона.', itemId));
      }
    }
  }

  if (kind === 'armorMods') {
    if (!['armor', 'armorUnique'].includes(item.modType)) errors.push(asError('wrongModType', 'modType для мода брони должен быть armor или armorUnique.', itemId));
    const availableCategories = new Set([
      ...(catalog?.armorMods || []).map((mod) => mod.modCategory),
      ...(catalog?.uniqArmorMods || []).map((mod) => mod.modCategory),
    ].filter(Boolean));
    if (!item.modCategory || (availableCategories.size && !availableCategories.has(item.modCategory))) {
      errors.push(asError('unknownReference', `Неизвестная категория мода брони "${item.modCategory || ''}".`, itemId));
    }
    if (!Array.isArray(item.protectedAreas) || item.protectedAreas.length === 0) {
      errors.push(asError('missingField', 'Для мода брони нужно задать protectedAreas.', itemId));
    }
    if (item.complexity !== undefined && (!finiteNumber(item.complexity) || item.complexity < 0)) {
      errors.push(asError('invalidNumber', 'complexity должен быть неотрицательным числом.', itemId));
    } else if (item.complexity !== undefined && !Number.isInteger(item.complexity)) {
      errors.push(asError('fractionalInteger', 'complexity должен быть целым числом.', itemId));
    }
    const effectIds = new Set(Object.keys(catalog?.armorEffects || {}));
    if (Array.isArray(item.specialEffects)) {
      item.specialEffects.forEach((effect) => {
        if (!effect?.id || (effectIds.size && !effectIds.has(effect.id))) {
          errors.push(asError('unknownReference', `Неизвестный эффект брони "${effect?.id || ''}".`, itemId));
        }
      });
    }
    const armorAreas = new Set((catalog?.armorList || []).flatMap((armorItem) => armorItem.protectedAreas || []));
    if (Array.isArray(item.protectedAreas) && armorAreas.size) {
      item.protectedAreas.forEach((area) => {
        if (!armorAreas.has(area)) errors.push(asError('unknownReference', `Неизвестная зона брони "${area}".`, itemId));
      });
    }
    const armorTargets = (catalog?.armorList || []).filter((armorItem) => {
      if (!Array.isArray(item.protectedAreas) || !item.protectedAreas.some((area) => (armorItem.protectedAreas || []).includes(area))) return false;
      const config = catalog?.armorRaw?.[armorItem.armorCategoryKey];
      const categories = item.modType === 'armorUnique'
        ? config?.allowedUniqueModCategories
        : config?.allowedModCategories;
      return (categories || []).includes(item.modCategory);
    });
    for (const field of ['costModifier', 'weightModifier']) {
      if (!item[field]) continue;
      for (const armorItem of armorTargets) {
        validateOperation(item[field], field === 'costModifier' ? 'cost' : 'weight', armorItem[field === 'costModifier' ? 'cost' : 'weight'], itemId, errors, {
          integer: field === 'costModifier',
          min: 0,
        });
      }
    }
    if (isRecord(item.statModifiers)) {
      for (const [field, modifier] of Object.entries(item.statModifiers)) {
        if (!['physicalDamageRating', 'energyDamageRating', 'radiationDamageRating'].includes(field)) {
          errors.push(asError('unknownModifier', `Параметр брони "${field}" не поддерживается.`, itemId));
          continue;
        }
        for (const armorItem of armorTargets) {
          validateOperation(modifier, field, armorItem[field], itemId, errors, { integer: true, min: 0 });
        }
      }
    }
  }

  validateCommonNumbers(item, kind, errors);
};

/**
 * Strictly parse one user equipment file. `catalog` is optional for the pure
 * format checks and should be passed by the settings UI for cross-reference checks.
 */
export const validateUserEquipmentDocument = (rawText, {
  expectedSettingId = null,
  expectedKind = null,
  fileName = null,
  catalog = null,
} = {}) => {
  let document;
  try {
    document = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  } catch (error) {
    return { ok: false, errors: [asError('invalidJson', `JSON не читается: ${error.message}`)] };
  }

  if (!isRecord(document)) return { ok: false, errors: [asError('invalidDocument', 'Файл должен содержать JSON-объект.')] };
  const errors = [];
  const kind = document.kind || getUserEquipmentKindFromFileName(fileName) || expectedKind;

  if (!USER_EQUIPMENT_KINDS.includes(kind)) errors.push(asError('unknownKind', 'Неизвестный kind. Используйте weapons, armor, weaponMods или armorMods.'));
  if (expectedKind && kind !== expectedKind) errors.push(asError('wrongKind', `Ожидался файл типа ${expectedKind}, получен ${kind}.`));
  if (fileName) {
    const kindFromFile = getUserEquipmentKindFromFileName(fileName);
    if (kindFromFile && kindFromFile !== kind) errors.push(asError('wrongKind', `Имя файла ${fileName} не соответствует kind ${kind}.`));
  }
  if (document.schemaVersion !== USER_EQUIPMENT_SCHEMA_VERSION) {
    errors.push(asError('unsupportedSchema', `Поддерживается schemaVersion ${USER_EQUIPMENT_SCHEMA_VERSION}.`));
  }
  if (typeof document.settingId !== 'string' || !document.settingId.trim()) {
    errors.push(asError('missingSettingId', 'В файле нужен settingId сеттинга.'));
  } else if (expectedSettingId && document.settingId !== expectedSettingId) {
    errors.push(asError('wrongSetting', `Файл предназначен для сеттинга ${document.settingId}, а выбран ${expectedSettingId}.`));
  }
  if (!Array.isArray(document.items)) errors.push(asError('invalidItems', 'Поле items должно быть массивом.'));
  if (errors.length) return { ok: false, errors };

  let catalogForValidation = catalog;
  if (kind === 'weapons') {
    catalogForValidation = {
      ...(catalog || {}),
      weapons: [...(catalog?.weapons || []), ...document.items],
    };
  } else if (kind === 'armor') {
    const byId = new Map(catalog?.armorIndex?.byId || []);
    document.items.forEach((item) => { if (item?.id) byId.set(item.id, item); });
    catalogForValidation = {
      ...(catalog || {}),
      armorList: [...(catalog?.armorList || []), ...document.items],
      armorIndex: { ...(catalog?.armorIndex || {}), byId },
    };
  }

  const seenIds = new Set();
  document.items.forEach((item) => {
    if (item?.id && seenIds.has(item.id)) errors.push(asError('duplicateSourceId', `В файле повторяется ID "${item.id}".`, item.id));
    if (item?.id) seenIds.add(item.id);
    validateItem(item, kind, catalogForValidation, errors);
  });

  if (kind === 'weapons' || kind === 'armor') {
    const entries = kind === 'weapons'
      ? catalogForValidation?.weapons || []
      : catalogForValidation?.armorList || [];
    const byId = new Map(entries.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
    for (const item of document.items) {
      const visited = new Set([item?.id].filter(Boolean));
      let parentId = item?.trueItemId;
      while (parentId) {
        if (visited.has(parentId)) {
          errors.push(asError('cyclicBaseReference', `Циклическая цепочка trueItemId у "${item.id}".`, item.id));
          break;
        }
        visited.add(parentId);
        parentId = byId.get(parentId)?.trueItemId;
      }
    }
  }

  return errors.length
    ? { ok: false, errors }
    : {
      ok: true,
      kind,
      settingId: document.settingId,
      schemaVersion: document.schemaVersion,
      items: document.items.map((item) => ({ ...item })),
      document,
      errors: [],
    };
};

/**
 * Build the Drive representation for one collection. Per-record timestamps make
 * additions from separate devices mergeable rather than last-file-writer-wins.
 */
export const makeUserEquipmentDocument = ({ settingId, kind, items = [], updatedAt = Date.now() }) => ({
  schemaVersion: USER_EQUIPMENT_SCHEMA_VERSION,
  settingId,
  kind,
  updatedAt,
  items: [...items],
});

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
};

/** Merge by source ID, preferring the most recently edited record. */
export const mergeUserEquipmentRecords = (localItems = [], remoteItems = []) => {
  const byId = new Map();
  for (const item of [...remoteItems, ...localItems]) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    const localTime = Number(item._updatedAt || item.updatedAt || 0);
    const existingTime = Number(existing._updatedAt || existing.updatedAt || 0);
    if (localTime > existingTime || (localTime === existingTime && stableJson(item) > stableJson(existing))) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const hashSuffix = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 7);
};

const normalizeNameForCollision = (value) => normalizeText(value).normalize('NFKC').toLocaleLowerCase();
const addVersionSuffix = (name, number = 1) => {
  const suffix = number === 1 ? ' (ver.)' : ` (ver. ${number})`;
  return `${normalizeText(name).replace(/ \(ver\.(?: \d+)?\)$/i, '')}${suffix}`;
};

const resolveCollisionId = (id, kind, settingId, usedIds) => {
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }
  const base = `${id}__usr_${hashSuffix(`${settingId}:${kind}:${id}`)}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) candidate = `${base}_${suffix++}`;
  usedIds.add(candidate);
  return candidate;
};

const referenceId = (value, idMaps, kinds, baseIds) => {
  if (typeof value !== 'string') return value;
  if (baseIds.has(value)) return value;
  for (const kind of kinds) {
    const mapped = idMaps[kind]?.get(value);
    if (mapped) return mapped;
  }
  return value;
};

/**
 * Turn persisted source entries into the localized overlay used by the real
 * catalog pipeline. IDs are normalized deterministically and user names never
 * mutate the source JSON stored locally/Drive.
 */
export const buildUserEquipmentOverlay = ({
  settingId,
  userData = {},
  locale,
  catalog,
}) => {
  const usedIds = new Set([
    ...(catalog?.weapons || []).map((item) => item.id),
    ...(catalog?.armorList || []).map((item) => item.id),
    ...[...(catalog?.armorIndex?.byId?.values?.() || [])].map((item) => item.id),
    ...(catalog?.weaponMods || []).map((item) => item.id),
    ...(catalog?.armorMods || []).map((item) => item.id),
    ...(catalog?.uniqArmorMods || []).map((item) => item.id),
  ].filter(Boolean));
  const baseIds = new Set(usedIds);
  const idMaps = Object.fromEntries(USER_EQUIPMENT_KINDS.map((kind) => [kind, new Map()]));
  const userEntries = Object.fromEntries(USER_EQUIPMENT_KINDS.map((kind) => [
    kind,
    [...(userData[kind] || [])].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || ''))),
  ]));

  // Allocate every custom ID first so cross-file references can be rewritten consistently.
  for (const kind of USER_EQUIPMENT_KINDS) {
    for (const item of userEntries[kind]) {
      if (item?.id) idMaps[kind].set(item.id, resolveCollisionId(item.id, kind, settingId, usedIds));
    }
  }

  const usedNames = Object.fromEntries(['ru-RU', 'en-EN'].map((language) => [
    language,
    new Set([
      ...(catalog?.weapons || []),
      ...(catalog?.armorList || []),
      ...[...(catalog?.armorIndex?.byId?.values?.() || [])],
      ...(catalog?.weaponMods || []),
      ...(catalog?.armorMods || []),
      ...(catalog?.uniqArmorMods || []),
    ].map((item) => normalizeNameForCollision(item.name)).filter(Boolean)),
  ]));

  const localized = {};
  for (const kind of USER_EQUIPMENT_KINDS) {
    localized[kind] = userEntries[kind].map((source) => {
      const id = idMaps[kind].get(source.id) || source.id;
      const names = { ...(source.names || {}) };
      for (const language of ['ru-RU', 'en-EN']) {
        const normalized = normalizeNameForCollision(names[language]);
        if (usedNames[language].has(normalized)) {
          let candidate = addVersionSuffix(names[language]);
          let suffixNumber = 2;
          while (usedNames[language].has(normalizeNameForCollision(candidate))) {
            candidate = addVersionSuffix(names[language], suffixNumber++);
          }
          names[language] = candidate;
        }
        usedNames[language].add(normalizeNameForCollision(names[language]));
      }

      const item = { ...source, id, name: names[locale] };
      delete item.names;
      delete item._updatedAt;
      delete item.updatedAt;
      if (kind === 'weapons') {
        item.itemType = 'weapon';
        if (item.trueItemId) item.trueItemId = referenceId(item.trueItemId, idMaps, ['weapons'], baseIds);
        if (item.modifiers?.replaceOriginalNameTo) {
          item.modifiers = {
            ...item.modifiers,
            replaceOriginalNameTo: referenceId(item.modifiers.replaceOriginalNameTo, idMaps, ['weapons'], baseIds),
          };
        }
      } else if (kind === 'armor') {
        item.itemType = 'armor';
        if (item.trueItemId) item.trueItemId = referenceId(item.trueItemId, idMaps, ['armor'], baseIds);
      } else if (kind === 'weaponMods') {
        item.modType = 'weapon';
        item.applies_to_ids = (item.applies_to_ids || []).map((weaponId) => referenceId(weaponId, idMaps, ['weapons'], baseIds));
      }
      return item;
    });
  }

  return localized;
};

export const createUserEquipmentTemplate = (kind, settingId = 'fallout') => {
  const examples = {
    weapons: {
      id: 'usr_weapon_44_enhanced',
      names: { 'ru-RU': 'Револьвер .44 усиленный', 'en-EN': 'Enhanced .44 Pistol' },
      trueItemId: 'weapon_44_pistol',
      modifiers: { damageModifier: { op: '+', value: 2 } },
    },
    armor: {
      id: 'usr_raider_chest_reinforced',
      names: { 'ru-RU': 'Укреплённый рейдерский нагрудник', 'en-EN': 'Reinforced Raider Chest Armor' },
      trueItemId: 'armor_raider_chest_001',
      modifiers: { physicalDamageRatingModifier: { op: '+', value: 1 } },
    },
    weaponMods: {
      id: 'usr_assault_receiver',
      names: { 'ru-RU': 'Усиленный ресивер', 'en-EN': 'Reinforced Receiver' },
      modType: 'weapon',
      slot: 'Receiver',
      complexity: 1,
      cost: 10,
      weight: 0,
      applies_to_ids: ['weapon_assault_rifle'],
      damageModifier: { op: '+', value: 1 },
    },
    armorMods: {
      id: 'usr_standard_reinforcement',
      names: { 'ru-RU': 'Дополнительная пластина', 'en-EN': 'Reinforcement Plate' },
      modType: 'armor',
      modCategory: 'standardMods',
      protectedAreas: ['Body'],
      complexity: 1,
      requiredPerk: '',
      requiredSkill: 'REPAIR',
      costModifier: { op: '+', value: 2 },
      weightModifier: { op: '+', value: 1 },
      statModifiers: {
        physicalDamageRating: { op: '+', value: 1 },
        energyDamageRating: { op: '+', value: 0 },
        radiationDamageRating: { op: '+', value: 0 },
      },
      specialEffects: [],
    },
  };
  if (!USER_EQUIPMENT_KINDS.includes(kind)) throw new Error(`Unknown user equipment kind: ${kind}`);
  return {
    schemaVersion: USER_EQUIPMENT_SCHEMA_VERSION,
    settingId,
    kind,
    items: [examples[kind]],
  };
};
