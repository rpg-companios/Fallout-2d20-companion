// domain/perks/juryRiggedAmmo.js
// Ломовые патроны (референс владельца, 403; автоматизация 404):
// у верстака можно создать патроны редкости вплоть до 1 (ранг 1) / 2
// (ранг 2), потратив 5 единиц ХЛАМА вместо материалов и 10 минут работы.
// Атаки такими патронами получают Диапазон осложнений +1 (напоминает
// отчёт о крафте; сама боевая сцена — вне движка приложения).
// Подмена материалов и времени живёт в адаптере крафта
// (modules/fallout/crafting/operations.js): универсальный движок
// получает рецепт уже с подменённой строкой материалов.

// Виртуальный id строки материалов «любой хлам»: движок крафта считает
// id непрозрачными, адаптер раскладывает строку на реальные предметы.
export const JUNK_RIG_ANY_ID = 'item_junk_any';

export const JUNK_RIG_JUNK_COST = 5;
export const JUNK_RIG_MINUTES = 10;

export const juryRigMaxRarityByRank = (rank) => {
  const r = Math.max(1, Number(rank) || 1);
  return r >= 2 ? 2 : 1;
};

export const juryRiggedAmmoPerk = {
  id: 'juryRiggedAmmo',
  apply(ctx) {
    const rank = ctx.state.rank || 1;
    return {
      juryRiggedAmmo: {
        maxRarity: juryRigMaxRarityByRank(rank),
        junkCost: JUNK_RIG_JUNK_COST,
        minutes: JUNK_RIG_MINUTES,
      },
    };
  },
};
