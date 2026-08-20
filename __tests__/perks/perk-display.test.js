import { beforeEach, describe, expect, it } from 'vitest';
import { setCurrentModuleLocale } from '../../i18n/locale';
import { getPerkDisplay, getPerkSheetDisplay } from '../../components/screens/PerksAndTraitsScreen/perksDisplay';

describe('perk rank texts', () => {
  beforeEach(() => {
    setCurrentModuleLocale('ru-RU');
  });

  it('shows only the next rank in the perk list', () => {
    const perk = { id: 'leadBelly' };
    expect(getPerkDisplay(perk, { rank: 1 }).description).toBe(
      'Вы можете перебросить D, чтобы определить, получаете ли вы радиационный урон от облученной пищи или напитков.',
    );
    expect(getPerkDisplay(perk, { rank: 2 }).description).toBe(
      'У вас появляется иммунитет к радиационному урону от употребления облученной пищи или напитков.',
    );
  });

  it('joins taken ranks as paragraphs on the sheet', () => {
    const display = getPerkSheetDisplay({ id: 'leadBelly', rank: 2 });
    expect(display.description).toBe(
      'Вы можете перебросить D, чтобы определить, получаете ли вы радиационный урон от облученной пищи или напитков.\n\nУ вас появляется иммунитет к радиационному урону от употребления облученной пищи или напитков.',
    );
  });

  it('keeps a single effect when rankEffects are not in the data', () => {
    const perk = { id: 'scrounger' };
    const listed = getPerkDisplay(perk, { rank: 2 });
    const sheet = getPerkSheetDisplay({ id: 'scrounger', rank: 2 });
    expect(listed.description).toBe(
      'На 1-м ранге вы находите +3 {/CD} дополнительных патронов. На 2-м ранге вы находите +6 {/CD} дополнительных патронов. На 3-м ранге вы получаете +10 {/CD} дополнительных патронов.',
    );
    expect(sheet.description).toBe(listed.description);
  });
});
