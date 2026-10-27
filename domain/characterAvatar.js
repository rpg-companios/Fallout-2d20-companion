// domain/characterAvatar.js
//
// Домен кастомного аватара персонажа (задел премиум-фичи, патч 193; UI нет).
// Формат хранения:
//   — локально/в облаке: JPEG data URL (~50–150 КБ после сжатия);
//   — в сейве персонажа: только метаданные { md5, updatedAt } (~100 байт),
//     само фото рядом с сейвом (appDataFolder/<сеттинг>/avatars/<id>.jpg).
//
// Сжатие и лимиты отсюда применяет и UI-пикер (будущий), и синк при загрузке
// чужого аватара (защита от «толстого» файла в облаке).

/** Единые лимиты аватара. Меняются только здесь. */
export const AVATAR_LIMITS = Object.freeze({
  /** Максимальная сторона в пикселях после сжатия. */
  maxEdge: 512,
  /** Качество JPEG (0..1) при сжатии. */
  jpegQuality: 0.7,
  /** Жёсткий потолок размера data URL (байты base64-декодированные). */
  maxBytes: 300 * 1024,
  /** Допустимый MIME. */
  mimeType: 'image/jpeg',
});

const DATA_URL_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)$/;

/** Размер в байтах base64-строки (без atob — работает и в RN, и в web). */
export function base64ByteLength(base64) {
  const clean = String(base64 || '').replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * Валиден ли data URL как аватар: формат JPEG и в пределах лимита размера.
 *
 * @param {string} dataUrl
 * @returns {{ ok: boolean, reason: string|null, bytes: number }}
 */
export function validateAvatarDataUrl(dataUrl) {
  const value = typeof dataUrl === 'string' ? dataUrl.trim() : '';
  const match = value.match(DATA_URL_RE);
  if (!match) return { ok: false, reason: 'avatar.invalidFormat', bytes: 0 };
  const bytes = base64ByteLength(match[1]);
  if (bytes <= 0) return { ok: false, reason: 'avatar.invalidFormat', bytes };
  if (bytes > AVATAR_LIMITS.maxBytes) return { ok: false, reason: 'avatar.tooLarge', bytes };
  return { ok: true, reason: null, bytes };
}

/**
 * Метаданные аватара для сейва персонажа (~100 байт, не фото).
 *
 * @param {{ characterId: string, md5?: string|null, updated_at?: number|null }|null} row — запись кэша
 * @returns {{ md5: string|null, updatedAt: number|null }|null}
 */
export function buildAvatarMetadata(row) {
  if (!row?.characterId) return null;
  return {
    md5: row.md5 ?? null,
    updatedAt: Number(row.updated_at ?? row.updatedAt ?? 0) || null,
  };
}

/**
 * Сжать выбранное изображение в JPEG data URL под лимиты.
 *
 * Адаптер платформенно-зависим (expo-image-manipulator; зависимость появится
 * на UI-этапе — поэтому ленивый require) и подменяется в тестах. Источник —
 * результат expo-image-picker или uri/base64 из другого источника.
 *
 * @param {{ uri?: string, base64?: string, width?: number, height?: number }} source
 * @param {object} [adapter] — { resizeToJpeg({ source, maxEdge, quality }) → { dataUrl } }
 * @returns {Promise<{ dataUrl: string, bytes: number }>}
 * @throws {Error} avatar.tooLarge / avatar.invalidFormat / adapter-ошибки
 */
export async function compressAvatarImage(source, adapter = defaultImageAdapter) {
  if (!source?.uri && !source?.base64) {
    throw new Error('avatar.invalidSource');
  }
  const { dataUrl } = await adapter.resizeToJpeg({
    source,
    maxEdge: AVATAR_LIMITS.maxEdge,
    quality: AVATAR_LIMITS.jpegQuality,
  });
  const check = validateAvatarDataUrl(dataUrl);
  if (!check.ok) {
    const error = new Error(check.reason);
    error.code = check.reason;
    error.bytes = check.bytes;
    throw error;
  }
  return { dataUrl, bytes: check.bytes };
}

/**
 * Платформенный адаптер сжатия. Пакет expo-image-manipulator подключается
 * лениво: пока UI-этап не добавил зависимость, честная ошибка вместо
 * падения импорта. В web-сборке манипулятор работает через canvas.
 */
export const defaultImageAdapter = {
  async resizeToJpeg({ source, maxEdge, quality }) {
    let manipulator;
    try {
      // Ленивый require: зависимости в package.json появится на UI-этапе.
      manipulator = require('expo-image-manipulator');
    } catch {
      throw new Error('avatar.manipulatorUnavailable');
    }
    // Сторону для resize выбираем по большей стороне исходника, чтобы не
    // искажать пропорции (манипулятор сохраняет аспект, если задана одна ось).
    const width = Number(source.width) || 0;
    const height = Number(source.height) || 0;
    const actions = width > 0 && height > 0
      ? [{ resize: width >= height ? { width: maxEdge } : { height: maxEdge } }]
      : [{ resize: { width: maxEdge } }];
    const result = await manipulator.manipulateAsync(source.uri ?? `data:image/jpeg;base64,${source.base64}`, actions, {
      compress: quality,
      format: manipulator.SaveFormat.JPEG,
    });
    return { dataUrl: `data:image/jpeg;base64,${result.base64}` };
  },
};
