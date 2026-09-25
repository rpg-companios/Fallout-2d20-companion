// ПРИЁМОЧНЫЙ (патч 357): отчёт о крафте в модалке установки модов — тот же,
// что в окне крафта. Слово владельца: «не хватает отчёта о крафте… Materials
// списались, кнопка потускнела и всё. И в этой ситуации не понятно, что
// произошло и из-за чего?!» — теперь любой исход (провал проверки со сгоревшими
// материалами, успех, осложнения) показывается отчётом buildCraftReport:
// арифметика проверки, кубики и исход, судьба материалов, время.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { craftRecipe, settleCraftTime } from '../../modules/fallout/crafting/operations';
import { buildCraftReport } from '../../modules/fallout/crafting/windowModel';

const state = () => useCharacterStore.getState();
const seed = (id, quantity = 1) => {
  useCharacterStore.setState((prev) => ({
    items: { ...prev.items, [`s_${Math.random().toString(36).slice(2, 8)}`]: { weaponId: id, quantity } },
  }));
};

// mod_001: сложность 3, Gun Nut 1, REPAIR, обычный ×4 + необычный ×2.
const singleReport = ({ skill, rolls, zeroDifficulty }) => {
  const run = craftRecipe('mod_rapid', { rollD20: () => rolls.shift() ?? 1 }, {
    deferTime: true,
    ...(zeroDifficulty ? { zeroDifficulty } : {}),
  });
  return { run, report: buildCraftReport('mod_rapid', { attempts: [run], stoppedEarly: 0 }) };
};

beforeEach(() => {
  state().resetCharacterStore();
  useAppSettingsStore.getState().setValue('craftFailLossGear', true);
  useCharacterStore.setState({ selectedPerks: [{ perkId: 'gunNut', index: 0 }] });
  useCharacterStore.setState((prev) => ({
    skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 2, total: 2 } },
  }));
});

afterEach(async () => {
  useAppSettingsStore.getState().setValue('craftFailLossGear', false);
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('ПРИЁМОЧНЫЙ (патч 357): отчёт о крафте в модалке установки модов', () => {
  it('провал проверки со сгоревшими материалами объясняется отчётом', () => {
    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    // сложность 3 − навык 2 = 1; две двадцатки = автопровал + осложнения
    const { run, report } = singleReport({ skill: 2, rolls: [20, 20] });
    expect(run.done).toBe(false);
    expect(run.stage).toBe('check');

    const text = report.lines.join('\n');
    expect(text).toContain('= '); // строка арифметики проверки (цель)
    expect(text).toContain('Rolled 20, 20. Failed'); // кубики и исход
    expect(text).toContain('Materials burned'); // судьба материалов — ГЛАВНОЕ
    expect(text).toContain('Spent:'); // что именно списано
    expect(report.pendingTime).toBeTruthy();
    expect(report.pendingTime.hasSuccess).toBe(false);
  });

  it('успех: кубики, что получено; время ждёт решения про 2 ОД', () => {
    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    // сложность снята навыком (REPAIR 6 ≥ 3) — добровольный бросок, криты
    useCharacterStore.setState((prev) => ({
      skills: { ...prev.skills, REPAIR: { ...(prev.skills?.REPAIR ?? {}), base: 6, total: 6 } },
    }));
    const { run, report } = singleReport({ skill: 6, rolls: [1, 1], zeroDifficulty: 'roll' });
    expect(run.done).toBe(true);

    const text = report.lines.join('\n');
    expect(text).toContain('Rolled 1, 1. Successes 4'); // 1 = крит, 2 успеха за кубик
    expect(text).toContain('Gained:'); // что положено в сумку
    expect(report.pendingTime?.hasSuccess).toBe(true);

    // как в модалке: «да» на 2 ОД — время успеха вдвое (60 → 30 минут)
    const settled = settleCraftTime('mod_rapid', run, { spendActionPoints: true });
    expect(settled.minutes).toBe(30);
  });

  it('провал без успеха: 2 ОД не спрашиваются — полное время сразу', () => {
    seed('item_common_materials', 4);
    seed('item_uncommon_materials', 2);
    const { run, report } = singleReport({ skill: 2, rolls: [20, 20] });
    expect(report.pendingTime.hasSuccess).toBe(false);
    const settled = settleCraftTime('mod_rapid', run, { spendActionPoints: false });
    expect(settled.minutes).toBe(120); // базовый час + 2 × 30 за осложнения
  });

  it('оба окна используют один компонент отчёта; отказы до проверки — прежние Alert', () => {
    const modal = readFileSync('modules/fallout/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js', 'utf8');
    const windowSrc = readFileSync('modules/fallout/screens/InventoryScreen/modals/CraftingModal.js', 'utf8');
    const shared = readFileSync('modules/fallout/crafting/CraftReportView.js', 'utf8');

    expect(modal).toContain('CraftReportView');
    expect(modal).toContain('buildCraftReport');
    expect(modal).toContain('reportOverlay');
    expect(windowSrc).toContain('CraftReportView');
    expect(shared).toContain('apQuestion'); // вопрос про 2 ОД в общем виде
    expect(shared).toContain('doneBtn');

    // 352: отказ ДО проверки (перк/материалы) — короткий Alert, как был
    expect(modal).toContain('createFailMissingPerk');
    expect(modal).toContain('createFailMaterials');
    // провал ПРОВЕРКИ больше не молчаливый Alert — идёт в отчёт с кубиками
    expect(modal).not.toContain('createFailCheck');
  });
});
