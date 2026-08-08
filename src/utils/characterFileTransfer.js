/**
 * src/utils/characterFileTransfer.js
 * Платформенный адаптер для сохранения/загрузки персонажей.
 * 
 * WEB / PWA: используется browser-fs-access — обёртка над File System
 * Access API с надёжным legacy-фолбэком (input+FileReader / a[download]).
 * Больше НЕ используем expo-document-picker на вебе — его веб-шим
 * недостаточно надёжен в PWA-контейнерах на Android.
 * 
 * NATIVE (собранное Android/iOS-приложение, не PWA): expo-document-picker
 * expo-file-system + expo-sharing.
 * 
 * Чистая логика вынесена в domain/characterTransfer.js
 */

import { Platform } from 'react-native';
import {
  EXPORT_FILE_EXTENSION,
  sanitizeFileName as domainSanitizeFileName,
} from '../../domain/characterTransfer';

let DocumentPickerModule = null;
let FileSystemModule = null;
let SharingModule = null;
try {
  // eslint-disable-next-line global-require
  DocumentPickerModule = require('expo-document-picker');
  // eslint-disable-next-line global-require
  FileSystemModule = require('expo-file-system');
  // eslint-disable-next-line global-require
  SharingModule = require('expo-sharing');
} catch {
  DocumentPickerModule = null;
  FileSystemModule = null;
  SharingModule = null;
}

// browser-fs-access динамически подхватывает нужную реализацию сам,
// подключаем только на вебе, чтобы не тянуть лишний код в native-бандл.
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
 * Сохранение данных персонажа
 * Улучшенная версия: начинаем с Web Share API для лучшей работы на Android
 */
export const saveCharacter = async (characterData, filename = 'character.json') => {
  try {
    const safeFilename =
      filename.endsWith(EXPORT_FILE_EXTENSION) || filename.endsWith('.json')
        ? filename
        : domainSanitizeFileName(filename.replace(/\.(json|rpgc)$/, '')) + '.json';

    const jsonString = JSON.stringify(characterData, null, 2);

    if (Platform.OS === 'web') {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], safeFilename, { type: 'application/json' });

      // Определяем доступные методы в правильном порядке для мобильных устройств
      const methodsToTry = [];
      
      // 1. Web Share API - ПРИОРИТЕТ для всех мобильных устройств
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
        methodsToTry.push({
          name: 'share-web',
          execute: async () => {
            // Проверяем, может ли браузер поделиться файлом
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: 'Сохранение персонажа',
              });
              return { method: 'share-web', success: true };
            }
            throw new Error('Web Share API не поддерживает этот файл');
          }
        });
      }

      // 2. browser-fs-access - для десктопов (может не работать на Android)
      if (fsAccess && fsAccess.fileSave) {
        methodsToTry.push({
          name: 'browser-fs-access',
          execute: async () => {
            await fsAccess.fileSave(blob, {
              fileName: safeFilename,
              extensions: ['.json', EXPORT_FILE_EXTENSION].filter(Boolean),
              description: 'Файл персонажа',
            });
            return { method: 'browser-fs-access', success: true };
          }
        });
      }

      // 3. Anchor download - САМЫЙ НАДЕЖНЫЙ fallback, работает везде
      if (typeof document !== 'undefined') {
        methodsToTry.push({
          name: 'anchor-download',
          execute: () => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = safeFilename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { method: 'anchor-download', success: true };
          }
        });
      }

      // Пробуем все методы по порядку
      for (const method of methodsToTry) {
        try {
          const result = await method.execute();
          console.log(`✅ Метод сохранения "${method.name}" сработал`);
          return result;
        } catch (methodError) {
          if (methodError && methodError.name === 'AbortError') {
            console.log(`⏹️  Пользователь отменил в методе "${method.name}"`);
            return { method: method.name, success: false, aborted: true };
          }
          console.warn(`❌ Метод "${method.name}" не сработал:`, methodError.message || methodError);
          // Продолжаем пробовать следующий метод
        }
      }

      console.error('❌ Все методы сохранения не сработали');
      return { method: 'unsupported', success: false };
    }

    // --- Native (собранное приложение) ---
    if (FileSystemModule && SharingModule) {
      const dir = FileSystemModule.cacheDirectory;
      const fileUri = dir + safeFilename;
      await FileSystemModule.writeAsStringAsync(fileUri, jsonString, {
        encoding: FileSystemModule.EncodingType.UTF8,
      });

      if (await SharingModule.isAvailableAsync()) {
        await SharingModule.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Сохранить персонажа',
        });
        return { method: 'share-native', success: true };
      }
      return { method: 'saved-to-cache', success: true, fileUri };
    }

    return { method: 'unsupported', success: false };
  } catch (error) {
    // AbortError = пользователь закрыл диалог сохранения — это не ошибка
    if (error && error.name === 'AbortError') {
      return { method: 'cancelled', success: false, aborted: true };
    }
    console.error('Ошибка сохранения:', error);
    return { method: 'unsupported', success: false, error };
  }
};

/**
 * Загрузка данных персонажа — возвращает распарсенный объект
 */
export const loadCharacter = async () => {
  const rawText = await loadCharacterRawText();
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch (error) {
    console.error('Ошибка парсинга JSON:', error);
    return null;
  }
};

/**
 * Загрузка данных персонажа — возвращает сырой текст
 * Улучшенная версия с надежным fallback для Android
 */
export const loadCharacterRawText = async () => {
  console.log('📂 Начинаем загрузку файла персонажа...');
  
  try {
    // Пробуем все методы в правильном порядке
    const methodsToTry = [];
    
    // 1. browser-fs-access для веба
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileOpen) {
      methodsToTry.push({
        name: 'browser-fs-access',
        execute: async () => {
          console.log('🔄 Пробуем browser-fs-access.fileOpen...');
          const blob = await fsAccess.fileOpen({
            mimeTypes: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
            extensions: ['.json', EXPORT_FILE_EXTENSION, '*'].filter(Boolean),
            description: 'Файл персонажа Fallout 2d20',
            multiple: false,
          });
          console.log('✅ browser-fs-access получил файл');
          return await blob.text();
        }
      });
    }

    // 2. DocumentPicker для нативных платформ
    if (DocumentPickerModule && DocumentPickerModule.getDocumentAsync) {
      methodsToTry.push({
        name: 'expo-document-picker',
        execute: async () => {
          console.log('🔄 Пробуем expo-document-picker...');
          const result = await DocumentPickerModule.getDocumentAsync({
            type: ['application/json', 'text/json', 'application/octet-stream', '.rpgc', '.json'],
            copyToCacheDirectory: true,
            multiple: false,
          });

          if (result.canceled) {
            console.log('⏹️  Пользователь отменил выбор');
            throw new Error('User canceled');
          }
          
          const file = result.assets[0];
          if (!file || !file.uri) {
            console.error('❌ DocumentPicker вернул пустой файл');
            throw new Error('No file selected');
          }

          console.log(`📁 Выбран файл: ${file.uri}`);
          
          if (FileSystemModule) {
            return await FileSystemModule.readAsStringAsync(file.uri, {
              encoding: FileSystemModule.EncodingType.UTF8,
            });
          }

          const response = await fetch(file.uri);
          return await response.text();
        }
      });
    }

    // 3. Legacy input как последний fallback
    methodsToTry.push({
      name: 'legacy-input',
      execute: async () => {
        console.log('🔄 Пробуем legacy input...');
        // Используем улучшенную версию legacy input
        const result = await new Promise((resolve) => {
          if (typeof document === 'undefined') {
            resolve(null);
            return;
          }
          
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '*/*'; // Принимаем все файлы на Android
          input.style.display = 'none';
          
          input.onchange = () => {
            const file = input.files && input.files[0];
            if (input.parentNode) input.parentNode.removeChild(input);
            if (!file) {
              resolve(null);
              return;
            }
            
            console.log(`📁 Выбран файл через legacy input: ${file.name}`);
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsText(file, 'utf-8');
          };
          
          // Таймаут для Android
          setTimeout(() => {
            if (input.parentNode) {
              input.parentNode.removeChild(input);
              resolve(null);
            }
          }, 30000);
          
          document.body.appendChild(input);
          input.click();
        });
        
        if (result) {
          console.log('✅ Legacy input успешно загрузил файл');
          return result;
        }
        throw new Error('Legacy input не выбрал файл');
      }
    });

    // Пробуем все методы по порядку
    console.log(`🔍 Доступно методов загрузки: ${methodsToTry.length}`);
    
    for (let i = 0; i < methodsToTry.length; i++) {
      const method = methodsToTry[i];
      try {
        console.log(`\n--- Попытка ${i + 1}: ${method.name} ---`);
        const result = await method.execute();
        if (result) {
          console.log(`\n🎉 УСПЕХ: файл загружен методом "${method.name}"`);
          return result;
        }
      } catch (methodError) {
        if (methodError && methodError.name === 'AbortError') {
          console.log(`\n⏹️  Пользователь отменил в методе "${method.name}"`);
          return null;
        }
        if (methodError.message === 'User canceled') {
          console.log(`\n⏹️  Пользователь отменил выбор в методе "${method.name}"`);
          return null;
        }
        console.warn(`\n❌ Метод "${method.name}" не сработал:`, methodError.message || methodError);
        // Продолжаем пробовать следующий метод
      }
    }

    console.error('\n❌ Все методы загрузки файлов не сработали');
    return null;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      console.log('\n⏹️  Пользователь отменил выбор файла');
      return null;
    }
    console.error('\n❌ Критическая ошибка загрузки файла:', error);
    return null;
  }
};

export const saveCharacterWithFallback = async (payload, filename) => {
  const result = await saveCharacter(payload, filename);
  return result.success;
};

export default {
  saveCharacter,
  loadCharacter,
  loadCharacterRawText,
  saveCharacterWithFallback,
};