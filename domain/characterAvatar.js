// domain/characterAvatar.js
//
// Домен кастомного аватара персонажа (задел премиум-фичи, патч 193; UI нет).
// Формат хранения:
//   — локально/в облаке: JPEG/PNG/GIF data URL (~50–1500 КБ после сжатия);
//   — в сейве персонажа: только метаданные { md5, updatedAt, mimeType } (~100 байт),
//     само фото рядом с сейвом (appDataFolder/<сеттинг>/avatars/<id>.<ext>).
//
// Сжатие и лимиты отсюда применяет и UI-пикер (будущий), и синк при загрузке
// чужого аватара (защита от «толстого» файла в облаке).

/** Единые лимиты аватара. Меняются только здесь. */
export const AVATAR_LIMITS = Object.freeze({
  /** Жёсткий потолок размера data URL (байты base64-декодированные). */
  maxBytes: 5 * 1024 * 1024,
  /** Максимальная сторона изображения в пикселях. */
  maxDimension: 2000,
});

// Регулярка для проверки data URL (любое изображение)
const DATA_URL_RE = /^data:image\/([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** Размер в байтах base64-строки (без atob — работает и в RN, и в web). */
export function base64ByteLength(base64) {
  const clean = String(base64 || '').replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * Валиден ли data URL как аватар: проверяем что это изображение и размер в пределах лимита.
 *
 * @param {string} dataUrl
 * @returns {{ ok: boolean, reason: string|null, bytes: number, mimeType?: string }}
 */
export function validateAvatarDataUrl(dataUrl) {
  const value = typeof dataUrl === 'string' ? dataUrl.trim() : '';
  const match = value.match(DATA_URL_RE);
  if (!match) return { ok: false, reason: 'avatar.invalidFormat', bytes: 0 };
  
  const mimeType = `image/${match[1].toLowerCase()}`;
  
  const bytes = base64ByteLength(match[2]);
  if (bytes <= 0) return { ok: false, reason: 'avatar.invalidFormat', bytes };
  if (bytes > AVATAR_LIMITS.maxBytes) return { ok: false, reason: 'avatar.tooLarge', bytes };
  return { ok: true, reason: null, bytes, mimeType };
}

/**
 * Метаданные аватара для сейва персонажа (~100 байт, не фото).
 *
 * @param {{ characterId: string, md5?: string|null, updated_at?: number|null, mime_type?: string|null }|null} row — запись кэша
 * @returns {{ md5: string|null, updatedAt: number|null, mimeType: string|null }|null}
 */
export function buildAvatarMetadata(row) {
  if (!row?.characterId) return null;
  return {
    md5: row.md5 ?? null,
    updatedAt: Number(row.updated_at ?? row.updatedAt ?? 0) || null,
    mimeType: row.mime_type ?? row.mimeType ?? null,
  };
}

/**
 * Определить формат хранения по MIME-типу.
 * Для неизвестных типов используем расширение из MIME-типа.
 *
 * @param {string} mimeType
 * @returns {string} - расширение файла
 */
export function getFileExtension(mimeType) {
  if (!mimeType) return 'jpg';
  
  const normalized = mimeType.toLowerCase();
  
  // Известные форматы
  switch (normalized) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/bmp': return 'bmp';
    case 'image/svg+xml': return 'svg';
  }
  
  // Для неизвестных MIME-типов пытаемся извлечь расширение
  // Например: image/vnd.microsoft.icon -> icon
  const match = normalized.match(/image\/([a-z0-9]+)/i);
  if (match) {
    return match[1];
  }
  
  return 'jpg';
}


