// src/utils/otaUpdates.js
// Обновление JS-бандла через EAS Update (expo-updates).
//
// Слово владельца (2026-10-22): обновления не должны быть молчаливыми.
// Приложение скачивает бандл в фоне, но игрок обязан увидеть, что обновление
// готово, и решить, перезапуститься сейчас или позже. «Позже» ничего не
// теряет: скачанный бандл применяется при следующем холодном старте.
//
// Проверка идёт после загрузки приложения, один раз за сессию, и никогда не
// мешает игре: любая сетевая неудача — только запись в трассу.

import { Platform } from 'react-native';

import { showRawAlert } from '../../components/alerts/alertService';
import { tApp } from '../../i18n/appI18n';
import { debugLog } from '../engine/debug/runtimeTrace';

let checkedThisSession = false;

/** Сбросить флаг сессии (тесты и повторная проверка вручную). */
export const resetOtaUpdateCheck = () => {
  checkedThisSession = false;
};

const loadUpdatesModule = async () => {
  try {
    return await import('expo-updates');
  } catch (error) {
    debugLog('ota.update.moduleUnavailable', { message: error?.message ?? String(error) });
    return null;
  }
};

/**
 * Проверить обновление, скачать его и показать окно «перезапустить?».
 *
 * @returns {Promise<{status: 'skipped'|'unavailable'|'disabled'|'none'|'downloaded'|'error'|'checked'}>}
 */
export const checkForOtaUpdate = async ({
  Updates,
  platform = Platform.OS,
  prompt = true,
} = {}) => {
  if (platform === 'web') return { status: 'skipped' };
  if (checkedThisSession) return { status: 'checked' };
  checkedThisSession = true;

  const updates = Updates ?? await loadUpdatesModule();
  if (!updates) return { status: 'unavailable' };
  if (!updates.isEnabled) return { status: 'disabled' };

  let check;
  try {
    check = await updates.checkForUpdateAsync();
  } catch (error) {
    debugLog('ota.update.check.failed', { message: error?.message ?? String(error) });
    return { status: 'error' };
  }
  if (!check?.isAvailable) return { status: 'none' };

  try {
    await updates.fetchUpdateAsync();
  } catch (error) {
    // Скачивание могло не дойти; следующий запуск проверит снова.
    debugLog('ota.update.fetch.failed', { message: error?.message ?? String(error) });
    return { status: 'error' };
  }

  if (!prompt) return { status: 'downloaded' };

  let choice = null;
  try {
    choice = await showRawAlert({
      title: tApp('otaUpdate.title'),
      message: tApp('otaUpdate.message'),
      kind: 'choice',
      buttons: [
        { text: tApp('otaUpdate.restart') },
        { text: tApp('otaUpdate.later'), style: 'cancel' },
      ],
    });
  } catch (error) {
    debugLog('ota.update.prompt.failed', { message: error?.message ?? String(error) });
  }

  if (choice === 0) {
    try {
      await updates.reloadAsync();
    } catch (error) {
      debugLog('ota.update.reload.failed', { message: error?.message ?? String(error) });
    }
  }

  return { status: 'downloaded' };
};
