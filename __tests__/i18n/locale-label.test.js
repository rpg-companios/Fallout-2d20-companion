import { describe, expect, it } from 'vitest';
import { getLocaleLabel } from '../../components/screens/HomeScreen/logic/localeLabel';

const translate = (key) => ({
  'language.russian': 'Ru',
  'language.english': 'En',
  'language.localeCode': 'Код языка: {code}',
}[key]);

describe('character-manager locale labels', () => {
  it('uses compact labels for the built-in engine and module locales', () => {
    expect(getLocaleLabel({
      code: 'ru-RU',
      displayLocale: 'ru-RU',
      translate,
    })).toBe('Ru');
    expect(getLocaleLabel({
      code: 'en-EN',
      displayLocale: 'ru-RU',
      translate,
    })).toBe('En');
  });

  it('uses the localized generic code label when Intl.DisplayNames is unavailable', () => {
    expect(getLocaleLabel({
      code: 'fr-FR',
      displayLocale: 'ru-RU',
      translate,
      DisplayNames: null,
    })).toBe('Код языка: fr-FR');
  });

  it('uses the same fallback when Intl.DisplayNames returns no language name', () => {
    class EmptyDisplayNames {
      of() {
        return undefined;
      }
    }

    expect(getLocaleLabel({
      code: 'fr-FR',
      displayLocale: 'ru-RU',
      translate,
      DisplayNames: EmptyDisplayNames,
    })).toBe('Код языка: fr-FR');
  });
});
