// ПРИЁМОЧНЫЙ (патч 411): мигратор перков при загрузке персонажа — публичное
// приложение, «книга приоритетнее» (слово владельца 410). При каждой
// загрузке (персист-кэш и каноническая запись) список перков сверяется
// с каталогом: лишние ранги и перки, не отвечающие книжным требованиям
// (уровень/характеристики/робот/взаимоисключение), снимаются; слоты
// освобождаются. Идемпотентно. Уведомление — игровыми терминами,
// словарь alerts обязан существовать в обоих языках (латентное падение
// tPerkAlert до 411 — чинится здесь же).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import { reconcileSelectedPerksWithCatalog } from '../../domain/perks';
import catalog from '../../modules/fallout/data/perks/perks.json';
import ruScreen from '../../modules/fallout/i18n/ru-RU/screens/perksAndTraits/screen.json';
import enScreen from '../../modules/fallout/i18n/en-EN/screens/perksAndTraits/screen.json';
import ruPerksI18n from '../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import enPerksI18n from '../../modules/fallout/i18n/en-EN/data/perks/perks.json';

const state = () => useCharacterStore.getState();

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const CTX = (over = {}) => ({
  attributes: {
    STR: 5, PER: 5, END: 5, CHA: 5, INT: 5, AGI: 5, LCK: 5,
    ...over,
  },
  level: 12,
  isRobot: false,
  ...over, // level/isRobot поверх значений по умолчанию
});

const ids = (list) => list.map((entry) => entry.id);

describe('Патч 411: чистый мигратор (книга приоритетнее)', () => {
  it('Крепкий хребет ×3 (было 3 ранга) → 1: лишние сняты, слоты свободны', () => {
    const result = reconcileSelectedPerksWithCatalog(
      [{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }],
      catalog,
      CTX({ STR: 8 }),
    );
    expect(result.changed).toBe(true);
    expect(ids(result.selectedPerks)).toEqual(['strongBack']);
    expect(result.removed).toHaveLength(2);
    expect(result.removed[0].reason).toBe('rank-limit');
  });

  it('идемпотентен: второй прогон не меняет ничего', () => {
    const seed = [{ id: 'strongBack' }, { id: 'strongBack' }];
    const first = reconcileSelectedPerksWithCatalog(seed, catalog, CTX({ STR: 8 }));
    const second = reconcileSelectedPerksWithCatalog(first.selectedPerks, catalog, CTX({ STR: 8 }));
    expect(second.changed).toBe(false);
    expect(second.selectedPerks).toEqual(first.selectedPerks);
  });

  it('уровень: «Прицел с подсветкой» теперь с 8-го уровня — на 3-м снимается, на 8-м остаётся', () => {
    const glow = [{ id: 'glowSight' }];
    const early = reconcileSelectedPerksWithCatalog(glow, catalog, CTX({ level: 3, PER: 8 }));
    expect(early.changed).toBe(true);
    expect(early.removed[0]).toMatchObject({ id: 'glowSight', reason: 'level' });
    const grown = reconcileSelectedPerksWithCatalog(glow, catalog, CTX({ level: 8, PER: 8 }));
    expect(grown.changed).toBe(false);
    expect(ids(grown.selectedPerks)).toEqual(['glowSight']);
  });

  it('характеристики: «Тренированный рывок» требует СИЛ 6 — СИЛ 5 снимается, СИЛ 6 остаётся', () => {
    const weak = reconcileSelectedPerksWithCatalog([{ id: 'painTrain' }], catalog, CTX({ STR: 5 }));
    expect(weak.removed[0]).toMatchObject({ id: 'painTrain', reason: 'attributes' });
    const strong = reconcileSelectedPerksWithCatalog([{ id: 'painTrain' }], catalog, CTX({ STR: 6 }));
    expect(strong.changed).toBe(false);
  });

  it('роботу «не для роботов» перки не полагаются', () => {
    const result = reconcileSelectedPerksWithCatalog(
      [{ id: 'ghoulish' }],
      catalog,
      CTX({ END: 9, level: 12, isRobot: true }),
    );
    expect(result.removed[0]).toMatchObject({ id: 'ghoulish', reason: 'robot' });
  });

  it('взаимоисключение: Дерзкий + Осмотрительный — остаётся взятый первым', () => {
    const result = reconcileSelectedPerksWithCatalog(
      [{ id: 'daringNature' }, { id: 'cautiousNature' }],
      catalog,
      CTX({ LCK: 5, PER: 7 }),
    );
    expect(ids(result.selectedPerks)).toEqual(['daringNature']);
    expect(result.removed[0]).toMatchObject({ id: 'cautiousNature', reason: 'excluded' });
  });

  it('неизвестный каталогу id снимается; здоровый список не трогается', () => {
    const withUnknown = reconcileSelectedPerksWithCatalog(
      [{ id: 'lifeGiver' }, { id: 'perk_from_the_past' }],
      catalog,
      CTX(),
    );
    expect(ids(withUnknown.selectedPerks)).toEqual(['lifeGiver']);
    expect(withUnknown.removed[0].reason).toBe('unknown');

    const healthy = reconcileSelectedPerksWithCatalog(
      [{ id: 'lifeGiver' }, { id: 'strongBack' }],
      catalog,
      CTX({ STR: 8 }),
    );
    expect(healthy.changed).toBe(false);
    expect(healthy.selectedPerks).toHaveLength(2);
  });
});

describe('Патч 411: экшн стора — каскад и флаг уведомления', () => {
  it('срезает ранги, пересчитывает бонусы перков, выставляет pendingPerksBookAdjusted', () => {
    // Персонаж, отвечающий книжному требованию Крепкого хребта (СИЛ 5,
    // форма стора: {total}).
    useCharacterStore.setState({
      attributes: {
        STR: { total: 8 }, PER: { total: 5 }, END: { total: 5 },
        CHA: { total: 5 }, INT: { total: 5 }, AGI: { total: 5 }, LCK: { total: 5 },
      },
      level: 12,
    });
    state().setSelectedPerks([{ id: 'strongBack' }, { id: 'strongBack' }, { id: 'strongBack' }]);
    const before = state().perkBonuses.carryWeightBonus;
    const result = state().reconcilePerksAtLoad();
    expect(result.changed).toBe(true);
    expect(ids(state().selectedPerks)).toEqual(['strongBack']);
    // Бонус пересчитался под книжный ранг 1 (был за 3 ранга: 25/ранг).
    expect(state().perkBonuses.carryWeightBonus).toBe(25);
    expect(before).toBe(75);
    expect(state().pendingPerksBookAdjusted).toHaveLength(2);
  });

  it('повторный прогон — changed:false, уведомление пустое (идемпотентность)', () => {
    state().setSelectedPerks([{ id: 'strongBack' }, { id: 'strongBack' }]);
    state().reconcilePerksAtLoad();
    const second = state().reconcilePerksAtLoad();
    expect(second.changed).toBe(false);
    expect(state().pendingPerksBookAdjusted).toEqual([]);
  });
});

describe('Патч 411: словарь уведомлений обязан существовать (оба языка)', () => {
  const KEYS = [
    'duplicatePerksFixedTitle',
    'duplicatePerksFixedMessage',
    'perkMissingIdTitle',
    'perkMissingIdMessage',
    'perksBookAdjustedTitle',
    'perksBookAdjustedMessage',
  ];

  it.each(['ru-RU', 'en-EN'])('%s: alerts со всеми ключами, не пустые строки', (loc) => {
    const dict = loc === 'ru-RU' ? ruScreen : enScreen;
    for (const key of KEYS) {
      expect(typeof dict.alerts?.[key], `${loc}.${key}`).toBe('string');
      expect(dict.alerts[key].length).toBeGreaterThan(0);
    }
  });

  it('русские имена перков для уведомления берутся из i18n (без латиницы)', () => {
    const name = (id) => ruPerksI18n.find((p) => p.id === id)?.name;
    expect(name('strongBack')).toBe('КРЕПКИЙ ХРЕБЕТ');
    expect(name('glowSight')).not.toMatch(/^[A-Za-z ]+$/);
    expect(enPerksI18n.find((p) => p.id === 'strongBack')?.name).toBeTruthy();
  });
});
