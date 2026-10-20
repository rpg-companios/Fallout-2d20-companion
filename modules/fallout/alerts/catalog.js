/** Fallout-owned alert descriptors consumed through the generic alert service. */
export const FALLOUT_ALERTS = Object.freeze({
  leadBellyReroll: Object.freeze({
    scope: 'inventory',
    kind: 'choice',
    titleKey: 'screen.alerts.leadBellyRerollTitle',
    messageKey: 'screen.alerts.leadBellyRerollMessage',
    buttons: Object.freeze([
      Object.freeze({ key: 'reroll', labelKey: 'screen.alerts.leadBellyRerollConfirm', value: 'reroll' }),
      Object.freeze({ key: 'keep', labelKey: 'screen.alerts.leadBellyRerollKeep', value: 'keep', style: 'cancel' }),
    ]),
  }),
});
