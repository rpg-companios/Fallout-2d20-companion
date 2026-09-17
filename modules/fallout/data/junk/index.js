// Реестр группы «хлам» (270): где лежат данные разбора — одна точка.
// domain/registry.js и i18n/equipmentCatalog.js импортируют этот лист, а не
// отдельные файлы: новая группа или переезд пути = правка здесь, а не
// «импорт, импорт, импорт» по всем документам. Лист модулей данных не импортирует
// ничего из домена — циклов нет по построению.
import junk from './junk.json';
import materials from './material.json';
import tables from './tables.json';
import junkNamesRu from '../../i18n/ru-RU/data/junk/junk.json';
import junkNamesEn from '../../i18n/en-EN/data/junk/junk.json';
import materialNamesRu from '../../i18n/ru-RU/data/junk/material.json';
import materialNamesEn from '../../i18n/en-EN/data/junk/material.json';
import tableLabelsRu from '../../i18n/ru-RU/data/junk/tables.json';
import tableLabelsEn from '../../i18n/en-EN/data/junk/tables.json';

export const JUNK_DATASET = {
  junk,
  materials,
  tables,
  // junk/materials — списки имён для каталога; tableLabels — подписи
  // d20-таблиц для ГМ-секции (сами таблицы подписей не носят, 269).
  names: {
    'ru-RU': { junk: junkNamesRu, materials: materialNamesRu, tableLabels: tableLabelsRu },
    'en-EN': { junk: junkNamesEn, materials: materialNamesEn, tableLabels: tableLabelsEn },
  },
};
