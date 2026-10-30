import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import IconText from '../lootTrade/LootTradeIconText';
import { useLocale, useModuleLocale } from '../../i18n/locale';
import { extractGmCharacterSummary } from '../../modules/fallout/gm/gmCharacterSummary';
import { formatGm, tGm } from '../../modules/fallout/gm/gmI18n';

const DEFAULT_AVATAR = require('../../assets/bg1.png');

const SPOILER_KEYS = [
  'specialAndSkills',
  'armorAndConditions',
  'weaponsAndAmmo',
  'perksAndInventory',
];

export default function GmRoomCharacterCard({
  characterCard,
  onOpenCommand,
}) {
  const locale = useLocale();
  const moduleLocale = useModuleLocale();

  const [openMap, setOpenMap] = useState({
    specialAndSkills: false,
    armorAndConditions: false,
    weaponsAndAmmo: false,
    perksAndInventory: false,
  });

  const summary = useMemo(
    () => extractGmCharacterSummary(characterCard?.snapshotPayload, { locale, moduleLocale }),
    [characterCard?.snapshotPayload, locale, moduleLocale],
  );

  const toggleSection = (key) => {
    setOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const anyOpen = SPOILER_KEYS.some((k) => openMap[k]);
  const toggleAll = () => {
    const nextVal = !anyOpen;
    setOpenMap({
      specialAndSkills: nextVal,
      armorAndConditions: nextVal,
      weaponsAndAmmo: nextVal,
      perksAndInventory: nextVal,
    });
  };

  const avatarSource = summary.avatarDataUrl
    ? { uri: summary.avatarDataUrl }
    : (summary.originImage || DEFAULT_AVATAR);

  const online = Boolean(characterCard?.playerOnline);
  const { vitals } = summary;

  return (
    <View style={styles.card} testID={`gm-char-card-${summary.id}`}>
      {/* Шапка карточки: портрет, имя, происхождение, уровень, сеть и кнопка команды */}
      <View style={styles.headerRow}>
        <Image source={avatarSource} style={styles.avatar} resizeMode="cover" />

        <View style={styles.titleBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>
              {summary.name}
            </Text>
            <View style={[styles.onlineBadge, online ? styles.onlineBadgeActive : styles.onlineBadgeIdle]}>
              <MaterialCommunityIcons
                name="server-network"
                size={13}
                color={online ? '#16a34a' : '#9ca3af'}
              />
              <Text style={[styles.onlineText, online && styles.onlineTextActive]}>
                {tGm(online ? 'card.online' : 'card.offline', locale)}
              </Text>
            </View>
          </View>

          <Text style={styles.subtitleText} numberOfLines={1}>
            {summary.originLabel} · {formatGm(tGm('card.levelShort', locale), { level: summary.level })}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {onOpenCommand ? (
            <TouchableOpacity
              testID={`gm-char-command-${summary.id}`}
              style={styles.commandBtn}
              onPress={() => onOpenCommand(characterCard)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={15} color="#1a1a1a" />
              <Text style={styles.commandBtnText}>
                {tGm('card.commandBtn', locale)}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            testID={`gm-char-toggle-all-${summary.id}`}
            style={styles.expandAllBtn}
            onPress={toggleAll}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={anyOpen ? 'unfold-less-horizontal' : 'unfold-more-horizontal'}
              size={16}
              color="#f0e68c"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Полоса ключевых боевых и ресурсных показателей */}
      <View style={styles.vitalsGrid}>
        <View style={styles.vitalPill}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.hp', locale)}</Text>
          <Text style={styles.vitalValue}>
            {vitals.currentHealth}/{vitals.effectiveMaxHealth}
          </Text>
        </View>

        {vitals.radiation > 0 ? (
          <View style={[styles.vitalPill, styles.vitalPillRad]}>
            <Text style={styles.vitalLabel}>{tGm('card.vitals.rad', locale)}</Text>
            <Text style={[styles.vitalValue, styles.vitalValueRad]}>
              ☢ {vitals.radiation}
            </Text>
          </View>
        ) : null}

        <View style={styles.vitalPill}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.defense', locale)}</Text>
          <Text style={styles.vitalValue}>{vitals.defense}</Text>
        </View>

        <View style={styles.vitalPill}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.initiative', locale)}</Text>
          <Text style={styles.vitalValue}>{vitals.initiative}</Text>
        </View>

        <View style={styles.vitalPill}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.melee', locale)}</Text>
          <IconText style={styles.vitalValue}>{vitals.meleeBonus}</IconText>
        </View>

        <View style={styles.vitalPill}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.luck', locale)}</Text>
          <Text style={styles.vitalValue}>
            {vitals.luckPoints}/{vitals.maxLuckPoints}
          </Text>
        </View>

        <View style={[styles.vitalPill, vitals.isOverencumbered && styles.vitalPillWarn]}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.weight', locale)}</Text>
          <Text style={[styles.vitalValue, vitals.isOverencumbered && styles.vitalValueWarn]}>
            {vitals.totalWeight}/{vitals.maxCarryWeight}
          </Text>
        </View>

        <View style={styles.vitalPill}>
          <Text style={styles.vitalLabel}>{tGm('card.vitals.caps', locale)}</Text>
          <IconText style={styles.vitalValue}>{`${vitals.caps} {CAP}`}</IconText>
        </View>
      </View>

      {/* Спойлер 1: S.P.E.C.I.A.L. и Навыки */}
      <View style={styles.spoilerSection}>
        <TouchableOpacity
          testID={`gm-spoiler-special-${summary.id}`}
          style={styles.spoilerHeader}
          onPress={() => toggleSection('specialAndSkills')}
          activeOpacity={0.75}
        >
          <Text style={styles.spoilerTitle}>
            {tGm('card.spoilers.specialAndSkills', locale)}
          </Text>
          <MaterialCommunityIcons
            name={openMap.specialAndSkills ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#f0e68c"
          />
        </TouchableOpacity>

        {openMap.specialAndSkills ? (
          <View style={styles.spoilerBody}>
            <View style={styles.specialRow}>
              {summary.attributes.map((attr) => (
                <View key={attr.key} style={styles.specialCell}>
                  <Text style={styles.specialLabel}>{attr.label}</Text>
                  <Text style={styles.specialValue}>{attr.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.skillNameCol]}>
                {tGm('card.skillsTable.skill', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.skillSmallCol]}>
                {tGm('card.skillsTable.attr', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.skillSmallCol]}>
                {tGm('card.skillsTable.rank', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.skillSmallCol]}>
                {tGm('card.skillsTable.tn', locale)}
              </Text>
            </View>

            {summary.skills.map((sk, idx) => (
              <View
                key={sk.key}
                style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
              >
                <Text style={[styles.tableCell, styles.skillNameCol, sk.tagged && styles.taggedSkillText]}>
                  {sk.tagged ? `★ ${sk.label}` : sk.label}
                </Text>
                <Text style={[styles.tableCellMuted, styles.skillSmallCol]}>
                  {sk.attrLabel}
                </Text>
                <Text style={[styles.tableCell, styles.skillSmallCol]}>
                  {sk.rank}
                </Text>
                <Text style={[styles.tableCellHighlight, styles.skillSmallCol]}>
                  {sk.tn}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Спойлер 2: Защита по зонам и состояния */}
      <View style={styles.spoilerSection}>
        <TouchableOpacity
          testID={`gm-spoiler-armor-${summary.id}`}
          style={styles.spoilerHeader}
          onPress={() => toggleSection('armorAndConditions')}
          activeOpacity={0.75}
        >
          <Text style={styles.spoilerTitle}>
            {tGm('card.spoilers.armorAndConditions', locale)}
          </Text>
          <MaterialCommunityIcons
            name={openMap.armorAndConditions ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#f0e68c"
          />
        </TouchableOpacity>

        {openMap.armorAndConditions ? (
          <View style={styles.spoilerBody}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.zoneNameCol]}>
                {tGm('card.armorTable.zone', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.zoneSmallCol]}>
                {tGm('card.armorTable.hitRoll', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.zoneSmallCol]}>
                {tGm('card.armorTable.phys', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.zoneSmallCol]}>
                {tGm('card.armorTable.energy', locale)}
              </Text>
              <Text style={[styles.tableHeaderCell, styles.zoneSmallCol]}>
                {tGm('card.armorTable.rad', locale)}
              </Text>
            </View>

            {summary.armorZones.map((z, idx) => (
              <View
                key={z.key}
                style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
              >
                <View style={styles.zoneNameCol}>
                  <Text style={styles.tableCell}>{z.zone}</Text>
                  {z.itemName ? (
                    <Text style={styles.zoneSubItem} numberOfLines={1}>
                      {z.itemName}{z.paHp ? ` (${z.paHp})` : ''}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.tableCellMuted, styles.zoneSmallCol]}>{z.hitRoll}</Text>
                <Text style={[styles.tableCell, styles.zoneSmallCol]}>{z.phys}</Text>
                <Text style={[styles.tableCell, styles.zoneSmallCol]}>{z.energy}</Text>
                <Text style={[styles.tableCell, styles.zoneSmallCol]}>{z.rad}</Text>
              </View>
            ))}

            {summary.immunities.length > 0 ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>{tGm('card.status.immunities', locale)}: </Text>
                <Text style={styles.metaValue}>{summary.immunities.join(', ')}</Text>
              </View>
            ) : null}

            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>{tGm('card.status.conditions', locale)}: </Text>
              <Text style={styles.metaValue}>
                {summary.conditions.length > 0
                  ? summary.conditions.join(', ')
                  : tGm('card.status.noConditions', locale)}
              </Text>
            </View>

            {summary.survival ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>{tGm('card.status.survival', locale)}: </Text>
                <Text style={styles.metaValue}>
                  {`${tGm('card.status.food', locale)}: ${summary.survival.food} · ${tGm('card.status.water', locale)}: ${summary.survival.water} · ${tGm('card.status.sleep', locale)}: ${summary.survival.sleep}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Спойлер 3: Оружие и боезапас */}
      <View style={styles.spoilerSection}>
        <TouchableOpacity
          testID={`gm-spoiler-weapons-${summary.id}`}
          style={styles.spoilerHeader}
          onPress={() => toggleSection('weaponsAndAmmo')}
          activeOpacity={0.75}
        >
          <Text style={styles.spoilerTitle}>
            {tGm('card.spoilers.weaponsAndAmmo', locale)} ({summary.weapons.length})
          </Text>
          <MaterialCommunityIcons
            name={openMap.weaponsAndAmmo ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#f0e68c"
          />
        </TouchableOpacity>

        {openMap.weaponsAndAmmo ? (
          <View style={styles.spoilerBody}>
            {summary.weapons.length === 0 ? (
              <Text style={styles.emptyHint}>{tGm('card.weapons.empty', locale)}</Text>
            ) : (
              <>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, styles.weaponNameCol]}>
                    {tGm('card.spoilers.weaponsAndAmmo', locale)}
                  </Text>
                  <Text style={[styles.tableHeaderCell, styles.weaponSmallCol]}>
                    {tGm('card.weapons.damage', locale)}
                  </Text>
                  <Text style={[styles.tableHeaderCell, styles.weaponSmallCol]}>
                    {tGm('card.weapons.fireRate', locale)}
                  </Text>
                  <Text style={[styles.tableHeaderCell, styles.weaponSmallCol]}>
                    {tGm('card.weapons.ammo', locale)}
                  </Text>
                </View>

                {summary.weapons.map((w, idx) => (
                  <View
                    key={w.key}
                    style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                  >
                    <View style={styles.weaponNameCol}>
                      <Text style={styles.tableCell}>{w.name}</Text>
                      {w.ammoLabel ? (
                        <Text style={styles.zoneSubItem} numberOfLines={1}>{w.ammoLabel}</Text>
                      ) : null}
                    </View>
                    <IconText style={[styles.tableCell, styles.weaponSmallCol]}>
                      {w.damage}
                    </IconText>
                    <Text style={[styles.tableCell, styles.weaponSmallCol]}>
                      {w.fireRate}
                    </Text>
                    <Text
                      style={[
                        styles.tableCellHighlight,
                        styles.weaponSmallCol,
                        w.ammoCount === 0 && styles.vitalValueWarn,
                      ]}
                    >
                      {w.ammoCount != null ? String(w.ammoCount) : tGm('card.weapons.noAmmoNeeded', locale)}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ) : null}
      </View>

      {/* Спойлер 4: Перки, черта и инвентарь */}
      <View style={styles.spoilerSection}>
        <TouchableOpacity
          testID={`gm-spoiler-perks-${summary.id}`}
          style={styles.spoilerHeader}
          onPress={() => toggleSection('perksAndInventory')}
          activeOpacity={0.75}
        >
          <Text style={styles.spoilerTitle}>
            {tGm('card.spoilers.perksAndInventory', locale)} ({summary.perks.length} / {summary.inventory.length})
          </Text>
          <MaterialCommunityIcons
            name={openMap.perksAndInventory ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#f0e68c"
          />
        </TouchableOpacity>

        {openMap.perksAndInventory ? (
          <View style={styles.spoilerBody}>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>{tGm('card.perks.trait', locale)}: </Text>
              <Text style={styles.metaValue}>
                {summary.traitLabel || tGm('card.perks.noTrait', locale)}
              </Text>
            </View>

            <Text style={styles.subBlockHeader}>{tGm('card.perks.perksTitle', locale)}</Text>
            {summary.perks.length === 0 ? (
              <Text style={styles.emptyHint}>{tGm('card.perks.noPerks', locale)}</Text>
            ) : (
              <View style={styles.chipWrap}>
                {summary.perks.map((p) => (
                  <View key={p.key} style={styles.perkChip}>
                    <Text style={styles.perkChipText}>
                      {p.name}
                      {p.rank > 1 ? ` (${formatGm(tGm('card.perks.rankSuffix', locale), { rank: p.rank })})` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.subBlockHeader, { marginTop: 10 }]}>
              {tGm('card.perks.inventoryTitle', locale)}
            </Text>
            {summary.inventory.length === 0 ? (
              <Text style={styles.emptyHint}>{tGm('card.perks.emptyInventory', locale)}</Text>
            ) : (
              <View style={styles.inventoryList}>
                {summary.inventory.map((it) => (
                  <View key={it.name} style={styles.inventoryItemRow}>
                    <Text style={styles.inventoryItemName} numberOfLines={1}>
                      {it.equipped ? `• ${it.name}` : it.name}
                    </Text>
                    <Text style={styles.inventoryItemQty}>×{it.quantity}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: '#525252',
    borderRadius: 5,
    padding: 12,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#161616',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  nameText: {
    color: '#f5f5f5',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  onlineBadgeActive: {
    backgroundColor: 'rgba(22, 163, 74, 0.14)',
    borderColor: '#16a34a',
  },
  onlineBadgeIdle: {
    backgroundColor: '#2b2b2b',
    borderColor: '#555555',
  },
  onlineText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
  },
  onlineTextActive: {
    color: '#4ade80',
  },
  subtitleText: {
    color: '#c7c7c7',
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0e68c',
    borderColor: '#d4af37',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commandBtnText: {
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: '700',
  },
  expandAllBtn: {
    width: 32,
    height: 32,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: '#2d2d2d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  vitalPill: {
    backgroundColor: '#191919',
    borderWidth: 1,
    borderColor: '#444444',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 68,
  },
  vitalPillRad: {
    borderColor: '#a16207',
    backgroundColor: '#292011',
  },
  vitalPillWarn: {
    borderColor: '#dc2626',
    backgroundColor: '#2e1616',
  },
  vitalLabel: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
  },
  vitalValue: {
    color: '#f5f5f5',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  vitalValueRad: {
    color: '#facc15',
  },
  vitalValueWarn: {
    color: '#f87171',
  },
  spoilerSection: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3f3f3f',
    borderRadius: 5,
    backgroundColor: '#1b1b1b',
    overflow: 'hidden',
  },
  spoilerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#282828',
  },
  spoilerTitle: {
    color: '#f0e68c',
    fontSize: 13,
    fontWeight: '700',
  },
  spoilerBody: {
    padding: 10,
  },
  specialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  specialCell: {
    flex: 1,
    minWidth: 40,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#525252',
    borderRadius: 5,
    paddingVertical: 5,
    alignItems: 'center',
  },
  specialLabel: {
    color: '#b0b0b0',
    fontSize: 10,
    fontWeight: '700',
  },
  specialValue: {
    color: '#f0e68c',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: '#2c2c2c',
    borderRadius: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    color: '#bdbdbd',
    fontSize: 11,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: '#232323',
  },
  tableCell: {
    color: '#e5e5e5',
    fontSize: 12,
  },
  tableCellMuted: {
    color: '#9ca3af',
    fontSize: 11,
  },
  tableCellHighlight: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  taggedSkillText: {
    color: '#f0e68c',
    fontWeight: '700',
  },
  skillNameCol: {
    flex: 1,
    paddingRight: 6,
  },
  skillSmallCol: {
    width: 48,
    textAlign: 'center',
  },
  zoneNameCol: {
    flex: 1,
    paddingRight: 6,
  },
  zoneSmallCol: {
    width: 44,
    textAlign: 'center',
  },
  zoneSubItem: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 1,
  },
  weaponNameCol: {
    flex: 1,
    paddingRight: 6,
  },
  weaponSmallCol: {
    width: 58,
    textAlign: 'center',
  },
  metaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  metaLabel: {
    color: '#b0b0b0',
    fontSize: 12,
    fontWeight: '700',
  },
  metaValue: {
    color: '#ececec',
    fontSize: 12,
    flexShrink: 1,
  },
  subBlockHeader: {
    color: '#d4d4d4',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  perkChip: {
    backgroundColor: '#2b2a1e',
    borderWidth: 1,
    borderColor: '#7a7238',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  perkChipText: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '600',
  },
  inventoryList: {
    gap: 3,
  },
  inventoryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#232323',
    borderRadius: 4,
  },
  inventoryItemName: {
    color: '#e5e5e5',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  inventoryItemQty: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyHint: {
    color: '#8c8c8c',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
