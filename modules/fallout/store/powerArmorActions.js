/**
 * Fallout power-armor store workflows. The engine owns only the neutral state
 * bridge; these rules and transaction flows ship with the Fallout package.
 * The payload is persisted by the engine as opaque setting state.
 *
 * Package-specific operations bind to the shared Zustand store through the
 * optional inventory.powerArmor capability; no engine file imports this module.
 */

import { showAlert as showCatalogAlert, showRawAlert } from 'engine:components/alerts/alertService';
import { getInventoryDictionary } from 'engine:components/screens/InventoryScreen/logic/inventoryI18n';
import { getCurrentModuleLocale } from 'engine:i18n/locale';
import { getEquipmentCatalog } from 'engine:i18n/equipmentCatalog';
import { canEquipArmor } from 'engine:domain/equipEquip';
import { createEmptyEquippedArmor } from 'engine:domain/equippedArmor';
import {
  FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
  createInitialFalloutPowerArmorState,
  getFalloutPowerArmorState,
  hydrateFalloutPowerArmorState,
  updateFalloutPowerArmorState,
} from './powerArmorState.js';
import { getFalloutPowerArmorData as getPowerArmorData } from '../logic/catalogLookup.js';
import {
  createEmptyEquippedPowerArmor,
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
} from '../logic/powerArmor.js';

const getPowerArmorCatalogById = () => Object.fromEntries(
  Object.values(getPowerArmorData()).flatMap((set) => set.pieces ?? []).map((piece) => [piece.id, piece]),
);

const tPA = (key) => getInventoryDictionary(getCurrentModuleLocale()).screen?.alerts?.[key] ?? key;
const tPALabel = (key) => getInventoryDictionary(getCurrentModuleLocale()).screen?.labels?.[key] ?? key;
// Алерты слоя СБ идут через общий AlertHost — одна React-модалка на вебе
// и на нативе.
const paAlert = (title, message = '') => showRawAlert({ title, message });

/** Каталожные данные части PA в текущей локали (имя); механика — из canonical data. */
const paLocalizedCatalogItem = (catalogId) => {
  const localized = (getEquipmentCatalog(getCurrentModuleLocale())?.powerArmorList || [])
    .find((p) => p.id === catalogId);
  if (!localized) {
    throw new Error(`[Fallout/PowerArmor] Для силовой брони "${catalogId}" нет локализованных данных`);
  }
  return localized;
};

/** Bind Fallout power-armor operations to the host character store. */
export const createFalloutPowerArmorActions = (set, get) => {
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
  //
  // ИНВАРИАНТ (зафиксирован владельцем, патч 227): все вызовы equip-экшенов
  // слоя СБ — обработчики пользовательских тапов. Микрозадача провайдера
  // (queueMicrotask → setCharacterContext) дренируется раньше любого тапа
  // (тап — отдельная макрозадача), поэтому _characterContext к вызову всегда
  // заполнен. Программный equip из эффектов монтирования ДО первого пуша
  // контекста ЗАПРЕЩЁН: до пуша characterRules() видит {origin: null,
  // trait: null} и супермутант прошёл бы проверку как человек (revalidation
  // уже надетого не происходит — recalculateDerivedStats пересчитывает
  // производные, но не отменяет надетое). Восстановление из сейва мимо
  // проверки — осознанно: loadPowerArmorState доверяет валидированному
  // состоянию. Если появится автозапуск equip — сначала добавить fail-closed
  // (отклонение 'context-not-ready' при _characterContext === undefined).
  const characterRules = () => ({
    // Шаг 7: origin/trait — публичные поля стора (мигрировали из контекста).
    origin: get().origin || null,
    trait: get().trait || null,
  });
  const readPowerArmorState = () => (
    getFalloutPowerArmorState(get()) ?? createInitialFalloutPowerArmorState()
  );
  const patchPowerArmorState = (patch) => updateFalloutPowerArmorState(set, get, patch);

  return {
    setEquippedPowerArmor: (updater) => patchPowerArmorState((state) => ({
      ...state,
      equippedPowerArmor: typeof updater === 'function'
        ? updater(state.equippedPowerArmor)
        : updater,
    })),
    setPowerArmorRuntime: (updater) => patchPowerArmorState((state) => ({
      ...state,
      powerArmorRuntime: typeof updater === 'function'
        ? updater(state.powerArmorRuntime)
        : updater,
    })),
    setPendingCoreChoice: (updater) => patchPowerArmorState((state) => ({
      ...state,
      pendingCoreChoice: typeof updater === 'function'
        ? updater(state.pendingCoreChoice)
        : updater,
    })),
    loadPowerArmorState: ({ equippedArmor, equippedPowerArmor, powerArmorRuntime } = {}) => {
      const extension = hydrateFalloutPowerArmorState({ equippedPowerArmor, powerArmorRuntime });
      set((state) => ({
        equippedArmor: equippedArmor || createEmptyEquippedArmor(),
        stateExtensions: {
          ...(state.stateExtensions || {}),
          [FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY]: extension,
        },
      }));
    },

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
      const equippedNow = readPowerArmorState().equippedPowerArmor;
      if (hasFrame(equippedNow)) return; // второй пакет поверх не надевается

      const equipped = unpackPackage(frameStackItem);
      if (equipped.frame.core) {
        // Блок уже в пакете → надеваем молча.
        paDecrementStoreStack(frameStackItem.id);
        patchPowerArmorState({ equippedPowerArmor: equipped });
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
        patchPowerArmorState({ equippedPowerArmor: insertCore(equipped, pick.core) });
        return;
      }
      // Разный заряд → игрок выбирает; пакет снимем со стопки после выбора (resolveCoreChoice).
      patchPowerArmorState({ pendingCoreChoice: { kind: 'equip', equipped, frameStoreKey: frameStackItem.id, cores: pick.cores } });
    },

    // Разрешение диалога выбора блока (§5.1/§5.4): coreStoreKey — ключ записи в сторе, null — отмена.
    resolveCoreChoice: (coreStoreKey) => {
      const pending = readPowerArmorState().pendingCoreChoice;
      patchPowerArmorState({ pendingCoreChoice: null });
      if (!pending) return;

      if (!coreStoreKey) {
        if (pending.kind === 'depleted') {
          // От замены отказались → пакет снимается в инвентарь, как при отсутствии блоков.
          paAddStackToInventory(paPackageToStackItem(pending.equipped));
          patchPowerArmorState({ equippedPowerArmor: createEmptyEquippedPowerArmor() });
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
      patchPowerArmorState({ equippedPowerArmor: insertCore(pending.equipped, coreItem) });
    },

    // ── Снять весь пакет: части и блок уезжают в инвентарь ВНУТРИ стопки-каркаса (§4) ──
    unequipPowerArmorPackage: () => {
      const equipped = readPowerArmorState().equippedPowerArmor;
      if (!hasFrame(equipped)) return;
      paAddStackToInventory(paPackageToStackItem(equipped));
      patchPowerArmorState({ equippedPowerArmor: createEmptyEquippedPowerArmor() });
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
      const candidateSlots = powerArmorSlotsFor(getPowerArmorCatalogById()[catalogId]);
      if (candidateSlots.length === 0) return;
      const equippedNow = readPowerArmorState().equippedPowerArmor;
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
        const equipped = readPowerArmorState().equippedPowerArmor;
        const replaced = equipped.pieces[slot];
        patchPowerArmorState({ equippedPowerArmor: equipPowerArmorPiece(equipped, slot, piece) });
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
      const equipped = readPowerArmorState().equippedPowerArmor;
      const piece = equipped?.pieces?.[slot];
      if (!piece) return;
      patchPowerArmorState({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: null } } });
      paAddStackToInventory(paPieceToStackItem(piece));
    },

    // ── §5.7 Кнопки −/+ прочности части; упала до 0 → часть сама слетает в инвентарь ──
    adjustPowerArmorDurability: (slot, delta) => {
      const equipped = readPowerArmorState().equippedPowerArmor;
      const piece = equipped?.pieces?.[slot];
      if (!piece) return;
      const maxHp = getPowerArmorCatalogById()[piece.catalogId]?.hp;
      if (!Number.isFinite(maxHp)) return;
      const adjusted = adjustPieceHp(piece, delta, maxHp);
      if (isPieceBroken(adjusted)) {
        patchPowerArmorState({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: null } } });
        paAddStackToInventory(paPieceToStackItem(adjusted));
        return;
      }
      patchPowerArmorState({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: adjusted } } });
    },

    // Починка надетой части (ПРАВИЛО владельца: бесплатно до максимума).
    repairPowerArmorPieceAt: (slot) => {
      const equipped = readPowerArmorState().equippedPowerArmor;
      const piece = equipped?.pieces?.[slot];
      if (!piece) return;
      const maxHp = getPowerArmorCatalogById()[piece.catalogId]?.hp;
      if (!Number.isFinite(maxHp) || !needsRepair(piece, maxHp)) return;
      patchPowerArmorState({ equippedPowerArmor: { ...equipped, pieces: { ...equipped.pieces, [slot]: repairPowerArmorPiece(piece, maxHp) } } });
    },

    // Починка части прямо в инвентаре (кнопка «Починить» на строке). Прочность входит
    // в подпись стопки → после починки стопка либо переподписывается, либо сливается
    // с уже существующей целой (quantity переносится).
    repairPowerArmorStack: (storeItemId) => {
      const { items } = get();
      const item = items[storeItemId];
      if (!item || item.itemType !== 'powerArmor' || isPowerArmorFrame(item)) return;
      const catalogId = item.weaponId || item.id;
      const maxHp = getPowerArmorCatalogById()[catalogId]?.hp;
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
      const equipped = readPowerArmorState().equippedPowerArmor;
      if (!hasFrame(equipped) || !equipped.frame.core) return;

      const tick = tickCoreAccumulator(readPowerArmorState().powerArmorRuntime, tickMs);
      patchPowerArmorState({ powerArmorRuntime: { coreAccumulatorMs: tick.coreAccumulatorMs } });
      if (tick.chargesConsumed <= 0) return;

      const { equipped: drained, depleted } = drainActiveCore(equipped, tick.chargesConsumed);
      if (!depleted) {
        patchPowerArmorState({ equippedPowerArmor: drained });
        return;
      }

      // Блок исчерпан: есть замена — молча (одинаковый заряд) или выбором (разный);
      // блоков нет совсем — пакет снимается в инвентарь (ПРАВИЛО владельца §5.4).
      const pick = pickFusionCore(findChargedFusionCores(Object.values(get().items || {})));
      if (pick.kind === 'auto') {
        paDecrementStoreStack(pick.core.id);
        patchPowerArmorState({ equippedPowerArmor: insertCore(drained, pick.core) });
        return;
      }
      if (pick.kind === 'choice') {
        patchPowerArmorState({ pendingCoreChoice: { kind: 'depleted', equipped: drained, cores: pick.cores } });
        return;
      }
      paAddStackToInventory(paPackageToStackItem(drained));
      patchPowerArmorState({ equippedPowerArmor: createEmptyEquippedPowerArmor() });
      paAlert(tPA('powerArmorDepletedTitle'), tPA('powerArmorDepletedMessage'));
    },
  };
};
