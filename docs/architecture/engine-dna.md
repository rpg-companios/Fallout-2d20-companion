# Positronium: DNA движка и сеттингов

**Статус:** обязательный архитектурный контракт проекта  
**Дата:** 2026-09-08  
**Владелец решения:** проект Positronium  
**Связанные документы:** `setting-contract.md`, `docs/architecture/setting-pack.md`,
`docs/architecture/save-migrations.md`, `docs/architecture/save-slimming.md`

Этот документ отвечает на вопрос: **что это за приложение, где проходит граница
между движком и сеттингом и как продолжать разработку без размножения логики**.

Он написан в том числе для AI-агентов. Перед любым архитектурным изменением
агент обязан прочитать этот документ и `replit.md`. Если текущий код противоречит
этому документу, не следует молча переписывать весь проект: сначала нужно
зафиксировать конкретную границу, сохранить текущее поведение тестами и менять
систему небольшим вертикальным срезом.

---

## 1. Что строится

Positronium — это не только приложение для Fallout 2d20.

Долгосрочная цель — **универсальный движок для менеджеров персонажей TTRPG**,
который запускается без зашитого Fallout и подключает Fallout 2d20 как один из
сеттинговых модулей.

Сейчас приложение выросло из Fallout-приложения, поэтому границы неполные:

- часть универсальной логики уже находится в `domain/`;
- часть движка находится в `src/store/`, `db/`, `components/`;
- Fallout-данные и несколько экранов уже находятся в `modules/fallout/`;
- некоторые «универсальные» файлы всё ещё напрямую импортируют Fallout;
- адаптер активного сеттинга пока не завершён;
- package loader для `.trpg` пока не является рабочей runtime-дверью.

**Цель не состоит в одномоментном переписывании.**

Цель состоит в том, чтобы постепенно установить направление зависимостей:

```text
engine/core  ←  setting adapter  ←  modules/fallout
```

Движок не знает Fallout. Fallout может использовать движок.

---

## 2. Архитектурная модель

```text
┌────────────────────────────────────────────────────────────┐
│ UI                                                        │
│ engine screens: manager, inventory                       │
│ setting screens: Fallout character/equipment/perks        │
└──────────────────────────────┬─────────────────────────────┘
                               │ вызывает actions/queries
┌──────────────────────────────▼─────────────────────────────┐
│ ENGINE                                                     │
│ TS contracts, catalog API, actions, events, state, saves,  │
│ migrations, generic inventory/equipment primitives,       │
│ setting extension registry, reusable UI bricks             │
└──────────────────────────────┬─────────────────────────────┘
                               │ active setting adapter
┌──────────────────────────────▼─────────────────────────────┐
│ SETTING ADAPTER                                             │
│ manifest, catalog, i18n, settings, screens, rules,         │
│ state extensions, action handlers                           │
└──────────────────────────────┬─────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────┐
│ modules/fallout                                            │
│ Fallout data, Fallout rules, Fallout screens, Fallout UI,   │
│ survival, perks, origins, robots, power armor               │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Движок

В движок можно выносить только то, что имеет смысл без Fallout:

- жизненный цикл персонажа;
- менеджер персонажей;
- инвентарь и состояние экземпляров предметов;
- поиск и обогащение предметов через абстрактный каталог;
- количество, вес, экипировка, блокировка, stack state;
- generic actions и события;
- сохранения и миграции общего формата;
- registry расширений состояния;
- настройки, локали и загрузка активного сеттинга;
- общие экраны и UI-примитивы;
- generic schema для «кирпичей» персонажа;
- тестируемые pure functions.

Движок **не должен** знать:

- радиацию Fallout;
- зависимости и аддикции;
- перки и origins Fallout;
- power armor;
- роботов и их слоты;
- Fallout survival;
- caps как конкретную валюту;
- Fallout weapon mods и качества;
- названия, тексты и IDs, существующие только в Fallout.

### 2.2 Сеттинг

В модуле сеттинга остаётся всё, что определяет правила конкретной игры:

- каталоги;
- data JSON;
- локализация;
- origins, perks, traits;
- weapons, armor, mods;
- survival;
- disease/addiction/radiation;
- robot rules;
- power armor;
- специфичные действия;
- специфичные экраны и модалки;
- начальные значения и character creation;
- расширения состояния и их миграции.

### 2.3 Адаптер

Адаптер — единственная дверь, через которую движок получает активный сеттинг.

Сначала адаптер может быть простым и возвращать данные из текущих статических
импортов Fallout. Это всё равно полезно: прямые импорты будут постепенно
заменяться одним контрактом без изменения поведения.

В будущем этот же контракт будет обслуживать установленный `.trpg`-пакет.

Адаптер должен предоставлять концептуально:

```ts
interface SettingAdapter {
  manifest: SettingManifest;
  catalog: Catalog;
  locale: SettingLocaleAdapter;
  settings: SettingSettingsAdapter;
  screens: SettingScreenDefinition[];
  rules: SettingRules;
  extensions: SettingExtension[];
}
```

Точные типы могут развиваться. Важно направление зависимости и отсутствие
fallback на Fallout внутри движка.

---

## 3. Правила зависимостей

### Разрешено

```text
engine → только engine
setting adapter → engine contracts
modules/fallout → engine + собственные данные/правила
setting screens → adapter/actions/queries
```

### Запрещено

```text
engine/domain → modules/fallout/...
engine/store → импорт Fallout JSON
generic modal → Fallout rule
InventoryScreen → самостоятельная реализация consumable rules
EquipmentScreen → вторая самостоятельная реализация consumable rules
DB → отдельная копия каталога
```

В переходный период старые нарушения можно оставлять, если их исправление
опасно. Но при каждом новом изменении нельзя добавлять ещё один прямой импорт
Fallout в движковый код.

---

## 4. Уникальные источники правды

Главная архитектурная цель — не допустить, чтобы одна и та же сущность
считалась по-разному в разных экранах.

### 4.1 Версия сохранения

Источник правды: `src/store/saveSchema.js` (в будущем `.ts`).

Правила:

- версия формата определяется одной константой;
- любое изменение формата получает новую миграцию;
- загрузка не должна содержать случайные локальные fallback-преобразования;
- `migrateCharacterState` — единая точка преобразования старых сейвов;
- после миграции runtime работает только с современным форматом;
- следующий save пишет текущий формат;
- неизвестный будущий формат нельзя молча считать старым.

Legacy-формы должны жить только:

1. на входе мигратора;
2. внутри конкретных миграций;
3. в тестовых fixtures старых версий.

Legacy не должен распространяться по UI, store и современным domain-функциям.

### 4.2 Каталог

Источник правды: данные активного сеттинга, сейчас — JSON Fallout в
`modules/fallout/data/**` и локализованные данные.

DB — не источник каталожной истины. DB является хранилищем/проекцией для
совместимости.

Все потребители должны проходить через один каталоговый API. В текущей
архитектуре ближайшая существующая точка — `getEquipmentCatalog()` и
`domain/resolveItem.js`; в будущем они должны быть доступны через адаптер.

Нельзя:

- копировать один и тот же каталог в новый store;
- искать предмет одним способом в Inventory и другим в Equipment;
- добавлять второй `findById` с отличающимися правилами;
- подставлять каталог Fallout, если активен другой сеттинг;
- использовать пустой fallback, если пакет объявил отсутствующий файл.

### 4.3 Экземпляр предмета

Каталог описывает тип предмета. Store/save описывает состояние конкретного
экземпляра.

В экземпляре хранятся только mutable/runtime-поля, например:

- `id`;
- `itemType`;
- `quantity`;
- `equipped`;
- `locked`;
- `appliedMods`;
- `stackKey`;
- `charges`;
- `hpCurrent`;
- `durability`;
- `uniqueId`;
- состояние слота.

Имя, вес, цена, базовые эффекты и базовые характеристики должны приходить из
каталога. Производные характеристики вычисляются единым resolver-конвейером.

Если старый save содержит «толстый» предмет, миграция/restore может его прочитать,
но новые сохранения должны переходить к принятому современному формату.

### 4.4 Игровые действия

UI не является источником правил.

Каждое игровое действие должно иметь одну реализацию:

```text
command → engine action → setting rule/extension → state patch + events → report
```

Примеры действий:

- `consumeItem`;
- `equipItem`;
- `unequipItem`;
- `applyWeaponMod`;
- `repairItem`;
- `buyItem`;
- `sellItem`;
- `advanceScene`;
- `applyDamage`.

Компонент может показывать preview и confirmation, но не должен сам повторять
правила действия.

### 4.5 Состояние персонажа

Основное runtime-состояние персонажа имеет одного владельца. React Context,
Zustand и DB не должны конкурировать как три независимые модели.

Переходная архитектура допускает Context + Zustand, но для каждого поля должно
быть явно понятно:

- где оно является canonical state;
- кто его изменяет;
- как оно сериализуется;
- как оно восстанавливается;
- кто имеет право его расширять.

### 4.6 Настройки

Настройка хранится по стабильному `settingId` и имени настройки, а не по
позиции UI или тексту перевода.

Настройки движка и настройки сеттинга должны быть различимы:

```text
engine settings:
  theme, locale, UI preferences

setting settings:
  survival enabled, durability rules, weapon display mode
```

UI читает настройки через общий settings API, а не через прямой импорт JSON
из другого экрана.

---

## 5. Единый поток игрового действия: расходник

Расходник — первый обязательный вертикальный срез для проверки архитектуры,
потому что его могут запускать разные UI-точки:

- Inventory;
- модалка на Equipment;
- будущий быстрый action;
- внешний импорт/automation path.

В текущем коде `InventoryScreen` и `SurvivalConsumeModal` уже используют общий
`applyConsumableFull` из `CharacterContext`. Это нужно сохранить как
поведенческий шов, а не создавать новый параллельный механизм.

### Целевой поток

```text
Inventory / Equipment modal
        │
        │ ConsumeItemCommand
        ▼
engine consume action
        │
        ├── generic inventory quantity/state change
        ├── generic effects result
        ├── Fallout consumable rules
        ├── Fallout state extension listeners
        └── events/report
        │
        ▼
one state update + one save path
```

### Роль модалки

Модалка может:

- показать доступные предметы;
- показать preview;
- запросить подтверждение;
- показать результат.

Модалка не может:

- самостоятельно списывать количество;
- самостоятельно менять здоровье;
- самостоятельно считать радиацию;
- самостоятельно обновлять survival;
- отдельно применять addiction/disease;
- иметь собственную альтернативную ветку для того же действия.

### Роль Fallout

Fallout предоставляет правила и слушатели:

- что является food/drink/chem;
- как применяются radiation rolls;
- какие perks дают immunity;
- как считается addiction;
- как изменяются survival scales;
- какие болезни или условия добавляются.

Движок вызывает расширения, но не знает их содержимое. Текущий
`stateExtensions.js` является важным предшественником этого механизма и должен
развиваться в сторону типизированного engine registry.

---

## 6. Сохранения и расширения сеттинга

Общий save envelope должен принадлежать движку и включать как минимум:

```ts
type SaveEnvelope = {
  schemaVersion: number;
  settingId: string;
  settingVersion?: number;
  character: unknown;
  extensions?: Record<string, unknown>;
};
```

Это концептуальная форма. Нельзя менять существующий физический формат только
ради красивого типа без отдельной миграции и обратной совместимости.

Сеттинг может зарегистрировать:

- initial state factory;
- state field owner;
- hydrate function;
- reset function;
- migration step;
- action listener;
- serializer/deserializer extension.

Правила:

- одно поле принадлежит одному extension owner;
- повторная регистрация — ошибка;
- сеттинговая миграция регистрируется через механизм расширений;
- `hydrate` не заменяет миграцию версии;
- migration должна быть идемпотентной там, где это предусмотрено контрактом;
- ошибка расширения не должна молча терять данные.

---

## 7. TypeScript-стратегия

TypeScript вводится как язык движка и новых контрактов, а не как повод
переписать весь работающий Fallout-код.

### 7.1 Что писать на TypeScript

Новые универсальные файлы должны быть TS/TSX:

```text
src/engine/catalog/
src/engine/actions/
src/engine/events/
src/engine/save/
src/engine/settings/
src/engine/extensions/
```

Приоритет имеют:

1. контракты адаптера;
2. типы catalog/instance/state;
3. command/result/event contracts;
4. registry расширений;
5. чистые engine actions;
6. generic screens и hooks.

### 7.2 Что не переписывать автоматически

Не нужно массово переименовывать:

- `CharacterContext.js`;
- `characterStore.js`;
- `migrations.js`;
- большие Fallout screens;
- DB adapters;
- весь `domain/`;
- все модалки только ради расширения файлов.

Старый JS может оставаться реализацией за TS-контрактом. Это нормальный
переходный этап.

### 7.3 Типовая граница legacy

```ts
function migrateCharacterState(input: unknown): CurrentCharacterSave {
  // legacy parsing and version-specific conversion live here
}
```

После выхода из мигратора типы должны быть современными. Не надо загрязнять
современные engine actions типами всех исторических форм сохранения.

### 7.4 Запрет на «типизацию ради any»

Нельзя создавать огромные интерфейсы, заполненные `any`, только чтобы формально
получить расширение `.ts`.

В переходной зоне допустимы:

- `unknown` на внешнем входе;
- узкие type guards;
- локальные legacy-типы;
- адаптеры с явным преобразованием;
- `TODO` на отдельное расширение контракта.

`any` должен быть исключением с комментарием, а не архитектурным слоем.

---

## 8. Практическая дорожная карта

### Фаза 0. Зафиксировать поведение

Перед переносом границы добавить тесты на существующие сценарии:

- расходник из Inventory;
- расходник из Equipment modal;
- списание quantity;
- health/effects/radiation;
- survival extension;
- save/reload после действия.

Тесты должны проверять состояние и результат, а не детали UI.

### Фаза 1. Сделать активный setting adapter

Создать TS-интерфейс и Fallout-реализацию поверх текущих источников.

На этом этапе не нужен `.trpg` loader. Нужна одна дверь:

```text
getActiveSetting().catalog
getActiveSetting().rules
getActiveSetting().screens
getActiveSetting().extensions
```

### Фаза 2. Один Catalog API

Перевести по одному потребителю:

1. `resolveItem`;
2. Inventory;
3. Equipment;
4. AddItemModal;
5. kit resolver;
6. DB catalog projection.

Каждый переход должен сохранять текущий результат.

### Фаза 3. Один action для consumable

Оставить старый `applyConsumableFull` как compatibility facade.
Внутри постепенно перенести расчёты в typed engine action.

Сначала оба UI-пути должны продолжать вызывать тот же фасад. После совпадения
тестов фасад может делегировать в новый action.

### Фаза 4. Typed actions для equipment

Переносить по одному:

- equip/unequip;
- quantity/stack;
- weapon modification;
- armor modification;
- repair/durability.

Не объединять правила Fallout с generic inventory mechanics в один огромный
файл.

### Фаза 5. Динамический состав приложения

Только после работающего adapter:

- manifest объявляет data/screens/bricks;
- runtime загружает пакет;
- активный setting влияет на навигацию;
- отсутствие категории означает отсутствие категории;
- отсутствие объявленного файла означает явную ошибку;
- нельзя незаметно подставить Fallout.

### Фаза 6. Второй сеттинг

По-настоящему выносить кирпичи в движок следует после проверки на втором
сеттинге или на заранее подготовленном минимальном test setting.

Если абстракция не нужна второму сеттингу, она, вероятно, является Fallout
абстракцией, а не engine abstraction.

---

## 9. Как AI должен работать с этим проектом

Перед изменениями AI обязан:

1. Прочитать `replit.md`.
2. Прочитать этот документ.
3. Проверить `setting-contract.md`.
4. Найти существующий источник правды и текущий action path.
5. Найти все вызывающие стороны перед изменением поведения.
6. Определить, является задача engine, adapter или Fallout.
7. Добавить/обновить тест на сохраняемое поведение.
8. Сделать минимальный вертикальный срез.
9. Запустить тесты, typecheck и build в зависимости от затронутого слоя.
10. Обновить документацию, если принято новое архитектурное решение.

### Перед началом AI должен ответить себе

```text
- Я добавляю новую копию правила?
- Где сейчас настоящий источник правды?
- Это универсальная механика или Fallout-политика?
- Должен ли UI только вызвать action?
- Не меняю ли я save format без миграции?
- Не протекает ли Fallout import в engine?
- Проверил ли я второй существующий путь того же действия?
```

### Если задача неоднозначна

AI не должен молча выбирать красивую архитектуру и переписывать несколько
слоёв. Нужно:

- сначала описать текущий путь;
- найти существующий фасад;
- выбрать минимальную границу;
- сохранить старый API как compatibility facade;
- предложить следующий шаг после проверки.

---

## 10. Красные флаги

Остановиться и пересмотреть решение, если изменение:

- переписывает больше одного крупного слоя одновременно;
- требует изменить миграции только ради типов;
- переносит Fallout JSON в `src/engine`;
- добавляет вторую функцию `use/consume/apply` для того же предмета;
- добавляет локальный `findItemById` в новый экран;
- сохраняет в store новые копии каталожных данных без необходимости;
- добавляет `catalog?.fallout || []` как тихий fallback;
- превращает модалку в носитель игровых правил;
- делает DB источником данных каталога;
- заменяет рабочий код «временно» без теста эквивалентности;
- требует массового переименования файлов до появления контракта.

---

## 11. Definition of Done для архитектурной фичи

Фича считается готовой, если:

- существует один владелец правила;
- все UI-пути вызывают один action/query;
- источник каталожных данных один;
- state/store/save не дублируют источник истины без явной причины;
- legacy преобразуется на входе и не распространяется дальше;
- Fallout-specific код находится в модуле или зарегистрированном расширении;
- движок не получил новый прямой импорт Fallout;
- есть тесты на основной и альтернативный UI-путь;
- старые сохранения остаются читаемыми;
- `npm test` проходит;
- `npm run typecheck` проходит для затронутых TS-слоёв;
- `npm run build` проходит для изменений, затрагивающих runtime/bundling;
- документировано, где теперь находится источник правды.

---

## 12. Текущее решение в одной странице

```text
Positronium = TS-oriented TTRPG engine + setting packages.

Fallout is the first setting, not the definition of the engine.

New generic code belongs in TypeScript engine contracts/actions.
Existing JS is migrated behind stable facades, not by a big-bang rewrite.

Catalog JSON belongs to the active setting.
DB stores state/projections, not catalog truth.
Item instances store mutable state, not copied catalog truth.

Every gameplay operation has one action.
Every action can be called by multiple screens.
Modals present/confirm/report; they do not own rules.

Migrations are the only legacy boundary.
After migration, modern runtime state is used everywhere.

Engine never imports Fallout.
Fallout registers rules, state extensions, listeners and screens.

When in doubt: preserve behavior, add a test, create one seam,
and move only one vertical slice.
```