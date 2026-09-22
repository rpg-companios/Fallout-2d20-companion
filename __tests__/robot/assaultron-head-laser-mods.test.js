// Предохранитель данных: уникальные моды Головного лазера Штурмотрона.
//
// Слово владельца (2026-09-21): добавить уникальные моды для Головного лазера
// Штурмотрона — именно «Головной лазер» (не «Лазер головы» и никак иначе;
// английское название не меняется). Это оружие роботов, моды подходят только
// к «robot_weapon_assaultron_head_laser» и живут отдельно от оружия.
// Оперировать только данными: файл модов оружия роботов создан по аналогии
// с оружием людей (weapon_mods.json + weapon_mod_slots.json + i18n ru/en).
//
// Таблица (источник — правила):
//   Mk III: +1 DC, 3 заряда/атаку, вес —,   cost +4,  Robotics Expert
//   Mk IV:  +2 DC, 4 заряда/атаку, вес +1,  cost +8,  Robotics Expert, Science! 1
//   Mk V:   +3 DC, 5 зарядов/атаку, вес +1,  cost +12, Robotics Expert, Science! 2
//   Mk VI:  +4 DC, 6 зарядов/атаку, вес +2,  cost +16, Robotics Expert, Science! 3
// «Robotics Expert» без ранга в таблице записан как ранг 1 — по конвенции
// данных оружия роботов («Robotics Expert 1»).

import { describe, it, expect } from 'vitest';
import { SETTING } from '../../modules/fallout/index.js';
import {
  catalogGetModsForWeaponSlot,
  catalogGetSlotsForWeapon,
  catalogGetWeaponModById,
  catalogGetWeaponMods,
} from '../../db/catalogSource';
import { deserializeSlot, serializeSlot, toModIds, collectAttacks } from '../../domain/robotSlots';
import { getRobotLimbCatalog } from '../../domain/registry';
import { applyWeaponMods } from '../../domain/enrichItem';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { resolveWeaponWithAppliedMods } from '../../domain/resolveItem';
import { mechAmmoSpendForWeapon } from '../../modules/fallout/weapons/weaponAmmoSpend';

const robotWeaponMods = SETTING.data.equipment.robot.weaponMods;
const ruWeaponMods = SETTING.names['ru-RU'].equipment.robot.weaponMods;
const enWeaponMods = SETTING.names['en-EN'].equipment.robot.weaponMods;
const ruRobotWeapons = SETTING.names['ru-RU'].equipment.robot.weapons;
const enRobotWeapons = SETTING.names['en-EN'].equipment.robot.weapons;
const robotWeaponsData = SETTING.data.equipment.robot.weapons;
import { getRobotLimbCatalog } from '../../domain/registry';

const LASER_ID = 'robot_weapon_assaultron_head_laser';

const EXPECTED = [
  { suffix: 'mk_iii', damage: 1, ammoPerAttack: 3, weight: 0, cost: 4, perk2: '' },
  { suffix: 'mk_iv', damage: 2, ammoPerAttack: 4, weight: 1, cost: 8, perk2: 'Science! 1' },
  { suffix: 'mk_v', damage: 3, ammoPerAttack: 5, weight: 1, cost: 12, perk2: 'Science! 2' },
  { suffix: 'mk_vi', damage: 4, ammoPerAttack: 6, weight: 2, cost: 16, perk2: 'Science! 3' },
];

const modId = (suffix) => `robot_weapon_mod_assaultron_head_laser_capacitor_${suffix}`;
const MARK = { mk_iii: 'Mk III', mk_iv: 'Mk IV', mk_v: 'Mk V', mk_vi: 'Mk VI' };
const byId = (list, id) => list.find((entry) => entry.id === id);

describe('уникальные моды Головного лазера Штурмотрона (слово владельца 2026-09-21)', () => {
  it('оружие-хозяин существует и это оружие роботов', () => {
    const laser = byId(robotWeaponsData, LASER_ID);
    expect(laser).toBeTruthy();
    expect(laser.itemType).toBe('weapon');
  });

  it('ровно четыре конденсатора, все уникальные и только для лазера', () => {
    expect(robotWeaponMods).toHaveLength(4);
    for (const mod of robotWeaponMods) {
      expect(mod.unique).toBe(true);
      expect(mod.modType).toBe('weapon');
      expect(mod.applies_to_ids).toEqual([LASER_ID]);
      expect(mod.slot).toBe('Capacitor');
    }
  });

  it.each(EXPECTED)('мод $suffix: значения из таблицы правил', ({ suffix, damage, ammoPerAttack, weight, cost, perk2 }) => {
    const mod = byId(robotWeaponMods, modId(suffix));
    expect(mod, `нет мода ${modId(suffix)}`).toBeTruthy();
    expect(mod.damageModifier).toEqual({ op: '+', value: damage });
    expect(mod.ammoPerAttack).toBe(ammoPerAttack);
    // Плоские аддитивные cost/weight — конвенция конвейера applyWeaponMods
    // (domain/enrichItem.js: weight += mod.weight; cost += mod.cost).
    expect(mod.weight).toBe(weight);
    expect(mod.cost).toBe(cost);
    expect(mod.perk1).toBe('Robotics Expert 1');
    expect(mod.perk2).toBe(perk2);
  });

  it('реестр знает: пул weaponMods содержит конденсаторы, слоты и список — на месте', () => {
    const catalog = getRobotLimbCatalog();
    for (const mod of robotWeaponMods) {
      expect(catalog.weaponMods.some((m) => m?.id === mod.id), `${mod.id} в пуле weaponMods`).toBe(true);
    }
    expect(catalog.robotWeaponMods).toEqual(robotWeaponMods);
  });

  it('слоты: у лазера один слот Capacitor со всеми четырьмя модами — ВЫВЕДЕНЫ из самих модов (патч 306)', () => {
    const cat = getEquipmentCatalog('ru-RU');
    const slots = cat.robotWeaponModSlots[LASER_ID];
    expect(Object.keys(slots)).toEqual(['Capacitor']);
    expect(slots.Capacitor).toEqual(EXPECTED.map(({ suffix }) => modId(suffix)));
    // файл-дубль удалён: слоты робо-оружия существуют только как производные
    expect(SETTING.data.equipment.robot.modSlots).toBeUndefined();
  });

  it('каждый робо-мод заявляет слот и применимость — иначе производные слоты его потеряют', () => {
    for (const mod of robotWeaponMods) {
      expect(mod.slot, `${mod.id}: slot`).toBeTruthy();
      expect(
        Array.isArray(mod.applies_to_ids) && mod.applies_to_ids.length > 0,
        `${mod.id}: applies_to_ids непуст`,
      ).toBe(true);
    }
  });

  it('i18n ru: имена «Конденсатор Mk III–VI», префиксы Mk, эффекты с зарядами', () => {
    for (const { suffix, damage, ammoPerAttack } of EXPECTED) {
      const entry = byId(ruWeaponMods, modId(suffix));
      expect(entry, `нет ru i18n для ${suffix}`).toBeTruthy();
      expect(entry.name).toBe(`Конденсатор ${MARK[suffix]}`);
      expect(entry.prefix).toBe(MARK[suffix]);
      expect(entry.effectDescription).toContain(`+${damage} {/CD}`);
      expect(entry.effectDescription).toContain(`${ammoPerAttack} заряд`);
    }
  });

  it('i18n en: имена Capacitor Mk III–VI (английское название не меняется)', () => {
    for (const { suffix } of EXPECTED) {
      const entry = byId(enWeaponMods, modId(suffix));
      expect(entry, `нет en i18n для ${suffix}`).toBeTruthy();
      const mark = MARK[suffix];
      expect(entry.name).toBe(`Capacitor ${mark}`);
      expect(entry.prefix).toBe(mark);
      expect(entry.effectDescription).toContain('Damage');
      expect(entry.effectDescription).toContain('shots per attack');
    }
  });

  it('имя оружия: ru — «Головной лазер Штурмотрона», en — не тронуто', () => {
    expect(byId(ruRobotWeapons, LASER_ID).name).toBe('Головной лазер Штурмотрона');
    expect(byId(enRobotWeapons, LASER_ID).name).toBe('Assaultron Head Laser');
  });

  it('каждый мод из данных имеет i18n в обоих языках (полнота)', () => {
    for (const mod of robotWeaponMods) {
      expect(byId(ruWeaponMods, mod.id), `ru i18n для ${mod.id}`).toBeTruthy();
      expect(byId(enWeaponMods, mod.id), `en i18n для ${mod.id}`).toBeTruthy();
    }
  });

  it('экранный каталог: конденсаторы в пуле weaponMods (не только в реестре)', () => {
    // Установка мода идёт через БД, план списания — через реестр конечностей,
    // а карточка оружия на экране резолвится через экранный каталог
    // (enrichWeaponItem). Пул обязан содержать робо-моды, иначе после
    // установки мод молча теряется: урон карточки возвращается к базе.
    const equipmentCatalog = getEquipmentCatalog('ru-RU');
    for (const mod of robotWeaponMods) {
      expect(
        equipmentCatalog.weaponMods.some((m) => m?.id === mod.id),
        `${mod.id} в пуле weaponMods экранного каталога`,
      ).toBe(true);
    }
  });

  it('адаптер модалки установки: каждый мод в списке ровно один раз', () => {
    // Знание «полный пул = людские + робо-моды» живёт в базовой сборке
    // каталога (301). Адаптер не должен склеивать пулы повторно — иначе
    // робо-моды приходят дважды.
    const all = catalogGetWeaponMods();
    const ids = all.map((m) => m.id);
    expect(new Set(ids).size, 'дубликаты id в полном списке модов').toBe(ids.length);
    for (const mod of robotWeaponMods) {
      expect(ids.filter((id) => id === mod.id), `${mod.id} ровно один раз`).toHaveLength(1);
    }
  });

  it('лазер в ладони руки робота — карточка есть, мод считается, заряды видны (репорт владельца: «моды не ставятся»)', () => {
    // До фикса оружие робота (handheld === false) в ладони выпадало из списка
    // атак: карточки нет — ставить моды не на что, хотя экипировка в ладонь
    // разрешена. Теперь карточка есть; проверяем всю цепочку: карточка →
    // урон с модом → план списания зарядов (298) видит конденсатор.
    const armLimb = SETTING.data.equipment.robot.limbs.find((l) => l.id === 'robot_arm_assaultron');
    const slots = {
      leftArm: {
        limb: armLimb,
        armor: null, plating: null, frame: null,
        heldWeapon: {
          id: LASER_ID,
          weaponId: LASER_ID,
          itemType: 'weapon',
          sourceSlot: 'leftArm',
          appliedMods: { Capacitor: modId('mk_iv') },
        },
      },
    };
    const attacks = collectAttacks(slots, { bodyPlan: 'assaultron' });
    const laserCard = attacks.find((a) => a.id === LASER_ID);
    expect(laserCard, 'карточка лазера в ладони').toBeTruthy();
    expect(laserCard.sourceSlot).toBe('leftArm');
    expect(laserCard.damage, 'урон базы + Mk IV').toBe(5 + 2);
    expect(laserCard.modIds).toEqual([modId('mk_iv')]);
    const plan = mechAmmoSpendForWeapon(laserCard, { available: 10 });
    expect(
      plan.asks.some((a) => a.source === 'ammoPerAttack' && a.max === 4),
      'план списания видит 4 заряда за атаку (Mk IV)',
    ).toBe(true);
  });

  it('собственная атака конечности в ладони не дублируется (старый сейв)', () => {
    // Коготь — собственная атака руки штурмотрона; в старом сейве он мог
    // лежать и в heldWeapon. Карточка когтя должна быть ОДНА (ветка builtin).
    const armLimb = SETTING.data.equipment.robot.limbs.find((l) => l.id === 'robot_arm_assaultron');
    const slots = {
      leftArm: {
        limb: armLimb,
        armor: null, plating: null, frame: null,
        heldWeapon: { id: 'robot_weapon_claw', weaponId: 'robot_weapon_claw', itemType: 'weapon' },
      },
    };
    const attacks = collectAttacks(slots, { bodyPlan: 'assaultron' });
    const clawCards = attacks.filter((a) => a.id === 'robot_weapon_claw');
    expect(clawCards).toHaveLength(1);
  });

  it('карточка лазера с конденсатором: урон базы + мод (экранный путь, репродукция отчёта владельца)', () => {
    const laser = byId(robotWeaponsData, LASER_ID);
    const equipmentCatalog = getEquipmentCatalog('ru-RU');
    for (const { suffix, damage } of EXPECTED) {
      const resolved = resolveWeaponWithAppliedMods({
        id: LASER_ID,
        weaponId: LASER_ID,
        itemType: 'weapon',
        appliedMods: { Capacitor: modId(suffix) },
      }, equipmentCatalog);
      expect(resolved.damage, `${suffix}: урон карточки`).toBe(laser.damage + damage);
    }
  });
});

describe('установка: модалка модернизации получает конденсаторы (293)', () => {
  it('слоты лазера — Capacitor (через catalogGetSlotsForWeapon, как у людей)', () => {
    expect(catalogGetSlotsForWeapon('robot_weapon_assaultron_head_laser')).toEqual(['Capacitor']);
  });

  it('на слоте ровно четыре конденсатора по возрастанию ранга', () => {
    const mods = catalogGetModsForWeaponSlot('robot_weapon_assaultron_head_laser', 'Capacitor');
    expect(mods.map((m) => m.id)).toEqual([
      'robot_weapon_mod_assaultron_head_laser_capacitor_mk_iii',
      'robot_weapon_mod_assaultron_head_laser_capacitor_mk_iv',
      'robot_weapon_mod_assaultron_head_laser_capacitor_mk_v',
      'robot_weapon_mod_assaultron_head_laser_capacitor_mk_vi',
    ]);
  });

  it('мод resolveается по id: имя, стоимость, вес, слот, требования', () => {
    const row = catalogGetWeaponModById('robot_weapon_mod_assaultron_head_laser_capacitor_mk_iii');
    expect(row).toBeTruthy();
    expect(['Конденсатор Mk III', 'Capacitor Mk III']).toContain(row.name); // локаль окружения
    expect(row.cost).toBe(4);
    expect(row.weight).toBe('0');
    expect(row.slot).toBe('Capacitor');
    expect(row.perk_1).toBe('Robotics Expert 1');
    expect(row.damageModifier).toEqual({ op: '+', value: 1 });
  });

  it('робо-моды не утекают в людские слоты: у обычного оружия Capacitor пуст', () => {
    expect(catalogGetModsForWeaponSlot('weapon_002', 'Capacitor')).toEqual([]);
  });
});

describe('применение: установленный конденсатор меняет статы лазера (294)', () => {
  const MK3 = 'robot_weapon_mod_assaultron_head_laser_capacitor_mk_iii';
  const LASER = 'robot_weapon_assaultron_head_laser';

  it('формат модалки (appliedMods) читается робо-машиной: toModIds', () => {
    expect(toModIds({ appliedMods: { Capacitor: MK3 } })).toEqual([MK3]);
    // регрессия 294: пустой служебный modIds не должен маскировать appliedMods
    // (heldWeapon после deserialize несёт modIds: [], модалка дописывает appliedMods)
    expect(toModIds({ modIds: [], appliedMods: { Capacitor: MK3 } })).toEqual([MK3]);
    // снятие мода: пустые appliedMods — тоже истина экрана
    expect(toModIds({ modIds: [MK3], appliedMods: {} })).toEqual([]);
    // худой сейв без heldWeapon-объекта: modIds остаётся источником
    expect(toModIds({ modIds: [MK3] })).toEqual([MK3]);
  });

  it('цикл слота: appliedMods переживают serialize → deserialize (сейв → экран)', () => {
    // Раунд-трип как в приложении: сейв (худая форма) → экран (толстая) →
    // робо-ветка модалки дописывает appliedMods в heldWeapon → сейв → экран.
    const saved = {
      content: 'robot_arm_assaultron',
      armorLayers: { frame: null, plating: null, armor: null },
      heldWeaponId: LASER,
      heldWeaponMods: [],
      installedWeapons: [],
    };
    const onScreen = deserializeSlot(saved);            // толстая форма экрана
    expect(onScreen.heldWeapon?.weaponId).toBe(LASER);
    const afterModal = {                                 // handleApplyModification
      ...onScreen,
      heldWeapon: { ...onScreen.heldWeapon, appliedMods: { Capacitor: MK3 } },
    };
    const stored = serializeSlot(afterModal);           // обратно в сейв
    expect(stored.heldWeaponId).toBe(LASER);
    expect(stored.heldWeaponMods).toEqual([MK3]);
    const restored = deserializeSlot(stored);           // снова экран
    expect(restored.heldWeapon).toBeTruthy();
    expect(restored.heldWeapon.modIds).toEqual([MK3]);
    expect(restored.heldWeapon.appliedMods.Capacitor).toBe(MK3);
  });

  it('конвейер: лазер 5 урона / 115 цены / 8 веса + Mk III → 6 / 119 / 8', () => {
    const catalog = getRobotLimbCatalog();
    const base = SETTING.data.equipment.robot.weapons.find((w) => w.id === LASER);
    const mod = catalog.weaponMods.find((m) => m.id === MK3);
    expect(mod).toBeTruthy();
    const result = applyWeaponMods(base, [mod]);
    expect(Number(result.damage)).toBe(6);
    expect(Number(result.cost)).toBe(119);
    expect(Number(result.weight)).toBe(8);
  });
});
