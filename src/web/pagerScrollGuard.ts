// src/web/pagerScrollGuard.ts
// Защита горизонтального пейджера вкладок (@react-navigation/material-top-tabs /
// react-native-tab-view) от нативного смещения scrollLeft на Web и в PWA (патч 479).
//
// Причина бага «интерфейс смещается на 50% в сторону при синхронизации в админке,
// видно по 50% соседних экранов, навигация не работает»:
// - TabView рендерит общий контейнер <div style="overflow: hidden"> шириной W,
//   внутри которого лежат:
//   1) горизонтальная лента экранов шириной N*W (в админке N=2 -> 2*W:
//      [0..W] «Список компаний» и [W..2W] «Добыча/Торговля», оба смонтированы);
//   2) нижняя панель вкладок TabBar шириной W ([0..W]).
// - Во время облачной синхронизации открываются/закрываются модалки (меню, прогресс,
//   окно Google OAuth / вкладка Drive, итоговый AlertHost). ModalFocusTrap в
//   react-native-web вызывает UIManager.focus(node) -> node.focus() БЕЗ
//   { preventScroll: true }, а скрытая соседняя вкладка помечена только
//   aria-hidden="true" (без inert).
// - Браузер центрирует сфокусированный контейнер шириной 2*W (или узел соседней
//   вкладки) внутри overflow: hidden, выставляя scrollLeft = (2*W - W)/2 = 0.5*W (50%)!
//   Из-за этого одновременно уезжают и экраны, и нижний TabBar, а смена режима
//   Админ <-> Пользователь без перемонтирования NavigationContainer не сбрасывает
//   DOM-свойство scrollLeft.

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const isHorizontalHiddenOverflow = (el: HTMLElement, win: Window): boolean => {
  try {
    const inlineOverflow = el.style?.overflowX || el.style?.overflow || '';
    if (inlineOverflow === 'hidden' || inlineOverflow === 'clip') return true;
    const computed = win.getComputedStyle?.(el);
    const ox = computed?.overflowX;
    return ox === 'hidden' || ox === 'clip';
  } catch {
    return false;
  }
};

/**
 * Сбрасывает ненулевой scrollLeft у всех предков (и самого узла), для которых
 * горизонтальная прокрутка запрещена стилем overflow-x: hidden | clip.
 * Пользовательские горизонтальные ScrollView имеют overflow-x: auto | scroll и не затрагиваются.
 */
export const clampHiddenOverflowAncestors = (
  startNode: EventTarget | Node | null | undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): number => {
  if (!win || !startNode) return 0;
  let fixed = 0;
  let cur: Node | null = startNode as Node;
  while (cur && cur.nodeType === 1) {
    const el = cur as HTMLElement;
    if (!EDITABLE_TAGS.has(el.tagName) && el.scrollLeft !== 0 && isHorizontalHiddenOverflow(el, win)) {
      el.scrollLeft = 0;
      fixed += 1;
    }
    cur = el.parentElement;
  }
  return fixed;
};

/**
 * Проходит по поддереву (например, #root после возврата из окна OAuth / смены фокуса)
 * и сбрасывает застрявший scrollLeft у всех overflow-x: hidden контейнеров, а также
 * синхронизирует атрибут inert со скрытыми вкладками [aria-hidden="true"].
 */
export const sanitizeRootPagerDom = (
  root: ParentNode | null | undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): number => {
  if (!win || !root || typeof (root as Element).querySelectorAll !== 'function') return 0;
  let fixed = 0;

  const hiddenNodes = (root as Element).querySelectorAll('[aria-hidden]');
  hiddenNodes.forEach((node) => {
    const el = node as HTMLElement & { inert?: boolean };
    const isHidden = el.getAttribute('aria-hidden') === 'true';
    if (isHidden) {
      el.inert = true;
      el.setAttribute('inert', '');
    } else if (el.hasAttribute('inert') || el.inert) {
      el.inert = false;
      el.removeAttribute('inert');
    }
  });

  const allDivs = (root as Element).querySelectorAll('div');
  allDivs.forEach((div) => {
    if (div.scrollLeft !== 0 && isHorizontalHiddenOverflow(div, win)) {
      div.scrollLeft = 0;
      fixed += 1;
    }
  });

  return fixed;
};

const hasHiddenOverflowAncestor = (el: HTMLElement, win: Window): boolean => {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    if (isHorizontalHiddenOverflow(cur, win)) return true;
    cur = cur.parentElement;
  }
  return false;
};

/**
 * Оборачивает HTMLElement.prototype.focus так, чтобы программный вызов focus()
 * без аргументов (как в react-native-web ModalFocusTrap / UIManager.focus):
 * 1) не переводил фокус внутрь скрытой соседней вкладки [aria-hidden="true"];
 * 2) передавал { preventScroll: true }, если элемент находится внутри overflow-x: hidden пейджера;
 * 3) гарантированно удерживал scrollLeft = 0 на скрытых горизонтальных обёртках.
 */
export const installSafeProgrammaticFocus = (
  win: (Window & { HTMLElement?: typeof HTMLElement }) | undefined =
    typeof window !== 'undefined' ? window : undefined,
): void => {
  const proto = win?.HTMLElement?.prototype as (HTMLElement & { __positroniumSafeFocus?: boolean }) | undefined;
  if (!win || !proto || typeof proto.focus !== 'function' || proto.__positroniumSafeFocus) {
    return;
  }

  const nativeFocus = proto.focus;
  Object.defineProperty(proto, '__positroniumSafeFocus', {
    value: true,
    configurable: true,
  });

  proto.focus = function safeFocus(this: HTMLElement, options?: FocusOptions) {
    try {
      if (typeof this.closest === 'function' && this.closest('[aria-hidden="true"]')) {
        return;
      }
      if (options === undefined && !EDITABLE_TAGS.has(this.tagName) && hasHiddenOverflowAncestor(this, win)) {
        nativeFocus.call(this, { preventScroll: true });
      } else {
        nativeFocus.call(this, options);
      }
    } finally {
      clampHiddenOverflowAncestors(this, win);
    }
  };
};

let guardStarted = false;

export const startWebPagerScrollGuard = (): void => {
  if (guardStarted || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  guardStarted = true;

  installSafeProgrammaticFocus(window);

  const getRoot = () => document.getElementById('root') || document.body;

  const onCaptureEvent = (event: Event) => {
    clampHiddenOverflowAncestors(event.target, window);
  };

  const onWindowRestore = () => {
    sanitizeRootPagerDom(getRoot(), window);
  };

  document.addEventListener('scroll', onCaptureEvent, true);
  document.addEventListener('focusin', onCaptureEvent, true);
  document.addEventListener('focusout', onWindowRestore, true);
  window.addEventListener('focus', onWindowRestore);
  window.addEventListener('resize', onWindowRestore);
  document.addEventListener('visibilitychange', onWindowRestore);

  if (typeof MutationObserver === 'function') {
    const startObserver = () => {
      const root = getRoot();
      if (!root) return;
      sanitizeRootPagerDom(root, window);
      const observer = new MutationObserver(() => {
        sanitizeRootPagerDom(root, window);
      });
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-hidden'],
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
      startObserver();
    }
  }
};
