// Тестовый релиз движка: отдельный тег, отдельный профиль сборки и никакого
// индекса обновлений.
//
// Смысл: APK для проверки не должен занимать версию, которую потом получит
// публичный релиз, и не должен становиться «Latest» на GitHub — иначе человек,
// который ставит приложение по постоянной ссылке /releases/latest/download/,
// получит тестовую сборку.
import { describe, expect, it } from 'vitest';

import {
  engineReleaseTag,
  engineTestReleaseTag,
  planEngineRelease,
  releaseStamp,
} from '../../scripts/lib/app-release.mjs';

const at = new Date(Date.UTC(2026, 9, 24, 16, 12));

describe('метка времени тестового релиза', () => {
  it('UTC, с ведущими нулями', () => {
    expect(releaseStamp(at)).toBe('20261024-1612');
    expect(releaseStamp(new Date(Date.UTC(2026, 0, 5, 6, 7)))).toBe('20260105-0607');
  });
});

describe('тег тестового релиза', () => {
  it('не совпадает с публичным тегом', () => {
    const test = engineTestReleaseTag('1.0.1', at);
    expect(test).toBe('engine-v1.0.1-test.20261024-1612');
    expect(test).not.toBe(engineReleaseTag('1.0.1'));
  });

  it('два теста одной версии не затирают друг друга', () => {
    const first = engineTestReleaseTag('1.0.1', at);
    const second = engineTestReleaseTag('1.0.1', new Date(at.getTime() + 60_000));
    expect(first).not.toBe(second);
    expect(second.startsWith('engine-v1.0.1-test.')).toBe(true);
  });
});

describe('план релиза движка', () => {
  it('публичный APK: профиль public, индекс обновлений обновляется', () => {
    expect(planEngineRelease({ version: '1.0.1', at })).toEqual({
      tag: 'engine-v1.0.1',
      title: 'Positronium 1.0.1',
      profile: 'public',
      asset: 'positronium.apk',
      writeIndex: true,
    });
  });

  it('тестовый APK: профиль preview, индекс не трогаем', () => {
    const plan = planEngineRelease({ version: '1.0.1', prerelease: true, at });
    expect(plan.profile).toBe('preview');
    expect(plan.tag).toBe('engine-v1.0.1-test.20261024-1612');
    expect(plan.title).toBe('Positronium 1.0.1 (тест)');
    expect(plan.writeIndex).toBe(false);
  });

  it('AAB: профиль production и никакого индекса', () => {
    const plan = planEngineRelease({ version: '1.0.1', aab: true });
    expect(plan).toMatchObject({
      tag: 'engine-v1.0.1',
      profile: 'production',
      asset: 'positronium.aab',
      writeIndex: false,
    });
  });
});
