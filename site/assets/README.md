# Ассеты сайта — что и куда положить

Папка `assets/img/` копируется генератором в `docs/assets/img/`.
Отсутствующий файл не роняет страницу — подставляется плитка-заглушка с именем файла.

## Уже лежит в репозитории

- `fallout-logo.png` — логотип «FALLOUT» для hero (из `logos.png` ваших выгрузок, уменьшено).
- `hero-panorama.jpg`, `hero.jpg` — фон hero (ключевой арт FO76 из ваших выгрузок, `lxksyhm.png`).
- `fallout-76.jpg` — запасной фон страницы (вариант фона).
- `main-background.jpg` — **фон всей страницы** (light-текстура, fixed, cover).
- `food-truck-pattern.jpg` — **паттерн панелей**.
- `plates/` — плашки разделов: `lblue-2.png` (A), `green.png` (B), `orange.png` (он же orange2), `pink.png` (A).
- `origins/*.png` — 18 портретов из приложения (`modules/fallout/assets/origins/`) + `origins/bg-fon-3.png` (подложка) + `back.png`.
- `perks/images/default.png` — заглушка для перков без картинки.

## 1. Происхождения → `assets/img/origins/`

| Файл | Происхождение | Файл | Происхождение |
|---|---|---|---|
| brotherhood_of_steel.png | Братство Стали | mister_handy.png | Мистер Помощник |
| ncr_citizen.png | Житель НКР | robobrain.png | Робомозг |
| minuteman.png | Минитмен | securitron.png | Секьюритрон |
| child_of_atom.png | Дитя Атома | protectron.png | Протектрон |
| vault_dweller.png | Обитатель убежища | assaultron.png | Штурмотрон |
| ghoul.png | Гуль | shadow.png | Тень |
| survivor.png | Выживший | synth.png | Синт |
| super_mutant.png | Супермутант | tribal.png | Дикарь |
| brotherhood_outcast.png | Изгой Братства Стали | 3families.png | Три семьи (новая книга) |

**Нет:** `enclaveRemnant` (Осколок Анклава) — нужен оригинальный файл.
«Три семьи» — текста нет ни в статье Joomla, ни в компаньоне: пока стоит заглушка, пришлите интро.

## 2. Перки → `assets/img/perks/images/`

Шаблон имени: `<id>.png`, где `id` — кебаб-имя id из data-файла компаньона (camelCase → дефисы): `animalFriend → animal-friend.png`, `aquaboy → aquaboy.png`, `radResistant → rad-resistant.png`. Полное соответствие «перк ↔ файл» — в `content/perks.json` (поле `image`). Отсутствующие файлы подменятся `default.png`. Старый набор vault-boy жил в `images/vaultboys/` (формат `<perk>.webp.png`) — имена в основном совпадают с кебаб-id.

## 3. Категории-хабы → `assets/img/hubs/` (webp/png, ~1200×675)

Отсутствуют (у карточек показывается заглушка с именем файла):

- small-guns.png — Стрелковое
- melee.png — Ближнее и рукопашный бой
- energy.png — Энергетическое
- explosives.png — Гранаты и взрывчатка
- heavy.png — Тяжёлое
- thrown.png — Метательное
- armor-leather.png — Кожаная броня
- armor-metal.png — Металлическая броня
- armor-power.png — Силовая броня
- food-cooked.png — Готовые блюда
- food-raw.png — Сырые ингредиенты
- food-preserved.png — Консервы и запасы
- drinks.png — Напитки
- beast-animals.png — Животные и насекомые
- beast-mutated.png — Мутировавшие гуманоиды
- beast-robots.png — Роботы
- beast-raiders.png — Рейдеры
- beast-supermutant.png — Супермутанты
- vault-promo.jpg — промо-тайл «Обитатель Убежища»

## 4. Правила

- Форматы: webp/png для графики, jpg для фотографий; имена латиницей в нижнем регистре через дефис.
- Исходники живут только в этом каталоге репозитория; крупные (>1 МБ) лучше прогонять через сжатие.
