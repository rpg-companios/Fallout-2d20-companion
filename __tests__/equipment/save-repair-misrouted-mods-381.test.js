// ПРИЁМОЧНЫЙ (патч 381): ремонт сейвов, пострадавших от бага 380
// («моды не ставятся в карточку оружия» — до фикса мод писался в первый
// надетый предмет, обычно броню). Живое публичное приложение: старые сейвы
// чинятся при ЗАГРУЗКЕ, без подъёма версии схемы:
//   • посторонний appliedMods снимается с брони (статы брони не страдали —
//     поле инертно, но мусор убираем);
//   • мод-предметы с осиротевшими флагами возвращаются в сумку
//     (equipped:false, installedOn удалён — как штатный uninstall);
//   • честно установленные моды (оружие ссылается на мод) не тронуты;
//   • робо-привязки (robotSlot:*) не тронуты;
//   • моды брони (другой каталог) не тронуты;
//   • повторный прогон ничего не меняет (идемпотентность).
import { describe, expect, it } from 'vitest';

import { repairMisroutedWeaponMods } from '../../domain/weaponModCanonical';
import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';

const weaponModIds = new Set(catalogData.map((m) => m.id));

const damagedSave = () => ({
  items: {
    // Броня: на неё баг записал appliedMods оружия
    'armor-1': {
      id: 'armor-1', itemType: 'armor', equipped: true, name: 'Кожаная броня',
      appliedMods: { Receiver: 'mod_powerful', Capacitor: 'mod_boosted_capacitor' },
    },
    // Оружие, которому моды предназначались: осталось пустым
    'w-10mm': {
      id: 'w-10mm', weaponId: 'weapon_10mm_pistol', itemType: 'weapon', equipped: true,
      appliedMods: {},
    },
    // Мод-предметы: флаги осиротели на броне
    'modinst-1': { id: 'modinst-1', weaponId: 'mod_powerful', itemType: 'weaponMod', equipped: true, installedOn: 'armor-1' },
    'modinst-2': { id: 'modinst-2', weaponId: 'mod_boosted_capacitor', itemType: 'weaponMod', equipped: true, installedOn: 'armor-1' },
    // Честно установленный мод: оружие ссылается — НЕ трогаем
    'modinst-3': { id: 'modinst-3', weaponId: 'mod_hardened', itemType: 'weaponMod', equipped: true, installedOn: 'w-10mm' },
    // Робо-привязка: носитель синтетический — НЕ трогаем
    'modinst-4': {
      id: 'modinst-4', weaponId: 'mod_photon_exciter', itemType: 'weaponMod',
      equipped: true, installedOn: 'robotSlot:leftArm:robot_weapon_assaultron_head_laser',
    },
    // Носитель исчез (предмет продан) → мод возвращается в сумку
    'modinst-5': { id: 'modinst-5', weaponId: 'mod_long_scope', itemType: 'weaponMod', equipped: true, installedOn: 'sold-item' },
    // Мод брони на броне: другой каталог — НЕ трогаем
    'armor-mod-1': { id: 'armor-mod-1', weaponId: 'mod_std_dense', itemType: 'armorMod', equipped: true, installedOn: 'armor-1' },
  },
});

describe('патч 381: ремонт старых сейвов после бага 380', () => {
  it('броня очищена, моды вернулись в сумку, оружие без изменений', () => {
    const state = repairMisroutedWeaponMods(damagedSave(), weaponModIds);
    // 1) appliedMods снят с брони
    expect(state.items['armor-1'].appliedMods).toBeUndefined();
    // 2) осиротевшие моды видимы в сумке
    for (const key of ['modinst-1', 'modinst-2', 'modinst-5']) {
      expect(state.items[key].equipped).toBe(false);
      expect(state.items[key].installedOn).toBeUndefined();
    }
    // 3) оружие не тронуто (ремонт ничего ему не должен писать)
    expect(state.items['w-10mm'].appliedMods).toEqual({});
    expect(state.items['w-10mm'].equipped).toBe(true);
  });

  it('честные установки, робо-привязки и моды брони не тронуты', () => {
    const save = damagedSave();
    // оружие ссылается на мод → флаг честный, остаётся
    save.items['w-10mm'].appliedMods = { Receiver: 'mod_hardened' };
    const state = repairMisroutedWeaponMods(save, weaponModIds);
    expect(state.items['modinst-3'].equipped).toBe(true);
    expect(state.items['modinst-3'].installedOn).toBe('w-10mm');
    // робо-привязка жива
    expect(state.items['modinst-4'].equipped).toBe(true);
    expect(state.items['modinst-4'].installedOn).toContain('robotSlot:');
    // мод брони остался на броне
    expect(state.items['armor-mod-1'].equipped).toBe(true);
    expect(state.items['armor-mod-1'].installedOn).toBe('armor-1');
  });

  it('идемпотентен: второй прогон ничего не меняет', () => {
    const once = repairMisroutedWeaponMods(damagedSave(), weaponModIds);
    const snapshot = JSON.stringify(once);
    const twice = repairMisroutedWeaponMods(once, weaponModIds);
    expect(JSON.stringify(twice)).toBe(snapshot);
  });

  it('устойчив к пустым/кривым входам', () => {
    expect(repairMisroutedWeaponMods(null, weaponModIds)).toBeNull();
    expect(repairMisroutedWeaponMods({}, weaponModIds)).toEqual({});
    expect(repairMisroutedWeaponMods({ items: null }, weaponModIds)).toEqual({ items: null });
  });
});
