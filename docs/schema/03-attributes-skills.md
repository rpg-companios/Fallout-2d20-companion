# Схема: Attributes & Skills

## Атрибуты

Канонические ключи: `STR, END, PER, AGI, INT, CHA, LCK` (S.P.E.C.I.A.L., порядок в коде свой).
База: значение 4, лимиты 4–10 (`BASE_MIN/MAX`), очков на распределение: 12 (`DISTRIBUTION_POINTS`).

### Модель значения ✅
`Parameter = { base, modifiers: [{source, value, operation}], total }`.
Реализовано в `src/store/characterStore.js` (`normalizeParameter`) и
`src/store/resolvers.js` (`calculateParameterTotal`). Атрибуты в Zustand
хранятся именно в этой форме; `total` пересчитывается селектором.

### Что влияет на атрибут (источники)
| источник | вид | поле/правило | статус |
|---|---|---|---|
| распределение игрока | base | в пределах лимитов | ✅ |
| origin/трейт: бонус | `attributeBonus: {STR:2}` | +/- к значению | ✅ `getTraitAttributeBonus` |
| origin/трейт: лимиты | `attributeLimits: {STR:{min,max}}` | сдвиг потолка/пола | ✅ `getAttributeLimits` |
| доп. очки | `attributePointsBonus: N` | больше очков распределения | ✅ `getRemainingAttributePoints` |
| перки (будущее) | bonus / limit | напр. «Интенсивные тренировки» +1 очко | ☐ когда появятся перки |
| эффекты/химия (будущее) | временный modifier | напр. Buffout +STR на время | ☐ когда появятся такие эффекты |

Правило (от владельца): «бонус значения» и «расширение лимита» **независимы** —
нельзя поднять атрибут выше лимита без отдельного модификатора лимита.

### Комбинирование нескольких источников лимитов (AS-1)
**N/A пока есть только один источник.** Лимиты приходят только из
`trait.modifiers.attributeLimits`. Origin сам по себе лимитов не задаёт.
Перков/эффектов с `attributeLimits` нет.

Когда появится второй источник, нужно будет ввести стратегию combine
(вариант по умолчанию: «самый широкий» — `min` из всех `min`, `max` из
всех `max`). До этого момента — простая запись: единственный лимит-источник
побеждает; функция `getAttributeLimits` уже это делает.

---

## Навыки

Канонические ключи: `ALL_SKILL_KEYS` (`SKILL_CATALOG_ORDER` в
`domain/characterCreation.js`):
`ATHLETICS, BARTER, BIG_GUNS, ENERGY_WEAPONS, EXPLOSIVES, LOCKPICK,
MEDICINE, MELEE_WEAPONS, PILOT, REPAIR, SCIENCE, SMALL_GUNS, SNEAK,
SPEECH, SURVIVAL, THROWING, UNARMED`.

**Только UPPER_SNAKE_CASE везде** ✅ (закрыто `refactor(skills): canonical
UPPER_SNAKE_CASE everywhere`). Локализованные строки — только в
`i18n/<locale>/screens/character/screen.json#skillsCatalog`. Защита от
регрессии: тесты `domain/contract.skills.test.js` и
`domain/contract.no-cyrillic.test.js`.

База: очки навыков = `INT + 9 + (level-1)`. Тег даёт стартовые +2.
Потолок = `skillMaxValue` (default 6; на 1 уровне ≤ 3).

### Что влияет на навык (источники)
| источник | поле | статус |
|---|---|---|
| распределение игрока | base (в пределах потолка) | ✅ |
| тег (selected) | стартовые +2 | ✅ |
| extra-tagged (`forcedSkills` + tag) | стартовые +2, помечен как «бонусный» | ✅ |
| трейт: обязательные теги | `forcedSkills: ['SURVIVAL']` | ✅ |
| трейт: доп. теги | `extraSkills: N` (даёт N дополнительных тегов) | ✅ |
| трейт: потолок (общий) | `skillMaxValue: N` | ✅ `canChangeSkillValue` / `validateSkills` |

### Удалено: `skillModifiers` (AS-3)
**Поле упраздняется.** Раньше встречалось у трейта Ghoul как
`skillModifiers: { SURVIVAL: 2 }` — но (а) логика чтения отсутствовала
(`skillModifiers` никем не читался в `canChangeSkillValue` / `validateSkills`);
(б) рядом уже стояло `forcedSkills: ['SURVIVAL']`, которое в сочетании с
автотегом даёт ровно те же `+2`, что и предполагал `skillModifiers`.

Решение (от владельца): **бонусный навык** = `forcedSkills` + tag. Он:
- автоматически отмечен как extra-tagged (особый цвет в UI),
- получает стартовые +2,
- остальные ограничения (потолок) определяются обычным `skillMaxValue`.

Если в будущем понадобится **per-skill** потолок (отдельный навык растёт
выше общего `skillMaxValue`), это будет **новое** поле с явной семантикой
«сдвиг потолка», а не возвращение `skillModifiers`.

---

## Закрытые решения

- ✅ **AS-2 / T-3** (canonical skill keys везде) — закрыто `refactor(skills): canonical UPPER_SNAKE_CASE everywhere`.
- ✅ **AS-3** (`skillModifiers`) — упразднено. См. § «Удалено».
- ⏸  **AS-1** (combine нескольких источников лимитов) — N/A: пока один источник, складывать нечего.
