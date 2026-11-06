// Приёмочный тест 514: «правим ui карточек и создаём для них поля и
// требования». Проверяем доменные поля, две строки формы, вложенность ключа,
// перетаскивание и живой план. Серверная проверка ключа в этот патч НЕ входит
// (тезис 8 docs/roadmap.md).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTAINER_KIND,
  KEY_REQUIREMENT,
  RESERVED_LOCK_KIND,
  containerCanHoldKey,
  containerCanRequireKey,
  normalizeContainerEntity,
  normalizeKeyItemIds,
  normalizeKeyRequirement,
} from '../../domain/lootTrade.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('514: поля требований', () => {
  it('три режима обязательности и зарезервированный замок', () => {
    expect(KEY_REQUIREMENT.NONE).toBe('none');
    expect(KEY_REQUIREMENT.OPTIONAL).toBe('optional');
    expect(KEY_REQUIREMENT.REQUIRED).toBe('required');
    expect(RESERVED_LOCK_KIND).toBe('lock');
    expect(normalizeKeyRequirement('required')).toBe(KEY_REQUIREMENT.REQUIRED);
    expect(normalizeKeyRequirement(true)).toBe(KEY_REQUIREMENT.REQUIRED);
    expect(normalizeKeyRequirement('optional')).toBe(KEY_REQUIREMENT.OPTIONAL);
    expect(normalizeKeyRequirement('мусор')).toBe(KEY_REQUIREMENT.NONE);
    expect(normalizeKeyItemIds(['a', 'a', '', 'b'])).toEqual(['a', 'b']);
  });

  it('ключ вкладывается в локацию/контейнер/торговца, но не в терминал', () => {
    expect(containerCanHoldKey(CONTAINER_KIND.HUB)).toBe(true);
    expect(containerCanHoldKey(CONTAINER_KIND.LOOT)).toBe(true);
    expect(containerCanHoldKey(CONTAINER_KIND.MERCHANT)).toBe(true);
    expect(containerCanHoldKey(CONTAINER_KIND.TERMINAL)).toBe(false);
    expect(containerCanRequireKey(CONTAINER_KIND.TERMINAL)).toBe(true);
    expect(containerCanRequireKey(RESERVED_LOCK_KIND)).toBe(true);
  });

  it('нормализация сохраняет поля у контейнера и чистит их у терминала', () => {
    const loot = normalizeContainerEntity({
      id: 'c1', kind: CONTAINER_KIND.LOOT, name: 'Сейф',
      keyItemIds: ['k1', 'k1', ''], requiredKeyItemId: 'k1',
      keyRequirement: KEY_REQUIREMENT.OPTIONAL, linkedCheckId: 'term1',
    });
    expect(loot.keyItemIds).toEqual(['k1']);
    expect(loot.requiredKeyItemId).toBe('k1');
    expect(loot.keyRequirement).toBe(KEY_REQUIREMENT.OPTIONAL);
    expect(loot.linkedCheckId).toBe('term1');

    const terminal = normalizeContainerEntity({
      id: 't1', kind: CONTAINER_KIND.TERMINAL, name: 'Терминал',
      keyItemIds: ['k1'], requiredKeyItemId: 'k2',
      keyRequirement: KEY_REQUIREMENT.REQUIRED, linkedCheckId: 'term2',
    });
    expect(terminal.keyItemIds).toEqual([]);
    expect(terminal.requiredKeyItemId).toBe('k2');
    expect(terminal.keyRequirement).toBe(KEY_REQUIREMENT.REQUIRED);
    expect(terminal.linkedCheckId).toBe('term2');
  });
});

describe('514: две строки настройки в форме точки', () => {
  const form = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');

  it('первая строка — поиск и список ключей с чекбоксом «Обязателен» (патч 515)', () => {
    expect(form).toContain('availableKeyItems');
    expect(form).toContain('testID="container-form-key-search"');
    expect(form).toContain('testID="container-form-key-required"');
    expect(form).toContain("accessibilityRole=\"checkbox\"");
    expect(form).toContain('checkbox-marked');
    expect(form).toContain('checkbox-blank-outline');
    expect(form).toContain("tLootTrade('form.keyRequiredLabel')");
    expect(form).not.toContain('container-form-key-optional');
    expect(form).toContain('styles.roomChips');
  });

  it('описание — последнее поле формы (патч 515)', () => {
    expect(form).toContain('testID="container-form-description"');
    const descAt = form.indexOf('container-form-description');
    // Патч 538: конструктор И/ИЛИ вместо строки проверок.
    // Патч 539: подпись стала тернарной (isHub ? locationGateLabel : accessExprLabel).
    const checkAt = form.indexOf("'form.accessExprLabel'");
    const hintAt = form.indexOf('<AccessExpressionBuilder');
    expect(checkAt).toBeGreaterThan(-1);
    expect(descAt).toBeGreaterThan(checkAt);
    expect(descAt).toBeGreaterThan(hintAt);
    expect(form.lastIndexOf('</ScrollView>')).toBeGreaterThan(descAt);
  });

  it('вторая строка — конструктор И/ИЛИ со списком терминалов / замков', () => {
    expect(form).toContain('availableCheckContainers');
    // Патч 538: конструктор выражения с поиском и выбором точек-проверок.
    expect(form).toContain('<AccessExpressionBuilder');
    // Патч 539: подпись тернарная, но ключ accessExprLabel остаётся для не-хабов.
    expect(form).toContain("'form.accessExprLabel'");
    // Патч 517: ворота ссылаются на любую точку, а не только терминал.
    expect(screen).toContain('availableCheckContainers={gateSources}');
  });

  it('поля уезжают в сохранение и показываются на карточке', () => {
    expect(form).toContain('requiredKeyItemId: canRequireKey ? requiredKeyItemId');
    expect(form).toContain('keyRequirement: canRequireKey && requiredKeyItemId');
    // Патч 538: выражение И/ИЛИ — источник истины, linkedCheckIds выводится из него.
    expect(form).toContain('accessExpression: canRequireKey ? accessTokens');
    expect(form).toContain('linkedCheckIds: canRequireKey ? expressionCheckIds(accessTokens)');
    expect(form).toContain("linkedCheckId: canRequireKey ? (expressionCheckIds(accessTokens)[0] || '')");
    expect(screen).toContain('card-requires-key-');
    expect(screen).toContain("'card.keyRequiredBadge'");
  });
});

describe('514: вложенность и перетаскивание', () => {
  const keyForm = read('components/screens/LootTradeScreen/modals/KeyItemFormModal.js');
  const card = read('components/lootTrade/KeyItemCardCell.js');
  const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');

  it('у ключа есть строка «Часть чего» без терминалов', () => {
    expect(keyForm).toContain('availableParents');
    expect(keyForm).toContain('testID="key-item-form-parent-search"');
    expect(keyForm).toContain("tLootTrade('keyItems.attachToLabel')");
    expect(keyForm).toContain('attachedTo');
    expect(screen).toContain('containerCanHoldKey(c.kind)');
  });

  it('у всех четырёх карточек перетаскивание, ключ уходит в локацию', () => {
    expect(card).toContain('arrow-all');
    expect(card).toContain('cardStyles.cardDragHandle');
    // Патч 549: жест вынесен в общий хук, копии больше не расходятся.
    // Прежняя проверка требовала `PanResponder.create` в самой карточке —
    // она запрещала переиспользование и не ловила мёртвые ручки.
    expect(card).toContain('useDragResponder');
    expect(read('src/ui/useDragResponder.js')).toContain('PanResponder.create');
    expect(screen).toContain('const handleMoveKeyItemIntoHub');
    expect(screen).toContain('setMovingKeyItemId');
    expect(screen).toContain('const attachedKeyItemIds');
    // Патч 541: отдельная область ключей в локации убрана; ключи — строки
    // дерева хаба с кнопкой «Параметры».
    expect(screen).toContain('keyItems={keyItems}');
    expect(screen).toContain('onOpenKeySettings=');
  });

  it('пункт выдачи ключа сохранён (исключение совместимости)', () => {
    expect(card).toContain('key-item-issue-');
    expect(screen).toContain('const handleIssueKeyItem');
  });

  it('правило 512 не нарушено: форма ключа берёт каркас соседней формы', () => {
    expect(keyForm).toContain("import { lootTradeFormStyles as styles } from './ContainerFormModal'");
  });
});

describe('514: словари и живой план', () => {
  it('все новые подписи парные RU/EN', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    for (const [section, key] of [
      ['form', 'keyRequirementLabel'],
      ['form', 'keyRequiredLabel'],
      ['form', 'linkedCheckLabel'], ['form', 'linkedCheckHint'],
      ['card', 'requiresKey'], ['card', 'hubKind'],
      ['keyItems', 'attachToLabel'], ['keyItems', 'attachToHint'],
      ['detail', 'hubKeysTitle'], ['detail', 'hubKeyDetach'],
    ]) {
      expect(ru[section][key]).toBeTruthy();
      expect(en[section][key]).toBeTruthy();
    }
  });

  it('roadmap обновлён и перечисляет оставшиеся тезисы', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('515');
    expect(plan).toContain('Осталось после патча');
    expect(plan).toContain('Серверная проверка ключа');
    expect(plan).toContain('Ворота между точками');
    expect(plan).toContain('две панели');
    expect(plan).toContain('нет проверок на стоимость');
    expect(plan).toContain('Мини-игра взлома замков');
    expect(read('docs/agents/README.md')).toContain('docs/roadmap.md');
    expect(read('replit.md')).toContain('docs/roadmap.md');
  });
});
