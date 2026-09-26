// ПРИЁМОЧНЫЙ (патчи 363–364): «мёртвые кнопки» крафта/модов на Web и ЕДИНЫЙ
// механизм диалогов. Репорт владельца: ресивер — «нет отклика у кнопки»,
// тюнер — «прикрепляю — ui не меняется». Корень доказан: Alert.alert в
// react-native-web — ПУСТАЯ функция (`alert() {}`), а на нём висели вопрос
// «бросить кубики?» и сообщения об отказе. Слово владельца (364): в приложении
// ЕДИНЫЙ механизм всплывающих окон — components/alerts/alertService (+AlertHost),
// работающий везде; никаких своих диалоговых окон и никаких Alert.alert.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

const CRAFTING = 'modules/fallout/screens/InventoryScreen/modals/CraftingModal.js';
const MODAL = 'modules/fallout/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js';
const SCREEN = 'modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';
const SERVICE = 'components/alerts/alertService.js';

describe('ПРИЁМОЧНЫЙ (363–364): диалоги крафта/модов — через alertService', () => {
  const crafting = read(CRAFTING);
  const modal = read(MODAL);

  it('Alert.alert исчез из окна крафта и модалки модов', () => {
    expect(crafting).not.toContain('Alert.alert');
    expect(modal).not.toContain('Alert.alert');
  });

  it('оба окна зовут единую точку диалогов (showRawAlert из alertService)', () => {
    expect(read(SERVICE)).toContain('export const showRawAlert');
    expect(crafting).toContain("from '../../../../../components/alerts/alertService'");
    expect(crafting).toContain('showRawAlert');
    expect(modal).toContain("from '../../../../../components/alerts/alertService'");
    expect(modal).toContain('showRawAlert');
  });

  it('вопрос про бросок (356) идёт через AlertHost в ОБОИХ окнах', () => {
    // «Бросить кубики» + автоуспех; выбор — аргумент proceedCreate/runCreateMod
    expect(crafting).toContain('askZeroRoll');
    expect(crafting).toContain("proceedCreate(row, index === 0 ? 'roll' : 'auto')");
    expect(modal).toContain('createAskZeroRoll');
    expect(modal).toContain("runCreateMod(modId, modName, index === 0 ? 'roll' : 'auto')");
  });

  it('отказ гейта (перк/материалы) — диалог AlertHost, не своё окно', () => {
    expect(modal).toContain('createFailTitle');
    expect(modal).not.toContain('craftNotice'); // своё окно 363 снесено (364)
    expect(crafting).not.toContain('askZeroTarget');
  });

  it('применение модов (367): окно закрывается как раньше, запись сквозная', () => {
    const screen = read(SCREEN);
    const start = screen.indexOf('const handleApplyModification = useCallback');
    const end = screen.indexOf('const handleUnequipWeapon', start);
    const body = screen.slice(start, end);
    // 367 (слово владельца): после «Применить» окно закрывается КАК РАНЬШЕ
    expect(body).toContain('handleCloseModificationModal();');
    // 367: мод пишется и в надетый список — карточки и сейв его видят
    expect(body).toContain('setEquippedWeapons');
    // зелёная отметка 364 снесена вместе с «окно не закрывать»
    expect(modal).not.toContain('installNote');
  });
});
