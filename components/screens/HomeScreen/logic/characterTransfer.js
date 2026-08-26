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
import { debugLog } from '../../../../src/debug/falloutDebug';
import {
  EXPORT_FORMAT_VERSION,
  EXPORT_FILE_EXTENSION,
  IMPORT_ERRORS,
  sanitizeFileName,
  createCharacterExportPayload,
  parseCharacterImportPayload,
} from '../../../../domain/characterTransfer';

const traceCharacterTransfer = (level, ...details) => debugLog(`characterTransfer.${level}`, {
  details: details.map((detail) => (detail instanceof Error
    ? { name: detail.name, message: detail.message }
    : detail)),
});

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
    traceCharacterTransfer('warn', 'Anchor fallback failed:', e);
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
          traceCharacterTransfer('info', '🔄 Пробуем Web Share API...');
          await navigator.share({
            files: [file],
            title: 'Сохранение персонажа',
          });
          traceCharacterTransfer('info', '✅ Web Share API сработал');
          return { success: true, method: 'share' };
        }
      });
    }

    // 2. browser-fs-access - для десктопов (может не работать на Android)
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileSave) {
      methodsToTry.push({
        name: 'fsaccess',
        execute: async () => {
          traceCharacterTransfer('info', '🔄 Пробуем browser-fs-access...');
          await fsAccess.fileSave(blob, {
            fileName: fileName,
            extensions: [EXPORT_FILE_EXTENSION, '.json'].filter(Boolean),
            description: 'Файл персонажа',
          });
          traceCharacterTransfer('info', '✅ browser-fs-access сработал');
          return { success: true, method: 'fsaccess' };
        }
      });
    }

    // 3. Anchor download - САМЫЙ НАДЕЖНЫЙ fallback, работает везде
    if (typeof document !== 'undefined') {
      methodsToTry.push({
        name: 'anchor',
        execute: () => {
          traceCharacterTransfer('info', '🔄 Пробуем anchor download...');
          const anchorOk = downloadViaAnchorFallback(blob, fileName);
          if (anchorOk) {
            traceCharacterTransfer('info', '✅ Anchor download сработал');
            return { success: true, method: 'anchor' };
          }
          throw new Error('Anchor download failed');
        }
      });
    }

    // Пробуем все методы по порядку
    traceCharacterTransfer('info', `🔍 Доступно методов сохранения: ${methodsToTry.length}`);
    for (let i = 0; i < methodsToTry.length; i++) {
      const method = methodsToTry[i];
      try {
        const result = await method.execute();
        if (result.success) {
          return result;
        }
      } catch (methodError) {
        if (methodError && methodError.name === 'AbortError') {
          traceCharacterTransfer('info', `⏹️  Пользователь отменил в методе "${method.name}"`);
          return { success: false, method: method.name, aborted: true };
        }
        traceCharacterTransfer('warn', `❌ Метод "${method.name}" не сработал:`, methodError.message || methodError);
        // Продолжаем пробовать следующий метод
      }
    }

    traceCharacterTransfer('error', '❌ Все методы сохранения не сработали');
    return { success: false, method: 'unsupported' };
  } catch (error) {
    traceCharacterTransfer('error', '❌ Ошибка сохранения:', error);
    return { success: false, method: 'unsupported', error };
  }
};

/**
 * Легаси-реализация выбора файла через скрытый input (фолбэк)
 * Улучшенная версия для Android с обработкой потери фокуса
 */
const pickFileLegacy = () =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    
    traceCharacterTransfer('info', '🔄 Создаем input для выбора файла...');
    const input = document.createElement('input');
    input.type = 'file';
    
    // ОЧЕНЬ широкий фильтр для Android - убираем ограничения
    // На Android лучше вообще не использовать accept или использовать очень простой
    input.accept = '*/*'; // Принимаем все файлы
    input.style.display = 'none';
    
    // Таймаут для очистки если ничего не выбрано
    let cleanupTimeout = null;
    
    const cleanup = () => {
      traceCharacterTransfer('info', '🧹 Очищаем input...');
      if (cleanupTimeout) clearTimeout(cleanupTimeout);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      // Удаляем все обработчики
      input.onchange = null;
      input.oncancel = null;
      input.onabort = null;
    };
    
    input.onchange = () => {
      traceCharacterTransfer('info', '📄 Событие onchange сработало');
      cleanup();
      const file = input.files && input.files[0];
      if (!file) {
        traceCharacterTransfer('info', '❌ Файл не выбран');
        resolve(null);
        return;
      }
      
      traceCharacterTransfer('info', `📁 Выбран файл: ${file.name}, размер: ${file.size} байт, тип: ${file.type}`);
      
      // Проверяем размер файла (максимум 10MB)
      if (file.size > 10 * 1024 * 1024) {
        traceCharacterTransfer('error', '❌ Файл слишком большой:', file.size);
        resolve(null);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        traceCharacterTransfer('info', '✅ Файл успешно прочитан');
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => {
        traceCharacterTransfer('error', '❌ Ошибка чтения файла');
        resolve(null);
      };
      reader.onabort = () => {
        traceCharacterTransfer('info', '⏹️  Чтение файла прервано');
        resolve(null);
      };
      reader.readAsText(file, 'utf-8');
    };
    
    // Обработка отмены на Android (не все браузеры поддерживают oncancel)
    input.oncancel = () => {
      traceCharacterTransfer('info', '⏹️  Пользователь отменил выбор файла (oncancel)');
      cleanup();
      resolve(null);
    };
    
    input.onabort = () => {
      traceCharacterTransfer('info', '⏹️  Выбор файла прерван (onabort)');
      cleanup();
      resolve(null);
    };

    // Добавляем обработку потери фокуса (проблема на Android)
    const handleWindowBlur = () => {
      traceCharacterTransfer('info', '👁️‍🗨️  Окно потеряло фокус (возможно открыт файловый менеджер)');
      // Не очищаем сразу, ждем возвращения фокуса
    };
    
    const handleWindowFocus = () => {
      traceCharacterTransfer('info', '👁️‍🗨️  Окно получило фокус');
      // Если через 1 секунду после фокуса файл еще не выбран, очищаем
      cleanupTimeout = setTimeout(() => {
        if (input.parentNode) {
          traceCharacterTransfer('info', '⏰ Таймаут: файл не выбран за 1 секунду после фокуса');
          cleanup();
          resolve(null);
        }
      }, 1000);
    };

    // Добавляем глобальные обработчики
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    
    // Убираем обработчики после очистки
    const originalCleanup = cleanup;
    cleanup = () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      originalCleanup();
    };

    document.body.appendChild(input);
    traceCharacterTransfer('info', '👆 Кликаем по input...');
    input.click();
    
    // Автоматическая очистка через 30 секунд на всякий случай
    setTimeout(() => {
      if (input.parentNode) {
        traceCharacterTransfer('info', '⏰ Автоматическая очистка через 30 секунд');
        cleanup();
        resolve(null);
      }
    }, 30000);
  });

/**
 * Импорт через browser-fs-access.fileOpen или expo-document-picker
 * Улучшенная версия для Android с детальным логированием
 * @returns {Promise<string|null>}
 */
export const pickCharacterFileWeb = async () => {
  traceCharacterTransfer('info', '📂 Начинаем процесс выбора файла...');
  
  try {
    // Пробуем все методы в правильном порядке с логированием
    const methodsToTry = [];
    
    // 1. browser-fs-access — приоритет для веба (но может не работать на Android)
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileOpen) {
      methodsToTry.push({
        name: 'browser-fs-access',
        execute: async () => {
          traceCharacterTransfer('info', '🔄 Пробуем browser-fs-access.fileOpen...');
          const blob = await fsAccess.fileOpen({
            mimeTypes: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
            extensions: [EXPORT_FILE_EXTENSION, '.json', '*'].filter(Boolean),
            description: 'Файл персонажа Fallout 2d20 (.rpgc или .json)',
            multiple: false,
          });
          traceCharacterTransfer('info', '✅ browser-fs-access получил файл');
          return await blob.text();
        }
      });
    }

    // 2. На нативных платформах используем DocumentPicker
    if (DocumentPicker && DocumentPicker.getDocumentAsync) {
      methodsToTry.push({
        name: 'expo-document-picker',
        execute: async () => {
          traceCharacterTransfer('info', '🔄 Пробуем expo-document-picker...');
          const result = await DocumentPicker.getDocumentAsync({
            type: ['application/json', 'text/json', 'application/octet-stream', '.rpgc', '.json'],
            copyToCacheDirectory: true,
            multiple: false,
          });

          if (result.canceled) {
            traceCharacterTransfer('info', '⏹️  Пользователь отменил выбор в DocumentPicker');
            throw new Error('User canceled');
          }

          const file = result.assets[0];
          if (!file || !file.uri) {
            traceCharacterTransfer('error', '❌ DocumentPicker вернул пустой файл');
            throw new Error('No file selected');
          }

          traceCharacterTransfer('info', `📁 DocumentPicker выбрал файл: ${file.uri}`);
          
          try {
            if (file.file && typeof file.file.text === 'function') {
              return await file.file.text();
            }
            const response = await fetch(file.uri);
            const text = await response.text();
            traceCharacterTransfer('info', '✅ Файл успешно загружен через DocumentPicker');
            return text;
          } catch (fetchErr) {
            traceCharacterTransfer('error', '❌ Ошибка загрузки файла из DocumentPicker:', fetchErr);
            throw fetchErr;
          }
        }
      });
    }

    // 3. Улучшенный legacy input - работает почти везде
    methodsToTry.push({
      name: 'legacy-input',
      execute: async () => {
        traceCharacterTransfer('info', '🔄 Пробуем улучшенный legacy input...');
        const result = await pickFileLegacy();
        if (result) {
          traceCharacterTransfer('info', '✅ Legacy input успешно загрузил файл');
          return result;
        }
        throw new Error('Legacy input не выбрал файл');
      }
    });

    // Пробуем все методы по порядку
    traceCharacterTransfer('info', `🔍 Доступно методов загрузки файлов: ${methodsToTry.length}`);
    
    for (let i = 0; i < methodsToTry.length; i++) {
      const method = methodsToTry[i];
      try {
        traceCharacterTransfer('info', `\n--- Попытка ${i + 1}: ${method.name} ---`);
        const result = await method.execute();
        if (result) {
          traceCharacterTransfer('info', `\n🎉 УСПЕХ: файл загружен методом "${method.name}"`);
          return result;
        }
      } catch (methodError) {
        if (methodError && methodError.name === 'AbortError') {
          traceCharacterTransfer('info', `\n⏹️  Пользователь отменил в методе "${method.name}"`);
          return null;
        }
        if (methodError.message === 'User canceled') {
          traceCharacterTransfer('info', `\n⏹️  Пользователь отменил выбор в методе "${method.name}"`);
          return null;
        }
        traceCharacterTransfer('warn', `\n❌ Метод "${method.name}" не сработал:`, methodError.message || methodError);
        // Продолжаем пробовать следующий метод
      }
    }

    traceCharacterTransfer('error', '\n❌ Все методы загрузки файлов не сработали');
    return null;
  } catch (error) {
    traceCharacterTransfer('error', '\n❌ Критическая ошибка загрузки файла:', error);
    // Последняя попытка через legacy
    try {
      traceCharacterTransfer('info', '🔄 Последняя попытка через legacy input...');
      return await pickFileLegacy();
    } catch (finalError) {
      traceCharacterTransfer('error', '❌ И legacy input не сработал:', finalError);
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
        traceCharacterTransfer('warn', `Method ${method.name} failed:`, methodError);
        // Продолжаем пробовать следующий метод
      }
    }

    return { method: 'unsupported', success: false };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return { method: 'cancelled', success: false, aborted: true };
    }
    traceCharacterTransfer('error', 'Ошибка сохранения:', error);
    return { method: 'unsupported', success: false, error };
  }
};

export const loadCharacter = async () => {
  try {
    const rawText = await pickCharacterFileWeb();
    if (!rawText) return null;
    return JSON.parse(rawText);
  } catch (error) {
    traceCharacterTransfer('error', 'Ошибка загрузки:', error);
    return null;
  }
};

/**
 * Алиасы для обратной совместимости
 */
export const pickCharacterFile = pickCharacterFileWeb;
export const downloadCharacterPayload = downloadCharacterPayloadWeb;