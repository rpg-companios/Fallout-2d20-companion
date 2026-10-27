// ПРИЁМОЧНЫЙ (патч 410): «книга приоритетнее» (слово владельца) — ранги и
// требования всех перков сверены с fallout2d20_perks_notepad. Правила:
// 1) maxRanks = книга; 2) если описание книги упоминает ранг ВЫШЕ maxRank
// («в книге по рангам могут быть ошибки») — берём из описания; 3) у трёх
// открывателей модов (Бронник/НАУКА!/Фанат оружия) описания «и т.д.»
// продолжают ряд до 4-го ранга модов — держим 4 (иначе рецепты 4-го ранга
// недостижимы); 4) требования = книга (атрибуты/уровень/шаг), уровневый
// шаг сверён с текстом «требование к уровню увеличивается на N».
// Механика по книге: Фармацевт +2/+3/+4 антирада, Мощный пользователь
// +3/+6/+10 зарядов (по рангам).
import { describe, expect, it } from 'vitest';
import notepad from '../../docs/reference-data/fallout2d20_perks_notepad.json';
import perksMapping from '../../docs/reference-data/perks_mapping.json';
import catalog from '../../modules/fallout/data/perks/perks.json';
import recipesIndex from '../../modules/fallout/data/recipes/index.json';
import { readFileSync } from 'node:fs';
import { perkEffects } from '../../domain/perks/index';
import { resolve } from 'node:path';

const app2my = new Map(
  perksMapping.matched.filter((m) => m && m.myId).map((m) => [m.appId, m.myId]),
);
const byId = (list) => new Map(list.map((p) => [p.id, p]));
const MOD_UNLOCK_TRIO = new Set(['armorer', 'science', 'gunNut']);

const impliedRanks = (desc) => {
  const a = (String(desc).match(/[Нн]а\s+(\d+)[- ]?(?:м ранге|ранге|\s+ранге)/g) || [])
    .map((s) => parseInt(s.replace(/\D+/g, ''), 10));
  const b = (String(desc).match(/(\d+)[-й ]+ранг(?:а)?\s+открывает/g) || [])
    .map((s) => parseInt(s.replace(/\D+/g, ''), 10));
  return Math.max(0, ...a, ...b);
};

describe('Патч 410: ранги — книга (описания старше чисел maxRank)', () => {
  it('у каждого перка maxRanks = max(книга, ранг из описания); мод-тройка держит 4', () => {
    for (const [appId, myId] of app2my) {
      const ref = notepad.perks.find((p) => p.id === myId);
      const ours = catalog.find((p) => p.id === appId);
      expect(ref, appId).toBeTruthy();
      expect(ours, appId).toBeTruthy();
      const expected = Math.max(
        ref.maxRank || 1,
        impliedRanks(ref.description || ''),
        MOD_UNLOCK_TRIO.has(appId) ? 4 : 0,
      );
      expect(ours.maxRanks, appId).toBe(expected);
    }
  });

  it('ключевые случаи книги: Патронщик 3, Мисс Удача шаг 5, Гулеподобный 3, Крепкий хребет 1', () => {
    const c = byId(catalog);
    expect(c.get('ammosmith').maxRanks).toBe(3);
    expect(c.get('ammosmith').prerequisites).toMatchObject({ special: { INT: 7 }, level: 2, levelIncreasePerRank: 4 });
    expect(c.get('missFortune').prerequisites).toMatchObject({ special: { LCK: 6 }, level: 10, levelIncreasePerRank: 5 });
    expect(c.get('ghoulish').maxRanks).toBe(3);
    expect(c.get('ghoulish').prerequisites).toMatchObject({ special: { END: 9 }, level: 7, levelIncreasePerRank: 8 });
    expect(c.get('strongBack').maxRanks).toBe(1);
    // мод-тройка: описания «и т.д.» — ранги до 4-го (рецепты модов живы)
    for (const id of MOD_UNLOCK_TRIO) {
      expect(c.get(id).maxRanks).toBe(4);
    }
  });

  it('ни один рецепт не требует ранг перка выше доступного', () => {
    const c = byId(catalog);
    for (const entry of recipesIndex.recipes) {
      const file = JSON.parse(
        readFileSync(resolve(__dirname, '../../modules/fallout/data/recipes', entry.file), 'utf8'),
      );
      for (const recipe of file) {
        for (const perk of recipe.requires?.perks ?? []) {
          const maxRanks = c.get(perk.perkId)?.maxRanks ?? 1;
          expect(maxRanks, `${recipe.id}: ${perk.perkId} rank ${perk.rank}`).toBeGreaterThanOrEqual(perk.rank || 1);
        }
      }
    }
  });

  it('механика по книге: Фармацевт 2/3/4 антирада, Мощный пользователь 3/6/10 зарядов', () => {
    expect(perkEffects.pharmacist.apply({ state: { rank: 2 } }))
      .toEqual({ antiradRadiationBonus: 3 });
    expect(perkEffects.pharmacist.apply({ state: { rank: 3 } }))
      .toEqual({ antiradRadiationBonus: 4 });
    expect(perkEffects.powerUser.apply({ state: { rank: 2 } }))
      .toEqual({ fusionCoreChargeBonus: 6 });
    expect(perkEffects.powerUser.apply({ state: { rank: 3 } }))
      .toEqual({ fusionCoreChargeBonus: 10 });
  });
});
