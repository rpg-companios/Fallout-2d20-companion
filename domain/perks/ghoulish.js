// domain/perks/ghoulish.js
// Ghoulish (406, слово владельца): повышение радиации вместо вреда
// восстанавливает Текущие ОЗ — на то же количество. В приложении
// радиация приходит с едой/питьём/химией: перк читается в
// resolveConsumableVitalChanges (радиация не растёт, лечение растёт).

export const ghoulishPerk = {
  id: 'ghoulish',
  apply() {
    return { ghoulish: true };
  },
};
