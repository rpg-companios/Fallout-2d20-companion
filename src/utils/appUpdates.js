// src/utils/appUpdates.js
// Обновление самого приложения (движка), а не сеттинга.
//
// Слово владельца (2026-10-22): игрок должен узнать о новой сборке из
// приложения и скачать её по постоянной ссылке, а не выискивать в переписке.
//
// Откуда данные: app-release.json в репозитории движка (его пишет
// публикация, docs/publishing.md). Проверка идёт при запуске, но не чаще
// раза в 6 часов, и никогда не мешает игре: ошибка сети — просто тишина.
//
// В APK кнопка ведёт на постоянный адрес APK последнего релиза; в PWA —
// обновляет страницу (бандл уже лежит на сервере, кэш снимает
// forcePwaUpdate). Автопроверка при запуске — только в APK: у веба уже есть
// своё окно «Что нового» по /version.json, два окна про одно и то же мешают.

import { Linking, Platform } from 'react-native';

import { showAlert } from '../../components/alerts/alertService';
import { debugLog } from '../engine/debug/runtimeTrace';
import { ENGINE_VERSION } from '../engine/version';
import useAppUpdateStore from '../store/appUpdateStore';
import { forcePwaUpdate } from './forcePwaUpdate';

let startedForSession = false;

/** Сбросить флаг сессии (тесты и повторный запуск). */
export const resetAppUpdateBootstrap = () => {
  startedForSession = false;
};

/** Открыть ссылку релиза: в APK — браузер, в вебе — обновление страницы. */
export const openAppUpdate = async ({ downloadUrl, pageUrl } = {}) => {
  useAppUpdateStore.getState().clearPlan();
  if (Platform.OS === 'web') {
    await forcePwaUpdate();
    return;
  }
  const url = downloadUrl || pageUrl;
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch (error) {
    debugLog('app.update.open.failed', { url, message: error?.message ?? String(error) });
  }
};

/** «Позже»: версию больше не предлагаем, пока не выйдет следующая. */
export const dismissAppUpdate = () => {
  useAppUpdateStore.getState().dismissUpdate();
};

/**
 * Проверка при запуске: один раз за сессию, после гидратации стора.
 * Возвращает план обновления или статус — вызывающему коду он нужен только
 * для трассы.
 */
export const startAppUpdateBootstrap = async ({
  hydrated = true,
  fetchImpl = fetch,
} = {}) => {
  if (startedForSession) return { status: 'skipped' };
  // В вебе своё окно «Что нового» (components/UpdateNotice/UpdateNoticeModal):
  // /version.json обновляется вместе с деплоем. Второе окно про ту же
  // новую версию только мешало бы, поэтому авто-проверка — для APK.
  if (Platform.OS === 'web') return { status: 'skipped' };
  if (!hydrated || !useAppUpdateStore.getState().hydrated) return { status: 'skipped' };
  startedForSession = true;

  const plan = await useAppUpdateStore.getState().checkForUpdate({ force: false, fetchImpl });
  if (plan.status === 'available') {
    debugLog('app.update.available', { version: plan.version, current: ENGINE_VERSION });
  }
  return plan;
};

/**
 * Ручная проверка из «О приложении»: спрашиваем всегда, даже если версию
 * однажды отложили — пользователь сам попросил показать.
 * Доступное обновление возвращается планом (его покажет окно), «нет
 * обновлений» и «не удалось проверить» — диалогами.
 */
export const runManualAppUpdateCheck = async ({ fetchImpl = fetch } = {}) => {
  const plan = await useAppUpdateStore
    .getState()
    .checkForUpdate({ force: true, includeDismissed: true, fetchImpl });

  if (plan.status === 'available') return plan;
  if (plan.status === 'error') {
    await showAlert('appUpdateCheckFailed');
  } else {
    await showAlert('appUpdateUpToDate', { version: ENGINE_VERSION });
  }
  return plan;
};
