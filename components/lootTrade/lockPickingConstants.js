// Патч 520: клиентская копия констант мини-игры замка. Сервер (CJS) держит
// свою копию в server/lockPicking.js; побайтовое совпадение проверяет
// __tests__/room/lock-picking-520.test.js (как с маркером терминала).
export const ARROWS = Object.freeze(['left', 'up', 'right', 'down']);

export const CELL_STATE = Object.freeze({
  HIDDEN: 'hidden',
  GREEN: 'green',
  RED: 'red',
  GREY: 'grey',
});
