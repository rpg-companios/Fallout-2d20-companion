// Чтение карты host-модулей движка из её исходника.
//
// Зачем из исходника, а не импортом: `settingRuntimeHost.js` тянет React Native
// и стор, поэтому в Node его не импортировать. Но список модулей нужен и
// стенду пакета, и тестам — и он обязан читаться одинаково. Дублировать разбор
// нельзя: на этом уже один раз потерялся `react` (ключ записан без кавычек), и
// стенд стал ругаться «у движка нет react» на исправном пакете.
//
// Разбор понимает все три формы ключа, которые бывают в файле:
//   '@expo/vector-icons': hostModule(...)   // в кавычках
//   react: hostModule(...)                  // голый идентификатор
//   "react-native": hostModule(...)         // в двойных кавычках
//
// Если формат карты изменится так, что разбор перестанет что-то находить,
// вызывающий код обязан упасть громко: молча пропустить проверку хуже, чем
// отказаться её делать.
import fs from 'node:fs';

const ENTRY_RE = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*hostModule\(/gm;

/** @returns {string[]} id host-модулей в порядке объявления */
export const parseHostModuleIds = (source) => {
  const ids = [];
  for (const match of String(source).matchAll(ENTRY_RE)) {
    ids.push(match[1] ?? match[2] ?? match[3]);
  }
  return ids;
};

/** @returns {string[]} id host-модулей из файла карты */
export const readHostModuleIds = (sourceFile) => parseHostModuleIds(fs.readFileSync(sourceFile, 'utf8'));
