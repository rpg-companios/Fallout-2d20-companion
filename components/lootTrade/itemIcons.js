// components/lootTrade/itemIcons.js
// Один значок на тип предмета для всех окон обмена (торговец, общий склад).
// Раньше функция жила копией в двух файлах — теперь импортируется.

export const getItemIcon = (itemType) => {
  if (itemType === 'caps') return '💰';
  if (itemType === 'weapon') return '🔫';
  if (itemType === 'armor') return '🛡️';
  if (itemType === 'powerArmor') return '⚡';
  if (itemType === 'clothing' || itemType === 'outfit') return '👕';
  if (itemType === 'ammo') return '🔹';
  if (itemType === 'chem' || itemType === 'chems') return '💊';
  if (itemType === 'drinks') return '🥤';
  if (itemType === 'food') return '🍖';
  if (itemType === 'magazine') return '📖';
  if (itemType === 'junk') return '🗑️';
  if (itemType === 'materials') return '🧰';
  return '📦';
};

export default getItemIcon;
