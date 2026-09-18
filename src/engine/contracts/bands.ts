// КОНТРАКТ ВЫВОДИМОСТИ — потолки рангов (МК-1, патч 281).
//
// «Bands» — ступени потолка ранга навыка от атрибута (спека тест-сеттинга:
// потолок ранга навыка — от атрибута). Движок по значению параметра-входа
// выбирает потолок; сеттинг задаёт таблицу ступеней.

/** Таблица потолков: отсортированные пороги «значение входа → потолок». */
export interface RankBands {
  /** id производного/параметра-входа ('test.attribute'). */
  from: string;
  /** Ступени по возрастанию: если вход >= threshold, потолок = ceiling. */
  bands: readonly RankBand[];
}

/** Одна ступень: вход достиг threshold → потолок ceiling. */
export interface RankBand {
  threshold: number;
  ceiling: number;
}

/** Потолок для значения входа: последняя ступень, чей порог достигнут. */
export const ceilingFor = (bands: readonly RankBand[], input: number): number => {
  let ceiling = 0;
  for (const band of bands) {
    if (input >= band.threshold) ceiling = band.ceiling;
    else break;
  }
  return ceiling;
};
