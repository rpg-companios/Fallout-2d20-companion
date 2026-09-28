// ПРИЁМОЧНЫЙ (патч 397): «приложение не находит иконку ammo для карточек
// крафта. Может можно что-то типа bullet или shotgun shell?» (владелец).
// В CATEGORY_ICONS стояло ammo: 'ammo' — глифа «ammo» в подключённом
// MaterialCommunityIcons НЕТ (и «shotgun»/«shell» тоже нет), квадрат
// боеприпасов рисовался пустым. Теперь ammo: 'bullet' (глиф есть).
// Заслон: КАЖДОЕ имя иконки категорий обязано существовать в глифмапе
// шрифта @expo/vector-icons — имена проверяются по факту, не по памяти.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const GLYPHMAP_PATH =
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

// Имена читаем из исходника (RN-файл в vitest не импортируется).
const categoryIcons = () => {
  const src = readFileSync('modules/fallout/screens/InventoryScreen/modals/CraftingModal.js', 'utf8');
  const block = /const CATEGORY_ICONS = \{([\s\S]*?)\};/.exec(src)[1];
  const icons = {};
  for (const [, key, name] of block.matchAll(/(\w+):\s*'([\w-]+)'/g)) {
    icons[key] = name;
  }
  return icons;
};

describe('патч 397: иконки квадратов крафта существуют в шрифте', () => {
  it('все имена CATEGORY_ICONS есть в глифмапе MaterialCommunityIcons', () => {
    const glyphmap = JSON.parse(readFileSync(GLYPHMAP_PATH, 'utf8'));
    const icons = categoryIcons();
    expect(Object.keys(icons).length).toBeGreaterThanOrEqual(8);
    for (const [category, name] of Object.entries(icons)) {
      expect(glyphmap, `иконка «${name}» категории «${category}» отсутствует в шрифте`).toHaveProperty(name);
    }
  });

  it('боеприпасы — bullet (глиф есть; «ammo» в шрифте нет)', () => {
    const glyphmap = JSON.parse(readFileSync(GLYPHMAP_PATH, 'utf8'));
    expect(glyphmap).toHaveProperty('bullet');
    expect(glyphmap).not.toHaveProperty('ammo');
    expect(categoryIcons().ammo).toBe('bullet');
  });

  it('фолбэк пустой категории тоже существует в шрифте', () => {
    const glyphmap = JSON.parse(readFileSync(GLYPHMAP_PATH, 'utf8'));
    expect(glyphmap).toHaveProperty('circle-outline');
  });
});
