// ПРИЁМОЧНЫЙ (патч 285): удалить при приживании мини-сеттинга (МК-3, проводка).
// База эквивалентности серии: пока каскад не подключён к хранилищу, этот тест
// доказывает критерий контракта — «сеттинг описывается регистрацией без правок
// движка» (docs/architecture/cascade-map.md §8, слово владельца).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkRequirements } from '../../src/engine/contracts';
import { createDerivationRegistry } from '../../src/engine/derivations/registry';
import {
  ATTRIBUTES,
  RANK_BANDS,
  SKILLS,
  SPELLS,
  TEST_SETTING,
  rankCeilingId,
  registerTestSetting,
} from '../../modules/test-setting';

const registry = createDerivationRegistry();
registerTestSetting(registry);

const hero = {
  'test.attr.strength': 8,
  'test.attr.agility': 6,
  'test.attr.intellect': 9,
  'test.attr.spirit': 7,
  'test.attr.luck': 5,
  'test.skill.blade': 3,
  'test.skill.bladeDefense': 2,
  'test.skill.sorcery': 2,
  'test.skill.magicDefense': 2,
  'test.skill.aim': 1,
  'test.skill.stealth': 0,
  'test.skill.survival': 0,
};

describe('МК-2: тестовый сеттинг — спека владельца §8', () => {
  it('состав: 5 атрибутов, 7 навыков, 5 производных, 5 заклинаний', () => {
    expect(ATTRIBUTES).toHaveLength(5);
    expect(SKILLS).toHaveLength(7);
    const named = TEST_SETTING.derived.filter((d) => d.kind !== 'rankCeiling');
    expect(named.map((d) => d.id).sort()).toEqual(
      [
        'test.derived.attack',
        'test.derived.defense',
        'test.derived.magicPower',
        'test.derived.maxHealth',
        'test.derived.maxMana',
      ].sort(),
    );
    expect(SPELLS).toHaveLength(5);
  });

  it('атрибуты влияют на производные: каскад без ручных пересчётов', () => {
    const { values } = registry.evaluate(hero);
    expect(values['test.derived.maxHealth']).toBe(26); // 10 + 8×2
    expect(values['test.derived.maxMana']).toBe(11); // 9 + 2
    expect(values['test.derived.magicPower']).toBe(8); // 7 + ⌊2/2⌋
    expect(values['test.derived.defense']).toBe(8); // 6 + ⌊(2+2)/2⌋
    expect(values['test.derived.attack']).toBe(10); // 8 + ⌊(3+1)/2⌋
  });

  it('мана = атрибут + навык (дословно): Колдовство подросло — манна выросла', () => {
    const grown = { ...hero, 'test.skill.sorcery': 4 };
    expect(registry.evaluate(grown).values['test.derived.maxMana']).toBe(13);
  });

  it('+5/10/15% к силе магии / защите от магии — модификаторами производных', () => {
    const { values } = registry.evaluate(hero, {
      'test.derived.magicPower': [
        { source: 'item.amulet', operation: '%', value: 5 },
        { source: 'item.artifact', operation: '%', value: 10 },
      ],
      'test.derived.defense': [{ source: 'item.mantle', operation: '%', value: 15 }],
    });
    // сила магии: 8 × (1 + 5% + 10%) = 9.2 → 9
    expect(values['test.derived.magicPower']).toBe(9);
    // защита: 8 × 1.15 = 9.2 → 9
    expect(values['test.derived.defense']).toBe(9);
  });

  it('потолки счётчиков тянут производные', () => {
    const { ceilings } = registry.evaluate(hero);
    expect(ceilings['test.counter.health']).toBe(26);
    expect(ceilings['test.counter.mana']).toBe(11);
  });
});

describe('МК-2: потолки рангов и гейты', () => {
  it('число рангов навыка зависит от атрибута (ступени)', () => {
    const { values } = registry.evaluate(hero);
    // Интеллект 9 → потолок Колдовства 3; Сила 8 → потолок Клинков 3
    expect(values[rankCeilingId('test.skill.sorcery')]).toBe(3);
    expect(values[rankCeilingId('test.skill.blade')]).toBe(3);
    const novice = { ...hero, 'test.attr.intellect': 3 };
    expect(registry.evaluate(novice).values[rankCeilingId('test.skill.sorcery')]).toBe(1);
    const master = { ...hero, 'test.attr.intellect': 10 };
    expect(registry.evaluate(master).values[rankCeilingId('test.skill.sorcery')]).toBe(4);
  });

  it('гейт «навык ранга 4»: все заклинания за ним', () => {
    expect(SPELLS.every((s) => s.requirement.minRank === 4)).toBe(true);
    // Колдовство 3 — гейт закрыт
    expect(checkRequirements([SPELLS[0].requirement], { 'test.skill.sorcery': 3 }).ok).toBe(false);
    // Колдовство 4 — открыт
    expect(checkRequirements([SPELLS[0].requirement], { 'test.skill.sorcery': 4 }).ok).toBe(true);
  });

  it('правило в правиле: ранг 4 недостижим, пока атрибут не даёт потолок 4', () => {
    // Интеллект 9 → потолок Колдовства 3 → гейт ранга 4 закрыт «железно»
    expect(registry.evaluate(hero).values[rankCeilingId('test.skill.sorcery')]).toBeLessThan(4);
    const master = { ...hero, 'test.attr.intellect': 10 };
    expect(registry.evaluate(master).values[rankCeilingId('test.skill.sorcery')]).toBe(4);
  });

  it('заклинания тратят манну: стоимость укладывается в потолок', () => {
    // Колдовство 4 и Интеллект 9 → манна 13: стрела(3) + щит(2) + молния(4) = 9 ≤ 13
    const grown = { ...hero, 'test.skill.sorcery': 4 };
    const { ceilings } = registry.evaluate(grown);
    const spend = SPELLS.slice(0, 3).reduce((acc, s) => acc + s.manaCost, 0);
    expect(spend).toBeLessThanOrEqual(ceilings['test.counter.mana']);
    // и отдельно: самое дорогое заклинание по карману мастеру
    const costliest = Math.max(...SPELLS.map((s) => s.manaCost));
    expect(costliest).toBeLessThanOrEqual(ceilings['test.counter.mana']);
  });
});

describe('МК-2: критерий «без правок движка»', () => {
  it('модуль импортирует только контракт движка и свои файлы', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const files = [
      `${here}../../modules/test-setting/index.js`,
      `${here}../../modules/test-setting/spells.js`,
    ];
    const allowed = /from\s+'(\.\.\/)+src\/engine\/|from\s+'\.\/spells'/;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const imports = source.match(/from\s+'[^']+'/g) ?? [];
      for (const line of imports) {
        expect(allowed.test(line), `${file}: посторонний импорт ${line}`).toBe(true);
      }
    }
  });

  it('декларация проходит дверь JS→TS (validateSettingExtension)', () => {
    // registerTestSetting уже вызван наверху и не бросил — форма валидна;
    // двойная регистрация отклоняется (защита от повторного импорта-регистрации)
    expect(() => registerTestSetting(registry)).toThrow(/уже зарегистрирован/);
  });
});
