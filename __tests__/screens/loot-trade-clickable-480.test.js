import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeRootPagerDom } from '../../src/web/pagerScrollGuard';

const ROOT = path.resolve(__dirname, '../..');

describe('Патч 480: вкладка «Добыча/Торговля» полностью кликабельна (без залипания inert при снятии aria-hidden)', () => {
  it('pagerScrollGuard никогда не выставляет inert при переключении вкладки (когда react-native-web удаляет aria-hidden) и снимает любой залипший inert', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/web/pagerScrollGuard.ts'), 'utf8');
    expect(src).not.toContain('el.inert = true');
    expect(src).not.toContain("setAttribute('inert'");

    const attrs = new Map([['aria-hidden', 'true'], ['inert', '']]);
    const lootScene = {
      nodeType: 1,
      tagName: 'DIV',
      style: { overflowX: 'hidden' },
      scrollLeft: 0,
      inert: true,
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => { attrs.set(k, String(v)); },
      removeAttribute: (k) => { attrs.delete(k); },
      hasAttribute: (k) => attrs.has(k),
    };
    const pagerDiv = {
      nodeType: 1,
      tagName: 'DIV',
      style: { overflowX: 'hidden' },
      scrollLeft: 500,
    };

    // react-native-web при переключении на вкладку «Добыча/Торговля» удаляет aria-hidden целиком:
    lootScene.removeAttribute('aria-hidden');

    const root = {
      querySelectorAll(sel) {
        if (sel === '[inert]') return lootScene.hasAttribute('inert') || lootScene.inert ? [lootScene] : [];
        if (sel === 'div') return [pagerDiv, lootScene];
        return [];
      },
    };
    const fakeWin = {
      getComputedStyle: (el) => ({ overflowX: el.style.overflowX || 'visible' }),
    };

    sanitizeRootPagerDom(root, fakeWin);

    expect(pagerDiv.scrollLeft).toBe(0);
    expect(lootScene.inert).toBe(false);
    expect(lootScene.hasAttribute('inert')).toBe(false);
  });
});
