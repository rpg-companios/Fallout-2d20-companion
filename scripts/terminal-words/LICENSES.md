# Источники и лицензии словаря мини-игры взлома

Словарь — **наша компиляция**: мы сами выбираем длины, порог узнаваемости,
белый и чёрный списки и собираем шесть файлов. Но слова и критерий
узнаваемости взяты из двух чужих работ; это указано здесь явно, как и требовал
владелец. Оба источника **разрешают коммерческое использование** при условии
уведомления. Исходные файлы лежат рядом и являются **только входными данными
сборки** — в бандл приложения попадают лишь шесть маленьких JSON.

## Коммерческое использование — короткий ответ

| Источник | Коммерция | Условие |
|---|---|---|
| EOWL / UKACD | разрешена: «There are no other restrictions» | заметно вывести копирайт UKACD и включить текст лицензии дословно |
| ESDB / SCOWL | разрешена прямо: «…distribute, and **sell** any part…» | копирайт Kevin Atkinson в копиях и в документации |
| Наш `filter.json` и генератор | наше, без условий | — |
| ~~google-10000-english (20k)~~ | **исключён** | автор не рекомендует коммерцию без лицензии LDC; в сборке не участвует |

Раньше в качестве фильтра узнаваемости использовался `20k.txt` из
`first20hours/google-10000-english`. Он заменён на ESDB/SCOWL: у того списка
LICENSE.md прямо говорит, что коммерческое использование не рекомендуется без
лицензии Linguistic Data Consortium. Файл удалён из репозитория, генератор его
не читает.

## 1. EOWL / UKACD — собственно слова

`eowl-words.txt` — English Open Word List v1.1.2 (128 977 слов), взят из
[brianburton/fallout_terminal_hack_game](https://github.com/brianburton/fallout_terminal_hack_game/blob/master/words.txt).
Код того репозитория — BSD 3-Clause, Copyright (c) 2017 Brian Burton.

EOWL почти целиком производная от UK Advanced Cryptics Dictionary v1.6.
Дословный текст лицензии (из
[kloge/The-English-Open-Word-List](https://github.com/kloge/The-English-Open-Word-List),
раздел «UK Advanced Cryptics Dictionary Licensing Information»):

> UK Advanced Cryptics Dictionary Licensing Information:
>
> Copyright © J Ross Beresford 1993-1999. All Rights Reserved. The
> following restriction is placed on the use of this publication: if the
> UK Advanced Cryptics Dictionary is used in a software package or
> redistributed in any form, the copyright notice must be prominently
> displayed and the text of this document must be included verbatim.
>
> There are no other restrictions: I would like to see the list
> distributed as widely as possible.

**Условие выполнено в патче 495:** одного файла в `scripts/` недостаточно —
UKACD требует «prominently displayed» notice. Дословный текст выведен в окне
«О приложении / Благодарности» (`components/screens/HomeScreen/HomeScreen.js`,
ключи `about.licenseUkacd` / `about.licenseEsdb` в RU и EN), а также лежит в
`server/terminalWords/manifest.json` и `docs/terminal-words.md`. Для
коммерческой версии достаточно не убирать этот экран.

Кроме того, окно «О приложении» сообщает, что проект неофициальный и фанатский,
перечисляет правообладателей (Bethesda Softworks, ZeniMax Media, Microsoft,
Modiphius Entertainment) и указывает, что код движка распространяется по
**GNU Affero General Public License (AGPL)**, а игровые данные и словари
подготовлены участниками сообщества.

## 2. ESDB / SCOWL — фильтр узнаваемости

`scowl-common-35.txt` — слова размера `<= 35` из English Speller Database
([en-wl/wordlist](https://github.com/en-wl/wordlist), наследник SCOWL),
длиной 4–9 букв, 12 650 записей. Используется только на этапе сборки: в
готовый словарь попадают не его строки, а слова EOWL, прошедшие пересечение.
Размер `<= 35` — базовая полоса «обычных» слов спеллчекера; она отсекает
редкости (`aah`, `aalii`, `acta`) и при этом не содержит помеченных UKACD
записей размера 85.

Полный дословный текст копирайта ESDB лежит в `LICENSES-ESDB.txt` (копия файла
`Copyright` из исходного репозитория). Его основное условие:

> Copyright 2000-2026 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute, and sell any part of the English
> Speller Database (ESDB, previously known as SCOWLv2), or word lists
> created from it, is hereby granted without fee, provided that the above
> copyright notice appears in all copies and that both the above copyright
> notice and this notice appear in supporting documentation.

То есть продавать результат можно; нужно сохранить копирайт в копиях и
документации. `LICENSES-ESDB.txt` должен поставляться вместе со словарём.

## 3. Наша часть

- `filter.json` — белый список (прежние 282 слова мини-игры, примеры владельца
  `steps`, `drops`, `cross`, `score`, `course`, `foots`, `boots`, `boost`,
  `stuff`, `dice`, `post`, `spot`, `stop`, `pots`, `tops`, `opts`, `afterlife`),
  чёрный список ругани/редкостей и `verifiedNonEowl`. Составлен и
  поддерживается нами.
- `build-terminal-words.mjs` — наш генератор, формат шести JSON, manifest,
  загрузчик и тесты — наш код.
- `STOOF` и прочие несуществующие слова попасть не могут: всё берётся из EOWL
  или из проверенного белого списка, генератор падает при попытке добавить
  непроверенное слово.

Чёрный список ругани исторически сверялся с разницей `google-10000-english` и
его `no-swears`-варианта, но это просто наш перечень слов в `filter.json`;
никакой файл того репозитория в сборке не читается и не распространяется.
