import React from 'react';
import { Text, Image, StyleSheet } from 'react-native';

export const CAP_ICON_SOURCE = require('../../modules/fallout/assets/backgrounds/caps.png');
export const CD_ICON_SOURCE = require('../../assets/CD.png');

const TOKEN_SPLIT_RE = /(\{\/?CD\}|\{CAP\})/g;
const BARE_CD_RE = /(^|[^A-Za-z{])CD(?![A-Za-z}])/g;

/**
 * Заменяет словесное обозначение «CD» (например, в «6 + 3 CD») на токен {CD},
 * не дублируя скобки у уже токенизированного «{CD}».
 */
export const withCdToken = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(BARE_CD_RE, '$1{CD}');
};

/**
 * Дополняет строку характеристик describeItemBasics иконками {CD} (у урона)
 * и {CAP} (у базовой цены в каталоге Мастера), не меняя чистую доменную функцию.
 */
export const formatBasicsWithIcons = (value) => {
  if (value === null || value === undefined) return '';
  return withCdToken(value)
    .replace(/(Урон|Damage)\s+(\d+)(?!\s*\{CD\})/g, '$1 $2 {CD}')
    .replace(/(Цена|Cost)\s+(\d+(?:[.,]\d+)?)(?!\s*\{CAP\})/g, '$1 $2 {CAP}');
};

export const CapIcon = ({ size = 18, style }) => (
  <Image
    source={CAP_ICON_SOURCE}
    resizeMode="contain"
    style={[{ width: size, height: size }, style]}
  />
);

export const CdIcon = ({ size = 16, style }) => (
  <Image
    source={CD_ICON_SOURCE}
    resizeMode="contain"
    style={[{ width: size, height: size }, style]}
  />
);

const renderStringTokens = (str, fontSize, keyPrefix) => {
  const cdSize = Math.max(13, Math.round(fontSize + 4));
  const capSize = Math.max(14, Math.round(fontSize + 6));

  return String(str)
    .split(TOKEN_SPLIT_RE)
    .filter((part) => part !== '')
    .map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (part === '{CAP}') {
        const shift = Math.round(capSize * 0.18);
        return (
          <Image
            key={key}
            source={CAP_ICON_SOURCE}
            resizeMode="contain"
            style={{ width: capSize, height: capSize, transform: [{ translateY: shift }] }}
          />
        );
      }
      if (part === '{CD}' || part === '{/CD}') {
        const shift = Math.round(cdSize * 0.16);
        return (
          <Image
            key={key}
            source={CD_ICON_SOURCE}
            resizeMode="contain"
            style={{ width: cdSize, height: cdSize, transform: [{ translateY: shift }] }}
          />
        );
      }
      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
};

/**
 * Обёртка над <Text>, заменяющая токены {CAP} и {CD}/{/CD} на встроенные
 * иконки крышки и боевого кубика (включая составные JSX-children).
 */
export const IconText = ({ style, children, ...rest }) => {
  const flat = StyleSheet.flatten(style) || {};
  const fontSize = Number(flat.fontSize) || 14;

  const nodes = React.Children.toArray(children).flatMap((child, idx) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return renderStringTokens(String(child), fontSize, `ic-${idx}`);
    }
    return child;
  });

  return (
    <Text style={style} {...rest}>
      {nodes}
    </Text>
  );
};

export default IconText;
