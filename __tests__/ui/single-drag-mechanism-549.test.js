// ПРИЁМОЧНЫЙ (патч 549): удалить при конверсии/приживании.
//
// Предохранитель правила 13 устава движка: перетаскивание объектов живёт в
// ОДНОМ экземпляре. До 549 механизм был скопирован в четырёх местах; три копии
// держали рабочий шаблон, четвёртая изобрела свой и сломалась (баг 548: мёртвые
// стрелки в админке). Копии расходятся молча — правка в одной не доходит до
// остальных, поэтому запрет обеспечивается тестом, а не памятью разработчика.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const walk = (dir, out = []) => {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.js') || rel.endsWith('.tsx') || rel.endsWith('.ts')) out.push(rel);
  }
  return out;
};

// Единственный владелец механизма переноса.
const HOOK = 'src/ui/useDragResponder.js';

// places, где переносится объект: карточки персонажей, ключей, сетки Мастера
// и строки дерева локаций.
const DRAG_PLACES = [
  'components/screens/HomeScreen/HomeScreen.js',
  'components/lootTrade/KeyItemCardCell.js',
  'components/screens/LootTradeScreen/LootTradeScreen.js',
  'components/screens/LootTradeScreen/modals/HubTreeView.js',
];

// Свайп вкладок — другой механизм (листание, а не перенос объекта).
const SWIPE_ALLOWED = 'modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';

describe('549: правило 13 — один механизм перетаскивания', () => {
  it('хук существует и заявляет жест в обеих фазах опроса', () => {
    const hook = read(HOOK);
    expect(hook).toContain('PanResponder.create');
    // Закон фазы: решение принимает capture, bubble — запасной путь.
    expect(hook).toContain('onStartShouldSetPanResponderCapture');
    expect(hook).toContain('onMoveShouldSetPanResponderCapture');
    expect(hook).toContain('onStartShouldSetPanResponder');
    expect(hook).toContain('onMoveShouldSetPanResponder');
    // Жест не отдаётся ScrollView и не пропускает нативный скролл.
    expect(hook).toContain('onPanResponderTerminationRequest: () => false');
    expect(hook).toContain('onShouldBlockNativeResponder: () => true');
    // Перенос засчитывает только настоящее движение.
    expect(hook).toContain('moved');
  });

  it('все четыре места берут жест из хука, а не держат свою копию', () => {
    for (const rel of DRAG_PLACES) {
      const code = read(rel);
      expect(code, rel).toContain('useDragResponder');
      expect(code, `${rel}: своя копия жеста запрещена`).not.toContain('PanResponder.create');
    }
  });

  it('новой копии механизма переноса в проекте нет', () => {
    const files = [...walk('components'), ...walk('src'), ...walk('modules')];
    const offenders = files.filter((rel) => (
      rel !== HOOK && rel !== SWIPE_ALLOWED && read(rel).includes('PanResponder.create')
    ));
    expect(offenders, 'перенос объекта должен идти через src/ui/useDragResponder.js').toEqual([]);
  });

  it('устав держит правила 13–15, чтобы урок не потерялся', () => {
    const charter = read('docs/architecture/engine-charter.md');
    expect(charter).toContain('| 13 |');
    expect(charter).toContain('useDragResponder.js');
    expect(charter).toContain('| 14 |');
    expect(charter).toContain('ПОВЕДЕНИЕМ');
    expect(charter).toContain('| 15 |');
    expect(charter).toContain('Красный baseline запрещён');
  });
});

describe('549: правило 14 — экран Мастера проверяется поведением', () => {
  it('поведенческий тест монтирует экран и проверяет результат в БД', () => {
    const test = read('__tests__/lootTrade/gm-screen-behaviour-549.test.js');
    // Экран именно МОНТИРУЕТСЯ, а не читается как текст.
    expect(test).toContain("import LootTradeScreen from '../../components/screens/LootTradeScreen/LootTradeScreen.js'");
    expect(test).toContain('create(React.createElement(LootTradeScreen))');
    // Проверяется результат в БД, а не наличие строки в исходнике.
    expect(test).toContain('h.saved');
    expect(test).toContain('childOrder');
    // Жест идёт в реальном порядке опроса: capture раньше bubble.
    expect(test).toContain('onStartShouldSetPanResponderCapture');
    expect(test).toContain("toBe('capture')");
  });

  it('у ручек и карточек есть адреса, иначе поведение не проверить', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).toContain('testID={`card-drag-${container.id}`}');
    expect(screen).toContain('testID={`card-${container.id}`}');
    const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
    expect(tree).toContain('hub-tree-reorder-');
  });
});
