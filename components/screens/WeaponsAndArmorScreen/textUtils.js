import React from 'react';
import { Text, Image } from 'react-native';

const iconMap = {
  '{CD}': require('../../../assets/CD.png'),
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