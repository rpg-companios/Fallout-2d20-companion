// ПРИЁМОЧНЫЙ (патч 495): окно «О приложении / Благодарности».
//
// Владелец: «надо в разделе "О приложении" написать, что это неофициальный,
// фанатский проект, все права на сеттинг, названия и т.п принадлежат
// правообладателям Modiphius, Bethesda, Microsoft и т.д. (Только как положено,
// официальным языком). А вот сам движок программы, это уже agpl, а данные
// создают фанаты своими силами».
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const HOME_SCREEN = read('components/screens/HomeScreen/HomeScreen.js');
const HOME_STYLES = read('styles/HomeScreen.styles.js');
const RU = json('i18n/ru-RU/screens/home/screen.json');
const EN = json('i18n/en-EN/screens/home/screen.json');
const MODAL = read('components/lootTrade/TerminalHackingModal.js');
const RU_LOOT = json('i18n/ru-RU/screens/lootTrade/screen.json');
const EN_LOOT = json('i18n/en-EN/screens/lootTrade/screen.json');
const LICENSES = read('scripts/terminal-words/LICENSES.md');

const UKACD_NOTICE = 'Copyright © J Ross Beresford 1993-1999. All Rights Reserved.';
const ESDB_NOTICE = 'Copyright 2000-2026 by Kevin Atkinson';

describe('патч 495: окно «О приложении»', () => {
  it('неофициальный фанатский статус и правообладатели — на обоих языках, официальным языком', () => {
    for (const [locale, about] of [['ru-RU', RU.about], ['en-EN', EN.about]]) {
      for (const holder of ['Bethesda', 'ZeniMax', 'Microsoft', 'Modiphius']) {
        expect(about.unofficial, `${locale}: ${holder}`).toContain(holder);
      }
      expect(about.unofficial).toMatch(/Fallout/);
      expect(about.unofficial.length).toBeGreaterThan(250);
    }
    expect(RU.about.unofficial).toContain('неофициальным фанатским проектом');
    expect(RU.about.unofficial).toContain('не одобрен');
    expect(RU.about.unofficial).toContain('не предоставляет пользователю каких-либо прав');
    expect(EN.about.unofficial).toContain('unofficial, fan-made project');
    expect(EN.about.unofficial).toContain('not endorsed');
  });

  it('AGPL для движка и фанатские данные — на обоих языках', () => {
    expect(RU.about.engine).toContain('GNU Affero General Public License');
    expect(RU.about.engine).toContain('AGPL');
    expect(RU.about.engine).toContain('участниками сообщества');
    expect(EN.about.engine).toContain('GNU Affero General Public License');
    expect(EN.about.engine).toContain('AGPL');
    expect(EN.about.engine).toContain('community contributors');
    expect(RU.about.engine).not.toContain('очки удачи');
  });

  it('дословные уведомления UKACD и ESDB выведены в приложении и в файле лицензий', () => {
    for (const about of [RU.about, EN.about]) {
      expect(about.licenseUkacd).toContain(UKACD_NOTICE);
      expect(about.licenseUkacd).toContain('included verbatim');
      expect(about.licenseUkacd).toContain('There are no other restrictions');
      expect(about.licenseEsdb).toContain(ESDB_NOTICE);
      expect(about.licenseEsdb).toContain('distribute, and sell');
    }
    expect(LICENSES).toContain(UKACD_NOTICE);
    expect(LICENSES).toContain(ESDB_NOTICE);
    expect(LICENSES).toContain('продавать результат можно');
    expect(LICENSES).toContain('исключён');
    // Некоммерческий частотный список удалён из сборки полностью.
    expect(existsSync(path.join(ROOT, 'scripts/terminal-words/frequency-20k.txt'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/terminal-words/scowl-common-35.txt'))).toBe(true);
  });

  it('модалка прокручивается и показывает все секции', () => {
    for (const key of [
      'about.description', 'about.unofficialTitle', 'about.unofficial',
      'about.engineTitle', 'about.engine', 'about.creditsTitle', 'about.creditsIntro',
      'about.creditEowl', 'about.licenseUkacd', 'about.creditEsdb',
      'about.licenseEsdb', 'about.creditBrian', 'about.privacyPolicy', 'about.termsOfService',
    ]) {
      expect(HOME_SCREEN, `нет ключа ${key}`).toContain(`tHomeScreen('${key}')`);
    }
    expect(HOME_SCREEN).toContain('<ScrollView style={styles.aboutScroll}');
    for (const style of ['aboutModal', 'aboutScroll', 'aboutSectionTitle', 'aboutSmall', 'aboutLegal']) {
      expect(HOME_STYLES).toContain(`${style}:`);
    }
  });
});

describe('патч 495: строка с внутренними порогами убрана из мини-игры', () => {
  it('в модалке и словарях нет balanceHint', () => {
    expect(MODAL).not.toContain('balanceHint');
    expect(RU_LOOT.terminal.balanceHint).toBeUndefined();
    expect(EN_LOOT.terminal.balanceHint).toBeUndefined();
    expect(RU_LOOT.form.terminalDifficultyHint).toContain('ИНТ');
    expect(EN_LOOT.form.terminalDifficultyHint).toContain('Luck');
    // Наследие патча 494: в EN-подсказке не должно быть запрещённого «caps».
    expect(EN_LOOT.form.terminalDifficultyHint).not.toMatch(/\bcaps\b|\bCD\b/i);
  });
});
