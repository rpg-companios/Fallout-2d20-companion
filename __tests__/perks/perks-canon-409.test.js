// ПРИЁМОЧНЫЙ (патч 409): контрольная сверка каталога перков с референсом
// владельца (fallout2d20_perks_notepad). Русские имена и тексты — дословно
// из perks_catalog_ru (канон владельца, совпадает с notepad по существу);
// три перка (Полевой хирург, Фармацевт, Мощный пользователь) несут тексты
// по одобренному слову владельца — книжный текст противоречит работающей
// механике (см. отчёт сверки). Кровосос: пакет крови поднимает Жажду на
// ступень (книга; +1 к ступеням напитка).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import catalogRu from '../../docs/reference-data/perks_catalog_ru.json';
import ruCatalog from '../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import notepad from '../../docs/reference-data/fallout2d20_perks_notepad.json';
import perksMapping from '../../docs/reference-data/perks_mapping.json';
import { createSurvivalState, consumeDrink } from '../../modules/fallout/survival/survival';

const state = () => useCharacterStore.getState();
const overrides = new Set(['fieldSurgeon', 'pharmacist', 'powerUser']);

describe('Патч 409: канон текстов — каталог владельца', () => {
  it('все 185 перков: имя и текст дословно из catalog_ru (кроме трёх по слову владельца)', () => {
    expect(ruCatalog).toHaveLength(catalogRu.length);
    const canon = new Map(catalogRu.map((p) => [p.id, p]));
    for (const entry of ruCatalog) {
      const c = canon.get(entry.id);
      expect(c, entry.id).toBeTruthy();
      expect(entry.name, `${entry.id}.name`).toBe(c.name);
      if (overrides.has(entry.id)) {
        expect(entry.effect.length, entry.id).toBeGreaterThan(0);
        expect(entry.effect, entry.id).not.toBe(c.effect); // не книжный текст
      } else {
        expect(entry.effect, `${entry.id}.effect`).toBe(c.effect);
      }
      if (c.rankEffects) {
        expect(entry.rankEffects, `${entry.id}.rankEffects`).toEqual(c.rankEffects);
      }
    }
  });

  it('кроет notepad: каждый перк референса найден в приложении (emt — наш эксклюзив)', () => {
    const app2my = new Map(
      perksMapping.matched.filter((m) => m && m.myId).map((m) => [m.myId, m.appId]),
    );
    const appIds = new Set(ruCatalog.map((p) => p.id));
    for (const ref of notepad.perks) {
      expect(appIds.has(app2my.get(ref.id)), ref.id).toBe(true);
    }
    // 185-й — EMT, существует только в приложении (слово владельца, 403).
    expect(appIds.has('emt')).toBe(true);
    expect(notepad.perks.some((p) => p.id === 'emt')).toBe(false);
  });
});

describe('Патч 409: Кровосос — пакет крови поднимает Жажду на ступень', () => {
  beforeEach(() => {
    useAppSettingsStore.getState().setValue('survivalModeEnabled', true);
    state().setStateExtension('survival', (() => {
      const s = createSurvivalState('human');
      s.water = 1; // «обезвожен» — ступени видно
      return s;
    })());
  });

  it('с перком пакет крови даёт +2 ступени (напиток +1 и книга +1)', () => {
    state().setSelectedPerks([{ perkId: 'bloodsucker', index: 0 }]);
    const pack = { id: 'drink_blood_pack', itemType: 'drinks' };
    expect(consumeDrink(state().stateExtensions.survival, pack, { extraWaterSteps: 1 }).gained.water).toBe(2);
  });

  it('без перка пакет крови — обычный напиток (+1 ступень)', () => {
    const pack = { id: 'drink_blood_pack', itemType: 'drinks' };
    expect(consumeDrink(state().stateExtensions.survival, pack).gained.water).toBe(1);
  });
});
