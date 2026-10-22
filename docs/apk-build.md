# Сборка APK движка

Приложение не содержит сеттинга: Fallout приходит отдельным `.trpg` и ставится
из папки-сеттинга (вручную) или из релиза репозитория сеттингов (по сети).
Поэтому APK движка — это «чистый движок»; после установки он предложит поставить
сеттинг сам (см. ниже).

## Что уже готово в репозитории движка

- `app.json` — `name: Positronium`, `slug: positronium`,
  `android.package`/`ios.bundleIdentifier`: `com.rpgcompanios.positronium`,
  схема `positronium`, `version: 1.0.1` (совпадает с `ENGINE_VERSION`).
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

## Сборка и публикация релиза — одна команда

Всё делается здесь же, в репозитории движка (в смешанном репозитории — только
разработка и веб-режим). Ручное скачивание APK не нужно:

```sh
npm run release                     # APK → GitHub Release + app-release.json
npm run release -- --aab            # AAB (файл для Google Play) в релиз
npm run release -- --aab --submit   # плюс загрузка AAB в Play Console
```

Скрипт `scripts/release.mjs`: проверяет версию (`app.json`) и заметки
(`release-notes/engine.md` — номер верхней секции должен совпасть), собирает
профиль EAS (`preview` → APK, `production` → AAB), скачивает артефакт, создаёт
релиз `engine-v<версия>` с файлом `positronium.apk`, пишет `app-release.json`
и коммитит его.

Другие режимы: `--build-id <id>` (опубликовать уже собранную сборку),
`--skip-build` (взять последнюю успешную), `--dry-run` (показать план).

Постоянная ссылка, которую можно давать людям:
<https://github.com/rpg-companios/ttrpg-engine/releases/latest/download/positronium.apk>.

## Чей аккаунт Expo владеет проектом

`app.json` → `extra.eas.projectId` (сейчас
`3f9910a4-6111-4eba-b6e1-382da3b977ad`) закрепляет приложение за конкретным
аккаунтом Expo. Если войти другим аккаунтом, EAS ответит

```
Entity Not Authorized: AppEntity[...] (action = READ)
```

и сборка не начнётся. `npx eas-cli whoami` показывает, под кем вы вошли;
`release.sh` печатает эту же строку перед сборкой и при отказе подсказывает
дальнейшие шаги.

Три способа привести аккаунт и проект в согласие:

1. **Войти владельцем** — собрать `EXPO_TOKEN` в этом аккаунте
   (<https://expo.dev/settings/access-tokens>) и положить его в
   Replit → Tools → Secrets. Ничего в проекте менять не нужно, keystore
   Android остаётся прежним.
2. **Передать проект** — expo.dev → проект → Project settings → Transfer
   на нужный аккаунт.
3. **Создать новый проект** — `npx eas-cli init` в проекте движка запишет
   новый `projectId` и `updates.url` в `app.json`. Тогда правку надо перенести
   в `app.json` **смешанного** репозитория: в движок `app.json` приезжает
   публикацией, и следующий `publish-engine.sh` вернул бы старое значение.
   У нового проекта будет новый keystore: уже установленный APK так не
   обновить (подпись другая), его придётся переустановить.

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
