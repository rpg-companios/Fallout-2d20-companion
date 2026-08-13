import { describe, it, expect } from 'vitest';
import { renderTextWithIcons } from '../../components/screens/WeaponsAndArmorScreen/textUtils';

// renderTextWithIcons возвращает React-элемент; проверяем структуру через его children.
const getChildren = (el) => {
  if (el == null || typeof el !== 'object') return el;
  const kids = el.props?.children;
  return Array.isArray(kids) ? kids : [kids];
};

describe('renderTextWithIcons — разметка описаний', () => {
  it('возвращает null для пустого текста', () => {
    expect(renderTextWithIcons('')).toBeNull();
    expect(renderTextWithIcons(null)).toBeNull();
  });

  it('разбивает текст по \\n на отдельные строки', () => {
    const el = renderTextWithIcons('первая\nвторая');
    const outer = getChildren(el);
    // две строки-узла
    const lines = outer.filter((c) => c && typeof c === 'object' && c.props);
    expect(lines.length).toBe(2);
  });

  it('**оборачивает в жирный**', () => {
    const el = renderTextWithIcons('это **важно** сейчас');
    const json = JSON.stringify(el);
    expect(json).toContain('fontWeight');
    expect(json).toContain('700');
    expect(json).toContain('важно');
  });

  it('*оборачивает в курсив*', () => {
    const el = renderTextWithIcons('это *заметка* сейчас');
    const json = JSON.stringify(el);
    expect(json).toContain('italic');
    expect(json).toContain('заметка');
  });

  it('строки, начинающиеся с "- ", получают маркер списка', () => {
    const el = renderTextWithIcons('- пункт один\n- пункт два');
    const json = JSON.stringify(el);
    // два bullet-маркера
    const bullets = (json.match(/•/g) || []).length;
    expect(bullets).toBe(2);
    expect(json).toContain('пункт один');
    expect(json).toContain('пункт два');
  });
});
