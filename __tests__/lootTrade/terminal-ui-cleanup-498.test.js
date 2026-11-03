// Приёмочный тест 498: форма терминала показывает только сложность,
// сложность 0 недоступна вручную, служебные подсказки убраны.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../../server/terminalHacking.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const FORM = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
const MODAL = read('components/lootTrade/TerminalHackingModal.js');
const SCREEN = read('components/screens/LootTradeScreen/LootTradeScreen.js');
const OVERLAY = read('components/lootTrade/PlayerLootTradeOverlay.js');
const PICKER = read('components/screens/LootTradeScreen/modals/HubChildPickerModal.js');
const RU = json('i18n/ru-RU/screens/lootTrade/screen.json');
const EN = json('i18n/en-EN/screens/lootTrade/screen.json');

describe('патч 498: только сложность, без длин пароля', () => {
  it('в словарях карточки нет {length}, заголовок формы — просто «Сложность»', () => {
    expect(RU.card.terminalDifficulty).toBe('Сложность {difficulty}');
    expect(EN.card.terminalDifficulty).toBe('Difficulty {difficulty}');
    expect(RU.form.terminalDifficultyLabel).toBe('Сложность');
    expect(EN.form.terminalDifficultyLabel).toBe('Difficulty');
    for (const dict of [RU, EN]) {
      expect(dict.form.terminalDifficultyHint).toBeUndefined();
      expect(dict.terminal.localMode).toBeUndefined();
    }
  });

  it('ни один вызов карточки не передаёт length', () => {
    for (const source of [SCREEN, MODAL, OVERLAY, PICKER]) {
      expect(source).not.toMatch(/length:\s*(Number\()?[^}]*difficulty/);
      expect(source).not.toContain('length: container.difficulty + 4');
      expect(source).not.toContain('length: activeContainer.difficulty + 4');
    }
  });

  it('чипы показывают только число сложности и начинаются с 1', () => {
    expect(FORM).toContain('{[1, 2, 3, 4, 5].map((value) => (');
    expect(FORM).not.toContain('{[0, 1, 2, 3, 4, 5].map');
    expect(FORM).not.toContain('{value} · {value + 4}');
    expect(FORM).toContain('useState(1)');
    expect(FORM).toContain('Math.max(1, Math.min(5, Number(initialContainer?.difficulty) || 1))');
    expect(FORM).toContain("difficulty: isTerminal ? Math.max(1, difficulty) : 0");
  });
});

describe('патч 498: служебные тексты и читаемый цвет', () => {
  it('длинная подсказка не выводится ни в форме, ни в админ-панели', () => {
    expect(FORM).not.toContain('terminalDifficultyHint');
    expect(SCREEN).not.toContain('terminalDifficultyHint');
    expect(SCREEN).toContain('activeContainer.kind === CONTAINER_KIND.TERMINAL ? null');
  });

  it('строка про локальный режим убрана из модалки', () => {
    expect(MODAL).not.toContain("tLootTrade('terminal.localMode')");
    expect(MODAL).not.toContain('localModeHint');
    // Сама логика локального резерва сохранена.
    expect(MODAL).toContain('const localMode = !roomHasTerminalProtocol');
  });

  it('патч 504: галочка «блокировать после провала» удалена из формы', () => {
    expect(FORM).not.toContain('lockOnFailure');
    expect(FORM).not.toContain('terminalLockLabel');
    expect(FORM).not.toContain('terminalLockRow');
    expect(RU.form.terminalLockLabel).toBeUndefined();
    expect(EN.form.terminalLockLabel).toBeUndefined();
    // Вместо неё — диалог Мастера на любом экране.
    expect(read('App.js')).toContain('<TerminalRetryPromptHost />');
  });
});

describe('патч 498: сложность 0 доступна только игроку с «Хакером»', () => {
  it('форма не даёт выбрать 0, но движок всё ещё считает эффективную 0', () => {
    expect(FORM).not.toContain('{[0, 1, 2, 3, 4, 5].map');
    const snapshot = {
      attributes: { INT: { value: 10 }, LCK: { value: 4 } },
      skills: [],
      selectedPerks: [{ id: 'hacker', rank: 1 }],
    };
    const game = createGame({
      config: { containerId: 't', difficulty: 1 },
      operatorClientId: 'p',
      operatorCharacterId: 'c',
      characterSnapshot: snapshot,
      now: 100,
      rng: () => 0.42,
    });
    expect(game.difficulty).toBe(1);
    expect(game.effectiveDifficulty).toBe(0);
    expect(game.wordLength).toBe(4);
    expect(game.attempts).toBe(4);
  });
});
