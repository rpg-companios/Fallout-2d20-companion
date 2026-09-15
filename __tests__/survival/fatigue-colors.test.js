// Патч 231 (решение владельца): индикация состояний выживания — цветом,
// без текстовых подсказок. Шкала: потолок — обычный цвет ('ok'), дальше
// серый, серо-жёлтый, жёлто-красный, на дне красный. У воды 4 ступени —
// «жёлто-красный» пропущен (дно сразу красное).
//
// Заодно (тот же патч): разбивка источников усталости в скобках (патч 217)
// убрана из панели «Эффекты» — происхождение усталости видно по цветам
// состояний; строка снова просто «Усталость N». Доменная разбивка
// (fatigueSourceBreakdown) и i18n-ключи 217 остаются — их не трогали.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ladderColorKey } from '../../modules/fallout/survival/survival';

describe('ladderColorKey: цвет состояния лестницы', () => {
  it('еда и сон (5 ступеней): ok → grey → yellow → orange → red', () => {
    for (const ladder of ['food', 'sleep']) {
      expect(ladderColorKey(ladder, 5)).toBe('ok');
      expect(ladderColorKey(ladder, 4)).toBe('grey');
      expect(ladderColorKey(ladder, 3)).toBe('yellow');
      expect(ladderColorKey(ladder, 2)).toBe('orange');
      expect(ladderColorKey(ladder, 1)).toBe('red');
    }
  });

  it('вода (4 ступени): жёлто-красный пропущен, дно сразу красное', () => {
    expect(ladderColorKey('water', 4)).toBe('ok');
    expect(ladderColorKey('water', 3)).toBe('grey');
    expect(ladderColorKey('water', 2)).toBe('yellow');
    expect(ladderColorKey('water', 1)).toBe('red');
  });

  it('выход за границы трактуется консервативно (выше потолка — ок)', () => {
    expect(ladderColorKey('food', 6)).toBe('ok');
  });
});

describe('экран: окраска значений и строка усталости без скобок', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js'),
    'utf8',
  );
  const stylesSource = fs.readFileSync(
    path.resolve(__dirname, '../../styles/WeaponsAndArmorScreen.styles.js'),
    'utf8',
  );

  it('значения Голод/Жажда/Сон окрашиваются через ladderColorKey', () => {
    expect(source).toContain("ladderColorKey('food', survival.food)");
    expect(source).toContain("ladderColorKey('water', survival.water)");
    expect(source).toContain("ladderColorKey('sleep', survival.sleep)");
    for (const key of ['survivalValueGrey', 'survivalValueYellow', 'survivalValueOrange', 'survivalValueRed']) {
      expect(stylesSource).toContain(`${key}:`);
    }
  });

  it('строка усталости — без разбивки источников (патч 217 снят с рендера)', () => {
    expect(source).not.toContain('survival.fatigueSources');
    expect(source).not.toContain('fatigueSourceJoin');
    expect(source).toContain("tWeaponsAndArmorScreen(`survival.${row.key}`)");
  });

  it('i18n-ключи 217 не удалялись (формат словарей не менялся)', () => {
    const ru = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../modules/fallout/i18n/ru-RU/screens/weaponsAndArmor/screen.json'),
      'utf8',
    ));
    expect(ru.survival.fatigueSources).toBe('Усталость {n} ({sources})');
  });
});
