// ПРИЁМОЧНЫЙ (патч 319): кнопка «Крафт» в инвентаре обязана открывать окно
// крафта. История: с первого коммита приложения кнопка показывала заглушку-
// алерт (screen.craft.placeholder), а setCraftModalVisible(true) не вызывался
// НИГДЕ — окно крафта (265, затем 318) с кнопки было недостижимо. Тест читает
// код экрана как текст (экран не рендерится в vitest) и держит проводку:
// тап по кнопке → setCraftModalVisible(true) → CraftingModal visible.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const screen = readFileSync(
  new URL('./components/screens/InventoryScreen/InventoryScreen.js', `file://${ROOT}/`),
  'utf-8',
);

describe('Кнопка «Крафт» подключена к окну крафта (предохранитель 319)', () => {
  it('обработчик кнопки включает окно (setCraftModalVisible(true))', () => {
    expect(screen).toMatch(/handleCraftPress\s*=\s*\(\)\s*=>\s*setCraftModalVisible\(true\)/);
  });

  it('заглушка-алерт крафта удалена', () => {
    expect(screen).not.toContain('screen.craft.placeholder');
  });

  it('CraftingModal рендерится от того же состояния', () => {
    expect(screen).toMatch(/<CraftingModal\s*\n?\s*visible=\{isCraftModalVisible\}/);
    expect(screen).toMatch(/onClose=\{\(\)\s*=>\s*setCraftModalVisible\(false\)\}/);
  });
});
