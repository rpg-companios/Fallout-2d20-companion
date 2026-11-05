// Приёмочный тест 540: вложенная локация живёт только внутри родителя и
// показывает свои параметры в дереве, как другие записи в хабе.
// 1) Папка, вложенная в папку, исчезает с корневого экрана (не дублируется).
// 2) У вложенной локации в дереве видны параметры: комнаты, объекты, заперто,
//    ключ, замок/терминал, выход; её можно открыть (перейти внутрь).
// 3) При удалении родителя вложенные локации возвращаются на корень, не теряются.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTAINER_KIND,
  isContainerVisibleOnRoot,
  normalizeContainerEntity,
} from '../../domain/lootTrade';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const hub = (id, extra = {}) => normalizeContainerEntity({
  id, kind: CONTAINER_KIND.HUB, name: id, roomCodes: ['GM-AAA111'], ...extra,
});

describe('540: вложенная локация не показывается на корневом экране', () => {
  it('локация без родителя — на корне', () => {
    const nipton = hub('nipton');
    expect(isContainerVisibleOnRoot(nipton, [nipton])).toBe(true);
  });

  it('локация с родителем живёт только внутри родителя (как папка в папке)', () => {
    const nipton = hub('nipton');
    const mayor = hub('mayor', { parentLocationId: 'nipton' });
    const all = [nipton, mayor];
    expect(isContainerVisibleOnRoot(nipton, all)).toBe(true);
    expect(isContainerVisibleOnRoot(mayor, all)).toBe(false);
  });

  it('перенос в хаб скрывает с корня, вынос обратно — возвращает', () => {
    const nipton = hub('nipton');
    const moved = hub('mayor', { parentLocationId: 'nipton', inRoot: false });
    expect(isContainerVisibleOnRoot(moved, [nipton, moved])).toBe(false);
    const out = { ...moved, parentLocationId: '', inRoot: true };
    expect(isContainerVisibleOnRoot(out, [nipton, out])).toBe(true);
  });

  it('если родитель удалён, вложенная локация не теряется и возвращается на корень', () => {
    const orphan = hub('mayor', { parentLocationId: 'gone' });
    expect(isContainerVisibleOnRoot(orphan, [orphan])).toBe(true);
  });

  it('сундук/торговец по-прежнему скрыт в локации, если не вынесен на экран', () => {
    const nipton = hub('nipton', { links: [{ containerId: 'chest', locked: false }] });
    const chest = normalizeContainerEntity({ id: 'chest', kind: CONTAINER_KIND.LOOT, name: 'chest' });
    expect(isContainerVisibleOnRoot(chest, [nipton, chest])).toBe(false);
    expect(isContainerVisibleOnRoot({ ...chest, inRoot: true }, [nipton, chest])).toBe(true);
  });
});

describe('540: у вложенной локации в дереве есть параметры', () => {
  const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');

  it('мета-строка локации: комнаты, объекты, заперто', () => {
    expect(tree).toContain('const renderHubMeta');
    expect(tree).toContain('testID={`hub-tree-meta-${container.id}`}');
    expect(tree).toContain("tLootTrade('detail.roomsLabel')");
    expect(tree).toContain("tLootTrade('card.hubNodesCount')");
    expect(tree).toContain("tLootTrade('card.hubLockedCount')");
    expect(tree).toContain('{isHub && renderHubMeta(container)}');
  });

  it('комнаты приходят из экрана (formatHubCardRoomLabel)', () => {
    expect(tree).toContain('roomLabelOf');
    expect(screen).toContain('roomLabelOf={formatHubCardRoomLabel}');
  });

  it('ключ, замок/терминал и выход по-прежнему видны пунктиром', () => {
    expect(tree).toContain('const renderDependencies');
    expect(tree).toContain("tLootTrade('form.locationTreeBlockedBy')");
    expect(tree).toContain("tLootTrade('form.locationTreeKey')");
    expect(tree).toContain("tLootTrade('form.locationTreeExitTo')");
    expect(tree).toContain("borderStyle: 'dashed'");
  });
});

describe('540: вложенную локацию можно открыть и она не теряется при удалении', () => {
  const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');

  it('кнопка «Содержимое» открывает вложенную локацию (переход внутрь)', () => {
    expect(tree).toContain('testID={`hub-tree-open-nested-${container.id}`}');
    expect(tree).toContain('onOpenChild?.(container)');
    expect(tree).toContain("tLootTrade('detail.hubOpenChildCard')");
    // Переход внутрь ставит активного контейнера и запоминает возврат.
    expect(screen).toContain('setReturnHubId(activeContainer.id);');
    expect(screen).toContain('setActiveContainerId(child.id);');
  });

  it('при удалении хаба вложенные локации выносятся на корень', () => {
    expect(screen).toContain('const nestedLocations = containers.filter(');
    expect(screen).toContain("String(c.parentLocationId || '').trim() === container.id");
    expect(screen).toContain("{ ...nested, parentLocationId: '', inRoot: true }");
  });
});

describe('540: парные строки параметров на обоих языках', () => {
  const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
  const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
  it('ключи параметров есть в обоих языках', () => {
    expect(ru.detail.roomsLabel).toBeTruthy();
    expect(en.detail.roomsLabel).toBeTruthy();
    expect(ru.card.hubNodesCount).toBeTruthy();
    expect(en.card.hubNodesCount).toBeTruthy();
    expect(ru.card.hubLockedCount).toBeTruthy();
    expect(en.card.hubLockedCount).toBeTruthy();
    expect(ru.detail.hubOpenChildCard).toBeTruthy();
    expect(en.detail.hubOpenChildCard).toBeTruthy();
  });
});
