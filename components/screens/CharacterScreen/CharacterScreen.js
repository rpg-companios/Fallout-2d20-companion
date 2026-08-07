import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  Pressable,
  SafeAreaView,
  StatusBar,
  Modal,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { useCharacter } from "../../CharacterContext";
import useCharacterStore from "../../../src/store/characterStore";
import { selectActiveTimedEffects } from "../../../src/store/selectors";
import { useShallow } from 'zustand/react/shallow';
import OriginModal from "./modals/OriginModal";
import EquipmentKitModal from "./modals/EquipmentKitModal";
import { loadEnrichedOrigins, tOrigin } from "../../../domain/origins";
import { loadTraitsData, tTrait } from "../../../domain/traits";
import { getTraitModalComponent, getTraitConfig } from "./modals/traits/index";
import {
  createInitialAttributes,
  getRemainingAttributePoints,
  getSkillPoints,
  calculateSkillPointsUsed,
  getLuckPoints,
  getMaxSelectableSkills,
  canChangeAttribute,
  canChangeSkillValue,
  getAttributeLimits,
  validateSkills,
  calculateMaxHealth,
  ALL_SKILLS,
  isMultiTraitOrigin,
  MAX_ATTRIBUTE,
  getCanonicalAttributeKey,
  normalizeAttributeMap,
  getTraitAttributeBonus,
} from "../../../domain/characterCreation";
// Силовая броня (§5.6 плана): пока надет каркас, его attributeModifier подменяет
// базу атрибутов НА ОТОБРАЖЕНИИ (натуральные значения в сторе/снапшоте не трогаются).
import { applyFrameAttributeModifiers, hasFrame } from "../../../domain/powerArmor";
import dataPowerArmor from "../../../data/equipment/powerArmor.json";
import {
  getSkillDisplayName,
  tCharacterScreen,
} from "./logic/characterScreenI18n";

const PA_FRAME_CATALOG = dataPowerArmor?.frame?.pieces?.[0] || null;
import { useLocale } from "../../../i18n/locale";
import { AttributesSection } from "./AttributesSection";
import styles from "../../../styles/CharacterScreen.styles";
import { getTimedAttributeModifiers } from "../../../domain/effects";
import { createEmptyEquippedArmor } from "../../../domain/equippedArmor";
import { resolveSkillRewards } from "../../../domain/skillRewards";
import { debugLog, FALLOUT_DEBUG_MARKER } from "../../../src/debug/falloutDebug";
import { getEquipmentCatalog } from "../../../i18n/equipmentCatalog";

// Определяем константу BASE_TAGGED_SKILLS для исправления ReferenceError
const BASE_TAGGED_SKILLS = 3; // Максимальное количество основных навыков
const ImageSection = ({ origin }) => {
  const defaultImage = require("../../../assets/bg1.png");
  return (
    <View style={styles.imageSection}>
      <ImageBackground
        source={origin ? origin.image : defaultImage}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
};

const ResetConfirmationModal = ({ visible, onCancel, onConfirm }) => (
  <Modal
    animationType="fade"
    transparent={true}
    visible={visible}
    onRequestClose={onCancel}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>{tCharacterScreen("warnings.attentionTitle")}</Text>
        <Text style={styles.modalText}>
          {tCharacterScreen("warnings.resetAllValues")}
        </Text>
        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={onCancel}
          >
            <Text style={styles.buttonText}>{tCharacterScreen("buttons.cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={onConfirm}
          >
            <Text style={styles.buttonText}>{tCharacterScreen("buttons.agree")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const PressableRow = ({ title, value, onPress, disabled }) => (
  <Pressable
    style={[styles.pressableRow, disabled && styles.disabledPressable]}
    onPress={onPress}
    android_ripple={{ color: "#ddd" }}
    disabled={disabled}
  >
    <Text style={styles.pressableTitle}>{title}:</Text>
    <Text
      style={[
        styles.pressableValue,
        value === tCharacterScreen("placeholders.selectNone") &&
          styles.placeholderText,
      ]}
    >
      {value}
    </Text>
  </Pressable>
);

const DerivedRow = ({ title, value }) => (
  <View style={styles.derivedRow}>
    <Text style={styles.derivedTitle}>{title}</Text>
    <Text style={styles.derivedValue}>{value}</Text>
  </View>
);

const SkillRow = ({
  name,
  value,
  isSelected,
  isMaxReached,
  isForced,
  onToggle,
  onIncrease,
  onDecrease,
  rowStyle,
  disabled,
  trait,
  italic,
  increaseDisabled,
}) => {
  return (
    <View style={[styles.skillRow, rowStyle]}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.skillSelector}
        disabled={disabled || isForced}
      >
        <View
          style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
            isForced && styles.checkboxForced,
          ]}
        />
        <Text
          style={[
            styles.skillName,
            isSelected && styles.skillNameSelected,
            isForced && styles.skillNameForced,
            italic && { fontStyle: 'italic' },
          ]}
        >
          {name}
        </Text>
      </TouchableOpacity>
      {!disabled ? (
        <CompactCounter
          value={value}
          onIncrease={onIncrease}
          onDecrease={onDecrease}
          isMaxReached={isMaxReached}
          increaseDisabled={increaseDisabled}
        />
      ) : (
        <Text style={styles.skillValue}>{value}</Text>
      )}
    </View>
  );
};

const CompactCounter = ({
  value,
  onIncrease,
  onDecrease,
  isMaxReached,
  increaseDisabled,
}) => (
  <View style={styles.compactCounter}>
    <TouchableOpacity
      onPress={onDecrease}
      style={[styles.counterButton, value <= 0 && styles.disabledButton]}
      disabled={value <= 0}
    >
      <Text
        style={[styles.counterButtonText, value <= 0 && styles.disabledText]}
      >
        -
      </Text>
    </TouchableOpacity>
    <Text style={styles.counterValue}>{value}</Text>
    <TouchableOpacity
      onPress={onIncrease}
      style={[
        styles.counterButton,
        (isMaxReached || increaseDisabled) && styles.disabledButton,
      ]}
      disabled={isMaxReached || increaseDisabled}
    >
      <Text
        style={[
          styles.counterButtonText,
          (isMaxReached || increaseDisabled) && styles.disabledText,
        ]}
      >
        +
      </Text>
    </TouchableOpacity>
  </View>
);

const LuckPointsRow = ({ luckPoints, maxLuckPoints, onSpend, onRestore }) => {
  const canSpend = luckPoints > 0;
  const canRestore = luckPoints < maxLuckPoints;

  return (
    <View style={[styles.luckRow, { justifyContent: 'center' }]}>
      <TouchableOpacity
        onPress={onSpend}
        style={[styles.luckButton, !canSpend && styles.disabledLuckButton]}
        disabled={!canSpend}
      >
        <Text style={styles.luckButtonText}>-</Text>
      </TouchableOpacity>
      <Text style={styles.derivedValue}>{`${luckPoints}`}</Text>
      <TouchableOpacity
        onPress={onRestore}
        style={[styles.luckButton, !canRestore && styles.disabledLuckButton]}
        disabled={!canRestore}
      >
        <Text style={styles.luckButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function CharacterScreen() {

  const {
    characterName, setCharacterName,
    isSaved,
    saveCharacter,
    level,
    setLevel,
    attributes: contextAttributes,
    setAttributes,
    skills: contextSkills,
    setSkills,
    selectedSkills,
    setSelectedSkills,
    extraTaggedSkills,
    setExtraTaggedSkills,
    forcedSelectedSkills,
    setForcedSelectedSkills,
    origin,
    setOrigin,
    trait,
    setTrait,
    equipment,
    setEquipment,
    effects,
    setEffects,
    caps,
    setCaps,
    setCurrentHealth,
    luckPoints,
    setLuckPoints,
    maxLuckPoints,
    setMaxLuckPoints,
    attributesSaved,
    setAttributesSaved,
    skillsSaved,
    setSkillsSaved,
    resetCharacter,
    availablePerkAttributePoints,
    commitAttributeChanges,
    setEquippedWeapons,
    setEquippedRobotSlots,
    setEquippedRobotModules,
    equippedPowerArmor,
  } = useCharacter();

  const debugLocale = useLocale();
  const locale = debugLocale;
  const storeAttributes = useCharacterStore((state) => state.attributes);
  const storeSkills = useCharacterStore((state) => state.skills);
  const storeEffects = useCharacterStore((state) => state.effects);
  const storePerkBonuses = useCharacterStore((state) => state.perkBonuses);
  const activeTimedEffects = useMemo(() => selectActiveTimedEffects({ effects: storeEffects }), [storeEffects]);

  const attributes = useMemo(() => {
    const fromStore = Object.values(storeAttributes);
    if (fromStore.length > 0) {
      return fromStore.map((attr) => ({ name: attr.id, value: attr.base }));
    }
    return contextAttributes;
  }, [storeAttributes, contextAttributes]);

  const skills = useMemo(() => {
    if (Object.keys(storeSkills).length > 0) {
      return ALL_SKILLS.map((skill) => {
        const stored = storeSkills[skill.name];
        return stored ? { name: skill.name, value: stored.base } : { ...skill };
      });
    }
    return contextSkills;
  }, [storeSkills, contextSkills]);

  useEffect(() => {
    debugLog('character.renderState', {
      marker: FALLOUT_DEBUG_MARKER,
      locale: debugLocale,
      originId: origin?.id,
      originName: origin?.name,
      traitId: trait?.id,
      traitIds: trait?.ids,
      traitName: trait?.name,
      equipmentId: equipment?.id,
      equipmentName: equipment?.name,
      attributesSaved,
      skillsSaved,
      selectedSkills,
      extraTaggedSkills,
      storeSkillsCount: Object.keys(storeSkills || {}).length,
      skillsPreview: skills.slice(0, 8),
    });
  }, [debugLocale, origin?.id, origin?.name, trait?.id, trait?.name, equipment?.id, equipment?.name, attributesSaved, skillsSaved, selectedSkills, extraTaggedSkills, storeSkills, skills]);

  const localizedOrigin = useMemo(() => {
    if (!origin?.id) return origin;
    return loadEnrichedOrigins().find((entry) => entry.id === origin.id) || { ...origin, name: tOrigin(origin.id) };
  }, [origin, locale]);

  const localizedTraitName = useMemo(() => {
    if (!trait) return null;
    const traitId = trait.id || trait.ids?.[0];
    const traitData = loadTraitsData().find((entry) => entry.id === traitId);
    return traitData?.displayNameKey ? tTrait(traitData.displayNameKey) : trait.name;
  }, [trait, locale]);

  const localizedEquipmentName = useMemo(() => {
    if (!equipment) return null;
    if (!equipment.id) return equipment.name;
    const catalog = getEquipmentCatalog(locale);
    return catalog?.equipmentKits?.[equipment.id]?.name || equipment.name;
  }, [equipment, locale]);

  const [isOriginModalVisible, setIsOriginModalVisible] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [isTraitModalVisible, setIsTraitModalVisible] = useState(false);
  const [isEquipmentKitModalVisible, setIsEquipmentKitModalVisible] =
    useState(false);

  const [showResetWarning, setShowResetWarning] = useState(false);
  const [resetType, setResetType] = useState(null);

  // Состояние для временного распределения очков атрибутов от перков
  const [tempAttributes, setTempAttributes] = useState(null);
  const [perkPointsToDistribute, setPerkPointsToDistribute] = useState(0);

  const showAlert = (title, message = "") => {
    const text = message ? `${title}\n\n${message}` : title;
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(text);
      return;
    }
    if (message) {
      Alert.alert(title, message);
      return;
    }
    Alert.alert(title);
  };

  const showError = (message) => {
    showAlert(tCharacterScreen("alerts.errorTitle"), message);
  };

  // Активация режима распределения очков от перков
  useEffect(() => {
    if (availablePerkAttributePoints > 0 && attributesSaved) {
      setTempAttributes(attributes);
      setPerkPointsToDistribute(availablePerkAttributePoints);
    } else {
      setTempAttributes(null);
      setPerkPointsToDistribute(0);
    }
  }, [availablePerkAttributePoints, attributesSaved, attributes]);

  useEffect(() => {
    const newMaxLuck = getLuckPoints(attributes, trait);
    if (newMaxLuck !== maxLuckPoints) {
      setMaxLuckPoints(newMaxLuck);
      if (!attributesSaved) {
        setLuckPoints(newMaxLuck);
      }
    }
  }, [
    attributes,
    trait,
    maxLuckPoints,
    attributesSaved,
    setMaxLuckPoints,
    setLuckPoints,
  ]);

  const isPerkAttributeMode = tempAttributes !== null;
  const currentAttributes = isPerkAttributeMode ? tempAttributes : attributes;
  const timedAttributeModifiers = getTimedAttributeModifiers(activeTimedEffects);
  // §5.6: пока надет каркас силовой брони, его модификаторы атрибутов действуют
  // на отображаемом значении. Режим перка редактирует натуральную базу — не трогаем.
  const withPowerArmorModifiers = (attrs) =>
    applyFrameAttributeModifiers(attrs, hasFrame(equippedPowerArmor) ? PA_FRAME_CATALOG : null);
  const displayAttributes = isPerkAttributeMode
    ? currentAttributes
    : withPowerArmorModifiers(
        attributesSaved
          ? currentAttributes.map((attr) => ({
            ...attr,
            value: attr.value + (timedAttributeModifiers[getCanonicalAttributeKey(attr.name)] || 0),
          }))
          : currentAttributes,
      );

  const remainingInitialPoints = getRemainingAttributePoints(attributes, trait);
  const remainingPerkPoints = isPerkAttributeMode
    ? perkPointsToDistribute -
      (tempAttributes.reduce((sum, a) => sum + a.value, 0) -
        attributes.reduce((sum, a) => sum + a.value, 0))
    : 0;

  const remainingAttributePoints = isPerkAttributeMode
    ? remainingPerkPoints
    : remainingInitialPoints;

  const canDistributeSkills = attributesSaved && !skillsSaved;
  const skillPointsAvailable = attributesSaved
    ? getSkillPoints(attributes, level)
    : 0;
  const skillPointsUsed = calculateSkillPointsUsed(
    skills,
    selectedSkills,
    extraTaggedSkills,
  );
  const skillPointsLeft = Math.max(0, skillPointsAvailable - skillPointsUsed);

  const handleSavePerkAttributes = () => {
    if (remainingPerkPoints > 0) {
      showError(tCharacterScreen("errors.distributeAllPerkAttributePoints"));
      return;
    }
    commitAttributeChanges(tempAttributes, perkPointsToDistribute);
    setTempAttributes(null);
    setPerkPointsToDistribute(0);
  };

  const handleTempAttributeChange = (index, delta) => {
    setTempAttributes((prev) => {
      const newAttributes = [...prev];
      const attr = newAttributes[index];
      const baseValue = attributes[index].value; // Нельзя опускаться ниже сохраненного значения

      const newValue = attr.value + delta;

      // Увеличение: проверяем, есть ли очки и не превышен ли максимум
      if (delta > 0) {
        if (remainingPerkPoints <= 0) return prev; // Нет очков
        if (newValue > MAX_ATTRIBUTE) return prev; // Превышен максимум
      }

      // Уменьшение: проверяем, не опускаемся ли ниже базового значения
      if (delta < 0) {
        if (newValue < baseValue) return prev;
      }

      newAttributes[index] = { ...attr, value: newValue };
      return newAttributes;
    });
  };

  const handleSelectKit = (kit) => {
    // Robots vs humans:
    //   - Humans: kit items go to inventory UNEQUIPPED (`equipped: false`).
    //     Player equips them manually via the WeaponsAndArmor / Inventory screen.
    //   - Robots: kit items go to inventory EQUIPPED + LOCKED
    //     (`equipped: true, locked: true`). They cannot be unequipped via the
    //     normal flow — only by swapping the robot limb that holds them.
    //
    // `kit.robotSlots` is the marker that EquipmentKitModal sets for robot
    // characters (see modals/EquipmentKitModal.js handleSelectKit).
    const isRobot = Boolean(kit.robotSlots);

    // 1. Add kit items to Zustand Store
    debugLog('kits.select.start', { count: kit.items?.length, isRobot });
    if (kit.items && Array.isArray(kit.items)) {
      kit.items.forEach(item => {
        // Currency (caps) is not an inventory item — it is tracked separately via
        // setCaps below. Skip it so it never hits addNewItem (which would warn about
        // a missing id field).
        debugLog('kits.select.candidate', {
          name: item?.name,
          itemType: item?.itemType,
          id: item?.id || item?.weaponId || item?.armorId || item?.clothingId || item?.itemId,
        });
        const CURRENCY_TYPES = new Set(['currency']);
        if (CURRENCY_TYPES.has(item?.itemType) || CURRENCY_TYPES.has(item?.type)) return;
        useCharacterStore.getState().addNewItem({
          ...item,
          equipped: isRobot ? true : false,
          locked:   isRobot ? true : false,
        });
      });
      debugLog('kits.select.done', { itemIds: Object.keys(useCharacterStore.getState().items) });
    }

    // 2. Set equipment metadata
    setEquipment({
      id: kit.id,
      name: kit.name,
      weight: kit.weight,
      price: kit.price,
      items: kit.items,
    });
    
    // 3. Update caps
    setCaps((prev) => prev + (kit.caps || 0));

    // 4. Robot: apply slot/weapon/module state from initRobotSlots
    if (kit.robotSlots) {
      setEquippedRobotSlots(kit.robotSlots);
      setEquippedRobotModules(kit.robotModules || []);
      setEquippedWeapons(kit.robotWeapons || []);
    } else {
      // Non-robot: ensure the archetype's built-in unarmed weapon (fists) is equipped.
      if (kit.unarmedWeaponId) {
        setEquippedWeapons((prev) => {
          const already = prev.some((w) => w?.id === kit.unarmedWeaponId);
          if (already) return prev;
          return [{ id: kit.unarmedWeaponId, isBuiltin: true }, ...prev];
        });
      }
    }

    setIsEquipmentKitModalVisible(false);
  };

  const handleToggleSkill = (skillName) => {
    if (!canDistributeSkills) {
      showAlert(tCharacterScreen("alerts.warningTitle"), tCharacterScreen("errors.saveAttributesFirst"));
      return;
    }

    const skillIndex = skills.findIndex((s) => s.name === skillName);
    if (skillIndex < 0) return;
    const currentSkill = skills[skillIndex];
    debugLog('skill.toggle.start', {
      skillName,
      before: currentSkill?.value,
      canDistributeSkills,
      attributesSaved,
      skillsSaved,
      selectedSkills,
      extraTaggedSkills,
      forcedSelectedSkills,
      storeSkill: useCharacterStore.getState().skills?.[skillName],
    });

    const isInMainSkills = selectedSkills.includes(skillName);
    const isInExtraSkills = extraTaggedSkills.includes(skillName);
    const isForcedSkill = forcedSelectedSkills.includes(skillName);
    const isCurrentlySelected = isInMainSkills || isInExtraSkills;

    if (isForcedSkill && isCurrentlySelected) {
      showError(tCharacterScreen("errors.cannotUnselectForcedSkill"));
      return;
    }

    let skillMax = trait?.modifiers?.skillMaxValue ?? 6;
    if (level === 1) {
      skillMax = Math.min(skillMax, 3);
    }

    const skillPickGroup = trait?.modifiers?.skillPickChoice?.from || [];
    const skillPickSelected = trait?.modifiers?.skillPickSelected || [];
    const isSkillPickActive = skillPickGroup.length > 0 && skillPickSelected.length > 0;
    const isInSkillPickGroup = skillPickGroup.includes(skillName);
    const isBonusFromSkillPick = isSkillPickActive && skillPickSelected.includes(skillName);
    const capForThis = isSkillPickActive && isInSkillPickGroup && !isBonusFromSkillPick ? 4 : undefined;

    const syncSkillStore = (delta) => {
      const store = useCharacterStore.getState();
      if (!store.skills?.[skillName]) {
        store.loadFromLegacyData({ skills });
      }
      useCharacterStore.getState().updateSkill(skillName, delta);
    };

    if (!isCurrentlySelected) {
      const unclampedNextValue = currentSkill.value + 2;
      if (unclampedNextValue > skillMax) {
        showError(
          tCharacterScreen("errors.skillTagExceedsMaxRank").replace("{skillMax}", String(skillMax)),
        );
        return;
      }
      const nextValue = Math.min(unclampedNextValue, capForThis ?? skillMax);

      if (isBonusFromSkillPick) {
        return;
      }

      if (isForcedSkill) {
        setExtraTaggedSkills((prev) => [...prev, skillName]);
      } else if (selectedSkills.length < BASE_TAGGED_SKILLS) {
        setSelectedSkills((prev) => [...prev, skillName]);
      } else {
        const extraSkillsFromTrait = trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
        const extraSkillsFromPerk = Number(storePerkBonuses?.extraTaggedSkills) || 0;
        const totalExtraSkillSlots = extraSkillsFromTrait + extraSkillsFromPerk;
        const traitForcedSkills = trait?.forcedSkills || trait?.modifiers?.forcedSkills || [];
        const canSelectAsExtra =
          totalExtraSkillSlots > 0 &&
          (traitForcedSkills.length === 0 || traitForcedSkills.includes(skillName));

        if (canSelectAsExtra && extraTaggedSkills.length < totalExtraSkillSlots) {
          setExtraTaggedSkills((prev) => [...prev, skillName]);
        } else {
          const extraText = canSelectAsExtra
            ? "\n\n" + tCharacterScreen("labels.extraSlotsAvailable") + ": " + (totalExtraSkillSlots - extraTaggedSkills.length)
            : "";
          showError(
            tCharacterScreen("errors.maxBaseSkills").replace("{count}", String(BASE_TAGGED_SKILLS)).replace("{extraText}", extraText),
          );
          return;
        }
      }

      const appliedDelta = nextValue - currentSkill.value;
      debugLog('skill.toggle.apply', { skillName, before: currentSkill.value, nextValue, appliedDelta, capForThis, skillMax });
      setSkills((prev) =>
        prev.map((s, i) => (i === skillIndex ? { ...s, value: nextValue } : s)),
      );
      if (appliedDelta !== 0) syncSkillStore(appliedDelta);
    } else {
      if (isInMainSkills) {
        setSelectedSkills((prev) => prev.filter((s) => s !== skillName));
      }
      if (isInExtraSkills) {
        setExtraTaggedSkills((prev) => prev.filter((s) => s !== skillName));
      }

      const nextValue = Math.max(0, currentSkill.value - 2);
      const appliedDelta = nextValue - currentSkill.value;
      debugLog('skill.toggle.remove', { skillName, before: currentSkill.value, nextValue, appliedDelta });
      setSkills((prev) =>
        prev.map((s, i) => (i === skillIndex ? { ...s, value: nextValue } : s)),
      );
      if (appliedDelta !== 0) syncSkillStore(appliedDelta);
    }
  };

  const handleChangeSkillValue = (index, delta) => {
    if (!attributesSaved) {
      showAlert(tCharacterScreen("errors.saveAttributesFirstSimple"));
      return;
    }

    if (delta > 0 && skillPointsLeft <= 0) {
      showError(tCharacterScreen("errors.noSkillPointsLeft"));
      return;
    }

    const skill = skills[index];
    if (!skill) return;
    const isTagged = selectedSkills.includes(skill.name) || extraTaggedSkills.includes(skill.name);

    const skillPickGroup = trait?.modifiers?.skillPickChoice?.from || [];
    const skillPickSelected = trait?.modifiers?.skillPickSelected || [];
    const isSkillPickActive = skillPickGroup.length > 0 && skillPickSelected.length > 0;
    const isInGroup = skillPickGroup.includes(skill.name);
    const isBonus = isSkillPickActive && skillPickSelected.includes(skill.name);
    const capForThis = isSkillPickActive && isInGroup && !isBonus ? 4 : undefined;

    if (!canChangeSkillValue(skill.value, delta, trait, level, isTagged)) return;

    let nextVal = skill.value + delta;
    if (capForThis !== undefined) {
      nextVal = Math.min(nextVal, capForThis);
    }
    if (nextVal === skill.value) return;

    const appliedDelta = nextVal - skill.value;
    debugLog('skill.changeValue.apply', { skillName: skill.name, before: skill.value, nextVal, requestedDelta: delta, appliedDelta, capForThis });
    setSkills((prev) => {
      const newSkills = [...prev];
      newSkills[index] = { ...skill, value: nextVal };
      return newSkills;
    });

    const store = useCharacterStore.getState();
    if (!store.skills?.[skill.name]) {
      store.loadFromLegacyData({ skills });
    }
    useCharacterStore.getState().updateSkill(skill.name, appliedDelta);
  };

  const handleChangeAttribute = (index, delta) => {
    const attr = attributes[index];
    const { min, max } = getAttributeLimits(trait, attr.name);
    const newValue = attr.value + delta;

    if (newValue < min || newValue > max) return;
    if (delta > 0 && remainingInitialPoints <= 0) return;

    const store = useCharacterStore.getState();
    if (!store.attributes[attr.name]) {
      store.loadFromLegacyData({ attributes });
    }
    store.updateAttribute(attr.name, delta);

    setAttributes((prev) => {
      const newAttributes = [...prev];
      newAttributes[index] = { ...newAttributes[index], value: newValue };
      return newAttributes;
    });
  };

  // Возвращает true если для данного origin есть трейт-модал
  const getTraitsForOrigin = (origin) => {
    if (!origin) return [];
    return loadTraitsData().filter((t) => t.originId === origin.id);
  };

  const handleSelectOrigin = (origin) => {
    setOrigin(origin);
    setSelectedOrigin(null);
    setIsOriginModalVisible(false);

    setTrait(null); // Всегда сбрасываем черту при смене происхождения
  };

  const confirmOriginSelection = (newOrigin) => {
    if (!origin || newOrigin.id === origin.id) {
      handleSelectOrigin(newOrigin);
      return;
    }

    const confirmAndReset = () => {
      resetCharacter();
      handleSelectOrigin(newOrigin);
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(`${tCharacterScreen("warnings.changeOriginTitle")}\n\n${tCharacterScreen("warnings.changeOriginConfirm")}`)
      ) {
        confirmAndReset();
      }
    } else {
      Alert.alert(
        tCharacterScreen("warnings.changeOriginTitle"),
        tCharacterScreen("warnings.changeOriginConfirm"),
        [
          { text: tCharacterScreen("buttons.cancel"), style: "cancel" },
          {
            text: tCharacterScreen("buttons.yesReset"),
            onPress: confirmAndReset,
            style: "destructive",
          },
        ],
      );
    }
  };

  const handleSelectTrait = (traitIds, traitName, newModifiersFromModal) => {
    // traitIds — массив canonical id (string | string[]); для multi-trait (Survivor) это массив.
    // traitName — локализованное имя черты из модала
    // Комбинируем с модификаторами из модального окна
    const ids = Array.isArray(traitIds) ? traitIds : [traitIds];
    const newTrait = {
      ids,
      id: ids[0], // primary id (для hasTrait-by-id lookup)
      name: traitName,
      modifiers: {
        ...(newModifiersFromModal || {}),
      },
    };

    const oldTrait = trait; // Запоминаем старую черту

    // Вычисляем новые значения атрибутов (отменяем старые бонусы черты и применяем новые)
    const oldAttrMods = normalizeAttributeMap(
      oldTrait?.modifiers?.attributes || {},
    );
    const newAttrMods = normalizeAttributeMap(
      newTrait?.modifiers?.attributes || {},
    );
    const nextAttributes = attributes.map((attr) => {
      const oldBonus = getTraitAttributeBonus(
        oldAttrMods[getCanonicalAttributeKey(attr.name)],
      );
      const newBonus = getTraitAttributeBonus(
        newAttrMods[getCanonicalAttributeKey(attr.name)],
      );
      return { ...attr, value: attr.value - oldBonus + newBonus };
    });
    setAttributes(nextAttributes);

    // Синхронизируем атрибуты в Zustand store, иначе CharacterScreen продолжит
    // читать старые значения из store и remaining points будут считаться неверно.
    const store = useCharacterStore.getState();
    const storeAttributes = store.attributes || {};
    nextAttributes.forEach((attr) => {
      const storeAttr = storeAttributes[attr.name];
      const storeValue = storeAttr?.base ?? 4;
      const delta = attr.value - storeValue;
      if (delta !== 0) {
        store.updateAttribute(attr.name, delta);
      }
    });

    const oldForcedSkills = oldTrait?.modifiers?.forcedSkills || [];
    const newForcedSkills = newTrait?.modifiers?.forcedSkills || [];
    const oldSelectedExtraSkills = oldTrait?.modifiers?.selectedExtraSkills || [];
    const newSelectedExtraSkills = newTrait?.modifiers?.selectedExtraSkills || [];

    // Обновляем список обязательных навыков
    setForcedSelectedSkills((currentForced) => {
      const withoutOld = currentForced.filter(
        (skill) => !oldForcedSkills.includes(skill),
      );
      return [...new Set([...withoutOld, ...newForcedSkills])];
    });

    // Обновляем отмеченные навыки и их значения
    setSelectedSkills((currentSelected) => {
      const withoutOld = currentSelected.filter(
        (skill) => !oldForcedSkills.includes(skill),
      );
      return withoutOld; // Forced skills go to extraTaggedSkills now
    });

    // Обновляем экстра навыки (forced skills теперь идут сюда)
    setExtraTaggedSkills((currentExtra) => {
      const withoutOld = currentExtra.filter(
        (skill) => !oldForcedSkills.includes(skill) && !oldSelectedExtraSkills.includes(skill),
      );
      return [...new Set([...withoutOld, ...newForcedSkills, ...newSelectedExtraSkills])];
    });

    const syncTraitSkillDelta = (skillName, delta) => {
      if (!delta) return;
      const store = useCharacterStore.getState();
      if (!store.skills?.[skillName]) {
        store.loadFromLegacyData({ skills });
      }
      useCharacterStore.getState().updateSkill(skillName, delta);
    };

    setSkills((currentSkills) => {
      let tempSkills = [...currentSkills];
      // Отменяем +2 от старых обязательных навыков
      [...oldForcedSkills, ...oldSelectedExtraSkills].forEach((skillName) => {
        const index = tempSkills.findIndex((s) => s.name === skillName);
        if (index > -1) {
          const before = tempSkills[index].value;
          const next = Math.max(0, before - 2);
          tempSkills[index] = {
            ...tempSkills[index],
            value: next,
          };
          syncTraitSkillDelta(skillName, next - before);
        }
      });
      // Применяем +2 к новым об��зательным навыкам (если их значение < 2)
      [...newForcedSkills, ...newSelectedExtraSkills].forEach((skillName) => {
        const index = tempSkills.findIndex((s) => s.name === skillName);
        if (index > -1 && tempSkills[index].value < 2) {
          const before = tempSkills[index].value;
          tempSkills[index] = { ...tempSkills[index], value: 2 };
          syncTraitSkillDelta(skillName, 2 - before);
        }
      });
      return tempSkills;
    });

    // Обновляем эффекты
    setEffects((currentEffects) => {
      const oldEffects = oldTrait?.modifiers?.effects || [];
      const newEffects = newTrait?.modifiers?.effects || [];
      const withoutOld = currentEffects.filter((e) => !oldEffects.includes(e));
      return [...new Set([...withoutOld, ...newEffects])];
    });

    // Устанавливаем саму новую черту
    setTrait(newTrait);
    setIsTraitModalVisible(false);
  };

  // Обработчик нажатия на строку черты
  const handleTraitPress = () => {
    if (!origin) {
      showError(tCharacterScreen("warnings.selectOriginFirst"));
      return;
    }

    // Блокируем, если черта уже выбрана и происхождение не предполагает нескольких черт
    if (trait && !isMultiTraitOrigin(origin.id)) {
      showAlert(tCharacterScreen("alerts.infoTitle"), tCharacterScreen("warnings.traitAlreadySelected"));
      return;
    }

    const availableTraits = getTraitsForOrigin(origin);
    if (availableTraits.length === 0) {
      showAlert(tCharacterScreen("alerts.infoTitle"), tCharacterScreen("warnings.noTraitsForOrigin"));
      return;
    }

    // Если есть специальное модальное окно для черты
    const TraitModalComponent = getTraitModalComponent(origin.id);
    if (TraitModalComponent) {
      setIsTraitModalVisible(true);
    } else {
      setIsTraitModalVisible(true);
    }
  };

  const handleSpendLuckPoint = () => {
    if (luckPoints > 0) {
      setLuckPoints((prev) => prev - 1);
    }
  };

  const handleRestoreLuckPoint = () => {
    if (luckPoints < maxLuckPoints) {
      setLuckPoints((prev) => prev + 1);
    }
  };

  const handleSaveAttributes = () => {
    if (!origin) {
      showError(tCharacterScreen("errors.originRequired"));
      return;
    }
    if (!trait) {
      showError(tCharacterScreen("errors.traitRequired"));
      return;
    }
    if (!equipment) {
      showError(tCharacterScreen("errors.equipmentRequired"));
      return;
    }
    if (remainingAttributePoints !== 0) {
      showError(tCharacterScreen("errors.spendAllAttributePoints"));
      return;
    }

    const initialMaxHealth = calculateMaxHealth(attributes, level);
    setCurrentHealth(initialMaxHealth);
    setAttributesSaved(true);
    setSkillsSaved(false);
  };

  const handleSaveSkills = async () => {
    if (!origin) {
      showError(tCharacterScreen("errors.originRequired"));
      return;
    }
    if (!trait) {
      showError(tCharacterScreen("errors.traitRequired"));
      return;
    }
    if (!equipment) {
      showError(tCharacterScreen("errors.equipmentRequired"));
      return;
    }
    if (skillPointsLeft > 0) {
      showError(tCharacterScreen("errors.spendAllSkillPoints"));
      return;
    }
    // Проверяем, что выбрано правильное количество навыков
    const extraSkillsFromTrait =
      trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
    const goodSoulSelected = trait?.modifiers?.goodSoulSelectedSkills || [];

    // Проверяем основные навыки (всегда должно быть ровно 3)
    if (selectedSkills.length !== BASE_TAGGED_SKILLS) {
      showError(
        tCharacterScreen("errors.exactBaseSkillsRequired").replace("{required}", String(BASE_TAGGED_SKILLS)).replace("{selected}", String(selectedSkills.length)),
      );
      return;
    }

    // Проверяем экстра навыки от черт и перков (tag)
    const extraSkillsFromPerkVal = Number(storePerkBonuses?.extraTaggedSkills) || 0;
    const totalExtraSlots = extraSkillsFromTrait + extraSkillsFromPerkVal;
    if (
      totalExtraSlots > 0 &&
      extraTaggedSkills.length !== totalExtraSlots
    ) {
      showError(
        tCharacterScreen("errors.exactExtraSkillsRequired").replace("{required}", String(totalExtraSlots)).replace("{selected}", String(extraTaggedSkills.length)),
      );
      return;
    }
    const { isValid, maxRank } = validateSkills(skills, trait);

    if (!isValid) {
      showAlert(tCharacterScreen("errors.maxSkillRank").replace("{maxRank}", String(maxRank)));
      return;
    }

    setSkillsSaved(true);

    // Награды за выбранные навыки — молча добавляем в инвентарь.
    try {
      const allSkillKeys = [...selectedSkills, ...extraTaggedSkills];
      if (allSkillKeys.length > 0) {
        // AmmoId берём прямо из стора — комплект уже резолвился при выборе,
        // патроны лежат среди items. Никаких index.json и сканирования файлов.
        const storeItems = Object.values(useCharacterStore.getState().items);
        const ammoItem = storeItems.find(i => i.itemType === 'ammo');
        const { items: rewardItems, caps: rewardCaps } = await resolveSkillRewards(allSkillKeys, { ammoFromKit: ammoItem?.id || null });
        const { addNewItem } = useCharacterStore.getState();
        rewardItems.forEach(item => addNewItem(item));
        // Крышки (BARTER) — в счётчик, как у комплектов; в инвентаре им не место.
        if (rewardCaps) setCaps(prev => prev + rewardCaps);
      }
    } catch (e) {
      console.warn('skillRewards:', e?.message);
    }
  };

  const handleResetAttributes = () => {
    setResetType("attributes");
    setShowResetWarning(true);
  };

  const handleResetSkills = () => {
    setResetType("skills");
    setShowResetWarning(true);
  };

  const handleLevelChange = (delta) => {
    const newLevel = Math.max(1, level + delta);

    if (newLevel > level && attributesSaved) {
      setSkillsSaved(false);
    }

    setLevel(newLevel);
  };

  const confirmReset = () => {
    if (resetType === "attributes" || resetType === "all") {
      resetCharacter();
    } else if (resetType === "skills") {
      const newSkills = ALL_SKILLS.map((skill) => ({
        ...skill,
        value: forcedSelectedSkills.includes(skill.name) ? 2 : 0,
      }));
      setSkills(newSkills);
      setSelectedSkills([]);
      setExtraTaggedSkills([...forcedSelectedSkills]);
      setSkillsSaved(false);
    }
    setShowResetWarning(false);
  };

  const cancelReset = () => {
    setShowResetWarning(false);
  };

  // Получаем компонент модального окна для черты
  const TraitModalComponent = origin
    ? getTraitModalComponent(origin.id)
    : null;

  return (
    <ImageBackground
      source={require("../../../assets/bg.png")}
      style={styles.background}
      imageStyle={{ opacity: 0.3 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            {/* Строка для ввода имени персонажа */}
            <View style={styles.nameInputRow}>
              <Text style={styles.nameInputLabel}>{tCharacterScreen("labels.characterName")}:</Text>
              <TextInput
                style={[styles.nameInput, !isSaved && styles.nameInputActive]}
                placeholder={tCharacterScreen("placeholders.enterName")}
                placeholderTextColor="#999"
                value={characterName}
                onChangeText={setCharacterName}
                editable={!isSaved}
              />
              {!isSaved && (
                <TouchableOpacity
                  style={[
                    styles.saveNameButton,
                    characterName.length > 0
                      ? styles.saveNameButtonActive
                      : styles.saveNameButtonDisabled,
                  ]}
                  onPress={() => {
                    saveCharacter(characterName.trim() || tCharacterScreen('defaultCharacterName'));
                  }}
                  disabled={false}
                >
                  <Text
                    style={[
                      styles.saveNameButtonText,
                      characterName.length === 0
                        ? styles.saveNameButtonTextDisabled
                        : {},
                    ]}
                  >
                    {tCharacterScreen("buttons.save")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Если имя не сохранено, показываем затемняющий слой */}
            {!isSaved && <View style={styles.disabledOverlay} />}

            <PressableRow
              title={tCharacterScreen("labels.origin")}
              value={localizedOrigin ? localizedOrigin.name : tCharacterScreen("placeholders.selectNone")}
              onPress={() => setIsOriginModalVisible(true)}
              disabled={!isSaved}
            />
            <PressableRow
              title={tCharacterScreen("labels.trait")}
              value={localizedTraitName || tCharacterScreen("placeholders.selectNone")}
              onPress={handleTraitPress}
              disabled={!isSaved || (trait && !isMultiTraitOrigin(origin?.id))}
            />
            <PressableRow
              title={tCharacterScreen("labels.equipmentKit")}
              value={localizedEquipmentName || tCharacterScreen("placeholders.selectNone")}
              disabled={!isSaved}
              onPress={() => {
                if (localizedOrigin && localizedOrigin.equipmentKits) {
                  if (equipment) {
                    // Если снаряжение уже выбрано, показываем предупреждение
                    if (Platform.OS === "web") {
                      if (
                        window.confirm(
                          tCharacterScreen("warnings.equipmentResetOnWeb"),
                        )
                      ) {
                        // Сбрасываем инвентарь и надетые предметы
                        setEquippedWeapons([]);
                        setEquippedRobotSlots(null);
                        setEquippedRobotModules([]);
                        setEquippedArmor(createEmptyEquippedArmor());
                        setCaps(0);
                        setEquipment(null);
                        setIsEquipmentKitModalVisible(true);
                      }
                    } else {
                      Alert.alert(
                          tCharacterScreen("warnings.attentionTitle"),
                          tCharacterScreen("warnings.equipmentResetConfirm"),
                        [
                          { text: tCharacterScreen("buttons.cancel"), style: "cancel" },
                          {
                            text: tCharacterScreen("buttons.continue"),
                            onPress: () => {
                              // Сбрасываем инвентарь и надетые предметы
                              setEquippedWeapons([]);
                              setEquippedRobotSlots(null);
                              setEquippedRobotModules([]);
                              setEquippedArmor(createEmptyEquippedArmor());
                              setCaps(0);
                              setEquipment(null);
                              setIsEquipmentKitModalVisible(true);
                            },
                          },
                        ],
                      );
                    }
                  } else {
                    setIsEquipmentKitModalVisible(true);
                  }
                } else {
                  showAlert(
                    tCharacterScreen("alerts.infoTitle"),
                    tCharacterScreen("warnings.noEquipmentForOrigin"),
                  );
                }
              }}
            />
            <View style={[styles.levelContainer, !isSaved && styles.disabledLevelContainer]}>
              <Text style={styles.levelLabel}>{tCharacterScreen("labels.level")}:</Text>
              <CompactCounter
                value={level}
                onIncrease={() => isSaved && handleLevelChange(1)}
                onDecrease={() => isSaved && handleLevelChange(-1)}
              />
            </View>
          </View>

          <View style={styles.columnsContainer}>
            <View style={styles.leftColumn}>
              <AttributesSection
                attributes={displayAttributes}
                onAttributeChange={
                  isPerkAttributeMode
                    ? handleTempAttributeChange
                    : handleChangeAttribute
                }
                remainingAttributePoints={remainingAttributePoints}
                attributesSaved={attributesSaved}
                onSaveAttributes={handleSaveAttributes}
                onResetAttributes={handleResetAttributes}
                trait={trait}
                isPerkMode={isPerkAttributeMode}
                onApplyPerkAttributes={handleSavePerkAttributes}
                baseAttributes={isPerkAttributeMode ? attributes : null}
              />
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{tCharacterScreen("labels.luckPoints").toUpperCase()}</Text>
                </View>
                <LuckPointsRow
                  luckPoints={luckPoints}
                  maxLuckPoints={maxLuckPoints}
                  onSpend={handleSpendLuckPoint}
                  onRestore={handleRestoreLuckPoint}
                />
              </View>

              <ImageSection origin={origin} />
            </View>

            <View style={styles.rightColumn}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{tCharacterScreen("labels.skills").toUpperCase()}</Text>
                  {attributesSaved && !skillsSaved && (
                    <Text style={styles.skillsCount}>
                      {tCharacterScreen("labels.available")}: {skillPointsLeft} {tCharacterScreen("labels.pointsShort")}
                    </Text>
                  )}
                </View>
                {attributesSaved && !skillsSaved && (() => {
                  const extraSkillsFromTrait = trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
                  const extraSkillsFromPerkDisp = Number(storePerkBonuses?.extraTaggedSkills) || 0;
                  const totalExtraSlotsDisp = extraSkillsFromTrait + extraSkillsFromPerkDisp;
                  const taggedCount = selectedSkills.length;
                  const extraCount = extraTaggedSkills.length;
                  return (
                    <>
                      <Text style={styles.taggedSkillsHint}>
                        {tCharacterScreen("labels.taggedSkills")}: {taggedCount}/{BASE_TAGGED_SKILLS}
                      </Text>
                      {totalExtraSlotsDisp > 0 && (
                        <Text style={styles.taggedSkillsHint}>
                          {tCharacterScreen("labels.extraTaggedSkills")}: {extraCount}/{totalExtraSlotsDisp}
                        </Text>
                      )}
                    </>
                  );
                })()}
                <View style={styles.skillsHeader}>
                  <Text style={styles.skillsHeaderText}>{tCharacterScreen("labels.skill")}</Text>
                  <Text style={styles.skillsHeaderText}>{tCharacterScreen("labels.value")}</Text>
                </View>

                {(() => {
                  const skillPickGroup = trait?.modifiers?.skillPickChoice?.from || [];
                  const skillPickSelected = trait?.modifiers?.skillPickSelected || [];
                  const isSkillPickActive = skillPickGroup.length > 0 && skillPickSelected.length > 0;
                  return skills.map((skill, index) => {
                    const isTagged =
                      selectedSkills.includes(skill.name) ||
                      extraTaggedSkills.includes(skill.name);
                    const isForced =
                      forcedSelectedSkills.includes(skill.name) && isTagged;
                    const isSkillPickCapped =
                      isSkillPickActive &&
                      skillPickGroup.includes(skill.name) &&
                      !skillPickSelected.includes(skill.name);
                    const baseMax = level === 1 ? 3 : 6;
                    const maxValue = isSkillPickCapped ? Math.min(baseMax, 4) : baseMax;
                    const isMaxReached = skill.value >= maxValue;
                    const rowStyle =
                      index % 2 === 0 ? styles.evenRow : styles.oddRow;

                    return (
                      <SkillRow
                        key={index}
                        name={getSkillDisplayName(skill.name)}
                        value={skill.value}
                        isSelected={isTagged}
                        isMaxReached={isMaxReached}
                        isForced={isForced}
                        onToggle={() => handleToggleSkill(skill.name)}
                        onIncrease={() => handleChangeSkillValue(index, 1)}
                        onDecrease={() => handleChangeSkillValue(index, -1)}
                        rowStyle={rowStyle}
                        disabled={!canDistributeSkills}
                        trait={trait}
                        italic={isSkillPickCapped}
                        increaseDisabled={skillPointsLeft <= 0}
                      />
                    );
                  });
                })()}

                {attributesSaved && !skillsSaved && (
                  <View style={styles.buttonsContainer}>
                    <TouchableOpacity
                      style={[styles.button, styles.saveButton]}
                      onPress={handleSaveSkills}
                    >
                      <Text style={styles.buttonText}>{tCharacterScreen("buttons.save")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.resetButton]}
                      onPress={handleResetSkills}
                    >
                      <Text style={styles.buttonText}>{tCharacterScreen("buttons.reset")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        <OriginModal
          isVisible={isOriginModalVisible}
          origins={loadEnrichedOrigins()}
          selectedOrigin={selectedOrigin}
          onSelectOrigin={setSelectedOrigin}
          onClose={() => {
            setIsOriginModalVisible(false);
            setSelectedOrigin(null);
          }}
          onConfirm={() => {
            if (selectedOrigin) {
              confirmOriginSelection(selectedOrigin);
            } else {
              showError(tCharacterScreen("warnings.selectOriginError"));
            }
          }}
        />

        <ResetConfirmationModal
          visible={showResetWarning}
          onCancel={cancelReset}
          onConfirm={confirmReset}
        />

        <EquipmentKitModal
          visible={isEquipmentKitModalVisible}
          onClose={() => setIsEquipmentKitModalVisible(false)}
          equipmentKits={localizedOrigin?.equipmentKits || origin?.equipmentKits}
          onSelectKit={handleSelectKit}
          setCaps={setCaps}
          character={{ origin, trait }}
        />

        {/* Модальное окно для выбора черты */}
        {TraitModalComponent && (
          <TraitModalComponent
            visible={isTraitModalVisible}
            onClose={() => setIsTraitModalVisible(false)}
            onSelect={handleSelectTrait}
            currentTrait={trait}
            skills={skills}
            origin={origin}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}
