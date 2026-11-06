import useCharacterStore from '../../src/store/characterStore';
import { debugLog } from '../../src/debug/falloutDebug';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import engine from '../../server/lockPicking';

/**
 * Патч 527/528/529: сломанная заколка должна ИСЧЕЗНУТЬ из инвентаря, а не
 * только из счётчика мини-игры. По закону снимка (патч 529) сервер НЕ трогает
 * лист: он шлёт команду char.command(kind=item.spend), а этот модуль штатно
 * списывает заколку из живого стора и сохраняет лист. Публикацию делает вторая
 * команда char.refresh. Локальный резерв старого сервера публикует сам.
 *
 * Основной путь — общая атомарная операция стора spendItemStacks (respects
 * моды/состояние, не трогает надетое и запертое по правилу 522). Резерв для
 * старых форм сейва, где канонический id лежит в catalogId/itemId/code: тот же
 * канон поиска заколок, что у сервера (consumeBobbyPins).
 */

export const BOBBY_PIN_ITEM_ID = 'item_bobby_pin';

export const spendBobbyPins = async (count, { characterId, publish = true } = {}) => {
  const delta = Math.max(0, Math.floor(Number(count) || 0));
  if (delta <= 0) return 0;
  const store = useCharacterStore.getState();
  // Патч 550 — слово владельца: «при нехватке заколок — стоп. Одна заколка =
  // одна заколка». Проверяем запас ДО любой мутации общим каноном сервера
  // (он понимает и каноническую форму, и легаси catalogId/itemId/code).
  // Не хватает — отказ без списания, без сохранения и без публикации листа.
  const inventoryScope = {
    items: store.items || {},
    equipment: store.equipment || {},
    inventory: store.inventory || [],
    bag: store.bag || [],
  };
  const available = engine.countBobbyPins?.(inventoryScope) ?? 0;
  if (available < delta) {
    debugLog('lock.spendBobbyPins:notEnoughPins', { need: delta, available });
    return 0;
  }
  let spent = 0;
  const action = typeof store.spendItemStacks === 'function'
    ? store.spendItemStacks({ spend: [{ itemId: BOBBY_PIN_ITEM_ID, count: delta }] })
    : null;
  if (action?.ok) {
    spent = delta;
  } else {
    // Легаси-сейв: getItemId() стора не узнал запись по catalogId/itemId/code.
    // Списываем через общий с сервером канон (он понимает все эти формы).
    // Патч 550: канон тоже «всё или ничего» — при нехватке он вернёт 0 и
    // нетронутый снимок, остаток не доедается.
    const mini = inventoryScope;
    const result = engine.consumeBobbyPins?.(mini, delta) || { consumed: 0, snapshot: mini };
    if (result.consumed > 0) {
      useCharacterStore.setState({
        items: result.snapshot.items,
        equipment: result.snapshot.equipment,
        ...(Array.isArray(store.inventory) ? { inventory: result.snapshot.inventory } : {}),
        ...(Array.isArray(store.bag) ? { bag: result.snapshot.bag } : {}),
      });
      spent = result.consumed;
    }
  }
  if (spent <= 0) {
    // В инвентаре уже нечего списывать (например, лист устарел). Доска всё
    // равно честно покажет «Заколки закончились» — молчим, без алерта.
    debugLog('lock.spendBobbyPins:noPins', { delta });
    return 0;
  }
  try {
    // Динамический импорт: модуль сохранений не нужен при обычном рендере.
    const { saveCharacter } = await import('../../src/saves/characterSaves');
    await saveCharacter(store.characterName || '—');
  } catch (error) {
    debugLog('lock.spendBobbyPins:saveFailed', { message: error?.message });
  }
  // Патч 528: в сетевом режиме публикацию делает вторая команда сервера
  // (`char.refresh`), поэтому здесь её можно отключить. В локальном резерве
  // серверных команд нет — лист публикуется сразу.
  if (publish) {
    try {
      const id = characterId || useCharacterStore.getState().currentCharacterId;
      if (id) await pushSavedCharacterToBoundRoomIfAny(id);
    } catch (error) {
      debugLog('lock.spendBobbyPins:publishFailed', { message: error?.message });
    }
  }
  return spent;
};

export default spendBobbyPins;
