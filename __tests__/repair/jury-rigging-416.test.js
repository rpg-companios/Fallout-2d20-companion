// ПРИЁМОЧНЫЙ (патчи 416–417): «Очумелые ручки» (juryRigging) + настройка
// прочности включена по умолчанию. Книжный текст перка (канон 410,
// modules/fallout/i18n/ru-RU/data/perks/perks.json): «Вы можете починить
// предмет, не затрачивая на это никаких компонентов. Однако ремонт будет
// временным, и предмет снова сломается при следующем осложнении, которое
// вы получите при его использовании. Диапазон осложнений при проверках
// на умение пользоваться этим предметом увеличивается на 1, до значения
// на броске 19-20.» Слово владельца 416: кнопка ОДНА — бесплатная починка
// при отключённых настройках ИЛИ при перке. Слово владельца 417: с перком
// кнопка ВСЕГДА открывает окно выбора — ТРИ кнопки: «Без затрат
// (некачественно)» (активна всегда), «За счёт донора (ускоренный
// ремонт)» (серая без донора), «За счёт материалов» (серая без
// материалов); мгновенных срабатываний нет — бесплатный путь тоже тест
// и время, только без затрат, и результат временный (книга).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import useCharacterStore from '../../src/store/characterStore';
import {
  juryRiggingRanksFor,
  markTemporaryRepairOnItem,
  markTemporaryRepairOnEquippedPiece,
  splitOnePieceFromStack,
  performRepair,
  performEquippedPieceRepair,
  repairPreview,
} from '../../modules/fallout/repair/operations';
import { performEquippedPieceRepair } from '../../modules/fallout/repair/operations';
import { setCurrentModuleLocale } from '../../i18n/locale';
import { buildRepairReport } from '../../modules/fallout/repair/operations';

const state = () => useCharacterStore.getState();
const seedPerk = () => useCharacterStore.setState({ selectedPerks: [{ perkId: 'juryRigging', index: 0 }] });

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const seedWeapon = ({ durability = 40, quantity = 1, id, flagged = false } = {}) => {
  const key = id ?? `seed_pistol_${Math.random().toString(36).slice(2, 7)}`;
  useCharacterStore.setState((prev) => ({
    items: {
      ...prev.items,
      [key]: {
        id: 'weapon_10mm_pistol', weaponId: 'weapon_10mm_pistol', itemType: 'weapon',
        durability, durabilityTracked: true, quantity,
        ...(flagged ? { temporaryRepair: true } : {}),
      },
    },
  }));
  return key;
};

const seedPaPiece = ({ hpCurrent = 2, quantity = 1, id } = {}) => {
  const key = id ?? `seed_chest_${Math.random().toString(36).slice(2, 7)}`;
  useCharacterStore.setState((prev) => ({
    items: {
      ...prev.items,
      [key]: {
        id: 'power_armor_raider_chest', weaponId: 'power_armor_raider_chest',
        itemType: 'powerArmor', hpCurrent, maxHp: 10, quantity,
      },
    },
  }));
  return key;
};

describe('Патч 416: «Очумелые ручки» — активность перка', () => {
  it('без выбора перка рангов 0; с выбором — 1 (требований нет, всегда действует)', () => {
    expect(juryRiggingRanksFor()).toBe(0);
    seedPerk();
    expect(juryRiggingRanksFor()).toBe(1);
  });
});

describe('Патч 417: «Без затрат (некачественно)» — тот же тест, без затрат, результат временный', () => {
  it('оружие: тест без траты материалов, по 1 шт, флаг временного ремонта', () => {
    seedPerk();
    const key = seedWeapon({ durability: 40, quantity: 2 });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 8 },
      },
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performRepair(key, { mode: 'free', ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    expect(result.temporary).toBe(true);
    // Материалы остались в сумке (бесплатно).
    const mats = Object.values(state().items).filter((it) => it.weaponId === 'item_common_materials')
      .reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
    expect(mats).toBe(8);
    const pistols = Object.values(state().items).filter((it) => it.weaponId === 'weapon_10mm_pistol');
    const whole = pistols.find((it) => Number(it.durability) === 100);
    const damaged = pistols.find((it) => Number(it.durability) === 40);
    expect(whole?.quantity ?? 0).toBe(1);            // починена ОДНА штука
    expect(damaged?.quantity ?? 0).toBe(1);          // вторая ждёт
    expect(whole?.temporaryRepair).toBe(true);       // ремонт ВРЕМЕННЫЙ
    expect(damaged?.temporaryRepair).toBeUndefined(); // остальные чисты
  });

  it('пачка СБ: бесплатно по 1 шт, флаг на починенной', () => {
    seedPerk();
    const key = seedPaPiece({ hpCurrent: 2, quantity: 2 });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 8 },
        seed_mat2: { id: 'item_uncommon_materials', weaponId: 'item_uncommon_materials', quantity: 8 },
      },
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performRepair(key, { mode: 'free', ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    const pieces = Object.values(state().items).filter((it) => it.weaponId === 'power_armor_raider_chest');
    const whole = pieces.find((it) => Number(it.hpCurrent) === 10);
    expect(whole?.quantity ?? 0).toBe(1);
    expect(whole?.temporaryRepair).toBe(true);
  });

  it('надетая часть СБ: бесплатно, флаг на части', () => {
    seedPerk();
    useCharacterStore.setState((prev) => ({
      equippedPowerArmor: {
        ...(prev.equippedPowerArmor || {}),
        pieces: {
          ...(prev.equippedPowerArmor?.pieces || {}),
          torso: { catalogId: 'power_armor_raider_chest', hpCurrent: 3 },
        },
      },
      items: {
        ...(prev.items || {}),
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 8 },
        seed_mat2: { id: 'item_uncommon_materials', weaponId: 'item_uncommon_materials', quantity: 8 },
      },
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performEquippedPieceRepair('torso', { mode: 'free', ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    expect(result.temporary).toBe(true);
    const piece = state().equippedPowerArmor.pieces.torso;
    expect(piece.hpCurrent).toBe(10);
    expect(piece.temporaryRepair).toBe(true);
  });

  it('провал бесплатного ремонта: ничего не потрачено, флага нет', () => {
    seedPerk();
    const key = seedWeapon({ durability: 40 });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 4 },
      },
      attributes: { ...prev.attributes, INT: { total: 0 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    const result = performRepair(key, { mode: 'free', ports: { rollD20: () => 19 } });
    expect(result.done).toBe(false);
    const mats = Object.values(state().items).filter((it) => it.weaponId === 'item_common_materials')
      .reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
    expect(mats).toBe(4);
    expect(state().items[key].durability).toBe(40);
    expect(state().items[key].temporaryRepair).toBeUndefined();
  });

  it('«За счёт донора» = прежний донорный поток (донор списан, постоянный ремонт)', () => {
    seedPerk();
    const key = seedWeapon({ durability: 40, id: 'seed_target' });
    seedWeapon({ durability: 55, id: 'seed_donor' }); // донор — тот же тип
    useCharacterStore.setState((prev) => ({
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performRepair('seed_target', {
      donorStoreItemId: 'seed_donor', mode: 'donor',
      ports: { rollD20: () => [2, 3][i++ % 2] },
    });
    expect(result.done).toBe(true);
    expect(result.temporary).toBe(false);            // постоянный ремонт
    expect(state().items.seed_target.durability).toBe(100);
    expect(state().items.seed_donor).toBeUndefined(); // донор разобран
  });

  it('износ при выстреле НЕ снимает флаг (перк снимает только осложнение)', () => {
    const key = seedWeapon({ durability: 100, flagged: true });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_ammo: { id: 'ammo_10mm', weaponId: 'ammo_10mm', itemType: 'ammo', quantity: 20 },
      },
    }));
    const spend = state().spendAmmoForWeapon({
      weaponInstanceId: key,
      ammoIds: ['ammo_10mm'],
      ammoAmount: 10,
      durabilityEnabled: true,
      baseLossPer10Shots: 1,
    });
    expect(spend.ok).toBe(true);
    expect(state().items[key].durability).toBeLessThan(100);
    expect(state().items[key].temporaryRepair).toBe(true);
  });
});

describe('Патч 416: флаг временного ремонта снимается честным ремонтом', () => {
  it('книжный ремонт (тест с материалами) перезачитывает «Очумелые ручки»', () => {
    setCurrentModuleLocale('ru-RU');
    const key = seedWeapon({ durability: 40, flagged: true });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 4 },
      },
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performRepair(key, { ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    expect(state().items[key].durability).toBe(100);
    expect(state().items[key].temporaryRepair).toBeUndefined();
  });

  it('честный ремонт надетой части снимает флаг', () => {
    setCurrentModuleLocale('ru-RU');
    useCharacterStore.setState((prev) => ({
      equippedPowerArmor: {
        ...(prev.equippedPowerArmor || {}),
        pieces: {
          ...(prev.equippedPowerArmor?.pieces || {}),
          torso: { catalogId: 'power_armor_raider_chest', hpCurrent: 3, temporaryRepair: true },
        },
      },
      items: {
        ...(prev.items || {}),
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 6 },
        seed_mat2: { id: 'item_uncommon_materials', weaponId: 'item_uncommon_materials', quantity: 6 },
      },
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performEquippedPieceRepair('torso', { ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    expect(state().equippedPowerArmor.pieces.torso.temporaryRepair).toBeUndefined();
  });

  it('разделение пачки не наследует флаг (паспорт)', () => {
    const key = seedWeapon({ durability: 40, quantity: 2, flagged: true });
    const singleId = splitOnePieceFromStack(key);
    expect(state().items[singleId].temporaryRepair).toBeUndefined();
    expect(state().items[key].temporaryRepair).toBeUndefined();
  });

  it('паспорт загрузки: не-булев флаг отбрасывается (normalizeItemParameters)', async () => {
    const { normalizeItemParameters } = await import('../../src/store/resolvers');
    expect(normalizeItemParameters({ id: 'x', temporaryRepair: true }).temporaryRepair).toBe(true);
    expect(normalizeItemParameters({ id: 'x', temporaryRepair: 'yes' }).temporaryRepair).toBeUndefined();
    expect(normalizeItemParameters({ id: 'x', temporaryRepair: 0 }).temporaryRepair).toBeUndefined();
  });
});

describe('Патч 421: прочность распространяется на броню — чинится тем же окном', () => {
  const seedArmor = ({ durability = 30, quantity = 1, id, flagged = false } = {}) => {
    const key = id ?? `seed_armor_${Math.random().toString(36).slice(2, 7)}`;
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        [key]: {
          id: 'armor_leather_chest_001', weaponId: 'armor_leather_chest_001', itemType: 'armor',
          durability, durabilityTracked: true, quantity,
          ...(flagged ? { temporaryRepair: true } : {}),
        },
      },
    }));
    return key;
  };

  it('repairTargetFor: броня — цель ремонта с редкостью из каталога', () => {
    const key = seedArmor({ durability: 30 });
    const preview = repairPreview(key);
    expect(preview.canRepair).toBe(true);
    expect(preview.target.kind).toBe('armor');
    expect(preview.target.max).toBe(100);
    expect(preview.rarity).toBe(1); // armor_leather_chest_001 из armor.json
    expect(preview.complexity).toBe(1);
  });

  it('книжный ремонт брони: материалы по редкости, прочность 100, флаг временного снят', () => {
    setCurrentModuleLocale('ru-RU');
    const key = seedArmor({ durability: 30, flagged: true });
    useCharacterStore.setState((prev) => ({
      items: {
        ...prev.items,
        seed_mat: { id: 'item_common_materials', weaponId: 'item_common_materials', quantity: 6 },
      },
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performRepair(key, { ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    expect(result.spent).toEqual([{ itemId: 'item_common_materials', count: 2 }]); // редкость 1 → 2 Обычных
    expect(state().items[key].durability).toBe(100);
    expect(state().items[key].temporaryRepair).toBeUndefined();
  });

  it('бесплатный режим «Очумелых ручек» для брони: без трат, временно', () => {
    seedPerk();
    const key = seedArmor({ durability: 30, quantity: 2 });
    useCharacterStore.setState((prev) => ({
      attributes: { ...prev.attributes, INT: { total: 5 } },
      skills: { ...prev.skills, REPAIR: { base: 0, total: 0 } },
    }));
    let i = 0;
    const result = performRepair(key, { mode: 'free', ports: { rollD20: () => [2, 3][i++ % 2] } });
    expect(result.done).toBe(true);
    expect(result.temporary).toBe(true);
    const armors = Object.values(state().items).filter((it) => it.weaponId === 'armor_leather_chest_001');
    expect(armors.find((it) => Number(it.durability) === 100)?.quantity ?? 0).toBe(1);
    expect(armors.find((it) => Number(it.durability) === 30)?.quantity ?? 0).toBe(1);
  });
});

describe('Патч 417: окно выбора — три кнопки, серые по наличию', () => {
  const modal = () => readFileSync('modules/fallout/screens/InventoryScreen/modals/RepairModal.js', 'utf8');

  it('три кнопки с книжными подписями; бесплатная — всегда активна', () => {
    const code = modal();
    expect(code).toContain("tInventory('repair.choice.free')");
    expect(code).toContain("tInventory('repair.choice.donor')");
    expect(code).toContain("tInventory('repair.choice.materials')");
    // Кнопки зовут свои режимы.
    expect(code).toContain("execute({ mode: 'free' })");
    expect(code).toContain("execute({ mode: 'donor' })");
    expect(code).toContain("execute({ mode: 'materials' })");
    // «Без затрат» без disabled; донор — серая без доноров; материалы — серая без готовности.
    expect(code).toContain("(preview.donors ?? []).length === 0 && styles.mainButtonDisabled");
    expect(code).toContain("!preview.evaluation?.ready && styles.mainButtonDisabled");
    // Бесплатная кнопка (первая в футере выбора) не имеет disabled.
    const freeBlock = code.slice(code.indexOf("execute({ mode: 'free' })") - 400, code.indexOf("execute({ mode: 'free' })"));
    expect(freeBlock).not.toContain('disabled=');
  });

  it('автостарта с перком нет: выбор всегда за игроком (слово 417)', () => {
    const code = modal();
    expect(code).toContain('!juryActive && (preview.donors ?? []).length === 0');
  });

  it('донор для «За счёт донора»: выбранный в списке или первый', () => {
    const code = modal();
    expect(code).toContain("mode === 'donor'");
    expect(code).toContain('donorId ?? (preview.donors ?? [])[0] ?? null');
  });

  it('отчёт бесплатного ремонта говорит о временности (строка словаря крафта)', () => {
    setCurrentModuleLocale('ru-RU');
    const report = buildRepairReport({ done: true, temporary: true, check: { rolls: [2], passed: true, successes: 1, targetNumber: 5 }, spent: [] }, { attributeName: 'ИНТ', skillName: 'Ремонт' });
    expect(report.lines.join(' ')).toContain('временный');
    const reportOk = buildRepairReport({ done: true, check: { rolls: [2], passed: true, successes: 1, targetNumber: 5 }, spent: [] }, { attributeName: 'ИНТ', skillName: 'Ремонт' });
    expect(reportOk.lines.join(' ')).not.toContain('временный');
  });

  it('подписи кнопок и строка «временно» в обоих языках', () => {
    for (const loc of ['ru-RU', 'en-EN']) {
      const screen = JSON.parse(readFileSync(`modules/fallout/i18n/${loc}/screens/inventory/screen.json`, 'utf8'));
      expect(screen.repair.choice.free.length).toBeGreaterThan(3);
      expect(screen.repair.choice.donor.length).toBeGreaterThan(3);
      expect(screen.repair.choice.materials.length).toBeGreaterThan(3);
      const craft = JSON.parse(readFileSync(`modules/fallout/i18n/${loc}/screens/inventory/craftingModal.json`, 'utf8'));
      expect(craft.repair.temporary).toContain('19–20');
    }
  });
});

describe('Патч 416: настройка прочности включена по умолчанию (слово владельца)', () => {
  it('settings.json: defaultValue = true', () => {
    const settings = JSON.parse(readFileSync('modules/fallout/settings.json', 'utf8'));
    const setting = settings.find((s) => s.id === 'weaponDurabilityLossEnabled');
    expect(setting.defaultValue).toBe(true);
  });

  it('старые сейвы без явного выбора получают включённую (fallback true в мерже стора)', () => {
    const srcStore = readFileSync('src/store/appSettingsStore.js', 'utf8');
    // 421: три ветки — явный выбор, легаси-переключатель, иначе включена.
    expect(srcStore).toContain('fallout.weaponDurabilityLossEnabled = true;');
    expect(srcStore).toContain("Boolean(old.randomWeaponDurabilityEnabled)");
  });
});

describe('Патч 416: проводка и словари', () => {
  it('заметка о временном ремонте показывается на карточке (оружие, СБ, надетая часть)', () => {
    const code = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
    // Два места: общий подзаголовок карточки (оружие И пачка СБ) + надетая часть.
    expect((code.match(/tInventory\('repair\.tempNote'\)/g) ?? []).length).toBe(2);
    expect(code).toContain('temporaryRepair: piece.temporaryRepair === true,');
  });

  it('словарь tempNote есть в обоих языках', () => {
    const ru = JSON.parse(readFileSync('modules/fallout/i18n/ru-RU/screens/inventory/screen.json', 'utf8'));
    const en = JSON.parse(readFileSync('modules/fallout/i18n/en-EN/screens/inventory/screen.json', 'utf8'));
    expect(ru.repair.tempNote).toContain('19–20');
    expect(en.repair.tempNote).toContain('19–20');
  });

  it('канон перка: 1 ранг, без требований; книга: бесплатно, временно, 19–20', () => {
    const catalog = JSON.parse(readFileSync('modules/fallout/data/perks/perks.json', 'utf8'));
    const perk = (Array.isArray(catalog) ? catalog : catalog.perks).find((p) => p.id === 'juryRigging');
    expect(perk.maxRanks).toBe(1);
    expect(perk.prerequisites).toEqual({});
    const ru = JSON.parse(readFileSync('modules/fallout/i18n/ru-RU/data/perks/perks.json', 'utf8'));
    const ruPerk = (Array.isArray(ru) ? ru : ru.perks).find((p) => p.id === 'juryRigging');
    expect(ruPerk.effect).toContain('19-20');
    expect(ruPerk.effect).toContain('временным');
  });
});
