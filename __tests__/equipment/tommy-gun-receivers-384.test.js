// ПРИЁМОЧНЫЙ (патч 384): окно «ПП Томпсона» (weapon_submachine_gun) —
// сверка со словом владельца: «Там только РЕСИВЕР: Усиленный, Чувствительный,
// Укреплённый, Бронебойный, 9-мм, 10-мм. И ни один из них не использует
// энергоячейки» (это про СОСТАВ ресиверов; остальные слоты остаются).
// Данные уже соответствуют; тест фиксирует это состояние + исправления
// самого патча: «Ресивер 10-мм» → «10-мм» (ru/en) и защита «10-мм
// пистолет-пулемёта» (weapon_10mm_smg) от чужих правок (списков владельца
// на него нет — не трогать).
import { describe, expect, it } from 'vitest';

import slotsData from '../../modules/fallout/data/equipment/weapon_mod_slots.json';
import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';
import ruMods from '../../modules/fallout/i18n/ru-RU/data/equipment/weapon_mods.json';
import enMods from '../../modules/fallout/i18n/en-EN/data/equipment/weapon_mods.json';

const byId = (id) => catalogData.find((m) => m.id === id);
const ruName = (id) => ruMods.find((m) => m.id === id)?.name;
const enName = (id) => enMods.find((m) => m.id === id)?.name;

// Боеприпасы-энергоячейки (смена на них ресивером запрещена словом владельца)
const ENERGY_AMMO = new Set([
  'ammo_fusion_cell', 'ammo_fusion_core', 'ammo_energy_cell',
  'ammo_alien_power_cell', 'ammo_cryo_cell',
]);

const THOMPSON_RECEIVERS = [
  'mod_10mm_receiver', 'mod_9mm_receiver', 'mod_armor_piercing',
  'mod_hair_trigger', 'mod_hardened', 'mod_powerful',
];

describe('патч 384: ПП Томпсона — ресиверы по слову владельца', () => {
  it('ресиверы ПП Томпсона = ровно 6 названных, других нет', () => {
    expect([...slotsData.weapon_submachine_gun.Receiver].sort())
      .toEqual([...THOMPSON_RECEIVERS].sort());
  });

  it('имена шести ресиверов — терминами i18n из списка владельца', () => {
    expect(ruName('mod_powerful')).toBe('Усиленный');
    expect(ruName('mod_hair_trigger')).toBe('Чувствительный');
    expect(ruName('mod_hardened')).toBe('Укреплённый');
    expect(ruName('mod_armor_piercing')).toBe('Бронебойный');
    expect(ruName('mod_9mm_receiver')).toBe('9-мм');
    expect(ruName('mod_10mm_receiver')).toBe('10-мм');
    expect(enName('mod_10mm_receiver')).toBe('10mm Receiver'); // en — из референса; голое '10mm' ломает генератор крафта (ингредиент «10mm»)
  });

  it('ни один из шести ресиверов не переводит оружие на энергоячейки', () => {
    for (const id of THOMPSON_RECEIVERS) {
      const ammo = byId(id).ammoOverride;
      expect(ENERGY_AMMO.has(ammo), `${id} → ${ammo}`).toBe(false);
    }
  });

  it('остальные слоты ПП Томпсона на месте (дословность не отменяет их)', () => {
    const slots = Object.keys(slotsData.weapon_submachine_gun);
    for (const slot of ['Muzzle', 'Stock', 'Magazine', 'Sight', 'Barrel']) {
      expect(slots, slot).toContain(slot);
      expect(slotsData.weapon_submachine_gun[slot].length, slot).toBeGreaterThan(0);
    }
  });

  it('«Термоядерный магазин» — только «Бластер пришельцев» и «Криолятор»', () => {
    expect(byId('mod_fusion_mag').applies_to_ids)
      .toEqual(['weapon_alien_blaster', 'weapon_cryolator']);
  });

  it('10-мм пистолет-пулемёт не тронут (списков владельца нет)', () => {
    // у него свой набор ресиверов, включая не вошедшие в список Томпсона
    const smg = slotsData.weapon_10mm_smg.Receiver;
    expect(smg).toContain('mod_rapid');
    expect(smg).toContain('mod_armor_piercing_receiver');
    expect(smg).toContain('mod_calibrated_powerful');
    expect(smg).not.toContain('mod_hair_trigger');
  });
});
