import { Platform } from 'react-native';

let DocumentPicker = null;
let FileSystem = null;
let Sharing = null;
try {
  // eslint-disable-next-line global-require
  DocumentPicker = require('expo-document-picker');
  // eslint-disable-next-line global-require
  FileSystem = require('expo-file-system/legacy');
  // eslint-disable-next-line global-require
  Sharing = require('expo-sharing');
} catch {
  DocumentPicker = null;
  FileSystem = null;
  Sharing = null;
}

let fsAccess = null;
if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line global-require
    fsAccess = require('browser-fs-access');
  } catch {
    fsAccess = null;
  }
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const pickFileFromBrowserInput = () => new Promise((resolve) => {
  if (typeof document === 'undefined') return resolve(null);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json,text/json';
  input.style.display = 'none';
  const cleanup = () => input.parentNode?.removeChild(input);
  input.onchange = () => {
    const file = input.files?.[0];
    cleanup();
    if (!file) return resolve(null);
    if (file.size > MAX_IMPORT_BYTES) return resolve({ error: new Error('Файл больше 10 МБ.') });
    const reader = new FileReader();
    reader.onload = () => resolve({ text: typeof reader.result === 'string' ? reader.result : '', name: file.name });
    reader.onerror = () => resolve({ error: new Error('Не удалось прочитать файл.') });
    reader.readAsText(file, 'utf-8');
  };
  input.oncancel = () => {
    cleanup();
    resolve(null);
  };
  document.body.appendChild(input);
  input.click();
});

const readNativePickedFile = async (file) => {
  if (file.file && typeof file.file.text === 'function') return file.file.text();
  if (FileSystem?.readAsStringAsync) {
    return FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
  }
  const response = await fetch(file.uri);
  if (!response.ok) throw new Error(`Не удалось прочитать файл (${response.status}).`);
  return response.text();
};

export const pickUserEquipmentJsonFile = async () => {
  if (Platform.OS === 'web') {
    if (fsAccess?.fileOpen) {
      try {
        const file = await fsAccess.fileOpen({
          mimeTypes: ['application/json', 'text/json', 'text/plain'],
          extensions: ['.json'],
          description: 'JSON-файл пользовательского снаряжения',
          multiple: false,
        });
        if (!file) return null;
        if (file.size > MAX_IMPORT_BYTES) return { error: new Error('Файл больше 10 МБ.') };
        return { text: await file.text(), name: file.name || 'user-equipment.json' };
      } catch (error) {
        if (error?.name === 'AbortError') return null;
        // browser-fs-access can be unavailable in installed PWAs; use input fallback.
      }
    }
    return pickFileFromBrowserInput();
  }

  if (!DocumentPicker?.getDocumentAsync) return null;
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'application/octet-stream', '.json'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const file = result.assets?.[0];
  if (!file?.uri) throw new Error('Файл не выбран.');
  if (file.size && file.size > MAX_IMPORT_BYTES) throw new Error('Файл больше 10 МБ.');
  return { text: await readNativePickedFile(file), name: file.name || 'user-equipment.json' };
};

const downloadWeb = async (jsonText, fileName) => {
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  if (fsAccess?.fileSave) {
    await fsAccess.fileSave(blob, {
      fileName,
      extensions: ['.json'],
      description: 'JSON-файл пользовательского снаряжения',
    });
    return true;
  }
  if (typeof document === 'undefined') return false;
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
};

export const saveUserEquipmentJsonFile = async (documentValue, fileName) => {
  const jsonText = JSON.stringify(documentValue, null, 2);
  if (Platform.OS === 'web') return downloadWeb(jsonText, fileName);
  if (!FileSystem?.writeAsStringAsync || !Sharing?.shareAsync) return false;
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) return false;
  const fileUri = `${baseDir}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, jsonText, { encoding: 'utf8' });
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Сохранить JSON-шаблон снаряжения',
    UTI: 'public.json',
  });
  return true;
};
