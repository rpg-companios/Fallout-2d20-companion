# Долги по чертам (то, что отложено после T-1/T-2/T-3)

Этот файл — **сводный реестр** конкретных game-механик, которые **сейчас
описаны строкой-меткой в `trait.modifiers.effects`**, но настоящей логики
под собой не имеют. Каждая запись фиксирует: что нужно реализовать,
от чего зависит, чем сейчас представлено.

Принцип: пока механики нет — `effects: ['<id>']` это **флаг для UI-лейбла**.
UI рендерит локализованную подпись из i18n (`labels.<id>`). Когда дойдут
руки до реализации — оставляем `effects`-флаг как UI-якорь и добавляем
рядом реальные модификаторы или новые поля.

---

## 1. Радиационный счётчик (radiation counter)

Затрагивает: `ghoul`, `childOfAtom`, и **всех остальных** персонажей
(механика урона/штрафа от накопленной радиации).

Текущие флаги:
- `ghoul.effects`: `radiation_healing` — гуль исцеляется от радиации
  («1 ОЗ за каждые 3 пункта радиационного урона», см. описание в i18n).
- `childofatom.effects`: `radiation_absorption`, `radiation_melee_charge`
  — это **части одной механики**: ребёнок атома накапливает радиацию и
  тратит её на новую атаку.

Что нужно для реализации:
- Поле `radiationCounter` в Zustand-стейте (число, ± события).
- Формула: «обычный персонаж без иммунитета теряет maxHP равный значению
  счётчика»; гуль — обратное (heal); ребёнок атома — буфер для атаки.
- UI: счётчик в шапке экрана оружия/брони (`+/-` контролы).
- Новое оружие/атака для child-of-atom на основе очков радиации.

Когда делать: вместе с экраном оружия/брони (там естественное место для UI).

---

## 2. Зависимость от Stealth Boy

Затрагивает: `shadow`.

Текущий флаг: `shadow.effects`: `stealth_boy_addiction`.

Это **новая механика эффекта**, не лейбл. Логика:
- использование Stealth Boy → бросок зависимости (по правилам Fallout-2d20);
- провал → штрафы к Perception/Intelligence/Charisma.

Когда делать: вместе с системой chem-effects / consumables.

---

## 3. UI-предупреждения «диапазон сложности» (weaponDifficultyHint)

Затрагивает: `ncr-infantryman` (плохо знаком с `ENERGY_WEAPONS` / `BIG_GUNS`),
`ncr-technique-of-descent` (наоборот — может реролл на дальнобойке) и др.

По решению владельца это **не механический модификатор**, а **подпись
в карточке оружия**: «⚠️ +2 к сложности» или «🎲 можешь перебросить 1d20».

Что нужно:
- Новое поле `weaponDifficultyHint: [{ skillKey, weaponIds?, hintI18nKey }]`
  на трейте.
- В `WeaponCard` (`WeaponsAndArmorScreen`) собрать активные хинты от
  parent + sub-traits + perks и рендерить под статами оружия.

Когда делать: вместе с UI-итерацией экрана оружия и брони.

---

## 4. UI-правила из бывшего `robotRules`

Удалено из данных (см. `refactor-traits-T1-drop-robot-dups`), но
**семантика осталась нужна**:

- `no_consumables_food_rest` (флаг на роботах) → **скрыть кнопку
  «применить препарат» / «съесть» / «выпить»** в инвентаре, когда
  персонаж — робот.
- `canEquipStandardArmor: false`, `canEquipPowerArmor: false` →
  переедут в `origin.armorRules` (см. `01b-armor-rules.md`,
  открытые C/D/E).

Когда делать: вместе с реализацией `armorRules` (закрытие 01b).

---

## 5. Picker UI для `skillPickChoice`

Затрагивает: `ncr-good-soul` (выбери 2 из 5).

Поле `skillPickChoice` уже в данных
(см. `06-modifiers.md` § 1.2). Сейчас в `CharacterScreen.js` есть хардкод
`GOOD_SOUL_SKILL_KEYS` и логика «отметить как extra-tagged» — она
работает по факту, но **читает не из данных, а из хардкода**.

Что нужно:
- Trait-модалка для good-soul (по аналогии с `BrotherhoodModal`),
  которая показывает 5 вариантов и даёт выбрать 2.
- В `CharacterScreen.handleSelectTrait` читать `skillPickChoice` из
  активного трейта и применять `extraTaggedSkills` соответственно.
- Удалить хардкод `GOOD_SOUL_SKILL_KEYS`.

Когда делать: в рамках UI-итерации траит-модалок (там уже есть
`pick` в логике китов — теперь то же самое для трейтов).

---

## 6. Built-in weapons и атаки роботов

Затрагивает: `assaultron` (`built_in_laser`, `self_destruct`),
`robobrain` (`ir_vision`, `ignore_darkness_penalty`),
`misterHandy` (`hover_movement`, `360_vision`).

Большая часть — лейблы. Но **два пункта — это реальные оружия/атаки**:

- `built_in_laser` (assaultron) — в head-слот ставится оружие
  «головной лазер» с конкретными статами; должно отображаться в
  карточке оружия экрана.
- `self_destruct` (assaultron) — это оружие/атака; нужны данные
  оружия + правила использования.

Когда делать: вместе с экраном оружия (роботы) и расширением
каталога robot-weapons.

---

## 7. Залейте сюда конкретные числа

Несколько эффектов **ждут конкретного числа** от владельца — их пока
не реализовать без уточнения:

- `minuteman.effects`: `improved_caravans`, `base_defense_4`,
  `cover_dr_bonus`, `outnumbered_damage_bonus` — что именно каждый
  делает в числе?
- `protectron.effects`: `model_check_discount` — какая скидка и на
  что?
- `vaultdweller.effects`: `luck_restore_on_complication` — сколько
  очков удачи восстанавливается и при каких complication?
- `survivor.effects`: список ещё не пройден.

Когда делать: по мере необходимости в UI.

---

## 8. Trait-модалки: единый источник данных и отсутствующие модалки

Статус: **отложенный рефакторинг**, не блокирует текущий flow.

### 8.1. Хардкод модификаторов в модалках

Сейчас большинство trait-модалок в `components/screens/CharacterScreen/modals/traits/`
задают модификаторы вручную вместо чтения из `data/traits/traits.json`.

Пример: `SupermutantModal.js` хардкодит
```js
attributes: { 'STR': 2, 'END': 2 },
minLimits: { 'STR': 6, 'END': 6 },
maxLimits: { 'STR': 12, 'END': 12, 'CHA': 6, 'INT': 6 },
```
Хотя в `data/traits/traits.json` у `supermutant-forced-evolution` уже есть
корректный объект `attributes: { STR: { baseBonus, min, max }, ... }`.

Это создаёт дублирование и риск рассинхронизации.

Цель: все модалки (кроме особых случаев) должны брать модификаторы из
`findTraitById(origin.traitIds[0])?.modifiers` и передавать их в
`CharacterScreen.handleSelectTrait()` без изменений.

### 8.2. Отсутствующие модалки

Для origins `shadow` и `synth` есть трейты в данных, но нет
соответствующих модалок в `components/screens/CharacterScreen/modals/traits/index.js`.
При выборе этих origin кнопка «Черта» открывает пустоту — trait выбрать
невозможно.

Нужно создать:
- `ShadowModal.js`
- `SynthModal.js`

и зарегистрировать их в `TRAIT_MODALS` / `TRAIT_CONFIGS` в `index.js`.

Пока отложено: `shadow` и `synth` — неиграбельные origins до реализации
модалок.

### 8.3. Целевая архитектура (рекомендация)

Вместо 13+ отдельных модалок с хардкодом лучше прийти к гибриду:

- `GenericTraitModal.js` — одна модалка для всех «info-only» трейтов
  (Supermutant, Ghoul, Protectron, Assaultron, MisterHandy, RoboBrain,
  VaultDweller, Minuteman, ChildOfAtom, OutcastBrotherhood, Shadow, Synth).
  Читает имя/описание/модификаторы из `data/traits/traits.json`.

- `SkillChoiceModal.js` — параметризуемая модалка выбора 1 навыка из
  списка, управляемая `trait.modifiers.forcedSkills` и `extraSkills`.
  Используется для `brotherhood` и, возможно, других трейтов с
  `skillPickChoice`/`forcedSkills`.

- `MultiTraitModal.js` — модалка выбора 2 черт (Survivor/NCR). Показывает
  `subTraitIds` из `ncr-resident` / `survivor-survivor` и даёт выбрать
  комбинацию. Сейчас `SurvivorModal.js` + `NcrCitizenModal.js` решают
  это локально — это допустимо, но их тоже можно свести к параметризуемой
  `MultiTraitModal`.

- `GoodSoulPickerModal.js` — вынести inline-выбор 2 навыков из
  `CharacterScreen.js` в отдельную модалку, управляемую
  `trait.modifiers.skillPickChoice` (см. § 5).

Преимущества:
- Единый источник правды — `data/traits/traits.json`.
- Добавить новый origin = добавить строку в JSON, не писать новый `.js`.
- Меньше дублирования и меньше риска рассинхронизации модификаторов.

Когда делать: отдельным этапом после стабилизации текущего flow.
Текущие модалки пока оставляем как есть (кроме удаления устаревшего
`TraitSkillModal.js`).
