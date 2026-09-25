// ПРИЁМОЧНЫЙ (патч 362): исправление краша «ReferenceError: Cannot access
// 'installRobotWeaponMod' before initialization» (репорт владельца, Web).
// Причина: в 359 селекторы действий стора стояли НИЖЕ handleApplyModification,
// а массив зависимостей useCallback читает их СРАЗУ при рендере → TDZ.
// Проводка: селекторы действий стора обязаны быть объявлены ВЫШЕ колбэков,
// чьи массивы зависимостей их упоминают. Статическая проверка порядка.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = 'modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';

const lineOf = (src, needle) => {
  const i = src.indexOf(needle);
  return i === -1 ? null : src.slice(0, i).split('\n').length;
};

describe('ПРИЁМОЧНЫЙ (патч 362): порядок объявлений — селекторы выше колбэков', () => {
  const src = readFileSync(SRC, 'utf8');

  it('installRobotWeaponMod и uninstallWeaponModFlag объявлены до handleApplyModification', () => {
    const callback = lineOf(src, 'const handleApplyModification = useCallback');
    expect(callback).toBeTruthy();
    for (const sel of [
      'const installRobotWeaponMod = useCharacterStore',
      'const uninstallWeaponModFlag = useCharacterStore',
      'const installWeaponModFlag = useCharacterStore',
    ]) {
      const at = lineOf(src, sel);
      expect(at, sel).toBeTruthy();
      expect(at, `${sel} должен быть выше handleApplyModification (TDZ)`).toBeLessThan(callback);
    }
  });

  it('селекторы внутри компонента, колбэк их получает (deps не пустые)', () => {
    expect(src).toMatch(/installRobotWeaponMod, uninstallWeaponModFlag\]\);/);
  });
});
