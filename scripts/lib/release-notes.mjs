// scripts/lib/release-notes.mjs
// Заметки о релизах: секции `## <версия> — заголовок` в markdown-файле.
//
// Файл едет в целевые репозитории: им пользуются и публикация из смешанного
// репозитория, и сценарий релиза внутри движка (`scripts/release.mjs`).
// Поэтому зависимостей нет — только node:fs и чистый разбор строк.
//
// Правило одно и то же везде: верхняя секция описывает ВЫПУСКАЕМУЮ версию.
// Если номер не совпадает, релиз останавливается до сборки и сборки архива.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Разобрать заметки о релизах.
 *
 * @param {string} text содержимое файла
 * @param {{file?: string}} options имя файла для сообщений об ошибках
 * @returns {{version: string, title: string, body: string}}
 */
export const parseReleaseNotes = (text, { file = 'release-notes.md' } = {}) => {
  const lines = String(text ?? '').split(/\r?\n/);
  // Заголовки внутри ``` — примеры, а не секции: их пропускаем.
  const headings = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*```/.test(lines[index])) { fenced = !fenced; continue; }
    if (!fenced && /^##\s+/.test(lines[index])) headings.push(index);
  }
  if (headings.length === 0) {
    throw new Error(`[release-notes] ${file} has no "## <version>" section`);
  }

  const start = headings[0];
  const end = headings.length > 1 ? headings[1] : lines.length;
  const heading = lines[start].replace(/^##\s+/, '').trim();
  const match = /^(\d+(?:\.\d+)*)\s*(?:[—–-]\s*(.*))?$/.exec(heading);
  if (!match) {
    throw new Error(`[release-notes] ${file}: section title must start with a version, got "${heading}"`);
  }

  const body = [];
  fenced = false;
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s*```/.test(lines[index])) fenced = !fenced;
    body.push(lines[index]);
  }

  return {
    version: match[1],
    title: (match[2] ?? '').trim(),
    body: body.join('\n').trim(),
  };
};

/** Прочитать заметки из файла репозитория; нет файла → null. */
export const readReleaseNotes = (root, relativePath) => {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  return {
    ...parseReleaseNotes(fs.readFileSync(file, 'utf8'), { file: relativePath }),
    file: relativePath,
  };
};
