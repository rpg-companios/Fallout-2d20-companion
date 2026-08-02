import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import { findTraitById, getWeaponDamageBonusFromSources } from '../../../domain/traits';
import { isRobotCharacter } from '../../../domain/origins';
import { resolveBodyPlan } from '../../../domain/bodyplan';
import styles from '../../../styles/CharacterScreen.styles';
import localStyles from '../../../styles/WeaponsAndArmorScreen.styles';
import { renderTextWithIcons } from './textUtils';
import { useLocale } from '../../../i18n/locale';
import { getEquipmentCatalog } from '../../../i18n/equipmentCatalog';
import { applyArmorMods } from '../../../domain/modsEquip';
import { getProtectionKind, PROTECTION_KINDS } from '../../../domain/protectionKind';
import { getEffectTimeText, getTimedMaxHpBonus, getTimedDamageResistanceBonus } from '../../../domain/effects';
import { resolveWeaponQualities, resolveWeaponDamageType } from '../../../domain/weaponDisplay';
import { hasPoisonImmunity, hasRadiationImmunity, getTraitImmunities, getOriginImmunities } from '../../../domain/immunities';
import { tWeaponsAndArmorScreen } from './weaponsAndArmorScreenI18n';
import { getRobotSlotKeys } from '../../../domain/robotEquip';
import {
  hasFrame,
  suppressesLayerAt,
  needsRepair,
  applyFrameAttributeModifiers,
  FUSION_CORE_ID,
} from '../../../domain/powerArmor';
import dataPowerArmor from '../../../data/equipment/powerArmor.json';

// Силовая броня: каталог механики по id (рейтинги/прочность частей, модификаторы каркаса).
const PA_CATALOG_BY_ID = Object.fromEntries(
  Object.values(dataPowerArmor).flatMap((set) => set.pieces).map((p) => [p.id, p]),
);
const PA_FRAME_CATALOG = dataPowerArmor?.frame?.pieces?.[0] || null;

// Импортируем модальное окно модификаций
import WeaponModificationModal from './modal/WeaponModificationModal';
import ArmorModificationModal from './modal/ArmorModificationModal';
import RobotSlot from './RobotSlot';
import LimbUpgradeModal from '../CharacterScreen/modals/LimbUpgradeModal';
import ArmorPickerModal from '../CharacterScreen/modals/ArmorPickerModal';
import { debugLog } from '../../../src/debug/falloutDebug';


const HealthCounter = ({ max, isEnabled, radiation = 0 }) => {
  const { currentHealth, setCurrentHealth } = useCharacter();
  const displayMax = max - radiation;
  const canDecrease = isEnabled && currentHealth > 0;
  const canIncrease = isEnabled && currentHealth < displayMax;

  const handleAdjustHealth = (amount) => {
    if (!isEnabled) return;
    if (amount > 0) {
      setCurrentHealth(prev => prev >= displayMax ? prev : Math.min(displayMax, prev + amount));
    } else {
      setCurrentHealth(prev => Math.max(0, prev + amount));
    }
  };

  const healthText = isEnabled ? `${currentHealth}/${displayMax}` : '—/—';

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

const RadiationCounter = ({ isEnabled }) => {
  const { radiation, setRadiation } = useCharacter();
  const canDecrease = isEnabled && radiation > 0;

  const handleAdjust = (amount) => {
    if (!isEnabled) return;
    setRadiation(prev => Math.max(0, prev + amount));
  };

  const text = isEnabled ? `${radiation}` : '0';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={() => handleAdjust(-1)}
        disabled={!canDecrease}
        style={[styles.counterButton, !canDecrease && { opacity: 0.5 }]}
      >
        <Text style={styles.counterButtonText}>-</Text>
      </TouchableOpacity>
      <Text style={[styles.counterValue, { minWidth: 50, textAlign: 'center' }]}>{text}</Text>
      <TouchableOpacity
        onPress={() => handleAdjust(1)}
        disabled={!isEnabled}
        style={[styles.counterButton, !isEnabled && { opacity: 0.5 }]}
      >
        <Text style={styles.counterButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const WeaponAmmoCell = ({ ammoId, qualities }) => {
  const storeItems = useCharacterStore((state) => state.items);
  const updateItem = useCharacterStore((state) => state.updateItem);

  const ammoIds = (ammoId || '').split(',').map(s => s.trim()).filter(Boolean);

  let ammoPerShot = 1;
  let parsedQ = qualities;
  if (typeof parsedQ === 'string') {
    try { parsedQ = JSON.parse(parsedQ); } catch { parsedQ = []; }
  }
  if (Array.isArray(parsedQ)) {
    const hungryQ = parsedQ.find(q => q?.qualityId === 'quality_ammo-hungry_x');
    if (hungryQ?.value != null) ammoPerShot = Math.max(1, Number(hungryQ.value) || 1);
  }

  const ammoItems = Object.values(storeItems || {}).filter(
    item => item.itemType === 'ammo' && ammoIds.includes(item.id)
  );
  const totalAmmo = ammoItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const canSpend = totalAmmo >= ammoPerShot;

  const handleSpend = () => {
    if (!canSpend) return;
    let toDeduct = ammoPerShot;
    for (const item of [...ammoItems]) {
      if (toDeduct <= 0) break;
      const qty = item.quantity || 1;
      const deduct = Math.min(qty, toDeduct);
      const newQty = qty - deduct;
      if (newQty <= 0) {
        const current = { ...useCharacterStore.getState().items };
        delete current[item.id];
        useCharacterStore.setState({ items: current });
      } else {
        updateItem(item.id, { quantity: newQty });
      }
      toDeduct -= deduct;
    }
  };

  return (
    <View style={localStyles.weaponAmmoCellContainer}>
      <TouchableOpacity
        style={[localStyles.weaponAmmoBtn, !canSpend && localStyles.weaponAmmoBtnDisabled]}
        onPress={handleSpend}
        disabled={!canSpend}
      >
        <Text style={localStyles.weaponAmmoBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={localStyles.weaponAmmoCount}>{totalAmmo}</Text>
    </View>
  );
};

// extraRows: постоянные строки (силовая броня: «Ядерный блок: n/max», эффекты каркаса) —
// рендерятся как иммунитеты, с «∞» в колонке таймера.
const EffectsPanel = ({ effects, immunities = [], extraRows = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  useLocale();

  const hasImmunities = immunities.length > 0;
  const hasEffects = (effects || []).length > 0;
  const hasExtraRows = extraRows.length > 0;
  const isEmpty = !hasImmunities && !hasEffects && !hasExtraRows;

  const immunityLabel = hasImmunities
    ? `${tWeaponsAndArmorScreen('effectsPanel.immunityPrefix')} ${immunities
        .map(key => tWeaponsAndArmorScreen(`effectsPanel.immunityTypes.${key}`) || key)
        .join(', ')}`
    : null;

  return (
    <View style={localStyles.effectsPanelContainer}>
      <TouchableOpacity style={localStyles.effectsPanelHeader} onPress={() => setIsOpen(v => !v)} activeOpacity={0.8}>
        <Text style={localStyles.effectsPanelTitle}>{tWeaponsAndArmorScreen('effectsPanel.title')}</Text>
        <Text style={localStyles.effectsPanelToggle}>{isOpen ? '−' : '+'}</Text>
      </TouchableOpacity>
      {isOpen && (
        <View style={localStyles.effectsPanelBody}>
          {isEmpty ? (
            <Text style={localStyles.effectsPanelEmpty}>{tWeaponsAndArmorScreen('effectsPanel.empty')}</Text>
          ) : (
            <>
              {extraRows.map((row) => (
                <View key={row.key} style={localStyles.effectsPanelRow}>
                  <Text style={[localStyles.effectText, localStyles.positiveEffectText]}>{row.text}</Text>
                  <Text style={localStyles.effectTimerText}>∞</Text>
                </View>
              ))}
              {immunityLabel ? (
                <View style={localStyles.effectsPanelRow}>
                  <Text style={[localStyles.effectText, localStyles.positiveEffectText]}>{immunityLabel}</Text>
                  <Text style={localStyles.effectTimerText}>∞</Text>
                </View>
              ) : null}
              {effects.map((effect) => {
                const effectText = effect.effectName || effect.effectLabel || '—';
                const isNegative = effect.effectKind === 'negative';
                return (
                  <View key={effect.id} style={localStyles.effectsPanelRow}>
                    <Text style={[localStyles.effectText, isNegative ? localStyles.negativeEffectText : localStyles.positiveEffectText]}>
                      {effectText}
                    </Text>
                    <Text style={localStyles.effectTimerText}>
                      {getEffectTimeText(effect.scenesLeft)}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}
    </View>
  );
};


// --- Reusable Components ---

const StatBox = ({ title, value, children, highlightMeleeBonus = false, disabled = false }) => (
  <View style={[localStyles.statBoxContainer, disabled && { opacity: 0.5 }]}>
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
                        {stat.custom ? stat.custom : stat.type === 'button' ? (
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
    const { hasTrait, attributes, skills, trait } = useCharacter();
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

    // Skill identity is canonical UPPER_SNAKE_CASE (SKILL_CATALOG_ORDER).
    // No localized aliases — skills[].name on main is already the canonical key.
    const findSkillValue = (skillKey) =>
      skills?.find((s) => s.name === skillKey)?.value ?? 0;

    const attrValue = getAttributeValue(attributes, mainAttr) ?? 0;
    const skillValue = findSkillValue(mainSkill);
    const successValue = attrValue + skillValue;
  
    // weaponDamageBonus — универсальный путь: сумма по всем активным источникам
    // (parent trait + выбранные sub-trait'ы NCR/Survivor + в будущем перки/chem).
    // См. docs/schema/06-modifiers.md § 1.7.
    const weaponDamageSources = [];
    if (trait) {
      const parent = findTraitById(trait.id) || trait;
      if (parent) weaponDamageSources.push(parent);
      const subIds = Array.isArray(trait?.ids) ? trait.ids
                   : Array.isArray(trait?.modifiers?.subTraitIds) ? trait.modifiers.subTraitIds
                   : [];
      for (const sid of subIds) {
        if (sid && sid !== trait.id) {
          const sub = findTraitById(sid);
          if (sub) weaponDamageSources.push(sub);
        }
      }
    }
    const weaponMatch = displayWeapon
      ? { id: displayWeapon.id ?? displayWeapon.weaponId, mainSkill: displayWeapon.mainSkill }
      : null;
    const weaponDamageBonusValue = weaponMatch
      ? getWeaponDamageBonusFromSources(weaponDamageSources, weaponMatch)
      : 0;
    const damageWithNcr = Number(displayWeapon.damage ?? 0) + weaponDamageBonusValue;
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
    const fireRateWithTrait = hasTrait('ncr-technique-of-descent') && hasLightAndEnergyEquipped && isLightOrEnergy
      ? Math.max(0, fireRateBase - 1)
      : fireRateBase;

    const rawAmmoId = displayWeapon?.ammoId ?? displayWeapon?.ammo_id ?? '';
    const effectiveAmmoId = rawAmmoId && rawAmmoId !== 'ammo_anything' ? rawAmmoId : null;

    const stats = [
      { label: tWeaponsAndArmorScreen('weapon.fields.success'), value: `${successValue}` },
      { label: tWeaponsAndArmorScreen('weapon.fields.damageType'), value: damageType },
      { label: tWeaponsAndArmorScreen('weapon.fields.damage'), value: `${visibleDamage}` },
      { label: tWeaponsAndArmorScreen('weapon.fields.effect'), value: effectsValue },
      { label: tWeaponsAndArmorScreen('weapon.fields.fireRate'), value: fireRateWithTrait },
      { label: tWeaponsAndArmorScreen('weapon.fields.range'), value: rangeValue },
      { label: tWeaponsAndArmorScreen('weapon.fields.qualities'), value: qualitiesValue },
      ...(effectiveAmmoId ? [{ label: tWeaponsAndArmorScreen('weapon.fields.ammo'), type: 'ammo', ammoId: effectiveAmmoId, qualities: displayWeapon.qualities }] : []),
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
              {stat.type === 'ammo' ? (
                <WeaponAmmoCell ammoId={stat.ammoId} qualities={stat.qualities} />
              ) : stat.type === 'button' ? (
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


const getLocalizedModifiedWeaponName = (catalog, weapon, base) => {
  const appliedModIds = Object.values(weapon?.appliedMods || {}).filter(Boolean);
  const prefixes = appliedModIds
    .map((modId) => (catalog?.weaponMods || []).find((mod) => mod.id === modId)?.prefix)
    .filter(Boolean);

  const localizedBaseName = base?.stockNames?.without || base?.name || weapon?.baseWeaponName || weapon?.name;
  return prefixes.length ? prefixes.join(' ') + ' ' + localizedBaseName : (base?.name || weapon?.name);
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
      name: getLocalizedModifiedWeaponName(catalog, weapon, base),
      baseWeaponName: base.stockNames?.without || base.name || weapon.baseWeaponName,
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
    radiation,
    // Силовая броня (docs/architecture/power-armor-plan.md §5): надетый пакет и действия.
    equippedPowerArmor,
    adjustPowerArmorDurability,
    repairPowerArmorPieceAt,
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
  // §5.6: пока надет каркас, его attributeModifier подменяет базу атрибутов
  // (каркас: СИЛА = set 11 — значение из данных, не из кода).
  const attributesEffective = useMemo(
    () => applyFrameAttributeModifiers(attributes, hasFrame(equippedPowerArmor) ? PA_FRAME_CATALOG : null),
    [attributes, equippedPowerArmor],
  );
  const initiative = calculateInitiative(attributesEffective);
  const defense = calculateDefense(attributesEffective);
  const meleeBonus = calculateMeleeBonus(attributesEffective, trait);
  const meleeBonusValue = calculateMeleeBonusValue(attributesEffective, trait);
  const maxHealth = attributesSaved ? calculateMaxHealth(attributesEffective, level) : 0;
  const timedMaxHpBonus = getTimedMaxHpBonus(activeTimedEffects);
  const effectiveMaxHealth = maxHealth + timedMaxHpBonus;
  const timedDR = getTimedDamageResistanceBonus(activeTimedEffects);
  
  const characterForImmunities = { origin, trait };
  const hasRadImmunity = hasRadiationImmunity(characterForImmunities);
  const hasPoisonImmunityValue = hasPoisonImmunity(characterForImmunities);
  const radiationIsEnabled = attributesSaved && !hasRadImmunity;
  const allImmunities = useMemo(() => {
    const combined = [
      ...getOriginImmunities(origin),
      ...getTraitImmunities(trait),
    ];
    return [...new Set(combined)];
  }, [origin, trait]);
  const equipmentCatalog = getEquipmentCatalog(locale);
  const robotBodyUpgrade = findRobotBodyUpgrade(
    equipmentCatalog,
    // Per docs/schema/02-traits.md T-1: bodyPlan lives on origin.
    // Legacy trait.modifiers.robotBodyPlan was dropped from data.
    origin?.bodyPlan,
    inventoryItems,
  );
  const localizedEquippedWeapons = equippedWeaponsForDisplay.map(
    (weapon) => findLocalizedWeapon(equipmentCatalog, weapon),
  );
  useEffect(() => {
    debugLog('weapon.display.list', {
      locale,
      equippedWeaponsForDisplay: equippedWeaponsForDisplay.map((w) => ({ id: w.id, weaponId: w.weaponId, name: w.name, damage: w.damage, fire_rate: w.fire_rate, fireRate: w.fireRate, baseWeaponName: w.baseWeaponName, appliedMods: w.appliedMods })),
      localizedEquippedWeapons: localizedEquippedWeapons.map((w) => ({ id: w.id, weaponId: w.weaponId, name: w.name, damage: w.damage, fire_rate: w.fire_rate, fireRate: w.fireRate, baseWeaponName: w.baseWeaponName, appliedMods: w.appliedMods })),
    });
  }, [locale, equippedWeaponsForDisplay, localizedEquippedWeapons]);

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
    debugLog('weapon.mod.apply.screen.start', { itemId, selectedWeaponForModification, modifiedWeapon });

    if (itemId) {
      const patch = weaponModPatchToStore(modifiedWeapon);
      debugLog('weapon.mod.apply.screen.patch', { itemId, patch });
      updateItem(itemId, patch);
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

  // ═══ Силовая броня (план §5): секция надетого пакета НАД сеткой обычной брони ═══

  // Строки для панели «Эффекты»: «Ядерный блок: n/max» + тексты эффектов каркаса.
  const powerArmorEffectRows = useMemo(() => {
    if (!hasFrame(equippedPowerArmor)) return [];
    const rows = [];
    const coreCharges = equippedPowerArmor.frame?.core?.charges;
    if (coreCharges != null) {
      const maxCharges = (equipmentCatalog?.ammoTypes || [])
        .find((entry) => entry.id === FUSION_CORE_ID)?.maxCharges;
      rows.push({
        key: 'powerArmorCore',
        text: tWeaponsAndArmorScreen('powerArmor.core').replace('{value}', `${coreCharges}/${maxCharges}`),
      });
    }
    // Тексты эффектов каркаса живут в данных; список пока пуст (книжные тексты — §9 плана).
    (PA_FRAME_CATALOG?.effects || []).forEach((text, index) => {
      rows.push({ key: `powerArmorFrameEffect_${index}`, text });
    });
    return rows;
  }, [equippedPowerArmor, equipmentCatalog]);

  const renderArmorPart = (slotKey) => {
    // Проверяем является ли персонаж роботом
    const isRobot = isRobotCharacter({ origin, trait });
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

    // Силовая броня (§5.5, ПРАВИЛО владельца): надетая часть СБ подменяет СВОЮ
    // ячейку сетки — показывает только свои параметры (нижние слои ячейки
    // подавлены). Ячейки без части показывают обычную броню/одежду как раньше.
    if (!isRobot && suppressesLayerAt(equippedPowerArmor, slotKey)) {
      const paPiece = equippedPowerArmor.pieces[slotKey];
      const paCatalogItem = PA_CATALOG_BY_ID[paPiece.catalogId];
      const paLocalized = (equipmentCatalog?.powerArmorList || []).find((p) => p.id === paPiece.catalogId);
      const paMaxHp = paCatalogItem?.hp;
      const paNeedsRepair = Number.isFinite(paMaxHp) && needsRepair(paPiece, paMaxHp);
      const paRating = (value) => (value > 0 ? value : tWeaponsAndArmorScreen('common.none'));

      const paStats = [
        { label: tWeaponsAndArmorScreen('armor.fields.physical'), value: paRating(Number(paCatalogItem?.physicalDamageRating || 0) + (timedDR.physical || 0)) },
        { label: tWeaponsAndArmorScreen('armor.fields.energy'), value: paRating(Number(paCatalogItem?.energyDamageRating || 0) + (timedDR.energy || 0)) },
        { label: tWeaponsAndArmorScreen('armor.fields.radiation'), value: hasRadImmunity ? '∞' : paRating(Number(paCatalogItem?.radiationDamageRating || 0) + (timedDR.radiation || 0)) },
        {
          label: tWeaponsAndArmorScreen('powerArmor.durability'),
          custom: (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={localStyles.armorModificationButton} onPress={() => adjustPowerArmorDurability(slotKey, -1)}>
                <Text style={localStyles.armorModificationButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={[localStyles.armorStatValue, { marginHorizontal: 8 }]}>{paPiece.hpCurrent}/{paMaxHp}</Text>
              <TouchableOpacity style={localStyles.armorModificationButton} onPress={() => adjustPowerArmorDurability(slotKey, 1)}>
                <Text style={localStyles.armorModificationButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          ),
        },
        // «Починить» — по ОДНОМУ условию hp < max (правило владельца: бесплатно до максимума).
        ...(paNeedsRepair ? [{
          label: '',
          value: tWeaponsAndArmorScreen('powerArmor.repair'),
          type: 'button',
          onPress: () => repairPowerArmorPieceAt(slotKey),
        }] : []),
      ];

      return (
        <ArmorPart
          key={slotKey}
          title={config.title}
          subtitle={config.subtitle}
          armorName={paLocalized?.name}
          stats={paStats}
        />
      );
    }

    const { item: modifiedArmor } = applyArmorMods(armorItem, equipmentCatalog);
    const { item: modifiedClothing } = applyArmorMods(clothingItem, equipmentCatalog, { standardKey: 'appliedClothingModId', uniqueKey: 'unused' });

    const physDef = Math.max(Number(modifiedArmor?.physicalDamageRating || 0), Number(modifiedClothing?.physicalDamageRating || 0)) + (timedDR.physical || 0);
    const energyDef = Math.max(Number(modifiedArmor?.energyDamageRating || 0), Number(modifiedClothing?.energyDamageRating || 0)) + (timedDR.energy || 0);
    const radDef = Math.max(Number(modifiedArmor?.radiationDamageRating || 0), Number(modifiedClothing?.radiationDamageRating || 0)) + (timedDR.radiation || 0);

    // ПРАВИЛО (от владельца): вид предмета решает domain/protectionKind.js,
    // а не слот, в котором предмет лежит. Кнопку «Улучшить броню» получает
    // только вид 'armor': одежда в слоте брони её не получает, модов брони
    // на одежду нет. «Улучшить одежду» скрыта: данных модов одежды пока нет
    // (вернём, когда появятся).
    const stats = [
      { label: tWeaponsAndArmorScreen('armor.fields.physical'), value: physDef > 0 ? physDef : tWeaponsAndArmorScreen('common.none') },
      { label: tWeaponsAndArmorScreen('armor.fields.energy'), value: energyDef > 0 ? energyDef : tWeaponsAndArmorScreen('common.none') },
      { label: tWeaponsAndArmorScreen('armor.fields.radiation'), value: hasRadImmunity ? '∞' : (radDef > 0 ? radDef : tWeaponsAndArmorScreen('common.none')) },
      ...(getProtectionKind(modifiedArmor) === PROTECTION_KINDS.ARMOR ? [{ label: tWeaponsAndArmorScreen('armor.fields.armorModification'), value: '⋯', type: 'button', onPress: () => handleOpenArmorModal(slotKey, 'armor') }] : []),
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
                <StatBox title={tWeaponsAndArmorScreen('stats.poisonResistance')} value={hasPoisonImmunityValue ? '∞' : '0'} />
                <StatBox title={tWeaponsAndArmorScreen('stats.radiation')} value={hasRadImmunity ? '0' : ''} disabled={hasRadImmunity}>
                  <RadiationCounter isEnabled={radiationIsEnabled} />
                </StatBox>
                <StatBox title={tWeaponsAndArmorScreen('stats.health')} max={effectiveMaxHealth}>
                  <HealthCounter max={effectiveMaxHealth} isEnabled={attributesSaved} radiation={radiation} />
                </StatBox>
            </View>
            <EffectsPanel effects={activeTimedEffects || []} immunities={allImmunities} extraRows={powerArmorEffectRows} />
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
              {/* Силовая броня — не отдельный блок: часть подменяет СВОЮ ячейку
                  этой сетки (renderArmorPart), нижние слои ячейки подавляются (§5.5). */}
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
