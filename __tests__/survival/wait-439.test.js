// ПРИЁМОЧНЫЙ (патч 439): слово владельца — «Правим механизм работы кнопки
// "Сон", она теперь называется "Сон\Ждать". В модалке сна добаляется пункт
// "Ожидание". Он работает почти, как сон. Только тратятся все 3 параметра
// выжмвания: Голод, Жажда, Сон. И не восполняются при "Ожидании". Если при
// режиме ожидание текущие ОЗ станут меньше 0, то показать алерт "Персонаж
// умер"». Ожидание = время идёт (мост эффектов как у сна), но лестница сна
// НЕ заморожена (тратятся все три), ничего не восполняется (лестница сна,
// снятие усталости сна, бонус, отдых в постели — мимо), усталость ест
// текущие ОЗ как в обычном часовом тике.
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';

setCurrentLocale('ru-RU');
setCurrentModuleLocale('ru-RU');
import {
  addFatigue,
  createSurvivalState,
  forecastWait,
  SURVIVAL_RULES,
  wait,
} from '../../modules/fallout/survival/survival';
import { waitSurvival } from '../../modules/fallout/survival/operations';
import { tWeaponsAndArmorScreen } from '../../modules/fallout/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n';

const modalCode = () => readFileSync('modules/fallout/screens/WeaponsAndArmorScreen/modals/SleepModal.tsx', 'utf8');

describe('Патч 439: домен — ожидание тратит все три параметра и ничего не даёт', () => {
  it('лестница сна НЕ заморожена: Сон тратится (у сна — тратится, у ожидания — нет)', () => {
    const state = createSurvivalState('human');
    expect(state.sleep).toBe(5);
    // Порог спуска сна — 8 ч на секцию: за 24 ч ожидания сон спустится.
    const { events, state: after } = wait(state, { hours: 24 });
    const sleepSteps = events.filter((e) => e.type === 'step' && e.ladder === 'sleep').length;
    expect(sleepSteps).toBe(3); // 5→4→3→2
    expect(after.sleep).toBe(2);
    expect(after.acc.sleep).toBeGreaterThanOrEqual(0);
  });

  it('ничего не восполняется: нет sleepResult, нет снятия усталости сна, нет бонуса', () => {
    const state = createSurvivalState('human');
    addFatigue(state, 'sleep', 3);
    const { events, state: after } = wait(state, { hours: 24 });
    expect(events.some((e) => e.type === 'sleepResult')).toBe(false);
    expect(events.some((e) => e.type === 'fatigueSleepCleared')).toBe(false);
    expect(after.hpBonus).toBe(0);
    // Усталость сна осталась при ожидании (сон не лечит).
    expect(after.fatigue.some((f) => f.source === 'sleep')).toBe(true);
    // Отдых в постели ожидание не копит.
    expect(after.bedRestHours).toBe(0);
  });

  it('усталость ест текущие ОЗ: ⌊N/2⌋ за каждый час ожидания', () => {
    const state = createSurvivalState('human');
    state.food = 1; // дно: усталость не снимается
    addFatigue(state, 'food', 4);
    const { hpLoss } = wait(state, { hours: 3 });
    expect(hpLoss).toBe(2 * 3); // ⌊4/2⌋ = 2 за час × 3 часа
  });

  it('прогноз чистый: входное состояние не меняется', () => {
    const state = createSurvivalState('human');
    const before = JSON.stringify(state);
    forecastWait(state, { hours: 5 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('часы: 1..24, дробные и ноль — ошибка', () => {
    expect(() => wait(createSurvivalState('human'), { hours: 0 })).toThrow();
    expect(() => wait(createSurvivalState('human'), { hours: 2.5 })).toThrow();
    expect(() => wait(createSurvivalState('human'), { hours: SURVIVAL_RULES.maxSleepHours + 1 })).toThrow();
    expect(() => wait(createSurvivalState('human'), { hours: 1 })).not.toThrow();
  });
});

describe('Патч 439: операция waitSurvival — гейты, ОЗ, алерт смерти', () => {
  beforeEach(() => {
    useAppSettingsStore.getState().setValue('survivalModeEnabled', true);
  });

  it('выключенное выживание — отказ; нет шкал (робот) — отказ', () => {
    useAppSettingsStore.getState().setValue('survivalModeEnabled', false);
    useCharacterStore.getState().setStateExtension('survival', createSurvivalState('human'));
    expect(waitSurvival({ hours: 2 }).ok).toBe(false);

    useAppSettingsStore.getState().setValue('survivalModeEnabled', true);
    useCharacterStore.getState().setStateExtension('survival', null);
    expect(waitSurvival({ hours: 2 }).ok).toBe(false);
  });

  it('ОЗ теряются по усталости; стали меньше 0 — died:true, стор держит 0', () => {
    const state = createSurvivalState('human');
    state.food = 1;
    addFatigue(state, 'food', 4); // ⌊4/2⌋ = 2 ОЗ за час
    useCharacterStore.setState({ currentHealth: 3 });
    useCharacterStore.getState().setStateExtension('survival', state);
    const result = waitSurvival({ hours: 2 }); // 3 − 4 = −1 → умер
    expect(result.ok).toBe(true);
    expect(result.hpLoss).toBe(4);
    expect(result.died).toBe(true);
    expect(useCharacterStore.getState().currentHealth).toBe(0);
  });

  it('без смерти: ОЗ хватило — died:false, потеря применена', () => {
    const state = createSurvivalState('human');
    state.food = 1;
    addFatigue(state, 'food', 4);
    useCharacterStore.setState({ currentHealth: 20 });
    useCharacterStore.getState().setStateExtension('survival', state);
    const result = waitSurvival({ hours: 2 });
    expect(result.died).toBe(false);
    expect(result.hpLoss).toBe(4);
    expect(useCharacterStore.getState().currentHealth).toBe(16);
  });
});

describe('Патч 439: модалка и кнопка «Сон\Ждать»', () => {
  it('кнопка переименована: «Сон\Ждать» тем же резолвером, что весь экран', () => {
    expect(tWeaponsAndArmorScreen('survival.actions.sleep')).toBe('Сон\\Ждать');
    expect(tWeaponsAndArmorScreen('survival.mode.wait')).toBe('Ожидание');
    expect(tWeaponsAndArmorScreen('survival.wait.deathTitle')).toBe('Персонаж умер');
    expect(tWeaponsAndArmorScreen('survival.wait.confirm')).toBe('Ждать');
  });

  it('в модалке пункт «Ожидание»: режим, сброс при открытии, прогноз и ветка подтверждения', () => {
    const code = modalCode();
    // режим-переключатель
    expect(code).toContain("useState<'sleep' | 'wait'>('sleep')");
    expect(code).toContain("t('survival.mode.sleep')");
    expect(code).toContain("t('survival.mode.wait')");
    expect(code).toContain('if (visible) setMode(\'sleep\')');
    // место сна и заметка пустоши — только в режиме сна
    expect(code).toContain("{mode === 'sleep' && (");
    expect(code).toContain("mode === 'sleep' && place === 'wasteland'");
    // прогноз и подтверждение ожидания
    expect(code).toContain('forecastWait(state, { hours })');
    expect(code).toContain('buildWaitForecastLines');
    expect(code).toContain('waitSurvival({ hours })');
    expect(code).toContain("t('survival.wait.deathTitle')");
    expect(code).toContain("t('survival.wait.confirm')");
    // прогноз смерти: текущие ОЗ минус потеря < 0
    expect(code).toContain('hpBefore - forecast.hpLoss < 0');
  });

  it('словарь EN зеркалит новые ключи', () => {
    const en = JSON.parse(readFileSync('modules/fallout/i18n/en-EN/screens/weaponsAndArmor/screen.json', 'utf8'));
    expect(en.survival.actions.sleep).toBe('Sleep\\Wait');
    expect(en.survival.mode.wait).toBe('Wait');
    expect(en.survival.wait.deathTitle).toBe('Character died');
  });
});
