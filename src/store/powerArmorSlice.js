/**
 * @file powerArmorSlice.js
 * @description Слайс силовой брони и обычной надетой брони (Шаг 4 миграции
 * из CharacterContext, docs/architecture/power-armor-plan.md).
 *
 * State shape:
 *   equippedArmor      — обычная броня/одежда по слотам (domain/equippedArmor.js);
 *   equippedPowerArmor — надетый пакет СБ { frame, pieces } (domain/powerArmor.js);
 *   powerArmorRuntime  — накопитель аптайма блока { coreAccumulatorMs };
 *   pendingCoreChoice  — отложенный выбор Ядерного блока (диалог §5.1/§5.4).
 *                        Это состояние НЕЗАВЕРШЁННОЙ транзакции (снапшот
 *                        недоодетого пакета), поэтому живёт в сторе, а не в UI.
 *                        НЕ персистится: недоодетый пакет не переживает рестарт.
 *
 * Модель слоя СБ: надевание ИЗЫМАЕТ предмет из стековой записи инвентаря
 * (quantity −1, при 0 запись удаляется), снятие возвращает стопку через
 * addNewItem (сливается по stackKey).
 *
 * ПРАВИЛО (от владельца, Шаг 4): алерты действий слоя СБ показываются
 * отсюда напрямую через components/alerts/alertService. Это осознанное
 * исключение из правила alertService «движок не зовёт UI»: слайс —
 * артефакт миграции контекста, поведение перенесено 1:1. Разделение
 * «экшен возвращает outcome, экран показывает диалог» — отдельная задача.
 */

import { showCatalogAlert, showRawAlert } from '../../components/alerts/alertService';
import { INVENTORY_DICTIONARIES } from '../../components/screens/InventoryScreen/logic/inventoryI18n';
import { getCurrentLocale, getCurrentModuleLocale } from '../../i18n/locale';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { createEmptyEquippedArmor } from '../../domain/equippedArmor';
import {
  createEmptyEquippedPowerArmor,
  createEmptyPowerArmorRuntime,
  tickCoreAccumulator,
  drainActiveCore,
  packPackage,
  unpackPackage,
  insertCore,
  equipPowerArmorPiece,
  canEquipPowerArmorPiece,
  findChargedFusionCores,
  pickFusionCore,
  powerArmorPieceStackKey,
  powerArmorSlotsFor,
  resolvePowerArmorPieceTarget,
  repairPowerArmorPiece,
  adjustPieceHp,
  needsRepair,
  hasFrame,
  isPieceBroken,
  isPowerArmorFrame,
} from '../../domain/powerArmor';
import { canEquipArmor } from '../../domain/equipEquip';
import dataPowerArmor from '../../modules/fallout/data/equipment/powerArmor.json';

const PA_CATALOG_BY_ID = Object.fromEntries(
  Object.values(dataPowerArmor).flatMap((set) => set.pieces).map((p) => [p.id, p]),
);

const INV_ALERTS_DICT = {
  'ru-RU': INVENTORY_DICTIONARIES['ru-RU'].screen.alerts,
  'en-EN': INVENTORY_DICTIONARIES['en-EN'].screen.alerts,
};
// ПРАВИЛО (владелец): никаких фолбэков — ключ обязан быть в обеих локалях.
const tPA = (key) => INV_ALERTS_DICT[getCurrentLocale()][key];
// Лейблы инвентаря (левая/правая конечность) — те же ключи, что использует
// обычная броня при выборе слота.
const INV_LABELS_DICT = {
  'ru-RU': INVENTORY_DICTIONARIES['ru-RU'].screen.labels,
  'en-EN': INVENTORY_DICTIONARIES['en-EN'].screen.labels,
};
const tPALabel = (key) => INV_LABELS_DICT[getCurrentLocale()][key];
// Алерты слоя СБ идут через общий AlertHost — одна React-модалка на вебе
// и на нативе.
const paAlert = (title, message = '') => showRawAlert({ title, message });

/** Каталожные данные части PA в текущей локали (имя); механика — из canonical data. */
const paLocalizedCatalogItem = (catalogId) => {
  const localized = (getEquipmentCatalog(getCurrentModuleLocale())?.powerArmorList || [])
    .find((p) => p.id === catalogId);
  if (!localized) {
    throw new Error(`[powerArmorSlice] Для силовой брони "${catalogId}" нет локализованных данных`);
  }
  return localized;
};

export const createInitialPowerArmorState = () => ({
  equippedArmor: createEmptyEquippedArmor(),
  equippedPowerArmor: createEmptyEquippedPowerArmor(),
  powerArmorRuntime: createEmptyPowerArmorRuntime(),
  pendingCoreChoice: null,
});

/**
 * Factory that returns the power armor actions, bound to the store's set/get.
 * @param {function} set - zustand set
 * @param {function} get - zustand get
 */
export const createPowerArmorActions = (set, get) => {
  // Списать count с инвентарной стековой записи (декремент-модель; 0 → запись удалена).
  const paDecrementStoreStack = (storeItemId, count = 1) => {
    const { items } = get();
    const item = items[storeItemId];
    if (!item) return;
    const newQty = (item.quantity || 1) - count;
    if (newQty <= 0) {
      const updated = { ...items };
      delete updated[storeItemId];
      set({ items: updated });
      return;
    }
    get().updateItem(storeItemId, { quantity: newQty });
  };

  // Положить стек-предмет в инвентарь. Ключ записи = stackKey: для каждого
  // состояния (заряд/прочность/состав частей) ключ уникален, а одинаковые
  // стопки всё равно сольются стек-поиском addNewItem по тому же stackKey.
  const paAddStackToInventory = (stackItem) => {
    get().addNewItem({ ...stackItem, uniqueId: stackItem.stackKey, quantity: 1 });
  };

  // Надетая часть → инвентарный стек-предмет (подпись: каталожный id + моды + прочность).
  const paPieceToStackItem = (piece) => ({
    ...paLocalizedCatalogItem(piece.catalogId),
    appliedMods: piece.appliedMods || {},
    hpCurrent: piece.hpCurrent,
    stackKey: powerArmorPieceStackKey(piece),
  });

  // Надетый пакет → инвентарная стопка-каркас: packPackage даёт контракт полей
  // и stackKey; вес/цена/имя добираем из каталога текущей локали.
  const paPackageToStackItem = (equipped) => {
    const packed = packPackage(equipped);
    return { ...paLocalizedCatalogItem(packed.id), ...packed };
  };

  // Правила экипировки (робот/супермутант) читают origin/trait персонажа,
  // прокинутого в стор через setCharacterContext (эффект derived-статистики).
  const characterRules = () => {
    const ctx = get()._characterContext || {};
    return { origin: ctx.origin || null, trait: ctx.trait || null };
  };

  return {
    // ── Базовые сеттеры (в том числе для эффекта таймера и загрузки сейва) ──

    setEquippedArmor: (updater) => set((state) => ({
      equippedArmor: typeof updater === 'function' ? updater(state.equippedArmor) : updater,
    })),

    setEquippedPowerArmor: (updater) => set((state) => ({
      equippedPowerArmor: typeof updater === 'function' ? updater(state.equippedPowerArmor) : updater,
    })),

    setPowerArmorRuntime: (updater) => set((state) => ({
      powerArmorRuntime: typeof updater === 'function' ? updater(state.powerArmorRuntime) : updater,
    })),

    setPendingCoreChoice: (updater) => set((state) => ({
      pendingCoreChoice: typeof updater === 'function' ? updater(state.pendingCoreChoice) : updater,
    })),

    /** Восстановление слоя из сейва (loadCharacter). Диалог выбора сбрасывается. */
    loadPowerArmorState: ({ equippedArmor, equippedPowerArmor, powerArmorRuntime } = {}) => set({
      equippedArmor: equippedArmor || createEmptyEquippedArmor(),
      equippedPowerArmor: equippedPowerArmor || createEmptyEquippedPowerArmor(),
      powerArmorRuntime: powerArmorRuntime || createEmptyPowerArmorRuntime(),
      pendingCoreChoice: null,
    }),

    // ── §5.1 Надеть пакет (каркас + установленные части + блок, если он внутри) ──
    equipPowerArmorPackage: (frameStackItem) => {
      // ПРАВИЛО (от владельца): супермутантам силовая запрещена. И роботам — политика
      // экипировки брони общая (domain/equipEquip.canEquipArmor).
      const check = canEquipArmor(frameStackItem, characterRules());
      if (!check.allowed) {
        if (check.reason === 'equip.error.robotCannotWearStandardArmor') {
          paAlert(tPA('robotArmorOnlyTitle'), tPA('robotArmorOnlyMessage'));
        } else {
          paAlert(tPA('mutantCannotWearStandardArmorTitle'), tPA('mutantCannotWearStandardArmorMessage'));
        }
        return;
      }
      const equippedNow = get().equippedPowerArmor;
      if (hasFrame(equippedNow)) return; // второй пакет поверх не надевается

      const equipped = unpackPackage(frameStackItem);
      if (equipped.frame.core) {
        // Блок уже в пакете → надеваем молча.
        paDecrementStoreStack(frameStackItem.id);
        set({ equippedPowerArmor: equipped });
        return;
      }
      const pick = pickFusionCore(findChargedFusionCores(Object.values(get().items || {})));
      if (pick.kind === 'none') {
        paAlert(tPA('powerArmorNeedsCoreTitle'), tPA('powerArmorNeedsCoreMessage'));
        return;
      }
      if (pick.kind === 'auto') {
        // Заряд одинаковый у всех блоков → молча берём первый из стопки (ПРАВИЛО владельца).
        paDecrementStoreStack(pick.core.id);
        paDecrementStoreStack(frameStackItem.id);
        set({ equippedPowerArmor: insertCore(equipped, pick.core) });
        return;
      }
      // Разный заряд → игрок выбирает; пакет снимем со стопки после выбора (resolveCoreChoice).
      set({ pendingCoreChoice: { kind: 'equip', equipped, frameStoreKey: frameStackItem.id, cores: pick.cores } });
    },

    // Разрешение диалога выбора блока (§5.1/§5.4): coreStoreKey — ключ записи в сторе, null — отмена.
    resolveCoreChoice: (coreStoreKey) => {
      const pending = get().pendingCoreChoice;
      set({ pendingCoreChoice: null });
      if (!pending) return;

      if (!coreStoreKey) {
        if (pending.kind === 'depleted') {
          // От замены отказались → пакет снимается в инвентарь, как при отсутствии блоков.
          paAddStackToInventory(paPackageToStackItem(pending.equipped));
          set({ equippedPowerArmor: createEmptyEquippedPowerArmor() });
          paAlert(tPA('powerArmorDepletedTitle'), tPA('powerArmorDepletedMessage'));
        }
        // kind 'equip' + отмена → надевание не состоялось, инвентарь не тронут.
        return;
      }

      const coreItem = get().items[coreStoreKey];
      if (!coreItem || !(coreItem.charges > 0)) return;
      paDecrementStoreStack(coreStoreKey);
      if (pending.kind === 'equip' && pending.frameStoreKey) {
        paDecrementStoreStack(pending.frameStoreKey);
      }
      set({ equippedPowerArmor: insertCore(pending.equipped, coreItem) });
    },

    // ── Снять весь пакет: части и блок уезжают в инвентарь ВНУТРИ стопки-каркаса (§4) ──
    unequipPowerArmorPackage: () => {
      const equipped = get().equippedPowerArmor;
      if (!hasFrame(equipped)) return;
      paAddStackToInventory(paPackageToStackItem(equipped));
      set({ equippedPowerArmor: createEmptyEquippedPowerArmor() });
    },

    // ── §5.2 Надеть часть из инвентаря; вытесненная часть слота уходит в инвентарь ──
    // Наруч/понож — один предмет на любую сторону (как обычная броня): свободный
    // слот пары → туда; обе стороны заняты → игрок выбирает L/R тем же алертом.
    equipPowerArmorPieceInto: (pieceStackItem) => {
      // Каталожный id: у стор-предмета — weaponId, у свежего из каталога — id.
      const catalogId = pieceStackItem.weaponId || pieceStackItem.id;
      const piece = {
        catalogId,
        appliedMods: pieceStackItem.appliedMods || {},
        hpCurrent: pieceStackItem.hpCurrent,
      };
      const candidateSlots = powerArmorSlotsFor(PA_CATALOG_BY_ID[catalogId]);
      if (candidateSlots.length === 0) return;
      const equippedNow = get().equippedPowerArmor;
      const check = canEquipPowerArmorPiece(equippedNow, piece, characterRules());
      if (!check.ok) {
        if (check.reason === 'robotCannotWear') {
          paAlert(tPA('robotArmorOnlyTitle'), tPA('robotArmorOnlyMessage'));
          return;
        }
        paAlert(
          tPA('powerArmorNeedsCoreTitle'),
          tPA(check.reason === 'needsFrame' ? 'powerArmorNeedsFrameMessage' : 'powerArmorBrokenPieceMessage'),
        );
        return;
      }

      const doEquip = (slot) => {
        const equipped = get().equippedPowerArmor;
        const replaced = equipped.pieces[slot];
        set({ equippedPowerArmor: equipPowerArmorPiece(equipped, slot, piece) });
        paDecrementStoreStack(pieceStackItem.id);
        if (replaced) paAddStackToInventory(paPieceToStackItem(replaced));
      };

      const target = resolvePowerArmorPieceTarget(equippedNow, candidateSlots);
      if (target.kind === 'slot') {
        doEquip(target.slot);
        return;
      }

      // Пара занята → выбор стороны, формулировки — как у обычной брони.
      const [leftSlot, rightSlot] = target.slots;
      const leftLabel = tPALabel(leftSlot);
      const rightLabel = tPALabel(rightSlot);
      // Тот же диалог, что и у обычной брони (InventoryScreen): единая запись
      // каталога, три кнопки на обеих платформах.
      showCatalogAlert('bothSlotsBusy', { leftLabel, rightLabel }).then((side) => {
        if (side === 'left') doEquip(leftSlot);
        else if (side === 'right') doEquip(rightSlot);
      });
    },

    // Снять часть слота → в инвентарь своей стопкой.
    unequipPowerArmorPieceAt: (slot) => {
      const equipped = get().equippedPowerArmor;
      const piece = equipped?.pieces?.[slot];
      if (!piece) return;
      set({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: null } } });
      paAddStackToInventory(paPieceToStackItem(piece));
    },

    // ── §5.7 Кнопки −/+ прочности части; упала до 0 → часть сама слетает в инвентарь ──
    adjustPowerArmorDurability: (slot, delta) => {
      const equipped = get().equippedPowerArmor;
      const piece = equipped?.pieces?.[slot];
      if (!piece) return;
      const maxHp = PA_CATALOG_BY_ID[piece.catalogId]?.hp;
      if (!Number.isFinite(maxHp)) return;
      const adjusted = adjustPieceHp(piece, delta, maxHp);
      if (isPieceBroken(adjusted)) {
        set({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: null } } });
        paAddStackToInventory(paPieceToStackItem(adjusted));
        return;
      }
      set({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: adjusted } } });
    },

    // Починка надетой части (ПРАВИЛО владельца: бесплатно до максимума).
    repairPowerArmorPieceAt: (slot) => {
      const equipped = get().equippedPowerArmor;
      const piece = equipped?.pieces?.[slot];
      if (!piece) return;
      const maxHp = PA_CATALOG_BY_ID[piece.catalogId]?.hp;
      if (!Number.isFinite(maxHp) || !needsRepair(piece, maxHp)) return;
      set({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: repairPowerArmorPiece(piece, maxHp) } } });
    },

    // Починка части прямо в инвентаре (кнопка «Починить» на строке). Прочность входит
    // в подпись стопки → после починки стопка либо переподписывается, либо сливается
    // с уже существующей целой (quantity переносится).
    repairPowerArmorStack: (storeItemId) => {
      const { items } = get();
      const item = items[storeItemId];
      if (!item || item.itemType !== 'powerArmor' || isPowerArmorFrame(item)) return;
      const catalogId = item.weaponId || item.id;
      const maxHp = PA_CATALOG_BY_ID[catalogId]?.hp;
      if (!Number.isFinite(maxHp) || !needsRepair({ hpCurrent: item.hpCurrent }, maxHp)) return;
      const newStackKey = powerArmorPieceStackKey({ catalogId, appliedMods: item.appliedMods || {}, hpCurrent: maxHp });
      const wholeTwinKey = Object.keys(items).find(
        (key) => key !== storeItemId && (items[key]?.stackKey || items[key]?.id) === newStackKey,
      );
      if (wholeTwinKey) {
        const updated = { ...items };
        updated[wholeTwinKey] = { ...updated[wholeTwinKey], quantity: (updated[wholeTwinKey].quantity || 1) + (item.quantity || 1) };
        delete updated[storeItemId];
        set({ items: updated });
        return;
      }
      get().updateItem(storeItemId, { hpCurrent: maxHp, stackKey: newStackKey });
    },

    // ── §5.3/§5.4 Тик расхода Ядерного блока ──
    // Один тик транзакционно: накопитель аптайма, списание зарядов, авто-замена
    // блока / диалог выбора / снятие обесточенного пакета (ПРАВИЛО владельца §5.4).
    // React-эффект контекста просто вызывает это по интервалу: «приложение
    // закрыто — отсчёт на паузе», накопитель персистентный (идёт в сейв).
    tickPowerArmorCore: (tickMs) => {
      const equipped = get().equippedPowerArmor;
      if (!hasFrame(equipped) || !equipped.frame.core) return;

      const tick = tickCoreAccumulator(get().powerArmorRuntime, tickMs);
      set({ powerArmorRuntime: { coreAccumulatorMs: tick.coreAccumulatorMs } });
      if (tick.chargesConsumed <= 0) return;

      const { equipped: drained, depleted } = drainActiveCore(equipped, tick.chargesConsumed);
      if (!depleted) {
        set({ equippedPowerArmor: drained });
        return;
      }

      // Блок исчерпан: есть замена — молча (одинаковый заряд) или выбором (разный);
      // блоков нет совсем — пакет снимается в инвентарь (ПРАВИЛО владельца §5.4).
      const pick = pickFusionCore(findChargedFusionCores(Object.values(get().items || {})));
      if (pick.kind === 'auto') {
        paDecrementStoreStack(pick.core.id);
        set({ equippedPowerArmor: insertCore(drained, pick.core) });
        return;
      }
      if (pick.kind === 'choice') {
        set({ pendingCoreChoice: { kind: 'depleted', equipped: drained, cores: pick.cores } });
        return;
      }
      paAddStackToInventory(paPackageToStackItem(drained));
      set({ equippedPowerArmor: createEmptyEquippedPowerArmor() });
      paAlert(tPA('powerArmorDepletedTitle'), tPA('powerArmorDepletedMessage'));
    },
  };
};
