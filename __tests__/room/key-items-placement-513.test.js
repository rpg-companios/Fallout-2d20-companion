// Патч 513: приёмочный тест на ФИКСАЦИЮ ДИЗАЙНА (владелец выбрал «пока только
// зафиксировать», код не трогаем). Проверяем, что дополнение попало в
// дизайн-документ и в правила работы с приложением без противоречий.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const design = read('docs/key-items-and-gates-design.md');

describe('513: вложенность ключей, перетаскивание и два вида требования', () => {
  it('статус разделяет документ 513 и первую половину кода 514', () => {
    expect(design).toContain('Обновление 7 (патч 513');
    expect(design).toContain('только документы и номер версии');
    expect(design).toContain('7.6 Патч 514: что из этого уже в коде');
    // Патч 516 закрыл вторую половину шага 3 — документ это отражает.
    expect(design).toContain('Патч 516 закрыл тезис 8');
    expect(design).toContain('docs/roadmap.md');
  });

  it('зафиксирована таблица: кто выдаётся, кто содержит ключ, кто требует', () => {
    expect(design).toContain('Ключ / записка');
    expect(design).toContain('«Замок» (будущая мини-игра)');
    expect(design).toContain('не выдаётся отдельно');
    expect(design).toContain('В терминал ключ не');
    expect(design).toContain('Может **содержать** ключ');
    expect(design).toContain('Может **требовать** ключ');
  });

  it('пункт выдачи ключа сохранён как исключение обратной совместимости', () => {
    expect(design).toContain('backward');
    expect(design).toContain('«Выдать на склад»');
    expect(design).toContain('остаётся');
    expect(design).toContain('Не удалять пункт');
    expect(design).toContain('не убирать `kind: \'keyItem\'`');
  });

  it('у всех четырёх карточек есть иконка перетаскивания', () => {
    expect(design).toContain('Все четыре вида карточек');
    expect(design).toContain('arrow-all');
    expect(design).toContain('внутрь локации');
    expect(design).toContain('не переносит уже');
  });

  it('две строки настройки и оба вида обязательности', () => {
    expect(design).toContain('Две строки требования');
    expect(design).toContain('Поиск по названию или выбор из списка');
    expect(design).toContain('«Обязателен?»');
    expect(design).toContain('терминала / замка');
    expect(design).toContain('требование обязательное');
    expect(design).toContain('требование необязательное');
    expect(design).toContain('Мастер открывает доступ вручную');
  });

  it('логика доступа и примеры владельца не потеряны', () => {
    expect(design).toContain('мини-игра **не запускается');
    expect(design).toContain('на сервере');
    expect(design).toContain('не разбирается');
    expect(design).toContain('Сейф «только ключом»');
    expect(design).toContain('Торговец контрабандой');
    expect(design).toContain('компрометирующая записка');
    expect(design).toContain('метка принадлежности к фракции');
  });

  it('краткие правила и ссылки в правилах приложения', () => {
    expect(design).toContain('## 10. Краткие правила');
    expect(design).toContain('Проверка условия — на сервере');
    expect(read('docs/architecture/engine-charter.md')).toContain('Ключевые записи и точки доступа (патч 513');
    expect(read('docs/agents/README.md')).toContain('docs/key-items-and-gates-design.md');
    expect(read('replit.md')).toContain('docs/key-items-and-gates-design.md');
    expect(read('docs/ui-modals-rules.md')).toContain('Новая модалка не рисуется с нуля');
  });
});
