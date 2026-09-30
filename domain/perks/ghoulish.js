// domain/perks/ghoulish.js
// ГУЛЕПОДОБНЫЙ (канонический текст владельца, 408):
// радиация действует как обычно (счётчик растёт, в книге снижает Макс. ОЗ),
// перк добавляет лечение — 1 ОЗ за каждые N единиц ПОЛУЧЕННОЙ радиации:
// ранг 1 — N=4, ранг 2 — N=3, ранг 3+ — N=2.
// Конвертация считается в двух точках (одна норма):
//   resolveConsumableVitalChanges — радиация из еды/питья/химии (видна в
//   отчёте об употреблении);
//   setRadiation — любое ручное изменение счётчика (слово владельца 407:
//   «учитывает всё влияние радиации, в т.ч. ручное изменение»).

export const ghoulishHpPerUnitsByRank = (rank) => {
  const r = Math.max(1, Number(rank) || 1);
  return Math.max(2, 5 - r); // 4 / 3 / 2
};

export const ghoulishPerk = {
  id: 'ghoulish',
  apply(ctx) {
    return { ghoulish: { hpPerUnits: ghoulishHpPerUnitsByRank(ctx.state.rank || 1) } };
  },
};
