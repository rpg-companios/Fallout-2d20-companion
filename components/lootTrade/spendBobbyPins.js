import useCharacterStore from '../../src/store/characterStore';
import { debugLog } from '../../src/debug/falloutDebug';
import { pushSavedCharacterToBoundRoomIfAny } from '../../src/room/roomCharacterSync';
import engine from '../../server/lockPicking';

/**
 * Патч 527: сломанная заколка должна ИСЧЕЗНУТЬ из инвентаря, а не только из
 * счётчика мини-игры. Сервер уже уменьшил quantity в опубликованном снимке;
 * здесь зеркально списываем заколку из живого стора персонажа, сохраняем лист
 * и переопубликовываем его в комнату Мастера (включая локальный резерв, где
 * серверного терминала нет и доска живёт целиком на клиенте).
 *
 * Основной путь — общая атомарная операция стора spendItemStacks (respects
 * моды/состояние, не трогает надетое и запертое по правилу 522). Резерв для
 * старых форм сейва, где канонический id лежит в catalogId/itemId/code: тот же
 * канон поиска заколок, что у сервера (consumeBobbyPins).
 */

export const BOBBY_PIN_ITEM_ID = 'item_bobby_pin';

export const spendBobbyPins = async (count, { characterId } = {}) => {
  const delta = Math.max(0, Math.floor(Number(count) || 0));
  if (delta <= 0) return 0;
  const store = useCharacterStore.getState();
  let spent = 0;
  const action = typeof store.spendItemStacks === 'function'
    ? store.spendItemStacks({ spend: [{ itemId: BOBBY_PIN_ITEM_ID, count: delta }] })
    : null;
  if (action?.ok) {
    spent = delta;
  } else {
    // Легаси-сейв: getItemId() стора не узнал запись по catalogId/itemId/code.
    // Списываем через общий с сервером канон (он понимает все эти формы).
    const mini = {
      items: store.items || {},
      equipment: store.equipment || {},
      inventory: store.inventory || [],
      bag: store.bag || [],
    };
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
  try {
    const id = characterId || useCharacterStore.getState().currentCharacterId;
    if (id) await pushSavedCharacterToBoundRoomIfAny(id);
  } catch (error) {
    debugLog('lock.spendBobbyPins:publishFailed', { message: error?.message });
  }
  return spent;
};

export default spendBobbyPins;
