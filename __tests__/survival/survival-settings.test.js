// Этап 5, патч 210 — настройки выживания (док §10):
//   - раздел «Выживание» в настройках объединяет прочность оружия (патроны)
//     и шкалы голода/жажды/сна (решение владельца 2026-09-07);
//   - survivalModeEnabled — выкл по умолчанию: шкалы скрыты, трекинг
//     заморожен, состояние в сейве сохраняется;
//   - survivalTimeCourseMinutes — курс времени, свободный ввод, дефолт 30,
//     согласован с SURVIVAL_RULES.defaultCourseMinutesPerHour.

import { describe, expect, it } from 'vitest';
import settingsFile from '../../modules/fallout/settings.json';
import ruSettings from '../../modules/fallout/i18n/ru-RU/data/system/settings.json';
import enSettings from '../../modules/fallout/i18n/en-EN/data/system/settings.json';
import {
  advanceRealMinutes,
  createSurvivalState,
  SURVIVAL_RULES,
} from '../../modules/fallout/survival/survival';

const byId = (id) => settingsFile.find((setting) => setting.id === id);

describe('survival settings: данные раздела «Выживание»', () => {
  it('survivalModeEnabled: boolean, выкл по умолчанию, раздел survival', () => {
    const setting = byId('survivalModeEnabled');
    expect(setting).toBeTruthy();
    expect(setting.type).toBe('boolean');
    expect(setting.defaultValue).toBe(false);
    expect(setting.sectionKey).toBe('survival');
    expect(setting.controlSurface).toBe('settings');
  });

  it('survivalTimeCourseMinutes: number, дефолт 30, свободный ввод, зависит от включения', () => {
    const setting = byId('survivalTimeCourseMinutes');
    expect(setting).toBeTruthy();
    expect(setting.type).toBe('number');
    expect(setting.defaultValue).toBe(30);
    expect(setting.min).toBe(1);
    expect(setting.freeInput).toBe(true);
    expect(setting.dependsOn).toBe('survivalModeEnabled');
  });

  it('прочность оружия переехала в раздел «Выживание» без смены id и дефолтов', () => {
    for (const id of [
      'weaponDurabilityLossEnabled',
      'weaponDurabilityLossPer10Shots',
      'randomWeaponQualityEnabled',
    ]) {
      const setting = byId(id);
      expect(setting).toBeTruthy();
      expect(setting.sectionKey).toBe('survival');
    }
    expect(byId('weaponDurabilityLossEnabled').defaultValue).toBe(false);
    expect(byId('weaponDurabilityLossPer10Shots').defaultValue).toBe(1);
    expect(byId('randomWeaponQualityEnabled').defaultValue).toBe(false);
  });

  it('старый раздел survivalMode больше никем не используется', () => {
    expect(settingsFile.some((setting) => setting.sectionKey === 'survivalMode')).toBe(false);
  });

  it('дефолт курса совпадает с константой домена', () => {
    expect(byId('survivalTimeCourseMinutes').defaultValue)
      .toBe(SURVIVAL_RULES.defaultCourseMinutesPerHour);
  });

  it('i18n раздела и подписей полный в обеих локалях', () => {
    for (const dict of [ruSettings, enSettings]) {
      expect(typeof dict.survival).toBe('string');
      expect(typeof dict.survivalSystemTitle).toBe('string');
      expect(typeof dict.survivalSystemDescription).toBe('string');
      expect(typeof dict.survivalTimeCourseTitle).toBe('string');
      expect(typeof dict.survivalTimeCourseDescription).toBe('string');
    }
  });
});

describe('survival settings: курс времени в домене', () => {
  it('курс 60: 30 реальных минут = половина игрового часа (дробь копится)', () => {
    const s = advanceRealMinutes(createSurvivalState('human'), 30, 60).state;
    expect(s.timeCarried).toBeCloseTo(0.5, 5);
    expect(s.acc.food).toBe(0); // полный час не накопился — тика не было
  });

  it('курс 60: две порции по 30 минут = ровно один игровой час', () => {
    let s = createSurvivalState('human');
    s = advanceRealMinutes(s, 30, 60).state;
    const result = advanceRealMinutes(s, 30, 60);
    expect(result.state.timeCarried).toBeCloseTo(0, 5);
    // Один часовой тик: еда шагает 5 → 4 (шаг накапливается с нуля).
    expect(result.state.food).toBe(4);
    expect(result.state.acc.food).toBe(0);
    expect(result.hpLost).toBe(0); // усталости нет — дрена нет
  });

  it('курс по умолчанию — 30 (параметр не передан)', () => {
    const s = advanceRealMinutes(createSurvivalState('human'), 30).state;
    expect(s.food).toBe(4);
  });

  it('курс 30 и усталость: часовой тик дренит ОЗ (⌊N/2⌋)', () => {
    let s = createSurvivalState('human');
    s.fatigue = [{ source: 'sleep', amount: 3 }];
    const result = advanceRealMinutes(s, 30, 30);
    expect(result.hpLost).toBe(1);
  });
});
