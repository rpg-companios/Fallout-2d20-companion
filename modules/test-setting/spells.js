// ТЕСТОВЫЙ СЕТТИНГ — 5 заклинаний (данные, МК-2, патч 285).
//
// Заклинание тратит манну (спека: «заклинания тратят манну») и открывается
// гейтом «навык ранга 4» (спека: «заклинания с гейтом "навык ранга 4"»).
// Эффекты (урон, щиты) — следующий слой (мини-экран, патч 286); здесь —
// контрактные данные: стоимость и требование.

export const SPELL_REQUIREMENT = { paramId: 'test.skill.sorcery', minRank: 4 };

export const SPELLS = [
  {
    id: 'test.spell.fireArrow',
    name: 'Огненная стрела',
    manaCost: 3,
    requirement: SPELL_REQUIREMENT,
    description: 'Выстрел сгустком огня по одной цели.',
  },
  {
    id: 'test.spell.iceShield',
    name: 'Ледяной щит',
    manaCost: 2,
    requirement: SPELL_REQUIREMENT,
    description: 'Щит изо льда, гасящий входящий урон.',
  },
  {
    id: 'test.spell.lightning',
    name: 'Молния',
    manaCost: 4,
    requirement: SPELL_REQUIREMENT,
    description: 'Разряд молнии по одной цели.',
  },
  {
    id: 'test.spell.healing',
    name: 'Исцеление',
    manaCost: 3,
    requirement: SPELL_REQUIREMENT,
    description: 'Возвращает несколько очков здоровья.',
  },
  {
    id: 'test.spell.voidStep',
    name: 'Пустотный шаг',
    manaCost: 5,
    requirement: SPELL_REQUIREMENT,
    description: 'Мгновенный перенос на короткую дистанцию.',
  },
];
