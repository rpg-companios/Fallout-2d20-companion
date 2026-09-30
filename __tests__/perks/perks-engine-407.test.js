// ПРИЁМОЧНЫЙ (патч 407): «Гулеподобный» конвертирует ЛЮБОЙ подъём радиации
// (включая ручное изменение счётчика) в лечение; «Светящийся пакет крови»
// получил свою записанную механику (+5 Рад.СУ до конца сцены); закреплён
// расклад «механика/текст» по всем 185 перкам каталога.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import useCharacterStore from '../../src/store/characterStore';
import { resolveConsumableVitalChanges, applyConsumableToEffects } from '../../domain/effects';
import drinksData from '../../modules/fallout/data/consumables/drinks.json';
import perksCatalog from '../../modules/fallout/data/perks/perks.json';
import recipesIndex from '../../modules/fallout/data/recipes/index.json';

const state = () => useCharacterStore.getState();
const byId = (list, id) => (Array.isArray(list) ? list : Object.values(list)).find((x) => x.id === id);

beforeEach(() => {
  state().resetCharacterStore();
});

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

const takePerks = (...ids) => {
  // Экшн стора (не setState): он пересчитывает perkBonuses.
  state().setSelectedPerks(ids.map((id, index) => ({ perkId: id, index })));
};

describe('Патч 407: Гулеподобный — любая радиация лечит', () => {
  it('ручной подъём счётчика лечит вместо роста радиации', () => {
    takePerks('ghoulish');
    useCharacterStore.setState({ currentHealth: 5, radiation: 0 });
    state().setRadiation((prev) => prev + 2);
    expect(state().radiation).toBe(0);
    expect(state().currentHealth).toBe(7);
  });

  it('без перка ручной подъём растит счётчик, ОЗ не трогает', () => {
    useCharacterStore.setState({ currentHealth: 5, radiation: 0 });
    state().setRadiation((prev) => prev + 2);
    expect(state().radiation).toBe(2);
    expect(state().currentHealth).toBe(5);
  });

  it('лечит только до максимума ОЗ; спад радиации живёт как обычно', () => {
    takePerks('ghoulish');
    const ceiling = state().derivedStats.maxHealth.total;
    useCharacterStore.setState({ currentHealth: ceiling, radiation: 1 });
    state().setRadiation((prev) => prev + 3); // ОЗ полные — лечить некого
    expect(state().radiation).toBe(1); // счётчик всё равно не растёт
    expect(state().currentHealth).toBe(ceiling);

    useCharacterStore.setState({ currentHealth: 5, radiation: 4 });
    state().setRadiation(1); // спад — обычное поведение
    expect(state().radiation).toBe(1);
    expect(state().currentHealth).toBe(5);
  });

  it('конвейер расходников с перком: двойного лечения нет', () => {
    takePerks('ghoulish');
    const irradiated = {
      id: 'test_meat', itemType: 'food',
      radiationModifier: { op: '+', value: 2 },
    };
    // Как и в конвейере (applyConsumableFull), перк приходит опцией.
    const vital = resolveConsumableVitalChanges(irradiated, {
      currentHealth: 5, maxHealth: 20, radiation: 0, ghoulish: true,
    });
    expect(vital.healAmount).toBe(2);
    expect(vital.radiationAfter).toBe(0);
    // applyConsumableFull зовёт setRadiation(radiationAfter) — повторного
    // лечения быть не должно (счётчик не менялся).
    useCharacterStore.setState({ currentHealth: 5, radiation: 0 });
    state().setRadiation(vital.radiationAfter);
    expect(state().currentHealth).toBe(5);
  });
});

describe('Патч 407: Светящийся пакет крови — +5 Рад.СУ до конца сцены', () => {
  it('в данных появилась записанная механика: лечение 4 + Рад.СУ +5, «до конца сцены»', () => {
    const pack = byId(drinksData, 'drink_glowing_blood_pack');
    expect(pack.hpHealed).toBe(4);
    expect(pack.positiveEffect.damageResistanceModifier).toEqual({
      radiation: { op: '+', value: 5 },
    });
    expect(pack.positiveEffectDuration).toBe('lasting');
  });

  it('конвейер создаёт timed-эффект на 1 сцену с Рад.СУ +5; лечение конвертирует 4 ОЗ', () => {
    const pack = byId(drinksData, 'drink_glowing_blood_pack');
    const vital = resolveConsumableVitalChanges(pack, {
      currentHealth: 5, maxHealth: 20, radiation: 0,
    });
    expect(vital.healAmount).toBe(4);

    const { effects } = applyConsumableToEffects(pack, []);
    // Форма timed-эффекта — плоская: { type, op, value }.
    const drEffect = effects.find((e) => e.damageResistanceModifier?.type === 'radiation');
    expect(drEffect).toBeTruthy();
    expect(drEffect.damageResistanceModifier).toEqual({ type: 'radiation', op: '+', value: 5 });
    expect(drEffect.scenesLeft ?? drEffect.scenes).toBe(1); // «до конца сцены»
  });
});

describe('Патч 407: расклад каталога — механика / текст', () => {
  const ALL = 185;
  const registryDir = resolve(__dirname, '../../domain/perks');
  const registryIds = readdirSync(registryDir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .map((f) => f.replace(/\.js$/, ''));
  const gateIds = new Set();
  for (const entry of recipesIndex.recipes) {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../../modules/fallout/data/recipes', entry.file), 'utf8'));
    for (const recipe of file) {
      for (const perk of recipe.requires?.perks ?? []) gateIds.add(perk.perkId);
    }
  }
  const catalogIds = new Set(perksCatalog.map((p) => p.id));
  const mechanical = new Set([...registryIds, ...gateIds]);

  it('все механические перки существуют в каталоге', () => {
    for (const id of mechanical) {
      expect(catalogIds.has(id), id).toBe(true);
    }
  });

  it('явную механику имеют 43 из 185, остальные 142 — описательные', () => {
    // 37 перков реестра (apply → perkBonuses/механика) + 7 гейтов рецептов
    // − 1 пересечение (ХИМИК работает в обеих ролях).
    expect(registryIds).toHaveLength(37);
    expect(gateIds.size).toBe(7);
    expect(mechanical.size).toBe(43);
    expect(ALL).toBe(perksCatalog.length);
    expect(perksCatalog.length - mechanical.size).toBe(142);
  });
});
