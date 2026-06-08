# Дизайн: Нормализованное хранение параметров через Zustand Store

## Обзор

Разрабатываемое решение — единое нормализованное хранилище состояний (State Store) на основе Zustand для всех игровых параметров персонажа и предметов. Цель — устранить дублирование данных и рассинхронизацию между экранами.

**Ключевые изменения:**
- Все параметры (атрибуты, навыки, предметы, эффекты) хранятся в нормализованном виде как словари ID → параметр
- Каждый параметр имеет структуру `{ base, modifiers[], total }` — базовое значение, массив модификаторов, итоговое значение
- Эффекты (черты, перки, timed-эффекты, моды оружия) добавляют/вычитают значения через модификаторы, а не мутируют базовые данные
- При любом изменении итоговые значения пересчитываются автоматически

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Zustand Store                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │  attributes  │  │   skills     │  │    items     │  │ effects │ │
│  │  (base/mods) │  │  (base/mods) │  │  (normalized)│  │(active) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬───┘ │
│         │                  │                  │                 │     │
│         └──────────────────┴──────────────────┴─────────────────┘     │
│                            │                                          │
│                      ┌─────▼─────┐                                    │
│                      │  Resolvers│ — пересчет итоговых значений       │
│                      └───────────┘                                    │
│                            │                                          │
│       ┌────────────────────┼────────────────────┐                    │
│       │                    │                    │                    │
│  ┌────▼────┐          ┌────▼────┐          ┌────▼────┐               │
│  │ Screen  │          │ Screen  │          │ Screen  │               │
│  │Inventory│          │Weapons  │          │Character│               │
│  └─────────┘          │Armor    │          └─────────┘               │
│                       └─────────┘                                    │
│                                                                      │
│  Каждый экран получает данные через селекторы Zustand               │
│  и подписывается только на нужные параметры                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Компоненты и интерфейсы

### 1. Zustand Store (src/store/characterStore.js)

```javascript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Типы параметров
// Attribute: { id, base, modifiers: [{source, value, operation}], total }
// Skill: { id, base, modifiers: [{source, value, operation}], total }
// Item: { id, name, itemType, equipped, damage: {base, modifiers, total}, ... }
// Effect: { id, name, type, active, parameters: [{paramId, value, operation}] }

const useCharacterStore = create(devtools(
  persist(
    (set, get) => ({
      // Нормализованные словари
      attributes: {},
      skills: {},
      items: {},
      effects: {},
      
      // Статусы (не часть сохранения)
      isEffectsProcessing: false,
      
      // --- Actions: Attributes ---
      updateAttribute: (attrId, delta) => {
        const attributes = { ...get().attributes };
        if (!attributes[attrId]) return;
        
        attributes[attrId].base = attributes[attrId].base + delta;
        attributes[attrId].total = recalculateTotal(attributes[attrId]);
        
        set({ attributes });
        triggerDependentCalculations();
      },
      
      addAttributeModifier: (attrId, source, value, operation = '+') => {
        const attributes = { ...get().attributes };
        if (!attributes[attrId]) return;
        
        attributes[attrId].modifiers.push({ source, value, operation });
        attributes[attrId].total = recalculateTotal(attributes[attrId]);
        
        set({ attributes });
        triggerDependentCalculations();
      },
      
      removeAttributeModifier: (attrId, source) => {
        const attributes = { ...get().attributes };
        if (!attributes[attrId]) return;
        
        attributes[attrId].modifiers = 
          attributes[attrId].modifiers.filter(m => m.source !== source);
        attributes[attrId].total = recalculateTotal(attributes[attrId]);
        
        set({ attributes });
        triggerDependentCalculations();
      },
      
      // --- Actions: Items ---
      updateItem: (itemId, patch) => {
        const items = { ...get().items };
        if (!items[itemId]) return;
        
        items[itemId] = { ...items[itemId], ...patch };
        items[itemId] = normalizeItemParameters(items[itemId]);
        
        set({ items });
        triggerDependentCalculations();
      },
      
      equipItem: (itemId) => {
        const items = { ...get().items };
        if (!items[itemId]) return;
        
        items[itemId].equipped = true;
        
        set({ items });
        triggerDependentCalculations();
      },
      
      unequipItem: (itemId) => {
        const items = { ...get().items };
        if (!items[itemId]) return;
        
        items[itemId].equipped = false;
        
        set({ items });
        triggerDependentCalculations();
      },
      
      // --- Actions: Effects ---
      addEffect: (effect) => {
        const effects = { ...get().effects };
        const effectId = effect.id || generateId();
        
        effects[effectId] = { ...effect, id: effectId, active: true };
        
        set({ effects });
        triggerDependentCalculations();
      },
      
      expireEffect: (effectId) => {
        const effects = { ...get().effects };
        if (!effects[effectId]) return;
        
        effects[effectId].active = false;
        
        set({ effects });
        triggerDependentCalculations();
      },
      
      // --- Helper: Resolvers ---
      recalculateAll: () => {
        // Пересчет всех итоговых значений
        // 1. Attributes: base + Σ(modifiers)
        // 2. Skills: base + Σ(modifiers)
        // 3. Items: пересчет всех параметров (damage, fireRate, etc.)
        // 4. Derived stats: carryWeight, initiative, defense, maxHp, etc.
      },
      
      // --- Persistence ---
      persistState: () => {
        // Конвертация нормализованного состояния в формат для сохранения
        // в localStorage/DB (массивы attributes, skills, equipment.items, etc.)
      },
    }),
    {
      name: 'character-store',
      partialize: (state) => ({
        attributes: state.attributes,
        skills: state.skills,
        items: state.items,
        effects: state.effects,
      }),
    }
  )
));
```

### 2. Resolvers (src/store/resolvers.js)

Сервисы для пересчета итоговых значений на основе базовых параметров и модификаторов.

```javascript
// src/store/resolvers.js

// --- Attribute Resolvers ---
export const calculateAttributeTotal = (attribute) => {
  if (!attribute) return 0;
  
  const { base, modifiers = [] } = attribute;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// --- Skill Resolvers ---
export const calculateSkillTotal = (skill) => {
  if (!skill) return 0;
  
  const { base, modifiers = [] } = skill;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// --- Item Resolvers ---
export const calculateItemParameterTotal = (parameter) => {
  if (!parameter) return 0;
  
  const { base, modifiers = [] } = parameter;
  return modifiers.reduce((total, mod) => {
    const value = Number(mod.value) || 0;
    return mod.operation === '+' ? total + value : total - value;
  }, base);
};

// Пример применения к предмету
export const normalizeItemParameters = (item) => {
  if (!item) return item;
  
  const normalized = { ...item };
  
  // Пересчет параметров оружия
  if (normalized.damage) {
    normalized.damage.total = calculateItemParameterTotal(normalized.damage);
  }
  
  if (normalized.fireRate) {
    normalized.fireRate.total = calculateItemParameterTotal(normalized.fireRate);
  }
  
  // Пересчет защиты брони
  if (normalized.physicalDamageRating) {
    normalized.physicalDamageRating.total = calculateItemParameterTotal(
      normalized.physicalDamageRating
    );
  }
  
  if (normalized.energyDamageRating) {
    normalized.energyDamageRating.total = calculateItemParameterTotal(
      normalized.energyDamageRating
    );
  }
  
  if (normalized.radiationDamageRating) {
    normalized.radiationDamageRating.total = calculateItemParameterTotal(
      normalized.radiationDamageRating
    );
  }
  
  return normalized;
};
```

### 3. Derived Stats Calculator (src/store/derivedStats.js)

Расчет производных параметров на основе базовых атрибутов.

```javascript
// src/store/derivedStats.js

import { getAttributeValue } from '../domain/characterCreation';

// Derived stats calculated from attributes + effects
export const calculateDerivedStats = (attributes, effects, trait) => {
  const stats = {
    maxHealth: { base: 0, modifiers: [], total: 0 },
    initiative: { base: 0, modifiers: [], total: 0 },
    defense: { base: 0, modifiers: [], total: 0 },
    meleeBonus: { base: 0, modifiers: [], total: 0 },
    carryWeight: { base: 0, modifiers: [], total: 0 },
  };
  
  // Max HP: END + LCK + level
  const endurance = getAttributeValue(attributes, 'END');
  const luck = getAttributeValue(attributes, 'LCK');
  
  stats.maxHealth.base = endurance + luck + (level || 1);
  
  // Timed effects: getTimedMaxHpBonus
  const hpBonus = getTimedMaxHpBonus(effects);
  if (hpBonus !== 0) {
    stats.maxHealth.modifiers.push({
      source: 'timedEffect',
      value: hpBonus,
      operation: '+',
    });
  }
  
  stats.maxHealth.total = calculateAttributeTotal(stats.maxHealth);
  
  // Initiative: PER + AGI
  const perception = getAttributeValue(attributes, 'PER');
  const agility = getAttributeValue(attributes, 'AGI');
  
  stats.initiative.base = perception + agility;
  stats.initiative.total = calculateAttributeTotal(stats.initiative);
  
  // Defense: AGI >= 9 ? 2 : 1
  stats.defense.base = agility >= 9 ? 2 : 1;
  stats.defense.total = calculateAttributeTotal(stats.defense);
  
  // Melee Bonus: STR-based
  stats.meleeBonus.base = calculateMeleeBonusValue(attributes, trait);
  stats.meleeBonus.total = calculateAttributeTotal(stats.meleeBonus);
  
  // Carry Weight: STR-based + trait + equipment
  stats.carryWeight.base = 150;
  // ... (расчеты аналогично calculateCarryWeight)
  
  return stats;
};

// Helper для применения эффектов
export const applyEffectToStats = (stats, effect) => {
  const updatedStats = { ...stats };
  
  if (effect.maxHpModifier) {
    const mod = effect.maxHpModifier;
    updatedStats.maxHealth.modifiers.push({
      source: effect.id,
      value: Number(mod.value) || 0,
      operation: mod.op || '+',
    });
  }
  
  if (effect.damageResistanceModifier) {
    // Применение к stats.damageResistance[type]
    for (const [type, mod] of Object.entries(effect.damageResistanceModifier)) {
      const existing = updatedStats.damageResistance?.[type];
      if (existing) {
        existing.modifiers.push({
          source: effect.id,
          value: Number(mod.value) || 0,
          operation: mod.op || '+',
        });
      }
    }
  }
  
  return updatedStats;
};
```

---

## Данные

### Модель данных (нормализованная)

```typescript
// src/types/characterStore.ts

type Parameter<T = number> = {
  base: T;
  modifiers: ParameterModifier[];
  total: T;
};

type ParameterModifier = {
  source: string;        // ID источника (перк, эффект, мод)
  value: number;
  operation: '+' | '-';  // Операция: прибавление или вычитание
  priority?: number;     // Приоритет применения (для порядка)
};

type Attribute = {
  id: string;            // Например: 'STR', 'END', 'PER', 'AGI', 'INT', 'CHA', 'LCK'
  base: number;
  modifiers: ParameterModifier[];
  total: number;
};

type Skill = {
  id: string;            // Например: 'SMALL_GUNS', 'MEDICINE', 'ATHLETICS'
  base: number;
  modifiers: ParameterModifier[];
  total: number;
};

type ItemParameter = Parameter<number> | Parameter<string>;

type Item = {
  id: string;            // Уникальный ID экземпляра (например: 'weapon-instance-xxx')
  
  // Базовые поля (копируются из catalog)
  name: string;
  itemType: string;      // 'weapon', 'armor', 'clothing', 'chem', etc.
  
  // Состояние
  equipped: boolean;
  stackKey?: string;     // Для стекирования
  quantity?: number;
  
  // Параметры оружия
  weaponId?: string;
  damage?: ItemParameter;
  fireRate?: ItemParameter;
  range?: ItemParameter;
  qualities?: string;
  
  // Параметры брони
  protectedAreas?: string[];
  physicalDamageRating?: ItemParameter;
  energyDamageRating?: ItemParameter;
  radiationDamageRating?: ItemParameter;
  
  // Моды
  appliedMods?: Record<string, string>;  // modId -> slot
};

type Effect = {
  id: string;
  name: string;
  type: 'positive' | 'negative';
  active: boolean;
  
  // Параметры, которые изменяет эффект
  parameters: {
    paramId: string;     // ID параметра (например: 'STR', 'maxHealth', 'damage')
    value: number;
    operation: '+' | '-';
  }[];
  
  // Timed effect fields
  createdAt?: number;
  expiresAt?: number;
  durationMs?: number;
  scenesLeft?: number;
  sourceName?: string;
};
```

---

## Ошибки и обработка ошибок

### Потенциальные ошибки:

1. **Несуществующий ID параметра**
   - Решение: Валидация в каждом action — проверка существования ID перед обновлением
   - Логирование: console.warn с указанием ID и действия

2. **Циклическая зависимость**
   - Решение: Ограничение глубины рекурсии при пересчете (например, maxDepth = 10)
   - Логирование: console.error с указанием цикла

3. **Некорректный формат модификатора**
   - Решение: Валидация при добавлении модификатора (проверка type, value, operation)
   - Логирование: console.warn с указанием модификатора

4. **Race condition при параллельных обновлениях**
   - Решение: Zustand использует неизменяемые объекты, каждый set() создает новую копию
   - Дополнительно: Использование immer для сложных обновлений

### Логирование:

```javascript
// src/store/errorHandler.js

export const logParameterUpdate = (action, paramId, oldState, newState) => {
  console.log(`[ParameterUpdate] ${action}`, {
    paramId,
    oldState,
    newState,
    timestamp: Date.now(),
  });
};

export const logError = (error, context) => {
  console.error(`[ParameterStoreError] ${context}`, error);
};
```

---

## Стратегия тестирования

### Unit тесты (jest):

1. **Resolvers**
   - `calculateAttributeTotal` — базовые расчеты, пустые модификаторы, отрицательные значения
   - `calculateItemParameterTotal` — аналогично для параметров предметов
   - `normalizeItemParameters` — корректная обработка всех типов параметров

2. **Actions**
   - `updateAttribute` — изменение base, проверка total
   - `addAttributeModifier` — добавление, проверка total
   - `removeAttributeModifier` — удаление, проверка total
   - `equipItem` — изменение `equipped`, проверка total

3. **Derived Stats**
   - `calculateDerivedStats` — проверка всех зависимых параметров
   - `applyEffectToStats` — применение эффектов

### Интеграционные тесты:

1. **Полный поток обновления**
   - Применение перка → изменение атрибута → пересчет зависимых параметров
   - Эффект истекает → уменьшение параметров → обновление экранов

2. **Миграция**
   - Загрузка старого формата данных → нормализация → корректный пересчет
   - Сохранение нормализованного состояния → конвертация в старый формат

### Ручное тестирование:

1. **Экран персонажа**
   - Экипировка/снятие предмета → изменение параметров
   - Применение перка → изменение атрибутов

2. **Экран инвентаря**
   - Фильтрация предметов по состоянию (equipped)
   - Обновление при изменении предмета в другом экране

3. **Экран оружия**
   - Модификация оружия → изменение параметров (damage, fireRate)
   - Отображение в экране инвентаря

---

## Миграция на новую модель

### Поэтапный план миграции:

1. **Фаза 1: Создание Zustand Store и маппинг**
   - Создать `characterStore.js` с нормализованными словарями
   - Добавить функции маппинга: `normalizeCharacterState` / `denormalizeCharacterState`
   - Интегрировать в `CharacterContext` без изменения текущих `useState`

2. **Фаза 2: Постепенный перенос логики**
   - Создать новые action-функции: `updateAttribute`, `equipItem`, `applyEffect`
   - Обновить `CharacterContext` для вызова action-функций вместо `setState`
   - Добавить предупреждения в консоль для старых API (deprecated)

3. **Фаза 3: Миграция экранов**
   - Обновить `InventoryScreen` для получения предметов из Zustand Store
   - Обновить `WeaponsAndArmorScreen` для получения оружия и брони
   - Обновить `CharacterScreen` для получения атрибутов и навыков

4. **Фаза 4: Удаление старого кода**
   - Удалить `setAttributes`, `setEquippedWeapons`, `modifiedItems` из `CharacterContext`
   - Удалить старые компоненты (если есть)

### Миграция данных при загрузке:

```javascript
// src/store/migration.js

const MIGRATION_VERSION = 1;

export const normalizeCharacterState = (data) => {
  // Attributes: [{name: 'STR', value: 5}] → {STR: {base: 5, modifiers: [], total: 5}}
  const attributes = {};
  (data.attributes || []).forEach(attr => {
    const id = getCanonicalAttributeKey(attr.name);
    if (id) {
      attributes[id] = {
        base: attr.value,
        modifiers: [],
        total: attr.value,
      };
    }
  });
  
  // Skills: [{name: 'SMALL_GUNS', value: 3}] → {SMALL_GUNS: {base: 3, modifiers: []}}
  const skills = {};
  (data.skills || []).forEach(skill => {
    skills[skill.name] = {
      base: skill.value,
      modifiers: [],
      total: skill.value,
    };
  });
  
  // Items: массив из equipment.items + equippedWeapons
  const items = {};
  const allItems = [...(data.equipment?.items || []), ...(data.equippedWeapons || [])];
  allItems.forEach(item => {
    const id = item.uniqueId || item.weaponId || item.code;
    if (id) {
      items[id] = normalizeItem(item);
    }
  });
  
  // Effects: activeTimedEffects → нормализованный словарь
  const effects = {};
  (data.activeTimedEffects || []).forEach(effect => {
    effects[effect.id] = normalizeEffect(effect);
  });
  
  return {
    attributes,
    skills,
    items,
    effects,
    version: MIGRATION_VERSION,
  };
};

export const denormalizeCharacterState = (storeState) => {
  // Конвертация нормализованного состояния в формат для сохранения
  const attributes = Object.entries(storeState.attributes).map(([id, attr]) => ({
    name: id,
    value: attr.base,
  }));
  
  const skills = Object.entries(storeState.skills).map(([id, skill]) => ({
    name: id,
    value: skill.base,
  }));
  
  const equipment = {
    items: Object.values(storeState.items).filter(item => !item.equipped),
  };
  
  const equippedWeapons = Object.values(storeState.items)
    .filter(item => item.equipped && item.itemType === 'weapon')
    .map(item => ({
      ...item,
      uniqueId: item.id,
      weaponId: item.weaponId || item.id,
    }));
  
  const activeTimedEffects = Object.values(storeState.effects)
    .filter(effect => effect.active)
    .map(effect => ({
      id: effect.id,
      effectName: effect.name,
      effectLabel: effect.name,
      effectKind: effect.type,
      scenesLeft: effect.scenesLeft || 0,
    }));
  
  return {
    attributes,
    skills,
    equipment,
    equippedWeapons,
    activeTimedEffects,
  };
};
```