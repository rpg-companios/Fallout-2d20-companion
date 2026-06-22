import BrotherhoodModal, { traitConfig as brotherhoodConfig } from './BrotherhoodModal';
import MinutemanModal, { traitConfig as minutemanConfig } from './MinutemanModal';
import VaultDwellerModal, { traitConfig as vaultDwellerConfig } from './VaultDwellerModal';
import NcrCitizenModal, { traitConfig as ncrCitizenConfig } from './NcrCitizenModal';
import SurvivorModal, { traitConfig as survivorConfig } from './SurvivorModal';
import OutcastBrotherhoodModal, { traitConfig as outcastConfig } from './OutcastBrotherhoodModal';
import GenericTraitModal from './GenericTraitModal';
import React from 'react';

const createGenericModal = (originId) => {
  return (props) => <GenericTraitModal {...props} originIdForConfig={originId} />;
};

const supermutantConfig = { originId: 'superMutant', modalType: 'info' };
const ghoulConfig = { originId: 'ghoul', modalType: 'info' };
const childOfAtomConfig = { originId: 'childOfAtom', modalType: 'info' };
const protectronConfig = { originId: 'protectron', modalType: 'info' };
const assaultronConfig = { originId: 'assaultron', modalType: 'info' };
const robobrainConfig = { originId: 'robobrain', modalType: 'info' };
const misterHandyConfig = { originId: 'misterHandy', modalType: 'info' };
const shadowConfig = { originId: 'shadow', modalType: 'info' };
const synthConfig = { originId: 'synth', modalType: 'info' };

export const TRAIT_MODALS = {
  [brotherhoodConfig.originId]: BrotherhoodModal,
  [minutemanConfig.originId]: MinutemanModal,
  [vaultDwellerConfig.originId]: VaultDwellerModal,
  [ncrCitizenConfig.originId]: NcrCitizenModal,
  [survivorConfig.originId]: SurvivorModal,
  [outcastConfig.originId]: OutcastBrotherhoodModal,
  [supermutantConfig.originId]: createGenericModal(supermutantConfig.originId),
  [ghoulConfig.originId]: createGenericModal(ghoulConfig.originId),
  [childOfAtomConfig.originId]: createGenericModal(childOfAtomConfig.originId),
  [protectronConfig.originId]: createGenericModal(protectronConfig.originId),
  [assaultronConfig.originId]: createGenericModal(assaultronConfig.originId),
  [robobrainConfig.originId]: createGenericModal(robobrainConfig.originId),
  [misterHandyConfig.originId]: createGenericModal(misterHandyConfig.originId),
  [shadowConfig.originId]: createGenericModal(shadowConfig.originId),
  [synthConfig.originId]: createGenericModal(synthConfig.originId),
};

export const TRAIT_CONFIGS = {
  [brotherhoodConfig.originId]: brotherhoodConfig,
  [minutemanConfig.originId]: minutemanConfig,
  [vaultDwellerConfig.originId]: vaultDwellerConfig,
  [ncrCitizenConfig.originId]: ncrCitizenConfig,
  [survivorConfig.originId]: survivorConfig,
  [outcastConfig.originId]: outcastConfig,
  [supermutantConfig.originId]: supermutantConfig,
  [ghoulConfig.originId]: ghoulConfig,
  [childOfAtomConfig.originId]: childOfAtomConfig,
  [protectronConfig.originId]: protectronConfig,
  [assaultronConfig.originId]: assaultronConfig,
  [robobrainConfig.originId]: robobrainConfig,
  [misterHandyConfig.originId]: misterHandyConfig,
  [shadowConfig.originId]: shadowConfig,
  [synthConfig.originId]: synthConfig,
};

export const getTraitModalComponent = (originId) => TRAIT_MODALS[originId] || null;
export const getTraitConfig = (originId) => TRAIT_CONFIGS[originId] || null;