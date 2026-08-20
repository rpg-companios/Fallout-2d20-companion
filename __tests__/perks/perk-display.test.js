import { beforeEach, describe, expect, it } from 'vitest';
import { setCurrentModuleLocale } from '../../i18n/locale';
import { getPerkModalDisplay, getPerkSheetDisplay } from '../../components/screens/PerksAndTraitsScreen/perksDisplay';

describe('perk rank texts', () => {
  beforeEach(() => {
    setCurrentModuleLocale('ru-RU');
  });

  it('shows remaining ranks in the perk list', () => {
    const perk = { id: 'leadBelly' };
    expect(getPerkModalDisplay(perk, { taken: 0 }).description).toBe(
      'На 1-м ранге вы можете перебросить 1 {/CD} чтобы определить, получаете ли вы радиационный урон от облученной пищи или напитков.\n\nНа 2-м ранге у вас появляется иммунитет к радиационному урону от употребления облученной пищи или напитков.',
    );
    expect(getPerkModalDisplay(perk, { taken: 1 }).description).toBe(
      'На 2-м ранге у вас появляется иммунитет к радиационному урону от употребления облученной пищи или напитков.',
    );
  });

  it('joins taken ranks as paragraphs on the sheet', () => {
    const display = getPerkSheetDisplay({ id: 'leadBelly', rank: 2 });
    expect(display.description).toBe(
      'На 1-м ранге вы можете перебросить 1 {/CD} чтобы определить, получаете ли вы радиационный урон от облученной пищи или напитков.\n\nНа 2-м ранге у вас появляется иммунитет к радиационному урону от употребления облученной пищи или напитков.',
    );
  });

  it('keeps a single effect for perks without rankEffects', () => {
    const listed = getPerkModalDisplay({ id: 'strongBack' }, { taken: 1 });
    const sheet = getPerkSheetDisplay({ id: 'strongBack', rank: 2 });
    expect(listed.description).toBe(
      'Ваш максимальный переносимый вес увеличивается на +25 фунтов за ранг.',
    );
    expect(sheet.description).toBe(listed.description);
  });

  it('shows scrounger remaining ranks in the perk list', () => {
    expect(getPerkModalDisplay({ id: 'scrounger' }, { taken: 1 }).description).toBe(
      'На 2-м ранге вы находите +6 {/CD} дополнительных патрона.\n\nНа 3-м ранге вы получаете +10 {/CD} дополнительных патронов.',
    );
  });

  it('splits English texts that already contain Rank N', () => {
    setCurrentModuleLocale('en-EN');
    expect(getPerkModalDisplay({ id: 'scrounger' }, { taken: 1 }).description).toBe(
      'Rank 2: +6 {/CD}.\n\nRank 3: +10 {/CD}.',
    );
    expect(getPerkSheetDisplay({ id: 'scrounger', rank: 2 }).description).toBe(
      'Rank 1: find +3 {/CD} extra ammo.\n\nRank 2: +6 {/CD}.',
    );
  });
});
