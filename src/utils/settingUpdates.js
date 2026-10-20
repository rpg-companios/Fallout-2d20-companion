// Проверка обновлений сеттинга при запуске приложения.
//
// Слово владельца (2026-10-20): «Сеттинг смотрит в свой репозиторий и при
// запуске проверяет релиз». Для официального сеттинга включён autoInstall —
// новая версия ставится сама, без вопроса; для остальных (коммьюнити)
// по умолчанию спрашиваем подтверждение, потому что код пакета исполняется
// в общем JS-контексте приложения, а не в песочнице.
//
// Провал проверки/установки не ломает запуск: игра продолжает работать на
// установленной версии, событие уходит в трассу.

import releaseSourcesConfig from '../../settings/release-sources.json';
import { showAlert } from '../../components/alerts/alertService';
import { debugLog } from '../engine/debug/runtimeTrace';
import useSettingUpdateStore from '../store/settingUpdateStore';

let startedForSession = false;

/** Сбросить флаг сессии (тесты и повторный запуск после смены сеттинга). */
export const resetSettingUpdateBootstrap = () => {
  startedForSession = false;
};

const sourceFor = (settingId) => releaseSourcesConfig?.settings?.[settingId] ?? null;

/**
 * Проверить обновления и, если они есть, установить их.
 *
 * @param {object} options
 * @param {boolean} options.force        игнорировать интервал «не чаще 6 часов»
 * @param {boolean} options.prompt       спрашивать перед установкой (для autoInstall=false)
 * @param {boolean} options.notify       показывать итог установки
 * @param {Function} options.fetchImpl   подмена fetch в тестах
 * @returns {Promise<Array<{settingId: string, version: (number|string), installed: boolean}>>}
 */
export const runSettingUpdateCheck = async ({
  force = false,
  prompt = true,
  notify = true,
  fetchImpl = fetch,
} = {}) => {
  const updateStore = useSettingUpdateStore.getState();
  let plans = [];
  try {
    plans = await updateStore.checkForUpdates({ force, fetchImpl });
  } catch (error) {
    debugLog('setting.update.check.failed', { message: error?.message ?? String(error) });
    return [];
  }

  const results = [];
  for (const plan of plans) {
    const source = sourceFor(plan.settingId);
    if (!source) continue;

    // Первую установку подтверждаем всегда: приложение не несёт сеттинг
    // внутри, и качать десятки мегабайт без спроса нельзя. autoInstall
    // относится к обновлениям уже установленного сеттинга.
    let approved = true;
    if (prompt && (!source.autoInstall || !plan.installed)) {
      approved = await showAlert('settingUpdateAvailable', {
        name: plan.settingId,
        from: plan.fromVersion ?? '—',
        to: plan.toVersion,
      });
    }
    if (!approved) {
      useSettingUpdateStore.getState().dismissUpdate(plan.settingId);
      results.push({ settingId: plan.settingId, version: plan.toVersion, installed: false });
      continue;
    }

    try {
      await useSettingUpdateStore.getState().installUpdate(plan.settingId, { fetchImpl });
      if (notify) {
        await showAlert('settingUpdated', { name: plan.settingId, version: plan.toVersion });
      }
      results.push({ settingId: plan.settingId, version: plan.toVersion, installed: true });
    } catch (error) {
      debugLog('setting.update.install.failed', {
        settingId: plan.settingId,
        message: error?.message ?? String(error),
      });
      if (notify) {
        await showAlert('settingUpdateFailed', { name: plan.settingId });
      }
      results.push({ settingId: plan.settingId, version: plan.toVersion, installed: false });
    }
  }
  return results;
};

/**
 * Запуск проверки на старте: один раз за сессию, после гидратации стора
 * сеттингов. Вызывается из App.js, когда база и персонажи готовы.
 */
export const startSettingUpdateBootstrap = async ({
  hydrated = true,
  fetchImpl = fetch,
} = {}) => {
  if (startedForSession) return [];
  if (!hydrated || !useSettingUpdateStore.getState().hydrated) return [];
  startedForSession = true;
  return runSettingUpdateCheck({ force: false, prompt: true, notify: true, fetchImpl });
};
