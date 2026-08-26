import React from 'react';
import SurvivorModal from './SurvivorModal';
import { tCharacterScreen } from '../../logic/characterScreenI18n';


export const traitConfig = { originId: 'ncr', modalType: 'choice' };

const NcrCitizenModal = (props) => (
  <SurvivorModal
    {...props}
    modalTitle={tCharacterScreen('modals.ncrCitizen.title')}
    originLabel={tCharacterScreen('modals.ncrCitizen.originLabel')}
  />
);

export default NcrCitizenModal;
