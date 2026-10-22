// Правила проверки обновлений движка: разбор app-release.json и решение
// «предлагать ли версию». Сеть и UI здесь не участвуют — только данные.
import { describe, expect, it } from 'vitest';

import {
  APP_RELEASES_PAGE_URL,
  APP_RELEASE_URL,
  APK_ASSET_NAME,
  appApkUrl,
  appReleasesPageUrl,
  parseAppRelease,
  planAppUpdate,
} from '../../src/engine/updates/appRelease';

const validIndex = {
  schemaVersion: 1,
  version: '1.1.0',
  tag: 'engine-v1.1.0',
  repository: 'rpg-companios/ttrpg-engine',
  asset: 'positronium.apk',
  bytes: 20_000_000,
  sha256: 'a'.repeat(64),
  notes: { 'ru-RU': ['Исправлено сохранение'], 'en-EN': ['Fixed saving'] },
};

describe('app-release.json: разбор', () => {
  it('полный индекс разбирается без потерь', () => {
    expect(parseAppRelease(validIndex)).toEqual(validIndex);
  });

  it('префикс v в версии снимается', () => {
    expect(parseAppRelease({ ...validIndex, version: 'v2.0.0' }).version).toBe('2.0.0');
  });

  it('без schemaVersion индекс считается первой схемой', () => {
    const { schemaVersion, ...rest } = validIndex;
    expect(parseAppRelease(rest).schemaVersion).toBe(1);
  });

  it('пустые строки заметок выбрасываются, кривые — тоже', () => {
    const parsed = parseAppRelease({
      ...validIndex,
      notes: { 'ru-RU': ['  ', 'Пункт'], 'en-EN': 'нет', 'de-DE': [] },
    });
    expect(parsed.notes).toEqual({ 'ru-RU': ['Пункт'] });
  });

  it('мусор вместо индекса → null', () => {
    expect(parseAppRelease(null)).toBeNull();
    expect(parseAppRelease('1.0.0')).toBeNull();
    expect(parseAppRelease({ ...validIndex, version: 'latest' })).toBeNull();
    expect(parseAppRelease({ ...validIndex, version: '' })).toBeNull();
  });

  it('подозрительный репозиторий или путь в имени ассета → null', () => {
    expect(parseAppRelease({ ...validIndex, repository: 'not a repo' })).toBeNull();
    expect(parseAppRelease({ ...validIndex, asset: '../positronium.apk' })).toBeNull();
  });

  it('негодный sha256 и размер не ломают индекс, а просто не заполняются', () => {
    const parsed = parseAppRelease({ ...validIndex, sha256: 'xyz', bytes: -5 });
    expect(parsed.sha256).toBeNull();
    expect(parsed.bytes).toBeNull();
  });
});

describe('постоянные ссылки релиза', () => {
  it('адрес индекса — raw.githubusercontent без токена', () => {
    expect(APP_RELEASE_URL).toBe(
      'https://raw.githubusercontent.com/rpg-companios/ttrpg-engine/main/app-release.json',
    );
  });

  it('APK качается по latest/download с постоянным именем файла', () => {
    expect(APK_ASSET_NAME).toBe('positronium.apk');
    expect(appApkUrl({ asset: 'positronium.apk' })).toBe(
      'https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk',
    );
    // Имя ассета из индекса уважается: переименование в релизе не ломает ссылку.
    expect(appApkUrl({ repository: 'someone/fork', asset: 'app.apk' })).toBe(
      'https://github.com/someone/fork/releases/latest/download/app.apk',
    );
  });

  it('страница релизов собирается из репозитория', () => {
    expect(appReleasesPageUrl()).toBe(APP_RELEASES_PAGE_URL);
    expect(APP_RELEASES_PAGE_URL).toBe('https://github.com/rpg-companios/ttrpg-engine/releases');
  });
});

describe('план обновления', () => {
  const latest = parseAppRelease(validIndex);

  it('версия новее установленной → доступно обновление с ссылками', () => {
    const plan = planAppUpdate({ latest, currentVersion: '1.0.0' });
    expect(plan).toMatchObject({
      status: 'available',
      version: '1.1.0',
      downloadUrl: 'https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk',
    });
    expect(plan.notes['ru-RU']).toEqual(['Исправлено сохранение']);
  });

  it('та же версия и старее → «у вас последняя»', () => {
    expect(planAppUpdate({ latest, currentVersion: '1.1.0' }).status).toBe('current');
    expect(planAppUpdate({ latest, currentVersion: '1.2.0' }).status).toBe('current');
  });

  it('«Позже» скрывает ровно эту версию', () => {
    expect(planAppUpdate({ latest, currentVersion: '1.0.0', dismissedVersion: '1.1.0' }).status)
      .toBe('dismissed');
    expect(planAppUpdate({ latest, currentVersion: '1.0.0', dismissedVersion: '1.0.5' }).status)
      .toBe('available');
  });

  it('несравнимая версия и отсутствие индекса → тишина', () => {
    expect(planAppUpdate({ latest: null, currentVersion: '1.0.0' }).status).toBe('none');
    expect(planAppUpdate({ latest: { ...latest, version: 'beta' }, currentVersion: '1.0.0' }).status)
      .toBe('none');
  });
});
