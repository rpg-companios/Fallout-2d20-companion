import React from 'react';
import { Text, Image } from 'react-native';

const iconMap = {
  '{CD}': require('../../../assets/CD.png'),
  '{/CD}': require('../../../assets/CD.png'),
};

const iconRegex = new RegExp(`(${Object.keys(iconMap).join('|')})`, 'g');

export const renderTextWithIcons = (text, style) => {
  if (!text) {
    return null;
  }

  const fontSize = style?.fontSize || 14;
  const iconSize = fontSize + 10;
  const verticalShift = Math.round(iconSize / 6);

  const parts = String(text).split(iconRegex).filter(Boolean);

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (iconMap[part]) {
          return (
            <Image
              key={index}
              source={iconMap[part]}
              style={{
                width: iconSize,
                height: iconSize,
                transform: [{ translateY: verticalShift }]
              }}
            />
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
};

// Глобальное подключение: один вызов при старте приложения (см. index.js) — и
// ЛЮБОЙ <Text> в любом экране/модалке автоматически превращает токены {/CD} (и {CD})
// в картинку кубика (assets/CD.png). Поведение renderTextWithIcons не меняется,
// переиспользуется тот же iconMap.
export const setupRichText = () => {
  if (Text.__richTextPatched) return;

  const tokenRe = new RegExp(`(${Object.keys(iconMap).map((k) => k.replace(/[{}]/g, (m) => `\\${m}`)).join('|')})`, 'g');
  const testRe = new RegExp(tokenRe.source); // без флага g — безопасный .test()

  const toNodes = (str, style) => {
    const fontSize = style?.fontSize || 14;
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