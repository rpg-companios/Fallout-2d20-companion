// Приёмочный тест 538: структура локаций в админке — конструктор требования
// И/ИЛИ (+ = И, / = ИЛИ), строки «родительская локация» / «выход из локации»,
// чекбокс «Хаб», дерево структуры с переходом в настройки и матрёшка
// «локация в локацию». Игровая часть (окно игрока) остаётся на потом.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCESS_OP,
  makeCheckToken,
  makeOpToken,
  appendCheck,
  appendOp,
  canAppendCheck,
  canAppendOp,
  removeLastToken,
  isCompleteAccessExpression,
  expressionCheckIds,
  evaluateAccessExpression,
  formatAccessExpression,
  resolveAccessExpression,
} from '../../server/accessExpression.js';
import { resolveKeyAccess, KEY_ACCESS } from '../../server/keyAccess.js';
import { CONTAINER_KIND, normalizeContainerEntity } from '../../domain/lootTrade.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const C = (id) => makeCheckToken(id);
const AND = makeOpToken(ACCESS_OP.AND);
const OR = makeOpToken(ACCESS_OP.OR);

describe('538: модель выражения И/ИЛИ', () => {
  it('+ — это И, / — это ИЛИ', () => {
    expect(ACCESS_OP.AND).toBe('+');
    expect(ACCESS_OP.OR).toBe('/');
  });

  it('нельзя начать с оператора и нельзя закончить оператором', () => {
    // «+ Замок» — нельзя: оператор в пустую строку не добавляется.
    expect(appendOp([], ACCESS_OP.AND)).toEqual([]);
    expect(canAppendOp([])).toBe(false);
    // «Замок +» — незавершено.
    const trailing = appendOp([C('lock1')], ACCESS_OP.AND);
    expect(trailing).toHaveLength(2);
    expect(isCompleteAccessExpression(trailing)).toBe(false);
    // После оператора нельзя добавить второй оператор подряд.
    expect(canAppendOp(trailing)).toBe(false);
    expect(appendOp(trailing, ACCESS_OP.OR)).toEqual(trailing);
    // «Замок + Терминал» и «Замок / Терминал» — завершены.
    expect(isCompleteAccessExpression([C('lock1'), AND, C('term1')])).toBe(true);
    expect(isCompleteAccessExpression([C('lock1'), OR, C('term1')])).toBe(true);
  });

  it('операнды и операторы строго чередуются', () => {
    let tokens = [];
    expect(canAppendCheck(tokens)).toBe(true);
    tokens = appendCheck(tokens, 'lock1');
    expect(canAppendCheck(tokens)).toBe(false); // подряд две точки нельзя
    expect(appendCheck(tokens, 'term1')).toEqual(tokens);
    tokens = appendOp(tokens, ACCESS_OP.AND);
    expect(canAppendCheck(tokens)).toBe(true);
    tokens = appendCheck(tokens, 'term1');
    expect(isCompleteAccessExpression(tokens)).toBe(true);
    expect(expressionCheckIds(tokens)).toEqual(['lock1', 'term1']);
  });

  it('removeLastToken откатывает по одному шагу', () => {
    const tokens = [C('a'), AND, C('b')];
    expect(removeLastToken(tokens)).toEqual([C('a'), AND]);
    expect(removeLastToken([C('a')])).toEqual([]);
    expect(removeLastToken([])).toEqual([]);
  });

  it('И связывает сильнее ИЛИ: A + B / C = (A И B) ИЛИ C', () => {
    const expr = [C('a'), AND, C('b'), OR, C('c')];
    // Только c пройдено → ИЛИ-ветка срабатывает.
    expect(evaluateAccessExpression(expr, (id) => id === 'c')).toBe(true);
    // Только a пройдено → (a И b) ложно, c ложно → не открыто.
    expect(evaluateAccessExpression(expr, (id) => id === 'a')).toBe(false);
    // a и b пройдены → первая ветка истинна.
    expect(evaluateAccessExpression(expr, (id) => id === 'a' || id === 'b')).toBe(true);
  });

  it('чистое И требует все точки, чистое ИЛИ — любую', () => {
    const andExpr = [C('a'), AND, C('b')];
    expect(evaluateAccessExpression(andExpr, (id) => id === 'a')).toBe(false);
    expect(evaluateAccessExpression(andExpr, () => true)).toBe(true);
    const orExpr = [C('a'), OR, C('b')];
    expect(evaluateAccessExpression(orExpr, (id) => id === 'b')).toBe(true);
    expect(evaluateAccessExpression(orExpr, () => false)).toBe(false);
  });

  it('legacy linkedCheckIds читается как ИЛИ, явное выражение приоритетнее', () => {
    const legacy = resolveAccessExpression({ linkedCheckIds: ['a', 'b'] });
    expect(legacy).toEqual([C('a'), OR, C('b')]);
    const explicit = resolveAccessExpression({
      accessExpression: [C('a'), AND, C('b')],
      linkedCheckIds: ['a', 'b'],
    });
    expect(explicit).toEqual([C('a'), AND, C('b')]);
    expect(resolveAccessExpression({ linkedCheckId: 'solo' })).toEqual([C('solo')]);
  });

  it('форматирование даёт «Замок 1 + Терминал 1»', () => {
    const names = { lock1: 'Замок 1', term1: 'Терминал 1' };
    expect(formatAccessExpression([C('lock1'), AND, C('term1')], (id) => names[id]))
      .toBe('Замок 1 + Терминал 1');
    expect(formatAccessExpression([C('lock1'), OR, C('term1')], (id) => names[id]))
      .toBe('Замок 1 / Терминал 1');
  });
});

describe('538: сервер оценивает И/ИЛИ, а не принудительное ИЛИ', () => {
  const requirement = { accessExpression: [C('lock1'), AND, C('term1')] };
  it('И: одной точки мало, нужны обе', () => {
    const onlyLock = resolveKeyAccess(requirement, { accessEvents: { lock1: true } });
    expect(onlyLock.state).toBe(KEY_ACCESS.NEEDS_CHECK);
    const both = resolveKeyAccess(requirement, {
      accessEvents: { lock1: true },
      terminalStates: { term1: { game: { status: 'won' } } },
    });
    expect(both.state).toBe(KEY_ACCESS.OPEN);
  });
  it('ИЛИ: достаточно любой точки', () => {
    const orReq = { accessExpression: [C('lock1'), OR, C('term1')] };
    const onlyTerm = resolveKeyAccess(orReq, {
      terminalStates: { term1: { game: { status: 'won' } } },
    });
    expect(onlyTerm.state).toBe(KEY_ACCESS.OPEN);
  });
  it('без требования — none, обратная совместимость с legacy ИЛИ', () => {
    expect(resolveKeyAccess({}, {}).state).toBe(KEY_ACCESS.NONE);
    const legacy = resolveKeyAccess({ linkedCheckIds: ['a', 'b'] }, { accessEvents: { b: true } });
    expect(legacy.state).toBe(KEY_ACCESS.OPEN);
  });
});

describe('538: поля локации в доменной модели', () => {
  it('normalizeContainerEntity хранит родителя, выход и флаг «Хаб»', () => {
    const hub = normalizeContainerEntity({
      id: 'h1', kind: CONTAINER_KIND.HUB, name: 'Бункер',
      parentLocationId: 'h0', exitLocationId: 'h2', isCatalogHub: true,
    });
    expect(hub.parentLocationId).toBe('h0');
    expect(hub.exitLocationId).toBe('h2');
    expect(hub.isCatalogHub).toBe(true);
  });
  it('не-локация не получает полей локации', () => {
    const loot = normalizeContainerEntity({ id: 'c1', kind: CONTAINER_KIND.LOOT, name: 'Ящик' });
    expect(loot.parentLocationId).toBe('');
    expect(loot.exitLocationId).toBe('');
    expect(loot.isCatalogHub).toBe(false);
  });
  it('выражение доходит до сущности и выводит linkedCheckIds', () => {
    const lock = normalizeContainerEntity({
      id: 'l1', kind: CONTAINER_KIND.LOCK, name: 'Замок',
      accessExpression: [C('a'), AND, C('b'), OR, C('c')],
    });
    expect(lock.accessExpression).toHaveLength(5);
    expect(lock.linkedCheckIds).toEqual(['a', 'b', 'c']);
    expect(lock.linkedCheckId).toBe('a');
  });
});

describe('538: форма и конструктор в админке', () => {
  const form = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
  const builder = read('components/screens/LootTradeScreen/modals/AccessExpressionBuilder.js');
  it('форма использует конструктор И/ИЛИ и сохраняет выражение', () => {
    expect(form).toContain('<AccessExpressionBuilder');
    expect(form).toContain('accessExpression: canRequireKey ? accessTokens');
    expect(form).toContain('isCompleteAccessExpression(accessTokens)');
  });
  it('конструктор даёт кнопки + и / и блокирует некорректный порядок', () => {
    expect(builder).toContain('testID="access-op-and"');
    expect(builder).toContain('testID="access-op-or"');
    expect(builder).toContain('canAppendOp');
    expect(builder).toContain('canAppendCheck');
    expect(builder).toContain('disabled={!allowOp}');
    expect(builder).toContain('disabled={!allowCheck}');
  });
  it('чекбокс «Хаб» и две строки локации присутствуют', () => {
    expect(form).toContain('testID="container-form-hub-catalog"');
    expect(form).toContain("tLootTrade('form.parentLocationLabel')");
    expect(form).toContain("tLootTrade('form.exitLocationLabel')");
    expect(form).toContain('parentLocationId: isHub ? parentLocationId');
    expect(form).toContain('exitLocationId: isHub ? exitLocationId');
    expect(form).toContain('isCatalogHub: isHub ? isCatalogHub');
  });
});

describe('538: матрёшка локация-в-локацию (дерево переехало внутрь хаба в 539)', () => {
  const tree = read('components/screens/LootTradeScreen/modals/HubTreeView.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
  it('дерево кликабельно и открывает настройки секции', () => {
    expect(tree).toContain('onOpenSettings');
    expect(tree).toContain('testID={`hub-tree-node-${container.id}`}');
    expect(tree).toContain('parentLocationId');
    expect(tree).toContain('exitLocationId');
    expect(screen).toContain('<HubTreeView');
    expect(screen).toContain('setFormModal({ kind: container.kind, initialContainer: container })');
  });
  it('локацию можно вложить в другую локацию, цикл запрещён', () => {
    expect(screen).toContain('wouldCreateParentCycle');
    expect(screen).toContain('parentLocationId: hubId');
    expect(screen).toContain("tLootTrade('form.locationCycle')");
  });
});

describe('538: парные RU/EN строки', () => {
  const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
  const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
  it('новые ключи формы и действий есть в обоих языках', () => {
    const keys = [
      'accessExprLabel', 'accessOpAnd', 'accessOpOr', 'accessExprHint',
      'accessExprIncomplete', 'hubCatalogLabel', 'parentLocationLabel',
      'exitLocationLabel', 'locationNone', 'locationSelfReference',
      'locationCycle', 'locationTreeBlockedBy', 'locationTreeExitTo',
      'locationTreeCatalogBadge',
    ];
    for (const key of keys) {
      expect(ru.form[key], `ru.form.${key}`).toBeTruthy();
      expect(en.form[key], `en.form.${key}`).toBeTruthy();
    }
  });
});
