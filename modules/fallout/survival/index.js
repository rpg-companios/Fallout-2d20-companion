// Выживание — модуль сеттинга Fallout (docs/survival-system-design.md).
//
// Регистрация расширения состояния в движке (src/store/stateExtensions.js):
//   - поле сейва 'survival' — фабрика при создании персонажа (максимумы
//     органикам, null роботам/киборгам), hydrate при загрузке, reset при
//     сбросе персонажа;
//   - миграция v22 -> v23 (migrateSurvivalField) встраивается в цепочку
//     движка на то же место, что и раньше (патч 198): номер схемы не
//     меняется, старые сейвы совместимы.
//
// Импорт этого модуля — side-effect регистрации (App.js импортирует его
// до монтирования CharacterProvider). Модуль не тянет React/RN: хуки для
// экранов лежат в hooks.js отдельно (иначе тесты регистрации падали бы
// на Flow-парсинге react-native).

import {
  registerConditionEventListener,
  registerConsumableAppliedListener,
  registerStateExtension,
  registerStateMigration,
} from '../../../src/store/stateExtensions';
import { createSurvivalState, withDiseaseFatigue, withoutDiseaseFatigue } from './survival';
import { migrateSurvivalField } from './migration';
import { survivalConsumableListener } from './operations';

// Тип персонажа для фабрики: ориджин в сейве — объект с characterType,
// при создании нового персонажа — выбранный ориджин из каталога.
const survivalCharacterType = (character) => {
  const origin = character?.origin;
  if (origin && typeof origin === 'object' && origin.characterType) {
    return origin.characterType;
  }
  return null; // нет characterType — фабрика вернёт null (шкал нет)
};

registerStateExtension({
  id: 'survival',
  fieldKey: 'survival',
  factory: (character) => {
    const type = survivalCharacterType(character);
    return type ? createSurvivalState(type) : null;
  },
  // Загрузка сейва: поле уже создано миграцией v23 (или фабрикой).
  // hydrate идемпотентна: null/undefined остаются null (роботы/киборги
  // и «ещё не создано»), объекту достраивается аккумулятор отдыха в
  // постели (патч 215) — дозаполнение внутри существующего поля,
  // версию схемы не поднимает.
  hydrate: (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const bedRestHours = Number(raw.bedRestHours);
    return Number.isFinite(bedRestHours) && bedRestHours >= 0
      ? { ...raw, bedRestHours }
      : { ...raw, bedRestHours: 0 };
  },
  reset: () => null,
});

// Переход v22 -> v23: место в цепочке — как в патче 198 (MIGRATIONS[22]).
registerStateMigration(migrateSurvivalField, 22);

// Расходники: употребление еды/напитков ЛЮБЫМ путём (инвентарь, модалки
// выживания) двигает шкалы — слушатель патча 208.
registerConsumableAppliedListener({ id: 'survival', listener: survivalConsumableListener });

// Болезни (патч 215): усталость источника «болезнь» — +1 при заражении,
// −1 при излечении. Слушатели событий состояний (stateExtensions.js):
// движок уведомляет при заражении/излечении, модуль двигает усталость.
const diseaseFatigueListener = (payload, ctx) => {
  const survival = ctx?.stateExtensions?.survival ?? null;
  if (!survival || payload?.kind !== 'disease') return null;
  if (payload.event === 'infected') {
    ctx.setStateExtension('survival', withDiseaseFatigue(survival, 1));
    return { survivalFatigueApplied: true };
  }
  if (payload.event === 'cured') {
    ctx.setStateExtension('survival', withoutDiseaseFatigue(survival, 1));
    return { survivalFatigueRemoved: true };
  }
  return null;
};

registerConditionEventListener({
  id: 'survivalDiseaseFatigue',
  kind: 'disease',
  event: 'infected',
  listener: diseaseFatigueListener,
});
registerConditionEventListener({
  id: 'survivalDiseaseFatigue',
  kind: 'disease',
  event: 'cured',
  listener: diseaseFatigueListener,
});

export { createSurvivalState } from './survival';
export { migrateSurvivalField } from './migration';
export { sleepSurvival, survivalConsumableListener } from './operations';
export * from './survival';
