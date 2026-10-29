// src/room/uiModeStore.ts
// Реактивный стор режима интерфейса вкладки ('user' | 'gm') и флага просмотра
// чужого листа Мастером. На web режим изолирован по вкладкам через sessionStorage,
// чтобы рядом могли быть открыты вкладка Мастера («Список кампаний» | «Добыча/Торговля»)
// и вкладка Игрока без взаимного перетирания нижней панели в App.js.

import { create } from 'zustand';

export const TAB_UI_MODE_STORAGE_KEY = 'positronium_tab_ui_mode';

export type UiModeValue = 'gm' | 'user';

export const readTabUiModeFromSession = (): UiModeValue | null => {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.sessionStorage?.getItem(TAB_UI_MODE_STORAGE_KEY);
    return val === 'gm' || val === 'user' ? val : null;
  } catch {
    return null;
  }
};

export const writeTabUiModeToSession = (mode: UiModeValue): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(TAB_UI_MODE_STORAGE_KEY, mode);
  } catch {
    // sessionStorage может быть недоступен в приватном режиме.
  }
};

interface UiModeState {
  tabUiMode: UiModeValue | null;
  gmInspectingCharacter: boolean;
  setTabUiMode: (mode: UiModeValue) => void;
  setGmInspectingCharacter: (active: boolean) => void;
}

export const useUiModeStore = create<UiModeState>((set) => ({
  tabUiMode: readTabUiModeFromSession(),
  gmInspectingCharacter: false,
  setTabUiMode: (mode: UiModeValue) => {
    writeTabUiModeToSession(mode);
    set((state) => ({
      tabUiMode: mode,
      gmInspectingCharacter: mode === 'gm' ? state.gmInspectingCharacter : false,
    }));
  },
  setGmInspectingCharacter: (active: boolean) => {
    set({ gmInspectingCharacter: active });
  },
}));

export default useUiModeStore;
