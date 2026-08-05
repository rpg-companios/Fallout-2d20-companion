/**
 * components/screens/HomeScreen/logic/characterTransfer.js
 * Адаптерный слой: связывает чистую доменную логику (domain/characterTransfer)
 * с платформенными API (Web Share API, <a download>, expo-document-picker).
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
 * Сохранение через Web Share API (PWA iOS/Android) + фолбэк на anchor
 * Архитектура решения:
 * 1. navigator.share({ files: [file] }) — нативное меню «Поделиться» → «Сохранить в файлы»
 * 2. Фолбэк: <a download> для десктопа
 * @returns {Promise<{success: boolean, method: 'share'|'anchor'|'unsupported', aborted?: boolean}>}
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

    // 1. Web Share API — основное решение для PWA
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

    // 2. Фолбэк
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
    input.accept = `${EXPORT_FILE_EXTENSION},application/json,.json`;
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
 * Импорт через expo-document-picker + фолбэк
 * Должен вызываться строго в onPress (требование iOS Safari)
 * @returns {Promise<string|null>}
 */
export const pickCharacterFileWeb = async () => {
  try {
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
        console.warn('fetch Blob URI failed, fallback to legacy:', fetchErr);
        if (Platform.OS === 'web' || typeof document !== 'undefined') {
          return await pickFileLegacy();
        }
        return null;
      }
    }

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
  const file = new File([blob], safeFilename, { type: 'application/json' });

  try {
    if (Platform.OS === 'web' && canUseWebShareWithFiles(file)) {
      await navigator.share({
        files: [file],
        title: 'Сохранение персонажа',
      });
      return;
    }

    if (typeof document !== 'undefined') {
      downloadViaAnchorFallback(blob, safeFilename);
    }
  } catch (error) {
    console.error('Ошибка сохранения:', error);
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
