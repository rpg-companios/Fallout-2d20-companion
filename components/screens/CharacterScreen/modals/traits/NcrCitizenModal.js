import React from 'react';
import SurvivorModal from './SurvivorModal';

export const traitConfig = { originId: 'ncr', modalType: 'choice' };

const NcrCitizenModal = (props) => (
  <SurvivorModal
    {...props}
    modalTitle="Черта происхождения «Житель НКР»"
    originLabel="Житель НКР"
  />
);

export default NcrCitizenModal;
