// ПРИЁМОЧНЫЙ (патч 383): в модалке улучшений видно, ЧТО ДЕЛАЕТ мод
// (жалоба владельца: «нет описания. Никаких»). Описания в i18n-записях нет
// (только id+name) — описание ГЕНЕРИРУЕТСЯ из механики мода:
//   • «Урон +2», «Скорострельность +1», «Тип урона: Энергетический»,
//     «Эффект: Устойчивый», «Вес +6», «Боеприпас: Патрон .308»;
//   • у ВСЕХ 164 модов каталога описание непустое (механика есть у всех);
//   • модалка: строка мода получает сгенерированное описание
//     (effectDescription), рукописное — сохраняется как раньше.
import { describe, expect, it } from 'vitest';

import { describeWeaponModChanges, weaponModRowDescription } from '../../domain/weaponDisplay';
import { readFileSync } from 'node:fs';
import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';

const byId = (id) => catalogData.find((m) => m.id === id);
const ru = (mod) => describeWeaponModChanges(mod, 'ru-RU');
const en = (mod) => describeWeaponModChanges(mod, 'en-EN');

describe('патч 383: описание мода генерируется из механики', () => {
  it('ресивер «Усиленный»: Урон +2 (плюс вес/цена)', () => {
    expect(ru(byId('mod_powerful'))).toBe('Урон +2 · Вес +1 · Цена +25');
    expect(en(byId('mod_powerful'))).toBe('Damage +2 · Weight +1 · Cost +25');
  });

  it('Динамо катушки Теслы: скорострельность, тип урона, вес, цена', () => {
    expect(ru(byId('mod_tesla_coil_dynamo')))
      .toBe('Скорострельность +1 · Тип урона: Энергетический · Вес +6 · Цена +136');
  });

  it('Горящее лезвие: тип урона и эффект; Изогнутая цепь — эффект с рангом', () => {
    expect(ru(byId('mod_burning_blade')))
      .toBe('Тип урона: Энергетический · Эффект: Устойчивый · Цена +50');
    expect(ru(byId('mod_curved_chain'))).toBe('Эффект: Проникающий 1 · Вес +2 · Цена +45');
  });

  it('калибровочный ресивер: урон «= 7» и смена боеприпаса локализованным именем', () => {
    expect(ru(byId('mod_308_receiver'))).toBe('Урон: 7 · Вес +4 · Цена +40 · Боеприпас: Патрон .308');
  });

  it('у ВСЕХ 164 модов каталога описание непустое (ru и en)', () => {
    for (const mod of catalogData) {
      expect(ru(mod), mod.id).not.toBe('');
      expect(en(mod), mod.id).not.toBe('');
    }
  });

  it('рукописное описание важнее сгенерированного', () => {
    expect(weaponModRowDescription({ effectDescription: 'Ручное', damageModifier: { op: '+', value: 2 } })).toBe('Ручное');
    expect(weaponModRowDescription({ damageModifier: { op: '+', value: 2 } })).toBe('Damage +2'); // локаль тестов — en
  });

  it('проводка: модалка использует weaponModRowDescription (описание в строке мода)', () => {
    const src = readFileSync('modules/fallout/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js', 'utf8');
    expect(src).toContain("weaponModRowDescription(row)");
  });

  it('висячий id боеприпаса виден как есть (доложено владельцу)', () => {
    expect(ru(byId('mod_fusion_mag'))).toContain('Боеприпас: ammo_fusion_cell');
  });

  it('пустые/кривые входы безопасны', () => {
    expect(describeWeaponModChanges(null)).toBe('');
    expect(describeWeaponModChanges({})).toBe('');
    expect(describeWeaponModChanges({ damageModifier: { op: '+', value: '1,5' } }, 'ru-RU')).toBe('Урон +1.5');
  });
});
