import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import globalStyles from '../../../styles/CharacterScreen.styles';
import localStyles from '../../../styles/WeaponsAndArmorScreen.styles';
import { buildRobotSlotStats } from '../../../domain/robotSlotLogic';

// ---------------------------------------------------------------------------
// RobotSlot
// ---------------------------------------------------------------------------
// Displays a single robot equipment slot in the same visual style as ArmorPart.
//
// Props:
//   slotKey        {string}   - e.g. "leftArm", "head", "arm1"
//   slotData       {object}   - { limb, armor, plating, frame, heldWeapon }
//   bodyPlan       {string}   - robot body plan key
//   onUpgradeLimb  {function} - (slotKey) => void — opens LimbUpgradeModal
//   onUpgradeArmor {function} - (layer: 'armor'|'plating'|'frame') => void
//   onWeaponPress  {function} - (weapon) => void — optional, opens weapon card
// ---------------------------------------------------------------------------

const RobotSlot = ({
  slotKey,
  slotData,
  bodyPlan,
  onUpgradeLimb,
  onUpgradeArmor,
  onWeaponPress,
}) => {
  const { slotTitle, slotSubtitle, limbName, stats } = buildRobotSlotStats(slotKey, slotData, {
    onUpgradeLimb,
    onUpgradeArmor,
    onWeaponPress,
  });

  return (
    <View style={localStyles.armorPartContainer}>
      {/* Header: slot name + limb name */}
      <View style={[globalStyles.sectionHeader, { flexDirection: 'column', alignItems: 'center', paddingBottom: limbName ? 2 : 4, minHeight: 50 }]}>
        <Text style={globalStyles.sectionTitle}>{slotTitle}</Text>
        {slotSubtitle ? <Text style={[globalStyles.sectionTitle, { fontSize: 12 }]}>{slotSubtitle}</Text> : null}
        {limbName ? <Text style={localStyles.armorItemNameTitle}>{limbName}</Text> : null}
      </View>

      {/* Stats rows — same structure as ArmorPart */}
      <View style={localStyles.armorStatsContainer}>
        {stats.map((stat, index) => (
          <View
            key={index}
            style={[localStyles.armorStatRow, { borderBottomWidth: index === stats.length - 1 ? 0 : 1 }]}
          >
            {stat.type === 'weapon' ? (
              <Text style={[localStyles.armorStatValue, { width: '100%', textAlign: 'center' }]}>{stat.value}</Text>
            ) : stat.type === 'button' ? (
              <>
                <Text style={localStyles.armorStatLabel}>{stat.label}</Text>
                <TouchableOpacity
                  style={localStyles.armorModificationButton}
                  onPress={stat.onPress}
                >
                  <Text style={localStyles.armorModificationButtonText}>{stat.value}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={localStyles.armorStatLabel}>{stat.label}</Text>
                <Text style={localStyles.armorStatValue}>{stat.value}</Text>
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

export default RobotSlot;
