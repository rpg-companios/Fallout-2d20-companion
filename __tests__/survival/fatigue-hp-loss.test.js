// Патч 232 (решение владельца, по книге): усталость — потеря ТЕКУЩИХ ОЗ
// «на начале сцены» (⌊N/2⌋, без сопротивлений). Сцены в приложении не
// тикают (advanceScene — спящий код), поэтому потеря привязана к игровому
// часу тика выживания: SurvivalClock суммирует события hpMaxPenalty за тик
// (fatigueHpLossFromEvents) и применяет через applySurvivalHpLoss контекста
// (до 0 включительно). Часы сна потерь не дают: rest() события не применяет.
//
// История: патч 213 снижал МАКСИМУМ ОЗ («по книге») — цитата владельца от
// 2026-09-11 опровергла: книга отнимает текущие ОЗ на начале сцены.

import { describe, expect, it } from 'vitest';
import {
  createSurvivalState,
  addFatigue,
  advanceHours,
  fatigueHpLossFromEvents,
  hpMaxPenaltyForFatigue,
} from '../../modules/fallout/survival/survival';

describe('усталость → потеря текущих ОЗ (патч 232)', () => {
  it('величина потери: ⌊N/2⌋', () => {
    expect(hpMaxPenaltyForFatigue(0)).toBe(0);
    expect(hpMaxPenaltyForFatigue(1)).toBe(0);
    expect(hpMaxPenaltyForFatigue(2)).toBe(1);
    expect(hpMaxPenaltyForFatigue(5)).toBe(2);
  });

  it('часовой тик с усталостью 3 даёт событие потери 1 ОЗ', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'food', 3);
    const { events } = advanceHours(s, 1);
    const loss = fatigueHpLossFromEvents(events);
    expect(loss).toBe(1);
  });

  it('без усталости потерь нет', () => {
    const { events } = advanceHours(createSurvivalState('human'), 2);
    expect(fatigueHpLossFromEvents(events)).toBe(0);
  });

  it('за N часов — по потере на каждый час (усталость не снята)', () => {
    // Усталость 4 на дне еды: слив заморожен (еда 1 < 2), потери каждый час.
    const s = createSurvivalState('human');
    s.food = 1;
    addFatigue(s, 'food', 4);
    const { events } = advanceHours(s, 3);
    expect(fatigueHpLossFromEvents(events)).toBe(2 * 3); // ⌊4/2⌋ = 2 за час × 3
  });

  it('после снятия усталости потери прекращаются', () => {
    const s = createSurvivalState('human');
    addFatigue(s, 'sleep', 1);
    // Все лестницы в норме → усталость снимется в первый же час, потерь не будет.
    const { events } = advanceHours(s, 2);
    expect(fatigueHpLossFromEvents(events)).toBe(0);
  });
});
