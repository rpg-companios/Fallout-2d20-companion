import React, { useState, useEffect } from "react";
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
import OriginModal from "./modals/OriginModal";
import TraitSkillModal from "./modals/TraitSkillModal";
import EquipmentKitModal from "./modals/EquipmentKitModal";
import { ORIGINS } from "./logic/originsData";
import { loadTraitsData } from "../../../domain/traits";
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
} from "../../../domain/characterCreation";
import {
  getSkillDisplayName,
  tCharacterScreen,
} from "./logic/characterScreenI18n";
import { getCurrentLocale } from "../../../i18n/locale";
import { AttributesSection } from "./AttributesSection";
import styles from "../../../styles/CharacterScreen.styles";
import { getTimedAttributeModifiers } from "../../../domain/effects";

// Определяем константу BASE_TAGGED_SKILLS для исправления ReferenceError
const BASE_TAGGED_SKILLS = 3; // Максимальное количество основных навыков
const GOOD_SOUL_SKILL_KEYS = ["SPEECH", "MEDICINE", "REPAIR", "SCIENCE", "BARTER"];
const getGoodSoulSkillNames = () => GOOD_SOUL_SKILL_KEYS.map((key) => tCharacterScreen(`skillsCatalog.${key}`, key));

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
        <Text style={styles.modalTitle}>{tCharacterScreen("warnings.attentionTitle", "Attention!")}</Text>
        <Text style={styles.modalText}>
          {tCharacterScreen("warnings.resetAllValues", "All values will be reset to initial parameters.")}
        </Text>
        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={onCancel}
          >
            <Text style={styles.buttonText}>{tCharacterScreen("buttons.cancel", "Cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={onConfirm}
          >
            <Text style={styles.buttonText}>{tCharacterScreen("buttons.agree", "Agree")}</Text>
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
        value === tCharacterScreen("placeholders.selectNone", "Not selected") &&
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
    attributes,
    setAttributes,
    skills,
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
    activeTimedEffects,
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
  } = useCharacter();

  const [isOriginModalVisible, setIsOriginModalVisible] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [showTraitSkillModal, setShowTraitSkillModal] = useState(false);
  const [isTraitModalVisible, setIsTraitModalVisible] = useState(false);
  const [isEquipmentKitModalVisible, setIsEquipmentKitModalVisible] =
    useState(false);

  const [showResetWarning, setShowResetWarning] = useState(false);
  const [resetType, setResetType] = useState(null);
  const [goodSoulPickerVisible, setGoodSoulPickerVisible] = useState(false);
  const [goodSoulPicks, setGoodSoulPicks] = useState([]);

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
    showAlert(tCharacterScreen("alerts.errorTitle", "Error"), message);
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
  const displayAttributes = (!isPerkAttributeMode && attributesSaved)
    ? currentAttributes.map((attr) => ({
      ...attr,
      value: attr.value + (timedAttributeModifiers[getCanonicalAttributeKey(attr.name)] || 0),
    }))
    : currentAttributes;

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
      showError(tCharacterScreen("errors.distributeAllPerkAttributePoints", "You must distribute all available attribute points."));
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
    setEquipment({
      name: kit.name,
      weight: kit.weight,
      price: kit.price,
      items: kit.items,
    });
    setCaps((prev) => prev + (kit.caps || 0));

    // Robot: apply slot/weapon/module state from initRobotSlots
    if (kit.robotSlots) {
      setEquippedRobotSlots(kit.robotSlots);
      setEquippedRobotModules(kit.robotModules || []);
      setEquippedWeapons(kit.robotWeapons || []);
    } else {
      // Human: ensure unarmed_human is in equippedWeapons
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
    if (!canDistributeSkills && !showTraitSkillModal) {
      showAlert(tCharacterScreen("alerts.warningTitle", "Warning"), tCharacterScreen("errors.saveAttributesFirst", "Distribute and save attributes first."));
      return;
    }

    const skillIndex = skills.findIndex((s) => s.name === skillName);
    const currentSkill = skills[skillIndex];

    // Check current state
    const isInMainSkills = selectedSkills.includes(skillName);
    const isInExtraSkills = extraTaggedSkills.includes(skillName);
    const isForcedSkill = forcedSelectedSkills.includes(skillName);
    const isCurrentlySelected = isInMainSkills || isInExtraSkills;

    // Cannot deselect forced skills
    if (isForcedSkill && isCurrentlySelected) {
      showError(tCharacterScreen("errors.cannotUnselectForcedSkill", "You cannot unselect a forced skill."));
      return;
    }

    // Skill max value checks
    let skillMax = trait?.modifiers?.skillMaxValue ?? 6;
    if (level === 1) {
      skillMax = Math.min(skillMax, 3);
    }

    // Good Soul special handling
    const goodSoulGroup = getGoodSoulSkillNames();
    const isGoodSoul =
      Array.isArray(trait?.modifiers?.goodSoulSelectedSkills) &&
      trait.modifiers.goodSoulSelectedSkills.length > 0;
    const goodSoulSelected = trait?.modifiers?.goodSoulSelectedSkills || [];
    const isBonusFromGoodSoul =
      isGoodSoul && goodSoulSelected.includes(skillName);

    // Get trait extra skill info
    const extraSkillsFromTrait =
      trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
    const traitForcedSkills = trait?.forcedSkills || [];

    // Check if this skill can be selected as an extra skill
    const canSelectAsExtra =
      extraSkillsFromTrait > 0 &&
      (traitForcedSkills.length === 0 || traitForcedSkills.includes(skillName));

    if (!isCurrentlySelected) {
      // SELECTING A NEW SKILL

      // Check skill max limit
      if (currentSkill.value + 2 > skillMax) {
        showError(
          tCharacterScreen("errors.skillTagExceedsMaxRank", "Tagging this skill will exceed max rank ({skillMax}). Lower it first.").replace("{skillMax}", String(skillMax)),
        );
        return;
      }

      // Handle Good Soul bonus skills (don't count toward main or extra limits)
      if (isBonusFromGoodSoul) {
        // This is handled by trait modal, should not reach here normally
        return;
      }

      // Forced skills go to extra pool
      if (isForcedSkill) {
        setExtraTaggedSkills((prev) => [...prev, skillName]);
      }
      // Try main skills first (max 3)
      else if (selectedSkills.length < BASE_TAGGED_SKILLS) {
        setSelectedSkills((prev) => [...prev, skillName]);
      }
      // Try extra skills if available
      else if (
        canSelectAsExtra &&
        extraTaggedSkills.length < extraSkillsFromTrait
      ) {
        setExtraTaggedSkills((prev) => [...prev, skillName]);
      }
      // No slots available
      else {
        const extraText = canSelectAsExtra
          ? `\n\n${tCharacterScreen("labels.extraSlotsAvailable", "Extra slots available")}: ${extraSkillsFromTrait - extraTaggedSkills.length}`
          : "";
        showError(
          tCharacterScreen("errors.maxBaseSkills", "You can choose a maximum of {count} base skills.{extraText}").replace("{count}", String(BASE_TAGGED_SKILLS)).replace("{extraText}", extraText),
        );
        return;
      }

      // Apply +2 to skill value
      setSkills((prev) =>
        prev.map((s, i) => {
          if (i !== skillIndex) return s;
          let next = s.value + 2;
          // Good Soul group cap
      if (isGoodSoul && goodSoulGroup.includes(s.name) && !isBonusFromGoodSoul) {
            next = Math.min(next, 4);
          }
          return { ...s, value: next };
        }),
      );
    } else {
      // DESELECTING A SKILL

      // Remove from appropriate pool
      if (isInMainSkills) {
        setSelectedSkills((prev) => prev.filter((s) => s !== skillName));
      }
      if (isInExtraSkills) {
        setExtraTaggedSkills((prev) => prev.filter((s) => s !== skillName));
      }

      // Apply -2 to skill value
      setSkills((prev) =>
        prev.map((s, i) => {
          if (i !== skillIndex) return s;
          return { ...s, value: Math.max(0, s.value - 2) };
        }),
      );
    }
  };

  const handleChangeSkillValue = (index, delta) => {
    if (!attributesSaved) {
      showAlert(tCharacterScreen("errors.saveAttributesFirstSimple", "Save attributes first."));
      return;
    }

    if (delta > 0 && skillPointsLeft <= 0) {
      showError(tCharacterScreen("errors.noSkillPointsLeft", "You have no skill points left to distribute."));
      return;
    }

    setSkills((prev) => {
      const newSkills = [...prev];
      const skill = newSkills[index];
      const isTagged =
        selectedSkills.includes(skill.name) ||
        extraTaggedSkills.includes(skill.name);

      // Ограничение от "Добрая Душа": навыки из группы capped 4, кроме двух бонусных
      const goodSoulGroup = getGoodSoulSkillNames();
      const isGoodSoul =
        Array.isArray(trait?.modifiers?.goodSoulSelectedSkills) &&
        trait.modifiers.goodSoulSelectedSkills.length > 0;
      const isInGroup = goodSoulGroup.includes(skill.name);
      const isBonus =
        isGoodSoul &&
        (trait?.modifiers?.goodSoulSelectedSkills || []).includes(skill.name);
      const capForThis = isGoodSoul && isInGroup && !isBonus ? 4 : undefined;

      if (canChangeSkillValue(skill.value, delta, trait, level, isTagged)) {
        let nextVal = skill.value + delta;
        if (capForThis !== undefined) {
          nextVal = Math.min(nextVal, capForThis);
        }
        newSkills[index] = { ...skill, value: nextVal };
      }
      return newSkills;
    });
  };

  const handleChangeAttribute = (index, delta) => {
    setAttributes((prev) => {
      const newAttributes = [...prev];
      const attr = newAttributes[index];
      const { min, max } = getAttributeLimits(trait, attr.name);

      const newValue = attr.value + delta;
      if (newValue >= min && newValue <= max) {
        if (delta > 0 && remainingInitialPoints <= 0) return prev;
        newAttributes[index] = { ...attr, value: newValue };
      }

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
        window.confirm(`${tCharacterScreen("warnings.changeOriginTitle", "Change origin?")}\n\n${tCharacterScreen("warnings.changeOriginConfirm", "All your attributes, skills, and traits will be reset. Are you sure?")}`)
      ) {
        confirmAndReset();
      }
    } else {
      Alert.alert(
        tCharacterScreen("warnings.changeOriginTitle", "Change origin?"),
        tCharacterScreen("warnings.changeOriginConfirm", "All your attributes, skills, and traits will be reset. Are you sure?"),
        [
          { text: tCharacterScreen("buttons.cancel", "Cancel"), style: "cancel" },
          {
            text: tCharacterScreen("buttons.yesReset", "Yes, reset"),
            onPress: confirmAndReset,
            style: "destructive",
          },
        ],
      );
    }
  };

  const handleSelectTrait = (traitName, newModifiersFromModal) => {
    // traitName — локализованное имя черты из модала
    // Комбинируем с модификаторами из модального окна
    const newTrait = {
      name: traitName,
      modifiers: {
        ...(newModifiersFromModal || {}),
      },
    };

    const oldTrait = trait; // Запоминаем старую черту

    // Атомарно обновляем все состояния, отменяя старые и применяя новые модификаторы
    setAttributes((currentAttributes) => {
      const oldAttrMods = normalizeAttributeMap(
        oldTrait?.modifiers?.attributes || {},
      );
      const newAttrMods = normalizeAttributeMap(
        newTrait?.modifiers?.attributes || {},
      );
      // Сначала отменяем старые модификаторы
      let tempAttrs = currentAttributes.map((attr) => ({
        ...attr,
        value:
          attr.value - (oldAttrMods[getCanonicalAttributeKey(attr.name)] || 0),
      }));
      // Затем применяем новые
      return tempAttrs.map((attr) => ({
        ...attr,
        value:
          attr.value + (newAttrMods[getCanonicalAttributeKey(attr.name)] || 0),
      }));
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

    setSkills((currentSkills) => {
      let tempSkills = [...currentSkills];
      // Отменяем +2 от старых обязательных навыков
      [...oldForcedSkills, ...oldSelectedExtraSkills].forEach((skillName) => {
        const index = tempSkills.findIndex((s) => s.name === skillName);
        if (index > -1) {
          tempSkills[index] = {
            ...tempSkills[index],
            value: Math.max(0, tempSkills[index].value - 2),
          };
        }
      });
      // Применяем +2 к новым об��зательным навыкам (если их значение < 2)
      [...newForcedSkills, ...newSelectedExtraSkills].forEach((skillName) => {
        const index = tempSkills.findIndex((s) => s.name === skillName);
        if (index > -1 && tempSkills[index].value < 2) {
          tempSkills[index] = { ...tempSkills[index], value: 2 };
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

    // Если черта «Добрая Душа» — открываем отдельное окно выбора 2 навыков
    if (newTrait?.modifiers?.goodSoulPending) {
      setGoodSoulPicks([]);
      setGoodSoulPickerVisible(true);
    }
  };

  const goodSoulGroup = getGoodSoulSkillNames();

  const toggleGoodSoulPick = (skill) => {
    setGoodSoulPicks((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= 2) return prev;
      return [...prev, skill];
    });
  };

  const handleConfirmGoodSoulSkills = () => {
    if (goodSoulPicks.length !== 2) return;
    const picks = [...goodSoulPicks];

    setTrait((prev) => {
      if (!prev) return prev;
      const prevMods = prev.modifiers || {};
      const newMods = {
        ...prevMods,
        goodSoulPending: false,
        goodSoulSelectedSkills: picks,
        goodSoulGroup: [...goodSoulGroup],
        forcedSkills: [...new Set([...(prevMods.forcedSkills || []), ...picks])],
        extraSkills: (prevMods.extraSkills || 0) + picks.length,
      };
      return { ...prev, modifiers: newMods };
    });

    setForcedSelectedSkills((prev) => [...new Set([...prev, ...picks])]);
    setExtraTaggedSkills((prev) => [...new Set([...prev, ...picks])]);
    setSkills((prev) =>
      prev.map((s) => (picks.includes(s.name) && s.value < 2 ? { ...s, value: 2 } : s))
    );
    setGoodSoulPicks([]);
    setGoodSoulPickerVisible(false);
  };

  // Обработчик нажатия на строку черты
  const handleTraitPress = () => {
    if (!origin) {
      showError(tCharacterScreen("warnings.selectOriginFirst", "Select origin first"));
      return;
    }

    // Блокируем, если черта уже выбрана и происхождение не предполагает нескольких черт
    if (trait && !isMultiTraitOrigin(origin.id)) {
      showAlert(tCharacterScreen("alerts.infoTitle", "Info"), tCharacterScreen("warnings.traitAlreadySelected", "Trait for this origin is already selected."));
      return;
    }

    const availableTraits = getTraitsForOrigin(origin);
    if (availableTraits.length === 0) {
      showAlert(tCharacterScreen("alerts.infoTitle", "Info"), tCharacterScreen("warnings.noTraitsForOrigin", "No traits available for this origin"));
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

  const handleTraitSkillSelect = (skill) => {
    setForcedSelectedSkills((prev) => [...new Set([...prev, skill])]);
    setSelectedSkills((prev) => [...new Set([...prev, skill])]);

    setSkills((prev) => {
      const skillIndex = prev.findIndex((s) => s.name === skill);
      if (skillIndex > -1) {
        const newSkills = [...prev];
        const currentSkill = newSkills[skillIndex];
        if (currentSkill.value < 2) {
          newSkills[skillIndex] = { ...currentSkill, value: 2 };
        }
        return newSkills;
      }
      return prev;
    });

    setShowTraitSkillModal(false);
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
      showError(tCharacterScreen("errors.originRequired", "You must select an origin."));
      return;
    }
    if (!trait) {
      showError(tCharacterScreen("errors.traitRequired", "You must select a trait."));
      return;
    }
    if (!equipment) {
      showError(tCharacterScreen("errors.equipmentRequired", "You must select an equipment kit."));
      return;
    }
    if (remainingAttributePoints !== 0) {
      showError(tCharacterScreen("errors.spendAllAttributePoints", "Spend all attribute points before saving."));
      return;
    }

    const initialMaxHealth = calculateMaxHealth(attributes, level);
    setCurrentHealth(initialMaxHealth);
    setAttributesSaved(true);
    setSkillsSaved(false);
  };

  const handleSaveSkills = () => {
    if (!origin) {
      showError(tCharacterScreen("errors.originRequired", "You must select an origin."));
      return;
    }
    if (!trait) {
      showError(tCharacterScreen("errors.traitRequired", "You must select a trait."));
      return;
    }
    if (!equipment) {
      showError(tCharacterScreen("errors.equipmentRequired", "You must select an equipment kit."));
      return;
    }
    if (skillPointsLeft > 0) {
      showError(tCharacterScreen("errors.spendAllSkillPoints", "You must distribute all skill points."));
      return;
    }
    // Проверяем, что выбрано правильное количество навыков
    const extraSkillsFromTrait =
      trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
    const goodSoulSelected = trait?.modifiers?.goodSoulSelectedSkills || [];

    // Проверяем основные навыки (всегда должно быть ровно 3)
    if (selectedSkills.length !== BASE_TAGGED_SKILLS) {
      showError(
        tCharacterScreen("errors.exactBaseSkillsRequired", "You must select exactly {required} base skills. Selected: {selected}.").replace("{required}", String(BASE_TAGGED_SKILLS)).replace("{selected}", String(selectedSkills.length)),
      );
      return;
    }

    // Проверяем экстра навыки от черт
    if (
      extraSkillsFromTrait > 0 &&
      extraTaggedSkills.length !== extraSkillsFromTrait
    ) {
      showError(
        tCharacterScreen("errors.exactExtraSkillsRequired", "You must select {required} extra trait skills. Selected: {selected}.").replace("{required}", String(extraSkillsFromTrait)).replace("{selected}", String(extraTaggedSkills.length)),
      );
      return;
    }
    const { isValid, maxRank } = validateSkills(skills, trait);

    if (!isValid) {
      showAlert(tCharacterScreen("errors.maxSkillRank", "Error: maximum skill rank is {maxRank}").replace("{maxRank}", String(maxRank)));
      return;
    }

    setSkillsSaved(true);
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
              <Text style={styles.nameInputLabel}>{tCharacterScreen("labels.characterName", "Name")}:</Text>
              <TextInput
                style={[styles.nameInput, !isSaved && styles.nameInputActive]}
                placeholder={tCharacterScreen("placeholders.enterName", "Enter name")}
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
                    saveCharacter(characterName.trim() || 'Персонаж');
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
                    {tCharacterScreen("buttons.save", "Save")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Если имя не сохранено, показываем затемняющий слой */}
            {!isSaved && <View style={styles.disabledOverlay} />}

            <PressableRow
              title={tCharacterScreen("labels.origin", "Origin")}
              value={origin ? origin.name : tCharacterScreen("placeholders.selectNone", "Not selected")}
              onPress={() => setIsOriginModalVisible(true)}
              disabled={!isSaved}
            />
            <PressableRow
              title={tCharacterScreen("labels.trait", "Trait")}
              value={trait ? trait.name : tCharacterScreen("placeholders.selectNone", "Not selected")}
              onPress={handleTraitPress}
              disabled={!isSaved || (trait && !isMultiTraitOrigin(origin?.id))}
            />
            <PressableRow
              title={tCharacterScreen("labels.equipmentKit", "Equipment kit")}
              value={equipment ? equipment.name : tCharacterScreen("placeholders.selectNone", "Not selected")}
              disabled={!isSaved}
              onPress={() => {
                if (origin && origin.equipmentKits) {
                  if (equipment) {
                    // Если снаряжение уже выбрано, показываем предупреждение
                    if (Platform.OS === "web") {
                      if (
                        window.confirm(
                          tCharacterScreen("warnings.equipmentResetOnWeb", "Attention! Choosing a new equipment kit will reset current inventory. Continue?"),
                        )
                      ) {
                        // Сбрасываем инвентарь и надетые предметы
                        setEquippedWeapons([]);
                        setEquippedRobotSlots(null);
                        setEquippedRobotModules([]);
                        setEquippedArmor({
                          head: { armor: null, clothing: null },
                          body: { armor: null, clothing: null },
                          leftArm: { armor: null, clothing: null },
                          rightArm: { armor: null, clothing: null },
                          leftLeg: { armor: null, clothing: null },
                          rightLeg: { armor: null, clothing: null },
                        });
                        setCaps(0);
                        setEquipment(null);
                        setIsEquipmentKitModalVisible(true);
                      }
                    } else {
                      Alert.alert(
                          tCharacterScreen("warnings.attentionTitle", "Attention!"),
                          tCharacterScreen("warnings.equipmentResetConfirm", "Inventory and all equipment will be reset. Continue?"),
                        [
                          { text: tCharacterScreen("buttons.cancel", "Cancel"), style: "cancel" },
                          {
                            text: tCharacterScreen("buttons.continue", "Continue"),
                            onPress: () => {
                              // Сбрасываем инвентарь и надетые предметы
                              setEquippedWeapons([]);
                              setEquippedRobotSlots(null);
                              setEquippedRobotModules([]);
                              setEquippedArmor({
                                head: { armor: null, clothing: null },
                                body: { armor: null, clothing: null },
                                leftArm: { armor: null, clothing: null },
                                rightArm: { armor: null, clothing: null },
                                leftLeg: { armor: null, clothing: null },
                                rightLeg: { armor: null, clothing: null },
                              });
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
                    tCharacterScreen("alerts.infoTitle", "Info"),
                    tCharacterScreen("warnings.noEquipmentForOrigin", "No equipment kits for this origin."),
                  );
                }
              }}
            />
            <View style={[styles.levelContainer, !isSaved && styles.disabledLevelContainer]}>
              <Text style={styles.levelLabel}>{tCharacterScreen("labels.level", "Level")}:</Text>
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
                  <Text style={styles.sectionTitle}>{tCharacterScreen("labels.luckPoints", "Luck points").toUpperCase()}</Text>
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
                  <Text style={styles.sectionTitle}>{tCharacterScreen("labels.skills", "Skills").toUpperCase()}</Text>
                  {attributesSaved && !skillsSaved && (
                    <Text style={styles.skillsCount}>
                      {tCharacterScreen("labels.available", "Available")}: {skillPointsLeft} {tCharacterScreen("labels.pointsShort", "points")}
                    </Text>
                  )}
                </View>
                {attributesSaved && !skillsSaved && (() => {
                  const extraSkillsFromTrait = trait?.extraSkills || trait?.modifiers?.extraSkills || 0;
                  const taggedCount = selectedSkills.length;
                  const extraCount = extraTaggedSkills.length;
                  return (
                    <>
                      <Text style={styles.taggedSkillsHint}>
                        {tCharacterScreen("labels.taggedSkills", "Tagged skills")}: {taggedCount}/{BASE_TAGGED_SKILLS}
                      </Text>
                      {extraSkillsFromTrait > 0 && (
                        <Text style={styles.taggedSkillsHint}>
                          {tCharacterScreen("labels.extraTaggedSkills", "Extra trait skills")}: {extraCount}/{extraSkillsFromTrait}
                        </Text>
                      )}
                    </>
                  );
                })()}
                <View style={styles.skillsHeader}>
                  <Text style={styles.skillsHeaderText}>{tCharacterScreen("labels.skill", "Skill")}</Text>
                  <Text style={styles.skillsHeaderText}>{tCharacterScreen("labels.value", "Value")}</Text>
                </View>

                {(() => {
                  const goodSoulGroupSkills = getGoodSoulSkillNames();
                  const goodSoulSelected = trait?.modifiers?.goodSoulSelectedSkills || [];
                  const isGoodSoulActive = Array.isArray(goodSoulSelected) && goodSoulSelected.length > 0;
                  return skills.map((skill, index) => {
                    const isTagged =
                      selectedSkills.includes(skill.name) ||
                      extraTaggedSkills.includes(skill.name);
                    const isForced =
                      forcedSelectedSkills.includes(skill.name) && isTagged;
                    const isGoodSoulCapped =
                      isGoodSoulActive &&
                      goodSoulGroupSkills.includes(skill.name) &&
                      !goodSoulSelected.includes(skill.name);
                    const baseMax = level === 1 ? 3 : 6;
                    const maxValue = isGoodSoulCapped ? Math.min(baseMax, 4) : baseMax;
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
                        disabled={!canDistributeSkills && !showTraitSkillModal}
                        trait={trait}
                        italic={isGoodSoulCapped}
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
                      <Text style={styles.buttonText}>{tCharacterScreen("buttons.save", "Save")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, styles.resetButton]}
                      onPress={handleResetSkills}
                    >
                      <Text style={styles.buttonText}>{tCharacterScreen("buttons.reset", "Reset")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        <OriginModal
          isVisible={isOriginModalVisible}
          origins={ORIGINS}
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
              showError(tCharacterScreen("warnings.selectOriginError", "Select origin"));
            }
          }}
        />

        <ResetConfirmationModal
          visible={showResetWarning}
          onCancel={cancelReset}
          onConfirm={confirmReset}
        />

        <TraitSkillModal
          visible={showTraitSkillModal && !!trait}
          trait={trait}
          onSelect={handleTraitSkillSelect}
          onCancel={() => setShowTraitSkillModal(false)}
        />

        <EquipmentKitModal
          visible={isEquipmentKitModalVisible}
          onClose={() => setIsEquipmentKitModalVisible(false)}
          equipmentKits={origin?.equipmentKits}
          onSelectKit={handleSelectKit}
          setCaps={setCaps}
          character={{ origin, trait }}
        />

        {/* Модальное окно для выбора 2 навыков «Доброй Души» */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={goodSoulPickerVisible}
          onRequestClose={() => setGoodSoulPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>{tCharacterScreen("modals.goodSoul.title", "Good Soul: choose 2 skills")}</Text>
              <Text style={{ marginBottom: 8, textAlign: 'center' }}>
                {tCharacterScreen("modals.goodSoul.description", "Choose two skills from the group. They will be marked as extra.")}
              </Text>
              {goodSoulGroup.map((skill) => {
                const isPicked = goodSoulPicks.includes(skill);
                return (
                  <TouchableOpacity
                    key={skill}
                    style={[
                      { padding: 12, marginVertical: 4, borderRadius: 6, width: '100%', alignItems: 'center' },
                      { backgroundColor: '#2196F3' },
                      isPicked && { backgroundColor: '#1976D2', borderWidth: 2, borderColor: '#fff' },
                    ]}
                    onPress={() => toggleGoodSoulPick(skill)}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{skill}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  goodSoulPicks.length !== 2 && styles.disabledButton,
                  { marginTop: 10 },
                ]}
                disabled={goodSoulPicks.length !== 2}
                onPress={handleConfirmGoodSoulSkills}
              >
                <Text style={styles.buttonText}>{tCharacterScreen("buttons.confirm", "Confirm")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Модальное окно для выбора черты */}
        {TraitModalComponent && (
          <TraitModalComponent
            visible={isTraitModalVisible}
            onClose={() => setIsTraitModalVisible(false)}
            onSelect={handleSelectTrait}
            currentTrait={trait}
            skills={skills}
          />
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}
