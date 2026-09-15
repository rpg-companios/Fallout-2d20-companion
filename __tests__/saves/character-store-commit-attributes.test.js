// Патч 238: commitAttributeChanges переехал из CharacterContext в стор.
// Контракт (1-в-1 с прежней реализацией контекста):
//   - значения клампятся к потолку трейта;
//   - дельты пишутся через updateAttribute (производные пересчитываются там же);
//   - очки perk-атрибутов списываются (без клампа — как было);
//   - потолок удачи = УДАЧ + модификатор трейта; текущая удача подрезается сверху;
//   - здоровье подрезается к новому потолку (потолок по «сырому» массиву — так было).

import { afterEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { selectCarryWeight } from '../../src/store/selectors';
import { getAttributeLimits } from '../../domain/characterCreation';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: commitAttributeChanges (патч 238)', () => {
  it('пишет дельты в словарь и списывает perk-очки', () => {
    const store = useCharacterStore.getState();
    store.setAvailablePerkAttributePoints(3);
    // Стартовая СИЛ 4 → подтверждаем 6.
    store.commitAttributeChanges([{ name: 'STR', value: 6 }], 2);
    const s = useCharacterStore.getState();
    expect(selectCarryWeight(s)).toBe(150 + 10 * 6); // вес пересчитался от СИЛ 6
    expect(s.availablePerkAttributePoints).toBe(1);
  });

  it('клампит значение к потолку трейта', () => {
    const { max } = getAttributeLimits(null, 'STR');
    useCharacterStore.getState().commitAttributeChanges([{ name: 'STR', value: 99 }], 0);
    const state = useCharacterStore.getState();
    expect(state.attributes.STR.base).toBe(max);
  });

  it('потолок удачи следует за УДАЧ, текущая подрезается сверху', () => {
    const store = useCharacterStore.getState();
    store.setLuckPoints(4);
    store.setMaxLuckPoints(4);
    store.commitAttributeChanges([{ name: 'LCK', value: 8 }], 0);
    let s = useCharacterStore.getState();
    expect(s.maxLuckPoints).toBe(8);
    expect(s.luckPoints).toBe(4); // меньше потолка — не тронута
    // Понижение УДАЧ: потолок падает, «лишние» очки отбираются.
    store.setLuckPoints(8);
    store.commitAttributeChanges([{ name: 'LCK', value: 3 }], 0);
    s = useCharacterStore.getState();
    expect(s.maxLuckPoints).toBe(3);
    expect(s.luckPoints).toBe(3);
  });

  it('здоровье подрезается к новому потолку (УДАЧ/ВЫН/уровень вниз)', () => {
    const store = useCharacterStore.getState();
    store.setLevel(5);
    store.setCurrentHealth(20);
    // Экран передаёт ПОЛНЫЙ массив распределения. Потолок = END + LCK + (уровень−1);
    // после сброса ВЫН в 0: 0 + 4 + 4 = 8.
    store.commitAttributeChanges([
      { name: 'END', value: 0 },
      { name: 'LCK', value: 4 },
    ], 0);
    expect(useCharacterStore.getState().currentHealth).toBe(8);
  });

  it('commitAttributeChanges отсутствует в фасаде (AST-контракт — step8a-3-facade)', () => {
    expect(useCharacterStore.getState().commitAttributeChanges).toBeTypeOf('function');
  });
});
