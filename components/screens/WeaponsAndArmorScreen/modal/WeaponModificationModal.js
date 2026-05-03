import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert
} from 'react-native';
import { getSlotsForWeapon, getModsForWeaponSlot, getWeaponById, getWeaponModById, getWeaponMods } from '../../../../db/Database';
import { declinePrefix } from '../../../../domain/modsEquip';
import { tWeaponsAndArmorScreen } from '../weaponsAndArmorScreenI18n';
import styles from '../../../../styles/WeaponModificationModal.styles';


function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizeModRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    slot: normalizeSlotKey(row.slot),
    rawSlot: row.slot,
    // БД: weight/cost/effects/effect_description
    weight: row.weight,
    cost: row.cost,
    effects: row.effects,
    effect_description: row.effect_description,
  };
}

// CRITICAL INVARIANT:
// Only ONE installed mod per category(slot) is allowed at any time.
// If a new mod is selected in the same category, it MUST replace the previous one.
function normalizeSlotKey(slot) {
  const raw = String(slot || '').trim();
  const key = raw.toLowerCase();
  const map = {
    barrel: 'Barrels',
    barrels: 'Barrels',
    receiver: 'Receivers',
    receivers: 'Receivers',
    sight: 'Sights',
    sights: 'Sights',
    muzzle: 'Muzzles',
    muzzles: 'Muzzles',
    stock: 'Stocks',
    stocks: 'Stocks',
    grip: 'Grips',
    grips: 'Grips',
    magazine: 'Magazines',
    magazines: 'Magazines',
    capacitor: 'Capacitors',
    capacitors: 'Capacitors',
    unique: 'Uniques',
    uniques: 'Uniques',
  };
  return map[key] || raw || 'Other';
}

function translateModPrefix(token) {
  if (!token) return token;
  const t = String(token).trim();
  const localized = tWeaponsAndArmorScreen(`weapon.modPrefixes.${t}`);
  // tWeaponsAndArmorScreen returns the key path if not found — fall back to original
  return localized.startsWith('weapon.modPrefixes.') ? t : localized;
}

function getModDisplayName(mod, weaponBaseName) {
  if (!mod) return '';
  const rawPrefix = mod.prefix || '';
  const rawName = mod.name || '';
  const localizedPrefix = translateModPrefix(rawPrefix || rawName);
  return weaponBaseName ? declinePrefix(localizedPrefix, weaponBaseName) : localizedPrefix;
}

function applyDbModEffectsToWeapon(baseWeapon, selectedBySlot) {
  const selectedMods = Object.values(selectedBySlot).filter(Boolean);
  const baseName = baseWeapon.baseWeaponName ?? baseWeapon.name ?? '';

  // строим имя только от базового имени, чтобы не дублировать префиксы при повторных открытиях
  const prefixesRu = [];
  for (const mod of selectedMods) {
    const p = getModDisplayName(mod, baseName);
    if (!p) continue;
    if (!prefixesRu.includes(p)) prefixesRu.push(p);
  }
  const name = prefixesRu.length ? `${prefixesRu.join(' ')} ${baseName}` : baseName;

  const damageBase = toNumber(baseWeapon.damage);
  const fireRateBase = toNumber(baseWeapon.fire_rate);
  const weightBase = toNumber(baseWeapon.weight);
  const costBase = toNumber(baseWeapon.cost);

  let damage = damageBase;
  let fire_rate = fireRateBase;
  let weight = weightBase;
  let cost = costBase;
  let rangeShift = 0;
  const qualities = new Set(
    String(baseWeapon.qualities ?? '')
      .split(',')
      .map(q => q.trim())
      .filter(Boolean)
      .filter(q => q !== '–')
  );

  // Минимальный парсер Effects из seed-данных, напр:
  // "plus 1 CD Damage, plus 2 Fire Rate"
  // "minus 1 CD Damage, plus 1 Fire Rate"
  // Если не распознали — просто сохраняем описание.
  const extraEffectsText = [];
  for (const mod of selectedMods) {
    const eff = String(mod.effects || '');
    if (eff) extraEffectsText.push(eff);

    const dmgPlus = eff.match(/plus\s+(\d+)\s+CD\s+Damage/i);
    const dmgMinus = eff.match(/minus\s+(\d+)\s+CD\s+Damage/i);
    if (dmgPlus) damage += Number(dmgPlus[1]);
    if (dmgMinus) damage -= Number(dmgMinus[1]);

    const frPlus = eff.match(/plus\s+(\d+)\s+Fire\s+Rate/i);
    const frMinus = eff.match(/minus\s+(\d+)\s+Fire\s+Rate/i);
    if (frPlus) fire_rate += Number(frPlus[1]);
    if (frMinus) fire_rate -= Number(frMinus[1]);

    const rangePlus = eff.match(/plus\s+(\d+)\s+Range/i);
    const rangeMinus = eff.match(/minus\s+(\d+)\s+Range/i);
    if (rangePlus) rangeShift += Number(rangePlus[1]);
    if (rangeMinus) rangeShift -= Number(rangeMinus[1]);

    const gainMatches = [...eff.matchAll(/gain\s+([^,]+)/gi)];
    gainMatches.forEach(([, q]) => qualities.add(String(q).trim()));
    const loseMatches = [...eff.matchAll(/lose\s+([^,]+)/gi)];
    loseMatches.forEach(([, q]) => qualities.delete(String(q).trim()));

    // Вес/цена модов (если есть)
    weight += toNumber(mod.weight);
    cost += toNumber(mod.cost);
  }

  const RANGE_ORDER = ['Close', 'Medium', 'Long', 'Extreme'];
  const rangeNames = tWeaponsAndArmorScreen('weapon.rangeNames') || {};
  const currentRangeName = String(baseWeapon.range_name ?? 'Close').trim();
  // range_name in DB may be stored in Russian — map back to English key
  const RANGE_RU_TO_EN = { 'Близкая': 'Close', 'Средняя': 'Medium', 'Дальняя': 'Long', 'Экстремальная': 'Extreme' };
  const currentRangeKey = RANGE_RU_TO_EN[currentRangeName] || currentRangeName;
  const currentRangeIndex = Math.max(0, RANGE_ORDER.indexOf(currentRangeKey));
  const nextRangeIndex = Math.max(0, Math.min(RANGE_ORDER.length - 1, currentRangeIndex + rangeShift));
  const range_name_key = RANGE_ORDER[nextRangeIndex];
  const range_name = rangeNames[range_name_key] || range_name_key;
  const qualitiesValue = qualities.size ? Array.from(qualities).join(', ') : '–';

  return {
    ...baseWeapon,
    name,
    baseWeaponName: baseName,
    damage,
    fire_rate,
    range_name,
    qualities: qualitiesValue,
    weight: String(weight),
    cost,
    // сохраняем выбранные моды
    appliedMods: Object.fromEntries(
      Object.entries(selectedBySlot).map(([slot, mod]) => [slot, mod?.id]).filter(([, id]) => !!id)
    ),
    _selectedModsBySlot: selectedBySlot,
    _mods_effects_debug: extraEffectsText.join('; '),
  };
}

// Компонент для сворачиваемой секции
const CollapsibleSection = ({ title, children, isExpanded, onToggle }) => {
  return (
    <View style={styles.collapsibleSection}>
      <TouchableOpacity onPress={onToggle} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {isExpanded && (
        <View style={styles.sectionContent}>
          {children}
        </View>
      )}
    </View>
  );
};

const WeaponModificationModal = ({ visible, onClose, weapon, onApplyModification }) => {
  const [selectedModifications, setSelectedModifications] = useState({}); // slot -> modRow
  const [modifiedWeapon, setModifiedWeapon] = useState(weapon);
  const [baseWeaponForMods, setBaseWeaponForMods] = useState(weapon);
  const [expandedCategories, setExpandedCategories] = useState({}); // slot -> boolean
  const [modsBySlot, setModsBySlot] = useState({}); // slot -> modRow[]

  // Обновляем modifiedWeapon при изменении weapon
  React.useEffect(() => {
    let cancelled = false;
    if (!weapon || !visible) return undefined;

    (async () => {
      try {
        const weaponId = weapon.id ?? weapon.weaponId;
        const dbWeapon = weaponId ? await getWeaponById(weaponId) : null;

        // фиксируем базовое имя и базовые характеристики из БД,
        // чтобы повторное открытие/перевыбор модов не накапливал префиксы и статы
        const weaponWithBase = {
          ...weapon,
          ...(dbWeapon || {}),
          id: weaponId ?? dbWeapon?.id,
          weaponId: weaponId ?? dbWeapon?.id,
          baseWeaponName: dbWeapon?.name ?? weapon?.name ?? '',
          appliedMods: weapon.appliedMods || {},
        };

        setBaseWeaponForMods(weaponWithBase);
        setModifiedWeapon(weaponWithBase);

        const resolvedWeaponId = weaponWithBase.id ?? weaponWithBase.weaponId;
        if (!resolvedWeaponId) {
          setModsBySlot({});
          setSelectedModifications({});
          return;
        }

        const slots = await getSlotsForWeapon(resolvedWeaponId);
        const bySlot = {};

        if (slots && slots.length) {
          for (const slot of slots) {
            const normalizedSlot = normalizeSlotKey(slot);
            const mods = await getModsForWeaponSlot(resolvedWeaponId, slot);
            const normalizedMods = (mods || []).map(normalizeModRow).filter(Boolean);
            if (!bySlot[normalizedSlot]) bySlot[normalizedSlot] = [];
            bySlot[normalizedSlot].push(...normalizedMods);
          }
        } else {
          // Fallback: если weapon_mod_slots для оружия не заполнен,
          // используем weapon_mods.applies_to_ids и группируем по slot.
          const mods = await getWeaponMods(resolvedWeaponId);
          for (const m of (mods || [])) {
            const nm = normalizeModRow(m);
            if (!nm) continue;
            const slot = normalizeSlotKey(nm.slot || nm.rawSlot || 'Other');
            if (!bySlot[slot]) bySlot[slot] = [];
            bySlot[slot].push(nm);
          }
        }

        // выбранные моды из appliedMods (если уже есть)
        const selected = {};
        const applied = weaponWithBase.appliedMods || {};
        for (const [slot, modId] of Object.entries(applied)) {
          const modRow = await getWeaponModById(modId);
          const normalizedSlot = normalizeSlotKey(slot);
          if (modRow) selected[normalizedSlot] = normalizeModRow(modRow);
        }

        if (cancelled) return;
        setModsBySlot(bySlot);
        setSelectedModifications(selected);

        const computed = applyDbModEffectsToWeapon(weaponWithBase, selected);
        setModifiedWeapon(computed);
      } catch (e) {
        if (!cancelled) {
          setModsBySlot({});
          setSelectedModifications({});
          setBaseWeaponForMods(weapon);
          setModifiedWeapon(weapon);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weapon, visible]);

  const handleToggleCategory = (slot) => {
    setExpandedCategories(prev => ({
      ...prev,
      [slot]: !prev[slot]
    }));
  };

  const handleSelectModification = (slot, mod) => {
    if (!weapon) return;

    // Строим новый набор выбранных модов (UI-состояние)
    const newSelected = { ...selectedModifications, [slot]: mod };
    setSelectedModifications(newSelected);

    setModifiedWeapon(applyDbModEffectsToWeapon(baseWeaponForMods || weapon, newSelected));
  };

  const handleApplyModification = () => {
    if (!weapon) {
      return;
    }

    const modificationsArray = Object.values(selectedModifications);
    if (modificationsArray.length > 0) {
      onApplyModification(modifiedWeapon);
    } else {
      Alert.alert(tWeaponsAndArmorScreen('modals.errorTitle'), tWeaponsAndArmorScreen('modals.errorSelectMod'));
    }
  };

  const handleClose = () => {
    setSelectedModifications({});
    setExpandedCategories({});
    setModsBySlot({});
    setBaseWeaponForMods(null);
    onClose();
  };

  // Если оружие не передано или нет id — не показываем модальное окно
  if (!weapon || !(weapon.id ?? weapon.weaponId)) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{tWeaponsAndArmorScreen('modals.weaponModification')}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Информация об оружии */}
            <View style={styles.weaponInfo}>
              <Text style={styles.weaponTitle}>{weapon?.name || tWeaponsAndArmorScreen('modals.unknownWeapon')}</Text>
              <Text style={styles.weaponStats}>
                {tWeaponsAndArmorScreen('modals.weaponDamage')}: {weapon?.damage ?? 0} | {tWeaponsAndArmorScreen('modals.weaponFireRate')}: {weapon?.fire_rate ?? 0} |
                {tWeaponsAndArmorScreen('modals.weaponRange')}: {weapon?.range_name ?? tWeaponsAndArmorScreen('weapon.rangeDefault')} | {tWeaponsAndArmorScreen('modals.weaponWeight')}: {weapon?.weight ?? 0} | {tWeaponsAndArmorScreen('modals.weaponCost')}: {weapon?.cost ?? 0}
              </Text>
            </View>

            {/* Доступные модификации */}
            <View style={styles.modificationsSection}>
              <Text style={styles.sectionTitle}>{tWeaponsAndArmorScreen('modals.availableModificationsLabel')}</Text>
              {Object.entries(modsBySlot).map(([slot, mods]) => (
                <CollapsibleSection
                  key={slot}
                  title={`${slot} (${mods.length})`}
                  isExpanded={expandedCategories[slot]}
                  onToggle={() => handleToggleCategory(slot)}
                >
                  {mods.map((mod, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.modificationItem,
                        selectedModifications[slot]?.id === mod.id && styles.selectedModification
                      ]}
                      onPress={() => handleSelectModification(slot, mod)}
                    >
                      <Text style={styles.modificationName}>{getModDisplayName(mod, weapon?.baseWeaponName ?? weapon?.name) || mod.name}</Text>
                      <Text style={styles.modificationEffects}>{mod.effect_description || mod.effects}</Text>
                      <Text style={styles.modificationStats}>
                        {tWeaponsAndArmorScreen('modals.weight')}: {toNumber(mod.weight) >= 0 ? '+' : ''}{toNumber(mod.weight)} | {tWeaponsAndArmorScreen('modals.cost')}: +{toNumber(mod.cost)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </CollapsibleSection>
              ))}
            </View>

            {/* Предварительный просмотр */}
            {Object.keys(selectedModifications).length > 0 && (
              <View style={styles.previewSection}>
                <Text style={styles.sectionTitle}>{tWeaponsAndArmorScreen('modals.previewLabel')}</Text>
                <View style={styles.previewContent}>
                  <Text style={styles.previewTitle}>
                    {modifiedWeapon?.name || tWeaponsAndArmorScreen('common.empty')}
                  </Text>
                  <Text style={styles.previewStats}>
                    {tWeaponsAndArmorScreen('modals.weaponDamage')}: {modifiedWeapon.damage} | {tWeaponsAndArmorScreen('modals.weaponFireRate')}: {modifiedWeapon.fire_rate} |
                    {tWeaponsAndArmorScreen('modals.weaponRange')}: {modifiedWeapon.range_name || tWeaponsAndArmorScreen('weapon.rangeDefault')} | {tWeaponsAndArmorScreen('modals.weaponWeight')}: {modifiedWeapon.weight} | {tWeaponsAndArmorScreen('modals.weaponCost')}: {modifiedWeapon.cost}
                  </Text>
                  <Text style={styles.previewEffects}>
                    {tWeaponsAndArmorScreen('modals.previewEffects')}: {modifiedWeapon.damage_effects ?? modifiedWeapon.Эффекты ?? modifiedWeapon._mods_effects_debug}
                  </Text>
                  <Text style={styles.previewQualities}>
                    {tWeaponsAndArmorScreen('modals.previewQualities')}: {modifiedWeapon.qualities}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Кнопки действий */}
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={handleClose} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>{tWeaponsAndArmorScreen('modals.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleApplyModification}
              style={[styles.applyButton, Object.keys(selectedModifications).length === 0 && styles.disabledButton]}
              disabled={Object.keys(selectedModifications).length === 0}
            >
              <Text style={styles.applyButtonText}>{tWeaponsAndArmorScreen('modals.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default WeaponModificationModal; 
