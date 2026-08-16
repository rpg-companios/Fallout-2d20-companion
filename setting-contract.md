# Пакет контракта сеттинга (движок + сеттинг)

> Единый файл для новой реализации сеттингов. Собран 2026-08-16.
> Содержит: контракт, адаптер, менеджер, манифест, аудит.
> Всё, что обсуждалось: движок = математика + UI-кирпичики; сеттинг = пакет;
> загрузка по URL + офлайн; свой сплэш у каждого; разделение после импорта через реестр.

---

## 1. КОНТРАКТ СЕТТИНГА

### 1.1 Идея

Движок — это «математика» (domain/) + универсальные UI-кирпичики
(components/ui/) + ядро загрузки (core/). Сеттинг — упакованный пакет
(manifest + data + i18n + splash + опционально свои экраны), который
подключается к движку через **адаптер**. Движок не знает, откуда данные:
встроенный Fallout, скачанный по URL, офлайн-файл, будущий HoMM 2d20.

### 1.2 Манифест сеттинга (manifest.json)

```json
{
  "id": "fallout",
  "name": "Fallout 2d20",
  "version": "1",
  "requiresCore": ">=1.0",
  "locales": ["ru-RU", "en-EN"],
  "splash": {
    "image": "splash/annihilation.png",
    "backgroundColor": "#050508"
  },
  "data": {
    "weapons": "data/weapons.json",
    "origins": "data/origins.json",
    "traits": "data/traits.json"
  },
  "i18n": {
    "ru-RU": "i18n/ru-RU.json",
    "en-EN": "i18n/en-EN.json"
  },
  "screens": {}
}
```

Поля:
- `id` — уникальный идентификатор (латиница);
- `name` — отображаемое имя;
- `version` — версия пакета;
- `requiresCore` — минимальная версия движка;
- `locales` — поддерживаемые локали;
- `splash` — сплэш-скрин сеттинга (картинка + фон);
- `data` — карта путей к JSON-данным;
- `i18n` — карта путей к переводам по локалям;
- `screens` — опционально: свои экраны/компоненты сеттинга.

### 1.3 Интерфейс адаптера (движок → сеттинг)

```js
class SettingAdapter {
  getManifest()                    // { id, name, version, ... }
  getWeapons()                     // оружие
  getOrigins()                     // ориджины
  getTraits()                      // трейты
  getBodyPlans()                   // планы тела
  getEquipmentKits()               // комплекты
  getChems()                       // химка
  getI18n(locale)                  // переводы
  getSplash()                      // компонент сплэша (null = движковый)
  getScreen(name)                  // опционально: свой экран (null = движковый)
}
```

### 1.4 Универсальные UI-кирпичики (components/ui/)

Переиспользуемые компоненты, из которых сеттинги собирают экраны:
- `StatBox` — ячейка характеристики (название + значение + модификаторы);
- `HealthCounter` — счётчик здоровья;
- `AttributeCell` — ячейка атрибута (STR/AGI/... с +/−);
- `InventorySlot` — ячейка инвентаря;
- `EffectsPanel` — панель эффектов;
- `ProgressBar` — полоса (для сплэша/прочности).

Сеттинг может использовать их или предоставить свои (в `screens`).

### 1.5 Загрузка и хранение

- Встроенный сеттинг (fallout) — всегда доступен (в бандле);
- Скачанный сеттинг — пакет (zip или JSON по URL), хранится офлайн
  (IndexedDB/AsyncStorage/файловая система);
- Активный сеттинг запоминается (AsyncStorage) — при старте грузится последний;
- UI выбора сеттинга — в настройках;
- Поддержка офлайн: пользователь скачал файл на работе → загрузил дома.

---

## 2. АДАПТЕР (core/settingAdapter.js)

```js
// core/settingAdapter.js
// Адаптер сеттинга: движок читает данные ТОЛЬКО через этот интерфейс.
// Движок не знает, откуда данные: встроенный Fallout, скачанный по URL,
// офлайн-файл, будущий HoMM 2d20.
//
// Контракт: docs/architecture/setting-contract.md

import {
  getOrigins,
  getTraits,
  getBodyPlans,
  getOriginI18n,
  getTraitI18n,
  getModuleWeapons,
  getModuleGeneralGoods,
  getModuleEquipmentKits,
  getModuleI18n,
  getUniqQualities,
  getUniqQualityName,
  getEquipmentCatalogForLocale,
} from '../domain/registry';

import manifest from '../modules/fallout/manifest.json';

/**
 * Базовый интерфейс адаптера сеттинга.
 * Каждый сеттинг (встроенный или скачанный) реализует эти методы.
 */
export class SettingAdapter {
  getManifest() { throw new Error('Not implemented'); }
  getWeapons() { throw new Error('Not implemented'); }
  getOrigins() { throw new Error('Not implemented'); }
  getTraits() { throw new Error('Not implemented'); }
  getBodyPlans() { throw new Error('Not implemented'); }
  getEquipmentKits() { throw new Error('Not implemented'); }
  getChems() { throw new Error('Not implemented'); }
  getI18n(locale) { throw new Error('Not implemented'); }
  getSplash() { throw new Error('Not implemented'); }
  getScreen(name) { throw new Error('Not implemented'); }
}

/**
 * Адаптер встроенного сеттинга Fallout.
 * Оборачивает domain/registry — текущий источник данных.
 */
export class FalloutSettingAdapter extends SettingAdapter {
  getManifest() {
    return manifest;
  }

  getWeapons() {
    return getModuleWeapons();
  }

  getOrigins() {
    return getOrigins();
  }

  getTraits() {
    return getTraits();
  }

  getBodyPlans() {
    return getBodyPlans();
  }

  getEquipmentKits() {
    return getModuleEquipmentKits();
  }

  getChems() {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    return catalog?.chems || [];
  }

  getI18n(locale) {
    return {
      origins: getOriginI18n(locale),
      traits: getTraitI18n(locale),
      ...getModuleI18n(locale),
    };
  }

  getUniqQualityName(id, locale) {
    return getUniqQualityName(id, locale);
  }

  getUniqQualities() {
    return getUniqQualities();
  }

  getGeneralGoods() {
    return getModuleGeneralGoods();
  }

  // Сплэш-скрин встроенного сеттинга — пока общий (движковый).
  // Свой (из positronium-boot) подключим на этапе сплэшей.
  getSplash() {
    return null; // null = использовать дефолтный движковый
  }

  getScreen() {
    return null; // null = использовать дефолтные экраны движка
  }
}

// Единственный экземпляр активного адаптера.
// Пока — всегда встроенный Fallout; менеджер сеттинга будет подменять.
let activeAdapter = new FalloutSettingAdapter();

export const getActiveAdapter = () => activeAdapter;

export const setActiveAdapter = (adapter) => {
  if (!adapter) throw new Error('setActiveAdapter: adapter required');
  activeAdapter = adapter;
};
```

---

## 3. МЕНЕДЖЕР (core/settingManager.js)

```js
// core/settingManager.js
// Менеджер сеттингов: список доступных, активный, запоминание выбора.
//
// Пока — базовая версия:
//   - встроенный сеттинг fallout всегда доступен;
//   - активный сеттинг хранится в AsyncStorage ('activeSettingId');
//   - при старте грузится последний выбранный (или fallout по умолчанию).
//
// Позже: регистрация скачанных пакетов (URL/офлайн), распаковка, активация.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FalloutSettingAdapter, setActiveAdapter, getActiveAdapter } from './settingAdapter';

const STORAGE_KEY = 'activeSettingId';

/** Встроенные сеттинги (всегда доступны). */
const BUILTIN_SETTINGS = [
  {
    id: 'fallout',
    name: 'Fallout 2d20',
    version: 1,
    builtin: true,
    adapter: new FalloutSettingAdapter(),
  },
];

/** Список всех доступных сеттингов. */
export const getAvailableSettings = () => [...BUILTIN_SETTINGS];

/** Найти сеттинг по id. */
export const getSettingById = (id) =>
  getAvailableSettings().find((s) => s.id === id) || null;

let activeSettingId = 'fallout';

/** Текущий активный сеттинг. */
export const getActiveSetting = () =>
  getSettingById(activeSettingId) || getSettingById('fallout');

/**
 * Активировать сеттинг: подменяет адаптер движка и запоминает выбор.
 * @param {string} id — id сеттинга
 */
export const activateSetting = async (id) => {
  const setting = getSettingById(id);
  if (!setting) throw new Error(`[settingManager] unknown setting: ${id}`);
  activeSettingId = id;
  setActiveAdapter(setting.adapter);
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return setting;
};

/**
 * Инициализация при старте: восстановить последний выбранный сеттинг.
 * Вызывается до первого рендера экранов (App.js).
 */
export const initSettingManager = async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && getSettingById(saved)) {
      activeSettingId = saved;
      const setting = getSettingById(saved);
      setActiveAdapter(setting.adapter);
    } else {
      activeSettingId = 'fallout';
      setActiveAdapter(getSettingById('fallout').adapter);
    }
  } catch (e) {
    activeSettingId = 'fallout';
    setActiveAdapter(getSettingById('fallout').adapter);
  }
  return getActiveSetting();
};
```

---

## 4. МАНИФЕСТ (пример — Fallout)

```json
{
  "id": "fallout",
  "name": "Fallout 2d20",
  "version": 1,
  "requiresCore": ">=1.0",
  "locales": ["ru-RU", "en-EN"]
}
```

---

## 5. АУДИТ (принципы движок/сеттинг — кратко)

- Модульность данных обязательна: категория = файл, не смешивать; переводы зеркалят данные.
- Модуль — единственный источник данных; merge-слои и фолбэки запрещены.
- БД — только состояние (персонажи/настройки); сейвы обогащаются из файлов и мигрируются.
- Данные динамичны: меняются, обогащаются, влияют друг на друга.
- Настройки — часть сеттинга (settings.json в модуле; значения по модулям).
- Упакованные сеттинги: скоро новый модуль; программа грузит пакеты по выбору пользователя;
  офлайн (скачал → загрузил).
- UI и переводы экранов — в модуль (после данных).
- Следующий шаг: разделение движка и сеттинга ПОСЛЕ импорта через реестр (адаптер).

---

## 6. ДОРОЖНАЯ КАРТА

1. [x] Контракт + адаптер для встроенного Fallout
2. [ ] Перевод движка на чтение через адаптер (180 статических импортов → адаптер)
3. [ ] Загрузка сеттинга по URL (zip/JSON) + офлайн-хранение
4. [x] Запоминание активного сеттинга + автозагрузка (в менеджере)
5. [ ] Сплэш-скрин сеттинга (свой у каждого; positronium-boot как основа)
6. [ ] HoMM 2d20 как отдельный сеттинг