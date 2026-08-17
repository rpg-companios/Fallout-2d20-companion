import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getSettingById } from '../../domain/settingsCatalog';

const root = process.cwd();
const settingsModalSource = readFileSync(
  path.join(root, 'components/settings/SettingsModal.js'),
  'utf8',
);

describe('character delete action placement layout', () => {
  it('requests column options only through the setting definition', () => {
    expect(getSettingById('characterDeleteActionPlacement')).toMatchObject({
      type: 'select',
      optionsLayout: 'column',
    });
    expect(settingsModalSource).toContain("setting.optionsLayout === 'column'");
    expect(settingsModalSource).not.toContain("setting.id === 'characterDeleteActionPlacement'");
  });

  it('uses an approximate 60/40 text-to-controls split with stacked buttons', () => {
    expect(settingsModalSource).toContain('columnOptionsText: { flex: 3 }');
    expect(settingsModalSource).toContain(
      "selectButtonsColumn: { flex: 2, flexDirection: 'column' }",
    );
  });

  it('keeps the existing option labels unchanged', () => {
    const expected = {
      'ru-RU': ['В меню действий', 'На карточке'],
      'en-EN': ['In action menu', 'On character card'],
    };

    for (const [locale, labels] of Object.entries(expected)) {
      const dictionary = JSON.parse(readFileSync(
        path.join(root, `i18n/${locale}/screens/home/screen.json`),
        'utf8',
      ));
      expect([
        dictionary.settings.characterDeleteActionPlacement.menu,
        dictionary.settings.characterDeleteActionPlacement.card,
      ]).toEqual(labels);
    }
  });
});
