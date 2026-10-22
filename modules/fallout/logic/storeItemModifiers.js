// Fallout-specific interpretation of stored weapon-mod payloads.
import { catalogGetWeaponModById } from 'engine:db/catalogSource';

export const applyFalloutStoredItemModifiers = (item) => {
  const appliedMods = item?.appliedMods || {};
  if (!item || Object.keys(appliedMods).length === 0) return item;

  const updatedItem = { ...item };

  // For each mod, apply its modifiers to the item parameters
  Object.entries(appliedMods).forEach(([slot, modId]) => {
    const mod = catalogGetWeaponModById(modId);
    if (!mod) return;

    // Apply damage modifier
    if (mod.damageModifier && updatedItem.damage) {
      const modValue = Number(mod.damageModifier.value) || 0;
      updatedItem.damage.modifiers.push({
        source: `mod_${modId}`,
        value: modValue,
        operation: mod.damageModifier.op || '+',
      });
    }

    // Apply fireRate modifier
    if (mod.fireRateModifier && updatedItem.fireRate) {
      const modValue = Number(mod.fireRateModifier.value) || 0;
      updatedItem.fireRate.modifiers.push({
        source: `mod_${modId}`,
        value: modValue,
        operation: mod.fireRateModifier.op || '+',
      });
    }

    // Apply range modifier (if mod has range changes).
    // range is a plain value now; only push a modifier if it is in Parameter shape.
    if (mod.rangeModifier && updatedItem.range && Array.isArray(updatedItem.range.modifiers)) {
      const modValue = Number(mod.rangeModifier.value) || 0;
      updatedItem.range.modifiers.push({
        source: `mod_${modId}`,
        value: modValue,
        operation: mod.rangeModifier.op || '+',
      });
    }

    // Apply damageTypeOverride (if mod changes damage type).
    if (mod.damageTypeOverride) {
      const { op, value } = mod.damageTypeOverride;

      // Получаем текущий damageType (поддержка массива и строки)
      let currentType = updatedItem.damageType;
      if (typeof currentType === 'string') {
        try {
          currentType = JSON.parse(currentType);
        } catch {
          currentType = [currentType];
        }
      }
      if (!Array.isArray(currentType)) {
        currentType = currentType ? [currentType] : ['physical'];
      }

      if (op === 'set') {
        // Замена: полностью перезаписываем массив
        updatedItem.damageType = Array.isArray(value) ? value : [value];
      } else if (op === 'add') {
        // Добавление: добавляем тип, если его нет
        const typesToAdd = Array.isArray(value) ? value : [value];
        for (const t of typesToAdd) {
          if (!currentType.includes(t)) {
            currentType.push(t);
          }
        }
        updatedItem.damageType = currentType;
      }
    }
  });

  return updatedItem;
};
