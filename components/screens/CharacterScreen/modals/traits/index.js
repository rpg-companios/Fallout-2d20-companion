import NcrCitizenModal, { traitConfig as ncrCitizenConfig } from './NcrCitizenModal';
import SurvivorModal, { traitConfig as survivorConfig } from './SurvivorModal';
import TribalModal, { traitConfig as tribalConfig } from './TribalModal';
import TreeFamiliesModal, { traitConfig as treeFamiliesConfig } from './TreeFamiliesModal';
import GenericTraitModal from './GenericTraitModal';
import React from 'react';

// Generic wrapper to inject originId
const createGenericModal = (originId) => {
  return (props) => <GenericTraitModal {...props} originIdForConfig={originId} />;
};

// All single-trait origins go through GenericTraitModal
// which now supports skillPickChoice internally.
const genericOrigins = [
  'superMutant',
  'ghoul',
  'childOfAtom',
  'protectron',
  'assaultron',
  'robobrain',
  'misterHandy',
  'securitron',
  'shadow',
  'synth',
  // skill-pick traits:
  'brotherhood',
  'brotherhoodOutcast',
  'minuteman',
  'vaultDweller',
];

const genericConfigs = {};
const genericModals = {};
genericOrigins.forEach(originId => {
  genericConfigs[originId] = { originId, modalType: 'choice' };
  genericModals[originId] = createGenericModal(originId);
});

export const TRAIT_MODALS = {
  // Multi-trait pickers (still custom)
  [ncrCitizenConfig.originId]: NcrCitizenModal,
  [survivorConfig.originId]: SurvivorModal,
  [tribalConfig.originId]: TribalModal,
  [treeFamiliesConfig.originId]: TreeFamiliesModal,
  ...genericModals,
};

export const TRAIT_CONFIGS = {
  [ncrCitizenConfig.originId]: ncrCitizenConfig,
  [survivorConfig.originId]: survivorConfig,
  [tribalConfig.originId]: tribalConfig,
  [treeFamiliesConfig.originId]: treeFamiliesConfig,
  ...genericConfigs,
};

export const getTraitModalComponent = (originId) => TRAIT_MODALS[originId] || null;
export const getTraitConfig = (originId) => TRAIT_CONFIGS[originId] || null;
