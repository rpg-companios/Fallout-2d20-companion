// domain/perks/snakeater.js
// +2 сопротивление яду (нельзя взять, если есть иммунитет к яду)

export const snakeaterPerk = {
  id: 'snakeater',
  apply(ctx) {
    const hasImmunity = ctx.resolve('immunity.poison');

    if (hasImmunity) {
      return { poisonResistance: 0 };
    }

    return { poisonResistance: 2 };
  },
};
