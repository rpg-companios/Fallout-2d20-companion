// ПРИЁМОЧНЫЙ (патч 396): «когда-то был диалог на яндексе, pwa было…
// проблема где-то в правках» (владелец). По истории репозитория перехват
// beforeinstallprompt с preventDefault стоял с первых коммитов и ГЛУШИЛ
// родной диалог браузера; в сегодняшнем Яндексе отложенный prompt() не
// поднимает UI — итого диалога не было ВООБЩЕ. 396 снимает preventDefault:
// браузер волен показать свой родной путь установки; событие только
// запоминается (диагностика/кнопка). Заслон против возврата глушения.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = () => readFileSync('public/index.html', 'utf8');

describe('патч 396: родной диалог установки браузера больше не глушится', () => {
  it('перехват события есть, preventDefault — НЕТ', () => {
    const src = html();
    expect(src).toContain("addEventListener('beforeinstallprompt'");
    // Активного вызова нет (комментарий-объяснение «НЕ вызываем
    // event.preventDefault().» — не код: у вызова была бы точка с запятой).
    expect(src.includes('event.preventDefault();')).toBe(false);
  });

  it('событие по-прежнему запоминается для диагностики и кнопки', () => {
    const src = html();
    expect(src).toContain('window.__pwaInstallPrompt = event');
    expect(src).toContain("dispatchEvent(new CustomEvent('pwaInstallPromptReady'");
  });

  it('в комментарии объяснено, почему глушение убрано (396)', () => {
    expect(html()).toContain('396');
    expect(html()).toContain('НЕ вызываем event.preventDefault()');
  });
});
