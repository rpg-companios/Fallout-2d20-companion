/**
 * Движковый контракт модов предмета (универсальный, сеттинга не знает).
 *
 * Решение владельца (2026-09-22): модификация предметов — свойство многих
 * игр, поэтому форма правды и классификация места записи живут в движке;
 * сеттинг (Fallout) подставляет только каталог модов и хранилища.
 *
 * Единая форма правды: ЭКЗЕМПЛЯР оружия несёт СПИСОК id модов.
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

/** Роль экземпляра оружия внутри слота робота (форма слота — дело сеттинга). */
export type RobotWeaponRole = 'held' | 'installed' | 'ownAttack';

/**
 * Стабильный ключ-носитель для закона 343/344 на робо-оружии: оружие в слоте
 * робота — НЕ предмет сумки (комплект кладёт его внутрь конечности), поэтому
 * мод-экземпляр привязывается к паре «слот + id оружия». Ключ одинаков в
 * каждой сессии — снятие мода и замена конечности находят его снова (359).
 */
export function robotWeaponHostKey(slotKey: string, weaponId: string | null): string {
  return `robotSlot:${slotKey}:${weaponId ?? 'unknown'}`;
}

/** План записи выбора модов: куда и какой экземпляр меняется. */
export type WeaponModWritePlan =
  | { kind: 'storeItem'; itemId: string }
  | { kind: 'equippedWeapon'; uniqueId: string }
  | { kind: 'robotSlot'; slotKey: string; role: RobotWeaponRole; weaponId: string | null };

/** Карточка оружия на экране: поля, по которым строится план. */
export type WeaponCardRef = {
  /** Слот робота, показавший карточку (если карточка из слотов робота). */
  sourceSlot?: string | null;
  /** Роль внутри слота: ладонь / установленное / собственная атака. */
  attackRole?: RobotWeaponRole | null;
  /** Наследие старых карточек: встроенное (установленное или собственное). */
  isBuiltin?: boolean | null;
  /** Предмет инвентаря (id записи хранилища), если карточка из инвентаря. */
  storeItemId?: string | null;
  /** Ключ экземпляра в списке надетого оружия человека. */
  uniqueId?: string | null;
  /** id оружия (база из каталога). */
  id?: string | null;
  weaponId?: string | null;
};

/** Контекст, которого нет на карточке: чем занят слот робота. */
export type ModWriteContext = {
  /** В слоте робота есть оружие в ладони (ветка ладони законна). */
  slotHasHeldWeapon?: boolean;
};

/**
 * План записи выбора модов. Роль внутри слота берётся из `attackRole`;
 * у старых карточек без роли она выводится: встроенное — установленное,
 * иначе (если слот занят ладонью) — ладонь. Инвентарь и надетое оружие
 * человека различаются по наличию id записи хранилища.
 */
export function classifyModWritePlan(
  ref: WeaponCardRef,
  context: ModWriteContext = {},
): WeaponModWritePlan | null {
  const weaponId = ref.weaponId ?? ref.id ?? null;

  if (ref.sourceSlot) {
    let role = ref.attackRole ?? null;
    if (!role) {
      role = ref.isBuiltin ? 'installed' : (context.slotHasHeldWeapon ? 'held' : null);
    }
    if (role) {
      return { kind: 'robotSlot', slotKey: ref.sourceSlot, role, weaponId };
    }
  }

  if (ref.storeItemId) {
    return { kind: 'storeItem', itemId: ref.storeItemId };
  }
  if (ref.uniqueId) {
    return { kind: 'equippedWeapon', uniqueId: ref.uniqueId };
  }
  return null;
}
