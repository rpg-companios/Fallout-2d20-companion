import { resolveKitItems } from './kitResolver.js';
import {
  getEquipmentCatalog as getFalloutEquipmentCatalog,
  getEquipmentData as getFalloutEquipmentData,
} from './catalog/equipmentCatalog.js';
import { FALLOUT_CATALOG_DATABASE_ROWS } from './catalog/databaseRows.js';
import {
  getItemId as getFalloutItemId,
  getCanonicalItemId as getFalloutCanonicalItemId,
  generateItemId as generateFalloutItemId,
  generateStackKey as generateFalloutStackKey,
  generateItemIdForItem as generateFalloutItemIdForItem,
  generateStackKeyForItem as generateFalloutStackKeyForItem,
  getFalloutWeaponDisplayStackKey,
  findFalloutUnequippedItemByDisplayStackKey,
} from './logic/itemIdentity.js';
import {
  inferFalloutItemTypeFromId,
  inferFalloutItemTypeFromItem,
  classifyFalloutItem,
  FALLOUT_ITEM_TYPE_IDS,
  FALLOUT_CATALOG_ITEM_TYPE_CANDIDATES,
  getFalloutArmorCategoryKey,
  getFalloutProtectionKind,
  isFalloutArmorLikeItem,
  isFalloutAmmoItem,
} from './logic/itemType.js';
import {
  getFalloutCategoryIcon,
  getFalloutItemTypeIcon,
  getFalloutItemTypeLabel,
  getFalloutRandomLootCatalog,
} from './logic/inventoryPresentation.js';
import {
  buildFalloutAddItemCatalogTree,
  formatFalloutFilterResultsFound,
  getFalloutAllCategoryLabel,
  getFalloutEquipmentFilterLabels,
  getFalloutGearCategoryLabels,
  getFalloutSearchableItems,
  getFalloutWeaponTypeGroups,
} from './logic/inventoryCatalog.js';
import {
  findFalloutCatalogEntry,
  getFalloutPowerArmorData,
} from './logic/catalogLookup.js';
import { getFalloutRobotLimbCatalog } from './logic/robotCatalog.js';
import {
  getFalloutRobotArmForWeapon,
  getFalloutRobotBodyConfiguration,
  hasFalloutRobotWeaponHoldingLimb,
  isFalloutRobotLimbItem,
  isFalloutRobotOnlyItem,
} from './logic/robotInventory.js';
import { applyFalloutResourceMutation } from './logic/radiationResource.js';
import { expandFalloutCatalogItems } from './logic/packMerge.js';
import {
  blocksFalloutArmorOver,
  canEquipFalloutArmor,
  canEquipFalloutClothing,
  canEquipFalloutWeapon,
  resolveFalloutTargetLayer,
} from './logic/equipEligibility.js';
import { getFalloutEquipmentAlert } from './inventoryFeatures/equipmentAlerts.js';
import { normalizeDurabilityItemState } from './inventoryFeatures/durability.js';
import { FALLOUT_ITEM_PARAMETER_FIELDS } from './logic/itemParameters.js';
import {
  FALLOUT_ITEM_INSTANCE_FIELDS,
  FALLOUT_ITEM_SAVE_STATE_FIELDS,
  getFalloutCatalogItemId,
  getFalloutItemCatalogId,
  resolveFalloutCatalogIdForNewItem,
  createFalloutItemIdentityFields,
  getFalloutStoredItemName,
} from './logic/itemInstanceFields.js';
import {
  mapFalloutItemContainers,
  slimFalloutSettingContainers,
} from './saves/saveSlimming.js';
import { describeFalloutItemBasics } from './logic/itemBasics.js';
import {
  describeWeaponModChanges,
  getFalloutWeaponAmmoNames,
  getWeaponDisplayPriority,
  resolveAmmoName,
  resolveWeaponDamageType,
  resolveWeaponEffects,
  resolveWeaponQualities,
  sortWeaponsForDisplay,
  weaponEffectsLabel,
  weaponModRowDescription,
  weaponQualitiesLabel,
} from './logic/weaponDisplay.js';
import {
  applyFalloutArmorModToItem,
  applyFalloutArmorMods,
  filterFalloutModsByInventory,
  formatFalloutArmorModBonuses,
  getAvailableFalloutArmorMods,
  getFalloutArmorCategoryConfig,
  isFalloutUniqueModAllowedForArmor,
} from './logic/armorMods.js';
import { applyFalloutWeaponMods } from './logic/weaponModifiers.js';
import { applyFalloutStoredItemModifiers } from './logic/storeItemModifiers.js';
import {
  equipFalloutPowerArmorInventoryItem,
  getFalloutPowerArmorInventoryItemPresentation,
  getFalloutPowerArmorStackKey,
  initializeFalloutPowerArmorAcquisition,
  isFalloutLootBonusEligibleItem,
  isFalloutPackedPowerArmorItem,
} from './inventoryFeatures/powerArmorAcquisition.js';
import { enrichFalloutWeaponItemWithNames, resolveFalloutItem } from './logic/itemResolution.js';
import { getOriginImage } from './originImages.js';
import { getFalloutEnrichedOrigins } from './originPresentation.js';
import { tCharacterScreen } from './screens/CharacterScreen/logic/characterScreenI18n.js';
import { getPerkDisplay } from './screens/PerksAndTraitsScreen/perksDisplay.js';
import { tInventory } from 'engine:components/screens/InventoryScreen/logic/inventoryI18n';
import CraftingModal from './screens/InventoryScreen/modals/CraftingModal.js';
import CapsModal from './screens/InventoryScreen/modals/CapsModal.js';
import RepairModal from './screens/InventoryScreen/modals/RepairModal.js';
import {
  buildFalloutPowerArmorInventoryRows,
  getFalloutPowerArmorCatalogItems,
  isFalloutPowerArmorInventoryRow,
  renderFalloutPowerArmorInventoryRow,
} from './screens/InventoryScreen/powerArmorInventoryRows.js';
import EquipmentFilterModal from './screens/InventoryScreen/modals/EquipmentFilterModal.js';
import {
  repairAffordableFor,
  repairAffordableForPiece,
  juryRiggingRanksFor,
  itemRarityFor,
} from './repair/operations.js';
import { salvageItem } from './salvage/operations.js';
import { getFalloutSalvageInventoryPresentation } from './salvage/inventoryPresentation.js';
import { buildSalvageReport } from './salvage/report.js';
import { rollFoundItemBonuses, sumFoundItemBonus } from './loot/foundItemBonus.js';
import { applyLoadAndFireToWeapon } from './perks/loadAndFire.js';
import { rerollConsumableRadiationRoll } from './consumables/radiation.js';
import { handleFalloutInventoryConsumableUse } from './consumables/inventoryUse.js';
import { buildConsumableResultReport } from './consumables/resultReport.js';
import { FALLOUT_ALERTS } from './alerts/catalog.js';
import {
  clampRangeIndex,
  rangeToIndex,
  rangeToName,
  indexToRangeName,
  shiftRange,
  resolveWeaponRangeFields,
} from './logic/weaponRange.js';
import { getCurrentModuleLocale } from 'engine:i18n/locale';
import ruAppI18n from './i18n/ru-RU/App.json';
import enAppI18n from './i18n/en-EN/App.json';
import { createFalloutPowerArmorActions } from './store/powerArmorActions.js';
import { createFalloutRobotActions } from './store/robotActions.js';
import {
  FALLOUT_ROBOT_STATE_EXTENSION_KEY,
  createInitialFalloutRobotState,
  getFalloutRobotState,
} from './store/robotState.js';
import {
  FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
  createInitialFalloutPowerArmorState,
  selectFalloutPowerArmorState,
} from './store/powerArmorState.js';
import { FALLOUT_CONSUMABLE_CAPABILITY } from './consumables/orchestration.js';
import { FALLOUT_DISEASE_CAPABILITY } from './diseases/orchestration.js';
import { completeFalloutLegacyCharacterLoad } from './migrations/legacyCharacter.js';
import { prepareFalloutCharacterLoad } from './saves/characterLoad.js';
import { getFalloutCharacterSnapshotFields } from './saves/characterSave.js';
import {
  migrateWeaponModIdsToCanonical,
  repairMisroutedWeaponMods,
} from './migrations/weaponModCanonical.js';
import { canonizeLoadedCharacterItems } from './migrations/kitItemCanonical.js';
import {
  buildEquipmentFilterOptions,
  emptyEquipmentFilter,
  activeEquipmentFilterCount,
  countFoundItems,
  isEquipmentFilterEmpty,
  pruneTreeByEquipmentFilter,
} from './logic/equipmentFilter.js';
import currencyIcon from './assets/backgrounds/caps.png';
import {
  selectDurabilitySettings,
  initializeDurabilityOnAcquisition,
  getDurabilityPresentation,
} from './inventoryFeatures/durability.js';
import {
  FUSION_CORE_ID,
  adjustPieceHp,
  applyAttributeModifierValue,
  applyFrameAttributeModifiers,
  canEquipPowerArmor,
  canEquipPowerArmorPiece,
  createEmptyEquippedPowerArmor,
  createEmptyPowerArmorRuntime,
  drainActiveCore,
  equipPowerArmorPiece,
  findChargedFusionCores,
  fusionCoreStackKey,
  getFrameAttributeModifiers,
  hasFrame,
  insertCore,
  isFusionCoreItem,
  isPieceBroken,
  isFalloutPowerArmorItem,
  isPowerArmorFrame,
  needsRepair,
  packPackage,
  pickFusionCore,
  powerArmorFrameStackKey,
  powerArmorPieceStackKey,
  powerArmorSlotsFor,
  repairPowerArmorPiece,
  resolvePowerArmorPieceTarget,
  rollNewFusionCoreCharges,
  suppressesLayerAt,
  tickCoreAccumulator,
  unpackPackage,
} from './logic/powerArmor.js';
import {
  canReplaceArmWeapon,
  deserializeSlot,
  isArmAttachment,
  isSlimSlot,
  serializeSlot,
  slotsForLimbType,
  toModIds,
} from './logic/robotSlots.js';
import {
  createFalloutModifierInstance,
  getFalloutAdditionalModifierRoles,
  getFalloutModifierIdSets,
  getFalloutModifierRecordId,
  shouldPreserveFalloutUnmatchedModifier,
} from './logic/robotWeaponMods.js';
import {
  applyLimbReplacement,
  canEquipRobotArmor,
  canEquipWeaponToSlot,
  canReplaceLimb,
  createEmptyRobotSlots,
  findFreeWeaponHand,
  getBuiltinWeaponsFromSlots,
  getRobotSlotKeys,
  initRobotSlots,
  isFalloutRobotCharacter,
} from './logic/robotEquip.js';
import {
  applyMk2Driver,
  getFalloutRobotInventoryRowState,
  runFalloutRobotInventoryAction,
} from './logic/robotMk2.js';
import { handleFalloutRobotWeaponEquip } from './inventoryFeatures/robotWeaponEquip.js';
import {
  handleFalloutRobotWeaponUnequip,
  isFalloutRobotWeaponActionLocked,
} from './inventoryFeatures/robotWeaponUnequip.js';
import { selectRobotArmPartsStrictReplace } from './settingsSelectors.js';
import { getSurvivalRules } from 'engine:domain/registry';
import { getCanonicalAttributeKey } from './logic/characterCreation.js';
import { getPerkEffect } from './perks/effects/index.js';
import {
  isMetalArmorCatalogId,
  wearingGlareOpticsInEquippedArmor,
} from './perks/effects/inShiningArmor.js';

const getFalloutPerkCharacterContext = (context = {}) => {
  const robotState = context.stateExtensions?.[FALLOUT_ROBOT_STATE_EXTENSION_KEY];
  const powerArmorState = context.stateExtensions?.[FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY];
  const equippedPowerArmor = powerArmorState?.equippedPowerArmor;
  const maxFoodLevel = getSurvivalRules()?.max?.food;
  const wellFed = Number.isFinite(maxFoodLevel)
    && (context.stateExtensions?.survival?.food ?? 0) >= maxFoodLevel;

  return {
    isRobot: context.isRobot === true || isFalloutRobotCharacter({ origin: context.origin, trait: context.trait }),
    robotSlots: robotState?.slots
      || context.equipmentState?.robotSlots
      || context.equipmentState?.equippedRobotSlots
      || {},
    equippedRobotSlots: robotState?.slots
      || context.equipmentState?.equippedRobotSlots
      || context.equipmentState?.robotSlots
      || {},
    powerArmorFrameId: equippedPowerArmor?.frame?.catalogId || null,
    wellFed,
  };
};

const getFalloutPerkSelectionIneligibility = (perk, context = {}) => (
  (perk?.requirements?.notForRobots || perk?.prerequisites?.notForRobots) && context.isRobot
    ? 'robot'
    : null
);

const getFalloutPerkEquipmentContext = (equippedArmor = {}) => ({
  wearingMetalArmor: Object.values(equippedArmor || {}).some((slotRow) => {
    const piece = slotRow?.armor || null;
    return isMetalArmorCatalogId(piece?.weaponId || piece?.id || '');
  }),
  wearingGlareOptics: wearingGlareOpticsInEquippedArmor(equippedArmor),
});

const getFalloutPowerArmorItemData = (item) => {
  const itemId = item?.weaponId || item?.catalogId || item?.id;
  if (!itemId) return null;
  return getFalloutPowerArmorCatalogItems(getFalloutPowerArmorData())
    .find((entry) => entry?.id === itemId) ?? null;
};

const buildFalloutRepairInventoryAction = ({ target, available, affordable }) => {
  const freeRepair = juryRiggingRanksFor() > 0;
  if (!available) return null;
  return {
    label: tInventory(freeRepair ? 'screen.repair.actions.repair' : 'screen.repair.actions.remake'),
    enabled: freeRepair || Boolean(affordable),
    target,
  };
};

const getFalloutItemRepairAction = (item, { available = false } = {}) => (
  buildFalloutRepairInventoryAction({
    available,
    affordable: item?.id ? repairAffordableFor(item.id) : false,
    target: { storeItemId: item?.id, name: item?.name },
  })
);

const getFalloutEquipmentRowRepairAction = (item) => (
  buildFalloutRepairInventoryAction({
    available: item?.showRepair === true,
    affordable: item?.pieceCatalogId ? repairAffordableForPiece(item.pieceCatalogId) : false,
    target: { equippedSlot: item?.paSlot, name: item?.name },
  })
);

const getFalloutStructuredEquipmentRowActions = (item, {
  getAction = () => () => undefined,
  setExpanded = () => undefined,
  openRepair = () => undefined,
} = {}) => ({
  onUnequipPackage: getAction('unequipPackage'),
  onToggleContents: () => setExpanded((expanded) => !expanded),
  onRepairPiece: () => openRepair({ equippedSlot: item?.paSlot, name: item?.name }),
  onUnequipPiece: () => getAction('unequipPiece')?.(item?.paSlot),
});

const getFalloutRobotInventoryPresentation = (item, context = {}) => {
  const state = getFalloutRobotInventoryRowState(item, {
    origin: context.origin,
    robot: context.equipmentState,
  });
  return {
    statusLabel: state.statusLabelKey ? tInventory(state.statusLabelKey) : null,
    actions: (state.actions ?? []).map((action) => ({
      ...action,
      label: tInventory(action.labelKey),
    })),
  };
};

const runFalloutRobotInventoryActionWithPresentation = (action, context = {}) => {
  const result = runFalloutRobotInventoryAction(action, context);
  if (!result?.alert) return result;
  return {
    ...result,
    alert: {
      title: tInventory(result.alert.titleKey),
      message: tInventory(result.alert.messageKey),
    },
  };
};

const rollFalloutInventoryLootBonuses = (perkBonuses, itemType, item = null) => (
  isFalloutLootBonusEligibleItem(item)
    ? rollFoundItemBonuses(perkBonuses, itemType, item)
    : []
);

const FALLOUT_INVENTORY_FEATURES = Object.freeze({
  crafting: Object.freeze({ Modal: CraftingModal }),
  repair: Object.freeze({
    Modal: RepairModal,
    selectInventoryDependency: (state) => state?.selectedPerks ?? null,
    getInventoryAction: getFalloutItemRepairAction,
    getEquipmentRowAction: getFalloutEquipmentRowRepairAction,
  }),
  durability: Object.freeze({
    selectSettings: selectDurabilitySettings,
    initializeAcquisition: initializeDurabilityOnAcquisition,
    getPresentation: getDurabilityPresentation,
  }),
  powerArmor: Object.freeze({
    id: 'powerArmor',
    actionIds: Object.freeze({
      equipPackage: 'equipPowerArmorPackage',
      equipPiece: 'equipPowerArmorPieceInto',
      unequipPackage: 'unequipPowerArmorPackage',
      unequipPiece: 'unequipPowerArmorPieceAt',
    }),
    stateExtensionKey: FALLOUT_POWER_ARMOR_STATE_EXTENSION_KEY,
    createInitialState: createInitialFalloutPowerArmorState,
    getState: selectFalloutPowerArmorState,
    getInventoryState: (state) => selectFalloutPowerArmorState(state).equippedPowerArmor,
    getCatalogData: getFalloutPowerArmorData,
    getCatalogItems: () => getFalloutPowerArmorCatalogItems(getFalloutPowerArmorData()),
    getStackKey: getFalloutPowerArmorStackKey,
    getInventoryItemPresentation: (item) => getFalloutPowerArmorInventoryItemPresentation(
      item,
      getFalloutPowerArmorItemData,
    ),
    isPackedItem: isFalloutPackedPowerArmorItem,
    handlesItem: isFalloutPowerArmorItem,
    getEquipEligibility: (item, context = {}) => {
      if (!isFalloutPowerArmorItem(item)) return null;
      const result = canEquipPowerArmor(item, context);
      return {
        handled: true,
        ...result,
        alert: result.allowed ? null : getFalloutEquipmentAlert('equipment', result.reason),
      };
    },
    equipInventoryItem: (item, { getAction = () => () => undefined } = {}) => (
      equipFalloutPowerArmorInventoryItem(item, {
        equipPackage: getAction('equipPackage'),
        equipPiece: getAction('equipPiece'),
      })
    ),
    initializeAcquisition: (item, options) => initializeFalloutPowerArmorAcquisition(item, {
      ...options,
      getCatalogItemData: getFalloutPowerArmorItemData,
    }),
    getInventoryRows: ({ equipmentState, equipmentCatalog, expanded = false } = {}) => (
      buildFalloutPowerArmorInventoryRows({
        equippedPowerArmor: equipmentState,
        equipmentCatalog,
        catalogItems: getFalloutPowerArmorCatalogItems(getFalloutPowerArmorData()),
        expanded,
        itemTypeId: FALLOUT_ITEM_TYPE_IDS.powerArmor,
        fusionCoreId: FUSION_CORE_ID,
        hasFrame,
      })
    ),
    getInventoryRowActions: getFalloutStructuredEquipmentRowActions,
    isInventoryRow: isFalloutPowerArmorInventoryRow,
    renderInventoryRow: renderFalloutPowerArmorInventoryRow,
    createActions: createFalloutPowerArmorActions,
    isFusionCoreItem,
    fusionCoreStackKey,
    isFrame: isPowerArmorFrame,
    pieceStackKey: powerArmorPieceStackKey,
    frameStackKey: powerArmorFrameStackKey,
    rollNewFusionCoreCharges,
    hasFrame,
    fusionCoreId: FUSION_CORE_ID,
    isItem: isFalloutPowerArmorItem,
    getEquipButtonRestriction: (item, { isCompatibleCharacter, isEquipped } = {}) => (
      isCompatibleCharacter && !isEquipped && isFalloutPowerArmorItem(item)
        ? { hidden: true, message: tInventory('screen.alerts.manipulatorRequiredTitle') }
        : null
    ),
    createEmptyEquippedPowerArmor,
    createEmptyPowerArmorRuntime,
    tickCoreAccumulator,
    drainActiveCore,
    packPackage,
    unpackPackage,
    insertCore,
    equipPowerArmorPiece,
    canEquipPowerArmorPiece,
    findChargedFusionCores,
    pickFusionCore,
    getSlotsForItem: powerArmorSlotsFor,
    resolvePieceTarget: resolvePowerArmorPieceTarget,
    repairPiece: repairPowerArmorPiece,
    adjustPieceHp,
    needsRepair,
    isPieceBroken,
    suppressesLayerAt,
    getFrameAttributeModifiers,
    applyAttributeModifierValue,
    applyFrameAttributeModifiers,
  }),
  robotEquipment: Object.freeze({
    id: 'robotEquipment',
    actionIds: Object.freeze({
      setSlots: 'setEquippedRobotSlots',
      setModules: 'setEquippedRobotModules',
    }),
    stateExtensionKey: FALLOUT_ROBOT_STATE_EXTENSION_KEY,
    createInitialState: createInitialFalloutRobotState,
    getState: getFalloutRobotState,
    getEquipmentSlots: (state) => state?.slots ?? null,
    createActions: createFalloutRobotActions,
    handleWeaponEquip: handleFalloutRobotWeaponEquip,
    handleWeaponUnequip: handleFalloutRobotWeaponUnequip,
    isWeaponActionLocked: isFalloutRobotWeaponActionLocked,
    isApplicableCharacter: isFalloutRobotCharacter,
    selectSettings: selectRobotArmPartsStrictReplace,
    getBodyConfiguration: getFalloutRobotBodyConfiguration,
    hideInventoryItem: isFalloutRobotLimbItem,
    isRobotOnlyItem: isFalloutRobotOnlyItem,
    getArmForWeapon: getFalloutRobotArmForWeapon,
    hasWeaponHoldingLimb: hasFalloutRobotWeaponHoldingLimb,
    getEquipButtonRestriction: ({
      item,
      isCompatibleCharacter,
      isWeapon,
      isEquipped,
      equipmentState,
      equipmentCatalog,
    } = {}) => (
      isCompatibleCharacter
      && isWeapon
      && !isEquipped
      && !hasFalloutRobotWeaponHoldingLimb(equipmentState?.slots ?? {})
      && !getFalloutRobotArmForWeapon(item, equipmentCatalog)
        ? { hidden: true, message: tInventory('screen.alerts.manipulatorRequiredTitle') }
        : null
    ),
    getInventoryRowState: getFalloutRobotInventoryPresentation,
    runInventoryAction: runFalloutRobotInventoryActionWithPresentation,
    applyMk2Driver,
    createEmptyRobotSlots,
    getRobotSlotKeys,
    initRobotSlots,
    applyLimbReplacement,
    canReplaceLimb,
    canEquipRobotArmor,
    canEquipWeaponToSlot,
    getBuiltinWeaponsFromSlots,
    getWeaponsForDisplay: ({ isCompatibleCharacter, slots, equippedWeapons = [] } = {}) => (
      isCompatibleCharacter
        ? getBuiltinWeaponsFromSlots(slots || {})
        : equippedWeapons.filter((weapon) => weapon?.isBuiltin || weapon?.isManipulator || weapon?.sourceSlot)
    ),
    findFreeWeaponHand,
    slotsForLimbType,
    isArmAttachment,
    canReplaceArmWeapon,
    deserializeSlot,
    isSlimSlot,
    serializeSlot,
    toModIds,
  }),
  itemBreakdown: Object.freeze({
    execute: salvageItem,
    getInventoryPresentation: (item, state) => (
      isFalloutPackedPowerArmorItem(item)
        ? null
        : getFalloutSalvageInventoryPresentation(item, state)
    ),
    buildReport: buildSalvageReport,
  }),
  equipmentEligibility: Object.freeze({
    canEquipArmor: canEquipFalloutArmor,
    canEquipWeapon: canEquipFalloutWeapon,
    canEquipClothing: canEquipFalloutClothing,
    getAlert: getFalloutEquipmentAlert,
    resolveProtectionLayer: resolveFalloutTargetLayer,
    blocksArmorOverlay: blocksFalloutArmorOver,
  }),
  itemModifiers: Object.freeze({
    applyWeapon: applyFalloutWeaponMods,
    enrichWeapon: enrichFalloutWeaponItemWithNames,
    applyStoredItemModifiers: applyFalloutStoredItemModifiers,
  }),
  modifierStorage: Object.freeze({
    getCatalogModifierIdSets: getFalloutModifierIdSets,
    getAdditionalHostRoles: getFalloutAdditionalModifierRoles,
    getModifierId: getFalloutModifierRecordId,
    createModifierInstance: createFalloutModifierInstance,
    shouldPreserveUnmatched: shouldPreserveFalloutUnmatchedModifier,
  }),
  armorMods: Object.freeze({
    getCategoryConfig: getFalloutArmorCategoryConfig,
    getAvailableMods: getAvailableFalloutArmorMods,
    filterByInventory: filterFalloutModsByInventory,
    isUniqueModAllowed: isFalloutUniqueModAllowedForArmor,
    formatBonuses: formatFalloutArmorModBonuses,
    applyMod: applyFalloutArmorModToItem,
    applyMods: applyFalloutArmorMods,
  }),
  itemRarity: Object.freeze({ getForItem: itemRarityFor }),
  perkDisplay: Object.freeze({ getForId: getPerkDisplay }),
  lootBonuses: Object.freeze({
    roll: rollFalloutInventoryLootBonuses,
    sum: sumFoundItemBonus,
  }),
  weaponPresentation: Object.freeze({
    getDisplayItem: (item, perkBonuses) => applyLoadAndFireToWeapon(
      item,
      Number(perkBonuses?.loadAndFireBonus) || 0,
    ),
    qualitiesLabel: weaponQualitiesLabel,
    effectsLabel: weaponEffectsLabel,
    resolveEffects: resolveWeaponEffects,
    resolveQualities: resolveWeaponQualities,
    ammoName: resolveAmmoName,
    getAmmoNames: getFalloutWeaponAmmoNames,
    damageTypeLabel: resolveWeaponDamageType,
    getPriority: getWeaponDisplayPriority,
    sortWeapons: sortWeaponsForDisplay,
    describeModifier: describeWeaponModChanges,
    modifierRowDescription: weaponModRowDescription,
  }),
  consumables: Object.freeze({
    rerollRadiation: rerollConsumableRadiationRoll,
    useFromInventory: handleFalloutInventoryConsumableUse,
    buildResultReport: buildConsumableResultReport,
  }),
  equipmentFilter: Object.freeze({
    Modal: EquipmentFilterModal,
    buildOptions: buildEquipmentFilterOptions,
    empty: emptyEquipmentFilter,
    countActive: activeEquipmentFilterCount,
    countFound: countFoundItems,
    isEmpty: isEquipmentFilterEmpty,
    pruneTree: pruneTreeByEquipmentFilter,
    formatResultsFound: formatFalloutFilterResultsFound,
  }),
});

const FALLOUT_APP_DICTIONARIES = Object.freeze({
  'ru-RU': ruAppI18n,
  'en-EN': enAppI18n,
});

const getFalloutCharacterFilePickerDescription = ({ withExtensions = false } = {}) => {
  const dictionary = FALLOUT_APP_DICTIONARIES[getCurrentModuleLocale()];
  return withExtensions
    ? dictionary?.characterFilePicker?.withExtensions
    : dictionary?.characterFilePicker?.default;
};

/** Executable setting-owned services shared with screens through the runtime API. */
export const FALLOUT_RUNTIME_SERVICES = Object.freeze({
  cloudSync: Object.freeze({
    legacyPreferenceKey: 'fallout_cloud_sync_enabled',
  }),
  characterFiles: Object.freeze({
    getPickerDescription: getFalloutCharacterFilePickerDescription,
  }),
  home: Object.freeze({
    links: Object.freeze({
      supportUrl: 'https://boosty.to/fallout2d20ru',
      community: Object.freeze([
        Object.freeze({ id: 'website', url: 'https://fallout-2d20.ru', label: 'fallout-2d20.ru' }),
        Object.freeze({ id: 'telegram', url: 'https://t.me/fallout_2d20_russia' }),
        Object.freeze({ id: 'vk', url: 'https://vk.com/ttrp_fallout2d20/' }),
      ]),
    }),
  }),
  storage: Object.freeze({
    sqliteDatabaseName: 'fallout_rpg.db',
    webStoragePrefix: 'fallout_db_',
    legacyCatalogTables: Object.freeze([
      'weapons', 'weapon_mods', 'weapon_mod_slots', 'ammo_types',
      'weapon_qualities', 'perks', 'items', 'perk_effects',
    ]),
  }),
  catalogs: Object.freeze({
    equipment: Object.freeze({
      getLocalized: getFalloutEquipmentCatalog,
      getMechanics: getFalloutEquipmentData,
      databaseRows: FALLOUT_CATALOG_DATABASE_ROWS,
    }),
  }),
  consumables: FALLOUT_CONSUMABLE_CAPABILITY,
  alerts: Object.freeze({ entries: FALLOUT_ALERTS }),
  characterResources: Object.freeze({ applyMutation: applyFalloutResourceMutation }),
  diseases: FALLOUT_DISEASE_CAPABILITY,
  characterLoad: Object.freeze({ prepare: prepareFalloutCharacterLoad }),
  characterSave: Object.freeze({
    getSnapshotFields: getFalloutCharacterSnapshotFields,
    mapItemContainers: mapFalloutItemContainers,
    slimSettingContainers: slimFalloutSettingContainers,
  }),
  saveMigrations: Object.freeze({
    normalizeBeforeCatalogRestore: migrateWeaponModIdsToCanonical,
    repairMisroutedWeaponMods,
    canonizeLoadedItems: canonizeLoadedCharacterItems,
    afterCharacterLoad: completeFalloutLegacyCharacterLoad,
  }),
  resolveKitItems,
  originPresentation: Object.freeze({
    getEnrichedOrigins: getFalloutEnrichedOrigins,
    getImage: getOriginImage,
  }),
  tCharacterScreen,
  perks: Object.freeze({
    getEffect: getPerkEffect,
    getRequirements: (perk) => perk?.prerequisites ?? perk?.requirements ?? {},
    getLevelRequirement: (perk) => {
      const requirements = perk?.prerequisites ?? perk?.requirements ?? {};
      return requirements.char_lvl ?? requirements.level;
    },
    getAttributeRequirements: (perk) => (
      perk?.prerequisites?.special ?? perk?.requirements?.attributes ?? {}
    ),
    getAttributeCode: getCanonicalAttributeKey,
    getCharacterContext: getFalloutPerkCharacterContext,
    getSelectionIneligibility: getFalloutPerkSelectionIneligibility,
    getEquipmentContext: getFalloutPerkEquipmentContext,
  }),
  inventory: Object.freeze({
    resolveCatalogIdForNewItem: resolveFalloutCatalogIdForNewItem,
    createItemIdentityFields: createFalloutItemIdentityFields,
    isAmmoItem: isFalloutAmmoItem,
    getStoredItemName: getFalloutStoredItemName,
    normalizeItemState: normalizeDurabilityItemState,
    itemIdentity: Object.freeze({
      getItemId: getFalloutItemId,
      getCanonicalItemId: getFalloutCanonicalItemId,
      generateItemId: generateFalloutItemId,
      generateStackKey: generateFalloutStackKey,
      generateItemIdForItem: generateFalloutItemIdForItem,
      generateStackKeyForItem: generateFalloutStackKeyForItem,
      getDisplayStackKey: getFalloutWeaponDisplayStackKey,
      findUnequippedByDisplayStackKey: findFalloutUnequippedItemByDisplayStackKey,
    }),
    range: Object.freeze({
      clampIndex: clampRangeIndex,
      toIndex: rangeToIndex,
      toName: rangeToName,
      indexToName: indexToRangeName,
      shift: shiftRange,
      resolveWeaponFields: resolveWeaponRangeFields,
    }),
    currency: Object.freeze({
    icon: currencyIcon,
    Modal: CapsModal,
    lootBonusTargetId: 'caps',
  }),
    expandCatalogItems: expandFalloutCatalogItems,
    describeItemBasics: describeFalloutItemBasics,
    resolveModifiedItem: resolveFalloutItem,
    getCatalogItemId: getFalloutCatalogItemId,
    getItemCatalogId: getFalloutItemCatalogId,
    itemInstanceFields: FALLOUT_ITEM_INSTANCE_FIELDS,
    itemSaveStateFields: FALLOUT_ITEM_SAVE_STATE_FIELDS,
    inferItemTypeFromId: inferFalloutItemTypeFromId,
    inferItemTypeFromItem: inferFalloutItemTypeFromItem,
    classifyItem: classifyFalloutItem,
    itemTypeIds: FALLOUT_ITEM_TYPE_IDS,
    getPurchaseUnitPrice: (_item, baseCost, characterState) => {
      const discount = Number(characterState?.perkBonuses?.capCollectorDiscountPercent) || 0;
      return discount > 0
        ? Math.round(baseCost * (1 - Math.min(100, discount) / 100))
        : baseCost;
    },
    getItemTypeIcon: getFalloutItemTypeIcon,
    getItemTypeLabel: getFalloutItemTypeLabel,
    getCategoryIcon: getFalloutCategoryIcon,
    getRandomLootCatalog: getFalloutRandomLootCatalog,
    getWeaponTypeGroups: getFalloutWeaponTypeGroups,
    buildAddItemCatalogTree: buildFalloutAddItemCatalogTree,
    getEquipmentFilterLabels: getFalloutEquipmentFilterLabels,
    getGearCategoryLabels: getFalloutGearCategoryLabels,
    getAllCategoryLabel: getFalloutAllCategoryLabel,
    getSearchableItems: getFalloutSearchableItems,
    catalogItemTypeCandidates: FALLOUT_CATALOG_ITEM_TYPE_CANDIDATES,
    itemParameterFields: FALLOUT_ITEM_PARAMETER_FIELDS,
    findCatalogEntry: findFalloutCatalogEntry,
    getRobotLimbCatalog: getFalloutRobotLimbCatalog,
    getProtectionKind: getFalloutProtectionKind,
    getArmorCategoryKey: getFalloutArmorCategoryKey,
    isArmorLikeItem: isFalloutArmorLikeItem,
    features: FALLOUT_INVENTORY_FEATURES,
  }),
});
