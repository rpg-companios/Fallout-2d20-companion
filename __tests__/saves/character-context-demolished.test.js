// Шаг 8в (патч 243): CharacterContext СНЕСЁН.
//
// История. До Шага 8 файл components/CharacterContext.js был «раздатчиком»
// всего состояния персонажа (40+ полей через useCharacter()). Миграция
// Шаги 1–8б (патчи 219–242) расселила данные по слайсам characterStore,
// сохранения — в src/saves/characterSaves.js, оркестраторы — в
// orchestratorsSlice. Патч 243 демонтировал сам файл:
//
//   - обёртка <CharacterProvider> в App.js снята (остались PaperProvider/
//     SafeAreaProvider/NavigationContainer);
//   - таймер расхода блока СБ — useEffect в App.js (тикает, пока приложение
//     открыто);
//   - derived-пуш экипировки (setCharacterContext) — подписка самого стора
//     (модульная, вне рендера; микрозадача патча 218 больше не нужна);
//   - фабрика полей сеттинговых расширений (патч 207) — действие стора
//     ensureStateExtensionFields: зовут setOrigin/setTrait и колбэк
//     реидратации;
//   - хук useRobotBodyPlan переехал в ArmorLayerModal стор-селектором.
//
// Тест фиксирует: файла нет, импортов нет, новые дома живут.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import useCharacterStore from '../../src/store/characterStore';
// Импорт регистрирует survival-расширение (fieldKey 'survival') в реестре.
import '../../modules/fallout/survival';

const ROOT = path.resolve(__dirname, '../..');
const APP_FILE = path.join(ROOT, 'App.js');
const ARMOR_MODAL = path.join(ROOT, 'modules/fallout/screens/CharacterScreen/modals/ArmorLayerModal.js');
const SURVIVAL_MODAL = path.join(ROOT, 'modules/fallout/screens/WeaponsAndArmorScreen/modals/SurvivalConsumeModal.tsx');

const state = () => useCharacterStore.getState();

afterEach(async () => {
  state().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('Шаг 8в: CharacterContext снесён', () => {
  it('файла components/CharacterContext.js не существует', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/CharacterContext.js'))).toBe(false);
  });

  it('ни один модуль приложения не импортирует CharacterContext', () => {
    const offenders = [];
    const scan = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          scan(full);
          continue;
        }
        if (!/\.(js|tsx?)$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        if (/from\s+['"][^'"]*CharacterContext['"]/.test(source)
          || /import\(\s*['"][^'"]*CharacterContext['"]\s*\)/.test(source)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    scan(path.join(ROOT, 'components'));
    scan(path.join(ROOT, 'modules'));
    scan(path.join(ROOT, 'src'));
    if (/from\s+['"][^'"]*CharacterContext['"]/.test(fs.readFileSync(APP_FILE, 'utf8'))) {
      offenders.push('App.js');
    }
    expect(offenders).toEqual([]);
  });

  it('хука useCharacter больше нет нигде в приложении (не считая комментариев-истории)', () => {
    // Реальный вызов: импорт имени или присваивание вызова. Упоминания
    // «фасад useCharacter()» в докстрингах-истории не считаются.
    const IMPORT_RE = /import\s*\{[^}]*\buseCharacter\b[^}]*\}\s*from/;
    const CALL_RE = /=\s*useCharacter\s*\(\s*\)/;
    const offenders = [];
    const scan = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          scan(full);
          continue;
        }
        if (!/\.(js|tsx?)$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        if (IMPORT_RE.test(source) || CALL_RE.test(source)) offenders.push(path.relative(ROOT, full));
      }
    };
    scan(path.join(ROOT, 'components'));
    scan(path.join(ROOT, 'modules'));
    expect(offenders).toEqual([]);
  });

  it('App.js: обёртки провайдера нет, таймер блока СБ переехал', () => {
    const source = fs.readFileSync(APP_FILE, 'utf8');
    expect(source).not.toMatch(/<CharacterProvider/); // упоминания в истории — ок
    expect(source).not.toMatch(/from\s+['"][^'"]*CharacterContext['"]/);
    expect(source).toContain('tickPowerArmorCore');
    expect(source).toContain('startCharacterAutosave');
  });

  it('ArmorLayerModal читает bodyPlan стор-селектором, SurvivalConsumeModal не знает useCharacter', () => {
    const armor = fs.readFileSync(ARMOR_MODAL, 'utf8');
    expect(armor).toContain('useCharacterStore((s) => s.robot?.bodyPlan ?? null)');
    expect(armor).not.toMatch(/from\s+['"][^'"]*CharacterContext['"]/);
    const survival = fs.readFileSync(SURVIVAL_MODAL, 'utf8');
    // useCharacterStore разрешён (это стор); сам хук useCharacter — нет.
    expect(survival).not.toMatch(/useCharacter(?!Store)/);
  });
});

describe('Шаг 8в: derived-самосинхронизация стора', () => {
  it('смена экипировки сама пушит equipmentState (_characterContext), без провайдера', () => {
    // Стартовый пуш при создании стора уже заполнил зеркало; сбрасываем —
    // подписка не должна перезаполнять его БЕЗ изменения наблюдаемых ключей.
    useCharacterStore.setState({ _characterContext: undefined });
    expect(state()._characterContext).toBeUndefined();

    const armor = { id: 'armor_leather', name: 'Кожаная броня' };
    state().setEquippedArmor(armor);
    const mirror = state()._characterContext?.equipmentState;
    expect(mirror?.equippedArmor).toEqual(armor);

    // Мутации, не входящие в наблюдаемые ключи, пуш не будят.
    useCharacterStore.setState({ _characterContext: undefined });
    state().setCharacterName('Художник');
    expect(state()._characterContext).toBeUndefined();
  });

  it('смена трейта будит пересчёт (зеркало восстанавливается)', () => {
    useCharacterStore.setState({ _characterContext: undefined });
    state().setTrait({ id: 'toughness', name: 'Крепкий' });
    expect(state()._characterContext?.equipmentState).toBeDefined();
  });
});

describe('Шаг 8в: фабрика расширений — действие стора', () => {
  it('setOrigin заполняет отсутствующие поля (survival), заданные не трогает', () => {
    // «Поле уже создано» — фабрика его не перезапишет.
    useCharacterStore.setState({ stateExtensions: { survival: { day: 9 } } });
    state().setOrigin({ id: 'vault_dweller', name: 'Уроженец Убежища', characterType: 'human' });
    const survival = state().stateExtensions.survival;
    expect(survival).toBeTruthy();
    expect(survival.day).toBe(9); // заданное поле сохранилось

    // Сброс (origin → null) и повторный выбор: отсутствующее поле создаётся.
    state().resetCharacterStore();
    expect(state().stateExtensions).toEqual({});
    state().setOrigin({ id: 'vault_dweller', name: 'Уроженец Убежища', characterType: 'human' });
    expect(state().stateExtensions.survival).toBeTruthy();
  });

  it('без ориджина фабрика не работает (null = «не создано»)', () => {
    state().resetCharacterStore();
    state().setTrait({ id: 'toughness', name: 'Крепкий' });
    expect(state().stateExtensions.survival).toBeUndefined();
  });
});
