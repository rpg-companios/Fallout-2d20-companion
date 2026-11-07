// src/room/playerFocusStore.js
// Патч 558: где сейчас сидит игрок.
//
// «Сидит в персонаже» = открыт любой экран персонажа (лист, экипировка,
// инвентарь, перки), а не список персонажей. Список помечает домашнюю
// вкладку как активную; окна Мастера и уведомления смотрят на этот флаг и не
// всплывают поверх списка.

import { create } from 'zustand';

const usePlayerFocusStore = create((set) => ({
  // null — «пока неизвестно»: так стартует тест и первый кадр приложения.
  // Плашки трансляций в этом состоянии работают как раньше (patch 506/544),
  // а окно-список ждёт явного «игрок внутри персонажа» (false).
  homeFocused: null,
  setHomeFocused: (value) => set({ homeFocused: Boolean(value) }),
  resetForTests: () => set({ homeFocused: null }),
}));

export default usePlayerFocusStore;
