import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import ruHome from '../../i18n/ru-RU/screens/home/screen.json';
import enHome from '../../i18n/en-EN/screens/home/screen.json';

const homeScreen = fs.readFileSync(
  new URL('../../components/screens/HomeScreen/HomeScreen.js', import.meta.url),
  'utf8',
);

describe('character card action menu', () => {
  it('uses the required localized action and error strings', () => {
    expect(ruHome.characterActions).toMatchObject({
      download: 'Скачать персонажа',
      duplicate: 'Дублировать персонажа',
      delete: 'Удалить персонажа',
      copySuffix: 'копия',
      duplicateError: 'Не удалось дублировать персонажа.',
    });
    expect(enHome.characterActions).toMatchObject({
      download: 'Download character',
      duplicate: 'Duplicate character',
      delete: 'Delete character',
      copySuffix: 'copy',
      duplicateError: 'Failed to duplicate character.',
    });
    expect(ruHome.settings).toMatchObject({
      appearanceTitle: 'Внешний вид',
      characterDeleteActionPlacementTitle: 'Удаление персонажа',
      characterDeleteActionPlacementDescription: 'Где показывать действие удаления персонажа.',
      characterDeleteActionPlacement: { menu: 'В меню действий', card: 'На карточке' },
    });
    expect(enHome.settings).toMatchObject({
      appearanceTitle: 'Appearance',
      characterDeleteActionPlacementTitle: 'Delete character',
      characterDeleteActionPlacementDescription: 'Where to show the delete character action.',
      characterDeleteActionPlacement: { menu: 'In action menu', card: 'On character card' },
    });
  });

  it('replaces the card download shortcut with a vertical-dots action menu', () => {
    expect(homeScreen).toContain('name="dots-vertical"');
    expect(homeScreen).not.toContain('style={styles.downloadButton}');
    expect(homeScreen).toContain("tHomeScreen('characterActions.download')");
    expect(homeScreen).toContain("tHomeScreen('characterActions.duplicate')");
  });

  it('shows delete in exactly the configured menu or card location', () => {
    expect(homeScreen).toContain("deleteActionPlacement === 'card'");
    expect(homeScreen).toContain("deleteActionPlacement === 'menu'");
    expect(homeScreen).toContain('selectCharacterDeleteActionPlacement');
  });
});
