// Патч 208 — сырые алерты: кнопка «Ок» должна переводиться, а не
// показывать путь «buttons.ok». Дефект был в отсутствии scope у raw-записи:
// AlertHost не находил словарь и возвращал сам путь. Теперь scope:'app' +
// ключи buttons.* в общем словаре приложения (i18n/*/App.json).

import { describe, expect, it } from 'vitest';
import { registerAlertHost, showRawAlert } from '../../components/alerts/alertService';
import ruApp from '../../i18n/ru-RU/App.json';
import enApp from '../../i18n/en-EN/App.json';

describe('showRawAlert: scope кнопок', () => {
  it('запрос сырого алерта получает scope "app"', async () => {
    let captured = null;
    registerAlertHost((request) => {
      captured = request;
      return Promise.resolve(undefined);
    });

    await showRawAlert({ title: 'Заголовок', message: 'Текст' });

    expect(captured).not.toBeNull();
    expect(captured.entry.scope).toBe('app');
    expect(captured.entry.kind).toBe('info');
    expect(captured.raw.title).toBe('Заголовок');
  });

  it('ключ buttons.ok есть в словарях приложения (ru/en)', () => {
    expect(ruApp.buttons.ok).toBe('Ок');
    expect(enApp.buttons.ok).toBe('Ok');
  });

  it('подписи confirm-кнопок тоже закрыты общим словарём', () => {
    // DEFAULT_CONFIRM_BUTTONS ссылается на buttons.yes / buttons.cancel —
    // при scope:'app' они обязаны существовать в обоих словарях.
    expect(ruApp.buttons.yes).toBe('Да');
    expect(ruApp.buttons.cancel).toBe('Отмена');
    expect(enApp.buttons.yes).toBe('Yes');
    expect(enApp.buttons.cancel).toBe('Cancel');
  });
});
