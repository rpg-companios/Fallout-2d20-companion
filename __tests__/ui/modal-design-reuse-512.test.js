// Предохранитель патча 512 (просьба владельца): «если создаёшь модалки, то
// хотя бы ориентируйся на дизайн других модалок, которые рядом или делают
// что-то похожее». Проверяем не «похожесть на глаз», а факт переиспользования
// каркаса соседней формы и карточки, плюс наличие зафиксированного правила.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const MODALS = 'components/screens/LootTradeScreen/modals';

describe('512: новая модалка берёт каркас у ближайшего образца', () => {
  const form = read(`${MODALS}/KeyItemFormModal.js`);
  const containerForm = read(`${MODALS}/ContainerFormModal.js`);

  it('каркас экспортируется образцом и импортируется новой формой', () => {
    expect(containerForm).toContain('export const lootTradeFormStyles = StyleSheet.create({');
    expect(containerForm).toContain('const styles = lootTradeFormStyles;');
    expect(form).toContain("import { lootTradeFormStyles as styles } from './ContainerFormModal'");
  });

  it('форма не задаёт базовые стили заново', () => {
    // Ровно один StyleSheet.create — только для уникальных элементов.
    expect((form.match(/StyleSheet\.create\(/g) || []).length).toBe(1);
    expect(form).toContain('const extraStyles = StyleSheet.create({');
    const extra = form.slice(form.indexOf('const extraStyles'));
    for (const key of ['overlay:', 'card:', 'title:', 'label:', 'input:', 'footer:', 'btn:', 'saveBtn:', 'cancelBtn:', 'roomChip']) {
      expect(extra).not.toContain(key);
    }
  });

  it('все общие части окна берутся из styles образца', () => {
    for (const key of [
      'styles.overlay', 'styles.card', 'styles.title', 'styles.scroll',
      'styles.scrollContent', 'styles.label', 'styles.input',
      'styles.multilineInput', 'styles.warnText', 'styles.hintText',
      'styles.roomChips', 'styles.roomChip', 'styles.roomChipActive',
      'styles.roomChipName', 'styles.roomChipCode', 'styles.roomChipTextActive',
      'styles.footer', 'styles.btn', 'styles.saveBtn', 'styles.saveBtnText',
      'styles.cancelBtn', 'styles.cancelBtnText',
    ]) {
      expect(form).toContain(key);
    }
    // Подписи и порядок кнопок — как в форме контейнера.
    expect(form).toContain("tLootTrade('form.save')");
    expect(form).toContain("tLootTrade('form.cancel')");
    expect(form.indexOf('key-item-form-save')).toBeLessThan(form.indexOf('key-item-form-cancel'));
    expect(containerForm.indexOf('container-form-save')).toBeLessThan(containerForm.indexOf("tLootTrade('form.cancel')"));
  });

  it('карточка повторяет паттерн ⋮-меню карточки контейнера', () => {
    const card = read('components/lootTrade/KeyItemCardCell.js');
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(card).toContain('cardStyles.cardCell');
    expect(card).toContain('cardStyles.cardActionButton');
    expect(card).toContain('cardStyles.menuBackdrop');
    expect(card).toContain('cardStyles.actionMenu');
    expect(card).toContain('cardStyles.actionMenuItem');
    expect(card).toContain('cardStyles.actionMenuText');
    expect(card).toContain('dots-vertical');
    expect(card).toContain('measureInWindow');
    // У образца тот же паттерн.
    expect(screen).toContain('dots-vertical');
    expect(screen).toContain('styles.actionMenu');
    expect(screen).toContain('measureInWindow');
  });

  it('правило зафиксировано в документации для агента', () => {
    const rules = read('docs/ui-modals-rules.md');
    expect(rules).toContain('Новая модалка не рисуется с нуля');
    expect(rules).toContain('переиспользовать их каркас');
    expect(rules).toContain('Чек-лист перед сдачей патча');
    expect(rules).toContain('Урок патча 511');
    expect(rules).toContain('ContainerFormModal.js');
    expect(rules).toContain('LootTradeScreen.styles.js');
    expect(existsSync(path.join(ROOT, 'docs/ui-alerts-rules.md'))).toBe(true);

    expect(read('docs/agents/README.md')).toContain('docs/ui-modals-rules.md');
    expect(read('docs/architecture/engine-charter.md')).toContain('docs/ui-modals-rules.md');
    expect(read('replit.md')).toContain('docs/ui-modals-rules.md');
  });

  it('предохранитель поименован в уставе', () => {
    const charter = read('docs/architecture/engine-charter.md');
    expect(charter).toContain('__tests__/ui/modal-design-reuse-512.test.js');
    expect(charter).toContain('Новая модалка переиспользует каркас ближайшей модалки');
  });
});
