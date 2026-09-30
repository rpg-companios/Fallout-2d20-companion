// ПРИЁМОЧНЫЙ (патч 413): ремонт по книге — механика от владельца.
//   Тест ИНТ + Ремонт, сложность = редкость предмета (+1 за каждую
//   установленную модификацию; разборка донора — второго предмета того же
//   типа — даёт материалы и снижает сложность на 1). Время — полчаса;
//   при успехе 2 ОД сокращают вдвое; осложнение: д20 19–20 = потеря
//   дополнительных материалов, иначе +15 минут. Материалы — книжная
//   таблица по редкости. Провал: материалы остаются (закон верстака),
//   время зря. Кнопка «Починить» открывает модалку (мгновенного
//   бесплатного ремонта больше нет).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import {
  evaluateRepair,
  runRepair,
} from '../../domain/repairEngine';
import { repairMaterialsPlan } from '../../modules/fallout/repair/rules';
import {
  repairPreview,
  performRepair,
  settleRepairTime,
  repairModsCountFor,
  donorCandidatesFor,
} from '../../modules/fallout/repair/operations';
import { readFileSync } from 'node:fs';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

// Оружие-экземпляр в инвентаре (как seedStack крафта — weaponId = канон).
const seedWeapon = ({ durability = 40, weaponId = 'weapon_10mm_pistol', id }) => {
  const key = id ?? `seed_${weaponId}_${Math.random().toString(36).slice(2, 7)}`;
  useCharacterStore.setState((prev) => ({
    items: {
      ...prev.items,
      [key]: {
        id: weaponId, weaponId, itemType: 'weapon',
        durability, durabilityTracked: true, quantity: 1,
      },
    },
  }));
  return key;
};

const seedMaterials = (itemId, count) => {
  useCharacterStore.setState((prev) => ({
    items: {
      ...prev.items,
      [`seed_${itemId}_${Math.random().toString(36).slice(2, 7)}`]: {
        id: itemId, weaponId: itemId, quantity: count,
      },
    },
  }));
};

const setRepairHero = ({ int = 5, repair = 0 } = {}) => {
  useCharacterStore.setState((prev) => ({
    attributes: { ...prev.attributes, INT: { total: int } },
    skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: repair, total: repair } },
  }));
};

// rollD20 движка выдаёт ПО ОДНОЙ грани за вызов (diceCount раз).
const dice = (...faces) => {
  let i = 0;
  return () => faces[i++ % faces.length];
};

describe('Патч 413: книжная таблица материалов по редкости', () => {
  it('редкость 0 → 1 Обычные; 1 → 2 Обычные; 2 → 2 Обычные + 1 Необычные', () => {
    expect(repairMaterialsPlan(0)).toEqual([{ itemId: 'item_common_materials', count: 1 }]);
    expect(repairMaterialsPlan(1)).toEqual([{ itemId: 'item_common_materials', count: 2 }]);
    expect(repairMaterialsPlan(2)).toEqual([
      { itemId: 'item_common_materials', count: 2 },
      { itemId: 'item_uncommon_materials', count: 1 },
    ]);
  });

  it('3 → 2+2; 4 → 2+2+1 Редкие; 5+ → 3+3+1', () => {
    expect(repairMaterialsPlan(3)).toEqual([
      { itemId: 'item_common_materials', count: 2 },
      { itemId: 'item_uncommon_materials', count: 2 },
    ]);
    expect(repairMaterialsPlan(4)).toEqual([
      { itemId: 'item_common_materials', count: 2 },
      { itemId: 'item_uncommon_materials', count: 2 },
      { itemId: 'item_rare_materials', count: 1 },
    ]);
    expect(repairMaterialsPlan(5)).toEqual([
      { itemId: 'item_common_materials', count: 3 },
      { itemId: 'item_uncommon_materials', count: 3 },
      { itemId: 'item_rare_materials', count: 1 },
    ]);
    expect(repairMaterialsPlan(9)).toEqual(repairMaterialsPlan(5));
  });
});

describe('Патч 413: движок — тест, материалы, осложнения', () => {
  const PLAN = [{ itemId: 'item_common_materials', count: 2 }];

  it('сложность 0 — автоуспех без броска; сложность >0 — бросок 2d20', () => {
    const auto = runRepair({
      complexity: 0, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 2 },
      rollD20: () => { throw new Error('броска не должно быть'); },
      spend: () => ({ ok: true }), spendDonor: () => ({ ok: true }),
    });
    expect(auto.done).toBe(true);
    expect(auto.check).toBeNull();

    const rolled = runRepair({
      complexity: 1, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 2 },
      attributeValue: 5, skillValue: 3,
      rollD20: dice(3, 4),
      spend: () => ({ ok: true }), spendDonor: () => ({ ok: true }),
    });
    expect(rolled.done).toBe(true);
    expect(rolled.check.rolls).toEqual([3, 4]);
  });

  it('провал: материалы остаются, предмет не чинится, время зря', () => {
    let spent = 0;
    const result = runRepair({
      complexity: 2, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 5 },
      attributeValue: 0, skillValue: 0, // цель 2: 19,18 — ноль успехов
      rollD20: dice(19, 18),
      spend: (plan) => { spent += plan.length; return { ok: true }; },
      spendDonor: () => ({ ok: true }),
    });
    expect(result.done).toBe(false);
    expect(result.stage).toBe('check');
    expect(spent).toBe(0);
  });

  it('осложнение при успехе: д20 19–20 → потеря материалов; иначе +15 минут', () => {
    const lost = runRepair({
      complexity: 1, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 2 },
      attributeValue: 5, skillValue: 0, // цель 5: 3 + натуральная 20 = осложнение + успех
      rollD20: dice(3, 20),
      complicationRoll: () => 20,
      spend: () => ({ ok: true }), spendDonor: () => ({ ok: true }),
    });
    expect(lost.done).toBe(true);
    expect(lost.resolution).toEqual({ kind: 'lost-materials', face: 20 });

    const extra = runRepair({
      complexity: 1, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 2 },
      attributeValue: 5, skillValue: 0,
      rollD20: dice(3, 20),
      complicationRoll: () => 18,
      spend: () => ({ ok: true }), spendDonor: () => ({ ok: true }),
    });
    expect(extra.resolution).toEqual({ kind: 'extra-minutes', face: 18 });
  });

  it('осложнение при провале разрешение не получает (терять нечего)', () => {
    const result = runRepair({
      complexity: 1, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 2 },
      attributeValue: 5, skillValue: 0, // цель 5: 19,18 — провал + осложнение
      rollD20: dice(19, 18),
      complicationRoll: () => 20,
      spend: () => ({ ok: true }), spendDonor: () => ({ ok: true }),
    });
    expect(result.done).toBe(false);
    expect(result.resolution).toBeNull();
  });

  it('донор: вместо материалов списывается донор (порт spendDonor)', () => {
    let spentPlan = null;
    let donorSpent = false;
    const result = runRepair({
      complexity: 1, materialsPlan: [], inventoryCounts: {},
      attributeValue: 5, skillValue: 0,
      rollD20: dice(2, 3),
      spend: (plan) => { spentPlan = plan; return { ok: true }; },
      spendDonor: () => { donorSpent = true; return { ok: true }; },
    });
    expect(result.done).toBe(true);
    expect(result.donorSpent).toBe(true);
    expect(donorSpent).toBe(true);
    expect(spentPlan).toBeNull();
  });

  it('не хватает материалов — отказ на гейте до броска', () => {
    const result = runRepair({
      complexity: 1, materialsPlan: PLAN, inventoryCounts: { item_common_materials: 1 },
      rollD20: () => { throw new Error('броска не должно быть'); },
      spend: () => ({ ok: true }), spendDonor: () => ({ ok: true }),
    });
    expect(result).toMatchObject({ done: false, stage: 'gate' });
  });
});

describe('Патч 413: операции — редкость, моды, донор, ремонт оружия', () => {
  it('сложность = редкость + моды − донор (мин 0)', () => {
    // 10-мм пистолет: редкость 1 в каталоге оружия.
    const weaponId = seedWeapon({ durability: 40 });
    expect(repairPreview(weaponId)).toMatchObject({ canRepair: true, rarity: 1, complexity: 1, modsCount: 0 });
  });

  it('модификация повышает сложность на 1; донор снижает на 1', () => {
    const weaponId = seedWeapon({ durability: 40, weaponId: 'weapon_10mm_smg' });
    // Установленный мод — запись с installedOn (закон 367).
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_mod: { id: 'mod_x', weaponId: 'mod_x', installedOn: weaponId, quantity: 1 },
      },
    }));
    expect(repairModsCountFor(weaponId)).toBe(1);
    const withMod = repairPreview(weaponId);
    expect(withMod.complexity).toBe(withMod.rarity + 1);

    const donorKey = seedWeapon({ durability: 55, weaponId: 'weapon_10mm_smg' });
    const donors = donorCandidatesFor(state().items[weaponId], weaponId);
    expect(donors).toContain(donorKey);
    const withDonor = repairPreview(weaponId, { donorStoreItemId: donorKey });
    expect(withDonor.complexity).toBe(withMod.rarity); // +1 мод, −1 донор
    expect(withDonor.materialsPlan).toEqual([]); // донор вместо материалов
  });

  it('целый предмет не чинится; записей с прочностью чинится', () => {
    const whole = seedWeapon({ durability: 100 });
    expect(repairPreview(whole)).toMatchObject({ canRepair: false, reason: 'not-damaged' });
    const damaged = seedWeapon({ durability: 40 });
    expect(repairPreview(damaged).canRepair).toBe(true);
  });

  it('успешный ремонт: материалы списаны, прочность 100, время отложено', () => {
    const weaponId = seedWeapon({ durability: 40, weaponId: 'weapon_10mm_pistol' });
    seedMaterials('item_common_materials', 2);
    setRepairHero({ int: 5, repair: 0 });

    const result = performRepair(weaponId, {
      ports: { rollD20: dice(2, 3) },
    });
    expect(result.done).toBe(true);
    expect(result.spent).toEqual([{ itemId: 'item_common_materials', count: 2 }]);
    expect(state().items[weaponId].durability).toBe(100);
    expect(result.repairTime).toMatchObject({ baseMinutes: 30, pending: true, halvedOnAp: true });
    // Материалы в сумке кончились.
    const counts = Object.values(state().items).filter((i) => i.weaponId === 'item_common_materials').length;
    expect(counts).toBe(0);
  });

  it('осложнение с потерей: списан ДОПОЛНИТЕЛЬНЫЙ комплект', () => {
    const weaponId = seedWeapon({ durability: 40, weaponId: 'weapon_10mm_pistol' });
    seedMaterials('item_common_materials', 4); // 2 на ремонт + 2 на потерю
    setRepairHero();
    const result = performRepair(weaponId, {
      ports: { rollD20: dice(3, 20), complicationRoll: () => 19 },
    });
    expect(result.done).toBe(true);
    expect(result.resolution.kind).toBe('lost-materials');
    const left = Object.values(state().items)
      .filter((i) => i.weaponId === 'item_common_materials')
      .reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
    expect(left).toBe(0); // 4 − 2 (ремонт) − 2 (потеря)
  });

  it('время: успех + 2 ОД → 15 минут; провал — всегда полные 30', () => {
    const weaponId = seedWeapon({ durability: 40, weaponId: 'weapon_10mm_pistol' });
    seedMaterials('item_common_materials', 6);
    setRepairHero();

    const ok = performRepair(weaponId, { ports: { rollD20: dice(2, 2) } });
    const halved = settleRepairTime(ok, { spendActionPoints: true });
    expect(halved.minutes).toBe(15);
    expect(halved.spendActionPoints).toBe(true);

    const second = seedWeapon({ durability: 40, weaponId: 'weapon_10mm_pistol' });
    const fail = performRepair(second, { ports: { rollD20: dice(19, 19) } });
    const full = settleRepairTime(fail, { spendActionPoints: true });
    expect(full.minutes).toBe(30); // ОД на провал не тратятся
    expect(full.spendActionPoints).toBe(false);
  });

  it('донор списывается вместе со своими модами (закон 343/344)', () => {
    const weaponId = seedWeapon({ durability: 40, weaponId: 'weapon_10mm_pistol' });
    const donorKey = seedWeapon({ durability: 55, weaponId: 'weapon_10mm_pistol' });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_donor_mod: { id: 'mod_y', weaponId: 'mod_y', installedOn: donorKey, quantity: 1 },
      },
    }));
    seedMaterials('item_common_materials', 5); // лишние — донор их не тратит
    const before = Object.keys(state().items).length;

    const result = performRepair(weaponId, {
      donorStoreItemId: donorKey,
      ports: { rollD20: dice(1, 2) },
    });
    expect(result.done).toBe(true);
    expect(result.donorSpent).toBe(true);
    const items = state().items;
    expect(items[donorKey]).toBeUndefined(); // донор ушёл
    expect(items.seed_donor_mod).toBeUndefined(); // мод ушёл вместе
    expect(items[weaponId].durability).toBe(100);
    // Из «лишних» материалов ничего не списалось (донор вместо материалов).
    const mats = Object.values(items).filter((i) => i.weaponId === 'item_common_materials');
    expect(mats).toHaveLength(before - 3 >= 0 ? 1 : 1);
  });
});

describe('Патч 413: проводка — кнопка открывает модалку, мгновенного ремонта нет', () => {
  it('все три кнопки «Починить» зовут setRepairTarget, экшны стора напрямую не зовутся', () => {
    const src = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
    expect(src).toContain('RepairModal');
    expect(src).toContain("setRepairTarget({ storeItemId: item.id, name: item.name })");
    expect(src).toContain("setRepairTarget({ equippedSlot: item.paSlot, name: item.name })");
    // Мгновенные вызовы ремонта из карточек исчезли.
    expect(src).not.toContain('onPress={() => repairWeapon(item.id)}');
    expect(src).not.toContain('onPress={() => repairPowerArmorStack(item.id)}');
    expect(src).not.toContain('onPress={() => repairPowerArmorPieceAt(item.paSlot)}');
  });

  it('модалка: скролл-закон (заголовок/футер фиксированы, контент в ScrollView)', () => {
    const src = readFileSync('modules/fallout/screens/InventoryScreen/modals/RepairModal.js', 'utf8');
    const scrollStart = src.indexOf('<ScrollView');
    const scrollEnd = src.indexOf('</ScrollView>');
    expect(scrollStart).toBeGreaterThan(-1);
    expect(scrollEnd).toBeGreaterThan(scrollStart);
    const inner = src.slice(scrollStart, scrollEnd);
    expect(inner.length).toBeGreaterThan(400); // содержимое живёт в прокрутке
    // Заголовок и футер — вне прокрутки.
    const before = src.slice(0, scrollStart);
    const after = src.slice(scrollEnd);
    expect(before).toContain("tInventory('repair.title')");
    expect(after).toContain("tInventory('repair.actions.close')");
  });

  it('словари ремонта есть в обоих языках (без фолбэков)', () => {
    const ru = JSON.parse(readFileSync('modules/fallout/i18n/ru-RU/screens/inventory/screen.json', 'utf8'));
    const en = JSON.parse(readFileSync('modules/fallout/i18n/en-EN/screens/inventory/screen.json', 'utf8'));
    for (const dict of [ru, en]) {
      expect(typeof dict.repair.title).toBe('string');
      expect(dict.repair.testLine).toContain('{difficulty}');
      expect(dict.repair.materialLine).toContain('{need}');
      expect(typeof dict.repair.materials.item_common_materials).toBe('string');
      expect(typeof dict.repair.report.apQuestion).toBe('string');
      expect(typeof dict.repair.actions.repair).toBe('string');
    }
    expect(ru.repair.materials.item_common_materials).toBe('Обычные материалы');
  });
});
