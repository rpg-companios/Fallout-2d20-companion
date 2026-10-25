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
  /** Максимальная сторона в пикселях после сжатия. */
  maxEdge: 1500,
  /** Качество для форматов с потерями (JPEG) (0..1) при сжатии. */
  jpegQuality: 0.7,
  /** Качество для PNG (0..1), 1 = без потерь. */
  pngQuality: 1,
  /** Жёсткий потолок размера data URL (байты base64-декодированные). */
  maxBytes: 5 * 1024 * 1024,
  /** Допустимые MIME-типы для загрузки и хранения. */
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
});

// Регулярка для проверки data URL (JPEG, PNG, GIF)
const DATA_URL_RE = /^data:image\/(jpeg|png|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

/** Размер в байтах base64-строки (без atob — работает и в RN, и в web). */
export function base64ByteLength(base64) {
  const clean = String(base64 || '').replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * Валиден ли data URL как аватар: формат JPEG/PNG/GIF и в пределах лимита размера.
 *
 * @param {string} dataUrl
 * @returns {{ ok: boolean, reason: string|null, bytes: number, mimeType?: string }}
 */
export function validateAvatarDataUrl(dataUrl) {
  const value = typeof dataUrl === 'string' ? dataUrl.trim() : '';
  const match = value.match(DATA_URL_RE);
  if (!match) return { ok: false, reason: 'avatar.invalidFormat', bytes: 0 };
  
  const mimeType = `image/${match[1].toLowerCase()}`;
  if (!AVATAR_LIMITS.allowedMimeTypes.includes(mimeType)) {
    return { ok: false, reason: 'avatar.unsupportedFormat', bytes: 0, mimeType };
  }
  
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
 *
 * @param {string} mimeType
 * @returns {string} - расширение файла
 */
export function getFileExtension(mimeType) {
  switch (mimeType?.toLowerCase()) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    default: return 'jpg';
  }
}

/**
 * Сжать выбранное изображение под лимиты, сохраняя исходный формат.
 *
 * Адаптер платформенно-зависим (expo-image-manipulator; зависимость появится
 * на UI-этапе — поэтому ленивый require) и подменяется в тестах. Источник —
 * результат expo-image-picker или uri/base64 из другого источника.
 *
 * @param {{ uri?: string, base64?: string, width?: number, height?: number, mimeType?: string }} source
 * @param {object} [adapter] — { resize({ source, maxEdge, mimeType }) → { dataUrl, mimeType } }
 * @returns {Promise<{ dataUrl: string, bytes: number, mimeType: string }>}
 * @throws {Error} avatar.tooLarge / avatar.invalidFormat / adapter-ошибки
 */
export async function compressAvatarImage(source, adapter = defaultImageAdapter) {
  if (!source?.uri && !source?.base64) {
    throw new Error('avatar.invalidSource');
  }
  
  // Определяем целевой MIME-тип (сохраняем исходный формат)
  const targetMimeType = source.mimeType || 
    (source.uri?.match(/\.([^.]+)$/)?.[1] ? 
      `image/${source.uri.match(/\.([^.]+)$/)[1]}` : 
      'image/jpeg');
  
  // Проверяем, что формат поддерживается
  if (!AVATAR_LIMITS.allowedMimeTypes.includes(targetMimeType)) {
    throw new Error('avatar.unsupportedFormat');
  }
  
  const { dataUrl, mimeType: resultMimeType } = await adapter.resize({
    source,
    maxEdge: AVATAR_LIMITS.maxEdge,
    mimeType: targetMimeType,
  });
  
  const check = validateAvatarDataUrl(dataUrl);
  if (!check.ok) {
    const error = new Error(check.reason);
    error.code = check.reason;
    error.bytes = check.bytes;
    throw error;
  }
  
  return { 
    dataUrl, 
    bytes: check.bytes, 
    mimeType: resultMimeType || targetMimeType 
  };
}

/**
 * Платформенный адаптер сжатия. Пакет expo-image-manipulator подключается
 * лениво: пока UI-этап не добавил зависимость, честная ошибка вместо
 * падения импорта. В web-сборке манипулятор работает через canvas.
 * Сохраняет исходный формат изображения (JPEG, PNG, GIF).
 */
export const defaultImageAdapter = {
  async resize({ source, maxEdge, mimeType }) {
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
    
    // Определяем формат для expo-image-manipulator
    let format;
    switch (mimeType?.toLowerCase()) {
      case 'image/png': format = manipulator.SaveFormat.PNG; break;
      case 'image/gif': format = manipulator.SaveFormat.GIF; break;
      case 'image/jpeg':
      default: format = manipulator.SaveFormat.JPEG; break;
    }
    
    // Качество: для JPEG используем jpegQuality, для PNG/GIF - максимальное
    const quality = mimeType?.toLowerCase() === 'image/jpeg' 
      ? AVATAR_LIMITS.jpegQuality 
      : AVATAR_LIMITS.pngQuality;
    
    // Определяем URI для загрузки
    let uri = source.uri;
    if (!uri && source.base64) {
      uri = `data:${mimeType};base64,${source.base64}`;
    }
    
    const result = await manipulator.manipulateAsync(uri, actions, {
      compress: quality,
      format: format,
    });
    
    return { 
      dataUrl: `data:${mimeType};base64,${result.base64}`,
      mimeType 
    };
  },
};
