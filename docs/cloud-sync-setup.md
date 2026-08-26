# Google Drive sync — настройка для запуска

**Статус:** инструкция для владельца проекта.
**Контекст:** кнопка «Синхронизировать с Google Drive» в бургер-меню, а также
автосинк при изменении персонажа, **уже полностью реализованы в коде**
(`components/cloudSync/googleDriveSync.js`). Сами по себе они не работают только
потому, что не задан OAuth Client ID. Эта инструкция закрывает оставшийся шаг
(настройка в Google Cloud Console + уже вшитый Client ID).

---

## 0. Что уже сделано в коде

- `domain/characterTransfer.js` → формат экспорта `rpg-companion-character`.
- `components/cloudSync/googleDriveSync.js` → вся логика Drive:
  - `getModuleFolderId` — ищет/создаёт подпапку сеттинга **внутри `appDataFolder`**;
  - `listRemoteCharacterFiles` / `downloadRemoteCharacter` / `uploadCharacterFile`;
  - `syncAllCharactersWithCloud` — кнопка в меню (полный обмен);
  - `syncCharacterToCloudIfEnabled` — вызывается на каждом автосейве персонажа
    (`CharacterContext`), т.е. изменил персонажа → ушло в Drive.

## 0.1 Где храним сейвы: `appDataFolder`

В Google Drive API есть специальное пространство, которое называется `appDataFolder`
(Папка данных приложения).

- Это **скрытая** папка на диске пользователя.
- Пользователь **НЕ ВИДИТ** эти файлы в интерфейсе своего Гугл Диска.
- Доступ к ней имеет **только твоё приложение**.
- Она создана специально для конфигураций и **cloud saves** (облачных сохранений).

Поэтому облачные сохранения пишутся именно в `appDataFolder`, а не в обычную
видимую папку «Моёго диска» (`fallout2d20`).

### Разбивка по сеттингам

Сеттинг — это **модуль** (`modules/<id>`), активный сеттинг определяется
`getActiveModuleId()`. Сейчас зарегистрирован `fallout`, но движок готов к
нескольким (`fallout`, `heroes`, `dnd`, …).

Каждый сеттинг использует **свою подпапку** внутри `appDataFolder`:

```
appDataFolder/
  fallout/     ← сейвы сеттинга Fallout 2d20
  heroes/      ← (будущий) сейвы сеттинга Heroes
  dnd/         ← (будущий) сейвы сеттинга DnD
```

- Имя подпапки = **id модуля** (`fallout`, `heroes`, `dnd`, …).
- **Каждый сеттинг читает только свою подпапку.** Сейв Fallout не загрузится в
  DnD и наоборот — при смене сеттинга в движке приложение смотрит в другую
  подпапку и видит только «свои» сохранения.
- Имена файлов внутри подпапки: `<id>__<имя>.json` (сеттинг уже зашит в папку,
  поэтому префикс в имени не нужен).

> Альтернатива (не выбрана): хранить все сейвы в `appDataFolder` плоско и
> различать их префиксом в имени файла (`fallout__<id>__<имя>.json`). Сейчас
> выбран вариант с подпапками — он чище разделяет сеттинги и не требует
> разбора префикса в имени.
- `powerArmor`/`CharacterContext` уже прокидывают вызовы.
- В `public/index.html` добавлен
  `window.FALLOUT_GOOGLE_DRIVE_CLIENT_ID = '<client-id>'` — статичная сборка
  (PWA) подхватывает его на любом хосте (replit.app / na4u.ru / локально).

## 1. Осталось сделать ТОЛЬКО в Google Cloud Console (руками)

Ниже шаги на [console.cloud.google.com](https://console.cloud.google.com) — это
единственная часть, которую нельзя сделать кодом (нужна авторизация твоего
Google-аккаунта).

### 1.1 Включить Google Drive API
1. Открой проект (или создай новый).
2. **APIs & Services → Library** → найди «Google Drive API» → **Enable**.

### 1.2 Настроить OAuth Consent Screen
1. **APIs & Services → OAuth consent screen**.
2. **User type**: `External` (или `Internal` для домена Workspace).
3. Заполни название приложения и e-mail.
4. **Scopes**: добавь
   - `.../auth/drive.file` (манипуляции с файлами, которые создаёт приложение);
   - `.../auth/drive.metadata.readonly` (чтение метаданных списка файлов).
   Оба уже запрошены в `TOKEN_SCOPE` в `googleDriveSync.js`.
5. Пока приложение в **Testing** режиме — добавь **Test users**: свой Google
   аккаунт (иначе авторизация отбивает «Access blocked»).

### 1.3 Создать OAuth Client ID (тип — Web application)
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. **Application type**: `Web application`.
3. В **Authorized JavaScript origins** впиши **оба** домена, где открывается приложение
   (точно, без слэша в конце):
   ```
   https://fallout-2-d-20-companion--handylinux.replit.app
   https://fallout2d20-companion.na4u.ru
   ```
   При необходимости добавь `http://localhost:8081` (Expo web dev) и
   `http://localhost:5000` (локальная сборка `serve`).
4. Нажми **Create** → получишь Client ID вида
   `808936097288-....apps.googleusercontent.com`. Он уже вшит в `index.html`.

> Важно: для браузерного OAuth с `initTokenClient` используется только
> **Client ID** (не секрет). Секрет нужен только для серверного потока — тут он
> не используется, поэтому хранить в коде Client ID безопасно.

## 2. Как проверить, что работает

1. Собери и задеплой на нужный домен: `npm run build` (`expo export --platform web`),
   затем `npm run serve` или выгрузи `dist/` на хостинг.
2. Открой приложение на домене из п.1.3.
3. Бургер-меню → **«Синхронизировать с Google Drive»**.
   - Откроется окно Google для выбора аккаунта.
   - После согласия в **`appDataFolder`** появится подпапка текущего сеттинга
     (например `fallout/`), в ней файлы `<id>__<имя>.json`. Проверить это в
     обычном интерфейсе Диска нельзя — `appDataFolder` скрыта; наличие файлов
     видно по логу синхронизации и по тому, что персонаж подтягивается из
     облака на другом устройстве.
4. Измени что-нибудь в персонаже → через пару секунд файл в Drive обновится
   (вызов `syncCharacterToCloudIfEnabled` на автосейве).

Если появится `Google Drive API error (403)` — не включён Drive API или не
добавлен scope/`Test user`. Если `401`/`origin mismatch` — неверный origin в
Authorized JavaScript origins.

## 3. Про имя папки

Код пишет сейвы в **`appDataFolder`** (скрытая папка приложения), а внутри —
подпапка текущего сеттинга (`fallout/` и т.д.). Это НЕ обычная видимая папка в
«Моём диске». Менять имя корневого каталога на `appData`/`fallout2d20` не нужно —
в видимой части Диска этих папок не будет.

## 4. Альтернатива вместо правки index.html

Если хочешь не зашивать id в `index.html`, а задавать на сборке через env
(нужно `EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID` в момент `expo export`):

```
EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=808936097288-....apps.googleusercontent.com
```

Код в `googleDriveSync.js` сначала читает `process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID`,
затем `window.FALLOUT_GOOGLE_DRIVE_CLIENT_ID`. Сейчас сработает вариант с `window`,
он одинаков для всех доменов, поэтому менять ничего не нужно.
