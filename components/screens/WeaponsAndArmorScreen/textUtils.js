import React from 'react';
import { Text, Image } from 'react-native';

const iconMap = {
  '{CD}': require('../../../assets/CD.png'),
  '{/CD}': require('../../../assets/CD.png'),
};

const iconRegex = new RegExp(`(${Object.keys(iconMap).join('|')})`, 'g');

// ---------------------------------------------------------------------------
// Inline-разметка: **жирный**, *курсив*, токены кубика {CD}/{/CD}.
// Возвращает плоский массив <Text>-узлов внутри одного родительского <Text>
// (вложенные <Text> в RN наследуют стиль и дают акценты без разрыва строки).
// ---------------------------------------------------------------------------

const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|\{\/?CD\})/g;

const renderInline = (text, baseStyle, keyPrefix = 'it') => {
  if (text == null) return null;
  const fontSize = baseStyle?.fontSize || 14;
  const iconSize = fontSize + 10;
  const verticalShift = Math.round(iconSize / 6);

  return String(text)
    .split(INLINE_TOKEN_RE)
    .filter((part) => part !== '')
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (iconMap[part]) {
        return (
          <Image
            key={key}
            source={iconMap[part]}
            style={{ width: iconSize, height: iconSize, transform: [{ translateY: verticalShift }] }}
          />
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={key} style={{ fontWeight: '700' }}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return (
          <Text key={key} style={{ fontStyle: 'italic' }}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
};

/**
 * Рендер форматированного текста.
 *
 * Поддерживает:
 *   - переносы строк (\n) — отдельные строки;
 *   - маркеры списка «- » в начале строки — bullet;
 *   - **жирный** и *курсив* в рамках строки;
 *   - токены {CD}/{/CD} — иконка кубика.
 *
 * Используется в описаниях трейтов/перков и любых других блоках, где нужна
 * простая текстовая разметка, зависящая от данных модуля, а не от кода.
 *
 * @param {string} text
 * @param {object=} style  базовый стиль контейнера/строк
 */
export const renderTextWithIcons = (text, style) => {
  if (!text) {
    return null;
  }

  const lines = String(text).split('\n');

  return (
    <Text style={style}>
      {lines.map((line, lineIndex) => {
        const isBullet = /^\s*-\s+/.test(line);
        const content = isBullet ? line.replace(/^\s*-\s+/, '') : line;
        return (
          <Text key={`line-${lineIndex}`}>
            {isBullet ? '•  ' : ''}
            {renderInline(content, style, `line-${lineIndex}`)}
            {lineIndex < lines.length - 1 ? '\n' : ''}
          </Text>
        );
      })}
    </Text>
  );
};

// Глобальное подключение: один вызов при старте приложения (см. index.js) — и
// ЛЮБОЙ <Text> в любом экране/модалке автоматически превращает токены {/CD} (и {CD})
// в картинку кубика (assets/CD.png). Inline-разметка **/* обрабатывается только
// там, где используется renderTextWithIcons — глобальный патч остаётся узким.
export const setupRichText = () => {
  if (Text.__richTextPatched) return;

  const tokenRe = new RegExp(`(${Object.keys(iconMap).map((k) => k.replace(/[{}]/g, (m) => `\\${m}`)).join('|')})`, 'g');
  const testRe = new RegExp(tokenRe.source); // без флага g — безопасный .test()

  const toNodes = (str, baseStyle) => {
    const fontSize = baseStyle?.fontSize || 14;
    const iconSize = fontSize + 10;
    const verticalShift = Math.round(iconSize / 6);
    return String(str).split(tokenRe).filter(Boolean).map((part, index) =>
      iconMap[part]
        ? (
          <Image
            key={`icon-${index}`}
            source={iconMap[part]}
            style={{ width: iconSize, height: iconSize, transform: [{ translateY: verticalShift }] }}
          />
        )
        : part
    );
  };

  const originalRender = Text.render;
  if (typeof originalRender !== 'function') return;

  Text.render = function patchedTextRender(props, ref) {
    const children = props && props.children;
    if (typeof children === 'string' && testRe.test(children)) {
      return originalRender.call(this, { ...props, children: toNodes(children, props && props.style) }, ref);
    }
    return originalRender.call(this, props, ref);
  };

  Text.__richTextPatched = true;
};
