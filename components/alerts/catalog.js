/**
 * catalog — реестр диалогов приложения.
 *
 * ПРАВИЛО: здесь лежат КЛЮЧИ i18n, а не сами строки. Иначе каталог станет
 * третьей копией переводов и разъедется с i18n/. Тексты остаются в
 * i18n/<locale>/screens/... и в модулях сеттинга.
 *
 * kind:
 *   'info'    — одна кнопка «Ок». Результат: undefined.
 *   'confirm' — две кнопки. Результат: true | false.
 *               По умолчанию «Да» (первой) / «Отмена» — стандарт закреплён
 *               патчем 141, новые confirm получают его автоматически.
 *   'choice'  — произвольный список кнопок. Результат: value | null.
 *               Именно ради этого вида и затевался каталог: window.confirm
 *               на вебе физически не умеет больше двух кнопок.
 *
 * Поля записи:
 *   titleKey / messageKey — пути для t-функции соответствующего экрана.
 *   scope                 — какой словарь использовать (см. AlertHost).
 *   destructive           — подсветить подтверждение как опасное действие.
 *   buttons               — только для 'choice': [{ key, labelKey, value, style }].
 */

// Кнопки по умолчанию для confirm: «Да» первой, затем «Отмена».
export const DEFAULT_CONFIRM_BUTTONS = Object.freeze({
  confirmKey: 'buttons.yes',
  cancelKey: 'buttons.cancel',
});

export const ALERTS = {
  // --- Менеджер персонажей (HomeScreen) -------------------------------------

  characterDelete: {
    scope: 'home',
    kind: 'confirm',
    titleKey: 'title',
    messageKey: 'deleteConfirm',
    destructive: true,
  },
  characterDeleteCloudFailed: {
    scope: 'home',
    kind: 'info',
    titleKey: 'title',
    messageKey: 'deleteCloudFailed',
  },
  folderDelete: {
    scope: 'home',
    kind: 'confirm',
    titleKey: 'folders.deleteTitle',
    messageKey: 'folders.deleteMessage',
    destructive: true,
  },
  importOverwrite: {
    scope: 'home',
    kind: 'confirm',
    titleKey: 'title',
    messageKey: 'upload.overwriteConfirm',
    destructive: true,
  },
  uploadUnexpectedError: {
    scope: 'home',
    kind: 'info',
    titleKey: 'title',
    messageKey: 'upload.errors.unexpected',
  },
  cloudSyncUnsupported: {
    scope: 'home',
    kind: 'info',
    titleKey: 'title',
    messageKey: 'cloudSync.unsupported',
  },
  cloudRemoteIsNewer: {
    scope: 'home',
    kind: 'confirm',
    titleKey: 'title',
    messageKey: 'cloudSync.remoteIsNewer',
  },

  // --- Инвентарь ------------------------------------------------------------

  // Ключевой случай: ТРИ варианта. На вебе раньше схлопывался в
  // window.confirm, где «Отмена» на самом деле означала «на другого».
  applyConsumable: {
    scope: 'inventory',
    kind: 'choice',
    titleKey: 'screen.alerts.applyConsumableTitle',
    messageKey: 'screen.alerts.applyConsumableQuestion',
    buttons: [
      { key: 'self', labelKey: 'screen.actions.self', value: 'self' },
      { key: 'other', labelKey: 'screen.actions.other', value: 'other' },
      { key: 'cancel', labelKey: 'screen.actions.cancel', value: null, style: 'cancel' },
    ],
  },
  robotCannotSelfUse: {
    scope: 'inventory',
    kind: 'info',
    titleKey: 'screen.alerts.robotCannotSelfUseTitle',
    messageKey: 'screen.alerts.robotCannotSelfUseMessage',
  },
  leadBellyReroll: {
    scope: 'inventory',
    kind: 'choice',
    titleKey: 'screen.alerts.leadBellyRerollTitle',
    messageKey: 'screen.alerts.leadBellyRerollMessage',
    buttons: [
      { key: 'reroll', labelKey: 'screen.alerts.leadBellyRerollConfirm', value: 'reroll' },
      { key: 'keep', labelKey: 'screen.alerts.leadBellyRerollKeep', value: 'keep', style: 'cancel' },
    ],
  },
  replaceEquipment: {
    scope: 'inventory',
    kind: 'confirm',
    titleKey: 'screen.alerts.replaceEquipmentTitle',
    messageKey: 'screen.alerts.replaceEquipmentConfirm',
  },

  // --- Лист персонажа -------------------------------------------------------

  characterSaveFailed: {
    scope: 'character',
    kind: 'info',
    titleKey: 'title',
    // Раньше строка была захардкожена прямо в CharacterScreen.js:1225.
    messageKey: 'errors.saveFailed',
  },
  changeOrigin: {
    scope: 'character',
    kind: 'confirm',
    titleKey: 'warnings.changeOriginTitle',
    messageKey: 'warnings.changeOriginConfirm',
    destructive: true,
  },
  equipmentReset: {
    scope: 'character',
    kind: 'confirm',
    titleKey: 'warnings.attentionTitle',
    messageKey: 'warnings.equipmentResetConfirm',
    destructive: true,
  },

  // --- Настройки ------------------------------------------------------------

  // Удаление установленного сеттинга. Заголовок и текст берутся из словаря
  // менеджера (home), а имя пакета приходит подстановкой {name}.
  settingDelete: {
    scope: 'home',
    kind: 'confirm',
    titleKey: 'gameSetting.delete',
    messageKey: null,
    destructive: true,
  },
};
