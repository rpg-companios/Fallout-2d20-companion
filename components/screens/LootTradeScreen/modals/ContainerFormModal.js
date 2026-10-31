import React, { useState, useEffect, useMemo } from 'react';
import { ADMIN_MODAL_PALETTE } from '../../../admin/adminModalTheme';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../logic/lootTradeI18n';
import IconText, { CdIcon } from '../../../lootTrade/LootTradeIconText';
import { formatRoomCodeForDisplay } from '../../../../src/room/roomCode';
import {
  CONTAINER_KIND,
  QUANTITY_UNIT,
  DEFAULT_MERCHANT_CAPS,
  DEFAULT_SALE_MARKUP_PERCENT,
  DEFAULT_BUY_DEPRECIATION_PERCENT,
  resolveQuantitySpec,
  normalizeRoomCodes,
  normalizeSaleMarkupPercent,
  normalizeBuyDepreciationPercent,
  matchHubSuggestions,
} from '../../../../domain/lootTrade';
import { showRawAlert } from '../../../alerts/alertService';

const EMPTY_ARRAY = Object.freeze([]);

const ContainerFormModal = ({
  visible,
  kind = CONTAINER_KIND.LOOT,
  initialContainer = null,
  availableRooms = EMPTY_ARRAY,
  availableHubs = EMPTY_ARRAY,
  initialLinkedHubIds = EMPTY_ARRAY,
  onQuickCreateHub = null,
  onSave,
  onClose,
}) => {
  useLocale();

  const effectiveKind = initialContainer?.kind || kind;
  const isMerchant = effectiveKind === CONTAINER_KIND.MERCHANT;
  const isHub = effectiveKind === CONTAINER_KIND.HUB;
  const isEditing = Boolean(initialContainer?.id && !initialContainer?.__isDuplicateDraft);
  const initSessionKey = visible
    ? `${effectiveKind}:${initialContainer?.id || 'new'}:${initialContainer?.__isDuplicateDraft ? 'dup' : 'std'}`
    : '';

  const [name, setName] = useState('');
  const [selectedRoomCodes, setSelectedRoomCodes] = useState([]);
  const [selectedHubIds, setSelectedHubIds] = useState([]);
  const [extraCreatedHubs, setExtraCreatedHubs] = useState([]);
  const [hubQuery, setHubQuery] = useState('');
  const [hubDropdownOpen, setHubDropdownOpen] = useState(false);
  const [creatingHub, setCreatingHub] = useState(false);
  const [description, setDescription] = useState('');
  const [capsCount, setCapsCount] = useState(String(DEFAULT_MERCHANT_CAPS));
  const [capsUnit, setCapsUnit] = useState(QUANTITY_UNIT.PCS);
  const [saleMarkup, setSaleMarkup] = useState(String(DEFAULT_SALE_MARKUP_PERCENT));
  const [buyDepreciation, setBuyDepreciation] = useState(String(DEFAULT_BUY_DEPRECIATION_PERCENT));

  useEffect(() => {
    if (!initSessionKey) return;
    setName(initialContainer?.name || '');
    setHubQuery('');
    setHubDropdownOpen(false);
    setCreatingHub(false);
    setExtraCreatedHubs([]);
    if (isHub) {
      const existingCodes = normalizeRoomCodes(
        initialContainer?.roomCodes,
        initialContainer?.roomCode,
      );
      const fallbackCodes = existingCodes.length > 0
        ? existingCodes
        : (availableRooms[0]?.code ? [availableRooms[0].code] : []);
      setSelectedRoomCodes(fallbackCodes);
      setSelectedHubIds([]);
    } else {
      setSelectedRoomCodes([]);
      setSelectedHubIds(Array.isArray(initialLinkedHubIds) ? [...initialLinkedHubIds] : []);
    }
    setDescription(initialContainer?.description || '');
    setCapsCount(String(
      initialContainer?.caps !== undefined ? initialContainer.caps : DEFAULT_MERCHANT_CAPS,
    ));
    setCapsUnit(QUANTITY_UNIT.PCS);
    setSaleMarkup(String(
      initialContainer?.saleMarkupPercent !== undefined
        ? initialContainer.saleMarkupPercent
        : DEFAULT_SALE_MARKUP_PERCENT,
    ));
    setBuyDepreciation(String(
      initialContainer?.buyDepreciationPercent !== undefined
        ? initialContainer.buyDepreciationPercent
        : DEFAULT_BUY_DEPRECIATION_PERCENT,
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initSessionKey]);

  const combinedHubs = useMemo(() => {
    const map = new Map();
    for (const h of Array.isArray(availableHubs) ? availableHubs : []) {
      if (h?.id) map.set(h.id, h);
    }
    for (const h of extraCreatedHubs) {
      if (h?.id && !map.has(h.id)) map.set(h.id, h);
    }
    return Array.from(map.values());
  }, [availableHubs, extraCreatedHubs]);

  const hubSuggestion = useMemo(
    () => matchHubSuggestions(hubQuery, combinedHubs, selectedHubIds),
    [hubQuery, combinedHubs, selectedHubIds],
  );

  const selectedHubObjects = useMemo(
    () => selectedHubIds.map((id) => combinedHubs.find((h) => h.id === id)).filter(Boolean),
    [selectedHubIds, combinedHubs],
  );

  const toggleRoomCode = (code) => {
    setSelectedRoomCodes((prev) => (
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    ));
  };

  const selectHubById = (hubId) => {
    if (!hubId) return;
    setSelectedHubIds((prev) => (prev.includes(hubId) ? prev : [...prev, hubId]));
    setHubQuery('');
  };

  const removeSelectedHub = (hubId) => {
    setSelectedHubIds((prev) => prev.filter((id) => id !== hubId));
  };

  const toggleHubFromDropdown = (hubId) => {
    setSelectedHubIds((prev) => (
      prev.includes(hubId) ? prev.filter((id) => id !== hubId) : [...prev, hubId]
    ));
    setHubQuery('');
  };

  const acceptBestHubSuggestion = () => {
    if (hubSuggestion.bestMatch) {
      selectHubById(hubSuggestion.bestMatch.id);
      return true;
    }
    if (hubSuggestion.exactHub) {
      selectHubById(hubSuggestion.exactHub.id);
      return true;
    }
    return false;
  };

  const handleHubInputKeyPress = (e) => {
    const key = e?.nativeEvent?.key;
    if (
      (key === 'Tab' || key === 'Enter')
      && hubQuery.trim().length > 0
      && (hubSuggestion.bestMatch || hubSuggestion.exactHub)
    ) {
      e?.preventDefault?.();
      acceptBestHubSuggestion();
    } else if (key === 'Escape') {
      setHubDropdownOpen(false);
    }
  };

  const handleCreateHubInline = async () => {
    const cleanHubName = hubQuery.trim();
    if (!cleanHubName || creatingHub || typeof onQuickCreateHub !== 'function') return;
    if (hubSuggestion.exactHub) {
      selectHubById(hubSuggestion.exactHub.id);
      return;
    }
    setCreatingHub(true);
    try {
      const created = await onQuickCreateHub(cleanHubName);
      if (created?.id) {
        setExtraCreatedHubs((prev) => [...prev, created]);
        setSelectedHubIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
        setHubQuery('');
        setHubDropdownOpen(false);
      }
    } finally {
      setCreatingHub(false);
    }
  };

  const stepCaps = (delta) => {
    const cur = parseInt(capsCount, 10) || 0;
    const min = capsUnit === QUANTITY_UNIT.PCS ? 0 : 1;
    const next = Math.max(min, cur + delta);
    setCapsCount(String(next));
  };

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      showRawAlert({ title: tLootTrade('form.validationName') });
      return;
    }
    if (isHub && selectedRoomCodes.length === 0) {
      showRawAlert({ title: tLootTrade('form.validationRoom') });
      return;
    }

    let finalSelectedHubIds = selectedHubIds;
    if (!isHub && hubQuery.trim().length > 0 && hubSuggestion.exactHub) {
      if (!finalSelectedHubIds.includes(hubSuggestion.exactHub.id)) {
        finalSelectedHubIds = [...finalSelectedHubIds, hubSuggestion.exactHub.id];
      }
    }

    const primaryRoomCode = isHub ? (selectedRoomCodes[0] || '') : '';
    const roomRecord = isHub
      ? availableRooms.find((r) => r.code === primaryRoomCode)
      : null;
    let resolvedCaps = 0;
    let capsRollInfo = null;

    if (isMerchant) {
      const roll = resolveQuantitySpec({
        count: parseInt(capsCount, 10) || 0,
        unit: capsUnit,
        allowZeroPcs: true,
      });
      resolvedCaps = roll.quantity;
      if (roll.rolled) capsRollInfo = roll;
    }

    onSave(
      {
        ...(initialContainer || {}),
        kind: isHub
          ? CONTAINER_KIND.HUB
          : (isMerchant ? CONTAINER_KIND.MERCHANT : CONTAINER_KIND.LOOT),
        name: cleanName,
        roomCode: primaryRoomCode,
        roomCodes: isHub ? selectedRoomCodes : [],
        roomName: isHub ? (roomRecord?.name || initialContainer?.roomName || primaryRoomCode) : '',
        description: description.trim(),
        caps: resolvedCaps,
        saleMarkupPercent: isMerchant ? normalizeSaleMarkupPercent(saleMarkup, 0) : 0,
        buyDepreciationPercent: isMerchant ? normalizeBuyDepreciationPercent(buyDepreciation, 50) : 50,
      },
      capsRollInfo,
      isHub ? null : finalSelectedHubIds,
    );
  };

  let titleKey = isEditing ? 'form.editLootTitle' : 'form.createLootTitle';
  if (isHub) {
    titleKey = isEditing ? 'form.editHubTitle' : 'form.createHubTitle';
  } else if (isMerchant) {
    titleKey = isEditing ? 'form.editMerchantTitle' : 'form.createMerchantTitle';
  }

  const trimmedHubQuery = hubQuery.trim();
  const showGhostInline = Boolean(
    !isHub
    && hubSuggestion.ghostSuffix
    && hubQuery.length > 0
    && !/^\s/.test(hubQuery),
  );
  const showHubDropdown = !isHub && (hubDropdownOpen || trimmedHubQuery.length > 0);
  const canCreateNewHubInline = Boolean(
    !isHub
    && trimmedHubQuery.length > 0
    && !hubSuggestion.exactHub
    && typeof onQuickCreateHub === 'function',
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{tLootTrade(titleKey)}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>{tLootTrade('form.nameLabel')}</Text>
            <TextInput
              testID="container-form-name"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={tLootTrade('form.namePlaceholder')}
              placeholderTextColor="#8c8c8c"
            />

            {isHub ? (
              <>
                <Text style={styles.label}>{tLootTrade('form.roomsMultiLabel')}</Text>
                {availableRooms.length === 0 ? (
                  <Text style={styles.warnText}>{tLootTrade('form.noRoomsHint')}</Text>
                ) : (
                  <>
                    <View style={styles.roomChips}>
                      {availableRooms.map((room) => {
                        const selected = selectedRoomCodes.includes(room.code);
                        return (
                          <TouchableOpacity
                            key={room.code}
                            style={[styles.roomChip, selected && styles.roomChipActive]}
                            onPress={() => toggleRoomCode(room.code)}
                          >
                            <Text style={[styles.roomChipName, selected && styles.roomChipTextActive]}>
                              {room.name}
                            </Text>
                            <Text style={[styles.roomChipCode, selected && styles.roomChipTextActive]}>
                              {formatRoomCodeForDisplay(room.code)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.hintText}>{tLootTrade('form.roomsMultiHint')}</Text>
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>{tLootTrade('form.bindHubsLabel')}</Text>

                {selectedHubObjects.length > 0 && (
                  <View style={styles.selectedHubPills}>
                    {selectedHubObjects.map((hubItem) => (
                      <TouchableOpacity
                        key={hubItem.id}
                        style={styles.selectedHubPill}
                        onPress={() => removeSelectedHub(hubItem.id)}
                      >
                        <Text style={styles.selectedHubPillText}>{hubItem.name}</Text>
                        <Text style={styles.selectedHubPillRemove}>✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={[styles.hubComboRow, showHubDropdown && styles.hubComboRowActive]}>
                  <View style={styles.hubInputWrap}>
                    {showGhostInline && (
                      <View pointerEvents="none" style={styles.ghostOverlay}>
                        <Text numberOfLines={1} style={styles.ghostTextLine}>
                          <Text style={styles.ghostTypedTransparent}>{hubQuery}</Text>
                          <Text style={styles.ghostCompletion}>{hubSuggestion.ghostSuffix}</Text>
                        </Text>
                      </View>
                    )}
                    <TextInput
                      testID="hub-combobox-input"
                      style={styles.hubComboInput}
                      value={hubQuery}
                      onChangeText={(val) => {
                        setHubQuery(val);
                        if (!hubDropdownOpen) setHubDropdownOpen(true);
                      }}
                      onFocus={() => setHubDropdownOpen(true)}
                      onSubmitEditing={acceptBestHubSuggestion}
                      onKeyPress={handleHubInputKeyPress}
                      placeholder={tLootTrade('form.bindHubsPlaceholder')}
                      placeholderTextColor="#8c8c8c"
                    />
                  </View>

                  <TouchableOpacity
                    testID="hub-combobox-toggle"
                    style={styles.hubDropdownToggle}
                    onPress={() => setHubDropdownOpen((prev) => !prev)}
                  >
                    <Text style={styles.hubDropdownToggleText}>
                      {showHubDropdown ? '▴' : '▾'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {trimmedHubQuery.length > 0 && hubSuggestion.bestMatch && (
                  <TouchableOpacity
                    testID="hub-quick-suggest"
                    style={styles.quickSuggestBar}
                    onPress={acceptBestHubSuggestion}
                  >
                    <Text style={styles.quickSuggestText}>
                      {formatLootTrade(tLootTrade('form.bindHubsSuggestAction'), {
                        name: hubSuggestion.bestMatch.name,
                      })}
                    </Text>
                  </TouchableOpacity>
                )}

                {showHubDropdown && (
                  <View style={styles.hubDropdownMenu}>
                    <ScrollView
                      style={styles.hubDropdownScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {combinedHubs.length === 0 && !canCreateNewHubInline ? (
                        <Text style={styles.hubDropdownEmpty}>
                          {tLootTrade('form.bindHubsEmptyList')}
                        </Text>
                      ) : (
                        <>
                          {hubSuggestion.matches.length === 0 && !canCreateNewHubInline && (
                            <Text style={styles.hubDropdownEmpty}>
                              {tLootTrade('form.bindHubsNoMatch')}
                            </Text>
                          )}

                          {hubSuggestion.matches.map((hubItem) => {
                            const selected = selectedHubIds.includes(hubItem.id);
                            const isBest = Boolean(
                              trimmedHubQuery.length > 0
                              && hubSuggestion.bestMatch?.id === hubItem.id,
                            );
                            return (
                              <TouchableOpacity
                                key={hubItem.id}
                                style={[
                                  styles.hubDropdownItem,
                                  isBest && styles.hubDropdownItemSuggested,
                                  selected && styles.hubDropdownItemSelected,
                                ]}
                                onPress={() => toggleHubFromDropdown(hubItem.id)}
                              >
                                <Text
                                  style={[
                                    styles.hubDropdownItemText,
                                    (selected || isBest) && styles.hubDropdownItemTextHighlight,
                                  ]}
                                >
                                  {hubItem.name}
                                </Text>
                                <Text style={styles.hubDropdownItemMark}>
                                  {selected ? '✓' : '+'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}

                          {canCreateNewHubInline && (
                            <TouchableOpacity
                              testID="hub-inline-create"
                              style={styles.hubDropdownCreateItem}
                              disabled={creatingHub}
                              onPress={handleCreateHubInline}
                            >
                              <Text style={styles.hubDropdownCreateText}>
                                {formatLootTrade(tLootTrade('form.bindHubsCreateNew'), {
                                  name: trimmedHubQuery,
                                })}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.hintText}>{tLootTrade('form.bindHubsHint')}</Text>
              </>
            )}

            <Text style={styles.label}>{tLootTrade('form.descriptionLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder={tLootTrade('form.descriptionPlaceholder')}
              placeholderTextColor="#8c8c8c"
              multiline
            />

            {isMerchant && (
              <>
                <IconText style={styles.label}>{tLootTrade('form.merchantCapsLabel')}</IconText>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    testID="merchant-caps-minus"
                    style={styles.stepBtn}
                    onPress={() => stepCaps(-1)}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    testID="merchant-caps-input"
                    style={styles.counterInput}
                    value={capsCount}
                    onChangeText={setCapsCount}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity
                    testID="merchant-caps-plus"
                    style={styles.stepBtn}
                    onPress={() => stepCaps(1)}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.unitSegments}>
                  {[QUANTITY_UNIT.PCS, QUANTITY_UNIT.CD, QUANTITY_UNIT.D20].map((uKey) => {
                    const active = capsUnit === uKey;
                    return (
                      <TouchableOpacity
                        key={uKey}
                        testID={`merchant-unit-${uKey}`}
                        style={[
                          styles.unitSeg,
                          uKey === QUANTITY_UNIT.CD && styles.unitSegCd,
                          active && styles.unitSegActive,
                        ]}
                        onPress={() => setCapsUnit(uKey)}
                      >
                        {uKey === QUANTITY_UNIT.CD ? (
                          <CdIcon size={38} />
                        ) : uKey === QUANTITY_UNIT.D20 ? (
                          <MaterialCommunityIcons name="dice-d20" size={32} color={ADMIN_MODAL_PALETTE.text} />
                        ) : (
                          <Text style={[styles.unitSegText, active && styles.unitSegTextActive]}>
                            {tLootTrade('itemConfig.unitPcs')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.label}>{tLootTrade('form.saleMarkupLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={saleMarkup}
                  onChangeText={setSaleMarkup}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.hintText}>{tLootTrade('form.saleMarkupHint')}</Text>

                <Text style={styles.label}>{tLootTrade('form.buyDepreciationLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={buyDepreciation}
                  onChangeText={setBuyDepreciation}
                  keyboardType="number-pad"
                />
                <Text style={styles.hintText}>{tLootTrade('form.buyDepreciationHint')}</Text>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              testID="container-form-save"
              style={[styles.btn, styles.saveBtn]}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>{tLootTrade('form.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{tLootTrade('form.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  card: {
    width: '90%',
    maxWidth: 520,
    maxHeight: '84%',
    backgroundColor: ADMIN_MODAL_PALETTE.surface,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: ADMIN_MODAL_PALETTE.accent,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  title: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 10 },
  label: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  warnText: {
    color: '#e57373',
    fontSize: 12,
    paddingVertical: 6,
  },
  hintText: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  roomChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  roomChipActive: {
    backgroundColor: ADMIN_MODAL_PALETTE.accent,
    borderColor: '#d4af37',
  },
  roomChipName: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
  },
  roomChipCode: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 11,
  },
  roomChipTextActive: {
    color: ADMIN_MODAL_PALETTE.accentText,
  },
  selectedHubPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  selectedHubPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderWidth: 1,
    borderColor: ADMIN_MODAL_PALETTE.accent,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedHubPillText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
  },
  selectedHubPillRemove: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '700',
  },
  hubComboRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    overflow: 'hidden',
  },
  hubComboRowActive: {
    borderColor: '#d4af37',
  },
  hubInputWrap: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  ghostOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  ghostTextLine: {
    fontSize: 14,
  },
  ghostTypedTransparent: {
    color: 'transparent',
    fontSize: 14,
  },
  ghostCompletion: {
    color: 'rgba(240, 230, 140, 0.5)',
    fontSize: 14,
  },
  hubComboInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    backgroundColor: 'transparent',
  },
  hubDropdownToggle: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#484848',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
  },
  hubDropdownToggleText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
  },
  quickSuggestBar: {
    marginTop: 5,
    alignSelf: 'flex-start',
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderWidth: 1,
    borderColor: '#d4af37',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickSuggestText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 12,
    fontWeight: '700',
  },
  hubDropdownMenu: {
    marginTop: 5,
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    borderRadius: 5,
    overflow: 'hidden',
  },
  hubDropdownScroll: {
    maxHeight: 170,
  },
  hubDropdownEmpty: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    lineHeight: 16,
  },
  hubDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: ADMIN_MODAL_PALETTE.borderMuted,
  },
  hubDropdownItemSuggested: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  hubDropdownItemSelected: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  hubDropdownItemText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  hubDropdownItemTextHighlight: {
    color: ADMIN_MODAL_PALETTE.text,
    fontWeight: '700',
  },
  hubDropdownItemMark: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
  },
  hubDropdownCreateItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
  },
  hubDropdownCreateText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 13,
    fontWeight: '700',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 4,
  },
  stepBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    width: 40,
    height: 40,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#666666',
  },
  stepBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 20,
    fontWeight: '700',
  },
  counterInput: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderWidth: 1,
    borderColor: '#777777',
    borderRadius: 5,
    width: 108,
    height: 40,
    textAlign: 'center',
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 18,
    fontWeight: '700',
  },
  unitSegments: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  unitSeg: {
    minWidth: 58,
    height: 40,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  unitSegCd: {
    paddingHorizontal: 9,
  },
  unitSegActive: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderColor: ADMIN_MODAL_PALETTE.accent,
  },
  unitSegText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 14,
    fontWeight: '700',
  },
  unitSegTextActive: {
    color: ADMIN_MODAL_PALETTE.text,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.selected,
    borderColor: ADMIN_MODAL_PALETTE.accent,
  },
  saveBtnText: {
    color: ADMIN_MODAL_PALETTE.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: ADMIN_MODAL_PALETTE.surfaceRaised,
    borderColor: '#777777',
  },
  cancelBtnText: {
    color: ADMIN_MODAL_PALETTE.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ContainerFormModal;
