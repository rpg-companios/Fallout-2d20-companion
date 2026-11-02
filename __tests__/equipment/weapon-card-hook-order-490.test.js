// ПРИЁМОЧНЫЙ (патч 490): при создании персонажа пустые слоты оружия
// сначала показываются без weapon, затем комплект заполняет их. WeaponCard
// обязан вызывать одни и те же хуки в обоих рендерах.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = 'modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';
const source = readFileSync(SRC, 'utf8');
const start = source.indexOf('export const WeaponCard =');
const end = source.indexOf('\n\nconst findLocalizedWeapon', start);
const component = source.slice(start, end);

describe('ПРИЁМОЧНЫЙ (патч 490): WeaponCard сохраняет порядок хуков для пустого слота', () => {
  it('все хуки WeaponCard вызываются до раннего возврата пустого слота', () => {
    const emptySlotReturn = component.indexOf('if (!weapon) {');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(emptySlotReturn).toBeGreaterThanOrEqual(0);

    const hookCalls = [...component.matchAll(/\b(?:useCharacterStore|useAppSettingsStore|useMemo)\s*\(/g)];
    expect(hookCalls.length).toBeGreaterThan(0);
    for (const hook of hookCalls) {
      expect(hook.index, 'hook должен стоять до if (!weapon)').toBeLessThan(emptySlotReturn);
    }
  });

  it('updateItem selector доступен и для пустой карточки, и после выбора оружия', () => {
    const emptySlotReturn = component.indexOf('if (!weapon) {');
    const updateItemSelector = component.indexOf('const updateItem = useCharacterStore((state) => state.updateItem);');
    expect(updateItemSelector).toBeGreaterThanOrEqual(0);
    expect(updateItemSelector).toBeLessThan(emptySlotReturn);
  });
});
