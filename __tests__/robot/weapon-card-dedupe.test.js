// __tests__/robot/weapon-card-dedupe.test.js
//
// Правило владельца: дедупликация одинаковых атак — забота экрана, а не
// модели. Домен обязан отдавать каждую атаку; экран сводит одинаковые
// карточки к одной, без счётчика и пометок.

import { describe, it, expect } from 'vitest';

import { attacksFromSlot, collectAttacks } from '../../domain/robotSlots';
import {
  dedupeWeaponCards,
  weaponFingerprint,
} from '../../modules/fallout/screens/WeaponsAndArmorScreen/dedupeWeaponCards';

describe('домен: одинаковые атаки не склеиваются', () => {
  it('в ладони то же оружие, что и встроено, — две карточки', () => {
    // Рука секьюритрона бьёт манипулятором; в ладонь игрок взял точно такой
    // же манипулятор. Сутей две, домен обязан отдать обе.
    const attacks = attacksFromSlot({
      content: 'robot_arm_securitron',
      heldWeaponId: 'robot_weapon_manipulator',
    }, { slotId: 'leftArm' });

    expect(attacks).toHaveLength(2);
    expect(attacks.map((a) => a.source).sort()).toEqual(['builtin', 'held']);
    expect(new Set(attacks.map((a) => a.instanceKey)).size).toBe(2);
  });

  it('установка с тем же id, что в ладони, — тоже две карточки', () => {
    const attacks = attacksFromSlot({
      content: 'robot_arm_securitron',
      heldWeaponId: 'weapon_laser_gun',
      installedWeapons: [{ id: 'weapon_laser_gun', modIds: [] }],
    }, { slotId: 'leftArm' });

    expect(attacks).toHaveLength(3); // ладонь + манипулятор + установка
    const lasers = attacks.filter((a) => a.id === 'weapon_laser_gun');
    expect(lasers).toHaveLength(2);
    expect(lasers.map((a) => a.source).sort()).toEqual(['held', 'installed']);
  });

  it('две одинаковые руки дают две карточки и в общем сборе', () => {
    const cards = collectAttacks({
      arm1: { content: 'robot_arm_mister_handy' },
      arm3: { content: 'robot_arm_mister_handy' },
    });
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.sourceSlot).sort()).toEqual(['arm1', 'arm3']);
  });
});

describe('экран: одинаковые карточки сводятся к одной', () => {
  const card = (id, mods = {}) => ({ id, weaponId: id, name: id, appliedMods: mods });

  it('две одинаковые — остаётся одна, без счётчика', () => {
    const list = [card('robot_weapon_manipulator'), card('robot_weapon_manipulator')];
    const result = dedupeWeaponCards(list);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBeUndefined();
    expect(result[0].name).toBe('robot_weapon_manipulator');
  });

  it('порядок сохраняется, первая карточка побеждает', () => {
    const list = [card('a'), card('b'), card('a'), card('c'), card('b')];
    expect(dedupeWeaponCards(list).map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('разные моды — разные карточки', () => {
    const list = [
      card('weapon_10mm_smg'),
      card('weapon_10mm_smg', { Receiver: 'mod_001' }),
    ];
    expect(dedupeWeaponCards(list)).toHaveLength(2);
  });

  it('оружие с разными id не склеивается', () => {
    expect(dedupeWeaponCards([card('a'), card('b')])).toHaveLength(2);
  });

  it('отпечаток одинаков у карточек из разных рук', () => {
    const fromDomain = collectAttacks({
      arm1: { content: 'robot_arm_mister_handy' },
      arm3: { content: 'robot_arm_mister_handy' },
    });
    expect(weaponFingerprint(fromDomain[0])).toBe(weaponFingerprint(fromDomain[1]));
    expect(dedupeWeaponCards(fromDomain)).toHaveLength(1);
  });

  it('мусор во входе не роняет экран', () => {
    expect(dedupeWeaponCards([])).toEqual([]);
    expect(dedupeWeaponCards(null)).toEqual([]);
    expect(dedupeWeaponCards([null, undefined, card('a')])).toHaveLength(3);
  });
});
