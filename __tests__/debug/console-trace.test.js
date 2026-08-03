import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { debugLog } from '../../src/debug/falloutDebug';

// Инвариант единой трассировки (см. docs/debug-tracing.md):
// 1) по умолчанию трассировка ВЫКЛЮЧЕНА — debugLog не пишет ничего;
// 2) включение/категории/выключение работают через глобал __fallout;
// 3) в шиппящемся коде нет плоских console.* — только debugLog через гейт.

const buf = () => globalThis.__FALLOUT_DEBUG_LOGS || [];

describe('console-trace: гейт __fallout', () => {
  it('по умолчанию выключен: debugLog не пишет ни в буфер, ни куда-либо', () => {
    const f = globalThis.__fallout;
    expect(typeof f, 'глобал __fallout должен быть выставлен модулем').toBe('object');
    expect(f.status().enabled).toBe(false);
    const before = buf().length;
    debugLog('equip.testSilent', { x: 1 });
    expect(buf().length).toBe(before);
  });

  it('on() включает запись всех категорий; категория = префикс до точки', () => {
    globalThis.__fallout.clear();
    globalThis.__fallout.on();
    debugLog('equip.armor:test', { a: 1 });
    debugLog('items.add:test', { b: 2 });
    const entries = buf();
    expect(entries.length).toBe(2);
    expect(entries[0].category).toBe('equip');
    expect(entries[0].event).toBe('equip.armor:test');
    expect(entries[1].category).toBe('items');
    expect(globalThis.__fallout.status().categories).toBe(null);
  });

  it('on([категории]) фильтрует: прочие категории не записываются', () => {
    globalThis.__fallout.clear();
    globalThis.__fallout.on(['equip']);
    debugLog('items.add:test', { c: 3 });
    debugLog('equip.armor:test2', { d: 4 });
    const events = buf().map((e) => e.event);
    expect(events).toEqual(['equip.armor:test2']);
    globalThis.__fallout.on(); // вернуть «все» для следующих тестов
  });

  it('off() останавливает запись, буфер сохраняется; mark/dump/clear работают', () => {
    globalThis.__fallout.on();
    globalThis.__fallout.mark('начало репро');
    globalThis.__fallout.off();
    const afterOff = buf().length;
    debugLog('equip.armor:skipped', {});
    expect(buf().length).toBe(afterOff);
    expect(globalThis.__fallout.status().enabled).toBe(false);

    const dump = globalThis.__fallout.dump('trace.');
    const parsed = JSON.parse(dump);
    expect(parsed.length).toBe(1);
    expect(parsed[0].event).toBe('trace.mark');
    expect(parsed[0].data.label).toBe('начало репро');
    // весь буфер без фильтра — валидный JSON-массив
    expect(Array.isArray(JSON.parse(globalThis.__fallout.dump()))).toBe(true);

    globalThis.__fallout.clear();
    expect(buf().length).toBe(0);
    globalThis.__fallout.off();
  });

  it('API глобала полный: on/off/status/clear/mark/dump', () => {
    const f = globalThis.__fallout;
    ['on', 'off', 'status', 'clear', 'mark', 'dump'].forEach((name) => {
      expect(typeof f[name], name).toBe('function');
    });
  });
});

describe('console-trace: инвариант исходников', () => {
  it('в шиппящемся коде ноль плоских console.* — только debugLog через гейт', () => {
    const ROOTS = ['App.js', 'components', 'src', 'domain', 'i18n'];
    const ALLOWED = 'src/debug/falloutDebug.js'; // сам гейт пишет в console при включённом гейте
    const CONSOLE_CALL = /console\.(log|warn|info|error|debug)\s*\(/;

    const listJs = (entry, acc = []) => {
      const st = statSync(entry);
      if (st.isDirectory()) {
        for (const name of readdirSync(entry)) {
          if (name === 'node_modules' || name === '__tests__' || name === '.git' || name === 'scripts') continue;
          listJs(join(entry, name), acc);
        }
      } else if (entry.endsWith('.js')) {
        acc.push(entry);
      }
      return acc;
    };

    const offenders = [];
    for (const root of ROOTS) {
      for (const file of listJs(root)) {
        const norm = file.replace(/\\/g, '/');
        if (norm.endsWith(ALLOWED)) continue;
        const text = readFileSync(file, 'utf8');
        if (CONSOLE_CALL.test(text)) offenders.push(norm);
      }
    }
    expect(offenders).toEqual([]);
  });
});
