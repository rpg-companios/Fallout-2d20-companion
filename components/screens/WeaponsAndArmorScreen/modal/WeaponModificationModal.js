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
import { shiftRange } from '../../../../domain/range';
import { applyQualityGain } from '../../../../domain/weaponQualityConflicts';
import { tWeaponsAndArmorScreen } from '../weaponsAndArmorScreenI18n';
import { resolveWeaponQualities, resolveWeaponEffects } from '../../../../domain/weaponDisplay';
import styles from '../../../../styles/WeaponModificationModal.styles';
import { debugLog } from '../../../../src/debug/falloutDebug';


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
    // canonical DB fields only
    weight: row.weight ?? 0,
    cost: row.cost ?? 0,
    // Localized description for UI (i18n effectDescription, locale-driven).
    effectDescription: row.effectDescription || row.effects || '',
    damageModifier: row.damageModifier,
    fireRateModifier: row.fireRateModifier,
    rangeModifier: row.rangeModifier,
    damageType: row.damageType,
    qualityChanges: row.qualityChanges,
    effectChanges: row.effectChanges,
    damageTypeOverride: row.damageTypeOverride,
  };
}

// CRITICAL INVARIANT:
// Only ONE installed mod per category(slot) is allowed at any time.
// If a new mod is selected in the same category, it MUST replace the previous one.
const CONFLICTING_MOD_SLOTS = Object.freeze({
  grip: 'stock',
  stock: 'grip',
});

const setSelectedMod = (selected, slot, mod) => {
  const next = { ...selected };
  const oppositeSlot = CONFLICTING_MOD_SLOTS[slot];
  if (oppositeSlot) delete next[oppositeSlot];
  next[slot] = mod;
  return next;
};

function normalizeSlotKey(slot) {
  const raw = String(slot || '').trim();
  if (!raw) return 'other';

  const key = raw.toLowerCase().replace(/\s+/g, '');
  // Canonicalize common plural DB values: Barrels -> barrel, Sights -> sight, Capacitors -> capacitor.
  const singular = key.endsWith('s') ? key.slice(0, -1) : key;

  // Keep a tiny alias map only for known irregular/legacy tokens.
  const aliases = {
    uniques: 'unique',
  };

  return aliases[singular] || singular;
}

// mod.prefix (а при его отсутствии — mod.name) уже локализован в
// i18n/<loc>/data/equipment/weapons/weapon_mods.json — единственном источнике
// истины для названий и префиксов модов. Второго словаря (modPrefixes) не нужно:
// prefix приходит из каталога в языке текущей локали и используется напрямую.
function getModDisplayName(mod, weaponBaseName) {
  if (!mod) return '';
  const token = (mod.prefix || mod.name || '').trim();
  return weaponBaseName ? declinePrefix(token, weaponBaseName) : token;
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
  const fireRateBase = toNumber(baseWeapon.fireRate);
  const weightBase = toNumber(baseWeapon.weight);
  const costBase = toNumber(baseWeapon.cost);

  let damage = damageBase;
  let fire_rate = fireRateBase;
  let weight = weightBase;
  let cost = costBase;
  let rangeShift = 0;
  // Нормализуем базовый damageType в массив
  let damage_type = baseWeapon.damageType;
  if (typeof damage_type === "string") {
    try {
      damage_type = JSON.parse(damage_type);
    } catch {
      damage_type = [damage_type];
    }
  }
  if (!Array.isArray(damage_type)) {
    damage_type = damage_type ? [damage_type] : ["physical"];
  } else {
    damage_type = [...damage_type];
  }

  // Качества (quality_*) и Эффекты (effect_*) — две разные сущности.
  const qualities = new Map(); // qualityId -> entry
  const effects = new Map();   // effectId -> entry
  const loadBase = (field, map, idKey) => {
    let arr = baseWeapon[field];
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return; } }
    if (!Array.isArray(arr)) return;
    arr.forEach((e) => {
      const id = (typeof e === 'object' && e ? e[idKey] : e);
      if (id && id !== '–') map.set(id, e && e.value != null ? { [idKey]: id, value: e.value } : { [idKey]: id });
    });
  };
  loadBase('qualities', qualities, 'qualityId');
  loadBase('effects', effects, 'effectId');

  // Применяем структурированные модификаторы из JSON
  for (const mod of selectedMods) {
    if (mod.damageModifier) {
      if (mod.damageModifier.op === '+') damage += Number(mod.damageModifier.value);
      if (mod.damageModifier.op === '-') damage -= Number(mod.damageModifier.value);
      if (mod.damageModifier.op === 'set') damage = Number(mod.damageModifier.value);
    }

    if (mod.fireRateModifier) {
      if (mod.fireRateModifier.op === '+') fire_rate += Number(mod.fireRateModifier.value);
      if (mod.fireRateModifier.op === '-') fire_rate -= Number(mod.fireRateModifier.value);
      if (mod.fireRateModifier.op === 'set') fire_rate = Number(mod.fireRateModifier.value);
    }

    if (mod.rangeModifier) {
      if (mod.rangeModifier.op === '+') rangeShift += Number(mod.rangeModifier.value);
      if (mod.rangeModifier.op === '-') rangeShift -= Number(mod.rangeModifier.value);
    }

    if (mod.effectChanges && Array.isArray(mod.effectChanges)) {
      for (const c of mod.effectChanges) {
        if (c.op === 'gain') effects.set(c.id, c.value != null ? { effectId: c.id, value: c.value } : { effectId: c.id });
        if (c.op === 'lose') effects.delete(c.id);
      }
    }

    if (mod.qualityChanges && Array.isArray(mod.qualityChanges)) {
      for (const c of mod.qualityChanges) {
        if (c.op === 'gain') applyQualityGain(qualities, { qualityId: c.id, value: c.value });
        if (c.op === 'lose') qualities.delete(c.id);
      }
    }

    // Обработка damageTypeOverride (изменение типа урона)
    if (mod.damageTypeOverride) {
      const { op, value } = mod.damageTypeOverride;
      if (op === 'set') {
        // Замена: полностью перезаписываем массив
        damage_type = Array.isArray(value) ? [...value] : [value];
      } else if (op === 'add') {
        // Добавление: добавляем тип, если его нет
        const typesToAdd = Array.isArray(value) ? value : [value];
        for (const t of typesToAdd) {
          if (!damage_type.includes(t)) {
            damage_type.push(t);
          }
        }
      }
    }

    // Вес/цена модов
    weight += toNumber(mod.weight);
    cost += toNumber(mod.cost);
  }

  // Range is an ordinal scale; mods shift it by net steps (rangeShift), clamped
  // to Close..Extreme. Canonical logic lives in domain/range.js.
  const rangeNames = tWeaponsAndArmorScreen('weapon.rangeNames') || {};
  const { name: range_name_key } = shiftRange(
    baseWeapon.range ?? baseWeapon.range_index ?? baseWeapon.range_name ?? 'Close',
    rangeShift,
  );
  const range_name = rangeNames[range_name_key] || range_name_key;
  const effectsValue = effects.size ? JSON.stringify([...effects.values()]) : '–';
  const qualitiesValue = qualities.size ? JSON.stringify([...qualities.values()]) : '–';

  debugLog('weapon.mod.compute', {
    weaponId: baseWeapon?.id ?? baseWeapon?.weaponId,
    baseName,
    selectedMods: selectedMods.map((m) => ({ id: m.id, slot: m.slot, rawSlot: m.rawSlot, damageModifier: m.damageModifier, fireRateModifier: m.fireRateModifier, rangeModifier: m.rangeModifier, qualityChanges: m.qualityChanges, damageTypeOverride: m.damageTypeOverride })),
    baseDamage: damageBase,
    resultDamage: damage,
    baseFireRate: fireRateBase,
    resultFireRate: fire_rate,
    baseWeight: weightBase,
    resultWeight: weight,
    baseCost: costBase,
    resultCost: cost,
    rangeShift,
    resultRange: range_name,
    baseDamageType: baseWeapon.damageType,
    resultDamageType: damage_type,
  });

  return {
    ...baseWeapon,
    name,
    baseWeaponName: baseName,
    damage,
    fireRate: fire_rate,
    damageType: damage_type,
    rangeName: range_name,
    qualities: qualitiesValue,
    effects: effectsValue,
    weight: String(weight),
    cost,
    // сохраняем выбранные моды
    appliedMods: Object.fromEntries(
      Object.entries(selectedBySlot).map(([slot, mod]) => [slot, mod?.id]).filter(([, id]) => !!id)
    ),
    _selectedModsBySlot: selectedBySlot,
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
          // baseName варианта (напр. «Опасная бритва») важнее имени из БД:
          // моды должны собираться от перезаписанного имени предмета.
          baseWeaponName: weapon?.baseName || (dbWeapon?.name ?? weapon?.name ?? ''),
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
            normalizedMods.forEach((m) => debugLog('weapon.mod.row', { weaponId: resolvedWeaponId, slot, normalizedSlot, id: m.id, name: m.name, damageModifier: m.damageModifier, fireRateModifier: m.fireRateModifier, rangeModifier: m.rangeModifier, qualityChanges: m.qualityChanges, effectDescription: m.effectDescription }));
            if (!bySlot[normalizedSlot]) bySlot[normalizedSlot] = [];
            bySlot[normalizedSlot].push(...normalizedMods);
          }
        } else {
          // Fallback: если weapon_mod_slots для оружия не заполнен,
          // используем weapon_mods.appliesToIds и группируем по slot.
          const mods = await getWeaponMods(resolvedWeaponId);
          for (const m of (mods || [])) {
            const nm = normalizeModRow(m);
            if (!nm) continue;
            const slot = normalizeSlotKey(nm.slot || nm.rawSlot || 'other');
            if (!bySlot[slot]) bySlot[slot] = [];
            bySlot[slot].push(nm);
          }
        }

        // выбранные моды из appliedMods (если уже есть)
        let selected = {};
        const applied = weaponWithBase.appliedMods || {};
        for (const [slot, modId] of Object.entries(applied)) {
          const modRow = await getWeaponModById(modId);
          const normalizedSlot = normalizeSlotKey(slot);
          if (modRow) {
            selected = setSelectedMod(selected, normalizedSlot, normalizeModRow(modRow));
          }
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

    // Повторное нажатие на уже выбранный мод → снять его со слота
    let newSelected;
    if (selectedModifications[slot]?.id === mod.id) {
      newSelected = { ...selectedModifications };
      delete newSelected[slot];
    } else {
      newSelected = setSelectedMod(selectedModifications, slot, mod);
    }

    setSelectedModifications(newSelected);
    setModifiedWeapon(applyDbModEffectsToWeapon(baseWeaponForMods || weapon, newSelected));
  };

  const handleApplyModification = () => {
    if (!weapon) {
      return;
    }

    const modificationsArray = Object.values(selectedModifications);
    debugLog('weapon.mod.apply.modal', { modificationsArray: modificationsArray.map((m) => ({ id: m.id, slot: m.slot, damageModifier: m.damageModifier, fireRateModifier: m.fireRateModifier })), modifiedWeapon });
    // Разрешаем применить даже с нулём модов — это означает снятие всех модов с оружия
    onApplyModification(modifiedWeapon);
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
                {tWeaponsAndArmorScreen('modals.weaponDamage')}: {weapon?.damage ?? 0} | {tWeaponsAndArmorScreen('modals.weaponFireRate')}: {weapon?.fireRate ?? 0} |
                {tWeaponsAndArmorScreen('modals.weaponRange')}: {weapon?.range_name ?? tWeaponsAndArmorScreen('weapon.rangeDefault')} | {tWeaponsAndArmorScreen('modals.weaponWeight')}: {weapon?.weight ?? 0} | {tWeaponsAndArmorScreen('modals.weaponCost')}: {weapon?.cost ?? 0}
              </Text>
            </View>

            {/* Доступные модификации */}
            <View style={styles.modificationsSection}>
              <Text style={styles.sectionTitle}>{tWeaponsAndArmorScreen('modals.availableModificationsLabel')}</Text>
              {Object.entries(modsBySlot).map(([slot, mods]) => (
                <CollapsibleSection
                  key={slot}
                  title={`${tWeaponsAndArmorScreen(`weapon.modSlots.${slot}`, slot)} (${mods.length})`}
                  isExpanded={expandedCategories[slot]}
                  onToggle={() => handleToggleCategory(slot)}
                >
                  {/* Кнопка «Без мода» — всегда первая в списке слота */}
                  <TouchableOpacity
                    style={[styles.modificationItem, !selectedModifications[slot] && styles.selectedModification]}
                    onPress={() => {
                      const newSelected = { ...selectedModifications };
                      delete newSelected[slot];
                      setSelectedModifications(newSelected);
                      setModifiedWeapon(applyDbModEffectsToWeapon(baseWeaponForMods || weapon, newSelected));
                    }}
                  >
                    <Text style={styles.modificationName}>
                      {selectedModifications[slot]
                        ? tWeaponsAndArmorScreen('modals.removeWeaponMod')
                        : tWeaponsAndArmorScreen('modals.noWeaponMod')}
                    </Text>
                  </TouchableOpacity>
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
                      <Text style={styles.modificationEffects}>
                        {`${tWeaponsAndArmorScreen('modals.previewEffects')}: ${mod.effectDescription || tWeaponsAndArmorScreen('common.empty')}`}
                      </Text>
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
                    {tWeaponsAndArmorScreen('modals.weaponDamage')}: {modifiedWeapon.damage} | {tWeaponsAndArmorScreen('modals.weaponFireRate')}: {modifiedWeapon.fireRate} |
                    {tWeaponsAndArmorScreen('modals.weaponRange')}: {modifiedWeapon.range_name || tWeaponsAndArmorScreen('weapon.rangeDefault')} | {tWeaponsAndArmorScreen('modals.weaponWeight')}: {modifiedWeapon.weight} | {tWeaponsAndArmorScreen('modals.weaponCost')}: {modifiedWeapon.cost}
                  </Text>
                  <Text style={styles.previewEffects}>
                    {tWeaponsAndArmorScreen('modals.previewEffects')}: {resolveWeaponEffects(modifiedWeapon.effects)}
                  </Text>
                  <Text style={styles.previewQualities}>
                    {tWeaponsAndArmorScreen('modals.previewQualities')}: {resolveWeaponQualities(modifiedWeapon.qualities)}
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
              style={styles.applyButton}
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
