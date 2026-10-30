// src/web/pagerScrollGuard.ts
// Защита горизонтального пейджера вкладок (@react-navigation/material-top-tabs /
// react-native-tab-view) от нативного смещения scrollLeft на Web и в PWA (патчи 479–480).
//
// Важное правило (патч 480):
// НЕЛЬЗЯ выставлять HTML-атрибут `inert` на узлы вкладок по `[aria-hidden="true"]`!
// В react-native-web при переключении вкладки `aria-hidden={false}` полностью УДАЛЯЕТ
// атрибут `aria-hidden` с DOM-узла (а не ставит `"false"`), из-за чего `inert`
// оставался висеть на вкладке «Добыча/Торговля» навсегда и блокировал все клики.
//
// Для полной защиты от 50%-смещения достаточно и безопасно ТОЛЬКО удерживать
// `scrollLeft = 0` у контейнеров с `overflow-x: hidden | clip` и передавать
// `{ preventScroll: true }` при программном `focus()` без аргументов — это вообще не
// меняет атрибуты DOM и никак не влияет на клики, ввод или события указателя.

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
 * и сбрасывает застрявший scrollLeft у всех overflow-x: hidden контейнеров, не меняя
 * никаких DOM-атрибутов и не блокируя события клика (и снимая случайный inert, если был).
 */
export const sanitizeRootPagerDom = (
  root: ParentNode | null | undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): number => {
  if (!win || !root || typeof (root as Element).querySelectorAll !== 'function') return 0;
  let fixed = 0;

  const inertNodes = (root as Element).querySelectorAll('[inert]');
  inertNodes.forEach((node) => {
    const el = node as HTMLElement & { inert?: boolean };
    el.inert = false;
    el.removeAttribute('inert');
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
 * без аргументов (как в react-native-web ModalFocusTrap / UIManager.focus)
 * передавал { preventScroll: true }, если элемент находится внутри overflow-x: hidden
 * пейджера, и гарантированно удерживал scrollLeft = 0 без блокировки самого фокуса.
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
};
