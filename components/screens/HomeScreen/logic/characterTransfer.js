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
 * Улучшенная версия с приоритетом Web Share API для Android
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
    const file = new File([blob], fileName, { type: 'application/json' });

    // Проверяем все методы в ПРАВИЛЬНОМ порядке для мобильных устройств
    const methodsToTry = [];
    
    // 1. Web Share API - ВСЕГДА приоритет на вебе (особенно на Android)
    if (canUseWebShareWithFiles(file)) {
      methodsToTry.push({
        name: 'share',
        execute: async () => {
          console.log('🔄 Пробуем Web Share API...');
          await navigator.share({
            files: [file],
            title: 'Сохранение персонажа',
          });
          console.log('✅ Web Share API сработал');
          return { success: true, method: 'share' };
        }
      });
    }

    // 2. browser-fs-access - для десктопов (может не работать на Android)
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileSave) {
      methodsToTry.push({
        name: 'fsaccess',
        execute: async () => {
          console.log('🔄 Пробуем browser-fs-access...');
          await fsAccess.fileSave(blob, {
            fileName: fileName,
            extensions: [EXPORT_FILE_EXTENSION, '.json'].filter(Boolean),
            description: 'Файл персонажа',
          });
          console.log('✅ browser-fs-access сработал');
          return { success: true, method: 'fsaccess' };
        }
      });
    }

    // 3. Anchor download - САМЫЙ НАДЕЖНЫЙ fallback, работает везде
    if (typeof document !== 'undefined') {
      methodsToTry.push({
        name: 'anchor',
        execute: () => {
          console.log('🔄 Пробуем anchor download...');
          const anchorOk = downloadViaAnchorFallback(blob, fileName);
          if (anchorOk) {
            console.log('✅ Anchor download сработал');
            return { success: true, method: 'anchor' };
          }
          throw new Error('Anchor download failed');
        }
      });
    }

    // Пробуем все методы по порядку
    console.log(`🔍 Доступно методов сохранения: ${methodsToTry.length}`);
    for (let i = 0; i < methodsToTry.length; i++) {
      const method = methodsToTry[i];
      try {
        const result = await method.execute();
        if (result.success) {
          return result;
        }
      } catch (methodError) {
        if (methodError && methodError.name === 'AbortError') {
          console.log(`⏹️  Пользователь отменил в методе "${method.name}"`);
          return { success: false, method: method.name, aborted: true };
        }
        console.warn(`❌ Метод "${method.name}" не сработал:`, methodError.message || methodError);
        // Продолжаем пробовать следующий метод
      }
    }

    console.error('❌ Все методы сохранения не сработали');
    return { success: false, method: 'unsupported' };
  } catch (error) {
    console.error('❌ Ошибка сохранения:', error);
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
 * Улучшенная версия с надежным fallback для Android
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
    // Пробуем все доступные методы сохранения по порядку
    const methodsToTry = [];
    
    // 1. Web Share API - лучший для мобильных устройств
    const file = new File([blob], safeFilename, { type: 'application/json' });
    if (Platform.OS === 'web' && canUseWebShareWithFiles(file)) {
      methodsToTry.push({
        name: 'share',
        execute: async () => {
          await navigator.share({
            files: [file],
            title: 'Сохранение персонажа',
          });
          return { method: 'share', success: true };
        }
      });
    }

    // 2. browser-fs-access
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileSave) {
      methodsToTry.push({
        name: 'browser-fs-access',
        execute: async () => {
          await fsAccess.fileSave(blob, {
            fileName: safeFilename,
            extensions: [EXPORT_FILE_EXTENSION, '.json'].filter(Boolean),
            description: 'Файл персонажа',
          });
          return { method: 'browser-fs-access', success: true };
        }
      });
    }

    // 3. Anchor download - самый надежный fallback
    if (typeof document !== 'undefined') {
      methodsToTry.push({
        name: 'anchor',
        execute: () => {
          const anchorOk = downloadViaAnchorFallback(blob, safeFilename);
          if (anchorOk) {
            return { method: 'anchor', success: true };
          }
          throw new Error('Anchor download failed');
        }
      });
    }

    // Пробуем все методы по порядку
    for (const method of methodsToTry) {
      try {
        const result = await method.execute();
        if (result.success) {
          return result;
        }
      } catch (methodError) {
        if (methodError && methodError.name === 'AbortError') {
          return { method: method.name, success: false, aborted: true };
        }
        console.warn(`Method ${method.name} failed:`, methodError);
        // Продолжаем пробовать следующий метод
      }
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