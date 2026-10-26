// item-forge/src/pack.ts
// Сборка/разбор пака контента — ЧИСТЫЕ функции (тестируются в основном сьюте
// __tests__/itempack/forge-roundtrip.test.js; UI — тонкая обёртка).

import { ITEM_PACK_FORMAT, itemIdPrefix } from './itempack/contract.js';

export interface PackManifestDraft {
  packId: string;
  name: string;
  author: string;
  locale: 'ru-RU' | 'en-EN';
}

export interface SessionItem {
  collection: 'weapons' | 'weaponMods' | 'ammo';
  data: Record<string, any>;
  namePrimary: string;      // имя на локали манифеста (обязательно)
  descriptionPrimary: string;
  nameOther: string;        // имя на второй локали (необязательно)
  descriptionOther: string;
}

export interface PackSession {
  manifest: PackManifestDraft;
  items: SessionItem[];
}

/** Итоговый JSON пака (то, что скачивается и валидируется приложением). */
export const buildPackFile = (session: PackSession) => {
  const { manifest, items } = session;
  const otherLocale = manifest.locale === 'ru-RU' ? 'en-EN' : 'ru-RU';
  const names: Record<string, Record<string, { name: string; description?: string }>> = {
    [manifest.locale]: {},
    [otherLocale]: {},
  };
  const itemsOut: Record<string, any[]> = { weapons: [], weaponMods: [], ammo: [] };

  for (const item of items) {
    const prefixed = { ...item.data, id: `${itemIdPrefix(manifest.packId)}${item.data.id}` };
    itemsOut[item.collection].push(prefixed);
    names[manifest.locale][prefixed.id] = {
      name: item.namePrimary,
      ...(item.descriptionPrimary ? { description: item.descriptionPrimary } : {}),
    };
    if (item.nameOther) {
      names[otherLocale][prefixed.id] = {
        name: item.nameOther,
        ...(item.descriptionOther ? { description: item.descriptionOther } : {}),
      };
    }
  }
  if (Object.keys(names[otherLocale]).length === 0) delete names[otherLocale];

  return {
    itemPackFormat: ITEM_PACK_FORMAT,
    manifest: {
      packId: manifest.packId,
      name: manifest.name,
      author: manifest.author,
      locale: manifest.locale,
      version: 1,
    },
    names,
    items: itemsOut,
  };
};

/** Разбор пака обратно в сессию (импорт для правки). */
export const parsePackFile = (pack: any): PackSession | null => {
  if (!pack || typeof pack !== 'object') return null;
  const manifest = pack.manifest;
  if (!manifest || typeof manifest.packId !== 'string') return null;
  const otherLocale = manifest.locale === 'ru-RU' ? 'en-EN' : 'ru-RU';
  const prefix = itemIdPrefix(manifest.packId);
  const items: SessionItem[] = [];

  for (const collection of ['weapons', 'weaponMods', 'ammo'] as const) {
    for (const entry of pack.items?.[collection] ?? []) {
      if (typeof entry?.id !== 'string' || !entry.id.startsWith(prefix)) continue;
      const primary = pack.names?.[manifest.locale]?.[entry.id] ?? {};
      const other = pack.names?.[otherLocale]?.[entry.id] ?? {};
      const data = { ...entry, id: entry.id.slice(prefix.length) };
      items.push({
        collection,
        data,
        namePrimary: primary.name ?? '',
        descriptionPrimary: primary.description ?? '',
        nameOther: other.name ?? '',
        descriptionOther: other.description ?? '',
      });
    }
  }

  return {
    manifest: {
      packId: manifest.packId,
      name: manifest.name ?? '',
      author: manifest.author ?? '',
      locale: manifest.locale === 'en-EN' ? 'en-EN' : 'ru-RU',
    },
    items,
  };
};

/** Скачивание файла в браузере. */
export const downloadPackFile = (pack: any, packId: string) => {
  const blob = new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${packId}.content.json`;
  a.click();
  URL.revokeObjectURL(url);
};
