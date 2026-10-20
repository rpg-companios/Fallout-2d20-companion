# Контракт сеттинга (движок + пакет)

**Статус на 2026-10-19:** `.trpg`-проверка/кэш, сборка manifest-declared CommonJS runtime (`scripts/build-setting-runtime.mjs`) и явная активация выбранного пакета подключены к `App.js`. До гидрации character store пакет восстанавливает экраны, сервисы и runtime capabilities. Fallout character-creation rules живут в `modules/fallout/logic/characterCreation.js`; disease mechanics и consumable modifiers — в `modules/fallout/diseases/` и `modules/fallout/consumables/`. Fallout-owned save transitions v0–v2, v5–v14, v17, v20–v22 и v25–v26 (включая robot slot-stat normalization) регистрируются на исходных индексах; composition не меняет schema version и длину chain. Legacy item/mod ID repairs и kit-item canonicalization идут через optional `saveMigrations`; post-load подготовка weapon/robot/armor state, chem-dose log, reward journal и disease timer — через `characterLoad.prepare`. Snapshot-only robot/armor fields предоставляются optional `characterSave.getSnapshotFields` с прежними ключами. Каталоговые Fallout-типы и lookup категорий предоставляются optional inventory capability; power-armor ID recognition/equip policy также принадлежат Fallout feature. Deferred legacy kit grant остаётся на `saveMigrations.afterCharacterLoad`. В engine остаются общие гидрация и store-dispatch; compatibility slices и полный аудит границ ещё впереди. Engine, setting и combined-сборки пока в одном репозитории; синхронизация трёх отдельных репозиториев не реализована.

Этот файл — **единственная** спецификация пакета. Прежний
`docs/architecture/setting-pack.md` удалён (2026-09-18): всё живое слито сюда.

---

## 0. Решения владельца

- Движок **пустой**: без пакета нет каталога, персонажа не создаём.
- Сеттинг человек видит как **кошелёк**: отдельная папка, внутри содержимое. Не россыпь файлов вперемешку с программой.
- На диске у админа: папка движка отдельно, рядом папка `сеттинги/fallout/`, `сеттинги/герои/` — два кошелька, деньги не сыплются в один карман.
- Собранный сайт **сам папку на хостинге не создаёт**. Браузер на диск сервера не пишет. Папки кладёт админ (копия, rsync) или позже маленький сервер при загрузке пакета.
- Пакет для раздачи — файл **`.trpg`** (обычный zip, который содержит целую папку кошелька сеттинга, а не набор выбранных JSON). Кладёт скрипт. Иное расширение не принимаем.
- В приложении `.trpg` скачивается/выбирается, проверяется и распаковывается в изолированный локальный кэш сеттинга; объявленные данные загружаются в память активного адаптера. Каждый `settingId` — отдельный кошелёк, содержимое разных пакетов не смешивается. Кэш не является папкой Google Drive и не синхронизируется с пользовательскими сейвами.
- Пакет **не** «только JSON»: данные, переводы, настройки, планы тела, сплэш, **свои экраны, оформление и уникальные механики сеттинга**. Сеттинг может ссылаться на стандартные механизмы движка по ID; их реализацию он не копирует. Собственная runtime-логика поставляется manifest-declared CommonJS bundle API v1 и исполняется в JS-контексте приложения (не sandbox); контракт загрузки есть, но разделение репозиториев и безопасное обновление движка/пакета ещё не закончены.
- Движок **собирается из повторно используемых механик сеттингов**: когда механика становится общей и реально нужна нескольким сеттингам, её переносят в движок отдельным патчем. Механика, уникальная для одного сеттинга, остаётся только в его пакете и не обязана становиться универсальной.
- Читать сеттинг только через **адаптер**. Экраны не знают, откуда файлы.
- Нет файла / битый JSON — ошибка с путём. Чужой формат не «подчищаем».
- БД — только состояние (сейвы, какие пакеты стоят). Каталог — из пакета.
- **Тронули сеттинговые данные — они в модуле.** Категория целиком уезжает в `modules/<id>/`. Не оставлять хвост в движковом `data/`.
- **Экраны.** Менеджер и инвентарь — движок. Остальные экраны и их строение — сеттинг. Сначала кладём их в модуль как есть. Кирпичи в движок — только когда появится второй сеттинг, отдельным патчем.

**Ещё не сделано:** интерпретация `.trpg` как источника каталогов игры, схемы данных и проверка `requiresCore`, подключение данных к реестрам/экранам, HTTPS-каталог/обновление. Read-only file API уже есть, но игровой адаптер над ним ещё не собран.

---

## 1. Роли

| | Движок | Пакет сеттинга |
|---|---|---|
| Сейчас | универсальная логика вперемешку с Fallout-зависимостями; менеджер, инвентарь, сейвы | `modules/fallout/`: данные, экраны и уникальные правила Fallout |
| Цель | универсальная основа + стандартные механизмы, подтверждённые повторным использованием; загрузка `.trpg` и контракт адаптера | полный `.trpg`-кошелёк: манифест, данные, i18n, настройки, экраны и уникальные механики сеттинга |

Сеттинг объявляет свои данные и уникальные механики, указывает нужные ему стандартные механизмы движка по ID и выбирает состав экранов. Другой мир — другой пакет, не форк Fallout. Неиспользуемые другими мирами правила не переносятся в движок «на всякий случай».

На хостинге могут быть разные люди и разные наборы пакетов.

---

## 2. Как лежит пакет (кошелёк)

Внутри `.trpg` и на диске после установки — **одна папка с именем сеттинга**, в ней содержимое:

```
fallout/
  manifest.json
  settings.json
  data/          — что есть в этом мире (не обязательно перки)
  i18n/<locale>/ — зеркало объявленных данных
  splash/
  screens/
```

Идентичность — `manifest.id` (латиница). Имя папки = этот id. Два пакета не пишут в одну директорию.

Категории, которых в мире нет, **может не быть**. Нет перков, зато есть таланты и книга заклинаний — так и объявляем. Нет объявленного файла — ошибка, не пустой список и не каталог Fallout.

`.trpg` содержит весь кошелёк, включая нужные сеттингу assets/картинки. Большие внешние ресурсы можно оставить по ссылке и кэшировать отдельно; ограничение установщика — до **50 МиБ** на архив и суммарное распакованное содержимое.

Комплекты снаряжения — **только JSON**, без `index.js`, чтобы сеттинг правили без кода.

---

## 3. Манифест

Три разных числа, не одно:

| Поле | Зачем |
|---|---|
| `version` | контент: добавил пушку → 2 |
| `requiresCore` | какой движок нужен |
| `packFormat` | правила укладки файлов. Поменяли дерево → format 2, старый движок не лезет вслепую |

Ещё в манифесте (как у установщика: что брать, куда класть, что подключить):

- `id`, `name`, языки;
- карта категорий: какие данные есть и путь к файлу;
- какие экраны есть и откуда (стандартный кирпич движка или собственное содержимое кошелька);
- какие стандартные механизмы движка нужны сеттингу по стабильным ID;
- какие уникальные механики/расширения предоставляет сам сеттинг.

Нет запрошенного механизма в этой версии движка и нет собственного расширения в пакете — **ошибка**, не тихий экран Fallout. Контракт `SettingExtension` в `src/engine/contracts/setting.ts` уже описывает часть in-process расширений (параметры, производные значения, счётчики, требования и реакции); он не является загрузчиком кода из `.trpg`.

`settings.json` живёт в пакете. Значения в сторе по `settingId`, пакеты не смешиваются.

---

## 4. Доступ к файлам и игровой адаптер (частично)

`openSettingPackageRuntime(cacheKey)` в `src/engine/settings/settingPackageRuntime.js` открывает cache entry, повторно валидирует manifest, предоставляет allowlisted `readBytes` / `readJson` и явный `loadModule(engineApi)`. Manifest объявляет `runtime: { apiVersion: 1, source: "runtimeEntry.js", entry: "runtime/setting.cjs" }`; `pack-setting.py` строит bundle, factory получает host API и возвращает runtime-модуль с тем же `id`. `App.js` восстанавливает выбранный пакет до hydration character store и использует его экраны/services/capabilities. Исполнение остаётся в общем JS-контексте, не sandbox.

**Character creation capability:** Fallout публикует `SETTING.logic.characterCreation` и `SETTING.logic.derivedStats`. Engine consumers запрашивают их через `domain/registry.js`; `domain/characterCreation.js` — только adapter без SPECIAL-ключей, каталога навыков, стартовых чисел или Fallout fallback. При отсутствии capability store оставляет атрибуты и навыки пустыми; стартовые значения создаются после загрузки активного пакета.

Это ещё не доказывает полное разделение: engine оставляет нейтральный dispatch для optional disease/consumable/character-load/save-migration capabilities. Fallout-owned transitions v0–v2, v5–v14, v17, v20–v22 и v25–v26 регистрируются в прежних schema slots; composition не меняет версию и не удлиняет chain. Неверсионируемые Fallout ID repairs и пост-загрузка также идут через пакетные capabilities. Сейвы, уже помеченные v26 старой splice-цепочкой, могут нести неочищенные ссылки из пропущенного перехода v25→v26; автоматический repair не добавлялся. Остаётся аудит generic migration/compatibility slices и других setting-owned участков store/domain; snapshot-поля, Fallout catalog lookup/type assumptions и power-armor recognition/policy теперь используют optional capabilities. Runtime host API стабилизирован не для всех механик. Проверка совместимости `requiresCore`, безопасный пропуск релизов/обновление и три отдельных репозитория (engine, setting, combined) остаются незавершёнными.

---

## 5. Экраны и кирпичи

**Всегда движок.** Менеджер — список героев, создать / загрузить, бургер. Инвентарь — сумка: вещи, поиск, вес.

**Кошелёк в сумке — сеттинг.** Сейчас у Fallout одна ячейка «крышки». В другом мире то же место может быть «солярии», несколько ячеек с обменом (100 меди = 1 серебро) или несколько без обмена (осколки и кристаллы). Код обмена не пишем, пока не скажет владелец.

**Остальные экраны — сеттинг.** Сколько вкладок и как они выглядят, решает пакет. У Fallout три: персонаж, снаряжение, перки. У другого может не быть перков, зато книга заклинаний.

Перенос Fallout в модуль, по одному. На экране ничего не меняется, переезжает папка:

1. персонаж → `modules/fallout/screens/CharacterScreen/`
2. снаряжение → `modules/fallout/screens/WeaponsAndArmorScreen/` (вместе с модалками модов, RobotSlot, textUtils)
3. перки → `modules/fallout/screens/PerksAndTraitsScreen/` (вместе с модалкой выбора и perksDisplay)

**Кирпичи.** Сначала всё живёт в сеттинге, как есть. У Fallout на листе семь одиночных чисел.

Когда появится второй сеттинг — в движок вынимаем рамку с **одним** числом. Сеттинги обновляются: берут рамку, у себя пишут сколько атрибутов, как называются, руками или бросками.

Потом, если нужны два числа (слева от 1 до 20, например 16; справа целые десятки — для 16 пишет 1) — в движок рамка с двумя. Снова обновление сеттингов.

Само из сеттинга в движок ничего не заезжает. Нет рамки в движке и нет своей в пакете — ошибка, не тихий экран Fallout.

Секция с id, внутри свои ячейки (СИЛ/ЛОВ или атака/защита) — это и есть кирпич + части.

---

## 6. Как автор отдаёт сеттинг

Исходники сеттинга — **отдельный репозиторий**. Автор правит данные, скрипт упаковывает в `.trpg`, файл кладут в движок (загрузка файла; позже — витрина).

В браузер **не** клонируем `https://github.com/…/project.git`. Нужен готовый `.trpg`.

Пока Fallout сырой, админ может держать движок и сеттинги рядом и править точечно. Кто хочет своё — клонирует **репозиторий сеттинга**, правит, пакует, грузит.

`pack-setting.py` проверяет обязательные метаданные, пересобирает `packFormat: 1` и allowlist `files`, исключает Git/зависимости/секретные файлы и запрещает symlink. `unpack-setting.py` проверяет все ZIP-пути и лимиты до распаковки, берёт только allowlist и собирает кошелёк во временной папке с безопасной заменой. Проверка совместимости `requiresCore` с установленным движком и схем остальных JSON пока не реализована. Это не сборка Expo.

Целевой поток в приложении:

1. пользователь выбирает `.trpg` или скачивает пакет по HTTPS-ссылке; репозиторий Git приложение не клонирует;
2. приложение проверяет расширение, размер и целостность zip, затем читает единственный корневой `manifest.json`;
3. проверяет `id`, `version`, `requiresCore`, `packFormat`, список `files`, безопасные относительные пути и наличие каждого объявленного файла;
4. распаковывает файлы из allowlist во временный кошелёк внутри приватного локального хранилища приложения;
5. после полной проверки атомарно сохраняет кошелёк в кэш, раздельно по `id` и версии/хэшу, и сохраняет только индекс/метаданные установки;
6. при активации читает пакет в память адаптера; отсутствующий файл/раздел — явная ошибка, не fallback на Fallout;
7. неудачная установка/обновление не затирает уже работающий кошелёк.

Хранилище реализовано раздельно по платформам: приватная файловая область приложения на Android/iOS и IndexedDB на Web/PWA. Загрузка и локальная установка уже реализованы; чтение пакета через игровой data adapter и активация пока остаются целевыми этапами. Подпись издателя пока не входит в утверждённую первую версию.

Не объявленные в манифесте файлы **не подключаем**. Объявили файл и его нет — ошибка с путём.

---

## 7. Сейвы

У персонажа: `settingId` + `settingVersion`.

Персонажа другого сеттинга не открывать (поля несовместимы: Heroes в Fallout нельзя).

Тот же сеттинг, в каталоге нет перка/предмета — строка остаётся, сообщение как у перков без id.

На одной установке может быть несколько пакетов. Персонаж привязан к своему.

---

## 8. Что есть сейчас

**Есть:** `modules/fallout/` (данные, i18n, экраны и setting-owned logic), публичный `index.js` и metadata doorway `manifest.js`; `.trpg` pack/unpack/cache/runtime loader; активный runtime host в `App.js`; generic registry, который читает только активный пакет. Экранный/локальный Fallout split расширен: Character, Perks, Weapons и Inventory dictionaries живут в пакете; engine Inventory оставляет базовую таблицу/операции, setting features optional.

**Реальная capability-граница:** `SETTING.logic.characterCreation` содержит SPECIAL-порядок, каталог навыков, лимиты и создание стартовых атрибутов. `domain/registry.js` выдаёт capability активной настройки; `domain/characterCreation.js`, selectors, store и save loader обращаются к ней динамически. Без capability engine не импортирует Fallout, не подставляет SPECIAL или каталог навыков; store остаётся пустым. Тесты не запускались по прямому указанию владельца.

**Осталось в engine:** disease exposure, лечение, сопротивление и disease effects живут в `modules/fallout/diseases/`; Fallout-бонусы расходников, длительность химии, учёт доз, зависимость и cleanup-эффекты — в `modules/fallout/consumables/` и setting capabilities. Versioned save transitions регистрируются пакетами на исходных индексах; legacy weapon-mod/item ID repairs находятся в `modules/fallout/migrations/`. `characterSaves.js` вызывает optional `saveMigrations` и `characterLoad.prepare`, оставляя правила каталога и пост-загрузочную подготовку пакету. В аудите 2026-10-19 snapshot-поля robot/power-armor делегированы `characterSave.getSnapshotFields` без смены legacy keys/schema; Fallout catalog lookup/type candidates, robot/power-armor catalog projections, protection-kind и armor-like display extensions вынесены в inventory capabilities/модуль. ID-prefix inference и power-armor recognition/equip policy также принадлежат Fallout feature. Остальные compatibility helpers в `domain/` требуют отдельного аудита. Тесты не запускались по прямому указанию владельца; runtime bundle и syntax/diff checks прошли.

**Репозитории (2026-10-20):** три роли, адреса закреплены — §15. Совмещённый checkout — этот репозиторий; из него же скрипт публикации собирает деревья/патчи/релизы для `ttrpg-engine` и `positronium-game-settings`.

## 9. Дорожная карта

1. ~~Ответы на вопросы~~ — §10, 2026-08-24.
2. ~~Сначала всё Fallout в модуль~~ — три экрана в `modules/fallout/screens/`.
3. ~~Установка и runtime loader~~ — `.trpg` cache, bundle compiler, активатор пакета и host API v1 работают. Character creation переведён на capability активной настройки; остальные механики engine/setting ещё разделяются.
4. ~~Скрипт `.trpg`~~ — `scripts/pack-setting.py` и `unpack-setting.py`; добавлен статический пример кошелька.
5. **Начато 2026-10-14:** общий валидатор manifest, метаданные Fallout через `SETTING` door, guard на запрет `modules/**` импортов из `src/engine/**`. Это первая граница; прямые импорты из экрана/домена к Fallout ещё остаются.
6. Комплекты: убрать `equipmentKits/index.js`, один JSON-индекс.
7. **Следующее:** собрать единый runtime bundle полного Fallout-кошелька; объявить entrypoint/API в manifest; дать setting-коду подключаться к общим механизмам через engine API; при выборе активировать из одного `.trpg` его данные, экраны и уникальные правила. Убрать статический Fallout fallback: без пакета движок пустой. Проверить ручной импорт/запуск в PWA и APK.
8. **После первого полного прохода:** продолжить вынос межмодульных импортов за явный engine API, чтобы кошелёк Fallout можно было собирать в отдельном репозитории без исходников движка. Содержимое сеттинга остаётся целостным; не разделять его на независимые «пакет данных» и «пакет экранов».
9. ~~Публикация в целевые репозитории~~ — `scripts/publish-repositories.mjs`: правки здесь → дерево/патч/коммит/релиз для движка и сеттинга. Папки под сеттинги: `modules/<id>` → `<id>/`.
10. ~~Обновление сеттинга по сети~~ — `release.json` в репозитории сеттинга, клиент проверяет релиз при запуске и ставит `.trpg` (сверить `requiresCore`, размер и sha256).
11. **Затем:** проверить установку/обновление на Web/PWA, Android/iOS. Совместимость исполнения пакетного кода с Google Play — отдельная проверка перед публикацией; она не отменяет ручной staging-тест.
12. Промоут кирпичей — по мере второго сеттинга: сначала рамка с одним числом, потом с двумя. Не заранее.

---

## 10. Вопросы и ответы (2026-08-24)

**Q1. Как уложен пакет?**
Кошелёк: папка сеттинга, внутри содержимое. И на диске у админа, и внутри `.trpg`. Пакеты не распаковывать в одну кучу и не в папку движка.

**Q2. Одно поле version или три?**
Три: `version` (контент), `requiresCore` (движок), `packFormat` (укладка).

**Q3. Комплекты JSON?**
Да. Чтобы люди меняли сеттинг без кода.

**Q4. Лишние файлы и формат архива?**
Не любой zip, а `.trpg` от скрипта. Внутри манифест говорит, какие файлы брать и куда подключить. Не объявлено — не трогаем.

**Q5. Один пакет на установку?**
Нет. Несколько пакетов, персонаж только своего сеттинга. На хостинге разные люди — разные наборы.

**Q6. Ссылка на git-репозиторий?**
В браузере репозиторий не клонируем. Автор: репо → скрипт → `.trpg` → загрузка. Позже витрина в духе «скачал расширение».

**Q7. Размер?**
50 МБ. Картинки по ссылкам, кэш.

**Q8. Подпись / сумма?**
В первой версии нет.

**Q9. Fallout в отдельный репозиторий?**
Сеттинги будут отдельными репозиториями. Сейчас Fallout ещё сырой — можно держать рядом с движком и править точечно. Потом тот же путь: репо + `.trpg`.

**Q10. Экраны?**
Смесь. Есть в движке — берём. Нет — своё из пакета. После второго сеттинга кирпичи можно перенести в движок для третьего.

**Q11. Жёсткое дерево файлов или карта?**
Карта в манифесте. Категорий может не быть (нет перков) или быть новые (книга заклинаний).

**Q12. Ссылка на кирпич?**
По id секции. Нет в движке и нет в пакете — ошибка.

---

## 11. Что не копировать из старых черновиков

- Fallout всегда вшит в бандл.
- «В пакете только JSON».
- Адаптер с `catalog?.chems || []`.
- Сжатый i18n в один `ru-RU.json` — нет; зеркало объявленных файлов.
- Любой `.zip` с чужим расширением.
- Клон `.git` прямо в браузере.

---

## 12. Репозитории, папки сеттингов и публикация (решение владельца, 2026-10-20)

Три роли, три адреса:

| Роль | Репозиторий | Что лежит |
| --- | --- | --- |
| Совмещённая разработка + APK | `rpg-companios/Fallout-2d20-companion` (этот checkout) | движок, Fallout, скрипты сборки; здесь делаются правки |
| Движок | `rpg-companios/ttrpg-engine` | код приложения без `modules/`, `patchs/`, `artifacts/` |
| Сеттинги | `rpg-companios/positronium-game-settings` | папка на сеттинг, инструменты сборки, `release.json` |

**Правки делаются здесь.** Целевые репозитории не редактируются руками: `scripts/publish-repositories.mjs` собирает их деревья из текущего checkout и публикует.

```sh
./scripts/publish-engine.sh     # движок: собрать и запушить
./scripts/publish-setting.sh    # сеттинг: дерево + .trpg + release.json + релиз
```

Обе обёртки — тонкие: `--dry-run` показывает изменения, `--patch` сохраняет
патч, `--message` задаёт сообщение коммита, у сеттинга ещё `--no-release`.
Токен — `GH_TOKEN` (или `GITHUB_TOKEN`); подробности и разбор ошибок —
`docs/publishing.md`.

Ручной запуск без обёрток тоже возможен:

```sh
node scripts/publish-repositories.mjs                      # план: что изменится
node scripts/publish-repositories.mjs --target engine --patch
node scripts/publish-repositories.mjs --target setting --push --release
```

- `--target engine|setting|all`, `--workdir <dir>` (по умолчанию `.publish/`, в git не попадает), `--message`, `--patch`, `--push`, `--release`.
- Движок: копируется всё, кроме `modules/`, `patchs/`, `artifacts/`, `сеттинги/`, закладок и бэкапов.
- Сеттинг: `modules/<id>/` → `<id>/` в корне; `pack-setting.py`, `unpack-setting.py`, `build-setting-runtime.mjs` → `tools/`; README генерируются.
- `--release` собирает `.trpg` упаковщиком этого репозитория, пишет `release.json` в корень репозитория сеттингов и создаёт GitHub-релиз с тегом `<id>-v<version>` и ассетом `<id>.trpg`.
- Без `--push`/`--release` клон откатывается: скрипт ничего не публикует, только показывает изменения и (с `--patch`) пишет патч.
- Адреса и кошельки — `settings/repositories.json`; подпись коммита — `PUBLISH_GIT_NAME`/`PUBLISH_GIT_EMAIL`.

**Права.** Публикация пишет в два чужих репозитория, поэтому подключение Arena должно включать `rpg-companios/ttrpg-engine` и `rpg-companios/positronium-game-settings` (Arena → GitHub → выбор репозиториев). Перед сборкой скрипт делает `git push --dry-run` и при 403 останавливается с просьбой выдать доступ, не собирая `.trpg` впустую.

**Папки под сеттинги.** В репозитории сеттингов каждый сеттинг — папка в корне (`fallout/…`, позже другие). Внутри — ровно содержимое кошелька: `manifest.json` в корне папки, `files` в манифесте перечисляет файлы относительно неё. `release.json` и `tools/` лежат рядом с папками и не входят ни в один пакет.

**Сборка пакета из репозитория сеттингов.** Упаковщик берёт `--engine` (или `POSITRONIUM_ENGINE`), потому что кошелёк ещё импортирует файлы движка. Если кошелёк лежит вне checkout'а движка, упаковщик копирует его во временную папку на той же глубине и собирает там; оригинал не меняется.

```sh
POSITRONIUM_ENGINE=/path/to/app python3 tools/pack-setting.py fallout -o dist/fallout.trpg
```

**Игра репозиторий не клонирует.** Людям отдаётся `.trpg` из релиза; клиент проверяет новый релиз по сети — §16.

`settings/pins.example.json` — образец закладки для локальной сборки; рабочий `settings/pins.json` в git не кладём.

```sh
python3 scripts/setting-status.py
```

показывает локальный `version` и, если в пине есть git, удалённый HEAD.

---

## 13. Установка `.trpg` в приложении (решение владельца, 2026-10-14)

1. Приложение получает готовый `.trpg` двумя путями: file picker (Web и Native) и сетевое обновление из релиза репозитория сеттинга (§16). Git-репозиторий сеттинга в клиент не клонируется.
2. Пакет ограничен 50 МиБ сжатого размера, 50 МиБ суммарного распакованного содержимого, 10 МиБ на файл и 2 000 ZIP-записями. Проверяются безопасные имена всех записей, единственный корневой `<settingId>/manifest.json`, `packFormat: 1`, соответствие `manifest.id` папке и полный allowlist `manifest.files`. Распаковываются только объявленные файлы; лишние безопасные записи остаются нераспакованными.
3. В Native файлы сначала пишутся в staging-папку приватной области документов, затем переименовываются в content-addressed каталог. Web/PWA записывает полный список байтов кошелька одной транзакцией IndexedDB. Cache key: `<settingId>/<sha256-архива>`; одинаковые байты занимают одну запись. Метаданные указателя установки хранятся отдельно в Zustand/AsyncStorage.
4. Повторный импорт того же `id` обновляет запись; при отличающемся hash новая копия кэшируется раньше замены указателя, после чего приложение пытается удалить старый cache entry. Ошибка очистки не должна отменять успешную установку. Замена активного runtime сейчас не выполняется.
5. Список установленных пакетов явно показывает, что их данные ещё не подключены к каталогам игры. Read-only file API существует, но в store для импортов принудительно выставляется `runtimeReady: false`; выбрать такой пакет активным нельзя. Активный сеттинг не переключается.
6. Установка сама по себе не выполняет код. Владелец утвердил, что полный выбранный сеттинг включает и запускает собственные экраны/механики. Сейчас `manifest.runtime` может объявить единственный self-contained CommonJS bundle (`apiVersion: 1`, `entry`); явный `loadModule(engineApi)` запускает его factory в JS-контексте приложения и сверяет возвращённый `id`. Это пока не sandbox и ещё не подключено к выбору активного сеттинга. Остальные файлы кода доступны только через allowlist.
7. Web/PWA хранит пакет в IndexedDB; Android/iOS — в приватном каталоге документов приложения. Пакет не загружается в Google Drive. Существующая синхронизация пользовательских JSON остаётся в скрытом `appDataFolder/<settingId>` рядом с сейвами, без создания отдельной общей/видимой папки.
8. `requiresCore` сравнивается с версией ядра (`ENGINE_VERSION`, `src/engine/version.js`) при проверке обновления; пакет с несовместимым требованием не предлагается. Сборка полного Fallout runtime bundle, engine API для его зависимостей и проверка схем остаются открытыми. Проверку требований магазинов провести перед релизом, не блокируя ручной APK/PWA staging.

Статический пример кошелька лежит в `docs/settings/templates/example_setting/`. Упаковщик: `python3 scripts/pack-setting.py <setting-wallet> -o <output.trpg>`; для проверки распаковки: `python3 scripts/unpack-setting.py <package.trpg> --dest <directory>`. Скрипты не запускают и не проверяют механику сеттинга.

**Уточнённый принцип эволюции движка (2026-10-14):** пока сеттинг один, его механики живут в его пакете. Когда появятся другие сеттинги, повторно используемые механики постепенно становятся стандартными механизмами движка; уникальные для одного мира не переносятся в ядро и не обязаны быть нужны другим. `SettingExtension` (`src/engine/contracts/setting.ts`) уже описывает часть in-process расширений, но не является загрузчиком `.trpg`.

**Следующая техническая задача после loader-примитива:** подключить runtime entrypoint полного Fallout-кошелька к приложению. `.trpg` остаётся архивом всей папки сеттинга: его экраны и уникальные механики входят в пакет, общие механизмы предоставляет движок. Host API и сборка CommonJS bundle пока не подключены; Google Play совместимость проверяется перед публикацией, но не блокирует ручной staging-тест.

---

## 14. English — `.trpg` package quick guide

A `.trpg` is a ZIP of the **complete setting wallet**, not a Git checkout. Keep setting source in its own repository. Start from the static wallet at `docs/settings/templates/example_setting/`, give it a unique ASCII `manifest.id`, and keep the wallet root folder name consistent with that ID.

Build and inspect a package:

```sh
python3 scripts/pack-setting.py ./setting-wallet -o ./dist/my_setting-1.0.0.trpg
python3 scripts/unpack-setting.py ./dist/my_setting-1.0.0.trpg --dest /tmp/setting-check
```

The packer writes `packFormat: 1` and an allowlist containing every wallet file. The importer checks the ZIP, safe paths, root manifest, sizes, entry count, and declared files. Web/PWA stores the full wallet in IndexedDB; Android/iOS use the app's private document storage. The setting ID and SHA-256 of the archive isolate cache entries. Google Drive is not used for package files; user JSON synchronization remains in the existing hidden `appDataFolder/<settingId>` beside saves.

**Current limitation:** an imported package is stored locally and shown as “runtime integration pending”. The runtime adapter can read allowlisted files and explicitly execute a manifest-declared CommonJS bundle, but App/navigation/registry do not call it yet and Fallout has no built runtime bundle. The selected setting is intended to bring its complete screens, data, and unique mechanics; common mechanisms remain in the engine. Bundle compilation, engine API bindings, activation, `requiresCore` comparison, schema checks, and separate-repository packaging remain open. Google Play compatibility is a release-validation gate, not a reason to block the manual staging build.

---

## 15. Roadmap from the current state (2026-10-15)

The package file is currently an **installed data wallet**, not a live ruleset. The intended data flow is:

```text
separate setting source repository
  -> build a complete .trpg wallet
  -> validate archive + manifest
  -> install under <settingId>/<archiveSha256> (Web IndexedDB / Native private storage)
  -> open the manifest-declared runtime bundle + wallet assets/data
  -> bind shared engine APIs and activate the complete setting module
  -> setting screens/mechanics + setting data run together
  -> engine-only screens/services use the active setting through its contract
```

Archive validation, local install/cache, allowlisted reading, manifest runtime-entry validation, and an explicit CommonJS-bundle execution primitive are implemented. The application still statically imports Fallout screens/data; it does not activate the `.trpg` yet. User-owned JSON sync stays in the existing hidden Drive `appDataFolder/<settingId>` and is independent of `.trpg` delivery.

**Remaining milestones:**

1. **Полная активация Fallout `.trpg` (крупный этап):** собрать runtime bundle всего setting-модуля; связать его с host API движка; при выборе загружать из одного пакета данные, i18n, экраны и уникальные механики. Удалить статические Fallout-подстановки; без установленного сеттинга игрового каталога/экранов нет. На этом этапе остаётся единый целостный Fallout-кошелёк.
2. **Чистая граница репозитория:** заменить импорты setting-кода к внутренним файлам приложения на версионированный engine API. Публикация и сборка из отдельного репозитория уже работают (`scripts/publish-repositories.mjs`, `tools/pack-setting.py`) — остаётся убрать зависимость от глубины вложенности кошелька.
3. **Ручной staging-тест:** собрать PWA для вашего хостинга и APK для устройства; импортировать Fallout `.trpg`, выбрать его, пройти основные игровые потоки, проверить переключение/удаление и повторную установку. PWA хранит пакет в браузере, APK — в приватном хранилище приложения; серверного общего хранилища в утверждённой схеме нет.
4. **Перед публикацией:** отдельно проверить требования Google Play/iOS к поставке setting-кода. HTTPS-доставка релизов сделана (§16); остаётся проверить её на устройстве. Это не блокирует разработку и ручное тестирование на вашем хостинге.

Это **четыре оставшихся этапа**, не оценка в календарных днях. Первый — основной runtime-разрез; второй — физическая изоляция репозитория; третий — ваша практическая проверка на Web/PWA и Android. Релизный патч для `main` не входит в работу.

---

## 16. Сетевое обновление сеттинга (решение владельца, 2026-10-20)

Сеттинг проверяет свой репозиторий при запуске и, если вышел новый релиз, скачивает и ставит `.trpg`.

**Индекс релиза — `release.json` в корне репозитория сеттинга.** Читается с `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/release.json` (CORS есть, лимита GitHub API нет). Схема `schemaVersion: 1`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-20T00:00:00.000Z",
  "repository": "rpg-companios/positronium-game-settings",
  "settings": {
    "fallout": {
      "id": "fallout", "name": "Fallout 2d20", "version": 2,
      "packFormat": 1, "requiresCore": ">=1.0",
      "tag": "fallout-v2", "asset": "fallout.trpg",
      "bytes": 20229846, "sha256": "…",
      "assetUrl": "https://github.com/<owner>/<repo>/releases/download/fallout-v2/fallout.trpg",
      "latestUrl": "https://github.com/<owner>/<repo>/releases/latest/download/fallout.trpg"
    }
  }
}
```

`release.json` пишет `scripts/publish-repositories.mjs --release`, он же создаёт релиз с тегом `<id>-v<version>` и ассетом `<id>.trpg`.

**Решение принимает чистая функция** (`src/engine/settings/settingRelease.js`): `update-available`, `up-to-date`, `incompatible-core`, `not-released`. Правила:

- Сравниваются числовые версии; откат никогда не предлагается.
- `requiresCore` сверяется с `ENGINE_VERSION` (`src/engine/version.js`, должен совпадать с `expo.version`); несовместимый пакет блокируется с объяснением, а не молча.
- Битый индекс, отсутствующая запись, не-`.trpg` ассет или `http://`-адрес дают явную ошибку/`not-released`.
- Проверка не чаще `defaults.checkIntervalHours` (6 ч) либо по кнопке «Проверить обновления» (`force`).
- Отклонённая версия не предлагается снова до следующего релиза.

**Скачивание и установка** (`settingReleaseClient.js`, `src/store/settingUpdateStore.js`, `src/utils/settingUpdates.js`):

1. Скачивается `assetUrl`, при ошибке — `latestUrl`. Пределы: 50 МиБ, 30 с.
2. `bytes` и `sha256` сверяются с индексом. Нет `sha256` — установка помечается `unverified`; несовпадение — отказ.
3. Архив идёт в тот же валидатор/кэш, что и ручной импорт; после установки активный сеттинг перезагружается из нового пакета.
4. `autoInstall: true` (Fallout) — обновление уже установленного сеттинга ставится при запуске без вопросов. Первая установка (пакета ещё нет) всегда подтверждается: приложение не несёт сеттинг внутри, и качать десятки мегабайт без спроса нельзя. Для сеттингов без `autoInstall` предложение «Обновить/Позже» показывается и на обновлении. Ошибки видны пользователю (`settingUpdateFailed`), а не только в логе.
5. Источники — `settings/release-sources.json`; установка пакета — это доверие его коду (общий JS-контекст, §13.6).

**Проверено в этом checkout:** сборка `release.json`, скачивание с проверкой размера/суммы, решение об обновлении — тесты `__tests__/settings/setting-release.test.js`, `publish-plan.test.js`, `engine-version.test.js`; полный прогон каталога — по `npm test`.

Клиент ничего не проверяет чаще, чем раз в сессию запуска; сеть недоступна — приложение работает на установленной версии и не показывает ошибку на старте.
