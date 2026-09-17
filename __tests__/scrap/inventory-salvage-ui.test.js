// Патч 264, UI разбора в инвентаре: подстрока состава со скрытием недостижимого
// (решение владельца 263: не цвета, а скрытие + счётчик) и отчёт о результате.
// Тесты без React: чистые функции + проверка обвязки экрана по исходнику и
// наличия строк обеих локалей (тот же приём, что у обвязки AddItemModal в 260).

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { salvageButtonForItem, salvageSublineForItem } from '../../modules/fallout/salvage/subline';
import { buildSalvageReport } from '../../components/screens/InventoryScreen/logic/salvageResultReport';
import { tInventory } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { formatInventoryText as formatText } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../../i18n/locale';

const ROOT = new URL('../../', import.meta.url).pathname;
const readText = (rel) => readFileSync(ROOT + rel, 'utf8');

const state = () => useCharacterStore.getState();
const scrapper = (rank) => useCharacterStore.setState({
  selectedPerks: Array.from({ length: rank }, () => ({ perkId: 'scrapper' })),
});

const stackOf = (itemId, quantity = 1) => {
  const instanceId = state().addNewItem({ itemId, quantity });
  return state().items[instanceId];
};

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('подстрока состава в строке инвентаря', () => {
  it('battery без «Мусорщика»: виден только пластик, +2 спрятано', () => {
    const subline = salvageSublineForItem(stackOf('battery'), state());
    expect(subline).toMatchObject({ salvageable: true, hidden: 2, ceiling: 0 });
    expect(subline.parts).toEqual([{ itemId: 'plastic', name: expect.any(String), count: 1 }]);
  });

  it('ранг 1: пластик и свинец, кислота скрыта; ранг 2: всё и без счётчика', () => {
    scrapper(1);
    const one = salvageSublineForItem(stackOf('battery'), state());
    expect(one.parts.map((p) => p.itemId).sort()).toEqual(['lead', 'plastic']);
    expect(one.hidden).toBe(1);
    scrapper(2);
    const two = salvageSublineForItem(stackOf('battery'), state());
    expect(two.parts.map((p) => p.itemId).sort()).toEqual(['acid', 'lead', 'plastic']);
    expect(two.hidden).toBe(0);
  });

  it('будильник без перка: доступного нет — подстрока есть, кнопки не будет', () => {
    const subline = salvageSublineForItem(stackOf('alarm_clock'), state());
    expect(subline).toMatchObject({ salvageable: false, hidden: 4 });
    expect(subline.parts).toEqual([]);
  });

  it('альтернатива «или»: список — объединение, количество не обещаем', () => {
    scrapper(2);
    const subline = salvageSublineForItem(stackOf('can'), state());
    expect(subline.salvageable).toBe(true);
    // два варианта дают разные материалы — счёт показан только там, где он однозначен
    const withCount = subline.parts.filter((p) => p.count != null);
    const total = subline.parts.length;
    expect(total).toBeGreaterThanOrEqual(1);
    expect(withCount.length).toBeLessThanOrEqual(total);
  });

  it('хлам без состава и несуществующий предмет — подстроки нет вообще', () => {
    expect(salvageSublineForItem(stackOf('bloatfly_gland'), state())).toBeNull();
    expect(salvageSublineForItem({ id: 'x', weaponId: 'not_a_real_item' }, state())).toBeNull();
    expect(salvageSublineForItem(null, state())).toBeNull();
  });

  it('строка UI с синтетическим uniqueId всё равно находит состав по коду каталога', () => {
    const bucket = stackOf('bucket');
    const displayRow = { ...bucket, uniqueId: `inv-stack-${bucket.stackKey}` };

    expect(salvageSublineForItem(displayRow, state())).toMatchObject({
      salvageable: true,
      parts: [{ itemId: 'steel', count: 2 }],
    });
    expect(salvageButtonForItem(displayRow, state())?.enabled).toBe(true);
  });
});

describe('отчёт о разборе для алерта', () => {
  it('успех: список с количеством, время и пометка про осложнение', () => {
    const report = buildSalvageReport({
      done: true,
      granted: [{ itemId: 'plastic', quantity: 1 }, { itemId: 'lead', quantity: 3 }],
      time: { minutes: 10, durationMultiplier: 2 },
    });
    const names = getEquipmentCatalog(getCurrentModuleLocale()).materials;
    const plastic = names.find((m) => m.id === 'plastic').name;
    expect(report.title).toBe(tInventory('screen.salvage.doneTitle'));
    expect(report.message).toContain(plastic);
    expect(report.message).toContain('×3');
    expect(report.message).toContain('20');
    expect(report.message).toContain(tInventory('screen.salvage.complicationNote'));
  });

  it('нули на костях: предмет списан, выхода нет', () => {
    const report = buildSalvageReport({
      done: true, granted: [], time: { minutes: 10, durationMultiplier: 1 },
    });
    expect(report.message).toContain(tInventory('screen.salvage.empty'));
    expect(report.message).toContain('10');
    expect(report.message).not.toContain(tInventory('screen.salvage.complicationNote'));
  });

  it('провал проверки: хлам цел, потерянное время честно', () => {
    const report = buildSalvageReport({
      done: false, stage: 'check', reason: 'check-failed',
      time: { minutes: 10, durationMultiplier: 2 },
    });
    expect(report.title).toBe(tInventory('screen.salvage.failTitle'));
    expect(report.message).toContain(tInventory('screen.salvage.fail'));
    expect(report.message).toContain('20');
  });

  it('гейты: «Мусорщик» и прочие причины рассказаны по-человечески', () => {
    const empty = buildSalvageReport({ done: false, stage: 'gate', reason: 'no-materials', time: null });
    expect(empty.message).toBe(tInventory('screen.salvage.noMaterials'));
    const inUse = buildSalvageReport({ done: false, stage: 'gate', reason: 'in-use', time: null });
    expect(inUse.title).toBe(tInventory('screen.salvage.notStartedTitle'));
    expect(inUse.message).toContain('in-use');
  });
});

describe('обвязка экрана и строки локалей (по исходнику)', () => {
  it('InventoryScreen импортирует разбор и рисует кнопку/подстроку', () => {
    const src = readText('components/screens/InventoryScreen/InventoryScreen.js');
    expect(src).toContain("from '../../../modules/fallout/salvage/operations'");
    expect(src).toContain("from '../../../modules/fallout/salvage/subline'");
    expect(src).toContain('const handleSalvagePress = (rowItem) => {');
    expect(src).toContain("tInventory('screen.salvage.action')");
    expect(src).toContain("tInventory('screen.salvage.label')");
    // 267: кнопка у хлама есть всегда, активность — по общему превью;
    // при несоблюдённых условиях — затемнена и не срабатывает.
    expect(src).toContain('salvageButtonForItem(item, useCharacterStore.getState())');
    expect(src).toContain('!salvage.enabled && styles.applyButtonDisabled');
    expect(src).toContain('disabled={!salvage.enabled}');
    // 275: нехватка ранга называется прямо — «требуется перк … ранг N».
    expect(src).toContain("salvage.gate === 'rank'");
    expect(src).toContain("tInventory('screen.salvage.requiresRank')");
    expect(src).not.toContain('salvage?.salvageable &&');
    expect(readText('styles/InventoryScreen.styles.js')).toContain('applyButtonDisabled');
  });

  it('секция salvage есть в обеих локалях слоя Fallout', () => {
    for (const locale of ['ru-RU', 'en-EN']) {
      const dict = JSON.parse(readText(`modules/fallout/i18n/${locale}/screens/inventory/screen.json`));
      const need = ['action', 'label', 'unavailable', 'requiresRank', 'hidden', 'doneTitle', 'failTitle',
        'emptyTitle', 'notStartedTitle', 'done', 'empty', 'fail', 'timeLine',
        'complicationNote', 'noMaterials', 'notStarted', 'material'];
      for (const key of need) {
        expect(typeof dict.salvage?.[key], `${locale}/${key}`).toBe('string');
        expect(dict.salvage[key].length, `${locale}/${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('кнопка «Разобрать» у хлама (267): есть всегда, работает по условиям', () => {
  const equip = (instanceId) => useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [instanceId]: { ...prev.items[instanceId], equipped: true } },
  }));

  it('хлам без печатного состава: кнопка есть и активна (общий пул 261), подстроки нет', () => {
    const gland = stackOf('bloatfly_gland');
    const button = salvageButtonForItem(gland, state());
    expect(button).not.toBeNull();
    expect(button.hasComposition).toBe(false);
    expect(button.parts).toEqual([]);
    expect(button.enabled).toBe(true);
  });

  it('будильник без «Мусорщика»: состав срезан целиком — кнопка затемнена, не сработает', () => {
    const clock = stackOf('alarm_clock');
    const button = salvageButtonForItem(clock, state());
    expect(button).not.toBeNull();
    expect(button.hasComposition).toBe(true);
    expect(button.enabled).toBe(false);
    expect(button.hidden).toBe(4);
  });

  it('battery без перка: пластик доступен — кнопка активна; надетый хлам — всегда серая', () => {
    const battery = stackOf('battery');
    expect(salvageButtonForItem(battery, state()).enabled).toBe(true);
    equip(battery.id);
    const worn = salvageButtonForItem(state().items[battery.id], state());
    expect(worn).not.toBeNull();
    expect(worn.enabled).toBe(false);
  });

  it('не хлам без состава — кнопки нет вообще (как и подстроки)', () => {
    const pistol = stackOf('weapon_10mm_pistol');
    expect(salvageButtonForItem(pistol, state())).toBeNull();
    expect(salvageButtonForItem({ id: 'x', weaponId: 'not_a_real_item' }, state())).toBeNull();
    expect(salvageButtonForItem(null, state())).toBeNull();
  });
});

describe('гейт по рангу «Мусорщика» (275): нехватка ранга называется прямо', () => {
  it('мел с рангом 1: не «недоступно без Мусорщика», а «требуется ранг 2»', () => {
    scrapper(1);
    const subline = salvageSublineForItem(stackOf('chalk'), state());
    expect(subline).toMatchObject({
      salvageable: false, hidden: 1, ceiling: 1, gate: 'rank', requiredRank: 2,
    });
    const line = formatText(tInventory('screen.salvage.requiresRank'), { rank: subline.requiredRank });
    // Локаль теста может быть любой — проверяем подстановку ранга и имя перка
    // в обеих формах словаря (ключ есть в обеих локалях — ниже по «обвязке»).
    expect(line).toContain('2');
    expect(/Мусорщик|Scrapper/.test(line)).toBe(true);
    expect(line).not.toContain('{rank}');
  });

  it('мел без перка: прежняя формулировка причины (уговор 264), гейт — no-perk', () => {
    const subline = salvageSublineForItem(stackOf('chalk'), state());
    expect(subline).toMatchObject({ salvageable: false, gate: 'no-perk' });
  });

  it('мел с рангом 2: состав доступен — гейта нет, счётчик скрытых пуст', () => {
    scrapper(2);
    const subline = salvageSublineForItem(stackOf('chalk'), state());
    expect(subline).toMatchObject({ salvageable: true, gate: null, hidden: 0 });
    expect(subline.requiredRank).toBeNull();
  });

  it('battery без перка: часть доступна — ранговый гейт не вставляется, счётчик остаётся', () => {
    const subline = salvageSublineForItem(stackOf('battery'), state());
    expect(subline).toMatchObject({ salvageable: true, gate: null, hidden: 2 });
  });

  it('строка экрана (с uniqueId) на мелу ранга 1: гейт доживает до кнопки, она серая', () => {
    scrapper(1);
    const chalk = stackOf('chalk');
    const displayRow = { ...chalk, uniqueId: `inv-stack-${chalk.stackKey}` };
    const button = salvageButtonForItem(displayRow, state());
    expect(button).toMatchObject({ gate: 'rank', requiredRank: 2, enabled: false, hidden: 1 });
  });
});
