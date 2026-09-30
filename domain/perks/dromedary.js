// domain/perks/dromedary.js
// МОХАВСКИЙ ВЕРБЛЮД (406, слово владельца): любой напиток сдвигает
// жажду на 1 ступень лучше обычного; чистая вода (purified) — базово
// +2, с перком +3 («на 3 ступени в лучшую сторону»).

export const dromedaryPerk = {
  id: 'dromedary',
  apply() {
    return { dromedaryExtraWaterStep: 1 };
  },
};
