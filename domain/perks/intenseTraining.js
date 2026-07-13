// domain/perks/intenseTraining.js
// +1 к любому SPECIAL (макс 10)

export const intenseTrainingPerk = {
  id: 'intenseTraining',
  apply() {
    return { attributePoints: 1 };
  },
};
