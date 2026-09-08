// Патч 214 — ячейки карточек оружия/конечностей.
//
// Владелец: слова «Дистанция» и «Модификация» не помещаются в карточке
// оружия (лейбл 61% / значение 39%, кегль лейбла 11 — БЕЗ сокращений);
// в карточках конечностей «Конечность» заменена на «Часть тела»
// (переносится на две строки), ячейки — 70/30 (в значениях в основном
// числа). Лейблы приходят из словарей — здесь закреплены обе локали и
// кнопка конечности из buildRobotSlotStats.

import { describe, expect, it } from 'vitest';
import { buildRobotSlotStats } from '../../domain/robotSlotLogic';
import { WEAPONS_DICTIONARIES } from '../../modules/fallout/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';

const at = (dict, path) => path.split('.').reduce((acc, part) => acc?.[part], dict);

describe('карточки конечностей: лейбл «Часть тела» (патч 214)', () => {
  it('обе локали: кнопка конечности — «Часть тела» / «Body part», без сокращений', () => {
    expect(at(WEAPONS_DICTIONARIES['ru-RU'], 'robotSlot.buttons.upgradeLimb')).toBe('Часть тела');
    expect(at(WEAPONS_DICTIONARIES['en-EN'], 'robotSlot.buttons.upgradeLimb')).toBe('Body part');
  });

  it('buildRobotSlotStats выдаёт кнопку с лейблом из словаря', () => {
    const t = (path) => at(WEAPONS_DICTIONARIES['ru-RU'], path);
    const { stats } = buildRobotSlotStats('leftArm', { limb: null }, {
      t,
      onUpgradeLimb: () => null,
      onOpenArmorPicker: () => null,
    });
    const limbButton = stats.find((s) => s.type === 'button' && s.onPress);
    expect(limbButton).toMatchObject({ label: 'Часть тела', value: '⋯' });
  });
});

describe('карточки оружия: лейблы без сокращений (патч 214)', () => {
  it('«Дистанция» и «Модификация» — полными словами в обеих локалях', () => {
    expect(at(WEAPONS_DICTIONARIES['ru-RU'], 'weapon.fields.range')).toBe('ДИСТАНЦИЯ');
    expect(at(WEAPONS_DICTIONARIES['ru-RU'], 'weapon.fields.modification')).toBe('Модификация');
    expect(at(WEAPONS_DICTIONARIES['en-EN'], 'weapon.fields.range')).toBe('RANGE');
    expect(at(WEAPONS_DICTIONARIES['en-EN'], 'weapon.fields.modification')).toBe('Modification');
  });

  it('лейблы не обрезаны многоточием и не содержат сокращающей точки', () => {
    const ruRange = at(WEAPONS_DICTIONARIES['ru-RU'], 'weapon.fields.range');
    const ruMod = at(WEAPONS_DICTIONARIES['ru-RU'], 'weapon.fields.modification');
    expect(ruRange).not.toContain('…');
    expect(ruMod).not.toContain('…');
    // «Дист.»/«Модиф.» — не наш случай: точка сокращения в конце слова.
    expect(ruRange.endsWith('.')).toBe(false);
    expect(ruMod.endsWith('.')).toBe(false);
  });
});
