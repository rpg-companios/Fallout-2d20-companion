// Патч 515 (уточнение владельца): «При создании контейнера, требование
// "Обязателен" лучше пусть будет чекбокс. А поля под описание пусть будут
// последними или предпоследними. Так логичнее».
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const form = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
const keyForm = read('components/screens/LootTradeScreen/modals/KeyItemFormModal.js');

describe('515: чекбокс обязательности', () => {
  it('это один чекбокс, а не две кнопки-чипса', () => {
    expect(form).toContain('testID="container-form-key-required"');
    expect(form).toContain('accessibilityRole="checkbox"');
    expect(form).toContain('accessibilityState={{ checked:');
    expect(form).toContain("'checkbox-marked'");
    expect(form).toContain("'checkbox-blank-outline'");
    expect(form).toContain("tLootTrade('form.keyRequiredLabel')");
    expect(form).not.toContain('container-form-key-optional');
    expect(form).not.toContain("tLootTrade('form.keyMandatoryLabel')");
  });

  it('стили чекбокса лежат в общем каркасе формы (правило 512)', () => {
    expect(form).toContain('export const lootTradeFormStyles = StyleSheet.create({');
    expect(form).toContain('checkboxRow: {');
    expect(form).toContain('checkboxLabel: {');
    expect(form).toContain('styles.checkboxRow');
    expect(keyForm).toContain("import { lootTradeFormStyles as styles } from './ContainerFormModal'");
  });

  it('переключение даёт обязательный / необязательный режим', () => {
    expect(form).toContain('KEY_REQUIREMENT.REQUIRED');
    expect(form).toContain('KEY_REQUIREMENT.OPTIONAL');
    expect(form).toContain('setKeyRequirement(');
  });
});

describe('515: описание в конце формы', () => {
  it('в форме контейнера описание после всех настроек', () => {
    const descAt = form.indexOf('testID="container-form-description"');
    const checkAt = form.indexOf('container-form-check-search');
    const hintAt = form.indexOf("tLootTrade('form.linkedCheckHint')");
    expect(descAt).toBeGreaterThan(-1);
    expect(descAt).toBeGreaterThan(checkAt);
    expect(descAt).toBeGreaterThan(hintAt);
    expect(form.lastIndexOf('</ScrollView>')).toBeGreaterThan(descAt);
  });

  it('в форме ключа описание и предпросмотр тоже в конце', () => {
    const descAt = keyForm.indexOf('testID="key-item-form-description"');
    const parentAt = keyForm.indexOf('testID="key-item-form-parent-search"');
    expect(descAt).toBeGreaterThan(parentAt);
    expect(keyForm.indexOf('extraStyles.preview')).toBeGreaterThan(descAt);
    expect(keyForm.lastIndexOf('</ScrollView>')).toBeGreaterThan(keyForm.indexOf('extraStyles.preview'));
  });
});

describe('515: словари без мёртвых ключей и живой план', () => {
  it('старые подписи двух кнопок удалены в обоих языках', () => {
    for (const loc of ['ru-RU', 'en-EN']) {
      const dict = JSON.parse(read(`i18n/${loc}/screens/lootTrade/screen.json`));
      expect(dict.form.keyMandatoryLabel).toBeUndefined();
      expect(dict.form.keyOptionalLabel).toBeUndefined();
      expect(dict.form.keyRequiredLabel).toBeTruthy();
    }
  });

  it('roadmap обновлён до 515 и по-прежнему перечисляет оставшееся', () => {
    const plan = read('docs/roadmap.md');
    expect(plan).toContain('515');
    expect(plan).toContain('Осталось после патча 515');
    expect(plan).toContain('Серверная проверка ключа');
    expect(plan).toContain('две панели');
    expect(plan).toContain('Мини-игра взлома замков');
  });
});
