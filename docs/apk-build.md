# Сборка APK движка

Приложение не содержит сеттинга: Fallout приходит отдельным `.trpg` и ставится
из папки-сеттинга (вручную) или из релиза репозитория сеттингов (по сети).
Поэтому APK движка — это «чистый движок»; после установки он предложит поставить
сеттинг сам (см. ниже).

## Что уже готово в репозитории движка

- `app.json` — `name: Positronium`, `slug: positronium`,
  `android.package`/`ios.bundleIdentifier`: `com.rpgcompanios.positronium`,
  схема `positronium`, `version: 1.0.0` (совпадает с `ENGINE_VERSION`).
- `eas.json` — профили `preview` (APK, канал `preview`), `production`
  (AAB для Google Play, канал `production`), `development` (dev-client).
  `appVersionSource: remote`: `versionCode` ведёт EAS и поднимает при каждом
  билде — иначе Android не даст обновить установленное приложение.
- `expo-updates` — OTA: правки JS доезжают до установленных APK без новой
  сборки (`app.json` → `updates.url`, `runtimeVersion.policy: appVersion`).
- npm-скрипты: `npm run apk`, `npm run aab`, `npm run apk:local`.
- Иконки и сплэш в `assets/`.

Папки `modules/`, `__tests__/` и скрипты публикации в репозиторий движка не
попадают: тесты проверяют механику сеттинга и живут в совмещённом репозитории.

## Вариант 1 — EAS Build (облако, без Android SDK)

Нужен аккаунт Expo (бесплатный тариф подходит) и интернет.

```sh
npm install
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Или из корня репозитория:

```sh
npm run apk
```

EAS соберёт **APK** (профиль `preview`, `buildType: apk`) и даст ссылку на
скачивание. Первый запуск спросит про Android keystore — согласитесь, EAS
сгенерирует его сам.

Для Google Play нужен AAB:

```sh
npm run aab      # профиль production, buildType: app-bundle, autoIncrement
```

Проверить сборку без отправки в облако (нужен Android SDK локально):

```sh
npx eas-cli build --platform android --profile preview --local
```

## Вариант 2 — локально (Gradle)

Нужны JDK 17 и Android SDK (`ANDROID_HOME`), например Android Studio или
`commandline-tools`.

```sh
npm install
npm run apk:local
```

Скрипт делает `expo prebuild` (генерирует `android/`) и `gradlew assembleRelease`.
Готовый файл:

```
android/app/build/outputs/apk/release/app-release.apk
```

`android/` и `ios/` генерируются заново и в git не коммитятся: единственный
источник правды — `app.json` и `eas.json`.

## Проверка JS-бандла без сборки APK

Полезно, если нужно быстро понять, что приложение собирается:

```sh
npx expo export --platform android --output-dir dist
```

В репозитории движка это уже проверено: бандл Hermes ≈ 3.7 МБ собирается без
папки `modules/`.

## Публикация APK в релиз

Готовый APK прикладывается к GitHub Release движка (тег `engine-v<версия>`,
версия — `expo.version` в `app.json`). Собирает его EAS, публикация только
прикладывает файл:

```sh
npm run apk
# из совмещённого репозитория:
./scripts/publish-engine.sh --release --asset ~/Downloads/positronium-1.0.0.apk
```

Текст релиза берётся из верхней секции `release-notes/engine.md`; её номер
должен совпадать с версией приложения. APK обязателен: публикация переименует
его в `positronium.apk`, положит рядом `app-release.json` и оставит у людей
постоянную ссылку
<https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk>.

## OTA-обновление (без новой сборки)

`expo-updates` доставляет правки JS в уже установленный APK:

```sh
npm run ota -- --message "Что изменилось"          # канал preview
npx eas-cli update --channel production --message "..." # канал production
```

Через OTA нельзя менять нативную часть (новый модуль, разрешение, иконку,
`versionCode`) — для такого нужен новый APK по инструкции выше. Проект EAS,
`projectId` и каналы уже прописаны в `app.json`/`eas.json`, повторный
`eas update:configure` не нужен.

## Установка сеттинга в собранное приложение

Движок не знает ни одного сеттинга заранее и ничего не предлагает поставить:
адрес всегда вводит пользователь. Есть два пути.

**По ссылке.** Настройки → настройки сеттинга → поле «Ссылка на репозиторий
или файл .trpg» → «Установить по ссылке». Понимаются `owner/repo`,
`https://github.com/owner/repo`, ссылка на `release.json` и прямая ссылка на
архив `.trpg`. Ссылка на репозиторий запоминается, и при запуске приложение
проверяет `release.json` уже этого источника (размер и sha256 проверяются).

**Файлом.** Настройки → настройки сеттинга → «Импортировать пакет .trpg» →
выбрать файл → «Установить» → выбрать сеттинг.

Собрать `.trpg` в репозитории сеттинга (checkout движка не нужен):

```sh
npm install --prefix tools
python3 tools/pack-setting.py fallout -o dist/fallout.trpg
```

Проверить пакет перед установкой:

```sh
python3 tools/unpack-setting.py dist/fallout.trpg --dest /tmp/fallout-check
```

## Что будет видно без сеттинга

Это нормальное состояние чистого движка: каталоги пусты, экраны сеттинга
(бой, перки, инвентарь Fallout) не появляются, пока пакет не установлен.
Кнопка «Проверить обновления» в настройках сеттинга проверяет только те
источники, которые пользователь добавил ссылкой.

## Частые проблемы

| Симптом | Причина |
| --- | --- |
| `eas: command not found` | запускайте `npx eas-cli …` или `npm i -g eas-cli` |
| EAS просит `owner` | сборка пойдёт под личным аккаунтом; для организации добавьте `"owner": "<org>"` в `app.json` |
| `SDK location not found` | не задан `ANDROID_HOME` / нет Android SDK |
| `Unsupported class file major version` | нужен JDK 17 |
| APK ставится рядом со старым Fallout-приложением | изменился `applicationId` на `com.rpgcompanios.positronium`; это ожидаемо |
| после установки пустые экраны | сеттинг ещё не установлен — см. раздел выше |
| приложение не видит релиз | проверьте `release.json` в ветке репозитория сеттингов и тег `fallout-v<version>` |
