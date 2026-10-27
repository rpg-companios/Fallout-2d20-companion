# Кузница предметов (fallout2d20forge)

Генератор паков контента для приложения [Positronium](https://github.com/rpg-companios/Fallout-2d20-companion):
создаёт оружие / моды оружия / патроны и выдаёт один `<packId>.content.json`,
который загружается в приложение («Игровой сеттинг» → «Паки контента»).

**Самодостаточный проект**: сборка и рантайм не читают файлы основного
приложения. Данные для кастомного арсенала Кузница хранит у себя слепками:

| Файл | Что это | Источник |
|---|---|---|
| `src/data/forge-refs.json` | справочники сеттинга (оружие/моды/патроны/качества/эффекты, типы урона, навыки, слоты) | `modules/fallout/data` + `modules/fallout/i18n` |
| `src/itempack/contract.js`, `src/itempack/validate.js` | контракт и валидатор паков (одни правила на генератор и приложение) | `src/itempack/` основного репо |

Оба — со штампом `GENERATED`: **руками не редактировать**. Обновление
(когда в основном репо появилось новое оружие/качество/правило контракта):

```bash
# рядом клонирован https://github.com/rpg-companios/Fallout-2d20-companion
npm run sync                                    # ../Fallout-2d20-companion
npm run sync -- --from /path/to/Fallout-2d20-companion
```

После sync — `npm test` (гейт целостности слепка + round-trip), коммит.

## Разработка

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest: round-trip + целостность слепка
npm run build      # tsc --noEmit + vite build → dist/ (статика)
```

Базовый путь публикации — переменная `VITE_BASE`:

```bash
VITE_BASE=/fallout2d20forge/ npm run build   # проектная страница GH Pages
npm run build                                # собственный домен / корень сайта
```

## Публикация (GitHub Pages, PWA)

Workflow `.github/workflows/pages.yml` уже в репозитории:

1. Settings → Pages → Source: **GitHub Actions**.
2. Push в `main` → сборка с тестами → деплой.
3. Сайт: `https://rpg-companios.github.io/fallout2d20forge/`.

PWA: манифест `public/manifest.webmanifest`, service worker `public/sw.js`
(офлайн-статика). Справочники зашиты в бандл — офлайн-режим работает,
обновление каталогов = `npm run sync` + пересборка (явно, не молча).

## Правила (закреплены планом item-forge-plan в основном репо)

- Новые условия/механики влияний — сначала в движок приложения, потом пунктом
  в генераторе. Кода механик в паках нет и не будет.
- Валидатор общий с приложением: файл, который собрала Кузница, обязан
  проходить тот же `validateContentPack` при загрузке в игру (гейт —
  тесты round-trip).
- id предметов — `hb_<packId>_…` (префикс ставится автоматически).
- Этапы после прототипа P: броня/одежда, интерпретатор деревьев влияний —
  план: `docs/architecture/item-forge-plan.md` в основном репозитории.
