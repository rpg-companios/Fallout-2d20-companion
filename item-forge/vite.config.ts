import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Кузница предметов — самодостаточный проект (репозиторий
// rpg-companios/fallout2d20forge, решение владельца 2026-10-19).
// Справочники и валидатор — ЛОКАЛЬНЫЕ слепки (src/data, src/itempack;
// обновление: npm run sync из основного репозитория). Внешних файлов
// сборка не читает — fs.allow не нужен.
//
// VITE_BASE — базовый путь публикации: проектная страница GitHub Pages —
// `/<имя-репо>/` (workflow pages подставляет сам), собственный домен/
// организационная страница — `/`.
// process без @types/node — локальная декларация.
declare const process: { env?: Record<string, string | undefined> } | undefined;
export default defineConfig({
  base: process?.env?.VITE_BASE ?? '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
