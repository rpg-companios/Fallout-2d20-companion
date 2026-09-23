// ПРИЁМОЧНЫЙ (патч 322): правки окна крафта по тестированию владельца.
// 1) Окно категорий прокручивается (на ПК раньше не прокручивалось).
// 2) Квадраты — по 3 в строке; остаток строки: одинокая — по центру,
//    две — от левого края.
// 3) «есть N · нужно M» — рядом с названием материала, не на другом конце.
// 4) Время изготовления подписано явно («время: 1 сут»), вопрос владельца
//    «что такое Выживание 1 сут?» — навык проверки + игровое время работы.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCategoryModel, craftDict } from '../../modules/fallout/crafting/windowModel';
import ruDict from '../../modules/fallout/i18n/ru-RU/screens/inventory/craftingModal.json';
import enDict from '../../modules/fallout/i18n/en-EN/screens/inventory/craftingModal.json';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const modal = readFileSync(
  join(ROOT, 'modules/fallout/screens/InventoryScreen/modals/CraftingModal.js'),
  'utf-8',
);
const styles = readFileSync(
  join(ROOT, 'modules/fallout/styles/CraftingModal.styles.js'),
  'utf-8',
);

describe('Окно крафта — правки по тестированию владельца (322)', () => {
  it('квадраты в ScrollView (окно прокручивается)', () => {
    expect(modal).toContain('<ScrollView style={styles.body}');
    expect(modal).toContain('chunkIntoRows(tiles, 3)');
  });

  it('выравнивание остатка строки: 1 — центр, 2 — от левого края', () => {
    expect(modal).toContain("rowTiles.length === 1 && styles.tileRowCenter");
    expect(modal).toContain("rowTiles.length === 2 && styles.tileRowLeft");
    expect(styles).toContain("tileRowCenter: { justifyContent: 'center' }");
    expect(styles).toContain("tileRowLeft: { justifyContent: 'flex-start' }");
    expect(styles).toContain("tileRow: { flexDirection: 'row', gap: 10");
  });

  it('«есть · нужно» рядом с названием: без space-between, без flex:1 у имени', () => {
    expect(styles).toContain("materialLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8");
    expect(styles).not.toContain("materialName: { color: '#e8e6d9', fontSize: 13, flex: 1 }");
  });

  it('время изготовления подписано явно в обоих словарях', () => {
    expect(ruDict.ui.craftTime).toBe('время: {t}');
    expect(enDict.ui.craftTime).toBe('time: {t}');
    const row = buildCategoryModel('food').find((r) => r.recipeId === 'food_grilled_bloatfly');
    const timeLabel = craftDict().ui.craftTime.split('{t}')[0];
    expect(row.metaLine).toContain(timeLabel);
    expect(row.metaLine).toContain(row.timeLabel); // само значение времени на месте
  });
});
