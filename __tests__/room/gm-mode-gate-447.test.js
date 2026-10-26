// __tests__/room/gm-mode-gate-447.test.js
//
// 447: «Админ» (вход в GM-режим) скрыт из UI — админка не закончена,
// дальше её ждёт большая работа и серверная часть: «сервер состояний»,
// который через интернет сведёт клиента и админа и будет транслировать
// админу состояние персонажа клиента. Механика комнат сохранена целиком.
//
// Канон погашения — как у «Игрового сеттинга» (446): константа-выключатель
// в HomeScreen, обратный возврат в UI — одна правка флага.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const HOME_SCREEN = resolve(__dirname, '../../components/screens/HomeScreen/HomeScreen.js');
const RU_HOME = resolve(__dirname, '../../i18n/ru-RU/screens/home/screen.json');
const EN_HOME = resolve(__dirname, '../../i18n/en-EN/screens/home/screen.json');

describe('447: кнопка «Админ» (GM-режим) скрыта выключателем', () => {
  it('константа-выключатель объявлена и стоит в false', () => {
    const src = readFileSync(HOME_SCREEN, 'utf8');
    expect(src).toContain('const GM_MODE_UI_ENABLED = false;');
    // в комментарии зафиксирована причина и путь возврата (сервер состояний)
    expect(src).toContain('сервер состояний');
    expect(src).toContain('Возврат в UI = GM_MODE_UI_ENABLED = true.');
  });

  it('кнопка в шапке не рисуется без флага, а выход из GM — остаётся', () => {
    const src = readFileSync(HOME_SCREEN, 'utf8');
    // рендер: (GM_MODE_UI_ENABLED || isGmMode) && roomServerAvailable
    expect(src).toMatch(/\(\(GM_MODE_UI_ENABLED \|\| isGmMode\) && roomServerAvailable\) && \(/);
    // сам JSX кнопки админа сохранён (не удалён, только погашен)
    expect(src).toContain('styles.adminButton');
    expect(src).toContain('handleToggleUiMode');
  });

  it('механика комнат нетронута: стор, протокол, клиент на месте', () => {
    const src = readFileSync(HOME_SCREEN, 'utf8');
    expect(src).toContain("import { isRoomServerConfigured } from '../../../src/room/roomClient';");
    expect(src).toContain('isRoomServerConfigured()');
    expect(src).toContain('handleToggleUiMode');
    // эффекты переподключения к комнатам не погашены — сеть живая
    expect(src).toContain('room.leave:failed');
  });

  it('строки gm.enter/gm.exit остались в обеих локалях (фича отложена, не удалена)', () => {
    const ru = JSON.parse(readFileSync(RU_HOME, 'utf8'));
    const en = JSON.parse(readFileSync(EN_HOME, 'utf8'));
    expect(ru.gm.enter).toBe('Админ');
    expect(ru.gm.exit).toBe('Пользователь');
    expect(en.gm.enter).toBe('Admin');
    expect(en.gm.exit).toBe('User');
  });
});
