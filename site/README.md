# Fallout 2d20 — сайт-справочник

Статический сайт-справочник по настольной ролевой игре «Fallout: The Roleplaying Game» (Fallout 2d20). Дизайн-система и план — в репозитории приложения `Fallout-2d20-companion` (`docs/site/design-system-and-static-generation.md`), этот репозиторий — только сайт.

> **История восстановлена 2026-11-10.** Среда была сброшена, локальная копия с историей версий v0.x утеряна. Репозиторий пересобран по записям и скриншотам (v0.27.1). Визуальная система воспроизведена, но не побайтово. Дампы Joomla/SPPB (`jos_content.json`, `jos_sppagebuilder.zip`) лежат в git с первой версии.

## Статус

Главная (плашки «Правила игры» + списки), плашечная навигация ≥768px (ниже — чёрная полоса с бургером, промежуточного состояния нет), хабы 1-го уровня (оружие, броня, еда, бестиарий), хаб «Снаряжение» (`gear.html`), происхождения (`origins.html`, 19 карточек), перки (`perks.html`, 185 из компаньона), заглушка «Форум» (`forum.html`), карта сайта `nav.html`, 404. Вывод в `docs/`.

## Сборка

Требуется Node.js ≥ 18, зависимостей нет.

```bash
npm run build            # node build.mjs -> docs/
python3 preview_server.py 8091   # предпросмотр на http://localhost:8091
```

## Панель шрифтов (временная)

Тёмная строка в самом верху каждой страницы — выбор шрифта заголовков. Кандидаты: **Bootstrap: system-ui** (родной стек `--bs-font-sans-serif`: system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Liberation Sans, Arial — дефолт, ничего не скачивается), PT Sans, Noto Sans, Roboto, Roboto Slab — загружаемые варианты с кириллицей, каждый пункт показан своим шрифтом. Выбор применяется к CSS-переменной `--heading-font` и сохраняется в localStorage вашего браузера. Тело страницы набирается Rubik. Когда шрифт выбран — «зашиваем» его в `--heading-font` в `css/site.css` и удаляем панель.

## Структура

```
site.config.json   страницы, навигация, модули и позиции ("Joomla-стиль")
build.mjs          генератор docs/ (layout + positions + block renderers)
content/           JSON-контент (origins.json, perks.json — слиты из компаньона)
css/               site.css — дизайн-токены и компоненты
assets/            ассеты, копируются в docs/assets (см. assets/README.md)
docs/              результат сборки (коммитится, это предпросмотр)
jos_content.json, jos_sppagebuilder.zip   выгрузки Joomla/SPPB — исходники
```

## Модули и позиции

Layout объявляет позиции: `head`, `nav`, `breadcrumbs`, `main-bottom`, `footer`.
`site.config.json → modules[]` назначает типы модулей на позиции с привязкой к страницам (`pages: "*" | [slug]`).

## Деплой

Содержимое `docs/` — готовая статика: залить на хостинг любым способом. Node на сервере не нужен.
