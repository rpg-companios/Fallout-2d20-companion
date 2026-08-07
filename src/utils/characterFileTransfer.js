/**
 * src/utils/characterFileTransfer.js
 * Платформенный адаптер для сохранения/загрузки персонажей в PWA.
 * Чистая логика вынесена в domain/characterTransfer.js
 */

import { Platform } from 'react-native';
import {
  EXPORT_FILE_EXTENSION,
  sanitizeFileName as domainSanitizeFileName,
} from '../../domain/characterTransfer';

let DocumentPickerModule = null;
try {
  // eslint-disable-next-line global-require
  DocumentPickerModule = require('expo-document-picker');
} catch {
  DocumentPickerModule = null;
}

const canUseWebShareWithFiles = (file) => {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
};

const downloadViaAnchor = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const pickFileViaLegacyInput = (accept = '.rpgc,application/json') =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
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
 * Сохранение данных персонажа
 * Использует Web Share API в PWA, иначе anchor fallback
 */
export const saveCharacter = async (characterData, filename = 'character.json') => {
  try {
    const safeFilename =
      filename.endsWith(EXPORT_FILE_EXTENSION) || filename.endsWith('.json')
        ? filename
        : domainSanitizeFileName(filename.replace(/\.(json|rpgc)$/, ''));

    const jsonString = JSON.stringify(characterData, null, 2);

    if (Platform.OS === 'web') {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], safeFilename, { type: 'application/json' });

      if (canUseWebShareWithFiles(file) && navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: 'Сохранение персонажа',
          });
          return { method: 'share', success: true };
        } catch (shareError) {
          if (shareError && shareError.name === 'AbortError') {
            return { method: 'share', success: false, aborted: true };
          }
          console.warn('Web Share API failed, falling back to anchor:', shareError);
        }
      }

      if (typeof document !== 'undefined') {
        downloadViaAnchor(blob, safeFilename);
        return { method: 'anchor', success: true };
      }

      return { method: 'unsupported', success: false };
    } else {
      console.warn('saveCharacter: native save not implemented, need expo-file-system + expo-sharing');
      return { method: 'unsupported', success: false };
    }
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    return { method: 'unsupported', success: false, error };
  }
};

/**
 * Загрузка данных персонажа
 */
export const loadCharacter = async () => {
  try {
    if (DocumentPickerModule && DocumentPickerModule.getDocumentAsync) {
      const result = await DocumentPickerModule.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream', '.rpgc', '.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return null;
      const file = result.assets[0];

      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const text = await response.text();
        return JSON.parse(text);
      }

      try {
        const response = await fetch(file.uri);
        const text = await response.text();
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    const rawText = await pickFileViaLegacyInput();
    if (!rawText) return null;
    return JSON.parse(rawText);
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    return null;
  }
};

/**
 * Возвращает сырой текст (для совместимости с parseCharacterImportPayload)
 */
export const loadCharacterRawText = async () => {
  try {
    if (DocumentPickerModule && DocumentPickerModule.getDocumentAsync) {
      const result = await DocumentPickerModule.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream', '.rpgc', '.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return null;
      const file = result.assets[0];

      if (Platform.OS === 'web' || (typeof file.uri === 'string' && file.uri.startsWith('blob:'))) {
        const response = await fetch(file.uri);
        const text = await response.text();
        return text;
      }

      try {
        const response = await fetch(file.uri);
        const text = await response.text();
        return text;
      } catch {
        return null;
      }
    }

    return await pickFileViaLegacyInput();
  } catch (error) {
    console.error('Ошибка загрузки (raw):', error);
    try {
      return await pickFileViaLegacyInput();
    } catch {
      return null;
    }
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
