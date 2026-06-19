import React from 'react';
import SurvivorModal from './SurvivorModal';
import { tCharacterScreen } from '../../logic/characterScreenI18n';


export const traitConfig = { originId: 'ncr', modalType: 'choice' };

const NcrCitizenModal = (props) => (
  <SurvivorModal
    {...props}
    modalTitle="Черта происхождения «Житель НКР»"
    originLabel="Житель НКР"
  />
);

export default NcrCitizenModal;
