import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { formatInventoryText, tInventory } from '../../../../components/screens/InventoryScreen/logic/inventoryI18n.js';

export const getFalloutPowerArmorCatalogItems = (catalogData = {}) =>
  Object.values(catalogData).flatMap((set) => set?.pieces ?? []);

export const isFalloutPowerArmorInventoryRow = (item) => Boolean(
  item?.paContainer || item?.paPieceContent || item?.paFrameContent || item?.paCoreContent,
);

export const buildFalloutPowerArmorInventoryRows = ({
  equippedPowerArmor,
  equipmentCatalog,
  catalogItems = [],
  expanded = false,
  itemTypeId,
  fusionCoreId,
  hasFrame,
}) => {
  if (typeof hasFrame === 'function' ? !hasFrame(equippedPowerArmor) : !equippedPowerArmor?.frame) return [];
  const powerArmorById = new Map(catalogItems.map((piece) => [piece.id, piece]));
  const catalogEntry = (catalogId) =>
    (equipmentCatalog?.powerArmorList || []).find((piece) => piece.id === catalogId)
    || powerArmorById.get(catalogId)
    || {};
  const core = equippedPowerArmor.frame.core;
  const coreMax = fusionCoreId
    ? (equipmentCatalog?.ammoTypes || []).find((ammo) => ammo.id === fusionCoreId)?.maxCharges
    : null;
  const coreText = core ? `${core.charges}/${coreMax}` : '—';
  const frame = catalogEntry(equippedPowerArmor.frame.catalogId);
  const installed = Object.entries(equippedPowerArmor.pieces || {})
    .filter(([, piece]) => Boolean(piece));
  const containerRow = {
    uniqueId: 'pa-container',
    paContainer: true,
    itemType: itemTypeId,
    name: tInventory('screen.powerArmor.containerTitle'),
    summary: formatInventoryText(tInventory('screen.powerArmor.summary'), {
      parts: installed.length,
      core: coreText,
    }),
  };
  if (!expanded) return [containerRow];

  const rows = [
    containerRow,
    {
      uniqueId: 'pa-content-frame',
      paFrameContent: true,
      itemType: itemTypeId,
      name: frame.name || equippedPowerArmor.frame.catalogId,
    },
  ];
  installed.forEach(([slot, piece]) => {
    const pieceEntry = catalogEntry(piece.catalogId);
    const maxHp = powerArmorById.get(piece.catalogId)?.hp;
    rows.push({
      uniqueId: `pa-content-${slot}`,
      paPieceContent: true,
      pieceCatalogId: piece.catalogId,
      paSlot: slot,
      itemType: itemTypeId,
      name: formatInventoryText(tInventory('screen.powerArmor.pieceInSlot'), {
        name: pieceEntry.name || piece.catalogId,
        slot: tInventory(`screen.powerArmor.slots.${slot}`),
      }),
      hpCurrent: piece.hpCurrent,
      maxHp,
      temporaryRepair: piece.temporaryRepair === true,
      showRepair: Number.isFinite(maxHp) && (piece.hpCurrent ?? 0) < maxHp,
    });
  });
  if (core) {
    rows.push({
      uniqueId: 'pa-content-core',
      paCoreContent: true,
      itemType: itemTypeId,
      name: formatInventoryText(tInventory('screen.powerArmor.coreRow'), { value: coreText }),
    });
  }
  return rows;
};

export const renderFalloutPowerArmorInventoryRow = ({
  item,
  styles,
  getItemTypeIcon,
  repairFeature,
  itemRarityFeature,
  onUnequipPackage,
  onToggleContents,
  onRepairPiece,
  onUnequipPiece,
  expanded,
}) => {
  if (item?.paContainer) {
    return (
      <View style={styles.tableRow}>
        <View style={styles.mainRowContent}>
          <View style={styles.itemNameContainer}>
            <Text style={[styles.itemNameText, styles.equippedItemText]}>{item.name}</Text>
            <Text style={styles.itemTypeIcon}>{getItemTypeIcon(item.itemType)}</Text>
          </View>
        </View>
        <View style={styles.actionContainer}>
          <TouchableOpacity style={[styles.actionButton, styles.unequipButton]} onPress={onUnequipPackage}>
            <Text style={styles.actionButtonText}>{tInventory('screen.actions.unequip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.applyButton]} onPress={onToggleContents}>
            <Text style={styles.actionButtonText}>
              {tInventory(expanded ? 'screen.actions.collapse' : 'screen.actions.contents')}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.itemSubRow}>
          <Text style={styles.itemSubText}>{item.summary}</Text>
        </View>
      </View>
    );
  }

  if (item?.paPieceContent) {
    const repairAction = repairFeature?.getEquipmentRowAction?.(item) ?? null;
    const actions = repairAction ? (
      <TouchableOpacity
        style={[styles.actionButton, styles.applyButton, !repairAction.enabled && styles.applyButtonDisabled]}
        disabled={!repairAction.enabled}
        onPress={() => onRepairPiece?.(repairAction.target)}
      >
        <Text style={styles.actionButtonText}>{repairAction.label}</Text>
      </TouchableOpacity>
    ) : null;
    const rarity = itemRarityFeature?.getForItem?.(item.pieceCatalogId) ?? 0;
    return (
      <View style={styles.tableRow}>
        <View style={styles.mainRowContent}>
          <View style={styles.itemNameContainer}>
            <Text style={styles.itemNameText}>{item.name}</Text>
          </View>
        </View>
        <View style={styles.actionContainer}>
          {actions}
          <TouchableOpacity style={[styles.actionButton, styles.unequipButton]} onPress={onUnequipPiece}>
            <Text style={styles.actionButtonText}>{tInventory('screen.actions.unequip')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.itemSubRow}>
          <Text style={styles.itemSubText}>
            {tInventory('screen.labels.durability')}: {item.hpCurrent}/{item.maxHp}
          </Text>
          {rarity > 0 ? (
            <Text style={styles.itemSubText}>{tInventory('screen.labels.rarity')}: {rarity}</Text>
          ) : null}
          {item.temporaryRepair === true ? (
            <Text style={[styles.itemSubText, { color: '#e8a33d' }]}>
              {tInventory('screen.repair.tempNote')}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (item?.paFrameContent) {
    return (
      <View style={styles.tableRow}>
        <View style={styles.mainRowContent}>
          <View style={styles.itemNameContainer}>
            <Text style={styles.itemNameText}>{item.name}</Text>
            <Text style={styles.itemTypeIcon}>{getItemTypeIcon(item.itemType)}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (item?.paCoreContent) {
    return (
      <View style={styles.tableRow}>
        <View style={styles.mainRowContent}>
          <View style={styles.itemNameContainer}>
            <Text style={styles.itemNameText}>{item.name}</Text>
            <Text style={styles.itemTypeIcon}>{getItemTypeIcon(item.itemType)}</Text>
          </View>
        </View>
      </View>
    );
  }

  return null;
};
