// Приёмочный тест 539: хаб — сам папка-дерево (без отдельной карточки
// «Структура локаций»). Внутри хаба — дерево вложенного: локации-спойлеры,
// пунктирные линии зависимостей; узел открывает настройки. Родитель/выход —
// выпадающие списки; у хаба-папки их нет. Локации таскаются стрелками и
// вкладываются друг в друга, как папки в Windows. Ключ и замок/терминал —
// отдельные поля с понятными подписями; И/ИЛИ = обе преграды или одна из них.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => existsSync(path.join(ROOT, rel));

describe('539: отдельной карточки «Структура локаций» больше нет', () => {
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  it('плитка, состояние и модальное окно дерева убраны', () => {
    expect(screen).not.toContain("type: 'locationTree'");
    expect(screen).not.toContain('locationTreeOpen');
    expect(screen).not.toContain('LocationTreeModal');
    expect(exists('components/screens/LootTradeScreen/modals/LocationTreeModal.js')).toBe(false);
  });
  it('дерево живёт внутри самого хаба', () => {
    expect(screen).toContain('<HubTreeView');
    expect(screen).toContain('hub={activeContainer}');
    expect(screen).toContain("tLootTrade('detail.locationsInside')");
    expect(screen).toContain('setFormModal({ kind: container.kind, initialContainer: container })');
  });
});

describe('539: дерево вложенного — спойлеры и пунктирные зависимости', () => {
  const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
  it('локации раскрываются спойлерами, узел открывает настройки', () => {
    expect(tree).toContain('testID={`hub-tree-toggle-${container.id}`}');
    expect(tree).toContain('testID={`hub-tree-node-${container.id}`}');
    expect(tree).toContain('chevron-down');
    expect(tree).toContain('chevron-right');
    expect(tree).toContain('onOpenSettings');
  });
  it('пунктирные линии показывают, что от чего зависит', () => {
    expect(tree).toContain("borderStyle: 'dashed'");
    expect(tree).toContain("tLootTrade('form.locationTreeBlockedBy')");
    expect(tree).toContain("tLootTrade('form.locationTreeKey')");
    expect(tree).toContain("tLootTrade('form.locationTreeExitTo')");
  });
  it('дети = вложенные локации (parentLocationId) + узлы из links, без дублей', () => {
    expect(tree).toContain('const childrenOf');
    expect(tree).toContain('parentLocationId');
    expect(tree).toContain('node.links');
    expect(tree).toContain('seen.has(c.id)');
    // Игровой путь не ломается: ссылки links остаются нетронутыми.
    expect(tree).not.toContain('saveGmContainer');
    expect(tree).not.toContain('links:');
  });
  it('вложенную локацию можно вынуть обратно на корень', () => {
    expect(tree).toContain('onMoveNestedOut');
    expect(tree).toContain('testID={`hub-tree-move-nested-out-${container.id}`}');
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).toContain('const handleMoveNestedLocationOut');
    expect(screen).toContain("parentLocationId: '', inRoot: true");
    expect(screen).toContain('onMoveNestedOut={handleMoveNestedLocationOut}');
  });
});

describe('539: родитель и выход — выпадающие списки, не кнопки', () => {
  const form = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
  const select = read('components/screens/LootTradeScreen/modals/LocationSelect.js');
  it('форма использует LocationSelect для родителя и выхода', () => {
    expect(form).toContain("import LocationSelect from './LocationSelect'");
    expect(form).toContain('testID="container-form-parent"');
    expect(form).toContain('testID="container-form-exit"');
    // Старые стены чипов убраны.
    expect(form).not.toContain('testID={`container-form-parent-${hub.id}`}');
    expect(form).not.toContain('testID={`container-form-exit-${hub.id}`}');
  });
  it('список прокручивается, ищется и содержит вариант «нет»', () => {
    expect(select).toContain('ScrollView');
    expect(select).toContain('nestedScrollEnabled');
    expect(select).toContain("tLootTrade('form.locationSearchPlaceholder')");
    expect(select).toContain("tLootTrade('form.locationNone')");
    expect(select).toContain('allowNone');
  });
  it('у хаба-папки родителя и выхода нет — он сам родитель', () => {
    expect(form).toContain('{!isCatalogHub && (');
    expect(form).toContain("tLootTrade(isCatalogHub ? 'form.hubFolderHint' : 'form.hubCatalogHint')");
    // Комнаты остаются: хабы определяют серверные комнаты.
    expect(form).toContain("tLootTrade('form.roomsMultiLabel')");
  });
});

describe('539: локации таскаются стрелками и вкладываются друг в друга', () => {
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  it('стрелки переноса есть и у локаций-хабов', () => {
    expect(screen).toContain('{onDragStart && (');
    expect(screen).not.toContain('{!isHub && onDragStart && (');
  });
  it('handleDragStart больше не отбрасывает хабы', () => {
    expect(screen).toContain('if (!card) return;');
    expect(screen).not.toContain('if (!card || card.kind === CONTAINER_KIND.HUB) return;');
  });
  it('бросок на самого себя исключён, цикл матрёшки запрещён и снимает призрак', () => {
    expect(screen).toContain('id !== movingContainerId');
    expect(screen).toContain('wouldCreateParentCycle');
    expect(screen).toContain("tLootTrade('form.locationCycle')");
  });
});

describe('539: ключ и замок/терминал — отдельные понятные поля', () => {
  const form = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
  it('у локации ключ и замок/терминал подписаны по-человечески', () => {
    expect(form).toContain("tLootTrade(isHub ? 'form.locationKeyLabel' : 'form.keyRequirementLabel')");
    expect(form).toContain("tLootTrade(isHub ? 'form.locationGateLabel' : 'form.accessExprLabel')");
    expect(form).toContain("tLootTrade('form.locationGateHint')");
  });
  it('конструктор И/ИЛИ сохранён и выражение уходит в сохранение', () => {
    expect(form).toContain('<AccessExpressionBuilder');
    expect(form).toContain('accessExpression: canRequireKey ? accessTokens');
    expect(form).toContain('isCompleteAccessExpression(accessTokens)');
  });
});

describe('539: парные RU/EN строки', () => {
  const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
  const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
  it('новые ключи есть в обоих языках', () => {
    const formKeys = [
      'locationSearchPlaceholder', 'locationNoMatch', 'hubFolderHint',
      'locationKeyLabel', 'locationGateLabel', 'locationGateHint',
      'locationTreeKey', 'locationTreeEmptyNode',
    ];
    for (const key of formKeys) {
      expect(ru.form[key], `ru.form.${key}`).toBeTruthy();
      expect(en.form[key], `en.form.${key}`).toBeTruthy();
    }
    expect(ru.detail.locationsInside).toBeTruthy();
    expect(en.detail.locationsInside).toBeTruthy();
  });
  it('ключи отдельной карточки дерева убраны из обоих языков', () => {
    expect(ru.actions.locationTree).toBeUndefined();
    expect(en.actions.locationTree).toBeUndefined();
    expect(ru.form.locationTreeTitle).toBeUndefined();
    expect(en.form.locationTreeTitle).toBeUndefined();
  });
  it('подписи передают смысл: папка, ключ, замок, обе преграды или одна', () => {
    expect(ru.form.locationKeyLabel).toContain('Ключевой предмет');
    expect(ru.form.locationGateLabel).toContain('Замок или терминал');
    expect(ru.form.locationGateHint).toContain('обе преграды');
    expect(ru.form.locationGateHint).toContain('одну из них');
    expect(ru.detail.locationsInside).toBe('Локации внутри');
  });
});
