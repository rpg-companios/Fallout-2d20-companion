// Подстрока разбора для строк инвентаря (патч 264).
//
// Правило владельца (263/264): составной предмет показывает, что из него можно
// вынуть СЕЙЧАС; материалы выше потолка «Мусорщика» из списка скрыты — виден
// только счётчик «+N недоступно». Никаких названий-намёков: игрок знает, что
// перк что-то режет, но не читает чужие таблицы.
//
// Только печатный состав: хлам без состава (желёзы, жало) — общий выход по
// правилам 261, в подстроке он не нуждается. Цвета редкостей — отдельный
// слой UI, здесь их нет намеренно.

import { getItemId } from '../../../domain/itemIdentity';
import { findCatalogEntry, inferItemType } from '../../../domain/resolveItem';
import { getSalvageComposition } from '../../../domain/registry';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../../../i18n/locale';
import { filterCompositionByCeiling, isScrapMaterial, salvagePreview, scrapperCeiling } from './operations';

const nameIndex = () => {
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  const byId = new Map();
  for (const m of [...(catalog.materials ?? []), ...(catalog.junk ?? [])]) {
    if (m?.id) byId.set(m.id, m.name || m.id);
  }
  return byId;
};

/**
 * Что показать под строкой предмета. Возвращает null, если предмет не составной
 * (нет печатного состава) — строка тогда обычная, без подстроки и кнопки.
 * parts — уникальные материалы всех достижимых вариантов (количество только
 * когда оно однозначно: одна альтернатива, фиксированный состав); hidden —
 * сколько строк срезан потолок.
 */
export const salvageSublineForItem = (item, store) => {
  const canonical = item ? getItemId(item) : null;
  if (!canonical) return null;
  if (isScrapMaterial(canonical)) return null; // п.5 владельца: материалы не разбираются
  const printed = getSalvageComposition(canonical);
  if (!printed) return null;
  const ceiling = scrapperCeiling(store);
  const { composition, dropped } = filterCompositionByCeiling(printed, ceiling);
  const options = composition?.options ?? [];
  const names = nameIndex();
  const seen = new Map();
  for (const option of options) {
    for (const row of option) {
      if (!row.material) continue;
      const count = Number.isInteger(row.count) ? row.count : null;
      const known = seen.get(row.material);
      if (!known) seen.set(row.material, { itemId: row.material, count });
      else if (known.count !== count) known.count = null;
    }
  }
  const parts = [...seen.entries()].map(([id, { count }]) => ({
    itemId: id,
    name: names.get(id) ?? id,
    count,
  }));
  return { parts, hidden: dropped, ceiling, salvageable: parts.length > 0 };
};

/**
 * Кнопка «Разобрать» (патч 267, решение владельца): у хлама она есть всегда —
 * разбор хлама без печатного состава идёт общим пулом (261), и отсутствие
 * списка деталей не отменяет саму возможность. Условия работы берёт ЕДИНЫЙ
 * расчёт доступности (salvagePreview): предмет не надет и не в чехле PA,
 * состав не срезан потолком «Мусорщика» целиком, есть из чего брать.
 * Несоблюдено — кнопка остаётся на месте, но затемнена и не срабатывает.
 * Возвращает null, если предмет не хлам и состава не имеет (кнопки нет).
 */
export const salvageButtonForItem = (item, store) => {
  const canonical = item ? getItemId(item) : null;
  if (!canonical || !item?.id) return null;
  if (isScrapMaterial(canonical)) return null; // материал — не хлам ни при каких данных (п.5)
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  const entry = findCatalogEntry(catalog, canonical, inferItemType(item));
  if (!entry) return null; // неизвестный предмет — кнопку не выдумываем
  const isJunk = (entry.itemType ?? inferItemType(item)) === 'junk';
  const printed = getSalvageComposition(canonical);
  if (!isJunk && !printed) return null;
  const subline = salvageSublineForItem(item, store);
  const ceiling = scrapperCeiling(store);
  const gate = salvagePreview(item.id);
  return {
    ...(subline ?? { parts: [], hidden: 0, ceiling }),
    hasComposition: Boolean(printed),
    enabled: gate?.salvageable === true,
  };
};
