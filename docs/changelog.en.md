# Changelog

---
---
---
---
---
---
---
---
---
---
---
---
---
---
---
---
## Item stats shown inline in the picker (patch 387)

In the add-item modal (loot, starting purchase) each item now shows its
base characteristics as a sub-line under the name: weapons — "Урон 6 ·
Скорострельность 1 · Дальность: Близкая · Вес 4 · Цена 99" (Damage ·
Fire rate · Range · Weight · Cost), armor — physical/energy/radiation
ratings, chems and food — their effect, everything — weight and cost.
Empty values are omitted.

---
## Arm-installed Laser Pistol verified on old saves (patch 386)

The Assaultron's second laser — the arm-installed Laser Pistol (as
opposed to the Head Laser) — is verified across all old save shapes:
mods load from the save, install, remove and survive saving (pinned by
a test). If this weapon still misbehaves for you, rebuild and run the
app with the latest patches. Also per your word: the Fusion Mag mod
now points to the existing "Энергоячейка" ammo (the old id did not
exist).

---
## Fixed: removing mods from the robot's Head Laser (patch 385)

In older saves the Assaultron Head Laser's mods could not be removed:
after "No mod" the laser showed the loaded capacitor again. Removal now
works immediately and survives saving; swapping one capacitor for
another worked before and still does. Covered by a test on an old save:
remove → save → load → empty; install → save → load → in place.

---
## Minor mod name fix (patch 384)

The Thompson SMG's "10mm" receiver name clarified in Russian (was
"Ресивер 10-мм"). The Thompson's mod set is pinned by a test per the
owner's list: Receiver — Powerful, Hair Trigger, Hardened, Armor
Piercing, 9mm, 10mm; other slots intact; none of the six uses energy
cells.

## The mod window now says what each mod does (patch 383)

The weapon mod window used to show names only. Now every mod carries a
description generated from its mechanics: "Урон +2 · Вес +1 · Цена +25"
(Damage +2 · Weight +1 · Cost +25), "Скорострельность +1 · Тип урона:
Энергетический" (Fire rate +1 · Damage type: Energy), "Эффект:
Проникающий 1" (Effect: Piercing 1), "Боеприпас: Патрон .308" (Ammo:
.308 Round), etc. Shown both in the mod list and in the preview.
Covered by a test: all 164 mods produce a description.

## The installed mod is now visible on the weapon card (patch 382)

A modded weapon now carries the mod's name — e.g. "Усиленный 10-мм
пистолет" for an upgraded 10mm pistol; previously stats changed but the
card showed nothing. Also added an end-to-end check: a test repeats the
"Apply" press on real game data (equipped armor doesn't interfere) and
verifies the whole chain — the mod lands in its own weapon, hides from
the bag, and returns to the bag when replaced.

## Old saves repair themselves (patch 381)

Because of the previous update's bug, some weapon mods may have been
recorded onto armor instead of the weapon. Nothing is lost forever:
on save load the game now strips the stray technical field from armor
(it never affected armor stats) and returns the "hidden" mods to the
bag. After updating, open your character and re-apply the mods to the
weapon — they will now stick and the card shows the new damage at
once. Mods that were installed correctly before are untouched; robot
mods are untouched.

## Fixed: weapon mods now stick to the weapon (patch 380)

When armor was also equipped, applying a weapon mod wrote it to the
wrong store item (the card lookup confused the weapon with the first
equipped item) — the modal preview was right while the weapon card
never changed. The store-item lookup now starts from the exact instance
key and falls back to weapon-type matching; it moved into the engine
with acceptance tests: the mod always lands in its own weapon and the
card shows the new damage immediately.

## Fixed build of the Weapons & Armor screen (patch 379)

The app failed to bundle: patch 367 accidentally duplicated a chunk of
code past the end of the screen file. The extra 18 lines are removed.
A new guard test parses every app JS file on each test run, so a broken
file now fails tests immediately instead of only at build time.

## Melee mods completed — full owner coverage (patch 378)

Final touch of the rebuild: 42 melee mods (spiked/barbed/bladed,
chain wrapped, electrified, stun pack, ...) are back where they belong
— baseball bats, baton, knuckles, walking cane and 17 more weapons.
Weapon→mod coverage now matches the owner's lists 729/729 (100%).
Weapons without an owner list (10mm SMG, plasma mine) stay untouched.

## Mods now match your lists exactly; weapons renamed (patch 377)

Modification windows are rebuilt: each of the 88 weapons with your list
now carries exactly your mods (21 weapons expanded, extra mods removed
from gatling laser and others). The arc welder (= "Дуговая сварка") lost
all 24 extra mods — no mods per your call. The Institute laser carries
exactly the 17 mods from your reference. The 10mm SMG and plasma mine
are untouched (no lists). 48 weapons renamed to your names (Russian
only; English untouched): Switchblade → "Выкидной нож", bumper sword →
"Большой меч", Institute laser → "Лазерный пистолет института", etc.
Robot weapon mods keep working — covered by tests.

## Every mod crafts now; 23 new mods and two new weapons (patch 376)

Revision continues. Every weapon mod has a crafting recipe now (36 were
missing) — costs derived from rarity and difficulty per the book. As you
approved, 23 new mods were added: Tesla coil dynamo/capacitor, quantum
gyro compensating lens, plasma caster capacitors, tear gas launcher
cameras/stocks, Thompson and pump-action receivers, bracketed short
barrel, auto axe blades, chainsaw bars, assaultron blade electrifier and
shocking coils. Two brand-new weapons join the catalog — Atom's Staff
(6 dmg, Piercing, Parry, Two-handed) and the Mining Drill (2 dmg,
Piercing 2, Breaking, Two-handed) — with your stats. The "Weapons"
crafting tile now holds 164 recipes.

## Weapon mods get readable internal ids, duplicates merged (patch 375)

Catalog revision begins. Opaque ids (mod_030 etc.) are replaced with
readable canonical ones, and 95 duplicate rows are merged into 31 real
upgrades: the catalog shrinks from 205 to 141 entries, each with its book
recipe when one exists. In-game names are yours (70 taken from your
lists). Old saves migrate automatically: installed mods move to the new
ids without loss; the save schema version is unchanged. Nothing should
visibly change except names.

## Tesla coil dynamo weight set to 6 (patch 374)

The last open figure of the revision material is settled: the Tesla coil
dynamo mod weighs 6 (references disagreed: 6 vs 12). The revision material
is complete; next comes the revision patch series itself (human-readable
ids, duplicate merging, your names, 22 new mods, save migration).

## Institute laser confirmed by the reference, arc welder has no mods (patch 373)

The Institute Laser reference you sent matches the app on all 17 mods and
stats — no divergence. Arc welder is recorded as one weapon (= "Дуговая
сварка", "Сварочная горелка") with no mods — its 24 catalog bindings are
extra and will be removed in the revision. Final tally: 539 bindings match,
580 to add, 147 to remove; only the 10mm SMG and plasma mine remain without
your lists — left untouched.

## Melee mods cross-checked against your catalog (patch 372)

The melee catalog you sent (38 weapons) is resolved: 35 exist in the game
(renames queued to your names), 53 weapon-mod bindings already match what
the app supports (no divergence), 9 mods will be created (auto axe
elemental blades, chainsaw bars, etc.). Outside the catalog: Atom's Staff,
Mining Pick... and the Welding Torch — a question: is it the current arc
welder or a separate weapon? Robot weapons untouched: their mods work and
are covered by tests. Only 4 weapons remain without your lists (arc welder,
Institute laser, 10mm SMG, plasma mine) — their support stays as is.

## New mods confirmed, English names found (patch 371)

Your answers are recorded: the 11 missing mods will be created; "Tesla
coil dynamo" and "Quantum gyro compensating lens" are unique mods whose
English names were found in the references — along with a third unique
one, "Tesla Coil Capacitor". Good news: the Cryolator's "energy cell
magazine" is the existing Fusion Magazine — just a rename. Stage result:
13 new mods with reference data; coverage recomputed (580 to add, 126
to remove).

## Supported mods collected from your list (patch 370)

Revision continues: all 141 unique slot+mod entries from your list are
resolved — 100 match existing rows, 29 are phantom duplicates (to be merged
during the revision), 11 mods are missing from the catalog entirely, 2 are
recorded as candidates. Coverage computed: 582 (weapon, mod) pairs to add,
127 to remove; 20 weapons (all melee except six names, arc welder etc.) have
no list yet — untouched until you send theirs. Data unchanged — revision
material (`weapon-mods-support-map-370`).

## Russian weapon names mapped to the catalog (patch 369)

Revision begins: all 83 names from the owner's weapon list are mapped
one-to-one to internal ids (54 matched by name, 25 resolved by stats,
4 — robot duplicates). This also settles the catalog dispute: the two
"combat rifles" get the owner's names — "Боевой карабин" and
"Самозарядная винтовка". Names and data are not changed yet — revision
material only.

## Weapon mod revision plan (patch 368)

Decision: the "why do some mods have no Create button" questions are
closed by a catalog revision — the data contains phantom rows (the same
improvement recorded several times, not all copies have a recipe):
31 improvements are duplicated across 95 rows, 53 rows lack recipes.
Recorded the plan (human-readable ids, merging phantoms, craft columns
from the book tables, lossless save migration) and the full duplicate
list. Work starts after it is confirmed that mods install and work
(patch 367).

## Mods on equipped weapons are actually saved now (patch 367)

Report: an automatic receiver was applied to the 10mm pistol, but the
weapon cards showed no change and the mod vanished after reload. The
Apply button wrote the mod into a hidden inventory copy, while cards and
the save file read the equipped-weapons list. The write is now pass-
through: the card instantly shows Burst and new stats, and the mod
survives character reload. The mod window closes after Apply again, as
it used to.

## Update installer fix (patch 366)

Update #364 failed to install after #363: the update file was built
against the wrong base. Rebuilt — installing 364–366 now works on the
first try. Gameplay is unaffected; this fixes the installer itself.

## Dialogs go through the app-wide unified mechanism (patch 364)

Per the owner's word: the app has a single popup mechanism that works
everywhere — the roll-dice question and refusal messages now use it
(the custom dialog window from the previous patch is gone). Same
behavior: "Roll dice"/"Auto-success" at zero difficulty, "Done" on
refusals, the green "Applied" note for mods. The mechanisms cheat sheet is merged into the agent map
docs/agents/README.md (no separate file — amended in patch 365 per
the owner's word).

## Craft and mod buttons respond on the web (patch 363)

From the owner's bug batch, the root of the "silent" buttons: on the
web build the system popups are silent stubs — and the "Roll the
dice?" question at zero difficulty and the "missing perk/materials"
messages relied on them. Both now ask inline in the window
("Roll dice"/"Auto-success", "Done"), and applying mods no longer
closes the window silently: the card updates in place and a green
"Applied: …" note appears. Mod installation itself worked before (the
italic bag items were installed mods).

## Fixed the equipment screen crash (patch 362)

The "Cannot access before initialization" error when opening the
Weapons and Armor screen — a regression from patch 359 where store
action selectors were declared below the code using them. Moved above;
a test now guards the declaration order.

## Export = save, byte for byte (patch 361)

Per the owner's request "export always equals the save": the source of
historical drift is gone — on export the save body was re-compressed
with the screen's catalog, so the file could differ from the save
(different locale, updated compression rules, double pass). The export
file now carries exactly the body stored in the save, with no
reprocessing. Import and old "fat" files work as before.

## Robot weapon mods after loading a save: ghost cleanup and reliable writes (patch 360)

From the owner's save export (an assaultron with a laser gun): old
saves kept a second copy of robot weapons in the equipped list — a card
with a stale mod set, which made an already-removed capacitor look
stuck. The ghost copy is now purged on load. Also, writing mods to
robot weapons no longer depends on the slot shape inside a save: slots
are always expanded to the full form, so install/remove/replace works
after any load.

## Robot weapon mods follow the common law (patch 359)

Owner's report (a beta-wave tuner for the assaultron laser): a mod on a
robot slot weapon was applied, but the mod item stayed in the inventory
forever — it looked like "nothing happened". The same law as on human
weapons applies now: installing hides the mod item from the inventory
(bound to the slot and the weapon), replacing or removing returns it;
taking the weapon out of the slot or swapping the limb returns its mods
too.

## Exact law of automatic check failure (patch 358)

Owner's clarification on the check mechanism: an automatic failure is
"a complication and no successes at all", not "two 20s rolled". A 20
and a 20 fail by themselves (they give no successes), but a single 20
with no successes fails too. On the usual two dice the outcomes are
unchanged; the rule is now exact. Standing laws: each situation defines
its own failure consequence (chems and alcohol — addiction, crafting —
lost materials or time, disease — longer duration), and successes
beyond the difficulty always refill the AP pool.

## Craft report in the mod installation modal (patch 357)

Owner's feedback: crafting a mod with the "Create" button left it
unclear what had happened. The same report as in the crafting window is
now shown: the check arithmetic, rolled dice and outcome, what was
gained and what happened to the materials (including "burned" on a
failure), the time; on success — the 2 AP question. A refusal before
the check (perk, materials) keeps the short message. Also fixed a rare
crash when a check earned more successes than required.

## Difficulty 0: the game asks about rolling (patch 356)

Owner's word: when difficulty is cleared by skill (difficulty 0), the
game asks — "Roll the dice?". "Yes" — roll with the Success/Failure
rules: a 1 is a critical (2 successes), a 20 is a complication (extra
time), a complication with no successes fails the check. "No" — auto-success without a roll, as
before. The question appears in the crafting window (one per batch)
and on the "Create" button in the weapon mod modal.

## The "Create" button is green (patch 355)

Per the owner's feedback: the button color is green rgb(34, 197, 94),
already used in the app styles (the perk selection modal). The blue from
the previous fix was a mistake.

---
## "Create" button: compact and darker, requirements per the mockup (patches 353–354)

Fixes from the owner's interface testing feedback.

- The "Create" button now matches this modal's "Apply" button style and
  no longer stretches across the row: compact, on the right.
- Requirements are shown as a block: a "Requirements: perk · complexity"
  line, with materials as "have/need" (e.g. "Common material 2/4") in
  small font to the left of the button.

---
## A "Create" button in the weapon modification modal (patch 352)

The first slice of the owner's plan (§2.10) — for interface testing.
With the "Modification installation" setting on, every mod position that
is not in the inventory shows a "Create" button and a requirements line.

- The button is green when there are enough materials; dimmed otherwise.
- Requirements in one line: perk(s) with ranks, materials by rarity,
  complexity.
- Pressing creates the mod (it lands in the inventory and the button
  disappears); missing perk or materials is explained.
- The mod list is no longer filtered by the setting — buttons instead.

---
## Weapon mods: installation from the bag, same binding law (patch 351)

Law 343/344 now covers weapons too: a crafted or found weapon mod, once
installed, gets the "equipped" flag and binds to the weapon item.

- "Sold the weapon with the mod — both are gone"; removing or replacing
  makes the old mod visible in the bag again.
- With the "Modification installation" setting on, the weapon modification
  modal shows only mods from the inventory (mods already installed on this
  weapon stay visible — otherwise they could not be removed).
- Built-in weapons (fists) without a bag item are a virtual host: the mod
  is not flagged.
- Robot built-in weapons (limbs) are untouched — they have their own
  limb-swap mechanics.

---
## Setting renamed: "Modification installation" (patch 350)

Owner's word: the "mods via crafting" mode is the existing setting,
named and described as: "Modification installation. A modification can
be installed only if the modification itself is in the inventory."

- The setting's title and description updated (ru and en); behavior
  unchanged: off — free installation, on — the mod must be in the
  inventory.
- The open point of plan §2.10 is closed; work order confirmed: next —
  weapon mod installation from the bag.

---
## Plan recorded: "Create" in install modals and crafting sections (patch 349)

The owner's idea recorded in the owner's own words (reference, §2.10);
timing — "perhaps toward the end of crafting". No code changed.

- Install modals get a per-position "Create" button and requirements
  (perks, materials, complexity) when the "mods via crafting" mode is on;
  hidden when the mod is already in the inventory.
- Crafting categories get sections by armor family and weapon slot
  ("Leather Armor", "Receiver").
- Open question: is "mods via crafting" a new setting or the existing
  "Require mod in bag"?

---
## Weapon mod crafting: 152 recipes, the "Weapons" square is alive (patch 348)

Per the owner's decisions (346/347): recipes are built from the weapon
mod catalog columns — the audit of the book's printed tables. All mods
with crafting columns are released, uniques included; capacitors as-is.

- The crafting window's "Weapons" square: 152 recipes (289 in total).
- The check skill is Repair or Science! (from the column); perk gates are
  the same as for other recipes: "Gun Nut", "Science!", "Blacksmith".
- A crafted mod lands in the bag as a regular item.
- Failure burns materials by the gear rule (like armor mods).
- A data typo fixed: "Serrated Blade" — the "Blacksmith 1" perk (was
  "Blacksmtih").
- Mods without crafting columns (53) stay recipe-less — the book has
  none for them.

---
## Capacitors confirmed, no doubt marks left in weapon mods (patch 347)

Owner's word: leave the capacitors as they are — materials and
complexities are confirmed. Rarity was also checked against the same
book tables.

- "Large Magazine" and "Quick-Eject Mag": rarity Uncommon (the data said
  Common — a mismatch with the table, now fixed).
- The audit's doubt mark "?" was removed from all remaining fields: none
  of the 205 weapon mods carry it any more.
- Capacitors: complexities 5 and 2, materials unchanged.

---
## Weapon mod crafting columns revised against the book (patch 346)

The owner provided the printed tables (pp. 222–223); the data was checked
row by row and four mismatches were fixed.

- "Large Magazine": complexity 4 (was 3), "Gun Nut 1" (was 2).
- "Quick-Eject Mag": complexity 5 (was 3), materials follow the
  complexity-5 curve — Common ×6, Uncommon ×4, Rare ×2.
- "Full Capacitors" and "Capacitor Boosting Coil": the book's perk
  requirements are pairs, "Gun Nut" + "Science!" (3+2 and 4+3).
- The audit's doubt mark "?" was removed from confirmed rows; the
  materials of the two capacitor mods await the owner's word (the book
  has no complexity column for capacitors).

---
## Clarification: creation-kit clothing does have its own item (patch 345)

The owner's question exposed an error in the previous report: creation
kits put ALL items (clothing included) into the inventory as items with
ids — the character equips them manually. There is no separate
"creation cosmetic without an item".

- The mod-to-item binding works the same for all clothing and armor.
- A slot without an instance key is only possible in old saves and
  file-imported characters — there the mod simply stays a visible item
  in the bag (it is not lost).
- Documentation-only changes; app behavior unchanged.

---
## Selling and spending buttons now take installed mods along (patch 344)

Owner's word: selling and spending items are buttons on items in the
inventory; weapon mods will behave the same way — bound to the item,
inventory visibility.

- The "Sell"/"Spend"/"Discard" buttons now go through the store: when the
  quantity reaches zero, installed mods leave together with the item (the
  rule lives in a single copy — in the store).
- A mod is bound to the ITEM (the bag instance): taking armor off and on
  again no longer loses mods — they are "one whole" with the item.
- Installing a mod on an item without a bag instance (kit clothing) is
  virtual: the mod is not flagged and stays visible.
- Recorded as law: weapon mods (once they become items — the "Weapons"
  crafting square) behave the same — bound to the item, bag visibility.

---

## An installed armor mod now becomes equipped (patch 343)

Owner's word: selling the host item takes the mod with it; an equipped mod
is invisible in the inventory; removing or replacing it makes the mod
visible again. The owner's analogy — a robot arm with a built-in weapon.

- On installation the mod item gets an "equipped" flag and is bound to the
  armor piece it was installed on (`installedOn`).
- When the host item is consumed away, its installed mods go with it.
- Removing or replacing the mod in the install window returns the old mod
  to the bag.
- Free installation (the "require mod in bag" setting is off and no mod
  item exists) is just a record on the armor — nothing to return.

---

## Universal mod, Material vs Modification, bag gate (patch 342)

Owner's words after the first snag of testing.

- A mod is universal unless stated otherwise: "Boiled Leather" fits any
  part of its armor family, "Shadowed Metal" — any metal armor piece.
  The data already worked this way — recorded as law.
- Armor material ≠ armor modification: armor takes 1 material + 1
  modification. Install-window sections renamed in owner's words:
  "Armor material" and "Modifications" (were "Unique/Standard").
- New Crafting-section setting — "Require the mod in the bag to install"
  (default OFF: free installation, as before). On — only created/found
  mods can be installed; empty groups show "None in the bag (craft them
  in the Crafting window)".

## ## ARMOR MOD CRAFTING — the "Armor" tile works (patch 341)

Owner's word: "I'm waiting to test crafting armor mods." Patch 341 starts
the series: mod crafting is ready for testing.

- The "Armor" tile in the crafting window: 44 recipes — every mod-item
  from your table (weave, vault-suit linings, raider/leather/metal/combat/
  synth materials, generic body/arms/legs mods). Not emitted: the four
  recipe-only mods (340) and the ambiguous "Lightweight (2)" row.
- Materials follow material capacity (book): capacity 2 = Common ×3,
  capacity 7 = Common ×8 + Uncommon ×6 + Rare ×4, etc.
- Check: INT + Repair, difficulty = capacity − rank (rules 323); perks
  (Armorer/Science!) gate like other recipes; one hour; failure burns
  materials per the "gear" setting.
- The crafted mod is an inventory item with its catalog name ("Вываренная
  кожа", "Ballistic weave"…). The mod-install window still lists catalog
  mods freely — QUESTION to the owner: should installing REQUIRE the
  crafted mod in the bag (today it doesn't)?
- Not in this patch: power armor and weapons (empty tiles), rare-recipe
  learning (future series), applying the four recipe-only mods (340).

## ## Debt closed: "Pockets" and three more are craft-recipes (patch 340)

The owner checked the book: Pockets, Deep pockets, Lead-lined and
Ultra-light are mod-RECIPES, not mod-items ("different concepts, like a
byte and a kilobyte"). You can craft them, but you cannot apply them to
armor yet: the book's mod-items section has no such entries — errata
needed.

- The crafting table (327) stays true; the reference doc records the
  distinction: a mod-recipe ≠ a mod-item (linked by id, exist separately).
- The armor-mod data is now considered COMPLETE. The fate of the four
  recipes (skip them or emit with an "cannot be applied" note) is decided
  when the mod-crafting series starts.

## ## Three mod clarifications; origin of the four "owed" (patch 339)

Owner's words recorded into effect descriptions (shown in the armor
upgrade window's "Effects" line; DR columns empty for all three — 337):

- Parrying: +2 Phys. DR, only when an attack using the Melee Weapons
  skill targets you.
- Soft lining (legs): +2 Phys. DR, only when the character falls.
- Lightweight (arms): while worn, weapons using Melee Weapons or Unarmed
  gain Piercing 1 (stacks with existing).

Answer to "where did it come from": the four mods (Pockets, Deep pockets,
Lead-lined, Ultra-light) are from the owner's own crafting-table dictation
(patch 327, "Armor modifications" section, quote kept in the reference).
"Lightweight" from that record is resolved — it's the arms mod. The other
four await the owner's decision: real (then categories + effects) or a
dictation error.

## ## Armor mod clarifications: synths, five mods owed (patch 338)

Owner's words on patch 337's questions.

- "All body" in the install table means "fits any body area", while these
  mods install ONLY on synth armor. The patch 333 removal of the three
  "materials" was correct — not restoring; uniq_synth_* records represent
  them on synths.
- The five generic craft mods (Lightweight, Pockets, Deep pockets,
  Lead-lined, Ultra-light) are OWED: the owner will check which armor
  categories they belong to and send effects. Until then they stay out of
  the windows.
- Bottom line: armor-mod data is complete except the five owed mods.

## ## Armor mod install table — cross-checked, 2 double-counts fixed (patch 337)

The owner dictated the book's "Armor improvement modifications" table
(effects/weight/cost/perks). Cross-check: all 12 standard mods already
carried book-accurate effects, weights, costs and perks; two double-counts
found and fixed — "Parrying" granted +2 Energy DR on top of its "+2 vs
melee attacks" effect, "Soft lining" (legs) — +2 Physical DR on top of the
"+2 vs falling" effect. The book leaves both DR columns empty — now so
does the data. Characters with these mods recompute automatically on the
next load.

The table is recorded in the reference doc (§2.7). Two questions to the
owner (protocol 331): 1) "Laminated/Rubberized/Microcarbon" appear in the
install table as all-body upgrades, though patch 333 removed them as
"synth-only" — restore them? 2) five craft-only mods (pockets, lead-lined,
ultra-light, lightweight, deep pockets) have no install-table row — no
combat effects at all, or a different page?

## ## "What's new" — once per release, no checkbox (patch 335)

Owner's word: the checkbox is excessive; show the window once per
RELEASE — a release consists of many patches, not "every little step".

- version.json now carries release (the release number) and notes = the
  RELEASE description; version (the patch number, rule 321) updates as
  before.
- The window shows once per release: closing it remembers the release;
  until the next release it stays quiet. The checkbox is gone (dictionaries
  too).
- Patches between releases don't raise the window. You declare a release —
  on your word ("make a release") I bump the number and write the batch's
  description.
- Release #1 describes the whole batch since patch 315: the new crafting,
  book rules, the AP pool, explosives, armor mods — references and the
  duplicates cleanup.

## ## Spoiler materials as a flat list (patch 334)

Owner's word: material headers are excessive ("Materials", "Common
materials", "Uncommon materials") — type and quantity are enough.

- A recipe's spoiler now shows materials as one flat line each: name on
  the left, the "have N · need M" counter on the right.
- The "Materials" section label and rarity group headers are gone;
  complexity, skill and cooking time remain the spoiler's first line.

## ## Synth-material duplicates removed from generic mods (patch 333)

Owner's word: "Laminated, Rubberized, Microcarbon, Nanofiber are unique
SYNTH armor mods." They must not exist in the generic mod list.

- Removed mod_std_laminate, mod_std_rubberized, mod_std_microcarbon from
  generic mods (15 → 12); the unique synth mods (uniq_synth_*, including
  Nanofiber) are untouched.
- Save migration v25 → v26: if a character had one of the removed
  duplicates installed on armor/clothing, it is gently uninstalled
  (inventory, modified-items album, equipped piece); other mods are
  untouched. No one loses bonuses: stats came from the catalog record
  that no longer exists.
- Owner's answers recorded (§2.5): costume-mod effects table is coming;
  a recipe item is consumed on use; the rare-recipe learning system is
  built for ALL crafting from the start.

## ## Armor-mod answers — recorded, plan refined (patch 332)

The owner answered the four questions of 327. The app itself is
unchanged — records and code checks only.

- Crafting capacity and item complexity are different things (the owner
  was right, my comparison was wrong): the mods' complexity field is used
  nowhere, the data stays untouched; capacity will come from the book
  table as its own field.
- The 15 missing mods are CLOTHING mods: the weave fits most costumes,
  the vault suit takes the weave + linings; effects table awaited.
- Laminated/Rubberized/Microcarbon/Nanofiber are unique SYNTH armor mods;
  the generic duplicates are redundant.
- Rarity: common recipes known to everyone; uncommon unlock via perks;
  rare ones via recipe ITEMS (a new "Recipes" inventory category, MK II
  driver principle: applying the item lifts the lock, item id = recipe
  id). A separate patch series — spec recorded in the reference doc.

## ## Question protocol — ask first, fix later never (patch 331)

Owner's word after the 329→330 pair: "if there is any misunderstanding
or ambiguity — push it onto me so I describe the details, instead of
patching the misunderstanding twice."

- The rule is recorded in state.md Lessons as law: any ambiguity becomes
  a question to the owner BEFORE work; questions in reports get an
  explicit "QUESTIONS — awaiting answers by number" heading.
- The four armor-mod questions (327) are restyled: the reference doc's
  section header now shouts that these are questions and mod crafting
  will not start without answers (the owner honestly missed them as
  "statements").

## ## Category tiles — like character cards (patch 330)

Owner's correction to 329: "do character cards look like that?" — no.
In 329 the tiles were styled after home-screen FOLDERS (dark panel, gold
border) — the wrong reference.

- Category tiles now follow the CHARACTER cards (characterCell): light
  panel, grey border, radius 8; dark label, grey counter, icon in the
  border's tone.
- The window background (setting image) and the rest of 329 are untouched.

## ## Crafting window — setting background, home-style tiles, perk-style cards (patch 329)

Owner's design word: the categories window gets the setting windows'
background, category areas styled like the home screen, spoilers as neat
cards like the perks modal; availability by color and in parentheses.

- The categories window now sits on the setting windows' background image
  (assets/bg.png, dimmed like the Gear/Character screens).
- Category tiles match the home-screen areas: dark panel, gold border,
  rounded corners; warm-gold label, grey counter.
- Recipe spoilers are cards modeled on the perks modal: border, radius,
  padding, separator before the body — no more solid sheets.
- An available recipe is a light card; perk/rank-locked is grey (grey name
  too). Material availability sits next to the name in parentheses:
  "(can craft)" / "(missing materials)" / "(needs a perk)".
- Complexity, skill and cooking time moved inside the spoiler (first line);
  the full missing-perk text is there as well.

## ## Rarity, capacity and item are independent (patch 328)

Owner's clarification to the armor-mods table (327), recorded in
`docs/reference-data/armor-mods-crafting.md` (section 1.1). The app is
unchanged — it does not violate the rules today.

- A mod's rarity is NOT the recipe's material capacity: independent book
  columns. A recipe's materials are set by the capacity; rarity does not
  affect the material set (weave: capacity 3, rarity Rare; shielded
  lining: capacity 6, rarity just Uncommon).
- A recipe's rarity is NOT the created item's rarity: the label describes
  the recipe; the crafted mod carries its own record's attributes.
- If the crafting window ever shows rarity, it is a label of the recipe
  row, separate from capacity, never transferred to the crafted item.

## ## Armor-mod crafting table — recorded, cross-checked (patch 327)

The owner dictated the book's armor-mods table (the "Armor" tile — the
future mod crafting via material capacity). The app itself is unchanged.

- The table is recorded verbatim in
  `docs/reference-data/armor-mods-crafting.md`: 49 mods — ballistic weave,
  vault-suit linings, raider/leather/metal/combat/synth armor materials,
  generic mods.
- Cross-check against our data: 34 of the table's mods exist, but the
  capacity (complexity) differs in ALL 34 (offsets 1 to 3, no single
  system). Perks and the Repair skill match.
- 15 mods are missing from the data (weave — 5, linings — 5,
  lightweight/pockets/lead-lined/ultra-light — 5), and there is no
  "rarity" column.
- 4 questions to the owner are recorded in the same file (whether to fix
  complexity — it changes mod INSTALL cost; whether to add the missing
  mods; what to do with three duplicate "material" mods; whether the
  crafting window needs rarity).

## ## Materials — piece counters only; capacity table documented (patch 326)

Owner's word: "just a few kinds per recipe — piece counters are enough,
don't bloat the interface", plus a clarification and a question about the
materials scheme.

- Removed the KIND counters: no more "Common materials 0/1" on the recipe
  row and no "0 of 1 kinds" in the spoiler. A ready recipe row now simply
  says "Ready"; spoiler rarity headers are plain labels, and each material
  keeps its own "have N · need M" counter.
- The "Armor", "Weapons", "Power armor" tiles are the future MOD-crafting
  entries for those categories (material capacity); they stay.
- The printed "capacity → materials" curve (1: Common ×2 … 7+: Common ×8,
  Uncommon ×6, Rare ×4) already lived in the data generator and was checked
  against the owner's table — no differences. It is now also written into
  the reference doc `docs/reference-data/CRAFTING-MAPPING.md`, next to the
  data it produced (the section is generator-produced, not hand-edited).

## ## Crafting — light windows, explosives split out, honest labels (patch 325)

Owner's word — four fixes from playtesting: window palette, where
explosives live, confusing materials numbers and the time label.

- Crafting windows recolored to the light palette used by the perk and
  item-picker modals: white panels, green accents, dark text. No more
  dark-themed crafting windows.
- Grenades and mines (all 9 recipes) moved from "Weapons" into the new
  "Explosives" category — its own file and tab. The "Weapons" tile stays
  empty ("No recipes yet") for the future. Category order unchanged.
- Materials no longer mix units: the rarity header counts KINDS —
  "Common materials: 0 of 1 kinds" — while a material line counts PIECES —
  "have 0 · need 2". Answer to the owner's question: the example needs
  1 kind of material, none in the bag, and that kind takes 2 pieces.
- Time is labeled explicitly: "crafting time: 20 min" on the recipe card
  and "Crafting time: …" in the report.

## ## Group AP pool — checks refill it, "2 AP" spends from it (patch 324)

Owner's word: the group AP pool = 6; you can't spend more than 6, unless
checks granted AP. AP lives inside the engine for now (a UI store comes
later); the pool is group-wide — the future game-master screen will hook
into it as is.

- A successful crafting check refills the pool: +1 AP for each success
  beyond the difficulty (difficulty 1 with 2 successes → +1; 3 successes
  → +2). A critical die (1 or ≤ the tagged skill's rating) counts as
  2 successes — its bonus flows in naturally.
- Automatic success (difficulty 0, no roll) and failures grant no AP.
- "Spend 2 AP — halve the time" now requires the pool: with fewer than 2
  the question isn't asked and time runs full. The report shows
  "AP: +N to the group pool (now M/6)" and the pool in the question.
- Fuse: acceptance test (patch 324) — the cap of 6, the owner's example,
  crits, failures, auto-success, refused spending when short.

## Crafting — by the printed rules: times, complications, 2 AP and material loss (patch 323)

Owner's word — the rulebook text (pp. 210–211) plus two decisions:
times strictly by the book; the ability to "lose materials" is optional.

- Times: crafting takes one hour for all categories; a cooking station
  (food and drinks) — 20 minutes. The old complexity table (10 min/1 h/1 day,
  decision 259) is retired.
- A complication adds +30 minutes (station +10), additively. The old ×2
  time doubling is retired.
- After a successful craft the window asks: "Spend 2 AP to halve the time?"
  — "yes" spends half the base time (complications on top), "no" — full.
  Full AP arrive with the future game-master screen (a group resource);
  for now — an honest yes/no choice.
- The check is unchanged: INT + skill, difficulty = recipe complexity −
  skill rank (minimum 0), zero — no check needed.
- Settings: a new "Crafting" section with two independent material-loss
  switches — (1) food, drinks, explosives, chems; (2) armor, weapons, ammo
  components and other. Both on by default.
- Fuse: acceptance test (patch 323) — times, additive complications,
  deferred time and the AP choice, both loss settings, dictionaries.

## Crafting — window fixes from the owner's testing (patch 322)

- The category window now scrolls (it didn't scroll on desktop before).
- Tiles are 3 per row. Row remainder: a single tile is centered, two start
  from the left edge (owner's word).
- "Have N · need M" now sits next to the material name, not at the far end
  of the row (it drifted to the edge on wide monitors).
- The recipe line explains itself: "Complexity 1 · Survival · time: 1 d" —
  the check's skill and the in-game crafting time (the owner's question
  "what is 1 d?").
- Fuse: acceptance test (patch 322) — scrolling, the 3-per-row grid with
  alignment rules, materials next to names, the time label, dictionaries.

## Update system: the app announces new versions and shows a changelog (patch 321)

Owner's word: "the app should knock on the server, ask if there's an
update, download it and show a changelog with a 'don't show again'
checkbox".

- A version file now lives next to the app: `version.json` (patch number +
  2–4 changelog lines ru/en). Updated in the same patch as the journals.
- On every launch the app reads the file always fresh; if the version is
  newer than the one remembered on the device — a "What's new" window
  appears.
- The "Don't show again" checkbox remembers the version; without the
  checkbox the window returns on the next launch. The update itself
  downloads automatically (that already worked) — a user who sees the
  window is already on the fresh version.
- Fuse: acceptance test (patch 321) — the version file, show/hide logic,
  device memory, resilience to bad network, and the window's wiring.

## PWA — installation and long-installed app updates fixed (patch 320)## PWA — installation and long-installed app updates fixed (patch 320)

Owner's word: "can't install from Yandex or Mi browser; it used to create
a shortcut" and "many can't update their old PWAs".

- Installation: the manifest now has a real 192×192 PNG icon (previously
  only an SVG, which browsers don't count as an install icon) — the
  Chromium install criterion is met again, the "Install" button returns.
- Stuck updates: for some long-time users an old service worker served a
  cached old version for years and never woke up (its file never changed).
  The file is changed on purpose — the worker reinstalls, unregisters
  itself and clears the caches; the next launch of a stuck client fetches
  the fresh app (the "STR above 10" fix will finally reach them).
- Fuse: acceptance test (patch 320) — icons are real PNGs of the required
  sizes, the manifest is installable, the worker wake-up is in place.

## Crafting — the "Craft" button now opens the crafting window (patch 319)

Behavior fix (the owner asked: "did you wire the modal to the button?" —
the check showed it had never been wired).

- Since the app's very first commit the "Craft" button showed a placeholder
  alert instead of a window; the crafting window (neither the old 265 one
  nor the new 318 one) was unreachable from the button. Now the button
  opens the crafting window.
- Fuse: acceptance test (patch 319) pins the "button → window" wiring so
  this cannot get lost again.

## Crafting — new window: category tiles, recipe spoilers, quantity picker (patch 318)

Owner's word: a pleasant one — a convenient crafting window instead of
bench tabs. Mechanics unchanged: same perk gates, bag counting, skill check
and report (format of 265).

- The "Craft" button in inventory opens a tile window: food, drinks, chems,
  explosives, weapons, armor, power armor, ammo (owner's decision — the
  8th tile). Each tile has an icon and an "available/total" counter.
- A tile opens a list of recipe spoilers: unavailable gray, available white.
  Inside a spoiler — materials by rarity (common/uncommon/rare, only
  required types, each with "have · need") and a "Create" button.
- If materials suffice for more than one — a separate window before
  creation: "You can craft N „item". How many?" with − and + (default 1).
- "Back" top-left returns to the tiles from any category; "Close" at the
  bottom of the tile window returns to inventory. Any number of different
  items can be crafted in one visit.
- Categories without recipes (explosives, armor, power armor) are visible
  with a "no recipes yet" note — they fill in as recipes arrive.
- Fuse: acceptance test (patch 318) — tiles and order, material rarity on
  ammo_38, perk gate, batch size, dictionary.

## MK-3, step 2 — the store recalculates derived stats itself, manual calls are gone (patch 317)

Continuation of the "cascade into the store". Nothing changes for the
player — all the numbers are the same. What changed is inside: it is no
longer possible to "forget to recalculate".

- Any store action that changes an input (attributes, effects, perks, trait,
  level, origin, robot slots, equipment mirror) now updates the derived stats
  (max health, initiative, defense, melee bonus, carry weight) automatically
  and synchronously — one function, same formulas as 316.
- All 26 manual recalculation calls removed (22 in the store, 3 in the robot
  slice, 1 in effects sync); the recalculate action remains as a public
  force-refresh entry point.
- Fuse: acceptance test (patch 317) — 7 checks, none of them calls the
  recalculation manually: attributes, effects, a perk, robot slots, the
  equipment mirror, the force entry point, and no infinite looping.
- This is the foundation for the future game master: when world states
  arrive from a server, the cascade recalculates the numbers by itself —
  nothing to forget.

## Refactor MK-3, step 1 — derived-stat formulas moved into the module (patch 316)

First step of the "cascade into the store" plan (2026-09-18). Derived-stat
rules now live with the setting; the engine reads them through the door.
Behavior is unchanged: full test suite green.

- New: `modules/fallout/logic/derivedStats.js` — initiative (PER+AGI),
  defense (AGI 9+ → 2), melee bonus (STR thresholds 7/9/11), max health
  (END+LCK+level), human and robot carry weight, and the full assembly with
  power armor frame, timed effects and perks (`calculateDerivedStats`).
- The engine (store) reads the formulas only through the door:
  `domain/registry.js` → `getDerivedStatsLogic()`.
- Data boundary restored: `src/store/resolvers.js` no longer reads the power
  armor data file — removed from the boundary test's debt list (11 entries).
- Setting-agnostic math (SPECIAL key canon, equipment modifiers, frame
  attribute modifiers) is consolidated in `resolvers.js` — a file with zero
  imports, so module logic cannot create loading cycles.
- Fuse: acceptance test with golden constants (patch 316) — thresholds,
  assembly, perks, robots, PA frame, registry door.

## Work memory — a "where we are now" file for AI agents (patch 315)

Owner's word: learn to remember what's done and what the app consists
of, so the agent doesn't walk the whole tree over every question.

- `docs/agents/state.md` — read FIRST: a snapshot of the current state
  (latest patch, what the owner has applied), the app's composition in
  game terms (heroes, screens, robots, weapons/mods/variants, misc),
  the latest series in brief, open questions, lessons learned.
- Maintenance rule — updated IN THE SAME PATCH as the change (2–3
  lines); the `docs/agents/README.md` map lists the snapshot as step
  zero of the reading order.

## Data — robot weapons that ARE human weapons: full variants, stats only from the base (patch 314)

Owner's word: "a robot weapon that's a human weapon is 100% the human
one. Otherwise it would be a separate record with a separate id and
separate stats."

- The link moved onto the existing variant mechanism (like "The
  Danger razor" being a variant of the switchblade): the robot weapon
  record now carries trueItemId and NO combat fields at all — only its
  identity (id, name, group, mounting flag) and factory mods. The Mister
  Handy Flamer IS the human Flamer; the Laser Cutter IS the human Laser
  Gun; the Automatic 10mm Pistol IS a 10mm Pistol with an auto receiver
  out of the box.
- On screen: the Flamer's fire rate 2 → 4 (as the human one), attack
  attr STR (was AGI), damage type energy (was fire); the Laser Cutter's
  fire rate 1 → 2; the Automatic 10mm unchanged (3 damage / 4 shots —
  base 4/2 plus the auto receiver −1/+2). An edit to a human weapon now
  reaches the robot version entirely: stats, effects, qualities, ammo,
  mods.
- The upgrade dialog offers all human mods to the robot versions (as in
  312); the dialog preview computes from the base.
- Locked by 14 checks — a variant must not own combat fields (the test
  falls otherwise), the expanded catalog carries base stats and the
  variant's OWN name ("Laser Cutter", not "Laser Gun"), the screen
  catalog rows agree, the auto-receiver math on the card (replacement
  and return of the factory mod), the slim save shape.
  Suite 863/863, tsc clean.

## Docs — an AI-agent starter map: how the app works, what flows from where to where (patch 313)

Owner's word: maintain files describing how the app works and where the
data flows, for AI agents — so they don't guess how things are built and
read a couple of files instead of the whole stack.

- `docs/agents/README.md` — the entry point: required reading order,
  the repo map by layers, a "typical task → files to touch" table, a
  short list of prohibitions.
- `docs/agents/data-flows.md` — data flows across six mechanics: the
  catalog (JSON → setting door → registry → screen catalog), weapon mods
  (one truth and the write plan, 311), robot slots (robot anatomy from
  data), saves (passports and migrations), survival (the extension
  precedent), and the patch installer.
- `replit.md` now points agents to `docs/agents/` first.
- Maintenance rule: when a flow moves, the map is edited IN THE SAME
  PATCH — the map must not lie.

---

## Data — robot weapons inherit human mods via a data link; weapons "with a mod out of the box" (patch 312)

Owner's word: the Mister Handy Flamer IS the human Flamer; the Laser
Cutter IS the human Laser Gun; the Automatic 10mm Pistol is a 10mm Pistol
with an auto receiver pre-installed, like the kit weapon with a mod the
super mutant gets.

- The link lives in data: a baseWeaponId field on the robot weapon record
  (Flamer → weapon_flamer, Laser Cutter → weapon_laser_gun, Automatic
  10mm Pistol → weapon_10mm_pistol). The upgrade dialog now offers human
  mods to robot weapons: Flamer — fuels and barrels (6 mods), Laser
  Cutter — capacitors and barrels (21), Automatic 10mm — the full Pistol
  set (28). An edit to a human mod reaches the robot version without
  touching the program.
- "Out of the box": a weapon record may carry modIds — factory mods. The
  Automatic 10mm ships with the auto receiver mod_008: damage 4 → 3,
  fire rate 3 → 5, the Inaccurate quality. The card shows the mod as
  installed. A player mod in the same slot replaces the factory one;
  removing all mods brings the factory one back — it is part of the
  weapon's identity.
- Locked by 10 checks in
  `__tests__/weapons/robot-weapon-inheritance.test.js` — links point to
  existing records (the dead-map lesson of 311), upgrade dialogs see the
  human mods, the auto-receiver math on the card, replacement and return
  of the factory mod, the slim save shape. Suite 859/859, tsc clean.

---

---

## Unification — weapon mods: one truth, one write path; a limb's own-attack mods now survive saving (patch 311)

Owner's rule: modifying items is a property of many games, so the shape
of truth and the write place are decided by the engine (a universal
TypeScript contract); the setting supplies the mod catalog and storage.

- One shape of truth: a weapon instance carries a LIST of mod ids; the
  "slot → id" map is a derived view for the screen (the mod knows its
  slot). The "list or map" duality is gone: priority is unconditional,
  an empty map means "no mods".
- One write path: the upgrade dialog no longer chooses among four
  branches by storage place. The engine classifies the place and returns
  a plan (inventory item / human equipped weapon / robot palm / weapon
  installed into a limb / the limb's own attack); the screen only
  executes the plan.
- New state: mods can be installed on a LIMB'S OWN ATTACK (the Assaultron
  arm claw, the head's built-in Head Laser). The dialog used to offer
  them, but the save had no place for them — mods vanished on reload.
  Mods now live on the limb itself and survive saving; the slim save
  shape gains an optional field (old saves read as before).
- Data: the hardcoded "robot weapon inherits human mods" map is removed
  from code — a check across all data files showed it pointed at numeric
  ids that exist nowhere in the data and never fired (the Flamer, Laser
  Cutter and Automatic 10mm pistol never inherited human mods). The
  inheritance mechanism moved into the data (a link field on the robot
  weapon record); the "robot weapon → human weapon" pairs are the
  owner's decision.
- The orphaned robot mod-slot list file is removed: the knowledge of
  "which mods fit which slots" lives in the mods' own descriptions
  (reissue of 306 — the manual removal step is no longer needed).
- Locked by 15 checks in `__tests__/robot/weapon-mods-one-truth.test.js`
  (truth shape, write plans for all five storage places, the Mk III
  capacitor on the Head Laser: damage 5 → 6 and back, slim save shape,
  card roles, no dead map). Suite 849/849, tsc clean.

## Patch installer — rewritten on the "truth lives in the files" principle (patch 309)

Owner's word: the single source of truth is the actual file content,
verified fresh on every run for every patch. The state journal no
longer decides (nor do the --3way, --mark-through, --mark, --unmark
keys and all status-guessing heuristics — removed). A patch that
passes neither check is deferred; the verdict comes from later patches
on the same files or from traces of its added lines in the tree.
Rollback leftovers (git reset does not touch future patches' new
files) are recognized by byte-exact match and recreated by the patch.
After applying — and on repeat runs — the integrity of all data files
is checked: glues are caught immediately, with the cure attached.
Rolling back a batch of patches and reinstalling works without
touching history. No migration needed: .git/arena-patches.state is
no longer used.

## Tool — repair of "two JSONs in a row" gluing in data files (patch 308)

Six data files in the owner's working tree turned out glued: after a
complete JSON in each, another chunk of content follows. No patch in
300–307 touched those files (except material.json, which patch 303
repaired rather than broke); the patch applier is strict — it applies
exactly or refuses entirely, it cannot glue anything to a file's end.
The tool tools/fix-double-json.js finds glues, shows what got glued,
saves a .bak backup and merges the chunks: on duplicates the later
chunk wins. Run: node tools/fix-double-json.js

## Decision list — 13 disputed weapon mods (patch 307)

Moving knowledge from the slot list into mod descriptions is almost
clean (295 additions, no behavior change), but 13 mods on six weapons
claim applicability the list does not allow. The list with questions is
in docs/reference-data/weapon-mods-open-questions.md; patches do not
wait for the answer — the owner's decision will close the move.

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
