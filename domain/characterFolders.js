// Знание каталога в сейве персонажа (патч 212, docs/character-folders-design.md §14).
//
// ЗАЧЕМ.
//   Каталоги и принадлежность жили только в SQLite текущего устройства
//   (character_folders / character_folder_memberships) и не уезжали ни в
//   облако, ни в файл импорта: на новом устройстве персонажи падали в
//   корневой список. Теперь сейв персонажа несёт поле `folder`:
//     folder: { id, name } | null (null/отсутствие = корневой список).
//   При загрузке/импорте на устройстве без такого каталога он создаётся
//   (вне зависимости от настройки «каталоги персонажей») и персонаж
//   помещается внутрь.
//
// КАК УСТРОЕНО.
//   Чистые функции решения; грязная работа (SQL) — в db/Database.js.
//   Единое правило сверки: СЕЙВ — знание, ЧЛЕНСТВО — применённое знание.
//   Сейв и членство всегда согласованы на устройстве, где произошло
//   действие (перемещение штампует сейв сразу), поэтому при расхождении
//   членство приводится к сейву (свежая правда из облака/файла).
//
//   Сейв-формат: поле опциональное, версия схемы — v24 (идентичная
//   миграция: поле пишется и читается слоем БД, преобразований нет).

/** Валидная ссылка на каталог: id — непустая строка, имя — непустое после обрезки. */
export const isValidFolderReference = (folder) => Boolean(
  folder
  && typeof folder === 'object'
  && typeof folder.id === 'string'
  && folder.id.length > 0
  && typeof folder.name === 'string'
  && folder.name.trim().length > 0,
);

/**
 * Штамп каталога в данные сейва. folder = { id, name } — ставит поле;
 * null/undefined — снимает поле (корневой список). Возвращает новую копию.
 */
export const stampFolderOnSaveData = (data, folder) => {
  const next = { ...(data || {}) };
  if (isValidFolderReference(folder)) {
    next.folder = { id: folder.id, name: folder.name };
  } else {
    delete next.folder;
  }
  return next;
};

/**
 * Решение сверки при загрузке/сохранении.
 *   saveFolder     — поле folder из сейва персонажа (может отсутствовать).
 *   localFolderId  — id каталога из таблицы членства устройства (или null).
 * Возвращает:
 *   { action: 'none' }                       — ничего делать не нужно;
 *   { action: 'ensure', folder: {id,name} }  — каталог из сейва надо
 *                                              гарантировать (создать при
 *                                              отсутствии) и поместить
 *                                              персонажа внутрь.
 */
export const planFolderReconcile = ({ saveFolder, localFolderId = null }) => {
  if (!isValidFolderReference(saveFolder)) return { action: 'none' };
  if (localFolderId === saveFolder.id) return { action: 'none' };
  return { action: 'ensure', folder: { id: saveFolder.id, name: saveFolder.name } };
};

/**
 * Наложение каталога на сейв при записи. localFolder — { id, name } из
 * членства устройства (или null):
 *   - членство есть → сейв штампуется им (устройство — живая правда);
 *   - членства нет → сейв НЕ трогаем: знание из облака/файла должно
 *     пережить импорт на новом устройстве до сверки (иначе каталог не
 *     воссоздался бы). Сверку после наложения делает planFolderReconcile.
 */
export const overlayFolderOnSaveData = ({ data, localFolder = null }) => {
  if (!isValidFolderReference(localFolder)) return data || {};
  return stampFolderOnSaveData(data, localFolder);
};
