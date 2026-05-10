import BrotherhoodModal, { traitConfig as brotherhoodConfig } from './BrotherhoodModal';
import SupermutantModal, { traitConfig as supermutantConfig } from './SupermutantModal';
import GhoulModal, { traitConfig as ghoulConfig } from './GhoulModal';
import MinutemanModal, { traitConfig as minutemanConfig } from './MinutemanModal';
import ChildOfAtomModal, { traitConfig as childOfAtomConfig } from './ChildOfAtomModal';
import VaultDwellerModal, { traitConfig as vaultDwellerConfig } from './VaultDwellerModal';
import ProtectronModal, { traitConfig as protectronConfig } from './ProtectronModal';
import AssaultronModal, { traitConfig as assaultronConfig } from './AssaultronModal';
import NcrCitizenModal, { traitConfig as ncrCitizenConfig } from './NcrCitizenModal';
import SurvivorModal, { traitConfig as survivorConfig } from './SurvivorModal';
import OutcastBrotherhoodModal, { traitConfig as outcastConfig } from './OutcastBrotherhoodModal';
import RoboBrainModal, { traitConfig as robobrainConfig } from './RoboBrainModal';
import MisterHandyModal, { traitConfig as misterHandyConfig } from './MisterHandyModal';

// Keyed by origin id (from data/origins/origins.json)
export const TRAIT_MODALS = {
  [brotherhoodConfig.originId]: BrotherhoodModal,
  [supermutantConfig.originId]: SupermutantModal,
  [ghoulConfig.originId]: GhoulModal,
  [minutemanConfig.originId]: MinutemanModal,
  [childOfAtomConfig.originId]: ChildOfAtomModal,
  [vaultDwellerConfig.originId]: VaultDwellerModal,
  [protectronConfig.originId]: ProtectronModal,
  [assaultronConfig.originId]: AssaultronModal,
  [ncrCitizenConfig.originId]: NcrCitizenModal,
  [survivorConfig.originId]: SurvivorModal,
  [outcastConfig.originId]: OutcastBrotherhoodModal,
  [robobrainConfig.originId]: RoboBrainModal,
  [misterHandyConfig.originId]: MisterHandyModal,
};

export const TRAIT_CONFIGS = {
  [brotherhoodConfig.originId]: brotherhoodConfig,
  [supermutantConfig.originId]: supermutantConfig,
  [ghoulConfig.originId]: ghoulConfig,
  [minutemanConfig.originId]: minutemanConfig,
  [childOfAtomConfig.originId]: childOfAtomConfig,
  [vaultDwellerConfig.originId]: vaultDwellerConfig,
  [protectronConfig.originId]: protectronConfig,
  [assaultronConfig.originId]: assaultronConfig,
  [ncrCitizenConfig.originId]: ncrCitizenConfig,
  [survivorConfig.originId]: SurvivorModal,
  [outcastConfig.originId]: outcastConfig,
  [robobrainConfig.originId]: robobrainConfig,
  [misterHandyConfig.originId]: misterHandyConfig,
};

export const getTraitModalComponent = (originId) => TRAIT_MODALS[originId] || null;
export const getTraitConfig = (originId) => TRAIT_CONFIGS[originId] || null;
