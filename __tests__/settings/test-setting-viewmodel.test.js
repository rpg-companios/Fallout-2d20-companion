// ПРИЁМОЧНЫЙ (патч 286): удалить при приживании мини-сеттинга (МК-3, проводка).
// Логика экрана песочницы вынесена в чистую вью-модель (viewModel.js) —
// этот тест гоняет её без react-native; экран только рисует.

import { describe, expect, it } from 'vitest';
import { getSandboxRegistry } from '../../modules/test-setting/sandbox';
import { buildSandboxViewModel } from '../../modules/test-setting/viewModel';

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

const vmOf = (state, modifiers) =>
  buildSandboxViewModel(getSandboxRegistry().evaluate(state, modifiers));

describe('МК-2: вью-модель песочницы', () => {
  it('полный набор строк: 5 атрибутов, 7 навыков с потолками, 5 производных, 5 заклинаний', () => {
    const vm = vmOf(hero);
    expect(vm.attributes).toHaveLength(5);
    expect(vm.skills).toHaveLength(7);
    expect(vm.derived).toHaveLength(5);
    expect(vm.spells).toHaveLength(5);
    // потолок Колдовства от Интеллекта 9 → 3
    const sorcery = vm.skills.find((s) => s.id === 'test.skill.sorcery');
    expect(sorcery.ceiling).toBe(3);
    expect(sorcery.atCeiling).toBe(false);
  });

  it('производные и счётчики на месте', () => {
    const vm = vmOf(hero);
    expect(vm.derived.find((d) => d.id === 'test.derived.maxMana').value).toBe(11);
    expect(vm.counters).toEqual({ health: 26, mana: 11 });
  });

  it('навык у потолка помечен — кнопка «+» на экране гаснет', () => {
    const vm = vmOf({ ...hero, 'test.skill.sorcery': 3 });
    const sorcery = vm.skills.find((s) => s.id === 'test.skill.sorcery');
    expect(sorcery.atCeiling).toBe(true);
  });

  it('заклинания закрыты гейтом ранга 4, пока Колдовство не дошло до 4', () => {
    const closed = vmOf(hero);
    expect(closed.spells.every((s) => s.gateOk === false)).toBe(true);
    expect(closed.spells.every((s) => s.allowed === false)).toBe(true);

    const master = vmOf({ ...hero, 'test.attr.intellect': 10, 'test.skill.sorcery': 4 });
    expect(master.spells.every((s) => s.gateOk === true)).toBe(true);
    // манна 10 + 4 = 14 — хватает даже на самое дорогое (5)
    expect(master.spells.every((s) => s.allowed === true)).toBe(true);
  });

  it('заклинание может быть открыто гейтом, но не по карману — «мало манны»', () => {
    const poorMage = vmOf({
      ...hero,
      'test.attr.intellect': 10,
      'test.skill.sorcery': 4,
      'test.attr.agility': 0,
      'test.skill.bladeDefense': 0,
      'test.skill.magicDefense': 0,
    });
    // манна = 10 + 4 = 14 — хватает; сделаем манну меньше стоимости пустотного шага (5):
    const broke = vmOf({
      'test.attr.strength': 8,
      'test.attr.agility': 6,
      'test.attr.intellect': 5,
      'test.attr.spirit': 7,
      'test.attr.luck': 5,
      'test.skill.blade': 3,
      'test.skill.bladeDefense': 2,
      'test.skill.sorcery': 4,
      'test.skill.magicDefense': 2,
      'test.skill.aim': 1,
      'test.skill.stealth': 0,
      'test.skill.survival': 0,
    });
    // манна = 5 + 4 = 9; гейт открыт, пустотный шаг (5) по карману, а вот стрела(3)+щит(2)+молния(4) в сумме — нет
    const voidStep = broke.spells.find((s) => s.id === 'test.spell.voidStep');
    expect(voidStep.gateOk).toBe(true);
    expect(voidStep.manaOk).toBe(true);
    expect(poorMage.counters.mana).toBe(14);
  });

  it('бонусы песочницы: +5% и +10% к силе магии видны в строках производных', () => {
    const vm = vmOf(hero, {
      'test.derived.magicPower': [
        { source: 'test.bonus.amulet', operation: '%', value: 5 },
        { source: 'test.bonus.artifact', operation: '%', value: 10 },
      ],
    });
    // сила магии 8 × 1.15 = 9.2 → 9
    expect(vm.derived.find((d) => d.id === 'test.derived.magicPower').value).toBe(9);
  });
});
