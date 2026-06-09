import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, ImageBackground, TouchableOpacity, SafeAreaView, Modal } from 'react-native';
import { useCharacter } from '../../CharacterContext';
import useCharacterStore from '../../../src/store/characterStore';
import { useShallow } from 'zustand/react/shallow';
import {
  selectItemsByEquipped,
  getEquippedArmor,
  storeItemToWeaponDisplay,
  weaponModPatchToStore,
  selectActiveTimedEffects,
} from '../../../src/store/selectors';
import { calculateInitiative, calculateDefense, calculateMeleeBonus, calculateMeleeBonusValue, calculateMaxHealth, getAttributeValue } from '../../../domain/characterCreation';
import { TRAITS } from '../CharacterScreen/logic/traitsData';
import { isRobotCharacter } from '../../../domain/robotEquip';
import { resolveBodyPlan } from '../../../domain/bodyplan';
import styles from '../../../styles/CharacterScreen.styles';
import localStyles from '../../../styles/WeaponsAndArmorScreen.styles';
import { renderTextWithIcons } from './textUtils';
import { useLocale } from '../../../i18n/locale';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { applyArmorMods } from '../../../domain/modsEquip';
import { getSkillDisplayName } from '../CharacterScreen/logic/characterScreenI18n';
import { getEffectTimeText, getTimedMaxHpBonus, getTimedDamageResistanceBonus } from '../../../domain/effects';
import { resolveWeaponQualities, resolveWeaponDamageType } from '../../../domain/weaponDisplay';
import { hasPoisonImmunity, hasRadiationImmunity } from '../../../domain/immunities';
import { tWeaponsAndArmorScreen } from './weaponsAndArmorScreenI18n';
import { getRobotSlotKeys } from '../../../domain/robotEquip';

// Импортируем модальное окно модификаций
import WeaponModificationModal from './modal/WeaponModificationModal';
import ArmorModificationModal from './modal/ArmorModificationModal';
import RobotSlot from './RobotSlot';
import LimbUpgradeModal from '../CharacterScreen/modals/LimbUpgradeModal';
import ArmorPickerModal from '../CharacterScreen/modals/ArmorPickerModal';


const HealthCounter = ({ max, isEnabled }) => {
  const { currentHealth, setCurrentHealth } = useCharacter();
  const canDecrease = isEnabled && currentHealth > 0;
  const canIncrease = isEnabled && currentHealth < max;

  const handleAdjustHealth = (amount) => {
    if (!isEnabled) return;
    setCurrentHealth(prev => Math.max(0, Math.min(max, prev + amount)));
  };

  const healthText = isEnabled ? `${currentHealth}/${max}` : '—/—';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={() => handleAdjustHealth(-1)}
        disabled={!canDecrease}
        style={[styles.counterButton, !canDecrease && { opacity: 0.5 }]}
      >
        <Text style={styles.counterButtonText}>-</Text>
      </TouchableOpacity>
      <Text style={[styles.counterValue, { minWidth: 50, textAlign: 'center' }]}>{healthText}</Text>
      <TouchableOpacity
        onPress={() => handleAdjustHealth(1)}
        disabled={!canIncrease}
        style={[styles.counterButton, !canIncrease && { opacity: 0.5 }]}
      >
        <Text style={styles.counterButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};


// --- Reusable Components ---

const StatBox = ({ title, value, children, highlightMeleeBonus = false }) => (
  <View style={localStyles.statBoxContainer}>
    <View style={localStyles.statBoxHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={localStyles.statBoxValueContainer}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {highlightMeleeBonus ? renderTextWithIcons(String(value).replace('{CD}', ' {CD}'), styles.statValue) : <Text style={styles.statValue}>{value}</Text>}
        {children}
      </View>
    </View>
  </View>
);

const ArmorPart = ({ title, subtitle, armorName, clothingName, stats }) => {
    const displayName = [clothingName, armorName].filter(Boolean).join(' / ');

    return (
        <View style={localStyles.armorPartContainer}>
            <View style={[styles.sectionHeader, { flexDirection: 'column', alignItems: 'center', paddingBottom: displayName ? 2 : 4, minHeight: 50 }]}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={[styles.sectionTitle, { fontSize: 12 }]}>{subtitle}</Text>
                {displayName ? <Text style={localStyles.armorItemNameTitle}>{displayName}</Text> : null}
            </View>
            <View style={localStyles.armorStatsContainer}>
                {stats.map((stat, index) => (
                    <View key={index} style={[localStyles.armorStatRow, { borderBottomWidth: index === stats.length - 1 ? 0 : 1 }]}>
                        <Text style={localStyles.armorStatLabel}>{stat.label}</Text>
                        {stat.type === 'button' ? (
                          <TouchableOpacity style={localStyles.armorModificationButton} onPress={stat.onPress}>
                            <Text style={localStyles.armorModificationButtonText}>{stat.value}</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={localStyles.armorStatValue}>{stat.value}</Text>
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
};



const WeaponCard = ({ weapon, onModifyWeapon, meleeBonus = 0, showSourceSlot = false, equippedWeapons = [] }) => {
    const { hasTrait, attributes, skills } = useCharacter();
    if (!weapon) {
      return (
        <View style={localStyles.weaponCardContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { textAlign: 'center', width: '100%' }]}>{tWeaponsAndArmorScreen('weapon.emptySlot')}</Text>
          </View>
          <View style={localStyles.emptyWeaponStats}>
            <Text>{tWeaponsAndArmorScreen('weapon.notEquipped')}</Text>
          </View>
        </View>
      );
    }
  
    const displayWeapon = weapon;

    // Канонический формат полей оружия
    const weaponName = displayWeapon.name ?? tWeaponsAndArmorScreen('common.empty');
    const damageType = resolveWeaponDamageType(displayWeapon.damage_type ?? displayWeapon.damageType);
    const effectsValue = displayWeapon.damage_effects ?? displayWeapon.damageEffects ?? tWeaponsAndArmorScreen('common.empty');
    const fireRateBase = Number(displayWeapon.fire_rate ?? 0) || 0;
    const rangeValue = displayWeapon.range_name ?? displayWeapon.rangeName ?? tWeaponsAndArmorScreen('common.empty');
    const qualitiesValue = resolveWeaponQualities(displayWeapon.qualities) || tWeaponsAndArmorScreen('common.empty');
    const mainAttr = displayWeapon.mainAttr ?? displayWeapon.main_attr ?? 'AGI';
    const mainSkill = displayWeapon.mainSkill ?? displayWeapon.main_skill ?? 'SMALL_GUNS';

    const SKILL_ALIASES = {
      ATHLETICS: ['ATHLETICS', 'Атлетика', 'Athletics'],
      BARTER: ['BARTER', 'Бартер', 'Barter'],
      BIG_GUNS: ['BIG_GUNS', 'Тяжелое оружие', 'Тяжёлое оружие', 'Big Guns'],
      ENERGY_WEAPONS: ['ENERGY_WEAPONS', 'Энергооружие', 'Energy Weapons'],
      EXPLOSIVES: ['EXPLOSIVES', 'Взрывчатка', 'Explosives'],
      LOCKPICK: ['LOCKPICK', 'Отмычки', 'Lockpick'],
      MEDICINE: ['MEDICINE', 'Медицина', 'Medicine'],
      MELEE_WEAPONS: ['MELEE_WEAPONS', 'Ближний бой', 'Melee Weapons'],
      PILOT: ['PILOT', 'Управление ТС', 'Pilot'],
      REPAIR: ['REPAIR', 'Ремонт', 'Repair'],
      SCIENCE: ['SCIENCE', 'Наука', 'Science'],
      SMALL_GUNS: ['SMALL_GUNS', 'Стрелковое оружие', 'Small Guns'],
      SNEAK: ['SNEAK', 'Скрытность', 'Sneak'],
      SPEECH: ['SPEECH', 'Красноречие', 'Speech'],
      SURVIVAL: ['SURVIVAL', 'Выживание', 'Survival'],
      THROWING: ['THROWING', 'Метание', 'Throwing'],
      UNARMED: ['UNARMED', 'Рукопашная', 'Unarmed'],
    };

    const findSkillValue = (skillKeyOrName) => {
      const canonical = SKILL_ALIASES[skillKeyOrName] ? skillKeyOrName : Object.keys(SKILL_ALIASES).find((key) =>
        SKILL_ALIASES[key].includes(skillKeyOrName),
      );

      const aliases = SKILL_ALIASES[canonical] || [skillKeyOrName, getSkillDisplayName(skillKeyOrName)];
      return skills?.find((s) => aliases.includes(s.name))?.value ?? 0;
    };

    const attrValue = getAttributeValue(attributes, mainAttr) ?? 0;
    const skillValue = findSkillValue(mainSkill);
    const successValue = attrValue + skillValue;
  
    // Бонус урона для НКР "Пехотинец"
    const ncrInfantryWeaponIds = TRAITS['Пехотинец']?.modifiers?.ncrInfantryWeaponIds || [];
    const isNcrInfantryWeapon = displayWeapon && ncrInfantryWeaponIds.includes(displayWeapon.id ?? displayWeapon.weaponId);

    const damageWithNcr = hasTrait('Пехотинец') && isNcrInfantryWeapon ? Number(displayWeapon.damage ?? 0) + 1 : Number(displayWeapon.damage ?? 0);
    const weaponType = displayWeapon?.weaponType ?? displayWeapon?.weapon_type;
    const appliesMeleeBonus = displayWeapon?.meleeBonusApplies === true || ['Melee', 'Unarmed'].includes(weaponType);
    const visibleDamage = appliesMeleeBonus ? damageWithNcr + (Number(meleeBonus) || 0) : damageWithNcr;

    // Снижение базовой скорострельности на 1 при "Техника спуска" для стрелкового и энергооружия
    const equippedWeaponTypes = (equippedWeapons || [])
      .filter(Boolean)
      .map((w) => w?.weapon_type);
    const hasLightAndEnergyEquipped =
      equippedWeaponTypes.includes('Light') && equippedWeaponTypes.includes('Energy');
    const isLightOrEnergy = (weapon?.itemType === 'weapon') && (
      weapon.weapon_type === 'Light' || weapon.weapon_type === 'Energy'
    );
    const fireRateWithTrait = hasTrait('Техника спуска') && hasLightAndEnergyEquipped && isLightOrEnergy
      ? Math.max(0, fireRateBase - 1)
      : fireRateBase;

    const stats = [
      { label: tWeaponsAndArmorScreen('weapon.fields.success'), value: `${successValue}` },
      { label: tWeaponsAndArmorScreen('weapon.fields.damageType'), value: damageType },
      { label: tWeaponsAndArmorScreen('weapon.fields.damage'), value: `${visibleDamage}` },
      { label: tWeaponsAndArmorScreen('weapon.fields.effect'), value: effectsValue },
      { label: tWeaponsAndArmorScreen('weapon.fields.fireRate'), value: fireRateWithTrait },
      { label: tWeaponsAndArmorScreen('weapon.fields.range'), value: rangeValue },
      { label: tWeaponsAndArmorScreen('weapon.fields.qualities'), value: qualitiesValue },
      ...(displayWeapon?.withoutMods ? [] : [{ label: tWeaponsAndArmorScreen('weapon.fields.modification'), type: 'button' }]),
    ];
  
    return (
      <View style={localStyles.weaponCardContainer}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { textAlign: 'center', width: '100%' }]}>{weaponName}</Text>
          {showSourceSlot && weapon?.sourceSlot ? (
            <Text style={{ fontSize: 10, color: '#888', textAlign: 'center', width: '100%', marginTop: 2 }}>
              {tWeaponsAndArmorScreen(`robotSlot.slotNames.${weapon.sourceSlot}`) || weapon.sourceSlot}
            </Text>
          ) : null}
        </View>
        <View>
          {stats.map((stat, index) => (
            <View key={index} style={[localStyles.weaponStatRow, { borderBottomWidth: 1 }]}>
              <Text style={localStyles.weaponStatLabel}>{stat.label}</Text>
              {stat.type === 'button' ? (
                <TouchableOpacity 
                  style={localStyles.weaponModificationButton}
                  onPress={() => displayWeapon && onModifyWeapon(displayWeapon)}
                >
                  <Text style={localStyles.weaponModificationButtonText}>+</Text>
                </TouchableOpacity>
              ) : (
                stat.label === tWeaponsAndArmorScreen('weapon.fields.damage') 
                  ? renderTextWithIcons(`${stat.value} {CD}`, localStyles.weaponStatValue) 
                  : <Text style={localStyles.weaponStatValue}>{stat.value}</Text>
              )}
            </View>
          ))}

        </View>
      </View>
    );
  };


const findLocalizedWeapon = (catalog, weapon) => {
  if (!weapon?.id) return weapon;
  const base = (catalog?.weapons || []).find((entry) => entry.id === weapon.id);
  if (!base) return weapon;

  // Если на оружии применены моды (есть baseWeaponName), сохраняем все модифицированные поля.
  // Иначе — catalog-данные имеют приоритет (для i18n).
  const hasAppliedMods = weapon.baseWeaponName != null;

  return {
    ...weapon,
    ...base,
    // мета-поля из weapon сохраняем всегда
    sourceSlot: weapon.sourceSlot,
    isBuiltin: weapon.isBuiltin,
    isManipulator: weapon.isManipulator,
    appliedMods: weapon.appliedMods,
    uniqueId: weapon.uniqueId,
    hasMods: base.hasMods ?? weapon.hasMods,
    withoutMods: base.withoutMods ?? weapon.withoutMods,
    // при наличии модов сохраняем все изменённые моды поля вместо catalog-данных
    ...(hasAppliedMods ? {
      name: weapon.name,
      baseWeaponName: weapon.baseWeaponName,
      damage: weapon.damage,
      fire_rate: weapon.fire_rate,
      qualities: weapon.qualities,
      range_name: weapon.range_name,
      weight: weapon.weight,
      cost: weapon.cost,
      damage_effects: weapon.damage_effects,
    } : {
      name: base.name || weapon.name,
    }),
  };
};

const findLocalizedArmor = (catalog, armorItem) => {
  if (!armorItem?.id) return armorItem;
  const base = catalog?.armorIndex?.byId?.get(armorItem.id);
  if (!base) return armorItem;
  return {
    ...base,
    ...armorItem,
    name: base.name || armorItem.name,
  };
};

const findLocalizedClothing = (catalog, clothingItem) => {
  if (!clothingItem?.id) return clothingItem;
  const allClothes = (catalog?.clothes?.clothes || []).flatMap((group) => group.items || []);
  const base = allClothes.find((entry) => entry.id === clothingItem.id);
  if (!base) return clothingItem;
  return {
    ...base,
    ...clothingItem,
    name: base.name || clothingItem.name,
  };
};

const chunkSlotKeys = (keys, size) => {
  const chunks = [];
  for (let i = 0; i < keys.length; i += size) {
    chunks.push(keys.slice(i, i + size));
  }
  return chunks;
};

const findRobotBodyUpgrade = (catalog, robotBodyPlan, inventoryItems = []) => {
  const parts = catalog?.robotPartsUpgrade || [];
  if (robotBodyPlan) {
    const byPlan = parts.find((entry) => entry?.robotBodyPlan === robotBodyPlan);
    if (byPlan) return byPlan;
  }

  const bodyPartId = (inventoryItems || []).find((item) => String(item?.id || '').startsWith('robot_body_'))?.id;
  if (!bodyPartId) return null;
  return parts.find((entry) => entry?.id === bodyPartId) || null;
};


// --- Main Component ---

const resolveStoreItemId = (weapon) => {
  const items = useCharacterStore.getState().items;
  if (weapon?.uniqueId && items[weapon.uniqueId]) return weapon.uniqueId;
  if (weapon?.id && items[weapon.id]) return weapon.id;
  return Object.values(items).find(
    (item) => item.equipped && (
      item.uniqueId === weapon?.uniqueId
      || item.id === weapon?.id
      || item.weaponId === weapon?.weaponId
    ),
  )?.id;
};

const WeaponsAndArmorScreen = () => {
  const {
    attributes,
    level,
    equippedWeapons: contextEquippedWeapons,
    setEquippedWeapons,
    equippedArmor: contextEquippedArmor,
    setEquippedArmor,
    equippedRobotSlots,
    saveModifiedItem,
    attributesSaved,
    trait,
    origin,
  } = useCharacter();

  const storeItems = useCharacterStore((state) => state.items);
  const storeEquippedWeapons = useMemo(() => selectItemsByEquipped({ items: storeItems }, true), [storeItems]);
  const inventoryItems = useMemo(() => selectItemsByEquipped({ items: storeItems }, false), [storeItems]);
  const storeEquippedArmor = useMemo(() => getEquippedArmor({ items: storeItems }), [storeItems]);
  const updateItem = useCharacterStore((state) => state.updateItem);
  const unequipItem = useCharacterStore((state) => state.unequipItem);

  const equippedWeaponsForDisplay = useMemo(() => {
    const fromStore = storeEquippedWeapons
      .filter((item) => item.itemType === 'weapon')
      .map(storeItemToWeaponDisplay);
    const robotExtras = (contextEquippedWeapons || []).filter(
      (w) => w?.isBuiltin || w?.isManipulator || w?.sourceSlot,
    );
    const storeKeys = new Set(fromStore.map((w) => w.uniqueId || w.id));
    const extras = robotExtras.filter((w) => !storeKeys.has(w.uniqueId || w.id));
    return [...fromStore, ...extras];
  }, [storeEquippedWeapons, contextEquippedWeapons]);

  const equippedArmor = useMemo(() => {
    const hasStoreArmor = Object.values(storeEquippedArmor).some(
      (slot) => slot.armor || slot.clothing,
    );
    return hasStoreArmor ? storeEquippedArmor : contextEquippedArmor;
  }, [storeEquippedArmor, contextEquippedArmor]);

  const storeEffects = useCharacterStore((state) => state.effects);
  const activeTimedEffects = useMemo(() => selectActiveTimedEffects({ effects: storeEffects }), [storeEffects]);
  const locale = useLocale();

  const isRobot = isRobotCharacter({ origin, trait });
  const initiative = calculateInitiative(attributes);
  const defense = calculateDefense(attributes);
  const meleeBonus = calculateMeleeBonus(attributes, trait);
  const meleeBonusValue = calculateMeleeBonusValue(attributes, trait);
  const maxHealth = attributesSaved ? calculateMaxHealth(attributes, level) : 0;
  const timedMaxHpBonus = getTimedMaxHpBonus(activeTimedEffects);
  const effectiveMaxHealth = maxHealth + timedMaxHpBonus;
  const timedDR = getTimedDamageResistanceBonus(activeTimedEffects);
  
  const characterForImmunities = { origin, trait };
  const hasRadImmunity = hasRadiationImmunity(characterForImmunities);
  const hasPoisonImmunityValue = hasPoisonImmunity(characterForImmunities);
  const hasTimedEffects = (activeTimedEffects || []).length > 0;
  const equipmentCatalog = getEquipmentCatalog(locale);
  const robotBodyUpgrade = findRobotBodyUpgrade(
    equipmentCatalog,
    trait?.modifiers?.robotBodyPlan,
    inventoryItems,
  );
  const localizedEquippedWeapons = equippedWeaponsForDisplay.map(
    (weapon) => findLocalizedWeapon(equipmentCatalog, weapon),
  );

  const weaponFingerprint = (w) => {
    if (!w) return null;
    const mods = w.appliedMods ? Object.entries(w.appliedMods).sort().map(([k, v]) => `${k}:${v}`).join(',') : '';
    return `${w.id}|${mods}`;
  };
  const dedupedEquippedWeapons = localizedEquippedWeapons.filter((w, idx, arr) => {
    if (!w) return true;
    const fp = weaponFingerprint(w);
    return arr.findIndex(x => weaponFingerprint(x) === fp) === idx;
  });

  // Состояние для модального окна модификаций
  const [modificationModalVisible, setModificationModalVisible] = useState(false);
  const [selectedWeaponForModification, setSelectedWeaponForModification] = useState(null);
  const [armorModalVisible, setArmorModalVisible] = useState(false);
  const [selectedArmorSlot, setSelectedArmorSlot] = useState(null);
  const [armorModalMode, setArmorModalMode] = useState('armor');
  const [robotBodyUpgradeModalVisible, setRobotBodyUpgradeModalVisible] = useState(false);
  

  

  
  // Функции для работы с модальным окном модификаций
  const handleOpenModificationModal = (weapon) => {
    if (!weapon) {
      return;
    }
    
    setSelectedWeaponForModification(weapon);
    setModificationModalVisible(true);
  };

  const handleCloseModificationModal = () => {
    setModificationModalVisible(false);
    setSelectedWeaponForModification(null);
  };

  const handleApplyModification = useCallback((modifiedWeapon) => {
    handleCloseModificationModal();
    const itemId = resolveStoreItemId(selectedWeaponForModification);

    if (itemId) {
      updateItem(itemId, weaponModPatchToStore(modifiedWeapon));
      return;
    }

    saveModifiedItem(selectedWeaponForModification, modifiedWeapon);
    setEquippedWeapons((prev) => prev.map((w) => (
      w && selectedWeaponForModification && w.uniqueId === selectedWeaponForModification.uniqueId
        ? modifiedWeapon
        : w
    )));
  }, [selectedWeaponForModification, updateItem, saveModifiedItem, setEquippedWeapons]);

  const handleUnequipWeapon = useCallback((weapon) => {
    if (!weapon || weapon.isBuiltin || weapon.isManipulator) return;
    const itemId = resolveStoreItemId(weapon);
    if (itemId) {
      unequipItem(itemId);
      return;
    }
    setEquippedWeapons((prev) => prev.filter((w) => w !== weapon));
  }, [unequipItem, setEquippedWeapons]);
  const handleOpenArmorModal = (slotKey, mode = 'armor') => {
    const item = mode === 'clothing' ? equippedArmor?.[slotKey]?.clothing : equippedArmor?.[slotKey]?.armor;
    if (!item) return;
    setSelectedArmorSlot(slotKey);
    setArmorModalMode(mode);
    setArmorModalVisible(true);
  };

  const handleApplyArmorModification = (modifiedItem) => {
    if (!selectedArmorSlot) return;
    const field = armorModalMode === 'clothing' ? 'clothing' : 'armor';
    const original = equippedArmor?.[selectedArmorSlot]?.[field];
    if (original) saveModifiedItem(original, modifiedItem);

    setEquippedArmor((prev) => ({
      ...prev,
      [selectedArmorSlot]: {
        ...(prev[selectedArmorSlot] || {}),
        [field]: modifiedItem,
      },
    }));
    setArmorModalVisible(false);
    setSelectedArmorSlot(null);
  };

  // Robot-specific state and handlers
  const bodyPlan = resolveBodyPlan({ origin, trait }) || null;
  const [limbUpgradeModalVisible, setLimbUpgradeModalVisible] = useState(false);
  const [selectedLimbSlot, setSelectedLimbSlot] = useState(null);
  const [armorPickerVisible, setArmorPickerVisible] = useState(false);
  const [armorPickerSlot, setArmorPickerSlot] = useState(null);

  const handleOpenLimbUpgradeModal = (slotKey) => {
    setSelectedLimbSlot(slotKey);
    setLimbUpgradeModalVisible(true);
  };

  const handleOpenArmorPicker = (slotKey) => {
    setArmorPickerSlot(slotKey);
    setArmorPickerVisible(true);
  };

  const handleWeaponPress = (weapon) => {
    // Open weapon card or details — for now, just open modification modal
    handleOpenModificationModal(weapon);
  };

  const renderArmorPart = (slotKey) => {
    // Проверяем является ли персонаж роботом
    const isRobot = trait?.modifiers?.isRobot || false;
    const isMisterHandyRobot = bodyPlan === 'misterHandy';
    
    // Если робот и есть equippedRobotSlots, отображаем RobotSlot
    if (isRobot && equippedRobotSlots && equippedRobotSlots[slotKey]) {
      return <RobotSlot key={slotKey} slotKey={slotKey} slotData={equippedRobotSlots[slotKey]} />;
    }
    
    // Иначе отображаем обычный ArmorPart
    const slotData = equippedArmor[slotKey];
    const armorItem = findLocalizedArmor(equipmentCatalog, slotData ? slotData.armor : null);
    const clothingItem = findLocalizedClothing(equipmentCatalog, slotData ? slotData.clothing : null);
    const robotSlotTitles = isMisterHandyRobot ? {
      head: 'Оптика',
      body: 'Корпус',
      leftArm: 'Рука 1',
      rightArm: 'Рука 2',
      leftLeg: 'Рука 3',
      rightLeg: 'Двигатель',
    } : null;
    const config = {
      title: robotSlotTitles?.[slotKey] || tWeaponsAndArmorScreen(`armor.slots.${slotKey}.title`),
      subtitle: tWeaponsAndArmorScreen(`armor.slots.${slotKey}.subtitle`),
    };

    const { item: modifiedArmor } = applyArmorMods(armorItem, equipmentCatalog);
    const { item: modifiedClothing } = applyArmorMods(clothingItem, equipmentCatalog, { standardKey: 'appliedClothingModId', uniqueKey: 'unused' });

    const physDef = Math.max(Number(modifiedArmor?.physicalDamageRating || 0), Number(modifiedClothing?.physicalDamageRating || 0)) + (timedDR.physical || 0);
    const energyDef = Math.max(Number(modifiedArmor?.energyDamageRating || 0), Number(modifiedClothing?.energyDamageRating || 0)) + (timedDR.energy || 0);
    const radDef = Math.max(Number(modifiedArmor?.radiationDamageRating || 0), Number(modifiedClothing?.radiationDamageRating || 0)) + (timedDR.radiation || 0);

    const stats = [
      { label: tWeaponsAndArmorScreen('armor.fields.physical'), value: physDef > 0 ? physDef : tWeaponsAndArmorScreen('common.none') },
      { label: tWeaponsAndArmorScreen('armor.fields.energy'), value: energyDef > 0 ? energyDef : tWeaponsAndArmorScreen('common.none') },
      { label: tWeaponsAndArmorScreen('armor.fields.radiation'), value: hasRadImmunity ? '∞' : (radDef > 0 ? radDef : tWeaponsAndArmorScreen('common.none')) },
      ...(modifiedClothing ? [{ label: tWeaponsAndArmorScreen('armor.fields.clothingModification'), value: '⋯', type: 'button', onPress: () => handleOpenArmorModal(slotKey, 'clothing') }] : []),
      ...(modifiedArmor ? [{ label: tWeaponsAndArmorScreen('armor.fields.armorModification'), value: '⋯', type: 'button', onPress: () => handleOpenArmorModal(slotKey, 'armor') }] : []),
    ];

    if (slotKey === 'body' && robotBodyUpgrade) {
      stats.push({
        label: tWeaponsAndArmorScreen('armor.fields.armorModification'),
        value: '⋯',
        type: 'button',
        onPress: () => setRobotBodyUpgradeModalVisible(true),
      });
    }

    return (
        <ArmorPart 
            key={slotKey} 
            title={config.title} 
            subtitle={config.subtitle}
            armorName={(slotKey === 'body' && robotBodyUpgrade ? robotBodyUpgrade?.name : null) || modifiedArmor?.name}
            clothingName={modifiedClothing?.name}
            stats={stats}
        />
    );
  };

  return (
    <ImageBackground
      source={require('../../../assets/bg.png')}
      style={localStyles.background}
      imageStyle={{ opacity: 0.3 }}
    >
      <SafeAreaView style={{flex: 1}}>
        <ScrollView style={{ backgroundColor: 'transparent' }} contentContainerStyle={[styles.scrollContent, { paddingHorizontal: '2.5%'}]}>
            {/* Основные характеристики */}
            <View style={{ marginBottom: 16 }}>
            <View style={localStyles.statsRow}>
                <StatBox title={tWeaponsAndArmorScreen('stats.initiative')} value={initiative} />
                <StatBox title={tWeaponsAndArmorScreen('stats.defense')} value={defense} />
                <StatBox title={tWeaponsAndArmorScreen('stats.meleeBonus')} value={meleeBonus} highlightMeleeBonus />
            </View>
            <View style={[localStyles.statsRow, { marginTop: 8 }]}>
                <StatBox title={tWeaponsAndArmorScreen('stats.effects')} value={hasTimedEffects ? '' : tWeaponsAndArmorScreen('common.empty')}>
                  {hasTimedEffects ? (
                    <View style={localStyles.effectsListContainer}>
                      {(activeTimedEffects || []).map((effect) => {
                        const effectText = effect.effectName || effect.effectLabel || '—';
                        const isNegative = effect.effectKind === 'negative';
                        return (
                          <View key={effect.id} style={localStyles.effectLineContainer}>
                            <Text style={[localStyles.effectText, isNegative ? localStyles.negativeEffectText : localStyles.positiveEffectText]}>
                              {effectText}
                            </Text>
                            {/* TIMER_VISIBILITY_TOGGLE_START: закомментируйте этот блок, чтобы скрыть таймер эффекта */}
                            <Text style={localStyles.effectTimerText}>
                              {getEffectTimeText(effect.scenesLeft)}
                            </Text>
                            {/* TIMER_VISIBILITY_TOGGLE_END */}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </StatBox>
                <StatBox title={tWeaponsAndArmorScreen('stats.poisonResistance')} value={hasPoisonImmunityValue ? '∞' : '0'} />
                <StatBox title={tWeaponsAndArmorScreen('stats.health')} max={effectiveMaxHealth}>
                  <HealthCounter max={effectiveMaxHealth} isEnabled={attributesSaved} />
                </StatBox>
            </View>
            </View>

            {/* Броня / Слоты робота */}
            {isRobot && equippedRobotSlots ? (
              <View style={{ marginBottom: 16 }}>
                {chunkSlotKeys(getRobotSlotKeys(bodyPlan), 3).map((chunk, rowIndex) => (
                  <View
                    key={rowIndex}
                    style={[localStyles.statsRow, rowIndex > 0 ? { marginTop: 8 } : null]}
                  >
                    {chunk.map((slotKey) => (
                      <RobotSlot
                        key={slotKey}
                        slotKey={slotKey}
                        slotData={equippedRobotSlots[slotKey]}
                        bodyPlan={bodyPlan}
                        onUpgradeLimb={handleOpenLimbUpgradeModal}
                        onOpenArmorPicker={handleOpenArmorPicker}
                        onWeaponPress={handleWeaponPress}
                        hasRadImmunity={hasRadImmunity}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ marginBottom: 16 }}>
              <View style={localStyles.statsRow}>
                  {renderArmorPart('leftArm')}
                  {renderArmorPart('head')}
                  {renderArmorPart('rightArm')}
              </View>
              <View style={[localStyles.statsRow, { marginTop: 8 }]}>
                  {renderArmorPart('leftLeg')}
                  {renderArmorPart('body')}
                  {renderArmorPart('rightLeg')}
              </View>
              </View>
            )}
            
            {/* Оружие */}
            <View style={{ marginBottom: 16 }}>
              {Array.from({ length: Math.ceil(dedupedEquippedWeapons.length / 2) || 1 }, (_, rowIndex) => (
                <View key={rowIndex} style={[localStyles.statsRow, rowIndex > 0 ? { marginTop: 8 } : null]}>
                  <WeaponCard
                    weapon={dedupedEquippedWeapons[rowIndex * 2] ?? null}
                    onModifyWeapon={handleOpenModificationModal}
                    onUnequip={isRobot ? null : handleUnequipWeapon}
                    showSourceSlot={false}
                    meleeBonus={meleeBonusValue}
                    equippedWeapons={equippedWeaponsForDisplay}
                  />
                  <WeaponCard
                    weapon={dedupedEquippedWeapons[rowIndex * 2 + 1] ?? null}
                    onModifyWeapon={handleOpenModificationModal}
                    onUnequip={isRobot ? null : handleUnequipWeapon}
                    showSourceSlot={false}
                    meleeBonus={meleeBonusValue}
                    equippedWeapons={equippedWeaponsForDisplay}
                  />
                </View>
              ))}
            </View>
            

        </ScrollView>
      </SafeAreaView>
      
      {/* Модальное окно модификаций */}
      <WeaponModificationModal
        visible={modificationModalVisible}
        onClose={handleCloseModificationModal}
        weapon={selectedWeaponForModification}
        onApplyModification={handleApplyModification}
      />
      <ArmorModificationModal
        visible={armorModalVisible}
        onClose={() => { setArmorModalVisible(false); setSelectedArmorSlot(null); }}
        targetItem={selectedArmorSlot
          ? (armorModalMode === 'clothing'
            ? findLocalizedClothing(equipmentCatalog, equippedArmor?.[selectedArmorSlot]?.clothing)
            : findLocalizedArmor(equipmentCatalog, equippedArmor?.[selectedArmorSlot]?.armor))
          : null}
        mode={armorModalMode}
        onApply={handleApplyArmorModification}
      />
      {/* Robot modals */}
      <LimbUpgradeModal
        visible={limbUpgradeModalVisible}
        slotKey={selectedLimbSlot}
        currentLimb={selectedLimbSlot && equippedRobotSlots ? equippedRobotSlots[selectedLimbSlot]?.limb : null}
        bodyPlan={bodyPlan}
        onClose={() => { setLimbUpgradeModalVisible(false); setSelectedLimbSlot(null); }}
      />
      <ArmorPickerModal
        visible={armorPickerVisible}
        slotKey={armorPickerSlot}
        equippedRobotSlots={equippedRobotSlots}
        onClose={() => { setArmorPickerVisible(false); setArmorPickerSlot(null); }}
      />
      <Modal
        visible={robotBodyUpgradeModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRobotBodyUpgradeModalVisible(false)}
      >
        <View style={localStyles.modalOverlay}>
          <View style={localStyles.robotBodyModalContent}>
            <Text style={localStyles.robotBodyModalTitle}>
              {locale === 'ru-RU' ? 'Модернизация корпуса' : 'Body upgrade'}
            </Text>
            <Text style={localStyles.robotBodyModalText}>
              {locale === 'ru-RU' ? 'Скоро добавим' : 'Comming Soon'}
            </Text>
            <TouchableOpacity
              style={localStyles.robotBodyModalButton}
              onPress={() => setRobotBodyUpgradeModalVisible(false)}
            >
              <Text style={localStyles.robotBodyModalButtonText}>{tWeaponsAndArmorScreen('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};


export default WeaponsAndArmorScreen;
