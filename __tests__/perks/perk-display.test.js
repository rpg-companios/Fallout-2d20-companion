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
      'На 1-м ранге вы можете перебросить 1 {/CD} чтобы определить, получаете ли вы радиационный урон от облученной пищи или напитков.',
    );
    expect(getPerkDisplay(perk, { rank: 2 }).description).toBe(
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
    const listed = getPerkDisplay({ id: 'strongBack' }, { rank: 2 });
    const sheet = getPerkSheetDisplay({ id: 'strongBack', rank: 2 });
    expect(listed.description).toBe(
      'Ваш максимальный переносимый вес увеличивается на +25 фунтов за ранг.',
    );
    expect(sheet.description).toBe(listed.description);
  });

  it('shows scrounger rank 2 only in the perk list', () => {
    expect(getPerkDisplay({ id: 'scrounger' }, { rank: 2 }).description).toBe(
      'На 2-м ранге вы находите +6 {/CD} дополнительных патрона.',
    );
  });
});
