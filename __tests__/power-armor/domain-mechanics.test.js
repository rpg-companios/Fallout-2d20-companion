import { describe, it, expect } from 'vitest';
import dataPowerArmor from '../../data/equipment/powerArmor.json';
import {
  PA_CORE_DRAIN_PER_HOUR,
  PA_MS_PER_CHARGE,
  PA_PIECE_SLOTS,
  createEmptyEquippedPowerArmor,
  createEmptyPowerArmorRuntime,
  isPowerArmorFrame,
  powerArmorSlotFor,
  fusionCoreStackKey,
  powerArmorPieceStackKey,
  powerArmorFrameStackKey,
  packPackage,
  unpackPackage,
  insertCore,
  hasFrame,
  canEquipPowerArmorPiece,
  equipPowerArmorPiece,
  isFusionCoreItem,
  findChargedFusionCores,
  pickFusionCore,
  rollNewFusionCoreCharges,
  tickCoreAccumulator,
  drainActiveCore,
  isPieceBroken,
  needsRepair,
  repairPowerArmorPiece,
  adjustPieceHp,
  suppressesLowerLayers,
  getFrameAttributeModifiers,
  applyAttributeModifierValue,
} from '../../domain/powerArmor';
import { canEquipArmor } from '../../domain/equipEquip';

// Специфика: docs/architecture/power-armor-plan.md §4–§5. Тесты — белый список.

const FRAME_CATALOG = dataPowerArmor.frame.pieces[0];
const T45_HELMET = dataPowerArmor.t45.pieces[0]; // head
const T45_CHEST = dataPowerArmor.t45.pieces[1];  // body

const piece = (catalogId, hpCurrent, appliedMods = {}) => ({ catalogId, hpCurrent, appliedMods });
const core = (charges) => ({ id: 'ammo_fusion_core', itemType: 'ammo', charges });
const wornFrameWithCuts = (charges = 11) => ({
  ...createEmptyEquippedPowerArmor(),
  frame: { catalogId: FRAME_CATALOG.id, appliedMods: {}, core: { charges } },
});
const mutantChar = { origin: { characterType: 'mutant' } };
const robotChar = { origin: { characterType: 'robot' } };
const humanChar = { origin: { characterType: 'human' } };

describe('состояние пакета: конструкторы и слоты', () => {
  it('createEmptyEquippedPowerArmor: каркаса нет, 4 слота пусты, экземпляры независимы', () => {
    const a = createEmptyEquippedPowerArmor();
    expect(a).toEqual({ frame: null, pieces: { head: null, body: null, hands: null, legs: null } });
    const b = createEmptyEquippedPowerArmor();
    a.pieces.head = piece('x', 7);
    expect(b.pieces.head).toBeNull();
  });

  it('createEmptyPowerArmorRuntime: накопитель с нуля', () => {
    expect(createEmptyPowerArmorRuntime()).toEqual({ coreAccumulatorMs: 0 });
  });

  it('слоты частей по данным; каркас слотом части не является', () => {
    expect(powerArmorSlotFor(T45_HELMET)).toBe('head');
    expect(powerArmorSlotFor(T45_CHEST)).toBe('body');
    expect(powerArmorSlotFor(dataPowerArmor.t45.pieces[2])).toBe('hands'); // arm
    expect(powerArmorSlotFor(dataPowerArmor.t45.pieces[3])).toBe('legs');  // leg
    expect(powerArmorSlotFor(FRAME_CATALOG)).toBeNull();
    expect(isPowerArmorFrame(FRAME_CATALOG)).toBe(true);
    expect(isPowerArmorFrame(T45_CHEST)).toBe(false);
    expect(powerArmorSlotFor({ itemType: 'powerArmor', protectedAreas: ['Knee'] })).toBeNull();
    expect(PA_PIECE_SLOTS).toEqual(['head', 'body', 'hands', 'legs']);
  });
});

describe('стекинг (§4)', () => {
  it('часть: id+моды+прочность; разные прочности/моды — разные стопки', () => {
    const a = piece('power_armor_t45_chest', 14);
    expect(powerArmorPieceStackKey(a)).toBe('powerArmor:power_armor_t45_chest:mods:none:hp:14');
    expect(powerArmorPieceStackKey(piece('power_armor_t45_chest', 13)))
      .not.toBe(powerArmorPieceStackKey(a));
    expect(powerArmorPieceStackKey(piece('power_armor_t45_chest', 13, { torso: 'mod_a' })))
      .not.toBe(powerArmorPieceStackKey(piece('power_armor_t45_chest', 13, { torso: 'mod_b' })));
    // подпись модов — как у оружия: отсортированные id через '|'
    expect(powerArmorPieceStackKey(piece('x', 5, { a: 'm2', b: 'm1' })))
      .toBe('powerArmor:x:mods:m1|m2:hp:5');
  });

  it('пакет в инвентаре ≠ пакету с другими частями или другим зарядом', () => {
    const eq = wornFrameWithCuts();
    const key1 = powerArmorFrameStackKey(packPackage(eq));
    const eq2 = equipPowerArmorPiece(eq, 'head', piece('power_armor_t45_helmet', 7));
    const key2 = powerArmorFrameStackKey(packPackage(eq2));
    expect(key1).not.toBe(key2);
    const eq3 = { ...eq, frame: { ...eq.frame, core: { charges: 10 } } };
    expect(powerArmorFrameStackKey(packPackage(eq3))).not.toBe(key1);
  });

  it('блок: заряд — часть ключа', () => {
    expect(fusionCoreStackKey(13)).toBe('ammo:ammo_fusion_core:charges:13');
    expect(fusionCoreStackKey(13)).not.toBe(fusionCoreStackKey(14));
  });
});

describe('экипировка пакета (§5.1/§5.2)', () => {
  it('часть без каркаса — needsFrame; битая — broken; с каркасом — ок', () => {
    const empty = createEmptyEquippedPowerArmor();
    expect(canEquipPowerArmorPiece(empty, piece('p', 5))).toEqual({ ok: false, reason: 'needsFrame' });
    const eq = wornFrameWithCuts();
    expect(canEquipPowerArmorPiece(eq, piece('p', 0))).toEqual({ ok: false, reason: 'broken' });
    expect(canEquipPowerArmorPiece(eq, piece('p', 5))).toEqual({ ok: true, reason: null });
  });

  it('снятие каркаса уносит части и блок; повторное надевание восстанавливает всё', () => {
    let eq = wornFrameWithCuts();
    eq = equipPowerArmorPiece(eq, 'head', piece('power_armor_t45_helmet', 3, { plated: 'mod_x01' }));
    eq = equipPowerArmorPiece(eq, 'body', piece('power_armor_t45_chest', 14));
    const packed = packPackage(eq);
    expect(packed.installedCore).toEqual({ charges: 11 });
    expect(packed.installedPieces.head).toEqual(piece('power_armor_t45_helmet', 3, { plated: 'mod_x01' }));
    expect(packed.installedPieces.hands).toBeNull();
    const eq2 = unpackPackage(packed);
    expect(eq2).toEqual(eq);
    expect(hasFrame(eq2)).toBe(true);
  });
});

describe('Ядерный Блок (§3.2/§5.1/§5.4)', () => {
  it('findChargedFusionCores: только заряженные блоки', () => {
    const inv = [core(5), core(0), { id: 'ammo_10mm', itemType: 'ammo' }, core(7)];
    expect(findChargedFusionCores(inv).map((c) => c.charges)).toEqual([5, 7]);
    expect(isFusionCoreItem({ id: 'ammo_10mm' })).toBe(false);
  });

  it('выбор: нет блоков → none; одинаковый заряд → молча первый; разный → choice', () => {
    expect(pickFusionCore([])).toEqual({ kind: 'none' });
    expect(pickFusionCore([core(0)])).toEqual({ kind: 'none' });
    const first = core(5);
    expect(pickFusionCore([first, core(5), core(5)])).toEqual({ kind: 'auto', core: first });
    const choice = pickFusionCore([core(5), core(9)]);
    expect(choice.kind).toBe('choice');
    expect(choice.cores.map((c) => c.charges)).toEqual([5, 9]);
  });

  it('заряды нового блока: 1..20 и кламп к maxCharges из данных', () => {
    for (let i = 0; i < 200; i += 1) {
      const n = rollNewFusionCoreCharges(20);
      expect(n >= 1 && n <= 20).toBe(true);
      expect(rollNewFusionCoreCharges(3) <= 3).toBe(true);
    }
  });

  it('insertCore вставляет блок в надетый каркас', () => {
    const eq = insertCore(wornFrameWithCuts(), core(17));
    expect(eq.frame.core).toEqual({ charges: 17 });
  });
});

describe('таймер расхода (§5.3/§5.4)', () => {
  it('один заряд каждые 12 минут аптайма', () => {
    expect(PA_MS_PER_CHARGE).toBe(12 * 60 * 1000);
    expect(tickCoreAccumulator(createEmptyPowerArmorRuntime(), 12 * 60 * 1000))
      .toEqual({ coreAccumulatorMs: 0, chargesConsumed: 1 });
    expect(tickCoreAccumulator(createEmptyPowerArmorRuntime(), 11 * 60 * 1000).chargesConsumed).toBe(0);
    expect(tickCoreAccumulator(createEmptyPowerArmorRuntime(), 36 * 60 * 1000).chargesConsumed).toBe(3);
  });

  it('накопитель персистентен: «закрыл приложение» = пауза, продолжил с того же места', () => {
    const after6 = tickCoreAccumulator(createEmptyPowerArmorRuntime(), 6 * 60 * 1000);
    expect(after6.chargesConsumed).toBe(0);
    const after6more = tickCoreAccumulator({ coreAccumulatorMs: after6.coreAccumulatorMs }, 6 * 60 * 1000);
    expect(after6more.chargesConsumed).toBe(1);
    expect(after6more.coreAccumulatorMs).toBe(0);
  });

  it('истощение: блок догорел до нуля → исчез и помечен depleted; остаток уменьшается', () => {
    const eq = wornFrameWithCuts(); // charges 11
    const part = drainActiveCore(eq, 4);
    expect(part.depleted).toBe(false);
    expect(part.equipped.frame.core).toEqual({ charges: 7 });
    const end = drainActiveCore(part.equipped, 7);
    expect(end.depleted).toBe(true);
    expect(end.equipped.frame.core).toBeNull();
    // перерасход за один тик (уснули надолго) — тоже depleted
    expect(drainActiveCore(eq, 20).depleted).toBe(true);
    // без блока — ничего не происходит
    expect(drainActiveCore(end.equipped, 5)).toEqual({ equipped: end.equipped, depleted: false });
  });

  it('сценарий §5.4 целиком: догорел → запасные одинаковые → молча вставили, пакет остался', () => {
    const end = drainActiveCore(wornFrameWithCuts(), 11);
    expect(end.depleted).toBe(true);
    const pick = pickFusionCore([core(8), core(8)]);
    expect(pick.kind).toBe('auto');
    const revived = insertCore(end.equipped, pick.core);
    expect(revived.frame.core).toEqual({ charges: 8 });
    const pickNone = pickFusionCore([]);
    expect(pickNone.kind).toBe('none'); // → вызывающий снимает пакет через packPackage
    expect(packPackage(end.equipped).installedPieces).toBeTruthy();
  });
});

describe('прочность и починка (§5.7)', () => {
  it('кнопки −/+ ограничены 0..maxHp', () => {
    const p = piece('c', 2);
    expect(adjustPieceHp(p, -5, 14).hpCurrent).toBe(0);
    expect(adjustPieceHp(p, 100, 14).hpCurrent).toBe(14);
    expect(adjustPieceHp(p, -1, 14).hpCurrent).toBe(1);
  });

  it('починка: доступна при hp<max, бесплатно до max (правило владельца), потом недоступна', () => {
    const maxHp = 14;
    expect(needsRepair(piece('c', 14), maxHp)).toBe(false);
    expect(needsRepair(piece('c', 9), maxHp)).toBe(true);
    expect(needsRepair(piece('c', 0), maxHp)).toBe(true);
    expect(isPieceBroken(piece('c', 0))).toBe(true);
    const repaired = repairPowerArmorPiece(piece('c', 9), maxHp);
    expect(repaired.hpCurrent).toBe(14);
    expect(needsRepair(repaired, maxHp)).toBe(false);
  });
});

describe('подавление нижних слоёв (§5.5)', () => {
  it('голый каркас НЕ подавляет; любая часть — подавляет', () => {
    expect(suppressesLowerLayers(wornFrameWithCuts())).toBe(false);
    expect(suppressesLowerLayers(equipPowerArmorPiece(wornFrameWithCuts(), 'hands', piece('a', 5)))).toBe(true);
    expect(suppressesLowerLayers(equipPowerArmorPiece(wornFrameWithCuts(), 'head', piece('h', 5)))).toBe(true);
  });
});

describe('модификаторы каркаса (§3.4/§5.6)', () => {
  it('у каркаса в данных — attributeModifier.STR = set 11', () => {
    expect(getFrameAttributeModifiers(FRAME_CATALOG)).toEqual({ STR: { op: 'set', value: 11 } });
    expect(getFrameAttributeModifiers(T45_CHEST)).toBeNull();
  });

  it('семантика операций {+,-,set} как у модов оружия; чужая операция — ошибка данных', () => {
    expect(applyAttributeModifierValue(4, { op: 'set', value: 11 })).toBe(11);
    expect(applyAttributeModifierValue(14, { op: 'set', value: 11 })).toBe(11); // set не усиливает
    expect(applyAttributeModifierValue(10, { op: '+', value: 2 })).toBe(12);
    expect(applyAttributeModifierValue(10, { op: '-', value: 2 })).toBe(8);
    expect(() => applyAttributeModifierValue(10, { op: 'x', value: 1 })).toThrow();
  });
});

describe('запреты по политике брони (§5.1: через существующий canEquipArmor)', () => {
  it('супермутанту (raiderOnly) и роботу (robotOnly) PA закрыта существующими правилами', () => {
    const paItem = { ...T45_CHEST };
    expect(paItem.mutantOnly).toBeUndefined();
    expect(paItem.robotOnly).toBeUndefined();
    expect(canEquipArmor(paItem, mutantChar).allowed).toBe(false);
    expect(canEquipArmor(paItem, mutantChar).reason).toBe('equip.error.mutantCannotWearStandardArmor');
    expect(canEquipArmor(paItem, robotChar).allowed).toBe(false);
    expect(canEquipArmor(paItem, robotChar).reason).toBe('equip.error.robotCannotWearStandardArmor');
    expect(canEquipArmor(paItem, humanChar).allowed).toBe(true);
    expect(canEquipArmor(FRAME_CATALOG, mutantChar).allowed).toBe(false);
  });
});
