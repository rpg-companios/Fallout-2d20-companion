/**
 * Движковый контракт модов предмета (универсальный, сеттинга не знает).
 *
 * Modifier identifiers and list/map conversion are shared engine operations.
 * Active settings provide their catalog IDs, target discovery, record fields,
 * and any additional target semantics through optional capabilities.
 *
 * Единая форма правды: модифицируемый экземпляр несёт СПИСОК id модификаторов.
 *   — в хранилищах и сейвах список id (`modIds`);
 *   — карта «слот → id» (`appliedMods`) — выводимый вид для экрана,
 *     мод сам знает свой слот; пустая карта означает «модов нет».
 *
 * Запись выбора из окна модификации: экран строит ПЛАН (classifyModWritePlan)
 * по месту хранения экземпляра и исполняет его — один путь записи вместо
 * ветвления по месту (правило: одна операция — один владелец).
 */

export type ModId = string;

/** Источник в любом из двух видов: список id или карта «слот → id». */
export type ModSource = {
  modIds?: unknown;
  appliedMods?: unknown;
};

/**
 * Список id модов экземпляра — единственная форма правды.
 *
 * Приоритет безусловный у карты `appliedMods` (её пишет окно модификации,
 * пустой объект означает «модов нет» — снятие мода тоже истина экрана);
 * список `modIds` — форма хранения, чаще служебная. Порядок списка —
 * порядок значений карты (устойчивый, зависит от порядка ключей).
 */
export function modIdList(source: unknown): ModId[] {
  if (!source || typeof source !== 'object') return [];
  const map = (source as ModSource).appliedMods;
  if (map && typeof map === 'object') {
    return Object.values(map as Record<string, unknown>)
      .filter((v): v is ModId => typeof v === 'string' && v.length > 0);
  }
  const list = (source as ModSource).modIds;
  if (Array.isArray(list)) {
    return list.filter((v): v is ModId => typeof v === 'string' && v.length > 0);
  }
  return [];
}

/**
 * Выводимая карта «слот → id» для показа: мод находит свой слот через
 * `resolve`. Мод без слота попадает под собственным id (не теряется).
 */
export function modIdMap<M extends { slot?: string | null; id?: string }>(
  ids: readonly ModId[],
  resolve: (id: ModId) => M | null | undefined,
): Record<string, ModId> {
  const out: Record<string, ModId> = {};
  for (const id of ids) {
    const mod = resolve(id);
    const key = mod?.slot || id;
    out[key] = id;
  }
  return out;
}

/** Common persistence destinations shared by item-modifier screens. */
export type WeaponModWritePlan =
  | { kind: 'storeItem'; itemId: string }
  | { kind: 'equippedWeapon'; uniqueId: string };

/** Neutral identifiers for a stored or equipped item instance. */
export type WeaponCardRef = {
  storeItemId?: string | null;
  uniqueId?: string | null;
};

/**
 * Classify only engine-owned item locations. A setting that has additional
 * target types extends this operation in its own package and passes opaque
 * target IDs to the engine's generic modifier actions.
 */
export function classifyModWritePlan(ref: WeaponCardRef): WeaponModWritePlan | null {
  if (ref.storeItemId) {
    return { kind: 'storeItem', itemId: ref.storeItemId };
  }
  if (ref.uniqueId) {
    return { kind: 'equippedWeapon', uniqueId: ref.uniqueId };
  }
  return null;
}
