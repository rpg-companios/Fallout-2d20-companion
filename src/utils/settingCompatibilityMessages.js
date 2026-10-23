// Перевести отказ по контракту в текст для человека.
//
// Смысл жёсткой привязки: несовместимый пакет объясняет причину, а не роняет
// приложение. Коды приходят из `settingCompatibility.js`, тексты — из i18n
// (`gameSetting.incompatible.*`), чтобы сообщение можно было править без кода.
import { tHomeScreen } from '../../components/screens/HomeScreen/logic/homeScreenI18n';
import { SETTING_COMPATIBILITY_CODES } from '../engine/settings/settingCompatibility';
import { SETTING_SCREEN_CODES } from '../engine/settings/settingScreens';

const withParams = (template, params = {}) => String(template).replace(
  /\{(\w+)\}/g,
  (match, key) => (
    params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ),
);

const list = (values) => (Array.isArray(values) ? values.join(', ') : String(values ?? ''));

/**
 * @returns {{ title: string, message: string } | null}
 *   null — ошибка не про контракт (показывать надо как раньше).
 */
const describeScreenProblem = (problem) => {
  const params = problem.params ?? {};
  switch (problem.code) {
    case SETTING_SCREEN_CODES.NO_SCREENS:
      return withParams(tHomeScreen('gameSetting.screen.noScreens'), params);
    case SETTING_SCREEN_CODES.SCREEN_SLOTS_UNAVAILABLE:
      // Не «пакет сломан», а «этой сборке нужен патч движка» — с числами.
      return withParams(tHomeScreen('gameSetting.screen.slotsUnavailable'), params);
    case SETTING_SCREEN_CODES.INVALID_SCREEN:
      return withParams(tHomeScreen('gameSetting.screen.invalidScreen'), params);
    case SETTING_SCREEN_CODES.DUPLICATE_SCREEN:
      return withParams(tHomeScreen('gameSetting.screen.duplicateScreen'), params);
    default:
      return null;
  }
};

export const describeSettingCompatibilityError = (error) => {
  if (!error || typeof error !== 'object') return null;
  const problems = Array.isArray(error.problems) && error.problems.length > 0
    ? error.problems
    : (error.code ? [{ code: error.code, params: error.params ?? {} }] : []);
  if (problems.length === 0) return null;

  // Три разных разговора с человеком: «пакет не подходит к движку», «пакет
  // собран неверно» и «движку нужен патч под этот пакет».
  const screenCodes = Object.values(SETTING_SCREEN_CODES);
  const isScreenProblem = problems.some((problem) => screenCodes.includes(problem.code));
  const needsNewerEngine = problems.some(
    (problem) => problem.code === SETTING_SCREEN_CODES.SCREEN_SLOTS_UNAVAILABLE,
  );
  const titleKey = needsNewerEngine
    ? 'gameSetting.screenSlotsTitle'
    : (isScreenProblem ? 'gameSetting.screenTitle' : 'gameSetting.incompatibleTitle');
  const title = String(tHomeScreen(titleKey));
  const lines = problems.map((problem) => {
    switch (problem.code) {
      case SETTING_COMPATIBILITY_CODES.ENGINE_TOO_OLD:
        return withParams(tHomeScreen('gameSetting.incompatible.engineTooOld'), problem.params);
      case SETTING_COMPATIBILITY_CODES.ENGINE_TOO_NEW:
        return withParams(tHomeScreen('gameSetting.incompatible.engineTooNew'), problem.params);
      case SETTING_COMPATIBILITY_CODES.UNSUPPORTED_RUNTIME_API:
        return withParams(tHomeScreen('gameSetting.incompatible.runtimeApi'), problem.params);
      case SETTING_COMPATIBILITY_CODES.UNKNOWN_CAPABILITIES:
        return withParams(tHomeScreen('gameSetting.incompatible.unknownCapabilities'), {
          capabilities: list(problem.params?.capabilities),
        });
      case SETTING_COMPATIBILITY_CODES.MISSING_HOST_MODULES:
        return withParams(tHomeScreen('gameSetting.incompatible.missingHostModules'), {
          modules: list(problem.params?.modules),
        });
      case SETTING_COMPATIBILITY_CODES.INVALID_COMPATIBILITY:
        return withParams(tHomeScreen('gameSetting.incompatible.invalidRange'), {
          fields: list(problem.params?.fields),
        });
      case SETTING_COMPATIBILITY_CODES.MISSING_SERVICES:
        return withParams(tHomeScreen('gameSetting.incompatible.missingServices'), {
          services: list(problem.params?.services),
        });
      default:
        return describeScreenProblem(problem) ?? String(problem.code ?? '');
    }
  }).filter(Boolean);

  return { title, message: lines.join('\n\n') };
};

/** Текст для перехвата ошибки установки/активации. */
export const settingErrorAlertMessage = (error, fallbackKey) => {
  const described = describeSettingCompatibilityError(error);
  if (described) return described.message;
  return String(error?.message ?? '') || String(tHomeScreen(fallbackKey));
};

/**
 * Заголовок и текст для алерта: у отказа по контракту свой заголовок
 * («Пакет не подходит к этой версии приложения»), у прочих ошибок — прежний.
 *
 * @param {unknown} error
 * @param {{ titleKey: string, messageKey: string }} fallback
 */
export const settingErrorAlert = (error, { titleKey, messageKey }) => {
  const described = describeSettingCompatibilityError(error);
  if (described) return { title: described.title, message: described.message };
  return {
    title: String(tHomeScreen(titleKey)),
    message: String(error?.message ?? '') || String(tHomeScreen(messageKey)),
  };
};
