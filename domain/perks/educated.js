// domain/perks/educated.js
// +1 к двум навыкам или +2 к одному (макс 6)

export const educatedPerk = {
  id: 'educated',
  apply() {
    return { skillPoints: 2 };
  },
};
