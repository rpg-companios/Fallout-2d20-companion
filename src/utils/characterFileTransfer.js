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
 */
export const saveCharacter = async (characterData, filename = 'character.json') => {
  try {
    const safeFilename =
      filename.endsWith(EXPORT_FILE_EXTENSION) || filename.endsWith('.json')
        ? filename
        : domainSanitizeFileName(filename.replace(/\.(json|rpgc)$/, '')) + '.json';

    const jsonString = JSON.stringify(characterData, null, 2);

    if (Platform.OS === 'web' && fsAccess && fsAccess.fileSave) {
      const blob = new Blob([jsonString], { type: 'application/json' });
      // fileSave сам решает: показать нативный "Save As" диалог
      // (File System Access API) или скачать файл через a[download].
      // Работает одинаково в обычной вкладке и в установленном PWA.
      await fsAccess.fileSave(blob, {
        fileName: safeFilename,
        extensions: ['.json', EXPORT_FILE_EXTENSION].filter(Boolean),
        description: 'Файл персонажа',
      });
      return { method: 'browser-fs-access', success: true };
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
 */
export const loadCharacterRawText = async () => {
  try {
    if (Platform.OS === 'web' && fsAccess && fsAccess.fileOpen) {
      const blob = await fsAccess.fileOpen({
        mimeTypes: ['application/json', 'text/json', 'text/plain'],
        extensions: ['.json', EXPORT_FILE_EXTENSION].filter(Boolean),
        description: 'Файл персонажа',
        multiple: false,
      });
      return await blob.text();
    }

    // --- Native ---
    if (DocumentPickerModule && DocumentPickerModule.getDocumentAsync) {
      const result = await DocumentPickerModule.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream', '.rpgc', '.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return null;
      const file = result.assets[0];

      if (FileSystemModule) {
        return await FileSystemModule.readAsStringAsync(file.uri, {
          encoding: FileSystemModule.EncodingType.UTF8,
        });
      }

      const response = await fetch(file.uri);
      return await response.text();
    }

    return null;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      // пользователь закрыл диалог выбора файла — не ошибка
      return null;
    }
    console.error('Ошибка загрузки (raw):', error);
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