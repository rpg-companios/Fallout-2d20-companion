# Changelog

---

## Robots — Mod slots derived from the mods themselves, duplicate file removed (patch 306)

Owner's rule: no point keeping a separate file listing which mods live
in which slots of which weapon, when every mod record already says so
itself — via its slot and its applicability list.

- the robot/weapon_mod_slots.json file (a duplicate of the Head Laser
  capacitor knowledge) is removed;
- robot weapon slots are derived from the mods: slot + applicability;
  mod order follows the data record order;
- the mod-install dialog and ammo spending work as before — locked by
  checks: the laser has one capacitor slot with all four mods, same as
  the removed file had;
- new fuse: every robot mod must declare a slot and applicability —
  otherwise the derived slots would lose it, and the test fails before
  the mod disappears from the install dialog.

## Robots — Mods for weapons installed into a limb (patch 305)

Owner's report: the laser gun from the "assaultron_us_military" kit
(installTo: 'arm' — the weapon is part of the arm, the palm stays free)
would not accept mods. The mod-install dialog opened, the selection went
through — but the mod never stuck: the apply logic could only write mods
to the palm or the inventory, while a weapon installed into a limb lives
inside the limb itself.

- mods for installed weapons are now written into the weapon's entry
  inside the limb (both arm and head installs from kits);
- the weapon card reads mods from that entry — damage and name include
  the mod;
- the entry with mods survives save and load (the save format did not
  change — mods for installed weapons were already provided for there);
- patch 304 closed the neighbouring case (a weapon held in the palm);
  this one closes installed weapons — both carrying styles now accept
  mods.

Locked by checks in `__tests__/robot/robot-slot-model.test.js`: the card
reads mods from the entry; the write function updates only the target
entry and leaves the original map untouched; the save cycle keeps the
mod. Suite 833/833, tsc clean.

## Robots — Weapons held in a robot palm get their card (patch 304)

Owner's report: "mods won't install on the assaultron laser in the hand".
Equipping into a robot palm is allowed (weight and two-handed checks
apply), but the weapon produced no card in the attack list: robot-mounted
weapons ("not hand-held") were skipped — there was nothing to attach
mods to.

- the palm now shows everything it holds: human weapons, arm
  attachments, and robot-mounted weapons (the Head Laser);
- the only exception is the limb's own attack (claw/manipulator in an
  old save): the limb itself provides that card, no palm duplicate
  (also closes a long-standing duplicate claw card);
- the chain after the fix: card → damage with the capacitor
  (base + mod) → the ammo-spend plan sees the capacitor → mods install
  and survive the save.

Locked by checks in `__tests__/robot/assaultron-head-laser-mods.test.js`
(laser in palm: card, damage 7, 4 charges per attack; no claw duplicate).
Suite 831/831, tsc clean.

## Weapons & materials — patches 300–303 summary

- **300:** translation for the "Mod spend per attack" spend source (the
  `weapon.ammoSpend.source.ammoPerAttack` key was missing from both
  dictionaries — the dialog showed the raw key).
- **301:** the Head Laser capacitors counted in the install dialog and
  in the ammo-spend plan, but not on the weapon card — the card damage
  fell back to base (5 instead of 5+2 for Mk IV). The screen catalog's
  mod pool now matches the registry: robot mods are part of the shared
  pool.
- **302:** the knowledge "full mod pool = human + robot" lived in two
  places; after 301 the adapter's merge became redundant (robot mods
  arrived twice). The merge now lives in one place.
- **303:** materials file repair (report: "App Error: Cannot read
  properties of undefined (reading 'map')"): the materials list was
  written into the file twice, the app received "no materials", and
  junk salvaging crashed. The duplicate removed.

---

## Architecture — Ammo-spend formulas moved into the module (patch 298)

Owner's rule: a formula bound to a specific weapon quality is a MODULE
formula, not an engine one. Qualities live in the module; their spend
formulas live next to them. A formula applies while the quality is on
the weapon and disappears together with it (the enrichment pipeline
puts on and takes off mod qualities).

- `domain/mechAmmoSpend.js` removed: the engine (ammo-cell screen +
  `characterStore.spendAmmoForWeapon`) now knows only the plan contract
  `{ fixed, asks, totalFor }`;
- formulas live in `modules/fallout/weapons/weaponAmmoSpend.js`:
  `quality_ammo-hungry_x` (unconditional), `quality_crank_x` (ask up
  to X), the robot-weapon capacitor's `ammoPerAttack` (ask up to X);
- a new quality = 2 edits: a reader in the module after the crank_x
  pattern + a `weapon.ammoSpend.source.<source>` i18n key (ru/en);
  the dialog label is resolved by the source key — the screen no
  longer knows the list of sources;
- the module header carries the recipe, using semi-auto as the example
  (`quality_semi-auto_x`, "1 to 3 shots at once").

Locked by 14 checks in `__tests__/weapons/weapon-ammo-spend.test.js`,
including the new "formula applies and disappears with the quality"
group: musket with the four-crank capacitor (enrichment puts on
crank_x → the ask appears), without the mod and after removal (no
formula), head laser with Mk VI and without. Suite 825/825, tsc clean.

## Feature — universal ammo spend per shot (patch 296)

Per-shot ammo consumption is now computed by the `mechAmmoSpend` mechanism
(domain/mechAmmoSpend.js) — a sum of conditions, each either:

- **unconditional** — always spent, no questions asked: ammo-hungry
  (`ammo-hungry_x`, "spends X per shot");
- **asked** — the condition has a ceiling; the ammo cell asks "how many
  of the available charges to spend", and the confirmed amount is
  deducted: the Assaultron head laser capacitor (`ammoPerAttack`,
  Mk III–VI = 3–6 charges per attack) and the laser musket crank
  (`crank_x`, 1–4 cranks).

A weapon with no special conditions spends one charge per shot, as before.
A new spend rule is a new reader in the mechanism; the ammo-cell contract
does not change. Robot slot weapons (not inventory items) can now spend
charges too: `spendAmmoForWeapon` gained an `untrackedWeapon` mode —
spending without durability-wear tracking. The confirmation dialog lives
in the weapon card's AMMO cell (the "−" button).

Locked by 12 checks in `__tests__/domain/mech-ammo-spend.test.js`
(unconditional, asks, ceiling clamped by availability, hungry+ask combo,
head laser with Mk VI restored from a slot, musket with the four-crank
capacitor and without mods).

## Fix — Installed robot-weapon mod survived only until save (patch 294)

`toModIds` (domain/robotSlots.js) checked the `modIds` array first — even an
empty one — and never reached `appliedMods`, which is what the mod-install
modal writes. A robot slot restored from a save carries an empty
`heldWeapon.modIds`, so after installing a capacitor into the Assaultron head
laser the mod lived in `appliedMods` but the first `serializeSlot` wiped it:
the capacitor vanished and stats reverted to base. Now `appliedMods` is the
screen truth with unconditional priority; an empty object means "no mods"
(uninstalling works too), while `modIds` remains the source for slim saves
without a weapon object.

Locked by tests (`__tests__/robot/assaultron-head-laser-mods.test.js`): the
mixed form (empty `modIds` + fresh `appliedMods`), mod removal, slim saves, the
full save → screen → modal → save → screen round-trip, and pipeline application
(laser 5/115/8 + Mk III capacitor → 6/119/8).

## Fix — Assaultron head laser capacitors in the install modal (patch 293)

> Owner report (2026-09-21): "The Assaultron doesn't get mods for the head laser. They're missing from the weapon modification modal" (patch 292 applied).

- Cause: 290–291 wired the capacitors into data, catalog and registry, but `db/catalogSource.js` — the row source for the install modal — never saw them: mod-slot rows came from human `weapon_mod_slots.json` plus `ROBOT_WEAPON_BASE_MAP` inheritance (3 legacy robot weapons), while the robot's own slots file was unread; robot mods were absent from mod rows.
- Wiring: mod rows = human + robot mods (names already id-merged in the catalog, 290); mod-slot rows = human + inheritance + robot-owned slots (robot-owned wins). The modal itself is untouched: slots/mods/preview (including `damageModifier` +1..4 DC) all flow through the common path.
- Guard: +4 install-path checks in `__tests__/robot/assaultron-head-laser-mods.test.js` (slot = Capacitor; exactly 4 capacitors in rank order; resolve by id with name/cost/weight/requirements; no leakage into human weapon slots).
- Bonus from the white-screen diagnostics: `__tests__/debug/app-boot.test.js` — boot spine (App.js non-UI graph in load order; react-native modules excluded — the bundle build covers those).

---


## Architecture — Setting door and unified contract (patch 292)

> Owner's direction (2026-09-21): one import point per setting ("import the data registry"), the module folder extractable to its own repo with a bundler; the domain must be mapped: what is universal, what is setting-specific. Split criterion: a mechanic is a universal formula ("take input data, check availability, produce output, consume inputs — the setting says what that data is").

- New setting door `modules/fallout/index.js`: an 8-rule agent-facing contract header plus a single `SETTING` export (meta / data / locale names).
- `domain/registry.js`: 43 internal-file imports collapsed to one door import (getters unchanged; bindings map old local names to SETTING paths). `i18n/equipmentCatalog.js`: 93 imports down to one.
- Group manifests `junk/index.js`, `recipes/index.js`, `equipmentKits/index.js` dissolved into the door (3 files deleted). `db/catalogSource.js`: perks via the door. `InventoryScreen`: power armor via the new `getPowerArmorData()` getter.
- `docs/architecture/domain-map.md`: domain map — 4 layers (contract core / universal domain / mechanic engines / Fallout-specific), per-file table, split plan (specifics move to modules/fallout/logic in MK-3+).
- Guard `__tests__/settings/settings-boundary.test.js`: no setting-internal imports outside modules/** (explicit, shrink-only allowlist of 12 debt files), registry and catalog read only the door, SETTING shape verified (including the 290–291 capacitors and perk names).
- test-setting: header aligned with the common setting standard.

---


## Data — The registry now knows about robot weapon mods; field shape follows the pipeline convention (patch 291)

> Owner's question (2026-09-21): «does the registry know about the new data? Who and how will connect the mods to the weapon?» — No, it did not; the question exposed a gap in the 290 delivery.

- `domain/registry.js` (the engine's single data-reading point) now imports `robot/weapon_mods.json` and `robot/weapon_mod_slots.json`: the robot catalog's `weaponMods` pool includes the capacitors (save restoration via `domain/enrichItem.js` finds them by id), plus clean keys `robotWeaponMods` and `robotWeaponModSlots` for the future install screen.
- The mod field shape now follows the `applyWeaponMods` pipeline convention: flat additive `cost`/`weight` instead of modifier objects (the pipeline adds: `cost += mod.cost`, `weight += mod.weight` — exactly the table's «+4»/«+1»). `ammoPerAttack` stays: the rules' semantics «N shots per attack» is per attack, not per shot; its consumer will arrive with the install screen.
- Who connects the mods: stat restoration is the live `enrichItem` pipeline (the save stores mod ids); installation for humans is `WeaponModificationModal` (db/catalogSource → catalog); for robot weapons there is no install screen per the owner's word («data only»), the data and registry are ready.
- The fuse gained registry checks (12 checks total).

---

## Data — Unique mods for the Assaultron Head Laser (patch 290)

> Owner's word (2026-09-21): «unique mods for the Assaultron Head Laser — in Russian exactly „Головной лазер“, not „Лазер головы“; the English name stays as is. It is a robot weapon; the mods fit only `robot_weapon_assaultron_head_laser` and live separately from the weapon. Data only; there is no robot weapon mods file — create one by analogy with human weapons».

- Created the robot weapon mods data by analogy with human weapons: `data/equipment/robot/weapon_mods.json` (mods) + `robot/weapon_mod_slots.json` (slots) + ru/en i18n `robot/weapon_mods.json`.
- Four capacitors (rules table): Mk III +1 {/CD}, 3 shots per attack, weight +0, cost +4; Mk IV +2, 4 shots, +1, +8, Science! 1; Mk V +3, 5 shots, +1, +12, Science! 2; Mk VI +4, 6 shots, +2, +16, Science! 3. All `unique: true`, `applies_to_ids` — the laser only, slot `Capacitor`, requirements: Robotics Expert 1 (+ Science! by rank).
- The table's rank-less «Robotics Expert» is recorded as rank 1 — per the robot weapon data convention.
- Weapon name: ru «Лазер головы Штурмотрона» → «Головной лазер Штурмотрона»; en «Assaultron Head Laser» — untouched.
- Catalog wiring is import-and-merge-by-id only (no logic): `robotWeaponMods`, `robotWeaponModSlots` in the catalog and `getEquipmentData()`.
- Fuse: `__tests__/robot/assaultron-head-laser-mods.test.js` — 11 checks over the table, slots, i18n and the name.

---

## Fix — SPECIAL attribute order aligned with the rules (patch 289)

> Owner's word (2026-09-21): «the attributes must go exactly this way and no other — Strength, Perception, Endurance, Charisma, Intelligence, Agility, Luck».

- The order `STR, END, PER, AGI, INT, CHA, LCK` had been in the code since the project's very first commits — the rules' canon `STR, PER, END, CHA, INT, AGI, LCK` never existed in the repo (verified with `git log -S` over the whole history). Nobody «changed» it — it was born wrong.
- Every place defining the order is fixed: `CANONICAL_ATTRIBUTE_KEYS` and `createInitialAttributes` (domain/characterCreation.js), `PERK_ATTRIBUTE_FILTER_CODES` (domain/perks.js — perk filters), literals in effects.js and the migrations.
- `selectLegacyAttributes` (src/store/selectors.js) sorts its output by the canon — old saves stored in the historical order display correctly, and re-saving writes the canonical order (saves self-heal).
- Fuse: `__tests__/domain/special-attribute-order.test.js` — 6 checks; any new place defining attribute order must match the canon.
- Also: App.js indentation restored to main (a cosmetic leftover of the 286–288 cycle).

---

## Cleanup — The sandbox screen removed: the setting is virtual, no UI needed (patch 288)

> Owner's word (2026-09-18): «do I even need this screen if the setting is virtual, unconnected to reality, and I'm not going to wire it?» No — removed.

- The sandbox screen (patches 286–287) was removed wholesale: the screen itself, the view model, the lazy registry, their test and the App.js wiring. The screen's only job — showing the cascade with your own eyes — is done more reliably by the acceptance tests, while the screen would have needed maintenance on every contract change.
- The test setting's declaration and its acceptance test remain: that is not UI but the proof of the contract's universality (the §8 criterion — «a setting is described without engine edits»). The program never imports the module, it costs nothing; if a future contract change breaks the describability of a second setting, the test falls.
- Verified: the publication build is clean (zero traces of the screen), 76 files / 781 tests green, tsc clean.

---

## Micro-patch — The sandbox no longer ships into the production build at all (patch 287)

> Owner's word (2026-09-18): «So in the Replit preview I'll see 5 tabs, but when I publish the app I won't see it?» Yes: preview — 5 tabs, publication — 4. A nuance was found by inspecting a live build and fixed.

- How the gate works: `__DEV__` is a build-time constant. The dev server (`expo start` — the Replit preview) builds with `__DEV__ = true` → the «Sandbox» tab mounts. Publication (`npm run build` → expo export) builds with `__DEV__ = false` → no tab.
- Found by grepping the bundle: with a static import, the screen's code rode into the publication as dead weight (the tab never mounted, but the kilobytes of code and strings sat in the files). Fixed with a conditional require behind `__DEV__`: the export drops the whole branch.
- Verified by grepping the built publication: no screen strings, view model, sandbox registry or tab name in the bundle — zero occurrences (control: HomeTab/Positronium are found).

---

## Series pivot — The rules sandbox: the test-setting screen, dev-only (patch 286)

> Owner's word (2026-09-18): the sandbox lives only in the development environment — «don't show it in the main program at all»; a build for checking the contract.

- A «Песочница» (Sandbox) tab was added (App.js, behind the `__DEV__` gate): production builds never see it; in development it runs the test setting on the derivation contract. The sandbox does not touch the character store — the tab's state is local.
- On the screen: attributes (0–12), skills with a rank ceiling from the governing attribute (the «+» button dims at the ceiling — a rule inside a rule), +5%/+10% magic-power and +15% defense bonus toggles, derived values and counter ceilings — everything is recomputed by the registry cascade without a single manual call. Spells show why they are locked: «needs rank 4» or «not enough mana».
- The screen's logic lives in a pure view model (`modules/test-setting/viewModel.js`) — an acceptance test (6 checks) drives it without react-native: the screen stays thin, the checkable part is separate.

---

## Series pivot — The test setting: the contract's second client, zero engine edits (patch 285)

> Owner's word (spec verbatim, cascade map §8): «5 attributes; 5 derived values (health, mana, magic power, defense, attack); 7 skills; 5 spells. Attributes feed the derived values; spells spend mana (mana = attribute + skill); +5/10/15% to magic power / magic defense; spells gated by "skill rank 4"; the number of skill ranks depends on an attribute.»

- The mini-setting became a real shipped module: `modules/test-setting/` — living JavaScript on the typed contract. Five attributes (strength, agility, intellect, spirit, luck), seven skills each with a governing attribute, five derived values, five spells with mana costs and the «Sorcery rank 4» gate, rank ceilings in bands from the governing attribute.
- The contract's success criterion holds and is visible in the patch diff: **not a single line changed under `src/`** — the setting fit entirely onto the vocabulary sharpened by patches 282–284 (percentages from a declared base, anchor phases, rounding modes). The acceptance test (11 checks) drives the cascade: mana = Intellect + Sorcery, +5%/+10% bonuses to magic power sum into one multiplier, rank 4 is unreachable until the attribute grants ceiling 4.
- The module is not imported by the running program — the wiring (a sandbox mini-screen) is the next patch; how to surface it (dev flag, hidden section) is a question for the owner.

---

## Series pivot — Rounding mode: the setting dictates the direction (patch 284)

> Owner's word (2026-09-18): «(10+18)×1.15 = 32.2 → 32 is not a mandatory state either. The setting can dictate which way the rounding goes. It can be 32 or 33. And for example at 32.01 a rule may force rounding up or down to a whole number.»

- The rounding mode is part of the vocabulary, not an engine constant. Declared per value: `math` (mathematical, 0.5 up — the default), `up` (always up: 32.01 → 33), `down` (always down: 32.99 → 32), `none` (no rounding — 32.2 stays 32.2).
- A pipeline phase can round at its own step with the same mode (`round: true`) or its own (`round: 'up'`) — a rule whose step and total round differently is expressible.
- The owner's examples are in the tests verbatim: (10+18)×1.15 = 32.2 yields 32 (math), 32 (down), 33 (up) and 32.2 (none) on the same base; 32.01 becomes 33 or 32 per the rule. The pure applyPercent takes the mode too: 26×1.15 = 29.9 → 29 down, 30 mathematically.
- An unknown mode is a registration error listing the available ones. The contract test grew to 36 checks; the contract remains isolated — nothing changed in the running program.

---

## Series pivot — Modifier phases: the rules declare the order (patch 283)

> Owner's word (2026-09-18): «This is an RPG program. There are rules, and percentages are calculated the way the rules say. [...] The base fire rate depends on installed mods, the trait's % applies to that, and the perk doubles afterwards. But there can also be a case where the trait boosts the final rate instead of the base one [...] And it might only apply if the fire rate is below or equal to a certain value. You can't guess that.»

- The engine no longer dictates the modifier order — patch 282 hardcoded rigid levels («percentages only on derived values»); patch 283 turns that into a vocabulary: a value declares its own pipeline of phases in execution order (`modifierPhases`), and a modifier binds to a phase. «Trait +10% of base» and «trait +10% of final» are the same rule with the phase in a different position.
- New in the vocabulary: the multiplier operation `×` (a «×2» perk), `when(value)` conditions — «the perk only works if fire rate ≤ N» — and per-phase rounding for rules that round at their own step. A modifier pointing at an undeclared phase is an error listing the declared phases.
- The owner's fire-rate example is in the test wholesale: base 5, mods +1/−2, trait +10%, perk ×2 → 9; the anchor is observable through phase rounding (8 versus 9); a conditional perk switches on and off at the threshold.
- Nerd Rage (the owner's example) is a reaction on a dynamic threshold: the perk waits for «current HP < 30% of max», and the max itself moves — a chem grants the max +50%, the cascade recomputes the ceiling, and the bar shifts: 12 out of 30 = 40% (the perk stays silent), 12 out of 45 = 27% (it fires). Also in the test.
- The contract's acceptance test grew to 31 checks; the contract remains isolated — nothing changed in the running program.

---

## Series pivot — Percentage semantics: always from a declared base (patch 282)

> Owner's word (2026-09-18): «% always comes from something. +15% fire-magic defense is calculated as −15% incoming damage from attacks with the fire property. +15% HP is calculated as the HP parameter's base value (e.g. attr1+attr2) × 1.15, mathematically rounded to a whole number».

- An amendment to the derivation contract (patch 281): percentages no longer take part in a parameter's additive chain. The levels are separated and never mixed: parameters (attributes, skills) carry set and additives (perks, wounds, armor); derived values (health, mana) carry percentages — the formula's base × (1 + Σ%/100) with a single mathematical rounding at the end.
- A pure function `applyPercent(base, percents)` appeared — it will also serve future damage channels: «+15% fire-magic defense» counts as −15% incoming damage from fire-property attacks.
- Breaking the separation is a contract error, not a silent recomputation: a percentage in a parameter's additive chain and an additive on a derived value are both rejected with a clear message. The contract's acceptance test grew to 22 checks, including both of the owner's examples verbatim (26 × 1.15 = 29.9 → 30; 100 × 0.85 = 85).

---

## Series pivot — The derivation contract: the engine's typed vocabulary (patch 281)

> Owner's word (2026-09-17): the engine is meant to be universal. The setting declares parameters, derived values, counters, requirements and reactions — the engine executes and cascades them. The contract and the engine are TypeScript; the setting stays living JavaScript behind a typed «door».

- The first piece of the typed engine appeared: `src/engine/contracts/` (parameters, derived values, counters, rank ceilings, requirements, reactions, the setting assembly) and `src/engine/derivations/registry.ts` — a registry with validation, topological ordering (a cycle is a registration error) and a pure `evaluate` cascade. The modifier order is agreed: set replaces the base, then additives, then the summed percentage, rounding at the end.
- The registry does NOT replace anything in the running program yet — only the acceptance test imports it. The contract settles in without risk to the Fallout module; wiring it into the store and the death of the 24 manual recomputes are patches 283+.
- The acceptance test describes the mini-setting per the owner's spec (5 attributes, 7 skills, 5 derived values, mana = attribute + skill, skill rank ceiling from an attribute, +5/10/15% bonuses): 16 checks green — the criterion «a setting is described by declaration without engine changes» holds today.
- Contract document: `docs/architecture/derivation-contract.md`; the tsconfig include now covers `src/engine` (the patch-280 fuse enforces the coverage).

---

## Infrastructure — TypeScript fuses: tsconfig coverage and a .js/.ts duplicate ban (patch 280)

> Owner's word (2026-09-17): the series gets reordered — first the cascade map (279), then fuses (280), then the derivation contract (281), then the test setting (282) and the cascade implementation (283+).

- Two ratchets for the TS series. First: every `.ts`/`.tsx` in the repository must be inside the tsconfig `include` — a new TS file outside the type-checking scope fails the test, and so does a stale include entry (include only grows). Second: stacks of `foo.js` + `foo.ts`/`foo.tsx` in one folder are banned — the Metro resolver picks `.js` first, so the TS file would be dead code that is «type-checked» but never executed.
- The vitest plugin from patch 274 now covers `.ts`/`.tsx` too: replacing `require('<asset>')` with `{}` works there as well; TypeScript itself is transformed by vite/esbuild, no babel involved. TS modules enter the test run without separate infrastructure.
- A conversion rule was added to the charter: a conversion patch does not change behavior; whatever typing uncovers (a possible null, a shape mismatch) goes into a separate fix patch with its own number and test — never «changed it while I was at it».

---

## Series pivot — The derived-values cascade map: diagnosis and plan (patch 279)

> Owner's word (2026-09-18): I want changing one parameter to change everything — not «one piece of state updated and nothing else moves until you fix all the call sites by hand». The engine is meant to be universal — next come Heroes of Might and Magic 2d20, Disciples, Vampire: The Masquerade or my own setting.

- The cascade map was added (`docs/architecture/cascade-map.md`) — an inventory of every derived value in the program. The diagnosis is confirmed: totals are stored in the state store and recomputed by 24 manual calls scattered across actions; the automatic watcher only tracks equipment and profile; the Weapons & Armor and Character screens keep their own recomputations — three copies of the same truth. Meanwhile derived values are never written into saves — the cascade can be fixed without any save migrations.
- A live engine/setting boundary violation was found: the engine's derived-stats code contains Fallout formulas and reads the power armor catalog straight from the setting module. Moving the formulas into the module is part of the series plan.
- The series plan pivoted: the centerpiece is a typed derivation mechanism. The setting declares parameters, derived values, counters, rank ceilings, requirements and reactions — the engine executes and cascades them. TypeScript rides along (contract and engine in TS; the setting stays living JavaScript). Changing the programming language and swapping the reactive core were ruled unnecessary: the program has only a handful of true «rules on change» today.
- The test setting for proving universality — per the owner's word: 5 attributes, 7 skills, 5 derived values (health, mana, magic power, defense, attack), 5 spells; mana = attribute + skill; +5/10/15% bonuses; spells gated by skill rank 4; skill rank ceiling from an attribute. Success criterion: both Fallout and the mini-setting are describable without engine changes.

---

## Cleanup — Tests: settled ones removed, the «tests do not pile up» rule written into the charter (patch 278)

> Owner's word (2026-09-18): every feature wrote its own test, and after settling in the test was never deleted — they just piled up. Tests are a development-time checking tool, not part of the program.

- 15 acceptance tests of settled features were deleted (survival UI labels and colors, modals, the crafting window, the salvage messages from patches 275–276, the «acceptance» of the finished robot rework). Rule checking is unharmed: the fuses (store and save passports, catalog data integrity) were not touched; the repository now holds 72 test files instead of 86.
- The lost fuse «no direct console calls in the program» was restored: all logging goes through the diagnostics journal that is off by default. The single violation found (the unknown-alert message) now goes through that journal; the `alerts` category is documented in the tracing doc.
- The test policy is written into the charter: fuses stay forever; acceptance tests live in the sandbox during development and do not ship; a settled feature loses its right to a test — the next patch touching that area removes it.

---

## Cleanup — Documentation: implemented designs removed, deferred ideas honestly labeled (patch 277)

> Owner's word (2026-09-18): docs piled up descriptions of things already built — the source of truth is now the program itself and the changelogs. Keep only the acting contracts and clearly marked «not implemented» ideas.

- 16 documents deleted: everything describing what is already built into the program — the unified state store, the item-name pipeline, the armor protection model, robot slots, character folders, robot part translations, the old numbered changelog and more. The rules of those decisions live in the code and in the paired changelogs.
- Deferred ideas stay with honest status labels: perk influence (94 perks, awaiting the owner's decisions), trait debts, the unified modifier system, «Effects/Radiation», weapon difficulty, premium/avatar, PWA updates, robot limb management. The «Effects and Radiation» doc got its stale paths fixed (the screen moved into the setting module long ago).
- The approved TypeScript migration plan was added (`docs/architecture/typescript-migration-plan.md`): the engine moves to TS via a series of small patches — the goal is catching errors before the app ever launches; the setting stays living JavaScript behind a typed «door» (adapter + package data checks on load). The charter was updated for the series.
- Dead links to the deleted documents were cleaned out of the code and the surviving documents.

---

## Micro-patch — Junk composition without the «+N unavailable» counter (patch 276)

> Owner's word (2026-09-17): «+1 unavailable» carries no information at all. The rule: salvage runs clipped wherever it is possible — common + uncommon with no perk yields the common one, rank 1 yields up to uncommon, rank 2 yields everything. Unreachable materials are simply not shown in the subline; loot and purchase do not depend on the Scrapper rank.

- The engine could do this since 263 (rarity ceiling over the composition, honest stack spend) — only the storefront changed: the screen dropped the «, +N unavailable» tail and the `salvage.hidden` key was purged from both locales. When nothing is reachable the line keeps the 275 gates («requires Scrapper perk rank N» / «unavailable without…»): the reason is named there, no counter needed.
- `hidden` survives as a number in subline/preview data (future modal) but never reaches the row. A scope-guard test pins that shop/grant/sell modals import no salvage ceiling — the Scrapper can only clip salvage. 910 green, tsc clean.

---

## Micro-patch — Missing Scrapper rank is named directly (patch 275)

> Owner's word (2026-09-17): with Scrapper rank 1 on chalk the subline lied — «unavailable without Scrapper, +1 unavailable» — while the perk was present and rank 2 was what's missing. The 264 agreement («what cannot be obtained is not shown») stands: names of clipped materials stay hidden.

- The module now distinguishes causes: `filterCompositionByCeiling` returns the minimum clipped rarity, the subline exposes `gate: 'rank' | 'no-perk'` and `requiredRank`. On `'rank'` the screen prints «Salvage: requires Scrapper perk rank N» and drops the «+N unavailable» tail (with the composition fully clipped the counter is noise). Without the perk — the agreed wording is kept.
- Rank numbers come from module rules (`scrapperUncommonRank`/`scrapperRareRank`), not from prose: a future rarity scale changes rules, not screens. 5 regression tests (screen row with `uniqueId` included); locale names are not asserted, both-locale dictionary test covers them. 906 green, tsc clean.
- Patch ledger: 273/274 were merged separately by the owner (PR #20); their files are dropped from the ledger, which now holds `patchs/275-salvage-rank-gate-message.patch`.

---

## Update — Data reform: salvage in item cards, benchless recipes, unified junk catalog (patch 269)

> Owner's word (2026-09-17): junk and its salvage recipes are one file; material.json and junk.json live in `data/junk/`; a material row is `{id, materialType, weight, cost, rarity}` — no itemType, no "named" marking; the engine knows neither recipes nor materials, only "recipes live in the registry, the registry points at files"; a recipe is `{id, requires, materials}` and its id IS the output item; quantity is a single `outputQuantity` field (integer or dice), "same shape everywhere"; packs vs other materials — no distinction, one common pool; `bench` and `sourcePage` out of recipes — failing burns materials exactly where the record itself says so; d20 table labels inside data were wrong — labels live in i18n.

- `data/junk/`: junk.json (130 cards; the printed salvage composition lives right in the row — the magnifier composition reads straight from junk.json without a second file; 129 composition owners, two legacy items without one), material.json (36 rows; materialType common/uncommon/rare guarded against rarity 0/1/2), tables.json (faces and links only; category/table/mining labels moved to `i18n/{loc}/data/junk/tables.json`). No standalone salvage.json anymore; the radio stays a catalog link and carries its composition in its own general_goods.json card — the generator writes and verifies it there.
- Recipes — `data/recipes/` (ammo 28, weapons 9, chems 21, food 27, drinks 8); the manifest knows only "file → category → count". Records dropped bench, output, pages and the "derivedMaterials" service note — its semantics is checked directly: a raws-only material list must equal the printed complexity curve. Quantity — `outputQuantity: 1 | {base, cd}`; "burn on failure" — the `failBurnsMaterials` flag per record, set by the generator from the printed rule (kitchen and chemistry burn): 74 flags, the per-file distribution matches the former bench split exactly.
- Engine: quantity-shape validation decoupled from rolling (data checks never roll), grant is `{itemId: recipe.id, quantity}`; "packs" are three ids in `CRAFT_RULES.packMaterialIds` — no such distinction in data or the material reference; salvaging composition-less junk draws from one common pool up to the rarity ceiling inclusive of packs ("all materials are equal"), a pack never closes itself.
- Window: tabs are manifest categories (Ammo/Weapons/Chems/Food/Drinks, `categoryNames` in both locales); `benchView` and the bench→skills/perks/burn maps were removed from rules; activity label — `craft:<category>`.
- Results: both generators clean under `--check`; tests migrated to the new layout (new guards: no labels in table data, no service flags, manifest vs files, honest flag shape, i18n mirrors at new paths); 893 green (85 files), tsc --noEmit clean.

## Micro-patch — Burn collapses into a rule; group paths live in dataset leaves (patch 270)

> Owner's remarks (2026-09-17): "why 74 records with a flag when 2 lines in the registry will do"; "the registry exists precisely because the grouping of what lives where is written there — as categories grow, the import must be one: the registry, not import-import-import across every document".

- `failBurnsMaterials` removed from 74 recipe records: in the printed set, burn-on-failure coincides with the test skill (cooking — Survival, chemistry — Science, explosives — Demolition), so the rule now lives as one line `CRAFT_RULES.failBurnsMaterialsSkills`. The engine treats the field in data as foreign and refuses it; while emitting, the generator cross-checks skill against the source workbench and fails on mismatch — the printed 21+27+8+9+9 split is preserved by a guard test.
- Data-group leaves: `modules/fallout/data/junk/index.js` (junk cards, material reference, tables, per-locale name mirrors and table labels) and `modules/fallout/data/recipes/index.js` (manifest + files). domain/registry.js and i18n/equipmentCatalog.js import the leaves, not JSON: moving or growing a category is a single edit in the leaf. A guard test forbids the registry and the catalog from fetching junk paths directly; table labels are served via `getScrapTableLabels(locale)`.
- On composition uniformity: all 250 rows in junk.json/radio were verified — one shape (`{material, count}` or `{material, base, dc[, effect]}`), zero mismatches; the discrepancy existed only in the abbreviation of my message. 3 new tests (rule vs print, field forbidden in records, leaves vs direct imports). 896 green (85 files), tsc --noEmit clean, both generators clean under --check.

## Micro-patch — Materials are never salvaged; the magnifier composition is pinned by a test (patch 268)

> Owner's canon (2026-09-17): junk is everything that breaks down into final materials; materials are crafting ingredients and simultaneously the constituent parts of junk (materials.json is literally the content of junk.json); materials have rarity; they may live apart from junk or inside it; materials are not salvaged.

- Clause five became a hard gate in salvage operations: isScrapMaterial is checked before the junk type and before the printed composition — even if future data hands a material a composition or files it as junk, salvage stays impossible (reason 'material'), and the item row gets neither a subline nor a button, not even a dim one. For direct calls (GM, debug) the report shows a human line: "Materials are not salvaged: they are already the end parts."
- Owner's magnifier check: the data was already correct — a single composition variant glass ×2 + copper ×1 + crystal ×2; copper/glass are uncommon, crystal is rare; in game, without Scrapper the magnifier can't be broken down (+3 hidden), rank 1 yields glass and copper, rank 2 adds the crystals. This is now pinned by a test: a drift from the book won't pass silently through any data regeneration.
- Data guards: materials ∩ junk file — empty; materials owning compositions — zero; every material's rarity within 0..2. 9 new tests. Suite: 890 green, tsc --noEmit clean.

## Micro-patch — Salvage button on all junk; dimmed when conditions unmet (patch 267)

> Owner's decision: the "Salvage" button belongs to junk as a whole, not only to items with a printed composition. It works when the teardown conditions are met; otherwise the button stays in place, dimmed and unresponsive.

- Junk without a printed composition (glands, stingers…) now gets the button too: its teardown runs on the common pool (261 rules) — the mechanic already supported it, the button did not. The composition subline stays reserved for items with a printed composition (264) and hides while equipped.
- Enabled state comes from the same shared availability calculation (salvagePreview): equipped or stowed in a PA frame, composition fully cut by the Scrapper ceiling, nothing to draw from the pool — the button dims (opacity) and does not respond; silence instead of a refusal alert (owner's call). It always matches the real salvageItem gate — no eyeballed logic.
- Non-junk without a printed composition: still no button, as before. 4 new state tests (junk w/o composition, ceiling-cut composition, equipped, non-junk). Suite: 881 green, tsc --noEmit clean.

## Micro-patch — Craft button inactive until the window is reworked (patch 266)

> Owner's decision: "benches" are the wrong axis. The 265 craft window will be reworked by product type: food/drinks, weapons, explosives, armor, power armor, chems, robots (the data actually holds five benches). Until that big patch, crafting stays closed.

- The inventory "Craft" button no longer opens the window: a press honestly says crafting is being reworked (both locales updated). The window, model and all 265 tests stay in the repo — the next patch wires the same mechanics to the new tabs; the engine (251/262/263) is untouched.
- The wiring guard test is flipped to the new state: `setCraftModalVisible(true)` on the button is forbidden, the modal wiring must remain in the screen. 877 green, tsc --noEmit clean.

## Update — Craft window: benches, materials, batch (patch 265)

> Plan step 3: crafting behind the inventory "Craft" button. Design confirmed by the owner (2026-09-17): unlearned recipes shown grayed with a reason; the recipe window knows only what it demands — no substitution hints; report is exactly three lines; batching allowed, a failed attempt burns only its own materials.

- The "Craft" button opens a window with bench tabs (gunsmith / chemistry / kitchen — as the data says; a guard test keeps every recipe on a tab). Row: what you get, "Complexity N · skill · time"; if unavailable — gray row with the honest reason: "Needs perk "Chemist" rank 1" or "Missing materials" (decision B: hidden knowledge is shown, not hidden away).
- Recipe window: one line per material "have N · need M" (the numbers already count what the bag can cover), attempts stepper capped by the scarcest material, run button. Substitutions: not a word — a recipe only knows what it asks; covering is the bag's business.
- Batch: N attempts in a row, each with its own check on real dice; a failed one (say, third of five) burns only its own materials, the rest keep going; when the bag runs dry the attempts stop and the report shows "Stopped: … N attempts never started".
- Report in the owner's format: "Intelligence + Repair = 8" / "Rolled 12, 3. Successes 1" (or "Failed" with an honest burned/intact note) / "Gained: … ×n. Spent: … Time: …". A complication is marked in the dice line and doubles time in the total. For batches: line 1 shared, one line per attempt, one collapsed total.
- Rename by the owner's word: no "packs" anywhere — common/uncommon/rare materials are now "обычный материал / необычный материал / редкий материал" (Common/Uncommon/Rare material) in the bag, shops and lists; technical ids untouched. The crafting-data generator maps the book's "Common Materials" to these ids via explicit aliases — regenerated recipe files match byte for byte.
- New model modules/fallout/crafting/windowModel.js (no React — lists, batch, report), modal modules/fallout/screens/InventoryScreen/modals/CraftingModal.js, 15 tests. Suite: 877 green, tsc --noEmit clean.

## Update — Crafting and salvage time now runs on the survival clock (patch 262)

> Owner's reordering: time binding goes first, inventory colors and UI later. The "keep time in the contract, don't count it" hold is lifted: the minutes in crafting and salvage answers now spend survival time.

- New module operation applyActivityMinutes(minutes) drives the ladders through the same hourly ticks as the real-time contour (the fraction accumulates in timeCarried: six 10-minute salvage jobs add up to exactly one game hour), advances timed-effect timers and applies fatigue HP loss — exactly what the clock tick does (232). Shared gates with survival: disabled by setting — frozen (applied:false with the reason kept in the answer), a character without ladders has nothing to move; crafting/salvage themselves keep working regardless.
- Salvage: the 10 minutes per item are spent after any attempt that reached the dice — success or failed check (a botched evening counts); a gate refusal never rolled, never spends. A complication multiplies before the clock is written (20 minutes on a double-complication failure).
- Crafting: base time by the recipe's printed Complexity (book p. 210, GM discretion fixed as a table here): 0–1 — 10 minutes, 2–3 — an hour, 4+ — a day (the owner's 259 tiers), in CRAFT_RULES.craftTimeTiers, tunable without touching data. Time is spent on success (auto-success carries multiplier 1) and on a failed check (wasted hours; in kitchen/chemistry also burned materials); gate or store refusal spends nothing. The craft answer now carries time:{minutes,durationMultiplier} — the same contract salvage introduced in 260.
- Two numeric guards the fractions required: the hour carry in advanceHours gets a 1e-9 tolerance (six steps of 1/6 in float give 0.9999999999999999 — without it an hour made of minutes would never tick), and the effect bridge rounds scenes to integers (1/6 h × 12 = 1.999… and the domain threw on non-integer; whole sleep hours compute as before).
- 14 new tests (ladders, fraction carry, gates, effect bridge, craft auto-success/failure/gate/frozen, salvage success/complication failure/gate, six salvages = one hour). Suite 837 green, tsc --noEmit clean. The "+1 per AP" bonus stays contract-only: there is no AP counter and connecting the clock did not create one (owner decision).

## Update — Salvage in inventory: composition subline and the button (patch 264)

> From the owner's plan, items 1 and 2. Of the two highlight options (rarity colors vs hiding the unobtainable) hiding won as cheaper and honest — colors will ride the shared palette layer later.

- Any item row with a printed salvage composition gained a "Salvage: …" subline — which materials and how many this hero can extract right now. Materials above the Scrapper ceiling are removed from the list (263); in place of their names only a "+N unavailable" counter stays — the hint without leaking tables into the UI. Items without a composition get no subline; "or"-alternatives show the union of options without promising counts.
- Next to the sell button a "Salvage" button appeared: one item from the stack, real INT+Repair check and rolls, all through the finished package operations (260–263) with their spend, grant and survival clock (262). The button hides when there is nothing to extract (no perk) and on equipped items — the attempt would be refused anyway.
- The result arrives as an inline alert: what was gained (localized material names and quantities), time spent, a "complication doubled the time" note (when ×2), an honest story about the botched job (junk intact, evening gone) and about the no-Scrapper refusal. Strings live in the Fallout screen locale layer (ru/en); the screen only prints them.
- The module gained a pure salvageSublineForItem helper (for list rows) and exports the filter/ceiling — modal preview, subline and the salvage gate compute obtainability in one function and cannot diverge. 11 tests (subline per rank, "or", the report for every result branch, screen wiring via source guard and both locales' keys). Suite 862 green, tsc --noEmit clean. Plan item 3 (craft windows) follows as a design, next message.

## Update — Scrapper ceiling on compositions, crafting pack duality (patch 263)

> The owner closed stage 4 and fixed one more rule: material rarity of salvage output is capped by Scrapper for printed compositions as well.

- Salvage: without Scrapper only common materials come out of junk, rank 1 opens uncommon, rank 2 — rare. Composition rows above the ceiling are not rolled and not granted; if no obtainable rows remain, salvage refuses with no-materials — the item and the 10 minutes are not spent. Nothing is added on top of the composition: junk holding only common+uncommon yields exactly that at rank 2. A row whose main material is cut but whose effect is obtainable survives and rolls its dice for the effect. Composition-link items (the radio) fall under the same ceiling.
- Salvage preview carries rarityCeiling and the number of cut rows (gatedRows) — the base for modal highlighting once UI time comes.
- Crafting duality: named materials now fill the recipe's pooled-pack slots (item_common/uncommon/rare_materials) of their own rarity — tiers never mix. Spending order: the packs themselves first, then substitutes in ascending catalog cost (the cheap ones burn in work first); the spent/burned contract carries actual store deductions, not the engine plan. Exact recipe rows reserve their quantities before substitution (the printed 93 recipes have no overlaps — a guard test asserts it; the reservation protects homebrew recipes). CRAFT_RULES.packSubstitutionByRarity=false restores pack-only behavior. The preview's pack have includes coverage, so "what is missing" stays honest.
- Tests: 7 on the composition ceiling (the battery ladder across ranks, refusal with an intact item, the radio as a link exception, effect rows, preview), 7 on duality (substitution, packs-first order, price order, flag off, preview, data guard); 5 existing printed-composition tests moved to Scrapper 2 — otherwise they would fail exactly the way the game now must. Suite 851 green, tsc --noEmit clean.

## Fix — Only junk is salvageable unless stated otherwise (patch 261)

> The owner locked in the root salvage rule. The implementation carried a deny-list (consumables, ammo, armour, mods) and silently allowed everything else; refusal is now the default.

- Non-junk salvage works only when a composition is printed in scrap/salvage.json (e.g. the radio) — then the table branch runs with its checks and yield weight. Anything else that is not junk gets a not-salvageable refusal and is not spent.
- The generic yield (1 common material, weight cap, Scrapper raising the ceiling to uncommon/rare, never glue or oil) applies only to junk without a printed composition — legacy entries like bloatfly glands or stingwing barbs stay salvageable as junk.
- The adapter no longer guesses types from id prefixes (the old ammo-prefix crutch) — the registry knows types; rules.js swaps the deny-list for salvageableItemType: 'junk'.
- Tests moved to the new meaning: the bat is refused and not spent, the rarity ceiling is checked on composition-less junk. Suite 823 green, tsc --noEmit clean.

## Update — Salvage: registry, operation, catalog visibility (patch 260)

> Salvage data (256–257) joined the game: the registry knows the items, characters can take their bag apart, and the new junk and materials show up in the loot and buy windows.

- The setting registry gained salvage getters: junk list, materials list, printed salvage composition by item id, and the d20 GM tables (categories, nine tables, mining).
- The equipment catalog (source for item windows) returns two new lists: "Junk" — 130 items with printed weights and costs, "Materials" — 36 entries (three pooled packs + named). Add/Buy modals treat them like any items: search covers both, the sell modal prices by cost.
- AddItemModal: the "Junk" category joined the tree and both locales' labels; the previously empty "Materials" placeholder is filled from the reference.
- The salvage operation is a new setting module shaped like crafting: a universal engine (composition form: fixed units, DC dice with legal zeros, effect faces, "or" alternatives, non-junk pool mode) plus the setting adapter (registry, store, dice, Scrapper).
- Salvage rules (setting numbers): INT + Repair test at difficulty 0 (it can only fall to complications); 10 minutes per item; a complication does not cancel success but doubles time (the same rule 259 introduced for crafting); on failure the item is not spent and no yield dice roll; consumables and ammo cannot be salvaged; adhesive and oil never drop from non-junk salvage; Scrapper raises the rarity ceiling (rank 1 uncommons, rank 2 rares); the "+1 per AP" bonus stays in the contract but is not counted until AP/time integration.
- Spending and granting reuse the store's atomic channel from crafting (spendItemStacks/addNewItem): a refusal at any step leaves the balance untouched. Items without a catalog entry are not salvageable (unknown-item gate).
- 31 new tests (engine on stubs, operations on the real store with real data, catalog and modal wiring visibility). Suite: 822 green, tsc clean.
- Out of scope (next): composition/rarity sublines in the inventory list, rarity colors, GM mining rolls, survival-clock integration.

## Fix — A complication does not cancel success: it doubles time (patch 259)

> Revert of patch 258's "complication spoils the work": it contradicted the core system — when successes and complications occur together, the success stands. Owner's correction (2026-09-16) accepted.

- New rule (for every timed check in the setting): any complication on the check multiplies its duration by two — 10 minutes of crafting become 20, an hour becomes two, a day becomes two. The same applies to the duration of negative effects.
- Implementation: the universal crafting engine returns `durationMultiplier` (2 with a complication, otherwise 1); where to apply it is the setting's call. The factor is a setting number (`complicationDurationMultiplier`); recipe data untouched. Until survival clocks count crafting minutes the multiplier is computed but unused — the rule is introduced ahead, as agreed.
- Material burn on outright FAILURE at cooking/chemistry stays as of patch 251 — that is failure, not "success with complication". Success with complication: the item is crafted, materials are spent, time is doubled.
- The bench skills/perks map from 258 is unchanged — only its tests were rewritten.
- 10 tests rebuilt for the new semantics. Suite: 791 green, `tsc --noEmit` clean.

## Update — Crafting: bench skill map and complication spoilage (patch 258)

> Per the owner's text (2026-09-16, book pp. 210–212): which skills each bench tests and which perks "apply", plus the hardened rule: on cooking and the chemistry lab any complication spoils the work — ingredients are gone, no "may".

- The "bench → skills/perks" map joined the crafting rules: armor — Repair (+Armorer); chemistry lab — Science (+Chemist), explosives — Demolitions (+Demolitions Expert) — the split lives on recipes, the map pins it; cooking — Survival; power-armor servicing — Repair+Science (+Armorer, Science!); robots — Repair+Science (+Robotics Expert); weapons — Repair+Science (+Gunslinger, Science!, Blacksmith). Armor/servicing/robots lines are forward-looking: such recipes don't exist in the catalog yet. A test invariant: every recipe's skill must belong to its bench list.
- The perk half of the text is already what perks are in our data: recipe gates (Chemist/Demolitions Expert where the book requires them) and modification-rank access. The map introduces no bonus dice.
- Spoilage rule: on cooking and chemistry any complication ruins the item even with enough successes — materials are spent, nothing is granted (new result reason complication-spoiled). Plain failure still burns materials; double complication is still an automatic failure. Auto-success (skill rank covers complexity) rolls no check and cannot spoil.
- The recipe preview gained benchView: bench skills, related perks, burn/spoil flags — screens can display this without touching rules.
- 10 new tests (engine behavior on stub ports + map-vs-data consistency). Suite: 791 green, tsc clean.

## Fix — Salvage identifiers: item name instead of type in id (patch 257)

> Per owner's note: only the registry knows an item is junk or material; the id carries no type. One item — one id: recipe id = catalog id, no "junk_something" twins of plain items.

- All junk items and ores renamed from `junk_*` to the name slug (abraxo_cleaner, blood_sac, iron_ore…); named materials from `mat_*` to bare ids (steel, wood, nuclear_material…); antiseptic/asbestos become antiseptic/asbestos. Recipe, salvage-composition and d20-table references regenerated in lockstep; display names kept.
- Radio and other links to real catalog items unchanged (item_radio stays item_radio — it is the catalog item, not a junk twin).
- The generator gained a collision guard: a new id already owned by the main catalog fails the build and demands a link, not a duplicate.
- No save migration needed: salvage ids were never granted to players (the registry doesn't expose them yet). Pooled materials (item_common_materials etc.) untouched — they are sold in shops and live in saves.
- Tests: 781 green, `tsc --noEmit` clean; generator determinism (`--check`) confirmed.

## Update — Salvage, part 1: junk, materials and GM tables as data (patch 256)

> The big step opens with a data slice: the owner's salvage tables (2026-09-16) transcribed verbatim into catalogs. No behavior changed yet.

- Named materials reference: 33 entries. The nine pooled-material crafting recipes stay untouched; the four the book's salvage list lacks (crystal, gold, coal, iron) follow the rarity rule (1/3/5 caps, weight 1). Others: printed per-unit cost, weight = book "per 10 units" ÷ 10 (steel 0.2, concrete 3, bone 1).
- Antiseptic and asbestos moved from junk to materials with ids kept — recipe links intact; antiseptic repriced to the book's 3 caps, weight 0.1.
- Junk catalog: 130 entries — every item of the nine book tables (items under 1 weight get 0.2 by the established convention), six ores (weight 1, cost by yield rarity) and two legacy owner items unchanged. Radio synced to its table: weight 3, cost 10 (owner: table numbers win).
- Salvage compositions: alternatives ("or"), fixed amounts, DC components (custom d6 rolls via the single dice module), effect-face bonuses, one-shot "any" effects (High-Tech Gadget). Ores yield one unit per ore; iron is random (2 DC).
- GM tables: d20 category roll, all nine category tables, mining with quantity formulas in the shared dice parser's language. Two book redirects preserved explicitly: animal faces 12–20 roll our food catalog; household4 19–20 reroll workplace.
- Tooling: source of truth `scripts/scrap-source.json`, generator `scripts/build-scrap-data.mjs` with `--check`; ru/en i18n mirrors; 17 new tests (face coverage 1..20, reference resolution, catalog/mirror invariants). Suite: 781 green, `tsc --noEmit` clean.
- Out of this patch (per plan): registry accessors, the salvage operation with the INT+Repair test, inventory composition subtitles, rarity colors, "complication spoils ingredients" rule — next patches.

## Update — Screen styles moved into the setting module (patch 255)

> Owner-requested unification: Fallout styling no longer lives in engine folders.

- The module grew its own styles folder: the ten looks of screens that already belong to the setting (character, perks, weapons-armor and their modals) moved there, and the inventory, currency row and add-item modal looks were copied in — when those screens migrate too, their look can be tuned without touching the engine.
- The screens that stayed in the engine (home, inventory, add-item modal) keep a copy of the current styles at their old path: engine files unchanged to the pixel, no "whose style is this" confusion — the engine has its own, the setting has its own; divergence after this patch is normal, not breakage.
- The single test that read the weapons-armor look file directly now points into the setting folder.
- Your manual tuning from patch 254 (48px cap, 14pt text) is inside the copies, nothing lost; the `./apply-patch.sh` chain applies 254 then 255 in order.
- Tests: 764 green, `tsc --noEmit` clean; a path-resolution guard test watches every import.

## Update — Inventory: final sizes for the currency row (patch 254)

> The owner picked the numbers by hand in his checkout — rolled into the branch so the tuning isn't lost.

- The bottle cap renders at 48×48 (source 64×64); "−"/"+" and the "Craft" caption grew from 12 to 14 — small text was drowning next to the bigger icon.
- Nothing else moved: the 40% cap, paddings and dictionary keys stay as in patches 252–253. The wrench stays at 14, now matching the text height.
- If a 48px cap with 14pt text feels cramped under the 40% cap — raise `maxWidth` on `currencyContainer` (or drop it).

## Update — Inventory: currency row gets neutral names (patch 253)

> Unification continues: what Fallout calls caps is no longer called caps in the shared layer.

- The inventory row, its style block and the dictionary keys were renamed to neutral "currency": other settings (or multiple currencies) won't need to rename shared code — it already says currency, not caps.
- Players see nothing changed: naming the currency and picking its icon remains the setting module's job — Fallout still shows "Caps" and the same bottle cap.
- The "Craft" button moved out of the currency block into its own: crafting is not about money, it now has its own captions in both locales.
- Numbers (32px, 40%) untouched — keep tuning them by hand in the styles; renaming only changed the line's name.
- Tests: 764 green, `tsc --noEmit` clean.

## Update — Inventory: compact caps row and Craft button (patch 252)

> Quick edit per owner's request: the caps row no longer eats screen space.

- Caps area shrunk to 40%: the block now takes at most 40% of the row width; paddings and font sizes trimmed to fit the new neighbor.
- The word "Caps" is replaced with an icon: the same bottle cap from the module assets (64×64) is rendered at 32×32, as agreed.
- "↓ Spend" / "↑ Add" buttons became "−" and "+"; order and behavior unchanged, word labels dropped in both locales.
- A "Craft" button with a vector wrench icon (from the already installed icon set) now sits to the right of the caps area. The craft screen does not exist yet, so the button reports it is the next step; wiring belongs to that screen.
- Tests: 764 green, `tsc --noEmit` clean.

## Update — Crafting, part 3: the universal crafting mechanic (patch 251)

> The game can really craft now: the universal engine checks a recipe, spends materials atomically and hands the item out. There is no screen yet — the verdict and its reasons are ready for one; the screen is the next step.

- The mechanic lives in the engine and knows only the SHAPE of a recipe: item, perk and bench identifiers are opaque to it. The setting tells it where to look for recipes (the data registry), which dice to roll, and what "spend" and "grant" mean. A guard test watches that the engine never learns about setting files.
- The verdict contract: done (what was spent, what was handed out, the check — or an automatic success) or refused with a reason (what is missing and by how much; the bag untouched). Same trick as cap purchases: a refusal never changes the balance. Spending stacks is a new all-or-nothing store action; equipped and kit-locked items are never consumed, and the action passport was updated in this very patch.
- The test follows the book (p. 210–211): difficulty = recipe Complexity minus skill rank, floor 0; zero means automatic success, no dice; otherwise the standard 2d20 engine check (a die succeeds at or under attribute + skill, 20 is a complication, two complications fail automatically). Which attribute is used is the GM's call in the book: we default to INT, and that is a module rules number, not a recipe field or a save field.
- Output quantity: 1, or base + combat dice through the rollCD port. The quantity shape is validated BEFORE spending — broken data can no longer wipe the bag halfway.
- On a failed check, materials burn at the kitchen and chemistry stations (the printed rule); elsewhere a failure only wastes the attempt. The "burning" bench list is another module rules number.
- Deliberately absent here: the clock and AP (duration, halving for 2 AP, complication minutes) — that is survival-clock integration, a separate step; also inventory visibility for junk and materials, which is the owner's call.
- 741→764 tests green (12 new on the setting-free engine, 11 on the adapter with real recipes), `tsc --noEmit` clean. Contract doc: `docs/architecture/crafting-engine.md`.

## Update — Crafting, part 2: closing the catalog holes (patch 250)

> Patch 249 (its content is already merged into main) moved recipes into the data but hit missing items. The owner supplied their numbers, the gaps became reference catalogs, and the 19 locked recipes joined the data.

- The category now holds **93 recipes**: 28 ammunition (9 syringer darts added), 21 chems (all nine "problem" ones, antibiotics through ultra jet), the rest unchanged.
- The food catalog gained three raw forage plants (Glowing Fungus, Hubflower, Bloodleaf: weight 0.5, cost 4, +3 HP, +1d6 rads, raw-food risk); the gathering table `modules/fallout/data/loot/foraging.json` (d20 → food ids, 20 rolls, no gaps). The gathering rules themselves belong to a survival patch.
- Two new reference catalogs: junk `modules/fallout/data/junk.json` (seven teardown components; Abraxo Cleaner comes from the Household Items 1 table (weight 1, cost 10), the rest are the owner's estimates by analogy; antiseptic and asbestos stay plain items — "obtained by tearing down" is a rules branch, not data) and materials `modules/fallout/data/materials.json` (weight 1, cost 1/3/5). Both have i18n mirrors; the engine will read them through the registry in its own patches.
- Darts are written into the ammo catalog with card texts (ru — the owner's, en — per canon). The `effect` field is inert: groundwork for the "loaded syringe" mechanic; `mapsToQuality` is set only where the effect is a plain alias of an existing quality.
- Darts craft one at a time: they are not in the found table, the owner fixed the quantity. Regular ammunition still follows the found-table volume.
- A corrections table in the generator now carries numbers the owner dictates over the book: the first entry is Mentats = Uncommon ×3, Rare ×2, Brain Fungus ×2. A correction whose source row disappears makes the generator fail.
- One position is left in the exchange file `docs/reference-data/Missing_craft.json`: "Cooking Station" — the station item is not specced yet.
- There is no patch file for 249 in the chain: its content was merged into main ("Add recipes"), nothing to duplicate. 741 tests green, `tsc --noEmit` clean; the guard `__tests__/crafting/` runs 22 checks, including the foraging table and the owner's Mentats numbers.

## Update — Crafting, part 1: recipes as data (patch 249)

> First step of the crafting system: recipes now live in the data as their own category. Nothing is visible to players yet — the next patch teaches the engine to check, spend and hand out.

### What the data gained
- The Fallout pack has a new "recipes" category: `modules/fallout/data/crafting/` — five files grouped by what crafting yields (ammo, explosives, chems, food, drinks) plus a category index. **75 recipes**: 19 ammunition, 9 grenades and mines, 12 chems, 27 dishes, 8 drinks.
- A recipe id is the **id of the item it yields**: "craft berry mentats" is `chem_mentats_berry`, not a separate key `craft_chems_berry_mentats`. No second "recipe ↔ item" lookup table appears in the program: it would be a second source of truth and the first rename would kill it. Should several recipes yield the same item (the book has this for ammunition: another perk rank, another recipe), the difference is appended after an underscore — e.g. `ammo_45_ammosmith2`; today there are no such cases, all 75 recipes yield 75 different items.
- Every recipe is references only: what it produces (a catalog item), from what (items and counts), which skill and complexity, which perk unlocks it and at what rank, which station it needs. No names, descriptions or "material titles" on purpose: the catalog still provides name, weight and price — never the recipe.
- Ingredients come in two flavours: printed in the book's table (Berry Mentats = Mentats ×1 + Tarberry ×2 + Rare materials ×1) or derived from the printed rule "materials are determined by the recipe's Complexity" (p. 210). Derived ones are flagged in the data, and a test checks the flag against the real complexity curve — which was already written on 143 weapon mods, zero disagreements.
- Ammunition is crafted in the amount it is found in: the quantity comes from our own found-table (.38 → 10+5 CD, a fusion core is exactly 1 — no dice apply to cores).
- No rules number is baked into the data: work duration, 2 AP, complications and "do ingredients burn on a failure" will be settings, not recipe fields.

### What this patch does not include, and why
- **Modifications.** Crafting yields items; the "install a mod onto an item" branch is configured separately (owner's decision). Complexity/perk/material columns are already present on 205 weapon mods and on armor mods, so those recipes will move into the same format without new facts.
- **Catalog holes.** Nine chems are blocked by ingredients that do not exist as items in our catalog (glowing fungus, hubflower, Abraxo cleaner, blood sac, antiseptic, bloodleaf, berserk syringe); nine syringer dart recipes and the "cooking station" are blocked because the result items do not exist either. The generator invents nothing and picks no book for the owner: all 19 such positions are exported to `docs/reference-data/Missing_craft.json` — an exchange file with recipe-shaped fields where missing data reads `unknown`. The owner fills the numbers from their own books and returns it for the merge.
- **Name collisions are closed right away** because they are not new facts, just the same thing named differently: "Tato Juice" = our "Potato Juice", "Mutant Hound Chops" = our "Mutant Hound Ribs" (word-for-word effect), "Mutt Chops" = "Dog Chops", "Queen Mirelurk Meat" = "Mirelurk Queen Meat" — ten aliases, each with its reason in the report `docs/reference-data/CRAFTING-MAPPING.md`.
- **Save format, store and screens are untouched:** for now only the guard test `__tests__/crafting/` reads the data (18 checks: index, references, no names, materials curve, files and exchange file matching the generator). 737 tests green, `tsc --noEmit` clean.

### How to maintain it
Reference dataset (`docs/reference-data/pipboyapp_crafting.json`) → `node scripts/build-crafting-data.mjs` → the `crafting` category files + report + exchange file. Hand-editing recipe JSON is pointless: the test compares the files with the generator output and fails on drift.

---

## Update — Reworking the game's core: unified store, saves, data passports (patches 219–247)

> Major behind-the-scenes work: everything the game remembers about a character moved into a unified store, saves became a standalone module, and data/operations got machine-readable "passports". For players: quieter, more reliable, plus several gameplay fixes; the save format did not change (old saves keep loading).

### Unified character store (219–243)
- The entire character state — profile (name, origin, trait, level), attributes/skills, health/radiation, caps, inventory and equipped gear, equipment kit, robot, power armor, perks, diseases and conditions, scene counter, timed effects, modified items, "saved" flags — moved from a React wrapper into a unified store (Zustand). Screens read and write it directly, with no mirrors or middlemen.
- The migration went step by step (each patch = one group of fields, the app kept working), and at the end (243) the old "dispatcher" file and its entry-point wrapper were deleted entirely — about 1,300 lines and a whole class of desync bugs gone.
- Operation rules are now anchored in the store: spending returns "done / rejected with reason" and never touches the balance on rejection ("you cannot buy more than you have"); all setters accept value-or-updater form; the Fusion Core drain ticks only while the app is open.

### Gameplay fixes and rulebook decisions (229–241)
- 229 — "fake water": a broken purified-water item from old saves is repaired on load.
- 230 — items with no price in the rules now sell for a sensible default instead of 0.
- 231 — the fatigue ladder indicates its level by color, without text hints.
- 232 — fatigue per the book: −⌊N/2⌋ current HP per game hour of activity; sleep removed from the rule (bed rest heals).
- 237 — item scheme "base + mod ids on the item": the catalog composes the name (e.g. `weapon_huntingRifle_05_76_48_35` → ".50 long-barreled high-capacity suppressed hunting rifle"); the workbench updates the item in place.
- 238 — confirming attributes: a single operation with rule clamps and a health recalculation.
- 239–240 — scenes and time: timed effects tick by scenes and game hours; consumables apply as one operation (heal → radiation → effects → infection risk); radiation preview before use; resisting a disease once per day; treatment lowers disease ranks.
- 241 — "change kit" no longer wipes health/radiation/scenes/conditions/chem dose log; tagged skills survive a kit change (while a full reset honestly clears everything).

### Saves (242)
- The save notebook (save/load/list/delete/autosave) is a standalone module with no React ties. Autosave writes only already-saved characters, after a half-second debounce, and skips unchanged state; cloud sync runs in the background.

### Data & action passports (244–246, TypeScript)
- The store and the save format got machine-readable "passports" with strict checking: a new field or action missing from the passport fails a contract test — sneaking past is no longer possible.
- The passport immediately exposed a live defect (244): the "one-time skill rewards issued" journal was written into saves but never read back — after save → load → confirming skills, the game could hand out starting rewards a second time. Fixed (save format untouched).
- 246 — the action passport now covers all 98 store actions, with a unified "done / rejected with reason" outcome contract.

### Format v2: saves without the mod album (247)
- The legacy modified-items album was removed from save writing — a duplicate ledger left over from the old scheme (writing stopped in 237; now the key is gone entirely). Nothing visible changes: names and mods are restored from the item id via the catalog.
- A bridge for old characters: when loading a pre-237 save, the album contents are transferred onto the items themselves once; entries for lost/sold items stay in the read-only inventory album. After a re-save the save is album-free. Schema version and the migration chain are untouched.

---

## Update — Reworking the game's core: unified store, saves, data passports (patches 219–247)

> Major behind-the-scenes work: everything the game remembers about a character moved into a unified store, saves became a standalone module, and data/operations got machine-readable "passports". For players: quieter, more reliable, plus several gameplay fixes; the save format did not change (old saves keep loading).

### Unified character store (219–243)
- The entire character state — profile (name, origin, trait, level), attributes/skills, health/radiation, caps, inventory and equipped gear, equipment kit, robot, power armor, perks, diseases and conditions, scene counter, timed effects, modified items, "saved" flags — moved from a React wrapper into a unified store (Zustand). Screens read and write it directly, with no mirrors or middlemen.
- The migration went step by step (each patch = one group of fields, the app kept working), and at the end (243) the old "dispatcher" file and its entry-point wrapper were deleted entirely — about 1,300 lines and a whole class of desync bugs gone.
- Operation rules are now anchored in the store: spending returns "done / rejected with reason" and never touches the balance on rejection ("you cannot buy more than you have"); all setters accept value-or-updater form; the Fusion Core drain ticks only while the app is open.

### Gameplay fixes and rulebook decisions (229–241)
- 229 — "fake water": a broken purified-water item from old saves is repaired on load.
- 230 — items with no price in the rules now sell for a sensible default instead of 0.
- 231 — the fatigue ladder indicates its level by color, without text hints.
- 232 — fatigue per the book: −⌊N/2⌋ current HP per game hour of activity; sleep removed from the rule (bed rest heals).
- 237 — item scheme "base + mod ids on the item": the catalog composes the name (e.g. `weapon_huntingRifle_05_76_48_35` → ".50 long-barreled high-capacity suppressed hunting rifle"); the workbench updates the item in place.
- 238 — confirming attributes: a single operation with rule clamps and a health recalculation.
- 239–240 — scenes and time: timed effects tick by scenes and game hours; consumables apply as one operation (heal → radiation → effects → infection risk); radiation preview before use; resisting a disease once per day; treatment lowers disease ranks.
- 241 — "change kit" no longer wipes health/radiation/scenes/conditions/chem dose log; tagged skills survive a kit change (while a full reset honestly clears everything).

### Saves (242)
- The save notebook (save/load/list/delete/autosave) is a standalone module with no React ties. Autosave writes only already-saved characters, after a half-second debounce, and skips unchanged state; cloud sync runs in the background.

### Data & action passports (244–246, TypeScript)
- The store and the save format got machine-readable "passports" with strict checking: a new field or action missing from the passport fails a contract test — sneaking past is no longer possible.
- The passport immediately exposed a live defect (244): the "one-time skill rewards issued" journal was written into saves but never read back — after save → load → confirming skills, the game could hand out starting rewards a second time. Fixed (save format untouched).
- 246 — the action passport now covers all 98 store actions, with a unified "done / rejected with reason" outcome contract.

### Format v2: saves without the mod album (247)
- The legacy modified-items album was removed from save writing — a duplicate ledger left over from the old scheme (writing stopped in 237; now the key is gone entirely). Nothing visible changes: names and mods are restored from the item id via the catalog.
- A bridge for old characters: when loading a pre-237 save, the album contents are transferred onto the items themselves once; entries for lost/sold items stay in the read-only inventory album. After a re-save the save is album-free. Schema version and the migration chain are untouched.

---

## Update — Reworking the game's core: unified store, saves, data passports (patches 219–247)

> Major behind-the-scenes work: everything the game remembers about a character moved into a unified store, saves became a standalone module, and data/operations got machine-readable "passports". For players: quieter, more reliable, plus several gameplay fixes; the save format did not change (old saves keep loading).

### Unified character store (219–243)
- The entire character state — profile (name, origin, trait, level), attributes/skills, health/radiation, caps, inventory and equipped gear, equipment kit, robot, power armor, perks, diseases and conditions, scene counter, timed effects, modified items, "saved" flags — moved from a React wrapper into a unified store (Zustand). Screens read and write it directly, with no mirrors or middlemen.
- The migration went step by step (each patch = one group of fields, the app kept working), and at the end (243) the old "dispatcher" file and its entry-point wrapper were deleted entirely — about 1,300 lines and a whole class of desync bugs gone.
- Operation rules are now anchored in the store: spending returns "done / rejected with reason" and never touches the balance on rejection ("you cannot buy more than you have"); all setters accept value-or-updater form; the Fusion Core drain ticks only while the app is open.

### Gameplay fixes and rulebook decisions (229–241)
- 229 — "fake water": a broken purified-water item from old saves is repaired on load.
- 230 — items with no price in the rules now sell for a sensible default instead of 0.
- 231 — the fatigue ladder indicates its level by color, without text hints.
- 232 — fatigue per the book: −⌊N/2⌋ current HP per game hour of activity; sleep removed from the rule (bed rest heals).
- 237 — item scheme "base + mod ids on the item": the catalog composes the name (e.g. `weapon_huntingRifle_05_76_48_35` → ".50 long-barreled high-capacity suppressed hunting rifle"); the workbench updates the item in place.
- 238 — confirming attributes: a single operation with rule clamps and a health recalculation.
- 239–240 — scenes and time: timed effects tick by scenes and game hours; consumables apply as one operation (heal → radiation → effects → infection risk); radiation preview before use; resisting a disease once per day; treatment lowers disease ranks.
- 241 — "change kit" no longer wipes health/radiation/scenes/conditions/chem dose log; tagged skills survive a kit change (while a full reset honestly clears everything).

### Saves (242)
- The save notebook (save/load/list/delete/autosave) is a standalone module with no React ties. Autosave writes only already-saved characters, after a half-second debounce, and skips unchanged state; cloud sync runs in the background.

### Data & action passports (244–246, TypeScript)
- The store and the save format got machine-readable "passports" with strict checking: a new field or action missing from the passport fails a contract test — sneaking past is no longer possible.
- The passport immediately exposed a live defect (244): the "one-time skill rewards issued" journal was written into saves but never read back — after save → load → confirming skills, the game could hand out starting rewards a second time. Fixed (save format untouched).
- 246 — the action passport now covers all 98 store actions, with a unified "done / rejected with reason" outcome contract.

### Format v2: saves without the mod album (247)
- The legacy modified-items album was removed from save writing — a duplicate ledger left over from the old scheme (writing stopped in 237; now the key is gone entirely). Nothing visible changes: names and mods are restored from the item id via the catalog.
- A bridge for old characters: when loading a pre-237 save, the album contents are transferred onto the items themselves once; entries for lost/sold items stay in the read-only inventory album. After a re-save the save is album-free. Schema version and the migration chain are untouched.

---

## Update — Assaultron equipment kits

### Origin "Assaultron" (content)
- Three equipment kits per the book (Wanderer's Guide): "US Military Model", "Assaultron Devil", "Robotic Caravan Guard" (`modules/fallout/data/equipmentKits/assaultron.json`).
- Every kit grants the "Assaultron Head (Laser)"; the head now carries the built-in weapon `robot_weapon_assaultron_head_laser` (`builtinWeaponId`) — the head laser shows up on the Equipment screen as a weapon card with stats (5 {CD} energy, Piercing 1, energy cells).
- "Assaultron Devil": two Construction Claws occupy the arm slots as weapon-limbs — weapon cards with stats (4 {CD} physical, Close Quarters, Breaking); plus serrated plating (body or arm+leg choice — book says one arm and one leg of player's choice, implemented as arms+legs due to Arms/Thruster location generalization), hazard detection module, 6+6 {CD} energy cells, robot repair kit, and the new "Skull Mask" headwear (`headwear_skull_mask`).
- "US Military Model": laser gun integrated into an arm, actuated frame (body or arm+leg choice — book: one arm and one leg, in system: arms+legs) + standard plating on remaining locations, recon sensors, 8+7 {CD} energy cells, 15 caps.
- "Robotic Caravan Guard": integrated laser gun, storage body + factory leg armor, behavior analysis module, wares (3 aid rolls and 3 trinket rolls), 14+7 {CD} energy cells, 20 caps.

### Engine (robots)
- `domain/robotEquip.js`: kit frames (`robotFrame`) now land in the slots' `frame` layer (previously they fell into inventory as dead items); the "Thruster" location of plating/frames/armor now also routes to legs/treads (protectron, assaultron, robobrain), not just thruster/wheel.
- Kit modal: `robotFrame`/`robotArmor` belong to "Standard Structure" and are not duplicated into inventory.
- Tests: `__tests__/robot/assaultron-kits.test.js` — kits exist and are localized, the head yields the laser with stats, claws yield weapon cards with stats, frames/plating land in layers.

---

## Update — Equipment kits, Enclave Remnant, Equipment screen (patches 69–89)

> Recent changes from this week. Older entries (up to 68) follow below in their usual order.

### Equipment kits (engine)
- One kit modal for all traits/origins: the player makes the choices (weapon, skills), auto-grant no longer silently resolves `choice` entries (71, 73).
- Kits moved to the setting: `modules/fallout/data/equipmentKits/*.json` (one file per faction) + index; `data/` stays empty (74, 75).
- A kit can require a trait via `requiresTraitIds` — it is only available to the chosen family/sub-trait. `domain/equipmentKits.js` filters kits the same way for every origin (77).
- The "Equipment kit" row is disabled until a kit is available (e.g. a family trait not chosen yet) — an empty modal can no longer open (78, 79).
- Kit modal: human clothes/armor moved into a dedicated "Armor & Clothing" category; "Standard Structure" remains for robot parts only (88).

### Origin "Enclave Remnant" (content)
- New origin `enclaveRemnant` and the "Hidden and Hunted" trait: tag one extra skill — Sneak or Survival (via `skillPickChoice`) (84).
- Two kits: "Former Scientist" (lab coat, gas mask, laser pistol + 6+3 {CD} energy cells) and "Former Soldier" (military fatigues, combat armor chest, choice of laser rifle or assault rifle with 8+4 {CD} ammo) (85).
- New weapon mod `mod_204` "Long Barrel" (for laser/plasma/institute weapons): +1 Range, removes Close Quarters, "Long-barreled" prefix (88).
- A stock converts a pistol to a rifle: if a Stocks-slot mod is present, the name comes from `stockNames.with` ("Laser Pistol" → "Laser Rifle"); the stock's own prefix is not duplicated. Result for the soldier — "Long-barreled Laser Rifle" (88).
- The origin-name title was removed from the trait modal — only the trait name (e.g. "Hidden and Hunted") remains (87).
- Trait descriptions support light markup: `**bold**`, `*italic*`, `- ` bullets, and line breaks via the shared `renderTextWithIcons` (86).

### Equipment screen
- Weapon-layout toggles live on the screen itself: lines = list (spoilers), two bars = cards. Removed from settings (76).
- The virtual unarmed attack (fists/manipulator) always occupies the first slot. A hand/palm button on the left of the toolbar shows/hides its card; when hidden, the first slot is taken by a weapon. The setting persists between sessions (80, 81, 82).
- Attack ordering: Unarmed → Melee → built-in → Mk II → everything else (82).

### Reliability & cleanup
- FIX: `getWeaponModById is not defined` when granting a kit with weapon mods (affected every kit with mods, not just Enclave). The store now uses synchronous `catalogGetWeaponModById` (89).
- `stockNames` is now carried through the catalog (`buildWeaponRow`) — without it the "...rifle" name never reached the resolver (88).
- Removed one-off debug scripts from the repo root (`debug-android-save.js`, `enhanced-debug.js`, `test-android-*.js`, `test-file-transfer.js`).

### Also
- 69 — Omerta and White Glove Society kits (full contents, auto-reroll, modal choice).
- 70 — first engine/setting split stage: food, drinks and weapon mods moved to the module entirely.

---

## 68 — "Elegant" quality in old saves (migration v7→v8) + kit-modal field loss fix

- CAUSE: clothes granted by the Chairmen kit BEFORE patch 67 have no `uniqQualities` in the save — inventory and the Equipment screen show them as «Формальная одежда» (only new grants have the quality).
- Migration v7→v8: if the character is a Chairmen (trait id/ids contains treefamilies-chairmen), the formal clothes and hat without a quality get `uniqQualities: ['elegant']`, the name («Элегантная Формальная одежда/шляпа») and rebuilt id/stackKey (`clothing_fancy_clothes_uniq_elegant` — stacks with new grants). Already with the quality — not duplicated; other families — untouched.
- FIX: the manual kit modal (EquipmentKitModal → toInventoryItems, weapon branch) dropped `baseName` and `uniqQualities` — the razor/"Дерзкая …" would lose name and stack when picked via the modal. Fields are carried explicitly now.
- Tests: full grant path (resolveKitItems → addNewItem: clothes with elegant in the store), migration v7→v8 (3 cases: Chairmen, non-Chairmen, already with the quality).

## 67 — Equipment screen knows the variant name; "Elegant" quality for the Chairmen

- FIX: the Equipment screen (WeaponsAndArmorScreen) did not know about the name replacement — for it the razor was the "Складной нож": storeItemToWeaponDisplay sets `id = weaponId` (the true knife id), findLocalizedWeapon found the knife in the catalog and overwrote the name. Items with their own identity (variant `baseName` or uniq qualities `uniqQualities`) now show their stored name: «Опасная бритва», «Дерзкая …»; the modded name composes from the replaced one («Зазубренное лезвие Опасная бритва»). Regular weapons — as before (catalog, i18n).
- CONTENT: quality `elegant` («Элегантная» / "Elegant") in the module uniq-qualities catalog; the Chairmen kit grants the formal clothes and hat with this quality — «Элегантная Формальная одежда», «Элегантная Формальная шляпа». The quality does nothing yet — only the name (and the stack: elegant ≠ no quality).
- Tests: equipment-screen render with an equipped razor (name «Опасная бритва», not «Складной нож»), Chairmen kit (clothes/hat with elegant in the name).

## 66 — Fix build syntax errors (Metro/Babel)

- `domain/traits.js`: name collision after the registry refactor (patch 62) — the local `getTraitI18n(id)` (trait name/description by id) clashed with the registry import `getTraitI18n(locale)` (locale dictionary). The local one is renamed to `getTraitI18nById`; modals updated (GenericTraitModal, SurvivorModal, TribalModal, TreeFamiliesModal). Only Metro caught it at build time (`Identifier has already been declared`); vitest tolerated it.
- `WeaponModificationModal.js`: mixed `||` and `??` without parens in `baseWeaponName` (patch 64) — a Babel syntax error (`Nullish coalescing operator requires parens`). Wrapped in parens.
- PROCESS: `CI=1 npx expo export --platform web` is now mandatory before shipping a patch (Metro catches what vitest misses).

## 65 — Uniq qualities: attachable equipment modifiers

- MODEL (owner): item "свойства" are called **uniq qualities** (like uniq_armor_mods). A quality is an attachable modifier: it has an id (tracking/mechanics) and a name (i18n); the name joins the item name: "Дерзкая" + "Формальная шляпа" = "Дерзкая Формальная шляпа". Quality effects (like mods) are reserved for the future.
- A quality is NOT hardwired into the item: it attaches to the instance (store field `uniqQualities`, like `appliedMods` — a list of ids). Attachment: via data (kit entry: `"uniqQualities": ["dashing"]`), in the future via crafting or manually. The mechanism is generic for any equipment: clothes, hats, armor, special outfits, weapons, ammo.
- Stack: quality is a stack parameter (law: two 100% identical items are one stack). Formula: id + durability + mods + qualities + name — `clothing_fancy_clothes_uniq_dashing` ≠ `..._uniq_elegant` with the same base id ("elegant" and "dashing" clothes are different stacks). The key uses quality ids (not names) — locale-independent; attachment order does not matter.
- Catalog: `data/equipment/uniq_qualities.json` (base, empty) + `modules/fallout/data/uniq_qualities.json` (module — the owner adds definitions here) + names in module i18n (`uniqQualities`). Registry: getUniqQualities/getUniqQualityName.
- Name composition: domain/uniqQuality.js — pure function (ready for crafting/manual attachment).
- Tests: uniq-quality.test.js (10) — catalog, name composition, stack keys, addNewItem, kit attachment (hat and weapon).

## 64 — Item variants (trueItemId + modifiers): the Straight Razor is not a standalone item

- MODEL (owner): the razor is NOT a clone and NOT separate weaponry. It is a **variant** of the switchblade; the record reads as modifiers:
  `{ "id": "weapon_straight_razor", "trueItemId": "weapon_switchblade", "modifiers": { "replaceOriginalNameTo": "weapon_straight_razor" } }`
  — "true item id" (mechanics: stats, qualities, mods — all from the knife) and "replace the original name" (the name comes from the i18n key: Опасная бритва / Straight Razor; no name hardcoded in data — i18n only).
- Future: `modifiers` supports pointwise stat tweaks — `{ "fireRateModifier": { "op": "+", "value": 1 } }` (fields damage/fireRate/weight/cost/rarity, ops + − × ÷). A fast revolver = revolver + name + one tweak, no copied stat block.
- Engine: `expandTrueItems` in domain/packMerge.js expands the record into a full one (deep merge with the true item + modifiers); the variant name comes from the catalog i18n. `domain/itemIdentity.js` — single source for id/stack-key logic.
- Inventory: the item lives under the TRUE id (to the program it is the knife — knife mods work without any aliases; no catalogSource machinery needed). Stack key is a plain concatenation: id + durability + mods + name, no markers (`weapon_switchblade_dur_50_mods_mod_113_опасная_бритва`). STACK LAW: two 100% identical items are one stack; any differing parameter (durability, mods, name) splits them: the razor and the knife are separate stacks, two razors stack together, a sword at 50 and 100 durability are separate stacks.
- Random durability (randomWeaponQualityEnabled/rollWeaponDurability): removed the forced "never stack" (unique key per instance) — two instances with equal durability now stack (bought guns are all 100, one stack).
- Modded name composes from the replaced name: "Зазубренное лезвие Опасная бритва" (mechanically the knife).
- Migration v6→v7: old saves with weapon_straight_razor (patch 63) → true id + baseName (name stripped of mod prefixes), id/stackKey rebuilt.
- Tests: item-variant.test.js (13) — record, expansion (ru/en), pointwise modifiers, grant under the true id, stack keys, addNewItem, migration.

## 63 — Family kits (Three Families) + "kit from trait" mechanic

- The Chairmen kit (treefamilies_chairmen): formal clothes and hat (existing clothing_fancy_clothes/headwear_fancy_hat), 9mm pistol with 12+4 CD rounds, Straight Razor (clone of the switchblade, id weapon_straight_razor, switchblade stats), Tops Casino Chip (CasinoTopsChip, value 100), personal trinket (oddity table roll), Marked Deck (item_marked_cards, 5 caps).
- Omerta and White Glove kits are temporary stubs (100 caps); their contents will be added per your data.
- OWNER RULE: the kit depends on the chosen family — the trait carries equipmentKitId; picking the family auto-selects its kit (applyKitById → resolveKitItems → handleSelectKit).
- The catalog (equipmentCatalog) now merges module data: weapons/generalGoods/equipmentKits from modules/fallout plus module i18n.
- Tests: Chairmen kit resolution, catalog with new items, equipmentKitId on family traits.

## 62 — "Three Families" origin (first content in the module) + registry refactor

- New origin TreeFamilies / Strip Families: multi-trait — the character picks ONE of the three Strip families:
  - The Chairmen: once per scene, re-roll 1d20 on a Charisma-based skill test (effect hook chairmen_reroll_cha);
  - Omerta: chems administered to others gain/increase Addiction (effect hook omerta_addiction_boost);
  - White Glove Society: food cooked at a Cooking Station heals +1 HP, butchering gives +1 meat, CHA complication range +1 with outsiders (hooks white_glove_*).
  Crafting/loot mechanics are future work (hooks are ready).
- OWNER RULE: new content goes into the module modules/fallout/ (origins.json, traits.json, i18n/) instead of data/.
- Registry refactor: getOrigins/getTraits merge the module over the base (by id, module wins); added getOriginI18n/getTraitI18n (base + module, deep merge). origins.js/traits.js read i18n through the registry.
- Asset: assets/origins/3families.png (copy of survivor per owner's instruction).
- TreeFamiliesModal — pick one of three families.
- Tests: treefamilies-origin.test.js (8).

## 61 — Engine data registry (step 1 toward modules)

- Added `domain/registry.js` — a single entry point for reading setting data (origins, traits, bodyplans, catalog). It still returns the same `data/` files; behavior is unchanged.
- Domain modules (origins/traits/characterCreation/bodyplan) now read through the registry instead of importing JSON directly.
- This is the foundation for `.posm` modules: once a module exists, the registry will merge its data (deepMerge by id) without touching consumers.
- Tests: registry.test.js.

## 60 — Fix weapon duplication when equipping to a robot

- Fixed: adding 1 weapon and equipping it to a robot's hand duplicated it (stayed in the inventory + a copy in the hand).
- Cause: different stackKey formats — store uses `weapon_10mm_pistol`, UI uses `weapon:weapon_10mm_pistol:mods:none`; lookup by the UI key failed to find the store item, so it was not removed.
- Fix: `findUnequippedStoreItemByStackKey` now normalizes the UI key (extracts the catalog id) and finds the item among unequipped ones.

## 59 — Tribal modal: Cancel button

- Added a "Cancel" button to the first screen of the Tribal trait modal (mode selection: "2 traits" / "1 trait + 1 perk") — closes the modal without changes if the user opened it by accident.
- Previously there was no way to exit the modal without making a choice. Now behaves like the other modals.

## 58 — Tribal origin + rules-pack foundation

- Added the Tribal origin: multi-select — 2 traits (Tribal or Survivor) OR 1 trait (Tribal/Survivor/NCR) + 1 additional perk. Traits: Mother Wasteland (fluff), Nomad (Science skill cannot be tagged — bannedTagSkills mechanic), Rite of Passage (mechanic: when spending a Luck Point, roll 1 {/CD}; on an effect the point is not spent + "The spirits favor you" alert), Old World Tools (fluff), Chosen One (fluff). Kit is temporarily the standard one (100 caps).
- Rules-pack foundation (stage 0, not yet wired into behavior): domain/packMerge.js (deepMerge, applyOverridesById, findUnknownOverrideIds), src/store/packStore.js (pack loading/storage, persist).

## 48 — Securitron origin

- The Securitron origin is now fully implemented: the "Mark I Securitron" trait (immunity to poison and radiation, 150 lbs carry weight not affected by Strength or perks, no chems/food/drink/rest benefits, repairs only).
- Own body plan `securitron`: head / body / left arm / right arm / wheel, 1-3-1 layout, hit location table 1-2 / 3-11 / 12-14 / 15-17 / 18-20.
- New robot parts: head, body (150 lbs), manipulator arm with built-in unarmed attack, wheel — stats modeled after the Protectron, ru/en translations included.
- `securitron_standard` equipment kit: automatic laser gun (laser gun with automatic barrel, integrated into the left arm, 14 + 7 CD fusion cell shots), submachine gun (integrated into the right arm, 8 + 4 CD rounds of .45 ammunition), missile launcher and grenade launcher (inoperable until the Mk II OS — inert inventory items flagged `requiresMkII`), factory armor for the torso/head/arms, printer (new robot item, equipped by default, cannot be unequipped).
- The RU prefix of mod `mod_053` now follows the EN convention ("Automatic") so the built-in weapon displays as "Automatic Laser Gun".
- Robot logic now supports the `wheel` slot (limb installation, armor distribution, armor picker, slot labels) and shows a limb's built-in weapon alongside the weapon held in that hand.
- Palm weapons (automatic laser gun and submachine gun) are now integrated into the arm slots (left/right) with applied mods, cannot be unequipped; attack cards show the source arm.
- The kit grenade launcher is the M79 Grenade Launcher.
- New robot item "Mk II OS Driver" (unique, only applicable to a Securitron): an "Apply" button in the inventory consumes the driver and activates the inoperable weapons. Until installed, the missile launcher and grenade launcher appear in the attack list as disabled cards labelled "Requires Mk II OS" (and in the inventory).
- The Mk II OS flag lives in the robot store slice and survives save/load.
- Securitron palms are free: the built-in weapons (laser gun in the left arm, submachine gun in the right) now sit INSIDE the limbs (limb built-in weapons), while the manipulator palms can hold any other weapon or items — regular weapons equip into a hand via the inventory, and the attack card shows the source arm.
- Attack order on the equipment screen: unarmed/melee first (all origins), then built-in weapons, then inoperable Mk II weapons, then weapons equipped from the inventory.
- Securitron head and wheel cells are now 1/3 width (like a cell in a row of three), centered in the row.
- Weapons equipped from the inventory go into the first FREE hand (the second weapon goes to the other hand) instead of always the first by position.
- Robot weapons now live in the store slots (single source of truth): built-in weapons (manipulator, laser gun, SMG) and weapons held in the palms (equipped from the inventory) are stored in the robot slot state instead of the React context. Screens read attacks from the slots — this fixes the bug where built-in weapons disappeared from the attack list after saving/reloading a character (only Mk II weapons remained).
- Fixed an inventory screen crash: isRobot was used in a useMemo before its declaration (TDZ "Cannot access 'isRobot' before initialization"). Added render smoke tests for InventoryScreen/WeaponsAndArmorScreen — this class of errors is now caught by tests.
- New rule for changing origin/trait/kit: before attributes/skills are allocated (locked=false) switching is free, no warnings; the kit resets together with the origin. After locked, changing origin/trait does a full reset with confirmation; changing the kit resets inventory, skills and skill rewards (attributes are kept). Browsing lists is always free (the "trait already selected" block was removed).
- Interface setting "Weapon cards display" (new "Interface Settings" section): Cards (default) / Spoilers / Tabs. Spoilers: each card sits in a collapsible header, 2/3 width, closed by default. Tabs: beveled top-left corner tabs below the limbs, active tab shows the 2/3-width card, << >> arrows switch the active tab, swiping left/right over the whole tabs scene (tab row + card) also switches it, and tapping a tab switches it too.
- Fixed: the chosen equipment kit was not remembered between sessions (after reload the kit was not shown, clicking it "offered to reset"). Cause: snapshot merge preferred store items and lost the kit metadata (id/name). Now metadata comes from the snapshot, items from the store (bought/loot items are kept); the reset confirmation only appears when a kit is actually selected (has id).
- Systemic save fix (the "lost ids" bug class): the snapshot no longer overwrites the chosen kit metadata or built-in weapons. Kit metadata (id/name) comes from the snapshot, items from the store (bought/loot are kept); built-in weapons (fists for humans) are merged by id with the store without duplicates. origin/trait are already stored by id (serializeState) — this bug class is closed at the root.
- Save migration v4→v5: for old saves where the kit lost its id/name ({items} without metadata), a placeholder "Equipment Kit" is set — the items are intact, but which kit was chosen is unknown. Tapping the placeholder opens the kit list; picking a specific kit offers a reset (character is locked).
- The "Mk II OS installed" flag is now stored in the character snapshot and restored on load (previously Mk II weapons became inoperable again after reload).

---

## 47 — Multiple damage types support

- Added support for combined damage types for weapons (e.g., energy + physical).
- Plasma weapons now deal both damage types: energy and physical.
- Weapon modifications can change damage type (replace or add).
- Added save migration (v3 → v4) to convert string damage types to arrays.
- Fixed syntax error in weapon modification modal.
- Fixed range name translation in weapon list (previously displayed English names).

---

## 46 — Character folders

- Added character folders for organizing saved characters.
- Added folder creation, opening, deletion, and character counts.
- Characters can be moved between folders using drag and drop.
- Added a "Move to character list" drop zone when viewing a folder.
- Fixed moving a character from a folder back to the root list when dropped over the back zone.
- The "Character folders" setting is persisted between launches.
- When the setting is disabled, the "Create folder" button is fully hidden and characters use the freed grid space.
- Existing folders and character assignments are preserved when the setting is disabled.
- Added Russian and English localization for the folder interface.

---

## 45 — Save migration on application updates

- Added a unified versioned migration system for character saves.
- Save-format changes are represented as sequential migrations between schema versions.
- Migrations run both when loading a character from SQLite and when rehydrating state from AsyncStorage.
- Added a single source of truth for the current schema version and documentation for adding future migrations.
- Legacy saves no longer require manual conversion after an application update.

---

## 44 — Grip and stock conflict

- Weapon grips and stocks are now mutually exclusive modifications.
- Installing a grip automatically removes the stock, and installing a stock removes the grip.
- The Russian name of the slot was corrected from «Приклад» to «Ложе».

---

## 42 — Legacy-save correction

- Fixed legacy saves in which a weapon could contain mutually exclusive qualities at the same time.
- After loading a save, only one quality from each conflicting pair remains.

---

## 41 — Mutually exclusive weapon qualities

- Fixed the application of mutually exclusive weapon qualities.
- Accurate replaces Inaccurate, and vice versa.
- Reliable replaces Unreliable, and vice versa.

---

## 40 — Tagged-skill rewards

- Fixed duplicate rewards for tagged skills.
- Saving the same tagged skills again no longer adds the rewards a second time.
- If a character receives a new tagged skill later, only that new skill receives its reward.

---

## 39 — Ammo type in inventory

- Weapons in the inventory now display their compatible ammo type.
- For example: `Ammo: 10mm Round` or `Ammo: Energy Cell`.

---

## 38 — Configurable weapon durability

- Added a Settings dialog.
- Added an optional random weapon durability mechanic.
- When enabled, weapons acquired as loot receive random durability from 1 to 100.
- Purchased weapons always start at 100% durability.
- Added a setting for durability loss per 10 shots.
- Unreliable weapons wear twice as fast, while Reliable weapons wear half as fast.
- Weapon durability is displayed on the equipment screen.
- Weapons at zero durability cannot be used until repaired.
- Weapons can be repaired for free through the inventory.

---

## 37 — English weapon and random-loot localization

- Fixed Russian fragments that had accidentally appeared in English weapon names, descriptions, and ranges.
- Random-loot item names now switch correctly with the application language.
- The item previously shown as «Косметичка» is displayed as `Cosmetics Bag` in English.

---

## 36 — English perk localization

- Fixed the English localization of all 94 perks.
- Perk names and descriptions are now displayed in English when the English locale is selected.
