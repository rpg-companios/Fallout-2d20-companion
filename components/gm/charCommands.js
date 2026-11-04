/**
 * Патч 529 — ЗАКОН СНИМКА (канон исполнения команд Мастера на клиенте).
 *
 * «Снапшот юзера не трогаем, если надо что-то изменить у пользователя —
 * посылаем команду, которую исполнит клиент. По нему должно работать всё
 * пространство мастера. Снапшот нужен для наблюдения за изменением состояния
 * пользователя без вмешательства даже между сессиями».
 *
 * Здесь живут ТОЛЬКО исполнители команд: они меняют живой лист штатными
 * действиями characterStore и сохраняют его обычным saveCharacter(). Никакой
 * правки room.lastSnapshots, никакого «поднять ревизию» на сервере. Публикацию
 * свежего листа делает вторая команда char.refresh (см. CharSpendCommandHost).
 *
 * Модуль чистый относительно сети: deps подменяются в тестах.
 */

import useCharacterStore from '../../src/store/characterStore';
import { debugLog } from '../../src/debug/falloutDebug';
import { spendBobbyPins } from '../lootTrade/spendBobbyPins';

export const CHAR_COMMAND_KIND = Object.freeze({
  ITEM_SPEND: 'item.spend',
  MAGAZINE_USE: 'magazine.use',
});

/** Жёсткий белый список: клиент не исполняет произвольные команды сервера. */
export const CHAR_COMMAND_KINDS = Object.freeze(Object.values(CHAR_COMMAND_KIND));

/**
 * Привести кадр протокола к единому виду команды.
 * char.command — общий кадр 529; char.spend — специализированный алиас 528,
 * оставлен для совместимости с сервером предыдущей версии.
 */
export const normalizeCharacterCommand = (message, ROOM_MESSAGE) => {
  const payload = message?.payload || {};
  const legacy = message?.type === ROOM_MESSAGE.CHAR_SPEND;
  const commandId = String(payload.commandId || payload.spendId || '').trim();
  const kind = legacy
    ? CHAR_COMMAND_KIND.ITEM_SPEND
    : String(payload.kind || '').trim();
  const commandPayload = legacy
    ? { itemId: String(payload.itemId || 'item_bobby_pin'), count: payload.count }
    : (payload.payload && typeof payload.payload === 'object' ? payload.payload : {});
  return {
    commandId,
    characterId: String(payload.characterId || '').trim(),
    kind,
    payload: commandPayload,
    legacy,
  };
};

const applyItemSpend = async (command, deps) => {
  const itemId = String(command.payload?.itemId || 'item_bobby_pin');
  if (itemId !== 'item_bobby_pin') return { ok: false, reason: 'unsupported-item' };
  const count = Math.max(1, Math.floor(Number(command.payload?.count) || 1));
  const spent = await deps.spendBobbyPins(count, {
    characterId: command.characterId,
    publish: false,
  });
  return { ok: true, spent };
};

const applyMagazineUse = async (command, deps) => {
  const magazineId = String(command.payload?.magazineId || '').trim();
  if (!magazineId) return { ok: false, reason: 'no-magazine' };
  // Штатное действие стора (идемпотентно) + обычное сохранение листа.
  deps.markMagazineEffectUsed(magazineId);
  const name = deps.getCharacterName();
  await deps.saveCharacter(name);
  return { ok: true, magazineId };
};

/** Исполнить команду штатными средствами клиента. */
export const applyCharacterCommand = async (command, deps = {}) => {
  const {
    spendBobbyPins: spend = spendBobbyPins,
    markMagazineEffectUsed = (id) => useCharacterStore.getState().markMagazineEffectUsed?.(id),
    getCharacterName = () => useCharacterStore.getState().characterName || '—',
    saveCharacter = async (name) => {
      const { saveCharacter: save } = await import('../../src/saves/characterSaves');
      return save(name);
    },
    log = debugLog,
  } = deps;
  const handlers = {
    [CHAR_COMMAND_KIND.ITEM_SPEND]: applyItemSpend,
    [CHAR_COMMAND_KIND.MAGAZINE_USE]: applyMagazineUse,
  };
  const handler = handlers[command?.kind];
  if (!handler) {
    log('gm.charCommand:unknownKind', { kind: command?.kind });
    return { ok: false, reason: 'unknown-kind' };
  }
  try {
    return await handler(command, {
      spendBobbyPins: spend,
      markMagazineEffectUsed,
      getCharacterName,
      saveCharacter,
    });
  } catch (error) {
    log('gm.charCommand:failed', { kind: command?.kind, message: error?.message });
    return { ok: false, reason: 'failed' };
  }
};

export default applyCharacterCommand;
