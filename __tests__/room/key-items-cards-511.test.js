// Приёмочный тест 511: владелец уточнил, что ключ должен быть «как карточка
// контейнера/торговца/терминала и с модалкой в стиле создания контейнера
// и потом сохранением в экран». Отдельный справочник по иконке в шапке — не то.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('511: ключи как карточки на экране «Добыча / Торговля»', () => {
  it('на сетке есть плитка создания и карточки сохранённых ключей', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).toContain("{ type: 'createKeyItem', id: '__create_key_item__' }");
    expect(screen).toContain("...keyItems.map((k) => ({ type: 'keyItem', ...k }))");
    expect(screen).toContain("if (cell.type === 'createKeyItem')");
    expect(screen).toContain("if (cell.type === 'keyItem')");
    expect(screen).toContain('testID="create-key-item-cell"');
    expect(screen).toContain('<KeyItemCardCell');
    expect(screen).toContain('onEdit={() => setKeyItemForm({ initialKeyItem: cell })}');
    expect(screen).toContain('onIssue={() => void handleIssueKeyItem(cell)}');
    expect(screen).toContain('db.getGmKeyItems()');
    expect(screen).toContain('setKeyItems(freshList || [])');
  });

  it('иконка-справочник в шапке и старое окно каталога удалены', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).not.toContain('key-catalog-button');
    expect(screen).not.toContain('KeyItemCatalogModal');
    expect(screen).not.toContain('keyCatalogVisible');
    expect(existsSync(path.join(ROOT, 'components/lootTrade/KeyItemCatalogModal.js'))).toBe(false);
  });

  it('форма сделана в стиле ContainerFormModal: тема, поля, комнаты, предпросмотр, футер', () => {
    const form = read('components/screens/LootTradeScreen/modals/KeyItemFormModal.js');
    const containerForm = read('components/screens/LootTradeScreen/modals/ContainerFormModal.js');
    // Патч 512: каркас не копируется, а импортируется из соседней формы.
    expect(form).toContain("import { lootTradeFormStyles as styles } from './ContainerFormModal'");
    expect(containerForm).toContain('export const lootTradeFormStyles');
    for (const marker of ['KeyboardAvoidingView', 'ScrollView', 'form.cancel', 'styles.overlay', 'styles.card', 'styles.title', 'styles.footer']) {
      expect(form).toContain(marker);
      expect(containerForm).toContain(marker === 'styles.overlay' ? 'styles.overlay' : marker);
    }
    expect(form).toContain('styles.roomChips');
    expect(form).toContain('styles.multilineInput');
    expect(form).toContain("tLootTrade('form.nameLabel')");
    expect(form).toContain("tLootTrade('form.roomsMultiLabel')");
    expect(form).toContain("'form.createKeyItemTitle'");
    expect(form).toContain("'form.editKeyItemTitle'");
    expect(form).toContain('testID="key-item-form-name"');
    expect(form).toContain('testID="key-item-form-description"');
    expect(form).toContain('testID="key-item-form-save"');
    expect(form).toContain('testID="key-item-form-cancel"');
    expect(form).toContain('renderTextWithIcons');
    expect(form).toContain('onSave({');
  });

  it('карточка ключа использует те же стили сетки, что контейнер', () => {
    const card = read('components/lootTrade/KeyItemCardCell.js');
    expect(card).toContain("cardStyles.cardCell");
    expect(card).toContain('cardStyles.cardHero');
    expect(card).toContain('cardStyles.cardBody');
    expect(card).toContain('cardStyles.cardTitle');
    expect(card).toContain('key-variant');
    expect(card).toContain('testID={`key-item-card-${keyItem.id}`}');
    expect(card).toContain('key-item-edit-');
    expect(card).toContain('key-item-issue-');
    expect(card).toContain('cardStyles.cardActionButton');
    expect(card).toContain('cardStyles.actionMenu');
    expect(card).toContain('cardStyles.actionMenuItem');
    expect(card).toContain('dots-vertical');
  });

  it('сохранение остаётся в экране, выдача идёт в общее хранилище', () => {
    const screen = read('components/screens/LootTradeScreen/LootTradeScreen.js');
    expect(screen).toContain('const handleSaveKeyItem = async (draft) =>');
    expect(screen).toContain('await db.saveGmKeyItem({');
    expect(screen).toContain('setKeyItemForm(null)');
    expect(screen).toContain('const handleIssueKeyItem = async (keyItem) =>');
    expect(screen).toContain('addKeyItemToStorage({');
    expect(screen).toContain("tLootTrade('keyItems.noRoom')");
    expect(screen).toContain("tLootTrade('keyItems.issued')");
    expect(screen).toContain('<KeyItemFormModal');
  });

  it('подписи добавлены в обоих языках', () => {
    const ru = JSON.parse(read('i18n/ru-RU/screens/lootTrade/screen.json'));
    const en = JSON.parse(read('i18n/en-EN/screens/lootTrade/screen.json'));
    for (const [section, key] of [
      ['actions', 'createKeyItem'],
      ['form', 'createKeyItemTitle'],
      ['form', 'editKeyItemTitle'],
      ['keyItems', 'saved'],
    ]) {
      expect(ru[section][key]).toBeTruthy();
      expect(en[section][key]).toBeTruthy();
    }
    expect(ru.keyItems.hint).toContain('карточка');
    expect(en.keyItems.hint).toContain('card');
  });

  it('дизайн-документ фиксирует, что UI шага 2 — карточки, а не значок', () => {
    const doc = read('docs/key-items-and-gates-design.md');
    expect(doc).toContain('511');
    expect(doc).toMatch(/карточк/i);
  });
});
