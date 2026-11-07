// src/room/transmissionSeenStore.js
// Патч 560 — «сигнал о новой трансляции — цвет иконки сервера».
//
// Слово владельца: «Трансляция доступна только тому персонажу, за которого
// вошли. Если 2 персонажа в 2 серверных комнатах получают 2 трансляции, каждый
// персонаж видит свою… пока не войдёшь другим — ничего не увидишь. А сигнал о
// новой трансляции или эффекте — цвет иконки сервера».
//
// Значит, на карточке в списке нужно помнить, ЧЬЮ трансляцию игрок уже видел.
// Храним пару «персонаж → последняя показанная сессия». Пока сессия в комнате
// другая, чем запомненная, иконка сервера синяя.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'positronium_transmission_seen_v1';

let hydrating = null;

const persist = (seen) => {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seen)).catch(() => {});
};

const useTransmissionSeenStore = create((set, get) => ({
  // { [characterId]: sessionId }
  seen: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydrating) return hydrating;
    hydrating = (async () => {
      let parsed = {};
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        parsed = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      } catch {
        parsed = {};
      }
      set({ seen: parsed, hydrated: true });
      hydrating = null;
    })();
    return hydrating;
  },

  markSeen: (characterId, sessionId) => {
    const id = String(characterId || '').trim();
    const session = String(sessionId || '').trim();
    if (!id || !session) return;
    if (get().seen[id] === session) return;
    const seen = { ...get().seen, [id]: session };
    set({ seen });
    persist(seen);
  },

  resetForTests: async () => {
    hydrating = null;
    set({ seen: {}, hydrated: false });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));

/** Сессия комнаты адресована этому персонажу? (правило 506/544 не меняем) */
export const sessionTargetsCharacter = (session, characterId) => {
  if (!session || !characterId) return false;
  if (session.targetType === 'room') return true;
  return session.targetCharacterId === characterId;
};

/** Есть активная трансляция для персонажа, которую он ещё не видел. */
export const hasUnseenTransmission = (seen, room, characterId) => {
  const session = room?.activeSession;
  if (!sessionTargetsCharacter(session, characterId)) return false;
  return seen?.[characterId] !== session.sessionId;
};

export default useTransmissionSeenStore;
