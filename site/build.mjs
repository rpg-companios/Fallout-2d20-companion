#!/usr/bin/env node
/**
 * Fallout 2d20 — статический генератор (без зависимостей, node >= 18).
 *
 *   node build.mjs            # собрать docs/
 *
 * Источники:
 *   site.config.json          — страницы, модули, позиции ("Joomla-стиль":
 *                               позиции объявляет layout, модули назначает конфиг,
 *                               привязка к страницам — полем pages)
 *   content/*.json            — переиспользуемый контент (origins.json, perks.json)
 *
 * Примечание: репозиторий пересобран 2026-11-10 после сброса песочницы;
 * история версий v0.x утрачена, ведём с v0.27.1.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, openSync, readSync, closeSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'docs');
const CFG = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BTN_SVG = '<svg width="36px" height="23px" viewBox="0 0 66 43" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true"><g id="arrow" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><path class="one" d="M40.1543933,3.89485454 L43.9763149,0.139296592 C44.1708311,-0.0518420739 44.4826329,-0.0518571125 44.6771675,0.139262789 L65.6916134,20.7848311 C66.0855801,21.1718824 66.0911863,21.8050225 65.704135,22.1989893 C65.7000188,22.2031791 65.6958657,22.2073326 65.6916762,22.2114492 L44.677098,42.8607841 C44.4825957,43.0519059 44.1708242,43.0519358 43.9762853,42.8608513 L40.1545186,39.1069479 C39.9575152,38.9134427 39.9546793,38.5968729 40.1481845,38.3998695 C40.1502893,38.3977268 40.1524132,38.395603 40.1545562,38.3934985 L56.9937789,21.8567812 C57.1908028,21.6632968 57.193672,21.3467273 57.0001876,21.1497035 C56.9980647,21.1475418 56.9959223,21.1453995 56.9937605,21.1432767 L40.1545208,4.60825197 C39.9574869,4.41477773 39.9546013,4.09820839 40.1480756,3.90117456 C40.1501626,3.89904911 40.1522686,3.89694235 40.1543933,3.89485454 Z" fill="#FFFFFF"></path><path class="two" d="M20.1543933,3.89485454 L23.9763149,0.139296592 C24.1708311,-0.0518420739 24.4826329,-0.0518571125 24.6771675,0.139262789 L45.6916134,20.7848311 C46.0855801,21.1718824 46.0911863,21.8050225 45.704135,22.1989893 C45.7000188,22.2031791 45.6958657,22.2073326 45.6916762,22.2114492 L24.677098,42.8607841 C24.4825957,43.0519059 24.1708242,43.0519358 23.9762853,42.8608513 L20.1545186,39.1069479 C19.9575152,38.9134427 19.9546793,38.5968729 20.1481845,38.3998695 C20.1502893,38.3977268 20.1524132,38.395603 20.1545562,38.3934985 L36.9937789,21.8567812 C37.1908028,21.6632968 37.193672,21.3467273 37.0001876,21.1497035 C36.9980647,21.1475418 36.9959223,21.1453995 36.9937605,21.1432767 L20.1545208,4.60825197 C19.9574869,4.41477773 19.9546013,4.09820839 20.1480756,3.90117456 C20.1501626,3.89904911 20.1522686,3.89694235 20.1543933,3.89485454 Z" fill="#FFFFFF"></path><path class="three" d="M0.154393339,3.89485454 L3.97631488,0.139296592 C4.17083111,-0.0518420739 4.48263286,-0.0518571125 4.67716753,0.139262789 L25.6916134,20.7848311 C26.0855801,21.1718824 26.0911863,21.8050225 25.704135,22.1989893 C25.7000188,22.2031791 25.6958657,22.2073326 25.6916762,22.2114492 L4.67709797,42.8607841 C4.48259567,43.0519059 4.17082418,43.0519358 3.97628526,42.8608513 L0.154518591,39.1069479 C-0.0424848215,38.9134427 -0.0453206733,38.5968729 0.148184538,38.3998695 C0.150289256,38.3977268 0.152413239,38.395603 0.154556228,38.3934985 L16.9937789,21.8567812 C17.1908028,21.6632968 17.193672,21.3467273 17.0001876,21.1497035 C16.9980647,21.1475418 16.9959223,21.1453995 16.9937605,21.1432767 L0.15452076,4.60825197 C-0.0425130651,4.41477773 -0.0453986756,4.09820839 0.148075568,3.90117456 C0.150162624,3.89904911 0.152268631,3.89694235 0.154393339,3.89485454 Z" fill="#FFFFFF"></path></g></svg>';

/* Иконка боевого кубика (заменитель {/CD} из данных приложения):
   d20-силуэт, рисуется инлайн-SVG в цвет текста. */
const CD_ICON = '<svg class="cd-icon" viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 1 23 8.5v7L12 23 1 15.5v-7L12 1zm0 2.6L3.4 9.9 12 20.3l8.6-10.4L12 3.6z"/><path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" d="M12 1 23 8.5v7L12 23 1 15.5v-7L12 1z"/></svg>';

/* ---------- панель выбора шрифта заголовков (временная) ----------
   Тёмная строка в самом верху каждой страницы — без гейтов: кнопки
   кандидатов нарисованы своим шрифтом. Выбор применяется к CSS-переменной
   --heading-font и сохраняется в localStorage (переживает переходы).
   По умолчанию — нативный стек Bootstrap (--bs-font-sans-serif).
   Когда шрифт будет выбран — зашиваем его в --heading-font в site.css и удаляем. */
const FONT_HEAD_SCRIPT = `<script>
try { var savedFont = window.localStorage.getItem('heading-font'); if (savedFont) document.documentElement.style.setProperty('--heading-font', savedFont); } catch (e) {}
</script>`;

const FONT_BAR = `<div class="fontbar" role="region" aria-label="Временная панель выбора шрифта заголовков">
  <span class="fontbar-label">Шрифт заголовков</span>
  <button type="button" class="fontbar-option" data-stack='system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif' style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue','Noto Sans','Liberation Sans',Arial,sans-serif">Bootstrap: system-ui</button>
  <button type="button" class="fontbar-option" data-stack='"PT Sans", "Arial", sans-serif' style="font-family:'PT Sans',Arial,sans-serif">PT Sans</button>
  <button type="button" class="fontbar-option" data-stack='"Noto Sans", "Arial", sans-serif' style="font-family:'Noto Sans',Arial,sans-serif">Noto Sans</button>
  <button type="button" class="fontbar-option" data-stack='"Roboto", "Arial", sans-serif' style="font-family:'Roboto',Arial,sans-serif">Roboto</button>
  <button type="button" class="fontbar-option" data-stack='"Roboto Slab", "Georgia", serif' style="font-family:'Roboto Slab',Georgia,serif">Roboto Slab</button>
  <button type="button" class="fontbar-reset" title="Вернуть Bootstrap: system-ui">По умолчанию</button>
  <span class="fontbar-note">временная оценка</span>
</div>`;

const FONT_BAR_SCRIPT = `<script>
(function () {
  var bar = document.querySelector('.fontbar');
  if (!bar) return;
  var options = Array.prototype.slice.call(bar.querySelectorAll('.fontbar-option'));
  function mark(stack) {
    options.forEach(function (o) { o.classList.toggle('is-active', o.getAttribute('data-stack') === stack); });
  }
  var saved = null;
  try { saved = window.localStorage.getItem('heading-font'); } catch (e) {}
  mark(saved || options[0].getAttribute('data-stack'));
  options.forEach(function (b) {
    b.addEventListener('click', function () {
      var stack = b.getAttribute('data-stack');
      document.documentElement.style.setProperty('--heading-font', stack);
      try { window.localStorage.setItem('heading-font', stack); } catch (e) {}
      mark(stack);
    });
  });
  bar.querySelector('.fontbar-reset').addEventListener('click', function () {
    document.documentElement.style.removeProperty('--heading-font');
    try { window.localStorage.removeItem('heading-font'); } catch (e) {}
    mark(options[0].getAttribute('data-stack'));
  });
})();
</script>`;

function renderButton(label, href, attrs = '') {
  const a = String(attrs || '').trim();
  // Разметка 1-в-1 из вашего примера: <div class="wrapper"><a class="button_more">…</a></div>
  return `<div class="wrapper"><a class="button_more" href="${esc(href)}"${a ? ' ' + a : ''}><span>${esc(label)}</span><span>${BTN_SVG}</span></a></div>`;
}

/* ---------- modules (Joomla-стиль позиции) ---------- */
function modulesFor(position, pageSlug) {
  return (CFG.modules || [])
    .filter((m) => m.position === position && m.enabled !== false)
    .filter((m) => m.pages === '*' || (Array.isArray(m.pages) && m.pages.includes(pageSlug)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderModule(m, page) {
  switch (m.type) {
    case 'menu': {
      // aria-current: и для бургер-меню (<768px), и для плашек (≥768px)
      const isCurrent = (href) => page.slug === href.replace(/\.html$/, '');
      const items = CFG.nav
        .map((i) => {
          const current = isCurrent(i.href) ? ' aria-current="page"' : '';
          return `<li><a href="${esc(i.href)}"${current}>${esc(i.label)}</a></li>`;
        })
        .join('');
      return `<button class="burger" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="site-nav-list"></button>
<nav class="site-nav" id="site-nav-list" aria-label="Разделы"><ul>${items}</ul></nav>`;
    }
    case 'breadcrumbs': {
      const parts = [`<a href="nav.html">Справочник</a>`, `<span aria-current="page">${esc(page.title)}</span>`];
      return `<div class="container"><nav class="crumbs" aria-label="Хлебные крошки">${parts.join(' › ')}</nav></div>`;
    }
    case 'promo-vault':
      return `<section class="section container" aria-label="Промо">
        <div class="promo-vault">
          <div class="card-img" style="border-radius:6px;aspect-ratio:3/4"><img src="assets/img/hubs/vault-promo.jpg" alt="Обитатель убежища" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'assets/img/hubs/vault-promo.jpg'}))"></div>
          <div>
            <h2>ОБИТАТЕЛЬ УБЕЖИЩА</h2>
            <p>Когда падали бомбы, вам или вашим предкам посчастливилось оказаться в безопасности одном из ста двадцати двух убежищ «Волт-Тек»… Это происхождение скоро станет доступно отдельной статьёй — с атрибутами, чертами и стартовым инвентарём.</p>
          </div>
        </div>
      </section>`;
    case 'back-to-top':
      return `<button class="back-to-top" type="button" aria-label="Наверх">↑</button>
<script>
(function () {
  var btn = document.querySelector('.back-to-top');
  if (!btn) return;
  var onScroll = function () { btn.classList.toggle('visible', window.scrollY > 240); };
  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  onScroll();
})();
</script>`;
    case 'metrics':
      return ''; // выключено в конфиге; включим счётчик после согласования
    default:
      return '';
  }
}

function modules(position, page) {
  return modulesFor(position, page.slug).map((m) => renderModule(m, page)).join('\n');
}

/* ---------- плашечная навигация (≥768px) ----------
   Из вашего image-21 и параметров плашек (SPPB): растянутые плашки menu-item-bg-*,
   белые CAPS, Text Shadow 1px 3px 5px, выравнивание по центру, строка 5px 0,
   шесть равных плашек (bootstrap 2+2+2+2+2+2). Ниже 768px скрыта —
   там чёрная полоса с бургером (.site-header). Промежуточного состояния
   (чёрная полоса с горизонтальным меню) НЕ существует. */
function plateNavHtml(page) {
  const items = (CFG.nav || []).filter((i) => i.plate);
  if (!items.length) return '';
  const links = items
    .map((i) => {
      const current = page.slug === i.href.replace(/\.html$/, '') ? ' aria-current="page"' : '';
      return `<a class="plate ${esc(i.plate)}" href="${esc(i.href)}"${current}><span class="plate-title">${esc(i.label)}</span></a>`;
    })
    .join('\n  ');
  return `<nav class="plate-nav" aria-label="Разделы">
  ${links}
</nav>`;
}

/* ---------- layout ---------- */
function layout(page, bodyHtml) {
  const title = page.slug === 'index' ? CFG.title : `${page.title} — ${CFG.title}`;
  const desc = esc(CFG.description);
  return `<!DOCTYPE html>
<html lang="${esc(CFG.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${desc}">
<link rel="icon" href="assets/img/perks/images/default.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,400..900;1,700..900&family=PT+Sans:wght@400;700&family=Noto+Sans:wght@400;700;800&family=Roboto:wght@400;700;800&family=Roboto+Slab:wght@400;700;800&display=swap">
<link rel="stylesheet" href="css/site.css?v=${esc(PKG.version)}">
${FONT_HEAD_SCRIPT}
${modules('head', page)}
</head>
<body>
${FONT_BAR}
${plateNavHtml(page)}
<header class="site-header">
  <div class="container">
    ${modules('nav', page)}
  </div>
</header>
${modules('breadcrumbs', page)}
${bodyHtml}
<footer class="site-footer">
  <div class="container">
    <div>© 2026 Fallout 2d20. Designed by ВКБ-Сервис.</div>
    <div>Фанатский проект по мотивам «Fallout: The Roleplaying Game». Не связан с Bethesda и Modiphius Entertainment.</div>
  </div>
</footer>
${modules('footer', page)}
${FONT_BAR_SCRIPT}
<script>
(function () {
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('site-nav-list');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    });
  }
})();
</script>
</body>
</html>`;
}


/* размеры PNG без зависимостей (IHDR) — чтобы браузер резервировал место
   под изображение до загрузки и не дёргал верстку при скролле */
function pngSize(file) {
  try {
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(24);
    readSync(fd, buf, 0, 24, 0);
    closeSync(fd);
    if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
  } catch {}
  return null;
}

/* ---------- page types ---------- */
function ctaCard(card) {
  // Структура 1-в-1 из вашего хаба «Тяжёлое оружие» (выгрузка template-241099e4…):
  // кликабельный h2 по центру -> картинка 300px по центру -> .cta-кнопка.
  // Родитель: тонкая 1px граница, фон food-truck-pattern, БЕЗ тени и БЕЗ движения.
  // По умолчанию — заглушка «скоро»; поле link открывает реальный раздел.
  const hasLink = !!card.link;
  const href = hasLink ? card.link : '#';
  const soon = hasLink ? '' : 'title="Статья переносится — следующий этап"';
  const label = card.cta || 'Подробнее';
  return `<article class="hub-card">
  <h2 class="hub-title"><a href="${esc(href)}"${soon ? ' ' + soon : ''}>${esc(card.title)}</a></h2>
  <div class="hub-img"><a href="${esc(href)}"${soon ? ' ' + soon : ''}><img src="${esc(card.img)}" alt="${esc(card.title)}" width="300" loading="lazy" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${esc(card.img)}'}))"></a></div>
  ${renderButton(label, href, soon)}
</article>`;
}

/* ---------- home ---------- */
/* Оглавление «Снаряжение / Правила / …» по образцу выгрузки «Правила игры»:
   рабочие разделы ведут в хабы, переносимые статьи помечены «скоро». */
const TOC_GROUPS = [
  { t: 'Что нужно для игры', items: [
    ['Что может потребоваться на игре (кубики, фишки, листы)', null],
  ]},
  { t: 'Основы игры', items: [
    ['Атрибуты S.P.E.C.I.A.L', null],
    ['Как работает Удача', null],
  ]},
  { t: 'Основы сражений', items: [
    ['Боевые столкновения', null],
    ['Урон и увечья', null],
    ['Лечение', null],
    ['Окружение', null],
  ]},
  { t: 'Создание персонажа', items: [
    ['Как создать персонажа', null],
    ['Листы персонажей (русская версия)', null],
  ]},
  { t: 'Снаряжение', items: [
    ['Оружие', 'weapons.html'],
    ['Броня', 'armor.html'],
    ['Силовая броня', 'armor.html'],
    ['Еда', 'food.html'],
  ]},
  { t: 'Выживание', items: [
    ['Остаться в живых', null],
    ['Обыск локаций', null],
    ['Получение снаряжения', null],
    ['Модификация снаряжения', null],
    ['Крафт', null],
    ['Выжить под водой', null],
    ['Управление транспортом', null],
  ]},
  { t: 'Бестиарий', items: [
    ['Животные и насекомые', 'bestiary.html'],
    ['Супермутанты', 'bestiary.html'],
    ['Рейдеры', 'bestiary.html'],
  ]},
  { t: 'Происхождения', items: [
    ['Выбрать происхождение', 'origins.html'],
  ]},
  { t: 'Сценарии и компании', items: [
    ['Обзор официальных материалов', null],
  ]},
  { t: 'Дополнительно', items: [
    ['Генератор лута', null],
    ['Карточки оружия (английская версия)', null],
  ]},
];

function tocHtml() {
  const groups = TOC_GROUPS.map((g) => {
    const lis = g.items
      .map(([label, href]) =>
        href
          ? `<li><a class="toc-link" href="${esc(href)}">${esc(label)}</a></li>`
          : `<li><span class="toc-soon" title="Перенос со старого сайта — следующий этап">${esc(label)}<em>скоро</em></span></li>`
      )
      .join('');
    return `<section class="toc-group"><h3 class="toc-heading">${esc(g.t)}</h3><ul class="toc-list">${lis}</ul></section>`;
  }).join('');
  return `<div class="toc">${groups}</div>`;
}

function pageHome(page) {
  return layout(page, `<section class="hero">
  <div class="container">
    <span class="badge">Справочник · в разработке</span>
    <img class="hero-logo" src="assets/img/fallout-logo.png" alt="Fallout" width="540" height="241">
    <p>Русскоязычное справочное издание по настольной ролевой игре «Fallout: The Roleplaying Game». Параметры, таблицы и тексты — в одном месте.</p>
  </div>
</section>
<section class="section container">
  <h1 class="page-title">Оглавление</h1>
  <p class="lead">Как в оглавлении «Правила игры» старого сайта: рабочие разделы ведут в хабы, статьи переносятся поэтапно и помечены «скоро».</p>
  ${tocHtml()}
</section>
${modules('main-bottom', page)}`);
}

function pageNav(page) {
  const items = [
    ['Главная', 'index.html', 'стартовая страница'],
    ['Снаряжение', 'gear.html', 'оружие, броня, еда, напитки'],
    ['Оружие', 'weapons.html', '6 категорий'],
    ['Броня', 'armor.html', 'кожаная, металлическая, силовая'],
    ['Еда', 'food.html', 'готовые, сырые, консервы'],
    ['Бестиарий', 'bestiary.html', '5 групп существ'],
    ['Происхождения', 'origins.html', '19 происхождений'],
    ['Перки', 'perks.html', '185 перков из компаньона'],
  ];
  const lis = items
    .map(([label, href, note]) => `<li><a href="${esc(href)}"><span>${esc(label)}</span><small>${esc(note)}</small></a></li>`)
    .join('');
  return layout(page, `<section class="section container">
  <h1 class="page-title">${esc(page.title)}</h1>
  <p class="lead">${esc(CFG.nav.length ? page.lead : '')}</p>
  <ul class="nav-list">${lis}</ul>
  <p class="soon"><b>Скоро:</b> Форум · Правила игры · Новости · карточки предметов и существ · поиск · версия для печати.</p>
</section>`);
}

function pageHub(page) {
  const cards = (page.cards || []).map(ctaCard).join('\n');
  return layout(page, `<section class="section container">
  <h1 class="page-title">${esc(page.title)}</h1>
  <p class="lead">${esc(page.lead)}</p>
  <div class="card-grid">${cards}</div>
</section>`);
}

function pageOrigins(page) {
  const origins = JSON.parse(readFileSync(join(ROOT, 'content/origins.json'), 'utf8'));
  const tiles = origins
    // Ячейка = колонка-изображение (bg-fon-3 по центру) + колонка-текст
    // (food-truck-pattern + жёсткая тень 7px 5px 0 #C3C3C3) — по выгрузке
    // «Происхождения» из вашего SP Page Builder.
    .map((o) => {
      const soon = 'title="Статья переносится — следующий этап"';
      const size = o.img ? pngSize(join(ROOT, 'assets/img/origins', o.img)) : null;
      const wh = size ? ` width="${size.w}" height="${size.h}"` : '';
      const imgHtml = o.img
        ? `<img src="assets/img/origins/${esc(o.img)}" alt="${esc(o.name)}" loading="lazy"${wh} onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${esc(o.img)}'}))">`
        : `<div class="ph">assets/img/origins/${esc(o.id)}.png<br>(нужен оригинал)</div>`;
      return `<div class="origin-cell">
  <div class="origin-portrait"><a href="#" ${soon}>${imgHtml}</a></div>
  <div class="origin-text">
    <h2><a href="#" ${soon}>${esc(o.name)}</a></h2>
    ${o.siteOnly ? '<span class="site-only">только на сайте · новая книга</span>' : ''}
    <p>${esc(o.intro)}</p>
    ${renderButton('Подробнее', '#', soon)}
  </div>
</div>`; })
    .join('\n');
  return layout(page, `<section class="section container origins-wide">
  <h1 class="page-title">${esc(page.title)}</h1>
  <p class="lead">${esc(page.lead)}</p>
  <div class="origin-grid">${tiles}</div>
</section>`);
}

/* ---------- перки ----------
   Данные: content/perks.json — 185 перков из приложения Fallout-2d20-companion
   (RU-названия/описания — modules/fallout/i18n/ru-RU/data/perks/perks.json,
   ранги/требования — modules/fallout/data/perks/perks.json, слиты по id, отсортированы по алфавиту).
   Карточка 1-в-1 из вашего Helix custom.css/js: #cards-container.cards-grid,
   .perk-card* + #filter-attributes с кнопкой «Сбросить» (текст кнопки и цвета — как в Helix).
   Иконка {/CD} — инлайн-SVG вместо images/CD.png.
   Изображения: assets/img/perks/images/<id-кебаб>.png — вы загрузите файлы,
   отсутствующие подменятся default.png (как onerror в оригинале). */
function pagePerks(page) {
  const perks = JSON.parse(readFileSync(join(ROOT, 'content/perks.json'), 'utf8'));
  const cards = perks
    .map((p) => {
      const attrs = (p.attrs || []).join(' ');
      const img = `assets/img/perks/images/${p.image}`;
      const desc = esc(p.description).replace(/\{\/CD\}/g, CD_ICON);
      return `<div class="perk-card" data-attrs="${esc(attrs)}">
  <div class="perk-card-header">${esc(p.title)}</div>
  <div class="perk-card-body">
    <div class="perk-card-image-col"><img src="${esc(img)}" alt="${esc(p.title)}" width="120" loading="lazy" onerror="this.onerror=null;this.src='assets/img/perks/images/default.png';"></div>
    <div class="perk-card-text-col">
      <p><strong>Ранги:</strong> ${esc(p.rank ?? '—')}</p>
      <p><strong>Требования:</strong> ${esc(p.requirements)}</p>
      <div class="perk-card-desc">${desc}</div>
    </div>
  </div>
</div>`;
    })
    .join('\n');
  return layout(page, `<section class="section container">
  <h1 class="page-title">${esc(page.title)}</h1>
  <p class="lead">Перки — это специальные бонусы, которые вы можете получить, чтобы повысить характеристики, навыки и способности персонажа, придать ему уникальное преимущество или совершенно новую способность. У большинства перков есть несколько рангов улучшения и требования, которым должен соответствовать персонаж (уровень, атрибут S.P.E.C.I.A.L и т.п.). <strong>Вы начинаете с 1 перком и можете выбрать новый перк всякий раз, когда получаете новый уровень.</strong></p>
  <div id="perk-filter-panel"><div id="filter-attributes"></div></div>
  <div id="cards-container" class="cards-grid">
${cards}
  </div>
</section>
<script>
(function () {
  var ATTRS = ['СИЛ', 'ВОС', 'ВЫН', 'ХАР', 'ИНТ', 'ЛОВ', 'УДЧ'];
  var container = document.getElementById('cards-container');
  var panel = document.getElementById('filter-attributes');
  if (!container || !panel) return;
  var allCards = Array.prototype.slice.call(container.querySelectorAll('.perk-card'));
  var count = document.createElement('span');
  count.className = 'perk-count';
  count.setAttribute('aria-live', 'polite');

  function applyFilter() {
    var checked = Array.prototype.slice.call(panel.querySelectorAll('input[type="checkbox"]:checked')).map(function (cb) { return cb.value; });
    var visible = 0;
    allCards.forEach(function (card) {
      var req = (card.getAttribute('data-attrs') || '').trim();
      var show = checked.length === 0 || !req || checked.some(function (a) { return req.split(' ').indexOf(a) !== -1; });
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    count.textContent = 'Показано: ' + visible + ' из ' + allCards.length;
  }

  panel.innerHTML = '';
  var title = document.createElement('span');
  title.textContent = 'Фильтр по атрибутам:';
  panel.appendChild(title);
  ATTRS.forEach(function (a) {
    var label = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.value = a;
    input.addEventListener('change', applyFilter);
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + a));
    panel.appendChild(label);
  });
  var reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Сбросить';
  reset.addEventListener('click', function () {
    Array.prototype.forEach.call(panel.querySelectorAll('input[type="checkbox"]'), function (cb) { cb.checked = false; });
    applyFilter();
  });
  panel.appendChild(reset);
  panel.appendChild(count);
  applyFilter();
})();
</script>`);
}

/* ---------- заглушка «скоро» (Форум) ---------- */
function pageSoon(page) {
  return layout(page, `<section class="section container">
  <h1 class="page-title">${esc(page.title)}</h1>
  <p class="lead">${esc(page.lead || 'Раздел в разработке.')}</p>
  <div class="soon-panel">
    <span class="soon-badge">Скоро</span>
    <p>${esc(page.text || 'Этот раздел ещё переносится на новый сайт. Загляните позже.')}</p>
    ${renderButton('На главную', 'index.html')}
  </div>
</section>`);
}

function page404(page) {
  return layout(page, `<section class="error-page container">
  <div class="code">404</div>
  <p>Такой страницы в Убежище нет. Может, её эвакуировали?</p>
  <p>${renderButton('На главную', 'index.html')}</p>
</section>`);
}

/* ---------- build ---------- */
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const pages = [...CFG.pages, { slug: '404', type: '404', title: 'Страница не найдена' }];
for (const page of pages) {
  let html;
  switch (page.type) {
    case 'home': html = pageHome(page); break;
    case 'nav': html = pageNav(page); break;
    case 'hub': html = pageHub(page); break;
    case 'origins': html = pageOrigins(page); break;
    case 'perks': html = pagePerks(page); break;
    case 'soon': html = pageSoon(page); break;
    case '404': html = page404(page); break;
    default: throw new Error(`Unknown page type: ${page.type}`);
  }
  writeFileSync(join(OUT, `${page.slug}.html`), html, 'utf8');
}

// static assets
if (existsSync(join(ROOT, 'css'))) cpSync(join(ROOT, 'css'), join(OUT, 'css'), { recursive: true });
if (existsSync(join(ROOT, 'assets/img'))) cpSync(join(ROOT, 'assets/img'), join(OUT, 'assets/img'), { recursive: true });
writeFileSync(join(OUT, '.nojekyll'), '');

// sitemap + robots
const base = CFG.url.replace(/\/+$/, '');
const urls = pages
  .filter((p) => p.type !== '404')
  .map((p) => `  <url><loc>${base}/${p.slug === 'index' ? '' : p.slug + '.html'}</loc></url>`)
  .join('\n');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

console.log(`built ${pages.length} pages -> docs/`);
