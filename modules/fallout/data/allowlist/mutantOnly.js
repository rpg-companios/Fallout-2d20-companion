// modules/fallout/data/allowlist/mutantOnly.js
// Частный случай: что может носить мутант (RAIDER_ONLY / MUTANT)
// Просто список id и/или категорий.

export const mutantOnly = Object.freeze({
  // Пока пусто, броня помечается mutantOnly в данных
  // Добавить что-то — просто ключ: true
});

export const MUTANT_ONLY_STRUCTURED = Object.freeze({
  itemTypes: Object.freeze([]),
  prefixes: Object.freeze([]),
  ids: Object.freeze([]),
});
