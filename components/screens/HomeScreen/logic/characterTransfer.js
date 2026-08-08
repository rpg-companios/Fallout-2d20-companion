/**
 * components/screens/HomeScreen/logic/characterTransfer.js
 * Адаптерный слой: связывает чистую доменную логику (domain/characterTransfer)
 * с платформенными API (Web Share API, <a download>, expo-document-picker).
 *
 * WEB / PWA: использует browser-fs-access для надёжного file I/O
 * NATIVE: использует expo-document-picker и expo-sharing
 *
 * Чистая логика — в domain/characterTransfer.js, здесь только IO.
 */

import { Platform } from 'react-native';
import {
  EXPORT_FORMAT_VERSION,
  EXPORT_FILE_EXTENSION,
  IMPORT_ERRORS,
  sanitizeFileName,
  createCharacterExportPayload,
  parseCharacterImportPayload,
} from '../../../../domain/characterTransfer';

// Re-export чистой доменной логики для обратной совместимости
export {
  EXPORT_FORMAT_VERSION,
  EXPORT_FILE_EXTENSION,
  IMPORT_ERRORS,
  sanitizeFileName,
  createCharacterExportPayload,
  parseCharacterImportPayload,
};

// Динамическая загрузка expo-document-picker, чтобы не падать в тестах
let DocumentPicker = null;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  DocumentPicker = require('expo-document-picker');
} catch {
  DocumentPicker = null;
}

// browser-fs-access для веб-части
let fsAccess = null;
if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line global-require
    fsAccess = require('browser-fs-access');
  } catch {
    fsAccess = null;
  }
}

/**
 * Фолбэк для десктопа — скачивание через <a download>
 */
const downloadViaAnchorFallback = (blob, fileName) => {
  if (typeof document === 'undefined') return false;
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (e) {
    console.warn('Anchor fallback failed:', e);
    return false;
  }
};

/**
 * Проверка доступности Web Share API с файлами
 */
const canUseWebShareWithFiles = (file) => {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.canShare || !navigator.share) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
};

/**
 * Сохранение через browser-fs-access.fileSave или Web Share API + фолбэк
 * @returns {Promise<{success: boolean, method: 'fsaccess'|'share'|'anchor'|'unsupported', aborted?: boolean}>}
 */
export const downloadCharacterPayloadWeb = async (payload, preferredName) => {
  const fileName = sanitizeFileName(preferredName);
  const jsonString = JSON.stringify(payload, null, 2);

  if (typeof window === 'undefined' && Platform.OS !== 'web') {
    return { success: false, method: 'unsupported' };
  }

  try {
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 1. browser-fs-access — приоритетное решение для веба
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileSave) {
      try {
        await fsAccess.fileSave(blob, {
          fileName: fileName,
          extensions: [EXPORT_FILE_EXTENSION, '.json'].filter(Boolean),
          description: 'Файл персонажа',
        });
        return { success: true, method: 'fsaccess' };
      } catch (fsError) {
        if (fsError && fsError.name === 'AbortError') {
          return { success: false, method: 'fsaccess', aborted: true };
        }
        console.warn('browser-fs-access failed, fallback to share/anchor:', fsError);
      }
    }

    const file = new File([blob], fileName, { type: 'application/json' });

    // 2. Web Share API — для PWA iOS/Android
    if (canUseWebShareWithFiles(file)) {
      try {
        await navigator.share({
          files: [file],
          title: 'Сохранение персонажа',
        });
        return { success: true, method: 'share' };
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') {
          return { success: false, method: 'share', aborted: true };
        }
        console.warn('navigator.share failed, fallback to anchor:', shareErr);
      }
    }

    // 3. Фолбэк
    const anchorOk = downloadViaAnchorFallback(blob, fileName);
    if (anchorOk) {
      return { success: true, method: 'anchor' };
    }

    return { success: false, method: 'unsupported' };
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    return { success: false, method: 'unsupported', error };
  }
};

/**
 * Легаси-реализация выбора файла через скрытый input (фолбэк)
 */
const pickFileLegacy = () =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    // Расширяем фильтр для лучшей совместимости с Android браузерами
    input.accept = `${EXPORT_FILE_EXTENSION},.json,application/json,text/plain,*/*`;
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file, 'utf-8');
    };

    document.body.appendChild(input);
    input.click();
  });

/**
 * Импорт через browser-fs-access.fileOpen или expo-document-picker
 * На вебе используем browser-fs-access для надёжности
 * @returns {Promise<string|null>}
 */
export const pickCharacterFileWeb = async () => {
  try {
    // 1. browser-fs-access — приоритет для веба
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileOpen) {
      try {
        const blob = await fsAccess.fileOpen({
          mimeTypes: ['application/json', 'text/json', 'text/plain'],
          extensions: [EXPORT_FILE_EXTENSION, '.json'].filter(Boolean),
          description: 'Файл персонажа',
          multiple: false,
        });
        return await blob.text();
      } catch (fsError) {
        if (fsError && fsError.name === 'AbortError') {
          return null; // Пользователь отменил выбор
        }
        console.warn('browser-fs-access failed, fallback:', fsError);
      }
    }

    // 2. На нативных платформах используем DocumentPicker
    if (DocumentPicker && DocumentPicker.getDocumentAsync) {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream', '.rpgc', '.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return null;

      const file = result.assets[0];
      if (!file || !file.uri) return null;

      try {
        if (file.file && typeof file.file.text === 'function') {
          return await file.file.text();
        }
        const response = await fetch(file.uri);
        const text = await response.text();
        return text;
      } catch (fetchErr) {
        console.warn('fetch Blob URI failed:', fetchErr);
        return null;
      }
    }

    // 3. Фолбэк для платформ без browser-fs-access или DocumentPicker
    return await pickFileLegacy();
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    try {
      return await pickFileLegacy();
    } catch {
      return null;
    }
  }
};

/**
 * API из ТЗ — saveCharacter / loadCharacter (для прямого использования)
 */
export const saveCharacter = async (characterData, filename = 'character.json') => {
  const payload =
    characterData && characterData.format === 'rpg-companion-character' ? characterData : characterData;

  const safeFilename =
    filename.endsWith(EXPORT_FILE_EXTENSION) || filename.endsWith('.json')
      ? filename
      : sanitizeFileName(filename.replace(/\.(json|rpgc)$/, ''));

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });

  try {
    // Используем browser-fs-access для веба
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileSave) {
      await fsAccess.fileSave(blob, {
        fileName: safeFilename,
        extensions: [EXPORT_FILE_EXTENSION, '.json'].filter(Boolean),
        description: 'Файл персонажа',
      });
      return { method: 'browser-fs-access', success: true };
    }

    const file = new File([blob], safeFilename, { type: 'application/json' });

    if (Platform.OS === 'web' && canUseWebShareWithFiles(file)) {
      await navigator.share({
        files: [file],
        title: 'Сохранение персонажа',
      });
      return { method: 'share', success: true };
    }

    if (typeof document !== 'undefined') {
      downloadViaAnchorFallback(blob, safeFilename);
      return { method: 'anchor', success: true };
    }

    return { method: 'unsupported', success: false };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return { method: 'cancelled', success: false, aborted: true };
    }
    console.error('Ошибка сохранения:', error);
    return { method: 'unsupported', success: false, error };
  }
};

export const loadCharacter = async () => {
  try {
    const rawText = await pickCharacterFileWeb();
    if (!rawText) return null;
    return JSON.parse(rawText);
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    return null;
  }
};

/**
 * Алиасы для обратной совместимости
 */
export const pickCharacterFile = pickCharacterFileWeb;
export const downloadCharacterPayload = downloadCharacterPayloadWeb;