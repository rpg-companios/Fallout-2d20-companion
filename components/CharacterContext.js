import { debugLog } from '../src/debug/falloutDebug';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import useCharacterStore from '../src/store/characterStore';
import { selectLegacyAttributes, selectLegacySkills } from '../src/store/selectors';
import { createStateExtensionFields } from '../src/store/stateExtensions';

// История: до Шага 8 этот файл был «раздатчиком» всего состояния персонажа
// (40+ полей через useCharacter()). Миграция Шаги 1–8б (патчи 219–242)
// расселила данные по слайсам characterStore, сохранения — в
// src/saves/characterSaves.js, оркестраторы — в orchestratorsSlice.
// Остались два React-эффекта:
//   1) пуш экипировки в derived-пересчёт стора (пересчёт — очередь микрозадач,
//      см. историю патча 218: стор-действия нельзя звать из рендера);
//   2) фабрика полей сеттинговых расширений при выборе ориджина (патч 207).
// Экраны читают стор напрямую (useCharacterStore), сейвы — модуль
// src/saves/characterSaves.js. Фасад useCharacter() пуст и остался только
// чтобы напоминать о себе в истории; демонтируется Шагом 8в.

const PA_CORE_TICK_MS = 1000;

export const CharacterProvider = ({ children }) => {
  // Подписки для derived-пуша (2) и фабрики расширений (1).
  const attributes = useCharacterStore((s) => s.attributes);
  const legacyAttributes = useMemo(
    () => selectLegacyAttributes({ attributes }),
    [attributes],
  );
  const level = useCharacterStore((s) => s.level);
  const origin = useCharacterStore((s) => s.origin);
  const trait = useCharacterStore((s) => s.trait);
  const equippedArmor = useCharacterStore((s) => s.equippedArmor);
  const equippedPowerArmor = useCharacterStore((s) => s.equippedPowerArmor);
  const robotSlots = useCharacterStore((s) => s.robot?.slots ?? null);
  const stateExtensions = useCharacterStore((s) => s.stateExtensions);

  // Новый персонаж: как только выбран ориджин — сеттинговые фабрики
  // заполняют ещё не созданные поля (null = «не создано»). При загрузке
  // сейва поля заданы миграцией/гидратацией — эффект их не трогает.
  useEffect(() => {
    if (!origin) return;
    const created = createStateExtensionFields({ origin, trait });
    let changed = false;
    const merged = { ...stateExtensions };
    for (const [fieldKey, value] of Object.entries(created)) {
      if (merged[fieldKey] === undefined || merged[fieldKey] === null) {
        if (merged[fieldKey] === value) continue; // null → null: менять нечего
        merged[fieldKey] = value;
        changed = true;
      }
    }
    if (changed) useCharacterStore.getState().setStateExtensions(merged);
  }, [origin, trait, stateExtensions]);

  // Derived-пуш: прокидываем производственные данные экипировки → пересчёт
  // derivedStats. Шаг 7: trait/level/origin не зеркалируются — стор читает их
  // сам; isRobot считается внутри recalculateDerivedStats. Микротаск выводит
  // стор-действие за пределы commit-фазы (патч 218: «Cannot update a
  // component while rendering a different component»).
  useEffect(() => {
    queueMicrotask(() => {
      useCharacterStore.getState().setCharacterContext({
        equipmentState: {
          equippedArmor,
          equippedRobotSlots: robotSlots,
          powerArmorFrameId: equippedPowerArmor?.frame ? equippedPowerArmor.frame.catalogId : null,
        },
      });
    });
  }, [legacyAttributes, trait, level, origin, equippedArmor, robotSlots, equippedPowerArmor]);

  // Таймер расхода блока силовой брони (§5.3/§5.4): тикает только пока
  // приложение открыто; состояние — в powerArmorSlice (Шаг 4 миграции).
  useEffect(() => {
    const interval = setInterval(() => {
      useCharacterStore.getState().tickPowerArmorCore(PA_CORE_TICK_MS);
    }, PA_CORE_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Фасад пуст: все поля переехали в стор/модули (см. историю выше).
  const value = {};

  return (
    <CharacterContext.Provider value={value}>
      {children}
    </CharacterContext.Provider>
  );
};

export const useCharacter = () => {
  return useContext(CharacterContext);
};

// --- Wrapper Hooks for Zustand Store (Task 4.1) ---

/**
 * Hook to access character attributes through Zustand Store
 * @param {string} attrId - Attribute ID (e.g., 'STR', 'END', 'PER')
 * @returns {Object} Attribute with base, modifiers, and total
 */
export const useCharacterAttribute = (attrId) => {
  const attribute = useCharacterStore((state) => state.attributes[attrId]);

  // Warn if attribute doesn't exist (should be created on load)
  if (!attribute) {
    debugLog('store.attrNotFound', { attrId, where: 'useCharacterAttribute' });
  }

  return attribute;
};

/**
 * Hook to access character items through Zustand Store
 * @param {string} itemId - Item ID
 * @returns {Object} Item object with all parameters
 */
export const useCharacterItem = (itemId) => {
  const item = useCharacterStore((state) => state.items[itemId]);

  // Warn if item doesn't exist
  if (!item) {
    debugLog('store.itemNotFound', { itemId, where: 'useCharacterItem' });
  }

  return item;
};

/**
 * Hook to access active effects through Zustand Store
 * @param {string} effectId - Effect ID
 * @returns {Object} Effect object with parameters
 */
export const useCharacterEffect = (effectId) => {
  const effect = useCharacterStore((state) => state.effects[effectId]);

  // Warn if effect doesn't exist
  if (!effect) {
    debugLog('store.effectNotFound', { effectId, where: 'useCharacterEffect' });
  }

  return effect;
};

/**
 * Hook to get all attributes from Zustand Store
 * @returns {Object} Dictionary of all attributes
 */
export const useCharacterAttributes = () => {
  return useCharacterStore((state) => state.attributes);
};

/**
 * Hook to get all items from Zustand Store
 * @returns {Object} Dictionary of all items
 */
export const useCharacterItems = () => {
  return useCharacterStore((state) => state.items);
};

/**
 * Hook to get all active effects from Zustand Store
 * @returns {Object} Dictionary of all active effects
 */
export const useCharacterEffects = () => {
  return useCharacterStore((state) => state.effects);
};

// ── Robot selectors (read-only) — экраны читают робо-состояние из стора ──────
// Используйте эти хуки вместо чтения equippedRobotSlots/Modules из useCharacter(),
// чтобы UI реактивно обновлялся из единого источника правды и не мутировал данные.

/** Все слоты робота { [slotKey]: SlotData }. */
export const useRobotSlots = () => {
  return useCharacterStore((state) => state.robot?.slots || {});
};

/** Установленные модули робота. */
export const useRobotModules = () => {
  return useCharacterStore((state) => state.robot?.modules || []);
};

/** Текущий body plan робота (e.g. 'protectron'). */
export const useRobotBodyPlan = () => {
  return useCharacterStore((state) => state.robot?.bodyPlan ?? null);
};
