'use strict';

// Патч 507 — файловое хранилище «Общего хранилища» комнат.
//
// Канон склада живёт НА СЕРВЕРЕ и переживает рестарт сервиса: «подключился —
// получил обновления» работает потому, что roomSnapshot отдаёт partyStorage
// вместе с состоянием комнаты. Файл служебный, в git не попадает (.data/).
//
// Формат: { "GM-XXXXXX": { revision, entries: [...] }, ... }

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FILE = path.join(__dirname, '..', '.data', 'party-storage.json');

const createFilePartyStorageStore = ({ filePath = DEFAULT_FILE } = {}) => {
  const load = () => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
      return new Map(Object.entries(parsed).filter(([, value]) => value && Array.isArray(value.entries)));
    } catch {
      return new Map();
    }
  };

  const save = (map) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const plain = Object.fromEntries(map.entries());
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(plain), 'utf8');
      fs.renameSync(tmp, filePath);
      return true;
    } catch {
      return false;
    }
  };

  return { load, save, filePath };
};

module.exports = { createFilePartyStorageStore, DEFAULT_FILE };
