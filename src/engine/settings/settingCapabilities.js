// Каталог возможностей движка, которые сеттинг объявляет в манифесте.
//
// Возможность — это не «фича в UI», а точка, в которой движок вызывает код
// сеттинга (или наоборот). Идентификаторы намеренно совпадают с именами
// сервисов, которые движок запрашивает через `getSettingService(id)`:
// объявление в манифесте и фактическая реализация проверяются одним и тем же
// именем. Опечатка в манифесте больше не проходит молча.
//
// `service` — какой ключ обязан вернуть runtime сеттинга в `services`.
// Возможности без `service` — требования к движку, а не к сеттингу.
export const SETTING_CAPABILITY_CATALOG = Object.freeze({
  inventory: Object.freeze({
    service: 'inventory',
    description: 'Предметы, экипировка, слоты, категории, торговля',
  }),
  consumables: Object.freeze({
    service: 'consumables',
    description: 'Расходники и эффект от их применения',
  }),
  perks: Object.freeze({
    service: 'perks',
    description: 'Прокачка: выбор и ранги',
  }),
  origins: Object.freeze({
    service: 'originPresentation',
    description: 'Происхождения и их оформление',
  }),
  diseases: Object.freeze({
    service: 'diseases',
    description: 'Болезни и состояния',
  }),
  alerts: Object.freeze({
    service: 'alerts',
    description: 'Свои диалоги и уведомления сеттинга',
  }),
  saves: Object.freeze({
    service: 'characterSave',
    description: 'Сохранение и загрузка персонажа',
  }),
  migrations: Object.freeze({
    service: 'saveMigrations',
    description: 'Миграции сохранений прошлых версий',
  }),
  cloud: Object.freeze({
    service: 'cloudSync',
    description: 'Синхронизация с облаком',
  }),
  // Требуются от движка, а не реализуются сеттингом: сеттинг заявляет, что
  // опирается на движковый расчёт, и движок обязан его предоставить.
  damage: Object.freeze({
    description: 'Расчёт урона и защит движком',
  }),
  bodyplan: Object.freeze({
    description: 'Слоты конечностей по данным сеттинга',
  }),
  equipment: Object.freeze({
    description: 'Надевание и снятие экипировки движком',
  }),
  crafting: Object.freeze({
    description: 'Крафт и разбор движком',
  }),
  trading: Object.freeze({
    description: 'Покупка и продажа движком',
  }),
});

export const SETTING_CAPABILITY_IDS = Object.freeze(Object.keys(SETTING_CAPABILITY_CATALOG));

/** Возможность известна движку этой версии. */
export const isKnownSettingCapability = (id) => (
  typeof id === 'string' && Object.hasOwn(SETTING_CAPABILITY_CATALOG, id)
);

/** Сервис, который сеттинг обязан предоставить для этой возможности. */
export const settingCapabilityService = (id) => (
  isKnownSettingCapability(id) ? (SETTING_CAPABILITY_CATALOG[id].service ?? null) : null
);
