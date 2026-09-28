// ПРИЁМОЧНЫЙ (патч 402): «ты снова забыл про скролл длинных окон. Как
// читать в приложении релиз обновление, если оно за пределами экрана
// и не двигается?» (владелец; заметки релиза 2 — 10 пунктов, окно без
// прокрутки). 402: список заметок в ScrollView, окно maxHeight '85%',
// заголовок и кнопка «Понятно» на месте (образец — окно настроек, 211).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const code = () => readFileSync('components/UpdateNotice/UpdateNoticeModal.js', 'utf8');

describe('патч 402: окно «Что нового» прокручивается', () => {
  it('список заметок обёрнут в ScrollView с прокруткой', () => {
    const src = code();
    expect(src).toContain('ScrollView');
    expect(src).toContain('<ScrollView style={styles.scroll} nestedScrollEnabled>');
    // строки заметок внутри прокрутки: между <ScrollView и </ScrollView>
    const inner = src.slice(src.indexOf('<ScrollView'), src.indexOf('</ScrollView>'));
    expect(inner).toContain('lines.map');
  });

  it('окно ограничено высотой экрана, заголовок и кнопка вне прокрутки', () => {
    const src = code();
    expect(src).toContain("maxHeight: '85%'");
    const beforeScroll = src.slice(0, src.indexOf('<ScrollView'));
    const afterScroll = src.slice(src.indexOf('</ScrollView>'));
    expect(beforeScroll).toContain('updateNotice.title');
    expect(afterScroll).toContain('updateNotice.close');
  });
});
