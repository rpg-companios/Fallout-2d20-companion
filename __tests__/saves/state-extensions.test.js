// Патч 207 — реестр расширений состояния (src/store/stateExtensions.js):
// родовой механизм движка для сеттинговых полей сейва. Тесты реестра без
// сеттинговых правил; встраивание миграции в цепочку покрыто тестом
// выживания (survival-migration.test.js).
//
// Реестр — модульная синглтон-карта и в проде только растёт, поэтому тесты
// регистрируют УНИКАЛЬНЫЕ id/fieldKey (дубликаты падают — это и проверяем).

import { describe, expect, it } from 'vitest';
import {
  createStateExtensionFields,
  getRegisteredStateMigrations,
  hydrateStateExtensionFields,
  registerStateExtension,
  registerStateMigration,
  resetStateExtensionFields,
} from '../../src/store/stateExtensions';
describe('stateExtensions: валидация регистрации', () => {
  it('обязательные поля: id, fieldKey, factory', () => {
    expect(() => registerStateExtension(null)).toThrow();
    expect(() => registerStateExtension({})).toThrow(/id/);
    expect(() => registerStateExtension({ id: 'x' })).toThrow(/fieldKey/);
    expect(() => registerStateExtension({ id: 'x', fieldKey: 'y' })).toThrow(/factory/);
  });

  it('повторная регистрация того же id — ошибка', () => {
    registerStateExtension({ id: 'dupIdA', fieldKey: 'dupFieldA', factory: () => 1 });
    expect(() => registerStateExtension({ id: 'dupIdA', fieldKey: 'other', factory: () => 2 }))
      .toThrow(/уже зарегистрировано/);
  });

  it('два расширения не могут владеть одним полем сейва', () => {
    registerStateExtension({ id: 'ownerB', fieldKey: 'sharedFieldB', factory: () => 1 });
    expect(() => registerStateExtension({ id: 'intruderB', fieldKey: 'sharedFieldB', factory: () => 2 }))
      .toThrow(/уже принадлежит/);
  });
});

describe('stateExtensions: фабрики / hydrate / reset', () => {
  it('createStateExtensionFields: фабрика получает персонажа, поле кладётся по fieldKey', () => {
    registerStateExtension({
      id: 'factoryC',
      fieldKey: 'factoryFieldC',
      factory: (character) => `type=${character?.origin?.characterType}`,
    });
    const fields = createStateExtensionFields({ origin: { characterType: 'human' } });
    expect(fields.factoryFieldC).toBe('type=human');
  });

  it('hydrate: без hydrate поле берётся как есть, с hydrate — нормализуется', () => {
    registerStateExtension({ id: 'hydrateD', fieldKey: 'hydrateFieldD', factory: () => null });
    const saved = { hydrateFieldD: null };
    expect(hydrateStateExtensionFields(saved, {}).hydrateFieldD).toBeNull();

    registerStateExtension({
      id: 'hydrateE',
      fieldKey: 'hydrateFieldE',
      factory: () => null,
      hydrate: (raw, character) => (raw == null ? `default-for-${character.origin?.id}` : raw),
    });
    const fields = hydrateStateExtensionFields(
      { hydrateFieldD: 1, hydrateFieldE: undefined },
      { origin: { id: 'brotherhood' } },
    );
    expect(fields.hydrateFieldD).toBe(1); // без hydrate — не трогаем
    expect(fields.hydrateFieldE).toBe('default-for-brotherhood');
  });

  it('reset: по умолчанию null, свой reset возвращает своё', () => {
    registerStateExtension({ id: 'resetF', fieldKey: 'resetFieldF', factory: () => 5 });
    registerStateExtension({
      id: 'resetG',
      fieldKey: 'resetFieldG',
      factory: () => 5,
      reset: () => ({ fresh: true }),
    });
    const fields = resetStateExtensionFields();
    expect(fields.resetFieldF).toBeNull();
    expect(fields.resetFieldG).toEqual({ fresh: true });
  });
});

describe('stateExtensions: миграции расширений', () => {
  it('миграция регистрируется с индексом и попадает в реестр', () => {
    const migration = (state) => state;
    registerStateMigration(migration, 22);
    const registered = getRegisteredStateMigrations();
    expect(registered.some((entry) => entry.migration === migration && entry.index === 22)).toBe(true);
  });

  it('некорректный индекс миграции — ошибка', () => {
    expect(() => registerStateMigration((s) => s, -1)).toThrow();
    expect(() => registerStateMigration((s) => s, 1.5)).toThrow();
  });
});
