// Приёмочный тест патча 525: «Мини-игра на взлом не должна сразу показываться…
// сначала будет модалка, как для локации и кнопками "взломать", только без
// "покинуть локацию"; гамму интерфейса взлома замка изменить на светлую».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

describe('525: двухшаговый вход в мини-игру', () => {
  it('входная модалка точки есть, «Покинуть локацию» в ней нет', () => {
    const entry = read('components/lootTrade/StandaloneCheckModal.js');
    expect(entry).toContain('check-hack-button');
    expect(entry).toContain('check-view-button');
    expect(entry).toContain('check-entry-point');
    expect(entry).not.toContain('leaveHub');
    expect(entry).not.toContain("tLootTrade('player.leaveHub')");
    expect(entry).not.toContain('leave-hub-button');
    expect(entry).toContain('modalStyles.footer');
    expect(entry).toContain('modalStyles.saveBtn');
    expect(entry).toContain('modalStyles.cancelBtn');
  });

  it('оверлей монтирует мини-игру только после выбора из входной модалки', () => {
    const overlay = read('components/lootTrade/PlayerLootTradeOverlay.js');
    expect(overlay).toContain("import StandaloneCheckModal from './StandaloneCheckModal'");
    expect(overlay).toContain('<StandaloneCheckModal');
    expect(overlay).toContain('visible={!selection}');
    expect(overlay).toContain('autoStart={Boolean(selection.autoStart)}');
    expect(overlay).toContain('visible={!directSelection}');
    expect(overlay).toContain('autoStart={Boolean(directSelection.autoStart)}');
    // Повторная выдача точки с новым accessId снова начинается с входной модалки.
    expect(overlay).toContain('terminalSelection?.accessKey === directAccessKey');
    expect(overlay).toContain('terminalSelection?.accessKey === accessKey');
    // Патч 524 не откатывается: окно локации по-прежнему уходит под доску,
    // а «Покинуть локацию» закрывает окно локально и не гасит сессию Мастера.
    expect(overlay).toContain('visible={!terminalSelection}');
    expect(overlay).toContain('markSessionClosedLocally(session.sessionId)');
    expect(overlay).toContain("tLootTrade('player.leaveHub')");
  });

  it('окно доски без игры не рисует пустые ячейки, стрелки и второй «Взломать»', () => {
    const modal = read('components/lootTrade/LockPickingModal.js');
    expect(modal).toContain('lock-waiting-board');
    expect(modal).toContain("tLootTrade('player.checkWaitingBoard')");
    expect(modal).not.toContain('lock-hack-button');
    expect(modal).not.toContain("tLootTrade('lock.hack')");
    expect(modal).toContain('lock-cells-board');
    expect(modal).toContain('lock-arrow-');
  });
});

describe('525: светлая гамма вместо терминальной', () => {
  it('каркас импортируется из lootTradeFormStyles, базовые ключи не дублируются', () => {
    const shared = read('components/lootTrade/lockPickingStyles.js');
    expect(shared).toContain('lootTradeFormStyles');
    expect(shared).toContain('ADMIN_MODAL_PALETTE');
    expect(shared).not.toContain('  overlay: {');
    expect(shared).not.toContain('  card: {');
    expect(shared).not.toContain('  saveBtn: {');
    const modal = read('components/lootTrade/LockPickingModal.js');
    expect(modal).toContain("from './lockPickingStyles'");
    expect(modal).toContain('modalStyles.card');
    expect(modal).toContain('LOCK_PALETTE');
    expect(modal).not.toContain('terminalHackingStyles');
    expect(modal).not.toContain('StyleSheet.create');
    // Терминал не перекрашивался.
    expect(read('components/lootTrade/TerminalHackingModal.js'))
      .toContain('const styles = terminalHackingStyles;');
    expect(read('docs/ui-modals-rules.md')).toContain('525');
  });

  it('парные RU/EN подписи входа и ожидания доски', () => {
    const ru = json('i18n/ru-RU/screens/lootTrade/screen.json');
    const en = json('i18n/en-EN/screens/lootTrade/screen.json');
    expect(Object.keys(ru.player).sort()).toEqual(Object.keys(en.player).sort());
    expect(Object.keys(ru.lock).sort()).toEqual(Object.keys(en.lock).sort());
    expect(ru.player.checkEntryHint).toContain('Взломать');
    expect(en.player.checkEntryHint).toContain('Hack');
    expect(ru.player.checkWaitingBoard).toContain('Взломать');
    expect(en.player.checkWaitingBoard).toContain('Hack');
  });
});

describe('525: регрессии и доставка', () => {
  it('механика 520/524 и защита сервера не тронуты', () => {
    const core = read('server/lockPicking.js');
    expect(core).toContain('countBobbyPins');
    expect(core).toContain('pinsTotal');
    expect(read('components/lootTrade/localLockGame.js')).toContain('applyLocalLockAction');
    expect(read('components/lootTrade/lockAutoStart.js')).toContain('shouldAutoStartLock');
    const modal = read('components/lootTrade/LockPickingModal.js');
    expect(modal).toContain('SESSION_FORBIDDEN');
    expect(modal).toContain('UNKNOWN_TYPE');
    expect(modal).toContain('roomHasTerminalProtocol');
    expect(read('server/itemStacking.js')).toContain('itemTransferSnapshot');
    expect(read('server/locationGraph.js')).toContain('buildLocationGraph');
  });

  it('версия, отсечка, заметки, журналы, план и файл установки', () => {
    const version = json('public/version.json');
    expect(Number(version.version)).toBeGreaterThanOrEqual(525);
    expect(version.release).toBe(4);
    expect(version.notes['ru-RU'].length).toBeGreaterThanOrEqual(95);
    expect(version.notes['en-EN'].length).toBeGreaterThanOrEqual(95);
    expect(Number(json('patchs/baseline.json').baseline)).toBeGreaterThanOrEqual(525);
    expect(read('docs/changelog.ru.md')).toContain('525');
    expect(read('docs/changelog.en.md')).toContain('525');
    expect(read('docs/roadmap.md')).toContain('525');
    expect(read('docs/patch-525-install.md')).toContain('525');
    expect(read('docs/lockpicking-mini-game-design.md')).toContain('525');
    expect(read('patchs/525-lock-entry-light.patch')).toContain('StandaloneCheckModal.js');
  });
});
