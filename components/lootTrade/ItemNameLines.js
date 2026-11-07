// components/lootTrade/ItemNameLines.js
// Патч 562: имя предмета в списке — ДВЕ читаемые строки, без обрезки.
//
//   [иконка] Базовое имя целиком  ← 14px, светлое; переносится, ничего не режем
//            мод · мод · мод      ← 12px, серое; отдельная строка
//
// Одна точка правды для склада и торговца: владелец сказал «Править их
// раздельно бессмысленно», поэтому и разметка имени одна на оба окна.
// Разбор имени — в domain/itemNameParts (title + mods = исходное имя).
import React from 'react';
import { Text } from 'react-native';
import { getItemNameParts } from '../../domain/itemNameParts';
import { getItemIcon } from './itemIcons';
import { tradeOverlayStyles as trade } from './tradeOverlayStyles';

const ItemNameLines = ({
  item,
  modsIndex,
  suffix = '',
  showIcon = true,
  nameStyle = trade.tradeRowName,
  modsStyle = trade.tradeRowMods,
}) => {
  const parts = getItemNameParts(item, modsIndex);
  const icon = showIcon ? `${getItemIcon(item?.itemType)} ` : '';
  return (
    <>
      <Text style={nameStyle}>{`${icon}${parts.title}${suffix}`}</Text>
      {parts.mods.length > 0 && (
        <Text style={modsStyle}>{parts.mods.join(' · ')}</Text>
      )}
    </>
  );
};

export default ItemNameLines;
