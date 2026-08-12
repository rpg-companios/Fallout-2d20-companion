// domain/meleeSlot.js
// Виртуальная рукопашная атака всегда присутствует в первом слоте оружия:
//   - у людей — кулаки (`unarmed_human`, weaponType 'Unarmed', isBuiltin);
//   - у роботов — манипулятор конечности (weaponType 'Unarmed', isBuiltin).
// Она не предмет инвентаря, её нельзя снять/продать. Экран снаряжения может
// СКРЫТЬ её карточку по настройке игрока — тогда первый слот занимает оружие.

export function isUnarmedAttack(weapon) {
  if (!weapon) return false;
  const weaponType = weapon.weaponType ?? weapon.weapon_type;
  return weaponType === 'Unarmed' && weapon.isBuiltin === true;
}

export function applyUnarmedVisibility(weapons, visible) {
  if (visible) return weapons;
  return (weapons || []).filter((w) => !isUnarmedAttack(w));
}