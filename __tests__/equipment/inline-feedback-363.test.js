// ПРИЁМОЧНЫЙ (патч 363): «мёртвые кнопки» крафта/модов на Web. Репорт
// владельца: ресивер — «нет отклика у кнопки», тюнер — «прикрепляю — ui не
// меняется». Корень доказан: Alert.alert в react-native-web — ПУСТАЯ
// функция (`alert() {}`), а 352/356 повесили на него вопрос «бросить
// кубики?» при снятой сложности и сообщения об отказе — на Web они молчали.
// Теперь: вопрос про бросок — inline-диалог в обоих окнах, отказ гейта —
// inline-диалог модалки, применение мода — зелёная отметка (окно не
// закрывается молча).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

const CRAFTING = 'modules/fallout/screens/InventoryScreen/modals/CraftingModal.js';
const MODAL = 'modules/fallout/screens/WeaponsAndArmorScreen/modal/WeaponModificationModal.js';
const SCREEN = 'modules/fallout/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';

describe('ПРИЁМОЧНЫЙ (патч 363): никаких молчащих Alert в крафте и модах', () => {
  it('Alert.alert исчез из окна крафта и модалки модов', () => {
    expect(read(CRAFTING)).not.toContain('Alert.alert');
    expect(read(MODAL)).not.toContain('Alert.alert');
  });

  it('вопрос про бросок — inline-диалог в ОБОИХ окнах', () => {
    const crafting = read(CRAFTING);
    expect(crafting).toContain('askZeroTarget'); // состояние inline-диалога
    expect(crafting).toContain('ui.askZeroRoll'); // кнопка «Бросить кубики»
    expect(crafting).toContain("proceedCreate(t.row, 'roll')");

    const modal = read(MODAL);
    expect(modal).toContain('craftNotice'); // состояние inline-диалога
    expect(modal).toContain('createAskZeroRoll');
    expect(modal).toContain("runCreateMod(modId, modName, 'roll')");
  });

  it('отказ гейта (перк/материалы) — inline-диалог модалки, не Alert', () => {
    const modal = read(MODAL);
    expect(modal).toContain('createFailTitle');
    expect(modal).toContain('createNoticeDone'); // кнопка «Готово»
  });

  it('применение модов видно: зелёная отметка, окно не закрывается молча', () => {
    const screen = read(SCREEN);
    const start = screen.indexOf('const handleApplyModification = useCallback');
    const end = screen.indexOf('const handleUnequipWeapon', start);
    const body = screen.slice(start, end);
    // модалка остаётся открытой с обновлённой карточкой (было: молчаливое закрытие)
    expect(body).not.toContain('handleCloseModificationModal');
    expect(body).toContain('setSelectedWeaponForModification(modifiedWeapon)');

    const modal = read(MODAL);
    expect(modal).toContain('installNote'); // зелёная отметка
    expect(modal).toContain('installApplied');
  });
});
