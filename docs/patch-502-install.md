# Установка патча 502: сейв из файла экспорта читается на любой глубине

> **Мультиплатформенный сейв и JSON-перенос хранилища — см. `docs/patch-509-install.md`.**

> **Патч 508 заменяет слой хранения склада — см. `docs/patch-508-install.md`.**
> **«Общее хранилище» комнаты — шаг 1 внедрения, см. `docs/patch-507-install.md`.**

> **Одноразовый доступ к терминалу, уведомление Мастеру и «Покинуть локацию» — в `docs/patch-506-install.md`.**

> **Успешный взлом больше не пропадает, Мастер получает уведомление — в `docs/patch-505-install.md`.**
> **Решение Мастера вместо блокировки после провала — в `docs/patch-504-install.md`.**
> **Доска из трёх групп и новая логика подсказок — в `docs/patch-503-install.md`.**

Патч подготовлен от состояния **версии 501** (коммит `28c861b`, ветка
`arena/054e6676-fallout-2d20-companion`). Он применим и к чистому `main`
`a62ec7109b50ad720641a4fdeb48f1de865d8742` — тогда установщик подтянет
патчи 493–502 цепочкой.

## Что случилось

Владелец прислал часть настоящего сейва персонажа и написал, что на
терминале 5 сложности по-прежнему видит 21 слово:

```json
{
  "format": "rpg-companion-character",
  "version": 1,
  "exportedAt": "2026-11-02T19:07:58.523Z",
  "character": {
    "id": "char_1793455951437_wluz0q9ck",
    "name": "ывывы",
    "level": 4,
    "originName": "brotherhood",
    "data": {
      "characterName": "ывывы",
      "attributes": [
        { "name": "INT", "value": 10 },
        { "name": "LCK", "value": 10 }
      ],
      "skills": [ { "name": "SCIENCE", "value": 6 } ]
    }
  }
}
```

Это **файл экспорта**: лист персонажа лежит в `character.data` — на два уровня
глубже, чем в сетевом конверте `CHAR_PUBLISH` (`{ name, data: <лист> }`), с
которым работал патч 501. Если в комнату публикуется весь файл экспорта (или
JSON-строка с ним), атрибуты остаются вне досягаемости, ИНТ и УДЧ снова
подменяются четвёркой и доска собирается как `25 − 4 = 21`:

| Вариант доставки сейва | 501 | 502 |
|---|---|---|
| сам лист `character.data` | 15 | 15 |
| `CHAR_PUBLISH { name, data: <лист> }` | 15 | 15 |
| **весь файл экспорта** | **21** | **15** |
| **`CHAR_PUBLISH { data: <файл экспорта> }`** | **21** | **15** |
| **`CHAR_PUBLISH { data: "<JSON файла>" }`** | **21** | **15** |
| только узел `character` | 15 | 15 |
| двойная обёртка | 21 | 15 |

С присланным сейвом (ИНТ 10, УДЧ 10, Наука 6) версия 502 даёт:

```
ИНТ 10 | УДЧ 10 | Наука 6 → 15 слов, 4 скобки, 4 попытки, шанс возврата 20 %
```

## Что исправлено

- `server/terminalHacking.js` — `normalizeCharacterSnapshot()` теперь обходит
  конверты `data`, `character`, `characterData`, `payload`, `snapshot`, `save`
  на глубину до 12 слоёв, разбирает строковый JSON на любом уровне, выбирает
  самый глубокий слой, где есть `attributes`/`skills`/`selectedPerks`, и
  сохраняет служебные поля внешних обёрток (`terminalHacking`, `equipment`,
  `usedMagazineEffects`). Защита от циклических ссылок — множество `seen`.
- Имя оператора проставляется прямо в `createGame()` (раньше только в
  `applyGameAction('start')`), поэтому окно взлома не теряет имя персонажа.
- Баланс и правила 496–501 **не менялись**: `N = max(4, 15 + 2·D − ИНТ)`,
  на D5 это `25 − ИНТ`, 4 попытки, скобки по Науке, удача 5–20 %, словарь
  12 308 слов, интерфейс без служебных строк.

## Регрессионная приёмка

`__tests__/room/terminal-export-envelope-502.test.js` (5 тестов) использует
присланный фрагмент сейва дословно: весь список атрибутов, 17 навыков,
`selectedSkills`, `extraTaggedSkills`, `forcedSelectedSkills`, происхождение и
черту характера. Проверяются:

- весь файл экспорта → 15 слов, 15 % → нет, **20 %** возврата, оператор «ывывы»;
- восемь вариантов обёрток, включая JSON-строку и двойной конверт;
- путь через `createRoomRegistry()` с опубликованным файлом экспорта;
- сохранение `terminalHacking` / `equipment.items` внешнего конверта;
- формы из версии 501 и каноническая формула (ИНТ 4 → 21 слово).

## Через `apply-patch.sh` (основной способ)

```bash
./apply-patch.sh 502
```

С чистого `main` со старым установщиком
(`arena/c1c60b87-fallout-2d20-companion`) один раз переключите источник:

```bash
git fetch origin arena/054e6676-fallout-2d20-companion
sed -i 's|arena/c1c60b87-fallout-2d20-companion|arena/054e6676-fallout-2d20-companion|' apply-patch.sh
./apply-patch.sh 502
```

`patchs/baseline.json` в ветке-источнике равен `502`, поэтому при установке
точно до отсечки дерево приводится к коммиту патча целиком, а каталог
`patchs/` синхронизируется (появится и
`patchs/502-export-envelope.patch`). `./apply-patch.sh --status` до установки
может написать «Всё актуально» — ориентируйтесь на `public/version.json` и
явно указывайте номер.

После установки: `public/version.json` → `502`, `patchs/baseline.json` → `502`;
закоммитьте изменения и **перезапустите сервис Node.js** (`server/` считает
доску). Веб-сборку пересоберите. Уже начатые партии запустите заново кнопкой
**«Сброс»** у Мастера: доска, сгенерированная старым кодом, останется из
21 слова, пока партию не пересоздадут.

## Проверка

```bash
npm run typecheck
npx vitest run __tests__/room/terminal-export-envelope-502.test.js
npx vitest run
CI=1 EXPO_NO_TELEMETRY=1 NODE_ENV=production npm run build
curl -s http://localhost:5000/version.json | grep '"version": "502"'
```

Проверка на вашем сейве (должно быть `15`, а не `21`) — сохраните файл
экспорта как `/tmp/character.json`:

```bash
node -e "
const fs = require('fs');
const e = require('./server/terminalHacking.js');
const save = JSON.parse(fs.readFileSync('/tmp/character.json', 'utf8'));
const g = e.createGame({ config: { containerId: 't', name: 'T', difficulty: 5 },
  operatorClientId: 'p', operatorCharacterId: 'c', characterSnapshot: save,
  now: 100, rng: () => 0.42 });
console.log('ИНТ', g.intelligence, '| УДЧ', g.luck, '| Наука', g.science,
  '| слов', g.wordCount, '| скобок', g.bracketRanges.length,
  '| шанс', g.recoveryChancePercent + '%');
"
```

### Прямой `git apply` без установщика

Патч-файл не может содержать сам себя, поэтому при ручном наложении его нужно
скопировать в `patchs/` отдельно:

```bash
git apply patchs/502-export-envelope.patch
cp /path/to/502-export-envelope.patch patchs/
```
