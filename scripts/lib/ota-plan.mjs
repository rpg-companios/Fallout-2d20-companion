// Параметры команды `eas update` — то, что раньше было разбросано по
// scripts/ota-push.mjs и ломалось молча.
//
// Почему отдельный файл: с Expo SDK 55 `eas update` требует `--environment` в
// неинтерактивном режиме, иначе EAS отвечает «The --environment flag must be
// set when running in --non-interactive mode» и ничего не публикует. Такое
// лучше ловить тестом, а не на телефоне.
//
// Окружение EAS — это набор серверных переменных (`eas env:list`), из которых
// собирается бандл. Оно должно совпадать с окружением сборки, иначе значения
// `EXPO_PUBLIC_*` в OTA разойдутся с тем, что было в APK. Поэтому берём его из
// профиля eas.json, которым собирается APK этого канала (сборка без явного
// `environment` использует `production` — это умолчание EAS).

/** Умолчание EAS для профиля сборки без поля `environment`. */
export const DEFAULT_EAS_ENVIRONMENT = 'production';

/** Профили eas.json, слушающие канал. */
export const profilesForChannel = (easConfig, channel) => Object.entries(easConfig?.build ?? {})
  .filter(([, profile]) => profile?.channel === channel)
  .map(([name, profile]) => ({ name, ...profile }));

/**
 * Профиль, которым собирается APK этого канала.
 *
 * На канал production смотрят два профиля: `public` (APK для людей) и
 * `production` (AAB). OTA доставляется в APK, поэтому APK-профиль важнее.
 */
export const profileForChannel = (easConfig, channel) => {
  const candidates = profilesForChannel(easConfig, channel);
  return candidates.find((profile) => profile.android?.buildType === 'apk')
    ?? candidates[0]
    ?? null;
};

/** Окружение EAS для публикации в канал: из профиля сборки, иначе production. */
export const resolveEnvironment = ({ easConfig, channel, override } = {}) => {
  if (override) return String(override);
  const profile = profileForChannel(easConfig, channel);
  return String(profile?.environment ?? DEFAULT_EAS_ENVIRONMENT);
};

/**
 * Аргументы `npx eas-cli …` для отправки обновления.
 * `--environment` идёт всегда: без него SDK 55+ отказывается публиковать.
 */
export const buildUpdateArgs = ({ channel, platform, message, environment }) => [
  'update',
  '--channel', channel,
  '--environment', environment,
  '--platform', platform,
  '--message', message,
  '--non-interactive',
  '--json',
];
