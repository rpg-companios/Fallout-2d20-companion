// domain/perks/naturalResistance.js
// Естественная стойкость (406, слово владельца): сон в пустоши
// («сон на земле» книги) не проверяется на болезнь. Токсичные пары
// в приложении не считаются — остаётся текстом перка.

export const naturalResistancePerk = {
  id: 'naturalResistance',
  apply() {
    return { sleepOnGroundDiseaseImmune: true };
  },
};
