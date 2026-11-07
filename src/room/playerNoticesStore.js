// src/room/playerNoticesStore.js
// Патч 558/559 — «что Мастер прислал» у игрока.
//
// Слово владельца (559): «А мы можем трансляцию оставить как есть. Она оффлайн
// не работает. А посланные эффекты в стиле "что нового" при входе».
// Поэтому здесь только ПРИМЕНЁННЫЕ ЭФФЕКТЫ (разовые команды): уровень, крышки,
// лечение, увечья, медикаменты от другого игрока. Трансляции (локации,
// торговцы, терминалы) сюда не пишутся — они работают плашкой, как раньше.
//
// Склад живёт на клиенте и привязан к ПЕРСОНАЖУ. Пока персонаж не открыт,
// ничего не всплывает: на карточке в списке загорается синяя иконка сервера,
// а окно в стиле «Что нового» показывается при входе в этого персонажа.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PLAYER_NOTICE_KIND = Object.freeze({
  COMMAND: 'command',
});

const STORAGE_KEY = 'positronium_player_notices_v1';
const MAX_NOTICES = 100;

let hydrating = null;

const persist = (notices) => {
  const tail = notices.slice(-MAX_NOTICES);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tail)).catch(() => {});
};

const usePlayerNoticesStore = create((set, get) => ({
  notices: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydrating) return hydrating;
    hydrating = (async () => {
      let parsed = [];
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        parsed = Array.isArray(list) ? list.filter((item) => item && item.id && item.characterId) : [];
      } catch {
        parsed = [];
      }
      set({ notices: parsed, hydrated: true });
      hydrating = null;
    })();
    return hydrating;
  },

  /** Одно уведомление на персонажа. Повтор с тем же id игнорируется. */
  addNotice: (notice) => {
    const id = String(notice?.id || '').trim();
    const characterId = String(notice?.characterId || '').trim();
    if (!id || !characterId) return false;
    if (get().notices.some((item) => item.id === id)) return false;
    const record = {
      id,
      characterId,
      roomCode: String(notice.roomCode || ''),
      roomName: String(notice.roomName || ''),
      // 559: трансляции в этот склад не пишутся — только эффекты.
      kind: PLAYER_NOTICE_KIND.COMMAND,
      text: String(notice.text || ''),
      read: false,
      at: Number(notice.at) || Date.now(),
    };
    const notices = [...get().notices, record].slice(-MAX_NOTICES);
    set({ notices });
    persist(notices);
    return true;
  },

  /** «Понятно» в окне списка: всё прочитанное по этому персонажу. */
  markReadForCharacter: (characterId) => {
    const id = String(characterId || '').trim();
    if (!id) return;
    const notices = get().notices.map((item) => (
      item.characterId === id && !item.read ? { ...item, read: true } : item
    ));
    set({ notices });
    persist(notices);
  },

  resetForTests: async () => {
    hydrating = null;
    set({ notices: [], hydrated: false });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));

export const unreadNoticesFor = (notices, characterId) => (
  (Array.isArray(notices) ? notices : [])
    .filter((item) => item && item.characterId === characterId && !item.read)
);

export const unreadNoticeCountFor = (notices, characterId) => (
  unreadNoticesFor(notices, characterId).length
);

export default usePlayerNoticesStore;
