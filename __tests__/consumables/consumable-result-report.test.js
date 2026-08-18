import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyConsumableToEffects,
  applyRemoveConditions,
  resolveConsumableVitalChanges,
} from '../../domain/effects';
import { setCurrentLocale } from '../../i18n/locale';
import { buildConsumableResultReport } from '../../components/screens/InventoryScreen/logic/consumableResultReport';

describe('consolidated consumable result report', () => {
  beforeEach(() => {
    setCurrentLocale('ru-RU');
  });

  it('exposes timed-effect messages with an explicit outcome kind', () => {
    const result = applyConsumableToEffects({
      name: 'Препарат',
      positiveEffectLabel: 'Бонус',
      positiveEffectDuration: 'instant',
      negativeEffect: 'Тошнота',
      negativeEffectDuration: 'instant',
    });

    expect(result.notificationEvents).toHaveLength(2);
    expect(result.notificationEvents.map((event) => event.kind)).toEqual(['positive', 'negative']);
    expect(result.notificationEvents.map((event) => event.message)).toEqual(result.events);
  });

  it.each([
    ['лечение', { positiveEffect: { hpModifier: { op: '+', value: 5 } } }],
    ['радиация', { positiveEffect: {}, radiationModifier: { op: '-', value: 4 } }],
    ['снятие состояния', { positiveEffect: { removeCondition: ['diseased'] } }],
  ])('does not duplicate a structured %s result with an instant label', (_name, mechanics) => {
    const result = applyConsumableToEffects({
      name: 'Препарат',
      positiveEffectLabel: 'Описание структурированного результата',
      positiveEffectDuration: 'instant',
      ...mechanics,
    });

    expect(result.notificationEvents).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it('keeps unrelated instant negative events when suppressing a positive duplicate', () => {
    const result = applyConsumableToEffects({
      name: 'Препарат',
      positiveEffect: { hpModifier: { op: '+', value: 5 } },
      positiveEffectLabel: 'Восстанавливает 5 HP',
      positiveEffectDuration: 'instant',
      negativeEffect: 'Тошнота',
      negativeEffectDuration: 'instant',
    });

    expect(result.notificationEvents).toEqual([
      { kind: 'negative', message: result.events[0] },
    ]);
    expect(result.events[0]).toContain('Тошнота');
  });

  it('reports Antiradin reduction once and uses the actual counter change', () => {
    const antiradin = {
      name: 'Антирадин',
      positiveEffect: {},
      positiveEffectLabel: 'Убирает 4 радиации',
      positiveEffectDuration: 'instant',
      radiationModifier: { op: '-', value: 4 },
    };
    const vitalResult = resolveConsumableVitalChanges(antiradin, {
      currentHealth: 8,
      maxHealth: 10,
      radiation: 4,
    });
    const timedResult = applyConsumableToEffects(antiradin);
    const report = buildConsumableResultReport({
      itemName: antiradin.name,
      timedResult,
      ...vitalResult,
    });

    expect(report.positive).toEqual(['Уровень радиации снижен на 4.']);
    expect(report.message).not.toContain('Применено');
    expect(report.message).not.toContain('Моментальный положительный эффект');
    expect(report.message).not.toContain('Убирает 4 радиации');
  });

  it.each([
    ['нулевой радиации', { radiation: 0 }],
    ['иммунитете к радиации', { radiation: 7, radiationImmune: true }],
  ])('reports only a short application confirmation at %s', (_case, radiationState) => {
    const antiradin = {
      name: 'Антирадин',
      positiveEffect: {},
      positiveEffectLabel: 'Убирает 4 радиации',
      positiveEffectDuration: 'instant',
      radiationModifier: { op: '-', value: 4 },
    };
    const vitalResult = resolveConsumableVitalChanges(antiradin, {
      currentHealth: 8,
      maxHealth: 10,
      ...radiationState,
    });
    const report = buildConsumableResultReport({
      itemName: antiradin.name,
      timedResult: applyConsumableToEffects(antiradin),
      ...vitalResult,
    });

    expect(report.positive).toEqual(['Применено: Антирадин.']);
    expect(report.message).not.toContain('на вас');
  });

  it('combines positive and negative outcomes without roll details', () => {
    const report = buildConsumableResultReport({
      itemName: 'Сырая еда',
      healAmount: 3,
      radiationAmount: 2,
      timedResult: {
        notificationEvents: [
          { kind: 'positive', message: 'Положительный эффект.' },
          { kind: 'negative', message: 'Отрицательный эффект.' },
        ],
      },
      diseaseRiskResult: {
        status: 'checked',
        check: { passed: false, difficulty: 3, rolls: [7, 20], successes: 1 },
        disease: { name: 'Лихорадка' },
        diseaseRoll: 12,
        infectionStatus: 'infected',
      },
      addictionResult: {
        addicted: true,
        faces: [5, 6],
        effectCount: 2,
        addictionLevel: 2,
      },
    });

    expect(report.title).toBe('Результат применения');
    expect(report.positive).toEqual([
      'Восстановлено 3 единиц здоровья.',
      'Положительный эффект.',
    ]);
    expect(report.negative).toEqual([
      'Уровень радиации повышен на 2.',
      'Отрицательный эффект.',
      'Проверка заражения провалена. Заражение: Лихорадка.',
      'Вы стали зависимы от этого препарата.',
    ]);
    expect(report.message).toContain('Положительный результат');
    expect(report.message).toContain('Отрицательный результат');
    expect(report.message).not.toContain('Сложность');
    expect(report.message).not.toContain('7, 20');
    expect(report.message).not.toContain('d20');
  });

  it('reports antibiotics generically in the same positive section', () => {
    const removal = applyRemoveConditions({
      positiveEffect: { removeCondition: ['diseased'] },
    }, ['diseased']);
    const report = buildConsumableResultReport({
      itemName: 'Антибиотики',
      conditionsRemoved: removal.removed,
      conditionRemovalsRequested: removal.requested,
    });

    expect(report.positive).toEqual(['Все болезни вылечены.']);
    expect(report.negative).toEqual([]);
    expect(report.message).not.toContain('Отрицательный результат');
  });

  it('truthfully reports when antibiotics had no active disease to remove', () => {
    const removal = applyRemoveConditions({
      positiveEffect: { removeCondition: ['diseased'] },
    }, []);
    const report = buildConsumableResultReport({
      itemName: 'Антибиотики',
      conditionsRemoved: removal.removed,
      conditionRemovalsRequested: removal.requested,
    });

    expect(report.positive).toContain('Активных болезней нет.');
  });

  it.each([
    ['duplicate', 'Проверка заражения провалена. Болезнь «Лихорадка» уже активна.'],
    ['immune', 'Проверка заражения провалена. Иммунитет предотвратил заражение болезнью «Лихорадка».'],
  ])('keeps a failed %s disease check in the negative section', (infectionStatus, expected) => {
    const report = buildConsumableResultReport({
      itemName: 'Грязная вода',
      diseaseRiskResult: {
        status: 'checked',
        check: { passed: false },
        disease: { name: 'Лихорадка' },
        infectionStatus,
      },
    });

    expect(report.positive).toEqual([]);
    expect(report.negative).toEqual([expected]);
    expect(report.message).not.toContain('Применено');
    expect(report.message).not.toContain('Положительный результат');
  });

  it('puts avoided risks and radiation reduction in the positive section', () => {
    const report = buildConsumableResultReport({
      itemName: 'Препарат',
      radiationAmount: -4,
      diseaseRiskResult: { status: 'checked', check: { passed: true } },
      addictionResult: { addicted: false },
    });

    expect(report.positive).toEqual([
      'Уровень радиации снижен на 4.',
      'Проверка заражения пройдена.',
      'Зависимость не наступила.',
    ]);
    expect(report.negative).toEqual([]);
  });

  it('uses a short application confirmation when there are no factual results', () => {
    const report = buildConsumableResultReport({ itemName: 'Стимулятор' });

    expect(report.positive).toEqual(['Применено: Стимулятор.']);
    expect(report.negative).toEqual([]);
    expect(report.message).not.toContain('на вас');
    expect(report.message).not.toContain('на другого персонажа');
  });

  it('uses the engine locale for report structure', () => {
    setCurrentLocale('en-EN');
    const report = buildConsumableResultReport({
      itemName: 'Antibiotics',
      conditionRemovalsRequested: ['diseased'],
      conditionsRemoved: ['diseased'],
    });

    expect(report.title).toBe('Use result');
    expect(report.message).toContain('Positive result');
    expect(report.message).toContain('All diseases cured.');
  });

  it('keeps the successful self-use path to one final alert after target selection', () => {
    const source = readFileSync('components/screens/InventoryScreen/InventoryScreen.js', 'utf8');
    const selfPath = source.slice(
      source.indexOf('const applyToSelf = () => {'),
      source.indexOf('const applyToOther = () => {'),
    );

    // One alert is the early robot restriction; the normal path emits only the
    // consolidated report. The target selector is outside this callback.
    expect(selfPath.match(/showAlert\(/g)).toHaveLength(2);
    expect(selfPath).toContain('buildConsumableResultReport');
    expect(selfPath).not.toContain('diseaseCheckMessage');
    expect(selfPath).not.toContain('addictionRollMessage');
  });
});
