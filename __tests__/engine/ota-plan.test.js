// Параметры `eas update`.
//
// С Expo SDK 55 команда в неинтерактивном режиме без `--environment` падает:
// «The --environment flag must be set when running in --non-interactive mode».
// Именно так первая боевая публикация OTA и остановилась — с этим тестом она
// остановилась бы на ноутбуке, а не на Replit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EAS_ENVIRONMENT,
  buildUpdateArgs,
  profileForChannel,
  profilesForChannel,
  resolveEnvironment,
} from '../../scripts/lib/ota-plan.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const realEas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));

const eas = {
  build: {
    preview: { channel: 'preview', android: { buildType: 'apk' } },
    public: { channel: 'production', android: { buildType: 'apk' } },
    production: { channel: 'production', android: { buildType: 'app-bundle' } },
  },
};

describe('профиль сборки, слушающий канал', () => {
  it('на production смотрят два профиля', () => {
    expect(profilesForChannel(eas, 'production').map((profile) => profile.name))
      .toEqual(['public', 'production']);
  });

  it('выбирается APK, а не AAB: OTA доставляется в APK', () => {
    expect(profileForChannel(eas, 'production').name).toBe('public');
  });

  it('у preview один профиль', () => {
    expect(profileForChannel(eas, 'preview').name).toBe('preview');
  });

  it('неизвестный канал — профиля нет, а не падение', () => {
    expect(profileForChannel(eas, 'staging')).toBeNull();
  });
});

describe('окружение EAS', () => {
  it('без поля environment берётся умолчание EAS — production', () => {
    expect(resolveEnvironment({ easConfig: eas, channel: 'preview' })).toBe('production');
    expect(DEFAULT_EAS_ENVIRONMENT).toBe('production');
  });

  it('поле environment в профиле главнее умолчания', () => {
    const configured = {
      build: { preview: { channel: 'preview', environment: 'preview', android: { buildType: 'apk' } } },
    };
    expect(resolveEnvironment({ easConfig: configured, channel: 'preview' })).toBe('preview');
  });

  it('явный флаг главнее профиля', () => {
    expect(resolveEnvironment({ easConfig: eas, channel: 'production', override: 'development' }))
      .toBe('development');
  });

  it('в этом репозитории окружение определяется, а не остаётся пустым', () => {
    for (const channel of ['preview', 'production']) {
      expect(resolveEnvironment({ easConfig: realEas, channel })).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('аргументы eas update', () => {
  const args = buildUpdateArgs({
    channel: 'preview',
    platform: 'android',
    message: 'проверить сеттинг',
    environment: 'production',
  });

  it('окружение передаётся всегда', () => {
    expect(args).toContain('--environment');
    expect(args[args.indexOf('--environment') + 1]).toBe('production');
  });

  it('канал, платформа и текст на месте', () => {
    expect(args[args.indexOf('--channel') + 1]).toBe('preview');
    expect(args[args.indexOf('--platform') + 1]).toBe('android');
    expect(args[args.indexOf('--message') + 1]).toBe('проверить сеттинг');
  });

  it('режим неинтерактивный: без него публикация ждала бы ввода', () => {
    expect(args).toContain('--non-interactive');
    expect(args).toContain('--json');
  });

  it('каждый флаг встречается один раз', () => {
    const flags = args.filter((arg) => arg.startsWith('--'));
    expect(new Set(flags).size).toBe(flags.length);
  });
});
