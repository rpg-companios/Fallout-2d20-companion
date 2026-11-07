# Changelog
---

## Range scale clarified (patch 553)

Docs and acceptance only — game mechanics are unchanged.

- **The owner's question.** "Wait, close range + a +1 range mod = long???" — fair:
  in the before/after tables of patches 551 and 552 the +1 mod had Close in the
  "before" column, as if one step skipped a category.
- **How it actually works.** The scale uses adjacent categories: `Close → Medium →
  Long → Extreme`. Exactly one step: Medium + a +1 mod = Long, Close + 1 = Medium.
  Range never jumps over a category.
- **What the old bug did.** The base range of any modded weapon was computed as
  Close (the localized label was not recognized). So a +1 mod did not raise range to
  Long — it merely restored the base Medium. The Short Scope, which changes no
  range, left it at Close.
- **What was fixed.** The tables in `docs/patch-551-install.md` and
  `docs/patch-552-install.md` now follow the scale; the 551 acceptance test checks
  the step explicitly (the index grows by exactly 1, the name is `Long`) and the
  combination of the scope (0) with the long barrel (+1). No code or data changed.
- **Acceptance.** Total: 285 files, 2640 checks, all green.

---

## Trained perk points for old saves, removal without debt (patch 552)

Patch 551 fixed the perk itself, but the owner immediately found two consequences
— and asked "which skills should give the points back when the perk is removed?".
His decision: the player chooses, 2 points in total at most.

- **Old saves get the points at once.** If Trained was taken before 551, the points
  were already in the pool, but on a finished character the skill distribution was
  closed, so they could not be spent. On load the distribution now opens again and
  shows how many points are waiting (an alert explains where they came from). No need
  to wait for the next level. A repeated load has nothing to reopen: the distribution
  stays open until the points are placed, so there is no loop and no repeated alert.
- **Removing the perk no longer leaves a debt.** Previously the pool shrank with a
  floor at zero while spent points stayed on skills — the points could be farmed again
  and again. Now the perk takes its points back: unspent points are consumed first
  (if 1 point is still in the pool, only 1 is taken from skills), and the player
  chooses the rest.
- **How the player chooses.** A "Remove the perk “Trained”" window lists the skills
  that have a reserve. You can take 2 points from one skill or 1 from two — 2 in total
  at most. A tagged skill cannot go below 2, a regular one below 0; until the whole
  amount is chosen the confirm button stays disabled. If the skills have no reserve,
  the perk is not removed and the player sees an explanation.
- **Weapon range with mods stays as in 551.** A scope does not change range; the
  machine range code (`C`/`M`/`L`/`E`) drives the mechanics, and a mod without a range
  change leaves range untouched. This is the 551 rule, unchanged by 552.
- **Acceptance.** `educated-skill-debt-552` (19): pool and consumption maths,
  minimums, removal plan, old saves (including the absence of a loop), perk removal
  (2 from one skill, 1+1 from two, points still in the pool, mixed case), screen
  wiring and RU/EN string parity. Total: 285 files, 2639 checks, all green.

---

## Trained perk and weapon range (patch 551)

The owner found two bugs on the character sheet.

- **Trained grants skill points.** The perk returned a fixed 2 points regardless of
  rank, and the character screen never read them — the perk was dead. Now every rank
  adds +2 points to the distribution pool (INT + 9 + level): "+1 rank to two skills or
  +2 ranks to one" works, and the rank-6 ceiling is unchanged. Only active ranks count:
  a perk switched off by the book grants nothing, and removing the perk returns the
  pool to its base.
- **A mod no longer lowers range.** The Short Scope on the hunting rifle turned Medium
  into Close. The catalog stores range twice: as a machine letter (`M`) and as a
  localized label ("Средняя"), and the mod pipeline read the label before the letter,
  replacing an unrecognized string with zero — Close. Now the mechanics read only
  machine sources, a mod without a range change leaves range untouched, and melee
  weapons no longer get an invented range.
- **Acceptance.** `educated-skill-points-551` (7) and `weapon-range-mod-steps-551` (8):
  perk ranks and the pool, dormant/removed perk, store; range before and after the
  scope, every hunting-rifle mod without `rangeModifier`, a one-step shift, localized
  labels, melee. Total: 284 files, 2617 checks, all green.

---

## Not enough bobby pins — stop (patch 550)

The owner's ruling on the question surfaced by patch 549 acceptance: **"when bobby
pins are short — stop. One pin equals one pin."**

- **The remainder is no longer consumed.** Previously a pin still disappeared when
  stock was short: storage refused correctly, but the legacy fallback for older
  save formats spent what was there — with one pin and a request for three, one was
  spent. Now exactly the requested number is spent, or nothing at all.
- **A refusal leaves the sheet untouched.** Stock is checked before any change: if
  pins are short, the inventory stays as it was, the sheet is neither saved nor
  published to the Game Master. No matter how often such a command arrives, the pin
  survives.
- **One rule for everyone.** It applies when the player breaks a pin, when the
  change arrives as a Game Master command, and for both current and older character
  save formats. GM/player parity (patch 549) holds: both paths give the same result.
- **Picking stops.** With no pins the board does not play: "Out of pins", and presses
  are rejected. That behaviour was already correct and is now locked in by a check
  so it cannot be lost.
- **Acceptance.** `pin-spend-all-or-nothing-550` (15): shortage and exact stock,
  several stacks, empty inventory, legacy save formats, the last pin, repeated
  refusal, parity between a Master command and the player's own action, and the
  board stopping. Total: 282 files, 2602 checks, all green.

---

## One drag mechanism and GM/player parity (patch 549)

Work requested by the owner: "The Game Master section must match the player's
mechanisms as closely as possible. The commands the Master sends to a player are
commands the player could perform themselves, or receive as a result of their own
actions." The owner set the order explicitly: a green test suite first, then one
shared gesture mechanism, then behavioural checks of the Master section.

- **Tapping an arrow no longer moves anything.** A real bug was found: pressing a
  card's arrow and releasing without moving dropped the card into whatever
  location sat under the touch point. The character screen had the same defect —
  a plain tap could drop a character into a folder. Only real movement now counts
  as a drop; a tap is harmless. This is the same defect patch 548 found in the
  location tree, but in two other places the old acceptance checks could not see.
- **Dragging lives in one place.** The mechanism had been copied into four
  screens: character cards, key item cards, the Master's grid and the location
  tree. Three copies followed the working pattern; the fourth invented its own and
  broke (bug 548). All four now take the gesture from the shared
  `src/ui/useDragResponder.js`, so one rule applies everywhere and a fix reaches
  every screen at once.
- **The Master section is checked by behaviour, not by source text.** Acceptance
  used to look for particular lines in the screen file — a dead handle passed that
  check. The Master screen is now genuinely mounted in tests: a card is moved into
  a location and the result is verified in the database, and location tree rows are
  reordered with the same gesture negotiation a browser performs. That is exactly
  how the tap bug was caught.
- **The test suite is fully green again.** Eight terminal balance failures had
  been carried as "known" since patch 542. Investigation showed the program was
  right and the test was stale: it demanded rules the owner had since cancelled
  (five attempts on high difficulty, brackets driven by Luck, the old board size).
  The owner reconfirmed the canon: **four attempts at every difficulty**. The test
  now follows the live rules, so a red baseline no longer hides real regressions.
- **The GM/player parity law is written down.** A Master command must be an action
  the player can perform themselves and must run through the same mechanism.
  Verified against real character state: spending a bobby pin by hand and by Master
  command yields an identical sheet, magazine use matches, and shortage or a
  repeated command behave the same way. The Master has no separate "admin"
  mechanics — a prerequisite for networked play and for engine work.
- **Acceptance.** `drag-responder-549` (12) — shared gesture contract;
  `gm-screen-behaviour-549` (7) — mounted Master screen and database results;
  `gm-player-parity-549` (7) — identical player and command outcomes;
  `single-drag-mechanism-549` (6) — no new copies of the mechanism.
  Total: 281 files, 2587 checks, all green.

**Open question for the owner.** When bobby pins are short, the remainder is spent
instead of refusing outright: with one pin and a request for three, one is spent.
Both paths — player and Master — behave identically, so the parity law holds and
patch 549 left the rule unchanged. Your decision is needed: keep "broke what was
there", or require a clean refusal with no spending.

---

## Move arrows in the admin screen work again (patch 548)

Fixed the owner's bug: "the move arrows in the admin screen are inactive,
possibly after issuing and picking a lock on a location". The cause was neither
issuing nor hacking: the drag handle in the location tree was always dead.

- **Claiming the gesture in the right phase.** The handle returned
  `onStartShouldSetPanResponderCapture: () => true`, but wrote the row context
  (`parentId`, `childId`, sibling list) only in `onStartShouldSetPanResponder`.
  The RN responder system walks the capture phase top-down and decides as soon
  as a handler returns `true` — the bubble phase is never reached. The context
  stayed empty, `onPanResponderGrant` bailed out, and dragging never started.
  A single `claimDrag` now sets the context at all four negotiation points:
  capture (the real browser path) and bubble (the fallback).
- **A tap no longer reorders.** Releasing without movement used to take the
  press point and could land on a neighbouring row, silently changing the
  order. A `moved` flag now requires real movement before the order changes.
- **The lock note survives issuing.** The live-session write-back took the
  node's `lockLabel` verbatim, while the node carries a technical marker
  (`F2D20-LOC:`/`F2D20-LOCK:`/`F2D20-TERM:`) for legacy room servers.
  "Rusty door" became `F2D20-LOC:{"v":1,...}` and ruined the GM card. The new
  `readableSessionLockLabel` unwraps the marker chain (markers can nest) and
  returns the human text; it is also applied when normalizing links, so already
  corrupted notes are restored on read. The lock flag syncs as before.
- **Grid card arrows were unaffected.** Their grant handler reads the container
  itself rather than the tree row context and was correct — a test now pins
  this so both arrow groups are covered together.
- **Acceptance.** `__tests__/room/admin-reorder-arrows-548.test.js` (10) drives
  the gesture in the real negotiation order: capture first, bubble only if
  capture declines. The 545 test missed this because it called the bubble
  handler by hand, which a real browser never does.
  `__tests__/lootTrade/lock-label-writeback-548.test.js` (9) pushes a session
  envelope through the real persistence listener.

---

## A successful hack carries through (patch 547)

Fixed the owner's bug: "I picked the lock, the hacking modal offered another
attempt… because the modal did not pass on the hack data, I cannot proceed."
The same rule now applies to terminals.

- **Success no longer spawns another attempt.** After ACCESS GRANTED the lock
  panel no longer shows "Another attempt" — only success and a Close button.
  The patch 526 rule for a new attempt still covers failure and "out of pins".
- **Victory is final on the server too.** `newAttempt` on a won board is refused
  (`LOCK_ALREADY_WON`) and leaves it untouched; it used to build a new secret and
  re-lock an already opened point. Only the Master starts a new round, via
  "Open" or a re-issue. The local fallback behaves the same way.
- **The modal reports the signal itself.** Locks and terminals gained `onHacked`:
  success is reported once per victory, and closing the window after a win also
  transmits the signal. The terminal success panel got the same Close button.
- **Access to the contents.** The player window accepts the signal and applies
  the addressed outcome: hacking a location = entering, hacking a container =
  contents; the current location's barrier is lifted by the signal itself.
  Closing without a victory opens nothing.
- **The local fallback is no longer a dead end.** When the room server does not
  know the mini-game protocol, the board lives in client memory and the victory
  never reached the room registry, so no signal existed at all. The new
  `localCheckAccess` journal keeps passed checks for such rooms; whenever the
  protocol is present, the server remains the source of truth (lesson 506).
- **Acceptance.** `__tests__/room/hack-success-signal-547.test.js` (12) and
  `__tests__/lootTrade/hack-success-modal-547.test.js` (8). The 526 test was
  updated: its previous version required rebuilding the board after a victory,
  which is exactly what re-locked an opened point.

## A location lock is an entry barrier (patch 546)

Fixed the owner's bug: "Doctor's Basement" locked by "Locked Hatch" and the
"Tap House" locked by "Locked Door" could be entered freely — contents, the
"Mad Doctor" merchant and loot were available without hacking.

- **One barrier rule.** The new `accessBarrierPending` predicate
  (`server/accessExpression.js`, client facade `domain/accessExpression.js`)
  treats a node as closed when it has an unpassed check
  (`accessExpression`/`linkedCheckIds`), an explicit server refusal
  (`needs-check`/`denied`), a manual `locked` flag, or a blocked passage.
  An explicit open state (`open`/`open-by-key`/`keyUnlocked`) removes the barrier.
- **The server holds the boundary.** Node visibility, item/caps stripping,
  direct WS looting and trading all use the same predicate. A location with a
  configured lock no longer lets players inside even if the `locked` flag was lost.
- **Player window.** Entering a locked location again shows only the barrier
  (lock/terminal, AND/OR options); contents and loot/trade buttons stay hidden
  until the check passes. The AND/OR separator uses the canonical `+` operator
  instead of the string `and`.
- **Legacy-server safety net.** The patch 544 marker restores the access
  requirement; the client evaluates passed checks from the shared room registry
  (`terminalStates`/`accessEvents`) and hides descendants behind a barrier even
  if a legacy server dropped `locked`/`keyAccessState`. The updated server remains
  the source of truth.
- **Acceptance.** `__tests__/room/hub-location-lock-546.test.js`: the owner's
  scenario (Doctor's Basement / Locked Hatch / Mad Doctor, Tap House / Locked
  Door), server-side loot/trade denial, opening after a hack, and a legacy
  server without the `locked` flag.

## Place order in a location: Master drag order = player order (patch 545)

In the Master interface, while working with a hub/location, positions can be
reordered by dragging. The key rule: the Master's order of locations/objects
matches the player's order of places.

- **An arrow handle on tree rows.** Rows sharing the same parent (locations,
  chests, merchants, terminals, locks) now have a drag icon. Drag a row onto
  another row at the same level and it takes that position; the target is
  highlighted and a hint reminds you that players will see the same order.
  It also works inside an expanded nested location.
- **Order is stored on the parent.** A new `childOrder` on the location/node
  defines the sequence of direct children. A child shared by several parents
  keeps an independent order for each parent. New/unmentioned children append
  using the previous "kind → name" fallback, and removed ids do not break the
  list.
- **Players see the same thing.** The session graph sorts children by
  `childOrder`; the flat session list and `childIds` carry that order, and the
  player window inside a nested location additionally sorts places by the
  parent's `childIds`. The patch 544 marker preserves the order even through a
  legacy room server.
- **Live issues keep up.** Saving the order uses the regular
  `persistAndSyncContainer`: live sessions receive rebuilt graph nodes, so
  players see the new order without re-issuing. Keys remain rows after objects
  and are not draggable; game links/locks/barriers are unchanged.

## Player location window: location, lock, chest (patch 544)

Fixed the nested-location viewing regression: players again see
"location → lock → chest → contents" instead of a flat pile of chests and
terminals.

- **A location is not a chest.** Nested locations use the map icon and an
  entry button; an empty or not-yet-revealed location never shows "all taken".
  Kind and graph edges survive a legacy room server via a spatial node marker
  in `lockLabel`.
- **A lock is not a terminal.** A door barrier opens the lockpicking mini-game;
  the shared check registry no longer rewrites the node kind to terminal.
- **Hierarchy and barrier.** A child location's contents stay hidden until
  entry and passing the barrier; after success only direct children appear.
  A chest reveals its contents as a separate step.
- **Server guard.** Direct WS loot/trade requests behind a locked or blocked
  parent location are rejected even if the client tries to bypass the list.

## Passage blocking (patch 543)

Thesis 28 implemented per the owner's approved model: the Master blocks a
location's passage, the player sees a "door" with a reason, and alternate
routes are never recalculated. Just two fields on the location — no new
entities.

- **A "Block" button in the hub tree.** In the location's name row, right
  before "Settings" (locations only). A dialog asks for the reason — the
  Master's free text; an empty reason reaches the player as "Passage
  blocked". While blocked the button becomes "Unblock": it lifts the block
  and clears the reason.
- **Effect: the location cannot be entered from any side.** Transit through
  the blocked link breaks (children and the special exit are hidden), but
  alternate routes are not recalculated: another parent or exit keeps
  working. A direct Master issue is not an entry — the issue root is never
  blocked.
- **The player gets a "door" screen** modelled on the 542 gatekeeper: the
  location name, the reason, a "Back" button, no lockpicking buttons — a
  hard barrier beats a lock, and only the Master lifts it. The list shows a
  badge with the reason (or the default) on the row; the blocked link's
  contents stay hidden.


## A whole hub issue and the player window (patch 542)

The owner's clarifications are closed in one patch: hubs issue whole, the
player window follows entry history, and the lock is finally removed from
standalone points.

- **Graph from links plus parents.** The session is built from `links` +
  `parentLocationId`: Nipton with nested locations, a terminal and a lock
  issues whole instead of an empty screen with the "add at least one container
  or merchant" warning.
- **The top level holds only direct elements.** Top-level locations, chests
  and merchants show immediately; nested points (a chest inside a house) stay
  hidden until you enter. The special exit target no longer sticks out as a
  child card — it is an "Exit → …" button.
- **A barrier is a gatekeeper screen.** Entering a locked location first shows
  only the lock/terminal (AND/OR options labelled "and"/"or"); contents and
  children open after the check passes. A locked chest hides its contents, a
  locked location hides its children.
- **The lock is never a standalone player point** (`lock_never_standalone`):
  standalone lock issuing is removed from the UI, lock rows and standalone
  lock sessions are not drawn for the player; the server issuing API stays for
  internal calls. A terminal can still be both a standalone child point and a
  barrier.
- **Navigation follows entry history.** Back returns only to the location you
  came through (A→B, A→C, C→D ⇒ from D back only to C), even when it belongs
  to another hub; `exitLocationId` lets you enter the configured location, and
  the way back follows history rather than the administrative tree. History
  resets when the session changes.
- **Master hub edits reach the server:** live location updates carry the
  access requirement and special exit, and lock/terminal difficulty syncs via
  `nodeDifficulty` without recreating the point.

## Element parameters in the hub tree row (patch 541)

A targeted admin hub-tree change at the owner's word (thesis 32). Admin-only;
the player window and gameplay mechanics are unchanged.

- **The name no longer opens settings.** Tap/click on an element title in the
  hub tree is removed. Settings open via a "Parameters" button on the right
  side of the name row — for every element: location, chest, merchant,
  terminal, lock, key. Nested elements get the button too once expanded.
- **Keys are tree rows.** Key records attached to a location appear as rows in
  the tree with their own "Parameters" button.
- **The location screen is decluttered.** The separate "Keys and notes in this
  location" and "Gates between points" areas and the "Add container / merchant"
  button are removed. Gate dependencies remain as dashed lines in the tree;
  creating cards on the main screen and moving them with the arrows still work.
- **Patch delivery.** `apply-patch.sh` points at
  `arena/aa289f1c-fallout-2d20-companion`, the branch carrying patch 541.

## A nested location lives only inside its parent + parameters in the tree (patch 540)

A refinement of nesting at the owner's word (thesis 31). Still admin-only; the
player window is the next step.

- **A folder in a folder leaves the root.** If a location is created as a child
  from the start (a parent is set) or moved into a hub with the arrows, it is no
  longer shown as a card on the root screen alongside everything else — it lives
  only inside its parent and opens from the parent's tree. Hubs used to always
  be visible on the root, so a child location was duplicated as both a card and
  a tree entry.
- **A nested location shows its parameters in the tree** — like other entries in
  the hub: the rooms it is available for, the number of objects and locked
  points, while the key, lock/terminal and exit are shown as dashed dependency
  lines.
- **A nested location can be opened.** The "Contents" button goes inside the
  location to manage its contents, with a way back to the parent.
- **Nothing is lost.** If the parent is deleted, nested locations return to the
  root screen instead of disappearing; if the parent is ever missing from the
  data, the location is shown on the root too.

## The hub is itself a folder-tree (patch 539)

A rework of the 538 location structure at the owner's word (thesis 30). There
is no longer a separate "Location Structure" card: the hub is itself a
tree-folder. Still admin-only; the player window is the next step.

- **A hub opens a tree of its contents.** Open a hub location and see what was
  put inside it: locations, locks, terminals, containers, merchants. Locations
  are spoilers: tap the arrow to reveal what is inside. Dashed lines show what
  depends on what: what is blocked by what, which key is needed, what exits
  where. Tapping a node opens that section's settings.
- **The hub form is simplified.** Check "Hub" and the location becomes a folder
  and is its own parent: the "Parent location" and "Exit from location" rows
  disappear, leaving the server rooms the hub is available for. There can be
  many hubs, and they can be nested into one another.
- **Parent and exit are dropdowns.** For an ordinary location, parent and exit
  are now picked from a searchable list with a "— none —" option, not a wall of
  buttons: even 100 locations do not turn the screen into 200 buttons.
- **The matryoshka works again.** A location can be grabbed by the move arrows
  and dropped into another location — it becomes a child, like folders in
  Windows. A nested location can be moved back out to the root. You cannot drop
  a location onto itself or nest it into its own descendant (a cycle).
- **Key and lock/terminal are separate fields.** "Key item for access to the
  location" and "Lock or terminal that blocks entry to the location without a
  check" are split apart and labelled in plain language. AND/OR means: you can
  enter the location only by passing both obstacles (AND) or one of them (OR).

## Location structure in the admin side (patch 538)

The admin part of the location structure is implemented (thesis 29). The
player's location-view window is deliberately deferred to the next step.

- **Two new rows in the location form.** "Parent location" — this location is
  contained inside another: you can enter it through the parent and return.
  "Exit from location" — where the exit leads if it does not lead to the
  previous location: a special passage or a teleport. This is how branching
  is built.
- **Access requirement is an AND/OR builder.** Under the check-point picker
  there are now `+` (AND) and `/` (OR) buttons: the row reads like "Lock 1 +
  Terminal 1" or "Lock 1 / Terminal 1". You cannot start or end with an
  operator ("Lock 1 +" and "+ Lock" are invalid). AND binds tighter than OR:
  `A + B / C` = `(A AND B) OR C`. There can be more than two operands.
- **A "Hub" checkbox after the name** — two cells (checkbox + explanation).
  A catalog location is for conveniently viewing the structure as a tree.
- **Location structure tree** — a separate "Location Structure" tile on the
  grid: what follows what, what is blocked by what, what exits where. Tapping
  any node opens that section's settings.
- **Matryoshka "location into location".** Moving a location into another
  makes it a child (`parentLocationId`); a lock/terminal inside a location
  stays its child element. Cycles are forbidden.
- **Compatibility.** The expression is stored in `accessExpression` and
  reaches the server (`keyAccess`, `terminalHacking`, `lootTradeSession`,
  `roomRegistry`); the legacy `linkedCheckIds`/`linkedCheckId` fields are
  derived from it, and old saves with forced OR still read as before.

---

## Multi-level locations and passages — design (patch 537)

The owner shifted priorities: the one-off "OR" linking of the second check row
and "lock everything" from the card are postponed as not topical. In their
place — a thorough level-design model: multi-level locations (a "Village" with
houses, locked doors, chests and merchants; a secret lab where, after a failed
hack, the doors lock and there is no way back).

Agreed and recorded in `docs/location-level-design.md`:

- **Passages between locations** — a path from location to location; the Game
  Master decides what happened and what to lock by hand.
- **Blocking is universal:** a cave-in, a trap, an alarm — any narrative.
  Mechanically there is no passage; the reason is free text.
- **Two mechanisms:** a hackable lock (the existing mini-game) and a solid
  obstruction (only the Game Master can clear it). Passage directionality:
  "from B to A is blocked, from A to B is open" — one-way doors and "locked
  behind you."
- **Manual control + room for auto-rules** "event -> block passage."
- **No new entities** — the same `hub/terminal/lock/loot/merchant` nodes and
  the 523 graph edges.
- **The map is not now.** The owner's vision: a companion app + Owlbear fed by
  data from the admin part; we keep the model exportable, without map fields.

This is **design only**: a design doc + roadmap reprioritization (thesis 28).
No code changed — implementation comes in a separate patch after the model is
approved. The foundation (the 523 graph, visibility boundary, addressed hack,
shared resources, one session, the 529 snapshot law) is preserved as invariants.

## Lockpicking: "Rules" and "Details" as two stacked blocks (patch 536)

Owner: "In the lockpicking modal… they take one row but two containers. Can we
redo them as 2 different containers one under the other. 1st Rules, 2nd
details."

The status row in the lockpicking window used to be a single horizontal row of
two columns: bobby-pin counter, rules description and difficulty on the left,
LOCKPICK and stats on the right. It is now a vertical column of two separate
containers:

- **On top** — the prominent bobby-pin counter (`Pins: N`), as before.
- **Container 1 "Rules"** — a heading and the mini-game description (the hint
  about arrows, green/red and solved positions being kept when a pin breaks).
  The long text still wraps inside the window.
- **Container 2 "Details"** — a heading, the difficulty (`Difficulty N · M
  cells`), LOCKPICK and the "Skill · Perception · Luck" line.

The hint text itself did not change — only the layout. The description-wrap
law (531/534) is preserved: the rules block shrinks to the card width
(`flexShrink: 1`, `minWidth: 0`) and the hint wraps (`flexShrink: 1`,
`maxWidth: '100%'`). The block frame follows the nearest modal sample
(`docs/ui-modals-rules.md`): light surface, border and radius from
`ADMIN_MODAL_PALETTE`, no literals. The hacking mechanics, the 532 position
memory, the 535 "Game Master decides" flow and the blocked-point panel are
untouched.

Paired strings `lock.rulesTitle` ("Правила"/Rules) and `lock.infoTitle`
("Сведения"/Details) were added to the RU/EN dictionaries. Acceptance test
`__tests__/lootTrade/lock-status-blocks-536.test.js`; the historical wrap
checks (531/532) were updated for the rules block.

## "The Game Master decides" and a shared board for bound rooms (patch 535)

The owner accepted the proposal for a standard escape hatch: "the same Yes/No
pattern the terminal already has, but available for any disputed situation, so
we do not have to enumerate every exception in the rules. So the admin can
block or open locks at their discretion". Clarifications: one step together
with roadmap item 1; **both paths** — a player request and a manual GM switch;
"open" = immediate ACCESS GRANTED without a hack; "locks for now, but leave
room to manoeuvre", without guessing at future rulebooks.

### 1. "The Game Master decides"

- New protocol frames `gm.decisionRequest` / `gm.decisionState` /
  `gm.decisionResolve` and error codes; the client mirror was updated.
- Requests live in `room.gmDecisions` — Game Master state, server canon.
  The 529 snapshot law holds: published sheets are never edited by the server.
- A player whose point is blocked sees a hint and an "Ask the Game Master"
  button; pressing twice does not create duplicate prompts.
- `GmDecisionPromptHost` is mounted in `App.js` next to `TerminalRetryPromptHost`:
  the Yes/No prompt appears above any screen and names both the point and the
  requesting player.
- "Yes" and the manual "Open" button grant `ACCESS GRANTED` immediately: a won
  board (`hackedByGm`, not a key), a shared access event, the block lifted and
  the 532 progress reset by the win. "No" leaves the point closed.
- Manual `gmBlock` / `gmOpen` are available to the GM on the point card. The
  block check was inserted **only** into `shouldBlockLock()`; automatic
  blocking after failures (law 526) remains disabled.
- The skeleton is extensible: `GM_DECISION_KINDS` on the server and
  `gmDecisionTextKeys()` on the client. One kind exists now, `lock.open`;
  unknown kinds get a generic string pair and an explicit server refusal. No
  new screens or guesses about future situations.

### 2. Roadmap item 1: shared board and shared access log

- `boundScopeRooms()` walks location `roomCodes` to a fixed point;
  `syncSharedTerminalScope()` merges **all** `terminalStates` and
  `accessEvents` of the contour, not just the lock board (532).
- A point issued in one room is visible in every bound room; the **terminal**
  board (words, attempts, operator) and access events travel together.
- A room that joins later adopts the hack already in progress instead of
  starting a new secret; a fresh GM broadcast still resets the board.
- Broadcasts use the existing `broadcastTerminalRooms()`; role/membership
  checks, payload caps and JSON validation were not weakened.

Checks: typecheck, build, full `npm test`, forward and reverse `git apply
--check`, installer from the exact base and from 534 with byte comparison, live
WS probe. The remaining items of thesis 13 are in `docs/roadmap.md`.


## Restored at the owner's request (patch 534)

The owner pointed out that patch 533 rolled back more than asked: the progress
counter, the saved-positions line and the hints, and it also broke the wrapping
of the long rules description. Only these are restored, nothing else.

**Restored:**

- `statusLeft` and `flexShrink/maxWidth` on `arrowsHint` — the long rules
  description wraps inside the modal again instead of running off in one line.
- The «Solved N of M» counter counts green **and grey** cells again.
- The «Solved positions (X of Y) are kept» line in the «Approach finished»
  panel and the `progressSaved` key in RU/EN.
- The `arrowsHint`, `greyHint` and `newAttemptHint` hints describe the new
  mechanic again: solved positions are kept until the lock is finished.

**Untouched:** the patch 533 style rollback (borders, radius, zero paddings,
the `arrowPad` border, `modalStyles.btn/saveBtn`, the size 30 icon, 58×50
spacers), the four style removals named by the owner, centering, the light
palette and **all of the 532 mechanic** (`resumeLockGame`, `knownPositions`,
the shared board, local board memory, the 529 snapshot law).

The historical 527/531/532 tests were updated for the restored state.
Checks: typecheck, build, full `npm test`, forward and reverse `git apply
--check`, installer from the exact base and from 533 with byte comparison,
live WS probe. The 533 notes describe an intermediate state; this entry is
the current one.


## Rolling back the extra 531/532 edits (patch 533)

The owner pointed out that patches 531 and 532 went beyond the request and
asked to roll the extras back. The rollback is surgical: **the patch 532
mechanic that remembers solved positions is untouched**, only the four style
rules the owner named in 531 (`flex: 0`, `#dadada`, `width: 58`, `height: 50`)
remain removed, and centering is preserved.

### 1. Arrow styles (rolling back the extra 531 edits)

- `arrowButton`: `borderRadius: 6`, `borderWidth: 1.5`,
  `borderColor: '#9a9a9a'` and `paddingVertical/paddingHorizontal: 0` restored.
- `arrowPad`: its `borderWidth: 1` + `borderColor` restored.
- `LockPickingModal.js`: `modalStyles.btn` and `modalStyles.saveBtn` are back
  in the button style array; the icon is **30** again; `arrowSpacer` is
  `58×50` again.
- The 531 additions `statusLeft` and `flexShrink/maxWidth` on `arrowsHint`
  are removed; the status row is a plain `<View>` again. Consequence: the long
  rules hint may stop wrapping, since the wrapping rule was rolled back on the
  owner's explicit instruction.

### 2. Counter and hints (rolling back the extra 532 edits)

- «Solved N of M» counts green cells only again.
- The «Solved positions (X of Y) are kept» line is gone from the
  «Approach finished» panel.
- `arrowsHint`, `greyHint` and `newAttemptHint` are back to their 527/531
  wording; the `progressSaved` key is removed from RU and EN. Consequence:
  the texts again say «start over» / «repeat the grey arrows», although the
  engine does keep the progress.

### What is preserved

The four style removals named by the owner, arrow centering, the light
palette, laws 524–530 and **all of the 532 mechanic**: `resumeLockGame()`,
`knownPositions`, the shared board across bound rooms, local board memory,
reset on a win or GM reissue, the 529 snapshot law and server protection.

### Checks

`npm run typecheck`, `npm run build`, `npm test`, forward and reverse `git
apply --check`, installer from the exact `a62ec71` base (493–533 chain) and
from version 532 with byte comparison, live WS probe. The historical 527/531/
532 tests were updated for the rollback.


## Remembering solved positions (patch 532)

The owner: "And let's make solved positions remembered? A broken bobby pin does
not take progress away, you still need to finish the hack to get access, or
break off if you run out of pins. But progress must not be lost. It's just that
with low PER it takes a long time to guess the sequence, and then a lot more
time to repeat it."

Clarifications from the owner: progress lives **for the whole hack on the point**
(pin break, running out of pins, "Another attempt", reopening the window); it
resets on **ACCESS GRANTED or a GM reissue**; it is **shared by everyone on the
point**, including bound rooms.

### 1. What was wrong

After a pin broke, the combination stayed the same but the cursor went back to
`0` and the solved arrows turned grey: the player had to press the whole known
prefix again. With low PER the board is long (up to 18 cells), so "guess" and
"repeat" became two equally slow jobs. An explicit "Another attempt" even
regenerated the secret and lost progress entirely.

### 2. Law 532

- `server/lockPicking.js`: on a break, `cursor` stays on the first unsolved
  cell and solved cells stay visible as `grey`; the red «?» and the 528 pause
  are preserved. Added pure `guessedLockPositions()`, `rememberedLockCells()`,
  `isResumableLockGame()`, `resumeLockGame()` and the `knownPositions` field.
- `resumeLockGame()` continues the hack: **same secret**, same solved prefix,
  cursor on the first unsolved cell. A fresh sheet only updates bobby pins, the
  `LOCKPICK` skill and Luck; PER, difficulty and cell count are fixed for the
  duration of the hack, otherwise a new sequence length would invalidate the
  solved positions. A win (`won`), closing (`closed`) or a GM reissue resets
  the memory and builds a board with a new secret.
- `server/roomRegistry.js`: `newAttempt` and `start` from another character
  continue the shared board instead of wiping it; `unlock/reset/reissue` and
  `issueTerminal({ reissue: true })` clear the memory. The lock board is copied
  to bound rooms (`boundRoomsForTerminal()` / `propagateLockGame()`), and
  `server/roomServer.js` broadcasts fresh point states and access events to
  them.
- `components/lootTrade/localLockGame.js`: the legacy-server fallback keeps the
  board in module memory by `containerId`, so closing the window no longer
  loses progress; `saveLocalLockState()` clears it after a win.
- `components/lootTrade/LockPickingModal.js`: the "Solved N of M" counter now
  counts both green and grey cells; the "Approach finished" panel says solved
  positions are kept. The `arrowsHint`, `greyHint` and `newAttemptHint` hints no
  longer tell the player to start over, and a paired `progressSaved` string was
  added (RU/EN).

### What is preserved

Laws 524–531: the «Заколка» canon, the light palette, the pre-light-theme arrow
drawing, `char.command` → `char.refresh` → `char.publish`, the **529 snapshot
law** (the server never edits the published sheet), the 650 ms pause before
fading the red «?», unlimited explicit player attempts with no automatic
restart after ACCESS GRANTED, the 530 location/container hack semantics,
server protection and protocol limits. Access is still granted only after the
full hack: remembered positions alone do not open the point.

### Checks

`npm run typecheck`, `npm run build`, `npm test`, forward and reverse `git
apply --check`, installer from the exact `a62ec71` base (493–532 chain) and
from version 531 with byte comparison, live WS probe. Acceptance tests:
`__tests__/room/lock-progress-532.test.js` (engine, registry, OUT OF PINS,
operator switch, bound rooms, GM reset, local fallback, strings).

## Arrows without stripes and a wrapping hint (patch 531)

The owner inspected the arrows in the browser and found the clue: "If you
disable the `flex: 0 1 0%` style, the arrow icons are normal, they have a
background and the line artifact disappears. But the icons lose centering."
They also noted that `background-color: rgb(218,218,218)`, `height: 50px` and
`width: 58px` can be removed, and reported: "The container with the rules
description overflows the modal in one line, the text did not wrap. The text
should wrap inside the modal."

### 1. Root cause

`flex: 0` on the arrow button (RN Web renders it as `flex: 0 1 0%`) collapsed
the button to a zero basis: the border was drawn as a "stripe through the
center", the icon was not centered and the background disappeared. It came
from patch 525, when the arrow button was assembled from the base form styles
(`modalStyles.btn/saveBtn`) and their `flex: 1` was overridden with `flex: 0`.

**Fix:** the arrow button no longer inherits the base form styles; `flex`, its
own `backgroundColor`, `borderWidth`, `width` and `height` are gone. Only
`alignItems/justifyContent: center` and padding for the tap area remain. The
darker `arrowPad` is the background (law 527), and its border was removed too.
The top-row spacers were recalculated so "up" sits exactly above "down".

### 2. Pre-light-theme drawing

`arrow-*-bold` icons at size **22** (as in 520–524), explicitly centered. Only
the palette changed: a dark arrow on the light area instead of green on dark.
`CELL_ICON` in the board cells is unchanged. The wider spacing
(`crossRow.gap = 16`), phone scrolling and the exact hint under the bobby pin
counter are preserved.

### 3. Hint wrapping

`statusRow` is a horizontal container; its left column had no width
constraint, so the long hint set its own width, stayed on one line and
overflowed the modal. Added `statusLeft` with `flex: 1, flexShrink: 1,
minWidth: 0`, and `flexShrink: 1` / `maxWidth: '100%'` on `arrowsHint`. The
text now wraps inside the card.

### What is preserved

Laws 527–530 unchanged: the «Заколка» canon, `char.command` → `char.refresh`
→ `char.publish` spend commands, the snapshot law, the red «?» pause, the
location/container hack semantics, server protection. The server was not
changed.

### Checks

`npm run typecheck`, `npm run build`, `npm test` (260 files), `git apply
--check`, installer from the exact `a62ec71` base and from version 530 with
byte comparison, live WS probe. Acceptance tests:
`__tests__/lootTrade/lock-arrows-legacy-531.test.js`; the historical 527 test
was updated for the new drawing.

## Hacking a location = enter, hacking a container = contents (patch 530)

The first of the four remaining items of thesis 13. The owner asked to move on
with the tasks; the snapshot law 529 was recorded separately.

### 1. One predicate for every path

New pure module `components/lootTrade/hackOutcome.js`: a node with `childIds`
(or `kind: hub` on legacy sessions) is a **location**, a node without children
is a **container**. `hackOutcomeForNode()` returns `enter` / `contents`;
`applyHackOutcome()` performs exactly one addressable transition, with no graph
cascade (the 523 invariant is intact).

The same predicate drives three paths in `PlayerLootTradeOverlay.js`: the
normal node button, the button after a won check, and the automatic ACCESS
GRANTED outcome. The normal button of a nested location used to say «Open»
while actually entering — it now correctly says «Enter».

### 2. Interface

- A locked point and a check-source point get a `hack-outcome-hint-*`:
  «Hacking unlocks entry to this location» or «Hacking unlocks the contents»
  (paired EN strings).
- Hack button: «Hack & enter» for a location, «Hack & open» for a container;
  gate (OR-source) buttons take the label from the target node.
- The normal button of a nested location is «Enter»; containers keep «Open» /
  «Trade».
- A won point (lock/location) gets a separate `hack-outcome-button-*` so the
  contents remain reachable even if the player closed the mini-game. A pure
  terminal without children does not get the button: it is a check source, not
  a container.

### 3. Automatic win outcome

ACCESS GRANTED on an explicit «Hack» press inside a real location closes the
mini-game after `HACK_OUTCOME_DELAY_MS = 700` and applies the outcome: enter
the location (`parentStack`) or open the contents (`selectedHubNodeId`). The
pause lets the player see the board result first.

It fires once per `(containerId, accessId, revision)`; «View», a standalone
point and reopening an already-won board do not navigate. Laws 505/526 (the
board is not rebuilt after a win, the player decides how many attempts to make)
are intact: this is navigation, not a restart.

### What is preserved

The 529 snapshot law, `char.command` → `char.refresh` → `char.publish`, the
«Заколка» canon, the 528 red pause, the 523 visibility boundary and
addressable hack, server protection. The server was not changed in this patch.

### Checks

`npm run typecheck`, `npm run build`, `npm test` (259 files), `git apply
--check`, installer from the exact `a62ec71` base and from version 529 with
byte comparison, live WS probe. Acceptance tests:
`__tests__/lootTrade/hack-outcome-530.test.js` (pure predicate, labels and
hints, automatic enter/contents, no navigation without an explicit «Hack»).

## Snapshot law: commands instead of editing the sheet (patch 529)

> **Owner's words:** "don't touch the user's snapshot; if something must change
> for the user, send a command that the client executes. The whole Game Master
> space must obey it. The snapshot is for observing the user's state without
> interference, even between sessions."

The canon is `docs/gm-snapshot-law.md`. This is a law for the whole GM space,
not a one-off fix.

### 1. The snapshot is observation only

`room.lastSnapshots` lives on the room, not on a session: the GM sees the
player's sheet when no loot/trade session is open, and it is not cleared when a
location opens/closes or on «Leave location». The only writer is the client's
own `char.publish`; only the client can remove its entry. The server no longer
writes, clears or bumps a revision on someone else's sheet.

### 2. A single command frame

`char.command` `{ commandId, characterId, kind, payload }` → the client executes
the change with **standard tools** (`useCharacterStore` + `saveCharacter`) →
`char.refresh` awaits it → ordinary `char.publish`. The whitelist of executors
lives in `components/gm/charCommands.js`:

- `item.spend` — a broken bobby pin (former 528 `char.spend`, `spendItemStacks`);
- `magazine.use` — the Programmer's Digest magazine (`markMagazineEffectUsed`).

**The last loophole is closed:** the server used to write
`usedMagazineEffects` and `terminalHacking` into the published sheet when
«Use magazine» was pressed. It now returns `digestCommand`, the network layer
sends `char.command(magazine.use)`, and the client edits and publishes its own
sheet. The branch in `TerminalHackingModal` remains as an idempotent fallback
for a 528 server.

`commandId` is deduplicated (memory + AsyncStorage); `pendingCharCommands`
replays commands on `room.join` and clears them in `putSnapshot`. Unknown
`kind`, another character and items outside the whitelist are not executed.

### 3. What is preserved

State owned by the Game Master (sessions, `terminalStates`, `accessEvents`,
`partyStorage`, directives, keys) is still server canon — the law is about the
player's sheet. Message caps, roles, validation and atomicity are intact.
Laws 520–528 (terminal balance, four attempts, explicit player attempts, light
palette, the «Заколка» canon, the red pause, spend commands) are unchanged.

### Checks

`npm run typecheck`, `npm run build`, `npm test` (258 files, 2334 tests),
`git apply --check`, installer from the exact `a62ec71` base and from version
528 with byte comparison, live WS probe. Acceptance tests:
`__tests__/room/gm-snapshot-law-529.test.js` (static guard "one
lastSnapshots.set and only in putSnapshot", snapshots between sessions, kind
whitelist, deduplication); the 528 tests were updated for the unified
`char.command` frame.

## Spend commands and a pause before the colours update (patch 528)

The owner clarified the patch 527 architecture: "Bobby pins are removed not
from the snapshot; instead the client is sent a command to spend a pin from the
inventory using the standard tools. And after the spend a command is sent to
update the snapshot." Plus: "If a cell turns red and a pin breaks, make a small
pause before updating the colours. But if the pin did not break, the red stays."

### 1. The server no longer edits someone else's inventory

On a break `server/roomRegistry.js` no longer calls `consumeBobbyPins()` against
`room.lastSnapshots`; it only returns `pinsToSpend` (the `brokenPins` delta),
`characterId` and `clientId`. `server/roomServer.js` registers the command and
sends the operator two frames in a row:

- `char.spend` — spend the pin with the standard inventory tools;
- `char.refresh` — after the spend, update the snapshot.

Both messages are mirrored in `server/protocol.js` and
`src/room/roomProtocol.ts`; message caps, roles and validation are intact.
`putSnapshot()` clears unacknowledged commands and `room.state` carries
`pendingSpends`, so commands are replayed on reconnect.

### 2. The client applies them in strict order

The new `components/lootTrade/CharSpendCommandHost.js` is mounted once in
`App.js` above every screen (the mini-game window may already be closed). The
`onRoomCharSpend` subscription in `src/room/roomStore.ts` receives both frames:

1. `char.spend` → `spendBobbyPins()` uses the standard
   `useCharacterStore.spendItemStacks` (plus a legacy-snapshot fallback) and
   `saveCharacter()`, but deliberately does **not** publish (`publish: false`);
2. `char.refresh` → explicitly awaits the spend, then the standard
   `pushSavedCharacterToBoundRoomIfAny()` sends the ordinary `char.publish`.

WebSocket frame order is guaranteed and the await is explicit, so the room
receives an ALREADY updated sheet. `spendId` is deduplicated (memory +
AsyncStorage), so a replay after reconnect never deducts twice. Commands for a
different character or a different `itemId` are ignored. With the old-server
local fallback the effect in `LockPickingModal` still spends — and only there,
so there is no double deduction.

`consumeBobbyPins()` remains a pure helper for the client fallback and tests;
the server no longer uses it.

### 3. Pause before the colours update

- `server/lockPicking.js` puts `breakHighlight = { durationMs: 650 }` into the
  board state on a break and keeps the red «?» in `cells`. The next press clears
  the marker and wipes old red cells (exactly one red cell — the current
  mistake).
- `components/lootTrade/LockPickingModal.js` shows the red «?» during the pause,
  then locally hides it after `durationMs`; the grey guessed arrows remain. The
  window does NOT jump to «Attempt finished» during the pause even if it was the
  last pin. The marker lives in the board state, so spectators and reconnected
  tabs see the same pause; `localLockGame.js` forwards it through
  `publicLockGameState`.
- If the pin did **not** break there is no `breakHighlight` — the red «?» stays
  until the next press, as requested.

### What is preserved

Laws 520–527: PER/Luck/LOCKPICK, four terminal attempts, unlimited explicit
player attempts, no automatic restart after ACCESS GRANTED, GM Yes/No only for
terminals, the `shouldBlockLock()` hook, the 525 light palette and entry modal,
the 527 «Заколка» canon, darkened arrow area and hint. Server protection (roles,
message caps, validation, atomicity) was not weakened.

### Checks

`npm run typecheck`, `npm run build`, `npm test` (257 files, 2318 tests),
`git apply --check`, installer from the exact `a62ec71` base and from version
527 with byte comparison, live WS probe. Acceptance tests:
`__tests__/room/char-spend-commands-528.test.js`,
`__tests__/lootTrade/lock-break-pause-528.test.js`; historical 527 tests were
updated for the new spend law.

## Bobby pins, arrows and honest consumption (patch 527)

Four notes from the owner about the lock mini-game: the Russian item name, the
arrow block on desktop/phone, broken pins leaving the inventory, and a red «?»
on a wrong press.

### 1. The Russian item name is «Заколка»

`item_bobby_pin` in `modules/fallout/i18n/ru-RU/data/equipment/general_goods.json`
is now exactly **«Заколка»** (previously «Шпилька») — not «отмычка», not
«булавка». Every player-facing lock string in
`i18n/ru-RU/screens/lootTrade/screen.json` now says «заколки/заколка»: the
counter, the out-of-pins title, the missing-item hint, «Another attempt» and
the new arrows hint. `item_electronic_lockpicker` stays **«Электронная
отмычка»** — a different item that is never counted as a bobby pin.

### 2. Arrow area and the hint

On desktop and phone the arrows were "crossed by lines, too close and
unclear". `components/lootTrade/lockPickingStyles.js` now has a separate
`arrowPad` filled slightly darker than the light card; the buttons are one step
darker still, icons are larger (`30`), horizontal spacing grew from `8` to `16`
and the two rows gained a gap. The window content is wrapped in `ScrollView`,
so the long text no longer overlaps the board on a narrow screen. The exact
owner-approved hint is rendered directly under the pin counter, with a paired
English `lock.arrowsHint` string.

### 3. A broken bobby pin leaves the inventory

Previously a break only decremented `pinLedger` in room memory, so pins never
ran out on the character sheet. Now every `brokenPins + 1` makes
`server/roomRegistry.js` call `consumeBobbyPins()` from `server/lockPicking.js`:
`quantity` is reduced (or the empty stack removed) in the published
`room.lastSnapshots` sheet itself, keeping the name, mods, durability and all
other fields per the 522 rule. The client mirrors the spend in the live store
through the new `components/lootTrade/spendBobbyPins.js` (atomic
`spendItemStacks`, a fallback for legacy snapshot shapes, `saveCharacter` and a
re-publish to the room). `pinLedger` is diagnostic only; available pins are
read from the current sheet, so there is no double deduction. The local board
fallback (old servers without the protocol) follows the same rule. Newly bought
pins arrive with a normal sheet publication and are visible to «Another
attempt» immediately.

### 4. A wrong «?» is red and stays visible

`server/lockPicking.js` clears previous red cells before each press, so there
is exactly one red «?» — the current mistake. On the press that breaks a pin
this cell is no longer erased (at skill 0 the red mark used to disappear
entirely). In the light theme `cellTextRed` is an explicit `#c1121f` and
`cellRed` a pink fill with a red border.

### Regressions and checks

Laws 520–526 are intact: PER/Luck/LOCKPICK, four terminal attempts, unlimited
explicit player attempts, no automatic restart after ACCESS GRANTED, the GM
Yes/No only for terminals, the `shouldBlockLock()` hook for a future lock
block, the 525 light palette and entry modal. Server protection (roles, message
caps, validation, atomicity) was not weakened. Acceptance tests:
`__tests__/room/lock-consumption-527.test.js`,
`__tests__/lootTrade/lock-arrows-527.test.js`,
`__tests__/lootTrade/spend-bobby-pins-527.test.js`. Historical 520/524/526
tests were updated for the new consumption law and naming canon.

## Player attempts and the Game Master's decision (patch 526)

The owner clarified the meaning of the 506 report: "That was a bug report.
When, after a successful hack, the hack started again. The user may make as
many attempts to crack a terminal or lock as they want. But only at their own
discretion. Say the bobby pins ran out, the user bought new ones and returned
to hacking. Or leveled up, improved stats and decided to try again." And:
"A terminal can start a new configuration, lockpicking cannot. After a
failure a terminal gets the 'blocked' status, and whether it may be hacked
again AFTER THE BLOCK is up to the Game Master... Locks are not to be blocked
for now, but they will be in the future, once I come up with a blocking
condition".

- **The one-hack ticket is gone.** `usedTerminalAccess` / `markTerminalAccess`
  and the «ACCESS USED» mark no longer block «Hack»: the player decides when
  to return to the point. Closing the window becomes an «Open» pill instead
  of burning the access.
- **Automatic restart after ACCESS GRANTED is still forbidden.** That was the
  actual 506 bug: `shouldAutoStart` / `shouldAutoStartLock` do not send
  `start` in final states, and the server rejects `start` on `won` / an
  active board.
- **An explicit new attempt.** The `newAttempt` action (server, client and
  local fallback) builds a fresh board from the CURRENT published sheet: new
  bobby pins, new PER/LOCKPICK, new difficulty and cell count. Spent pins
  (`pinLedger`) are not refunded, the `hacked` access event is not revoked,
  `accessId` does not change — this is not a new broadcast by the GM.
- **Locks are not blocked for now.** Instead of «Waiting for the Game
  Master» with Yes/No, the window shows «Attempt finished», the result and an
  «Another attempt» button. The GM is not asked about locks, «No» cannot
  close them, and the admin panel shows «Out of bobby pins» without blocking
  controls. The GM's hack notification for locks is kept with its own text.
- **Hook for the future condition.** `LOCK_BLOCK_POLICY` / `shouldBlockLock()`
  in `server/lockPicking.js` is the single place where the future lock
  blocking condition will live; the server, local fallback and registry
  already consult it. The policy is currently disabled.
- **Terminals are unchanged.** After a failure they become «blocked» and the
  GM gets «Allow another hack? Yes/No»; «Yes» starts a new configuration with
  current settings, «No» closes it until a re-broadcast. `newAttempt` is
  rejected for terminals — the block cannot be bypassed.

Server protection was not weakened: the new action passes the same role,
membership, published-sheet and key-requirement checks. The 520–525 laws
(bobby pins, cells, one `start`, the entry modal, the light palette) are kept.

## Two-step mini-game entry and the light lock window (patch 525)

The owner: "The hacking mini-game should not appear right away. Right now the
interface looks like the game has started, but then you have to press 'Hack'
inside it before the game loads. Also the lockpicking palette should be light,
not like the terminal... For the hack game, first show a modal like for a
location, with 'Hack' buttons, just without the 'Leave location' button".

- **A point window comes first.** A standalone lock or terminal no longer opens
  the mini-game immediately. `StandaloneCheckModal` follows the location
  window structure: a point card, difficulty, «View» and «Hack» buttons. The
  «Leave location» and «Minimize» buttons are gone — a standalone point is not
  a location.
- **The board only after «Hack».** The press mounts the mini-game with
  `autoStart`: the board, bobby pins and arrows arrive already built. There is
  no second «Hack» button inside the board window and no empty "as if
  running" layout; a clear hint is shown instead.
- **One hack per broadcast kept.** «Hack» consumes the access immediately,
  «View» does not; after the board is closed the entry window shows
  «ACCESS USED». The Game Master's session stays active.
- **Light palette.** `lockPickingStyles.js` reuses the `lootTradeFormStyles`
  skeleton and `ADMIN_MODAL_PALETTE`: light card, dark text, light cells and
  buttons. The green terminal look is gone for locks; `TerminalHackingModal`
  keeps its own palette.
- **No duplicated skeleton.** Base keys (`overlay`, `card`, `title`, `label`,
  `footer`, `btn`, `saveBtn`, `cancelBtn`) are not redefined — the rule in
  `docs/ui-modals-rules.md`; the new module holds only cells, arrows, the
  status row and the point card.

Patch 520 rules (PER, bobby pins, cells, the GM's Yes/No), the 522/523 laws
and the 524 fixes (one `start`, pin detection, legacy-server fallback, working
«Leave location» in a real location) are preserved.

## Lockpicking and the location window: fixes (patch 524)

The owner reported: "pressed Hack — immediately 'Action failed', no bobby
pins found, no cells, arrows do nothing. 'Leave location' is shown in the
modal for some reason and does not work". All causes are fixed without
weakening server protection, mini-game rules, or patches 520–523.

- **One Hack press — one board.** The auto-start key no longer depends on the
  room's `accessId` arriving late, so a second `start` is not sent. Normal
  server replies (`TERMINAL_ALREADY_ACTIVE`, `TERMINAL_AWAITING_RETRY`,
  `LOCK_NO_PINS`, etc.) no longer show «Action failed».
- **Bobby pins are found.** The counter understands every inventory shape:
  an item dictionary keyed by instance id, `equipment.items` arrays,
  `itemId`, `catalogId`, `weaponId`, `code`, nested item snapshots and
  quantity in different fields. One instance is never counted twice.
- **With no bobby pins** the window plainly says to add them instead of
  showing an empty board and a generic failure.
- **If the character sheet has not reached the room yet**, the client
  publishes it once and retries the hack; a clear hint replaces the generic
  error if that also fails.
- **Legacy room server.** Locks now have the same automatic local board
  fallback terminals have had since patch 498: cells, pins, arrows, pin
  breaks and the GM's Yes/No work without `terminal.action`. There is still
  no visible «local mode» switch.
- **The location window no longer overlaps the mini-game.** While a board is
  open the location window is hidden, so its buttons cannot show through the
  backdrop and appear dead.
- **«Leave location» works immediately.** The window closes locally on tap
  without waiting for the server; the Game Master's session stays active for
  everyone else.
- **A standalone lock** no longer pretends to be a location: the player goes
  straight to the mini-game, with no point list and no «Leave location» button.

## Space hierarchy: the location graph (patch 523)

The first step of plan item 13. Every owner decision is recorded in
`docs/location-hierarchy-design.md`; server protection, keys and mini-games
were not weakened.

- **A graph, not a tree.** Locations inside locations and containers inside
  containers, multiple parents and cycles are allowed. Traversals are
  cycle-safe. Room codes are inherited as the union of the node's codes and
  every parent's codes.
- **One set of resources for all bound rooms.** A location session is a single
  object: edits, loot picks, trades and closing are visible in every room from
  `roomCodes`. A room whose code is not listed sees nothing.
- **A lock is a visibility boundary.** The player sees the locked point itself,
  but the server hides all of its descendants; the Game Master sees everything.
- **«Lock everything»** works on any node with children, not just on a
  «topmost parent». Only lockable descendants are blocked.
- **Addressable hacking.** Exactly one point opens; the transitive A → B → C
  cascade is gone, while explicit OR references to already-created points still
  work. A key can still be assigned to many points, pointwise.
- **One session.** Players walk nested locations with a «Back» button; the
  session survives returning to a parent and ends only on «Leave location» or
  when the Game Master closes it.

## One item everywhere (patch 522)

The owner clarified: "There are no weight or quantity limits, an item in the
inventory is the same item in storage... Items must not lose properties when
they change where they are kept. The same goes for traders... price and weight
are calculated from the mods." The limits from the previous update are gone —
that gameplay rule was wrong. Server protection was not weakened anywhere.

- **No gameplay limits.** Storage has no weight cap, no row cap, no stack cap
  and no per-operation quantity cap. The "storage full" message and the
  `STORAGE_FULL` code are removed. Only technical safeguards remain: the
  WebSocket message size, integer positive quantity checks, the number of
  operations in one message, sanitizing incoming item snapshots and atomic
  transfers. An imported snapshot of any size is accepted, while malformed data
  is rejected before any room state changes.
- **One domain module.** The stacking law now lives in `server/itemStacking.js`
  with `domain/itemStacking.js` as the client entry point. Inventory, shared
  storage and traders all use it instead of duplicating rules. Different mods,
  charges, durability, current HP, unique qualities and base names produce
  separate stacks everywhere; placement-only service fields do not affect the
  comparison.
- **No field stripping.** Depositing to storage, granting to a player and
  selling to a trader now carry the whole item: `appliedMods`, `charges`,
  `durability`, `hpCurrent`, `uniqQualities`, `uniqueId`, `stackKey` and
  `baseName` survive. Only placement state and the operation's quantity change.
- **Price and weight from mods.** Player sales and the item card take their
  numbers from the enriched item (`resolveItem` already adds `mod.cost` and
  `mod.weight`) instead of the bare catalog row. Effective `cost`/`weight`
  travel with the snapshot and survive on the server, so a modified weapon no
  longer loses its value when it changes hands.
- **The window is unchanged.** Two panes, a buffer and the «Transfer» button;
  no prices, applying, equipping or settings. Keys remain read-only, the Game
  Master still broadcasts them and sees «Add to storage», and file export/import
  still works for both the Game Master and players.

## Shared storage polish (patch 521)

The last item of the live plan is done. Two of the three small bits already
worked: deleting a key template does not erase a found record (514), and a found
key opens a point without a mini-game or a Game Master notice (516). Stacking
and size limits were the remaining work.

- **Stacking.** Two identical machine guns with different `uniqueId` now share
  one row: `server/partyStorageRules.js` compares an item snapshot without
  per-instance service fields and regardless of field order. Key records never
  stack, and anything above 999 items goes to a new row instead of vanishing.
- **Limits.** 200 rows per storage (keys included), 999 items per stack, 50
  operations per transfer and 999 items per operation. `STORAGE_FULL` is
  returned **before** the room state changes, so "nothing moves until Transfer
  is pressed" still holds on overflow.
- **For players.** A clear localized message replaces the raw error code, and
  an oversized imported snapshot is rejected as a whole.
- **Plan.** Item 12 is closed; the next stage is the space hierarchy and access
  rules from the owner's clarifications (item 13 in `docs/roadmap.md`).

## Lockpicking mini-game and OR-gates (patch 520)

The owner described a separate game: a "Bobby pins: n" line counting the
hacker's inventory pins, a row of cells with grey question marks and a four-arrow
d-pad; the server generates a random arrow sequence that must be repeated
position by position. He also clarified: "a lock and a terminal must not block
a location together — treat those requirements as OR".

- **Fifth card.** A lock gets its own creation tile with a lock icon, can be
  issued standalone or live inside a location, can be dragged into one, and can
  gate a location, chest or trader. Its form mirrors the terminal (difficulty
  1…5); level 0 comes only from perk/magazine reductions.
- **Cells.** `N = 12 − PER + 2·D`: PER 10 / difficulty 1 → 4 cells, PER 4 /
  difficulty 5 → 18, two rows when `N > 8`. The owner chose Perception (the
  canonical `LOCKPICK` attribute), not Agility.
- **Turn.** A positional match turns the cell green and advances; a miss shows a
  red `?`, keeps the position and hides which arrow was pressed. One pin in hand
  survives `S` misses (`S` = `LOCKPICK` rank 0…6); Luck 4…10 gives a 5…20%
  chance to save it at the moment it should break. On a break the sequence is
  unchanged and solved arrows stay visible in grey.
- **OR gates.** The second requirement row now holds up to two sources
  (`linkedCheckIds`); either `hacked` event is enough. The form, the card and
  the locked point show two lines "Terminal lvl 3" / "Lock lvl 5" joined by
  "or". Both sources are hidden from players, as terminals were in patch 519.
- **Shared registry.** Locks reuse the room's terminal states: operator, one
  hack per broadcast, GM Yes/No, shared access events. The secret sequence never
  reaches the client; spent pins are tracked per character in room memory.
- **Design.** `LockPickingModal` reuses the terminal mini-game shell extracted
  into `terminalHackingStyles.js`, per `docs/ui-modals-rules.md`; RU/EN strings
  are paired.

## Terminal as a chest lock (patch 519)

The owner built a location, put a chest in it, linked a terminal in the chest
and broadcast it to players. Both the chest and the terminal showed up in the
location, the chest opened immediately and the terminal sat unused. Fixed per
the owner's words: "the terminal should not be visible, and trying to open the
chest should open the terminal".

- **Hiding.** A terminal referenced by another point as its gate is marked by
  the server and removed from the location node list **for players**. The GM
  still sees every card, and the mini-game state for the hidden terminal is
  still created on the room as usual.
- **Lock instead of neighbour.** A locked chest with a gate now has "View"
  and "Hack" buttons opening the mini-game of exactly that terminal. Players
  see no separate terminal card.
- **Loot after the hack.** Until the terminal is hacked, the chest stays
  locked and its contents are not exposed. After a win the shared access event
  opens the chest automatically and the loot can be taken. A found key still
  opens it immediately, with no mini-game.
- **Mandatory keys cannot be bypassed.** With a mandatory key in the first
  row there is no hack button: the point stays closed until the record is
  found.

## Shared storage: two panels and transfer on button press (patch 518)

The owner's full description arrived, replacing the short one from patch 514:

> "The GM has a separate card, players have a button in the inventory. The GM
> can broadcast keys to shared storage and view it as an inventory-style list,
> but with no action buttons and no parameters. They cannot withdraw or deposit
> items. A player opening shared storage sees a two-panel modal styled like the
> merchant ... until the button is pressed, nothing is transferred".

- **GM.** A separate "Shared storage" card on the Loot / Trade grid. The
  window lists items with no buttons and no parameters, shows issued keys and
  offers a record catalog with "Add to storage". Depositing and withdrawing
  are now blocked on the server for both messages.
- **Player.** The inventory button opens a **two-panel window styled like the
  merchant**: personal inventory on the left, storage on the right. No prices,
  markups, caps or settings — rows, buffer and commit button styles are
  imported from the merchant overlay (rule in `docs/ui-modals-rules.md`).
- **Buffer.** Tapping an item adds it to a pending list; tapping a buffer row
  returns it. Until "Transfer" is pressed neither the server nor the local
  inventory changes. The button sends one atomic request with all deposits and
  withdrawals; any invalid line cancels the whole operation. The local
  inventory updates only after the server replies.

Keys still cannot be withdrawn into a personal inventory; snapshot
export/import is preserved.

## Gates between points (patch 517)

Plan item 9. Previously the linked check could only look at a win in the
terminal mini-game. Now **any point** can be the source of a neutral access
event, and that event lives **on the room**, not in a player's tab.

- **Shared event journal.** Hacking a terminal, opening a point with a key or
  a linked check, and a manual GM decision all produce the same event. It is
  idempotent, arrives on join and is broadcast to every member on each
  recompute.
- **Gates without a key.** The second setup row now works even when no key is
  required: until the chosen point produces an event, access stays closed;
  after the event it opens. Sources are no longer limited to terminals —
  locations, containers, merchants and terminals are all selectable.
- **Gate chains.** If A opens B and B is the source for C, the server resolves
  the whole chain in a few passes; cyclic links are bounded.
- **Links visible to the GM.** The card shows "After: <point name>" with a
  "gate passed / closed" badge; the location has a separate section listing
  links and their state.
- **Manual opening.** The GM can still unlock a location node by hand; gates
  and keys do not override that decision.

## Server-side key checking and staying on the card grid (patch 516)

Plan item 8. Access is now decided by the **server from the room state**, not
by the player's window (lesson 506): the client never decides whether a point
is open.

- **Key present in shared storage** — the mini-game never starts: the terminal
  gets "access granted" with no board and no attempts, containers and
  merchants open. The GM gets no "Terminal hacked" notice: they created the
  record, linked it and issued it. The location list shows "Opened by key".
- **Key missing and mandatory** — the point stays locked; taking loot, trading
  or starting a hack returns a "Key required" refusal.
- **Key missing and optional** — access waits for the linked check: once the
  chosen terminal is hacked, the point opens. Until then a key is needed or
  the GM opens it manually.
- **Key found later** — issuing a record, finding one in loot, restoring a
  storage snapshot and hacking the linked terminal all recompute access and
  broadcast fresh states to the room. The requirement reaches the server both
  for a standalone terminal and for location nodes.
- **New error code** `KEY_REQUIRED` in both protocols with paired RU/EN labels.

Also, as requested: **creating a point no longer opens its detail screen** —
the GM stays on the card grid and sees the newly saved card there.

## "Mandatory" checkbox and field order (patch 515)

The owner: "When creating a container, the 'Mandatory' requirement should
better be a checkbox. And the description fields should be last or second to
last. That is more logical".

- The two chip buttons ("Mandatory" / "Optional") in the access-point form
  were replaced with a single **checkbox** with a checked/unchecked icon. One
  tap switches between a mandatory and an optional key; clearing the key still
  means no requirement.
- The two button labels were removed from the RU/EN dictionaries; only the
  checkbox label remains. Checkbox styles were added to the shared form
  skeleton, so the neighbouring key form inherits them automatically
  (rule in `docs/ui-modals-rules.md`).
- **The description moved to the end of the form**: name, bindings and access
  settings first, description last. The key form already had the description
  and preview at the end — that order is kept and pinned by a test.
- `docs/roadmap.md` updated to version 515; the outstanding items are
  unchanged.

## Requirement fields in cards (patch 514)

The first half of design step 3: "we are now editing card UI and creating
fields and requirements for them". **Server-side key checking is NOT in this
patch** — it stays the next item on the plan.

- **Access-point fields.** Locations, containers, merchants and terminals now
  store `requiredKeyItemId`, `keyRequirement` (none / optional / mandatory),
  `linkedCheckId` and `keyItemIds`. Normalization clears nested keys on
  terminals: a key can be placed there neither by the form nor by dragging.
- **Two setup rows.** The first is a name search or a list of created keys and
  notes, with a "Is it mandatory?" toggle next to it; the second is a search
  or list of terminals as the alternative check. The card shows which key is
  required and whether it is mandatory.
- **A key is part of something.** The key form has a "Part of" row: location,
  container or merchant (no terminals in the list). The link lives on the
  parent, so editing or deleting the template never extinguishes a found
  record.
- **Dragging.** The key card now has the same arrow drag handle as containers.
  It leaves the root grid for a location, is listed there separately, and can
  be moved back with a button. "Add to storage" in the `⋮` menu stays as the
  backward-compatibility exception.
- **Live roadmap.** New `docs/roadmap.md`: a status table of every item and an
  "Outstanding after this patch" list. As requested, it is updated in every
  patch and repeated in the reply. It also records the new storage description:
  "Like the merchant, two panels ... just no price checks" — the current
  storage window does not match it yet.

## Key and access-point rules clarified (patch 513, docs only)

The owner extended the design and chose "document it for now" — **no code,
protocol or game behaviour was changed**. All decisions are recorded in
`docs/key-items-and-gates-design.md` (Update 7 and section 10), in
`docs/architecture/engine-charter.md`, in the agent start map and in `replit.md`.

- **A key is never issued on its own.** Containers, merchants and terminals can
  stand on the grid and be broadcast to players either directly or inside a
  location. A key reaches the party only as part of a location, container or
  merchant; it is never placed inside a terminal, although a terminal may
  require it.
- **Compatibility exception.** The "Add to storage" item in the key card's
  `⋮` menu stays by the owner's explicit decision ("for backward
  compatibility"): existing campaigns and storage snapshots keep working.
  Removing the item or changing the snapshot format is forbidden.
- **Dragging.** All four cards — container, merchant, terminal, key — can be
  moved into a location, and each has the arrow drag handle. Already found
  records are untouched by a move.
- **Two kinds of requirement.** Containers, merchants, terminals and the future
  "lock" may require a key as mandatory or optional. The point's card gets two
  setup rows: a key (search or list) with an "Is it mandatory?" field next to
  it, and a check (search or list of terminals / locks).
- **Access.** If the key is in shared storage, the mini-game never starts and
  the point opens immediately. A missing mandatory key means no access. A
  missing optional key means the linked terminal, hack, lockpick or force must
  be passed, or the GM opens access manually. The check runs on the server by
  record id; the note's text is for players and is never parsed.
- **Examples.** A safe "by key or by hack" and a safe "key only"; a
  contraband merchant gated by a faction badge or an incriminating note.

Step 3 implementation will start on a separate instruction.

## Modals now follow the design of nearby windows (patch 512)

The owner: "If you create modal windows, at least follow the design of other
modals nearby or doing something similar. If possible, write it down in the
app's working rules". Patch 511 built the key form "in the style of" its
neighbour but with its own height, radius, padding, heading, labels and button
order — it looked out of place.

- **Form.** `KeyItemFormModal` no longer defines base styles: it imports
  `lootTradeFormStyles` from `ContainerFormModal`. Both windows now share the
  backdrop, card, centered heading, field labels, inputs, room chips, hints and
  footer with "Save" on the left and "Cancel" on the right. Only the tag bar
  and text preview remain local, because the container form has neither.
- **Card.** Instead of two separate round buttons, the key card now has one
  `⋮` button and the same dropdown menu ("Edit", "Add to storage") as
  container, merchant and terminal cards, using the same menu styles.
- **Rule written down.** New `docs/ui-modals-rules.md` lists the mandatory
  reference, nearby modals by layer, what exactly to reuse, a pre-release
  checklist and the patch 511 lesson. Links added to `docs/agents/README.md`,
  `docs/architecture/engine-charter.md` (a dedicated safeguard) and `replit.md`.
- **Safeguard.** `__tests__/ui/modal-design-reuse-512.test.js` checks the actual
  style import rather than a visual resemblance: no local `StyleSheet.create`
  with base keys, matching button order, and the rule present in the docs.

Key behaviour, shared storage and the protocol are unchanged.

## Keys as cards on the screen (patch 511)

The owner clarified after 510: "I expected a key to be like a container /
merchant / terminal card, with a modal in the style of creating a container,
and then saved into the screen". A separate catalog behind a key icon in the
header was not what was wanted.

- **Creation.** The Loot / Trade grid now has a "Create key / note" tile next
  to the location, container, merchant and terminal tiles.
- **Form.** `KeyItemFormModal` mirrors `ContainerFormModal`: same theme, card,
  field labels, room selector, and "Cancel / Save" footer. A name is required,
  the description may be empty; the editor inserts the existing tags
  (`**bold**`, `*italic*`, list, `{CD}`, `{CAP}`) and previews them through
  `renderTextWithIcons`.
- **Saved into the screen.** The record is written to `gm_key_items`, the card
  list refreshes immediately, and the key stays on the grid next to containers.
  `KeyItemCardCell` uses the same cell styles as a container, merchant or
  terminal card.
- **Card actions.** "Edit" opens the same form with current values; "Add to
  storage" sends the record to shared storage — as before, GM only and online
  only. A record found as loot still goes to shared storage, never into a
  personal inventory.
- **No regressions.** The data layer, the `storage.addKey` protocol, the
  no-withdraw rule for keys and key transfer inside the storage snapshot are
  unchanged. The header icon and `KeyItemCatalogModal` are gone.

## Keys and notes in shared storage (patch 510)

Step 2 of `docs/key-items-and-gates-design.md`. The owner: "Many such items
can be created. Each needs a name and some description ... The GM may name an
item 'warehouse key' and give no description. Or write 'Mercenary note' and
put a whole mini-story in the description". The owner rejected a counter on
the bar and an operation log: "Items are either in storage or not. Players
handle them themselves and can see what is there".

- **GM catalog.** New `gm_key_items` table; `KeyItemCatalogModal` opens from
  the key icon in the Loot/Trade header. A name is required, the description
  may be empty. The editor inserts the existing tags (`**bold**`, `*italic*`,
  list, `{CD}`, `{CAP}`) and previews them through `renderTextWithIcons` —
  no second markup format.
- **Arriving in storage.** "Add to storage" sends `storage.addKey` (GM only,
  online only). If a loot container held a record with `keyItemId`, `lootTake`
  puts it into shared storage instead of the taker's personal inventory. No
  duplicates.
- **Cannot withdraw.** A record stores `kind: 'keyItem'`, `keyItemId`, name
  and description inside itself. `withdraw` returns `STORAGE_KEY_READ_ONLY`.
  The storage window lists keys separately; tapping opens a card with the
  formatted text and a note that the record stays shared.
- **Handover.** The storage snapshot format keeps keys, so the file and the
  GM save carry discovered records to a new server along with the items.

Mini-game bypass and gates (`requires`) are steps 3 and 4, not in this patch.

Installation: `docs/patch-510-install.md`.

## Cross-platform save and JSON handover (patch 509)

The owner: "Yes, the save must be cross-platform. And both the GM and players
should be able to export shared storage to JSON, so if the GM steps down, the
group changes its GM, or one of the players becomes the GM, the snapshot can be
imported back. Since storage contents disappear when the server disconnects,
arriving on a new server the GM can fill storage in one action."

- **Two-way save.** `syncRoomStoragesInSession` in `googleDriveSync.js` now
  downloads `storage__...` files from the GM Drive into the local database as
  well as uploading them. It is called from the general cloud sync;
  `getAllRoomStorages` was added to both database adapters.
- **JSON export / import.** The pure `domain/partyStorageTransfer.js` defines
  the format (`type: 'party_storage'`, room code, revision, entries), validates
  files and also accepts a bare snapshot. Files are written and read through
  the existing cross-platform `src/utils/characterFileTransfer.js` (Web Share
  API / browser-fs-access / anchor download on web, expo-document-picker +
  expo-sharing on native).
- **Both roles.** The "Shared storage" window now has "Export JSON" and
  "Import JSON" buttons and also opens for the GM. A GM import immediately
  sends `storage.restore` to the room — one action fills the new storage. A
  player import saves the snapshot on the device; once they become GM,
  `restoreMasterStorage` uploads it.
- This matters because room state is **ephemeral**: the server keeps it in
  memory and it disappears on disconnect or server change. The JSON file and
  the Drive save restore it without any server-side storage.

Installation: `docs/patch-509-install.md`.

## GM storage and player snapshot (patch 508)

The owner simplified the model and rejected the server file from 507: "Shared
storage is the GM storage plus a snapshot for players. Without the GM online
they cannot take items from shared storage, but can view it. When a player
connects to the room, storage updates to the current state. All changes happen
while the player and the GM are online."

- **The server writes nothing to disk.** `server/partyStorageStore.js`,
  `.data/`, the `partyStorageStore` parameter and the `server/start.js` wiring
  are gone. Storage state lives in room memory next to `activeSession` and
  `terminalStates`.
- **The GM storage is the canon.** New `gm_room_storage` table in the local
  database; `src/lootTrade/partyStoragePersistence.js` saves every snapshot and
  uploads it to the GM Google Drive (`gm_room_storage`) along the same path as
  loot containers. Players do not persist the snapshot.
- **Restore on connect.** `storage.restore` is accepted only from the room
  owner; the GM uploads their save and a joining player receives the current
  state via `room.state`. An older save cannot roll the room back.
- **Online only.** `gmOnline` in the snapshot; without the GM, `deposit` /
  `withdraw` return `STORAGE_GM_OFFLINE` while the item list stays visible.
  The storage modal disables its buttons and shows a "GM offline" note.
- No offline commits, queues, `baseRevision`, conflicts or conflict alerts:
  all changes happen while the GM and player are online.

The 507 skeleton (protocol, atomicity, GM `withdraw` ban, green bar, modal,
fixed name) is kept.

Installation: `docs/patch-508-install.md`.

## Shared storage for the room (patch 507)

Step one of `docs/key-items-and-gates-design.md`. The owner: "A party stash ...
a shared container where anyone can put something or take something ... the
group found a machine gun but needs to give it to a player who is absent
today". Later: "Storage is better on the server. Connect — receive updates",
"The name does not need to be customizable. It is simply shared storage",
"What belongs to the players is theirs".

- **Server canon.** `server/partyStorageStore.js` persists state to
  `.data/party-storage.json` (excluded from git). A room restores it on
  creation; `roomSnapshot` delivers the storage with the room state, so
  "connect — receive updates" needs no extra request. Tests run the registry
  without the file store, in memory.
- **Deposit / withdraw.** New messages `storage.deposit`, `storage.withdraw`
  and `storage.state`; operations are atomic, quantities validated, revision
  increments, and the fresh snapshot is broadcast to all members. Errors:
  `STORAGE_BAD_MESSAGE`, `STORAGE_ENTRY_NOT_FOUND`, `STORAGE_FORBIDDEN`.
- **Party ownership.** The GM can deposit but cannot withdraw: `withdraw` is
  allowed only for members with the player role. No recall, no removal of
  others' items.
- **Interface.** A full-width green area "Shared storage" now sits below the
  green "Add loot" / "Buy items" cells in the inventory. The modal shows
  character items and shared items; the local inventory changes only after a
  successful server reply.
- Paired RU/EN labels; the name is not customizable.

This is step one only: key records, `requires`, gates and the lock-picking
mini-game stay in the design document and will ship as separate patches.

Installation: `docs/patch-507-install.md`.

## GM notice, one-time terminal access and leaving a location (patch 506)

The owner tested 505 in two tabs of one browser: "in the GM tab I do not see
the terminal-hacked notice. As a player I can close the terminal and the
terminal window remains, but it is actually the location window. And since
it is an active location window I can hack the terminal again and again and
again. This looks like an architectural bug. The terminal must not open again.
Players should be able to disconnect from a location themselves with a
'leave location' button next to 'minimize' in the modal."

- **GM notice.** The global host selected events only by `role: 'gm'` in the
  store. But the UI mode of tabs in one browser is shared (localStorage), so
  the owner easily ended up with `role: 'player'` — both the failure question
  and the success notice stayed silent. Ownership is now also detected from
  the room member with `role: 'gm'` and this tab's `clientId` (the server
  sends the member list regardless of interface mode). Loading `ownerToken`
  can no longer block display (one-second cap), and `AlertHost` is mounted
  above the "What's new" window so it cannot be covered.
- **One-time access.** Whether a terminal is open no longer lives in the
  modal's local state. The server issues a stable `accessId` per broadcast:
  it does not change on turns or card edits, but is renewed after `reissue`,
  re-broadcasting the location, or the GM answering "Yes". The pure
  `terminalAccess.js` rule disables "Hack" after the first press and both
  buttons after `won` / `awaitingRetry` / `closed`; the player sees a state
  badge instead of another opening. The same rule applies to a standalone
  terminal.
- **"Leave location".** `playerCloseSession` previously refused to close a
  `hub` for players, and the outer location window offered only "Minimize".
  A "Leave location" button now sits next to it: the server adds the
  `clientId` to `session.closedByClientIds`, that player's overlay stops
  showing the scene, and the GM session stays active for everyone else.
  Only the GM can still end the scene for all.
- Paired RU/EN labels: "Leave location", its hint, "ACCESS USED", and an
  updated note about ending the scene.

Unchanged: all 504/505 rules, the word-count formula, three groups,
4 attempts, Science brackets, Luck, the Hacker perk, operator takeover and
the dictionary.

Installation: `docs/patch-506-install.md`.

## A successful hack no longer disappears (patch 505)

The owner tested the game in two tabs of one browser: "I found a 5/7 match,
picked the next word. The board reset and I had to start over. I could not tell
whether I hacked it or not, and the Game Master got no notice."

The next word was the password, so the server returned `ACCESS GRANTED` — but
the hacking window immediately sent an extra `start`: its guard skipped only
`playing` and `pendingDigest`. With a different `clientId` (second tab,
reconnect) the operator-takeover rule from 503 set `entry.game = null` and
built a fresh board with four attempts. The win was erased before the player
could read it. Separately, the 504 GM notice was wired only to failure.

- **The win is final.** `applyGameAction()` and the room registry now reject
  `start` while `status: 'won'` with `TERMINAL_ALREADY_ACTIVE` for any
  operator; board, revision and result stay unchanged. Only an explicit GM
  re-broadcast (`reissue`) starts another run after a success.
- **Window auto-start.** The pure `shouldAutoStart()` rule (new module
  `components/lootTrade/terminalAutoStart.js`) forbids `start` in the final
  states `won` / `awaitingRetry` / `closed`. Operator takeover via "Hack"
  during an active run still works. The expected `TERMINAL_ALREADY_ACTIVE`
  refusal no longer shows an error dialog.
- **The GM hears about success.** The global host now also selects `won`
  events (`findCompleted`) and shows a "Terminal hacked" notice through
  `AlertHost` with the terminal and operator names. The live card panel shows
  a "Hacked" state and a "Broadcast again" button.
- **Hints stay visible.** The `N/M` history remains on both the failure and
  the success screens, so a discovered "5 of 7" is visible even after all
  attempts are used. Paired RU/EN labels were added to the dictionaries.

Unchanged: all 504 rules (the "Allow another hack?" prompt only on failure),
the word-count formula, three groups, 4 attempts, Science brackets, Luck,
the Hacker perk, operator takeover and the dictionary.

Installation: `docs/patch-505-install.md`.

## Game Master decision instead of lockout after failure (patch 504)

The owner replaced the "lock after failure" checkbox with an explicit decision:
"the Game Master gets a prompt 'Allow another hack? Yes/No'. If yes — a new
config. If no, the terminal can no longer be hacked or viewed unless the GM
broadcasts it again".

- **Failure is visible and no longer ends the run silently.** After the fourth
  wrong guess the board enters "awaiting the Game Master" with "HACK FAILED"
  and "All attempts used". Previously, without the checkbox, a player could
  just press "Hack" again and the board was rebuilt from stale settings.
- **The GM prompt** "Allow another hack?" with "Yes" / "No" appears over
  *any* screen, not only the Loot/Trade tab. It never appears after a success,
  and it cannot be dismissed without an answer. The same buttons are available
  in the terminal admin panel.
- **"Yes" immediately builds a fresh board from the current settings:** new
  name, description and difficulty (even if the GM edited them during access),
  fresh words, hints and brackets, exactly 4 attempts. The operator sheet is
  preserved — INT 10 / Science 6 still give 15 words and 4 brackets, not the
  default 21. Editing the card during an active run no longer wipes the board.
- **"No" leaves the card visible with a "CLOSED" badge** and disables both
  buttons — "Hack" and "View" — until the GM broadcasts it again. The server
  rejects every player action (including viewing) with `TERMINAL_CLOSED`. Only
  "Broadcast again", re-issuing the terminal, or re-issuing the location
  reopens it; an ordinary settings edit does not clear the ban.
- Hacking again without GM approval is impossible: while awaiting a decision
  the server replies `TERMINAL_AWAITING_RETRY`. Deciding is GM-only.
- **The checkbox is removed completely** from the form, engine, room registry,
  location nodes and saved data. The `F2D20-TERM:` marker no longer writes the
  `f` field but still reads old markers, so earlier saves keep working. Related
  dictionary strings are gone; paired RU/EN strings for the prompt, "CLOSED",
  the waiting state and re-broadcast were added.
- The local fallback (older room server) follows the same model: the Yes/No
  prompt is shown in the hacking window on the GM device.

Unchanged: the board-size formula, three groups with two variants, 4 attempts,
Science brackets, Luck, the Hacker perk, operator takeover via "Hack", the
dictionary, and terminals inside locations opening the hacking window.

Installation: `docs/patch-504-install.md`.

## Three word groups, operator takeover and one full restore (patch 503)

The owner clarified the board design: "Let there be 3 groups of words with
some shared combinations for the group. Say endings, on/ion, ly/tly, The/tho.
First you work out which ending group is right, then inside that group you work
out whether e.g. ion or on is the right sequence. These need not be endings —
they can be prefixes or suffixes." A hint as high as `L−1 out of L` is fine as
long as it requires deduction: extra words make blind guessing poor, while
finding the right sequence almost guarantees a win within the canonical
4 attempts.

- `buildGroupedPasswordSet()` builds **three groups** around a shared
  fragment (2–3 letters) at one position — word end or word start. Each group
  has **two variants** extending the fragment by one letter (`TION`/`SION`,
  `NESS`/`LESS`, `THE`/`THO`). The password sits in one variant of one group.
- Boards provide a **hint gradient**: words of the winning variant score high
  (up to `L−1/L`), the sibling variant of the same group scores medium, and
  other groups plus noise score low. The gradient is enforced during board
  selection and holds across all 160 "difficulty × INT × seed" combinations.
- Remaining slots are neutral noise, lowering blind-guess odds. Measured at
  D5 (INT 10): blind 25%, careful deduction 97% without bonuses and 100% at
  Science 6; at D1 careful 97%, blind 56%. The password is still not the most
  "central" member of the set.
- **Operator takeover.** Pressing "Hack" as another character rebuilds the
  board from their INT/Science/Luck and makes them the operator; the previous
  operator and everyone else only watch. A repeated `start` by the same
  operator does not reset progress, so all five players can try in turn.
- **At most one full restore per board.** Only one bracket can carry a full
  return to 4 attempts, with a `resetUsed` guard for boards created earlier.
  Other brackets keep their normal effect; attempts never exceed 4.
- The hacking window shows hints as `N/M` (matching letters out of word
  length) instead of a bare number. D0 keeps its anagram families and outlier
  password.

Installation: `docs/patch-503-install.md`.

## Export saves are read at any nesting depth (patch 502)

The owner sent a fragment of a real save (`format: rpg-companion-character`,
`character.data.attributes`, INT 10, LCK 10, Science 6) and reported that a
difficulty-5 terminal still showed 21 words.

Patch 501 unwrapped exactly one `data` envelope (the `CHAR_PUBLISH` shape). An
export file keeps the sheet one level deeper, under `character.data`, so when
that object (or a JSON string of it) was published to the room, attributes were
not found and fell back to 4 again: `25 − 4 = 21`.

`normalizeCharacterSnapshot()` now walks the `data`, `character`,
`characterData`, `payload`, `snapshot` and `save` envelopes up to 12 layers,
parses JSON strings at any level, picks the deepest layer holding
`attributes`/`skills`, and preserves service fields from outer envelopes
(`terminalHacking`, `equipment`). The operator name is set in `createGame()`,
not only in `applyGameAction()`.

Every delivery shape was tested: the bare sheet, `CHAR_PUBLISH` with the sheet,
`CHAR_PUBLISH` with the whole export file, a JSON string, a double envelope and
the `character` node alone. All give INT 10 / LCK 10 / Science 6 → **15 words,
4 brackets, 20% attempt recovery**. Board sizing is unchanged.

Installation: `docs/patch-502-install.md`.

## Character stats are read from the sheet (patch 501)

Owner: "Why do I see 21 words on a difficulty-5 terminal at INT 10? Isn't
25-10 = 15?" The `25 − INT` formula was correct; reading the character sheet
was not.

The published room envelope stores the save under `data`, and a save keeps
attributes and skills as `[{ name: 'INT', value: 10 }]` arrays. The engine only
understood a `{ INT: { value } }` dictionary or an array with `id`/`key`, so INT
and LCK were not found and silently fell back to 4: `25 − 4 = 21`. Science was
matched by `name`, so four brackets at Science 6 looked correct and hid the bug.

The snapshot is now normalized before the board is built: the `data` wrapper
(including JSON strings) is unwrapped, and the live store, legacy saves and
older test shapes all read the same way. INT, LCK, Science, Hacker
(`[{ perkId, index }]`) and the *Programmer's Digest* inside `equipment.items`
are covered. The room registry passes the whole envelope so the operator name
survives too. Board sizing is unchanged: 15 words at INT 10 and 21 at INT 4.

Installation: `docs/patch-501-install.md`.

## The "25 − INT" board (patch 500)

Owner: "with INT 10 + Science 6 I failed the hack three times in a row".
Every difficulty lost five words:

`N = max(4, 15 + 2·D − INT)`; at difficulty 5 that is **`25 − INT`** — 21
words at INT 4 and 15 at INT 10 (previously 26 and 20). At difficulty 1 with
INT 10 it is 7 words, at difficulty 0 — 5.

The bracket guard was relaxed from `N−3` to `N−1` so that Science 6 keeps all
four brackets even on the shortest board. Board generation got faster
(≈20–30 ms at difficulty 5) while the ambiguity floor stays at ≥4.

Measured on the real engine, INT 10, LCK 4, difficulty 5, Science 6: blind
guessing **21% → 39%**, informed deduction **94% → 98%**, best-move play
**100%**, **100%** after a lucky full restore. At difficulty 1 with Science 6
informed deduction remains **100%**. Installation: `docs/patch-500-install.md`.

## Two kinds of brackets, count set by Science (patch 499)

The owner clarified how the bonus table should be read: "2 words + 2 attempts"
means **four brackets** — two remove one wrong word each, two give +1 attempt
each. A single bracket does exactly one effect; combined packages are gone.
Science 1 gives one bracket whose kind is a coin flip; Science 4 gives three
brackets ("2 words + 1 attempt"), Science 5 gives three ("1 word + 2 attempts").

**Science alone sets the bracket count**: `0, 1, 1, 2, 3, 3, 4` for Science
0–6, at all six difficulties. The per-difficulty table `4/4/3/3/2/2` no
longer caps it. At difficulty 1 with INT 10 and Science 6 the hack is indeed
easy, while at difficulty 5 Science 6 still grants all four brackets. The
bracket kind remains hidden until clicked, as in Fallout.

Measured on the real engine (INT 10, LCK 4): difficulty 5 at Science 6 —
blind guessing **21%**, informed deduction **94%**, **100%** after a lucky
full restore; difficulty 1 at Science 6 — informed deduction **100%**.
Word count `N = max(4, 20 + 2·D − INT)` is unchanged: 26 words at INT 4 and
20 at INT 10 on difficulty 5. Installation: `docs/patch-499-install.md`.

## Cleaner terminal UI (patch 498)

At the owner's request, redundant information was removed from the interface:

- terminal cards and the hacking window show **only the difficulty** — no
  "N-letter password" text and no `0·4, 1·5, … 5·9` chip labels;
- the "This room server does not support a shared hack…" line is gone from
  the hacking window (the local fallback logic itself is unchanged);
- the long internal hint about Hacker, attempts, word count, Science and Luck
  was removed from both the form and the admin panel.

**Difficulty `0` can no longer be set manually.** The form offers `1–5` only;
effective difficulty 0 still appears on the player side when the Hacker perk
lowers a level-1 terminal. Covered by a test: the engine returns
`effectiveDifficulty: 0` and a four-letter password.

The "lock the terminal after all attempts fail" label and its checkbox are now
dark grey (`#222222`) instead of creamy yellow, so they read on the light grey
form background. Installation: `docs/patch-498-install.md`.

## Canonical four attempts and the "sequence" board (patch 497)

**Accepted by the owner.** Attempts are 4 again at every difficulty (ceiling 4);
a full reset returns **to 4** instead of adding another set. Word count is
`N = max(4, 20 + 2·D − INT)`: at difficulty 5 that is **26 words at INT 4 and
20 at INT 10** — the board grew so bracket bonuses no longer eat it.

**Words.** At D≥1 the board is built from real words sharing at least `L−3`
letters and at most 2 matching positions: guessing the *sequence* replaces
grouping by the *number* of shared letters. The password is picked **inside**
the set, from the middle of the similarity distribution — otherwise the
"most central word" heuristic (or its mirror) gives it away. D0 keeps anagram
families (`POST/SPOT/POTS`) with a dissimilar outlier password.

**Brackets.** Science 0 gives none; otherwise `{0:4, 1:4, 2:3, 3:3, 4:2, 5:2}`
pairs. Effects are deterministic by Science (remove words / restore attempts /
both). Luck 4–10 gives a 5–20% chance of a full restore on each bracket;
attempts never exceed 4. Luck points are never spent.

**Tension at D4–D5.** The ambiguity floor rose to 4 (repair target 8): at least
four candidates survive any first wrong guess. Measured on the real engine:
blind guessing **17–47%**, informed deduction **82–88%** without bonuses and
**100%** with lucky brackets, the "most central word" heuristic **0–17%**.
Details and installation: `docs/patch-497-install.md`.

## Hacking summary v2: brackets are the hints (patch 496)

**Owner's accepted rules.** A bracket pair *is* a hint; there are no separate
free likeness checks. `N/M` likeness is learned only by spending an attempt.
Brackets have three effects: remove a dud, `+1` attempt, or a full reset (once
per terminal; a repeat gives `+1`).

| Value | Formula |
|---|---|
| Board size | `N = max(floor[d], base[d] − (INT − 4))`, bases `8/10/12/14/17/20`, floors `4/5/6/7/9/10` |
| Attempts | `T = 4 − floor(d/3)` → 4 at `d0..d2`, 3 at `d3..d5` |
| Bracket pairs | `P = max(0, min(1 + floor(Science/2) − floor(d/3), 3, N − 3))` |
| Pair effect | `d20` by LCK: `1..F` reset, `F+1..P` `+1` attempt, rest = dud |

The `d20` bounds for LCK 4…10 are `[1,5] [1,6] [2,7] [2,9] [3,10] [3,12] [4,15]`.
The likeness cap stays `3/3/3/2/2/2` from patch 495 — it is what gives the
thinking player 80 %+. Boards use three letter groups with no `ABS*` prefix
clusters, and the password is no longer the most "central" word. The hacking
window now shows the Hacker perk's difficulty reduction and each bracket's
result.

Measured on the real engine at difficulty 5: blind guessing **20–35 %**,
informed deduction **85–100 %**, and **100 %** after a lucky full reset.
Details and installation: `docs/patch-496-install.md`.

## Own word list, three stats and the About screen (patch 495)

**At the owner's request.** The hacking dictionary is now our own compilation
from EOWL (UKACD) and ESDB/SCOWL — both permit commercial use with a notice.
The Google frequency list, which carries a non-commercial LDC caveat, was
removed from the build entirely. Result: six per-length files
(`server/terminalWords/words-4.json … words-9.json`), **12,308 real words**
instead of the previous 34–64 per length, so consecutive terminals no longer
repeat the same candidates. Generator: `scripts/build-terminal-words.mjs`,
notes: `docs/terminal-words.md`.

**Three separate levers:**

| Stat | Effect |
|---|---|
| INT 4–10 | board size: `20 → 12` words (20, 19, 17, 16, 15, 13, 12) |
| Science 0–6 | `2 → 8` bracket combinations; +1 when INT ≥ 8 and Science ≥ 4; recovery combinations unlock at Science 4 |
| Luck 4–10 | chance of a recovery combination appearing, `10 → 80 %`, never zero |
| Luck points | never spent while hacking; spending them before/after is a table decision by the GM |

A recovery combination grants **+1 attempt** (not a full reset to four) and
cannot appear below Science 4. Other brackets remove exactly one dud each.

**Word selection.** A secret word is picked at random from the dictionary of
the required length, then duds with varying likeness are drawn from that same
dictionary. Hints are limited to `3/3/3/2/2/2`, and at least 3 candidates
survive any first wrong guess (4 at difficulty 5). At difficulty 0 the board
uses large real anagram families (`POST/SPOT/STOP/TOPS/POTS …`) with a
maximally dissimilar outlier as the password; it is no longer underlined.
Words from the last three boards of a room are excluded from the next one.

**UI.** The internal thresholds line («N words · hint ≤ K/M · INT+Science
S/16») was removed from the hacking window. «About app» now carries a formal
unofficial-fan disclaimer naming Bethesda Softworks, ZeniMax Media, Microsoft
and Modiphius Entertainment, states that the engine is distributed under the
**GNU Affero General Public License (AGPL)** with data compiled by community
contributors, and reproduces the **UKACD and ESDB notices verbatim** as their
licences require.

Details: `docs/patch-495-install.md`, `docs/terminal-hacking-balance-proposal.md`,
`docs/terminal-words.md`, `scripts/terminal-words/LICENSES.md`.

## Terminal hacking is harder and fairer now (patch 494)

**Symptom:** at difficulty 5 with INT 4 and Science 0, a player got a `4/9`
hint from the first word and guessed the password on the second attempt. The
board used random words, and character stats never changed the word count.

**Fix** (following the [Fallout 3 hacking rules](https://fallout.fandom.com/wiki/Hacking_(Fallout_3)), adapted to INT 4–10 and Science 0–6):

- the numeric hint is capped by difficulty: `3/4` on easy, `3/6` on average,
  `2/8` and `2/9` on hard — `4/9` and higher can no longer appear;
- all candidate words are similar (shared letter sets, different positions),
  with anagram families added to the 4- and 5-letter dictionaries;
- the generator rejects boards where one hint leaves only 1–2 candidates:
  at least 3 words survive any first guess (4 at difficulty 5);
- `INT + Science` (`4…16`) shrinks the word list: 12 → 6 at difficulty 0,
  13 → 12 at difficulty 5 — maximum skill still keeps a very hard terminal
  hard. The existing chance of an attempt-restoring bracket is unchanged;
- the hacking window shows «N words · hint ≤ K/M · INT+Science S/16».

Thresholds, rationale and tunable constants: `docs/patch-494-terminal-balance.md`.

---
## A terminal inside a location opens the hacking mini-game instead of a chest (patch 493)

**Symptom:** the GM created a terminal and linked it into a location, but players
saw an ordinary chest and got the "open container" flow instead of the hacking
window.

**Cause:** the room server rebuilds every location node and drops fields it does
not know. On a server that has not been updated, `kind: 'terminal'` becomes
`'loot'` and `difficulty` / `lockOnFailure` are lost. The player client therefore
received a chest node; such a server has no `terminalStates` registry either, so
the earlier registry fallback (patch 491) could not help.

**Fix:**

- the terminal configuration is duplicated into the node's `lockLabel` as a
  compact marker — that field survives server normalization and is not rendered
  for unlocked nodes; `domain/lootTrade.js` and `server/terminalHacking.js`
  share the exact same format;
- `PlayerLootTradeOverlay` restores the node kind from the marker (and still from
  the room registry), shows the `console` icon, difficulty and View / Hack
  buttons; the mini-game mounts as a separate modal next to the location window;
- the updated server restores `kind: 'terminal'` from the marker, keeps the
  difficulty on live edits and advertises `capabilities.terminalHacking`;
- on a legacy server the client runs the very same mini-game locally
  (`components/lootTrade/localTerminalGame.js` reuses the pure
  `server/terminalHacking.js` engine), and the GM issues a standalone terminal
  as a one-node location instead of the unsupported `terminal.issue`;
- restart the room server after updating `server/` to get a fully synchronized
  party-wide game; the mini-game itself is playable immediately.

---
## Environment/Combat card redesign and manual exposure effects (patch 484)

- Aligned the screen header and cards with the Character and Loot/Trade sections: vector icons, matching header structure and card borders; RU/EN selection now persists in settings.
- Radiation is configured manually as damage per tick, interval count, and interval unit (for example, 3 damage per scene for 3 scenes). Removed source categories, protection-mode selection, and GM-side outcome previews. Effects require a connected room; protection and immunity resolve on the character side.
- Sealed armor is automatically respected by weather effects on the character. Ghouls remain radiation-immune and recover 1 HP for each 3 points of radiation damage received.
- Injuries apply to one selected character. Injury presets save a character-neutral zone; body or chassis locations are selected/adapted for the actual target when applied, including robots.

---
## Fix opening the GM "Environment/Combat" tab (patch 483)

Fixed an error when opening the GM's third tab: the screen incorrectly destructured
`useLocale()` and passed an empty locale to the language-label formatter. It now
reads the locale as a string and switches languages through the standard
`setCurrentLocale` function.

---
## Environment/Combat, saved state presets, and room-neighbor First Aid (patch 482)

- Added the GM workspace’s third tab, **Environment/Combat**, with separate Weather, Radiation, Injury, and Attack Failure tiles, room/recipient selection, room-wide time advancement, and tabletop-only calculation.
- Weather and radiation configure strength (a number or `{CD}`) and duration; periodic effects trigger at the end of each selected interval while respecting armor resistance and immunities. Weather conditions remain independent; robot chassis injuries can be stabilized and heal after sleep, and six attack complications are supported: ammo loss, jam, breakage, explosion, ricochet, and dropped weapon.
- Game Masters can save named, described state tiles, organize them in folders, and sync them to Google Drive. Players can roll First Aid (`INT + Medicine/Repair`) when using medical supplies; a success adds the check value to healing. **Apply to Another** can send aid to a room neighbor with delivery acknowledgement.

---
## Dedicated GM Workspace Navigator (`navbar2`), read-only character spoiler cards & queued GM commands (patch 481)

- **Dedicated GM Navigator (`GmWorkspaceNavigator` / `navbar2`):** separated the Game Master's swipeable section navigator (`Campaigns`, `Loot/Trade`, and an extensible registry for future GM tabs) from the Player's character sheet tabs in `App.js`, never mounting player sheet screens or overwriting the local `characterStore` in GM mode.
- **Read-only character spoiler cards inside rooms:** connected room characters now render live read-only summary cards (HP, radiation, defense, initiative, melee bonus, Luck points, carry weight, caps) with 4 independent spoilers (`S.P.E.C.I.A.L. & Skills` with check Target Numbers, `Zone DR & Status`, `Weapons & Ammo`, `Perks, Trait & Inventory`).
- **GM Commands with queued delivery & acks (`gm.directive` / `gm.directiveAck` / `gm.directiveState`):** added party-wide and per-character commands (`+1 Level` unlocking manual skill & perk selection on the player's device, grant/deduct caps, restore Luck points, heal/rest, and adjust radiation respecting immunities), including server-side delivery queuing for sleeping phones and a live delivery badge in the room header.

---
## Restore clicks on the "Loot/Trade" screen after switching tabs (patch 480)

Removed `inert` attribute toggling in `src/web/pagerScrollGuard.ts`: because
`react-native-web` removes `aria-hidden` completely when focusing the
"Loot/Trade" tab instead of setting `aria-hidden="false"`, `inert` remained on
the tab wrapper and blocked presses on Location/Chest/Merchant creation buttons
and saved container cards. Horizontal 50%-shift protection remains active via
`scrollLeft = 0` clamping and `{ preventScroll: true }`.

---
## Fix 50% horizontal screen shift on Admin cloud sync & PWA ↔ Replit reconnect reconciliation (patch 479)

Fixed the 50% horizontal layout shift triggered during Google Drive sync in Admin
mode and hardened cross-browser synchronization between installed PWAs and Replit
browser sessions:

- added `src/web/pagerScrollGuard.ts` to enforce `{ preventScroll: true }` on
  programmatic focus inside `overflow-x: hidden` tab pagers, mark off-screen
  `[aria-hidden="true"]` tab scenes `inert`, clamp accidental `scrollLeft`
  offsets to `0`, and include tab topology in `NavigationContainer`'s `key`;
- stored `lastClosedSession` on room state so a reconnecting GM tab immediately
  reconciles emptied loot containers (`items: []`), closes the open chest view,
  and prompts deletion even if the GM tab reconnected while a PWA player clicked
  "Take All";
- added Google Drive synchronization for GM campaign rooms (`gm_rooms` with
  `owner_token`), keeping them strictly scoped to the Admin section.

---
## Reliable GM chest emptying & auto-close when a player clicks "Take All" (patch 478)

Fixed a desynchronization where clicking "Take All" closed the player's loot
modal and granted items to inventory while the GM's container could stay open
with all items intact:

- prevented background character autosave from downgrading a GM tab's room role
  (`role: 'gm' -> 'player'`);
- rebound `ownerClientId` via `ownerToken` directly on `ROOM_JOIN` /
  `SESSION_OPEN` when a room stays alive in server memory, and guaranteed the
  GM's live socket in `room.members`;
- persisted emptied loot containers even across single-device Admin/User mode
  switches, added cross-tab `storage` sync, auto-closed the GM's open detail
  view when emptied, deduplicated legacy item `entryId`s, and added automatic
  `SESSION_CLOSE` self-healing against older WS server builds.

---
## Compact merchant caps stepper without `±10`, white d20 die icon, and full-button-height Combat Die icon (patch 477)

Removed the overflowing `−10` and `+10` caps stepper buttons in the Merchant
modal (`ContainerFormModal.js`, keeping `− / input / +`), replaced plain `d20`
text with a white 20-sided die icon (`dice-d20`), and sized the Combat Die
(`CD`) icon vertically equal to the button height (also unified across
`ContainerItemConfigModal.js`).

---
## Location combobox with inline autocomplete (`New` → `New Vegas`) in Chest & Merchant form (patch 476)

Replaced the hidden chip-only Location selector in `ContainerFormModal.js` with
an always-visible **«Bind to location (optional)»** combobox combining a
dropdown of available Locations (`▾`) with live inline autocomplete
(`matchHubSuggestions` in `domain/lootTrade.js`): typing e.g. `New` immediately
displays the inline ghost completion ` Vegas` and quick-select action (`Tab` /
`Enter` or tap), and if no matching Location exists yet, allows creating and
linking a new Location in one tap right from the dropdown.

---
## Shared room WebSocket server `wss://fallout2d20-companion.na4u.ru/ws` for Replit and NetAngels deployments (patch 475)

Switched the room client (`src/room/roomClient.ts`) to route published builds —
including Replit's free static deployment (`*.replit.app`), NetAngels hosting,
and native mobile builds — through `wss://fallout2d20-companion.na4u.ru/ws`,
while keeping same-origin `/ws` for local/LAN/sandbox development and honoring
explicit `EXPO_PUBLIC_ROOM_SERVER_URL` overrides. Room creation, live character
sync, and Loot/Trade sessions now work on Replit static deployments and share a
single unified room registry with `fallout2d20-companion.na4u.ru`.

---
## Centralized Game Master («Admin») license gate and bilingual non-technical Admin & «Loot/Trade» guides (patch 474)

Wired all Game Master mechanics (`domain/premium.js`,
`src/premium/adminAccessGate.js`) — Admin mode entry, Settings toggle, campaign
room management, local & Google Drive container persistence, and live Location /
Loot / Merchant sessions — through a single entitlement gate (`adminAccess`,
`gmCampaigns`, `gmLootTrade`). Open-beta mode remains active right now
(`OPEN_BETA_BY_DEFAULT = true`) so every feature stays unlocked, while future
transition to permanent non-expiring GM licenses requires no scattered UI/store
refactoring; player room connections, loot taking, and bartering remain free.
Added plain-language Russian and English user guides
(`docs/guides/admin-and-loot-trade.ru.md` and
`docs/guides/admin-and-loot-trade.en.md`).

---
## New GM «Loot/Trade» screen, Google Drive container sync, and live room loot & two-pane merchant sessions (patch 468)

Added the «Loot/Trade» bottom tab in Admin mode alongside «Campaigns», featuring
a 3-column grid for creating Loot Containers (chest) and Merchants (money bag)
stored locally and synced to Google Drive (`appDataFolder/<moduleId>/gm_containers/`).
Implemented catalog item picking with immediate `pcs` / `CD` / `d20` roll-on-save
quantities, additive specialization markups (`item markup + merchant markup`),
positive buyback depreciation `%` (default `50`), atomic shared-room or
character-targeted sessions, live GM `%` and caps adjustments during active
trades, automatic search perks and «Cap Collector» modifiers, and a two-pane
staged-buffer barter modal rendering offered items in grey italics with merchant
cap-shortfall confirmation.

---
## Fix Node.js version resolution in `deploy-netangels.sh` on NetAngels (patch 467)

Fixed `etc/environment/PATH` prepending `/usr/bin` (with legacy system
`node v10.24.0`) ahead of NetAngels' virtual Node.js runtime: `deploy-netangels.sh`
now locates the modern `node >= 18` binary directory (preferring the exact
version from `PROMPT_SUFFIX`, e.g. `v22.23.4`) and places it at the front of
`PATH`.

---
## Automated NetAngels / `na4u.ru` build and deployment script (`deploy-netangels.sh`, patch 466)

Added executable `deploy-netangels.sh` (`npm run deploy:netangels`) for
one-command SSH deployment on NetAngels cloud hosting: activates the site's
Node.js virtual environment, clones or updates sources in `<site>/repo`, builds
`dist/` within container memory limits, deploys static files to `www/` (keeping
`.well-known` and `google*.html`/`yandex_*.html` verification files) and the
lightweight room server to `app/` (`server/`, `package.json`, `hello.js`, `ws`),
triggers `touch reload`, and verifies live HTTP + WebSocket `/ws` readiness.

---
## Support NetAngels / `na4u.ru` environment in room server startup (patch 465)

Updated `server/start.js` to automatically pick up NetAngels hosting variables
(`APP_PORT`, `APP_IP`), locate prebuilt web assets in sibling `../www` (when
running from `app/` alongside `www/`), and skip Metro auto-builds on lightweight
production deployments without source files (`server/` + `ws` only).

---
## Restore updated ghoul origin portrait and preserve owner commits in `apply-patch.sh` (patch 464)

Restored the updated `ghoul` origin portrait (`modules/fallout/assets/origins/ghoul.png`
from owner commit `39bb559`, which had been overwritten by baseline extraction
during patch 462) and hardened `sync_to_baseline` in `apply-patch.sh` so files
unchanged in Arena between the previous and target patch — as well as extra
files committed by the owner — are preserved instead of overwritten or removed.

---
## Fix `expo export` web build and `ws@7` compatibility on Windows (patch 463)

Fixed `TypeError: WebSocketServer is not a constructor` when building for web on
machines with an older `node_modules` tree (`ws@7`, which exports `ws.Server`
instead of `ws.WebSocketServer`): `server/roomServer.js` now supports both `ws@7`
and `ws@8`, and `metro.config.js` skips attaching the room WebSocket server
during static `expo export --platform web` builds while normalizing Windows
drive-letter casing.

---
## Fix Replit publish package firewall block (patch 462)

Resolved the `403 Forbidden` error from Replit's Socket Security Policy on
`shell-quote@1.10.0` during deployment: added `overrides` (and `pnpm.overrides`)
in `package.json` and updated `package-lock.json` to patched releases
(`shell-quote@1.12.0`, `compression@1.8.2`, `node-forge@1.4.2`,
`js-yaml@4.3.2`, `fast-uri@3.1.9`, `source-map-js@1.2.2`, `vite@8.2.8`,
`brace-expansion@1.1.21`/`5.0.12` — `0` critical CVEs).

---
## Release 4 — «What's new» notes (patch 461)

Owner's word: ship a new release. Raised `release` to **4** in
`public/version.json` (the «What's new» modal shows the notes once on first
open after updating) and rewrote paired `ru-RU` / `en-EN` release notes
covering patches 441–460 in player language: custom character portraits, the
«Own equipment» Settings section and «Homebrew Equipment» category, GM rooms
and the «Admin screen» toggle, room connection via «Server» with auto-reconnect
and card status badge, strict «User» / «Admin» separation, fast web startup
with a live boot status indicator, high-priority icon loading, and automatic
browser version refresh.

---
## Clean up unused workspace folders and one-off artifacts (patch 460)

Removed unused clutter and leftover artifacts from the repository:
- orphaned `.publish/` gitlinks (`positronium-game-settings`, `ttrpg-engine`),
  obsolete `.kiro/` specs, and Replit scratch `.agents/` files (`docs/agents/`
  remains intact);
- one-off archives and debug leftovers: `output.txt`, `fallout 2char.zip`,
  `positronium-boot.zip`, `screenshots/`, legacy `run-avatar-tests.js`,
  assertion-less `__probe-fields.test.js`, and superseded `public/pwa-icon*.svg`
  / `pwa-icon.placeholder.json` placeholders;
- hardened `apply-patch.sh` to cleanly remove orphaned gitlink directories even
  when nested `.git` checkouts exist on disk and to preserve CLI arguments across
  self-updates.

---
## Exclude `.kiro`, `.installbackup`, and `.publish` workspace folders (patches 458–459)

Excluded `.kiro`, `.install-backup` / `.installbackup`, `.publish`, and `.agents`
across Metro (`blockList` and `watchFolders`), server source fingerprinting,
Vitest test discovery, repository guardrail walkers, and `apply-patch.sh`
backup/baseline sync.

---
## Instant startup & live boot status screen (patch 457)

Eliminated the multi-minute blank-screen startup delay:
- The server binds its port immediately and checks a SHA-256 source fingerprint:
  when sources are unchanged, the prebuilt gzipped bundle (~835 KB) is served in
  under a second instead of running a full Metro dev compile on every launch.
- When sources change (e.g. after applying a patch), the browser immediately
  shows a live dark startup status screen (server pulse, current stage, elapsed
  timer, and automatic transition when ready, plus an inline pre-React loader in
  `index.html` so the screen is never blank).
- Persisted Metro's transform cache inside `.expo/metro-cache` so incremental
  rebuilds complete in seconds across container restarts.

---
## Connected room characters, strict GM/User separation & status badge (patch 456)

Completed live character sync between the User section and GM rooms:
- Connecting a character to a GM room immediately publishes and displays the
  character card inside the GM's room (including across two tabs in the same
  browser) and pushes live updates on save.
- Strictly separated User and Admin views: local user characters and user
  folders never appear in the Admin window unless connected to a room, and
  server rooms appear only in the Admin interface.
- Room-bound characters reconnect automatically without re-entering the room
  code, and moving a character into a user folder preserves its room binding.
- Added a circular top-right `server-network` badge on bound character cards
  (green when the GM is online and the room is active; pale when offline).

---
## Concise patch installer output with explicit patch list (patch 455)

Trimmed noisy output from `apply-patch.sh`:
- Jumping straight to a newer patch now explicitly lists every included
  intermediate patch (e.g. `✓ Установлены патчи: №453, №454, №455`).
- Output now shows only whether patches were installed and a brief commit
  reminder when uncommitted changes exist.
- Added automatic self-handoff to the newly fetched `apply-patch.sh` on
  the same run.

---
## Anti-stale browser web cache without wiping Metro cache (patch 454)

Separated server-side Metro transform caching from browser web caching so
UI updates appear immediately without `--clear`:
- Both `roomServer` and the Metro dev server now send `Cache-Control:
  no-store` for `index.html`, `service-worker.js`, `version.json`, and dev
  `.bundle` responses, while keeping fonts and content-hashed assets
  `immutable`.
- The service worker bypasses heuristic browser HTTP caching (`cache:
  'no-cache'`) for navigation and unhashed scripts, skips storing dev
  bundles in Cache Storage, and registers with `updateViaCache: 'none'`.
- Added `versionGuard`: on startup and tab focus (`visibilitychange`), the
  running bundle compares its compiled patch version against live
  `/version.json` and automatically purges stale HTML/JS cache entries
  (preserving `.ttf` icon fonts) and reloads once when a new patch lands.

---
## High-priority UI icons, preserved Metro/PWA caches & GM rooms in Metro (patch 453)

- **Icon loading priority**: core UI icon fonts (`MaterialCommunityIcons`,
  `Ionicons`, `FontAwesome5Free-Brand`) are now preloaded immediately at
  startup with `<link rel="preload" as="font" fetchpriority="high">` and
  `font-display: swap`, while the web `@expo/vector-icons` entry drops 12
  unused icon families (-14 unused `.ttf` files).
- **Startup speed & caching**: removed `--clear` from `.replit` so Metro
  retains its transform cache across restarts, and taught the service worker
  to serve fonts and content-hashed build assets cache-first without wiping
  existing caches.
- **Admin room creation**: attached the `/ws` room WebSocket relay directly
  to Metro's HTTP(S) dev server (`expo start --web`), ensured the GM joins
  newly created rooms and transparently rebinds saved rooms after a server
  restart, and fixed the contradictory failure dialog title (`Room creation
  failed` instead of `Room created`).

---
## Web font timeout & Replit pnpm asset fix (patch 452)

Fixed the web startup crash (`fontfaceobserver.standalone.js: timeout
exceeded`): anchored `.local` ignore rules in `metro.config.js` to the
workspace root so Replit's global `pnpm` store serving icon `.ttf`
fonts is no longer blocked, replaced `fontfaceobserver` on web with a
non-throwing `document.fonts.load` shim, and added a runtime guard in
`index.js` so slow font downloads never crash app startup.

---
## App boot, character avatars, and installer recovery (patch 451)

Fixed the app startup failure after the broken update: restored the full
character screen and custom avatar module (`domain/useCharacterImage.js`,
`expo-image-picker`, `ws`), restored missing imports in `CharacterScreen`,
removed the broken admin button from the character sheet, wired the clean
"Admin Screen" toggle in Home settings (off by default), hardened the room
WebSocket server against oversized-frame crashes, and taught the patch
installer to restore missing `node_modules` packages automatically.

---
## Technical memory of session 425–440 (patch 441)

The owner's word: write down how the release-3 mechanisms work — not
"made a filter" but how it works, where the data comes from and why
exactly this way. docs/agents/data-flows.md gained sections: gear
filters (§10), the installer — cutoff/backup/human output (§11),
«Sleep\Wait» (§12), session laws and traps (§13). The technical
document serves future maintenance of the app.

---
## Release 3 — «What's new» notes (patch 440)

The owner's word: "Now we make the release description. What changed
from the previous version." version.json: release raised to 3 (the
«What's new» window shows the notes once), notes rewritten for
patches 402–439 in the player's language: perks by the books and old
save migration, book repair (weapons and armor), durability and its
settings, rarity on cards, gear filters (funnel, categories, «Show
(N)»), the «Sleep\Wait» button with «Wait», app updates, window
scrolling. Full text — public/version.json (ru/en).

---
## The "Sleep\Wait" button and the "Wait" option (patch 439)

The owner's word: the sleep button is now called **"Sleep\Wait"**.
The sleep modal gained a **"Wait"** option: time passes almost like
sleep (effect timers move), but **all three** survival parameters are
spent — Hunger, Thirst and Sleep — and nothing is replenished: no
sleep ladder, no fatigue relief, no bonus, no bed rest. Fatigue eats
current HP as in normal time flow. The forecast shows the drains and
HP loss up front; if HP would drop **below zero**, the alert
**"Character died"** is shown. Sleep place (bed/wasteland) and the
disease check apply to sleeping only.

---
## The owner's word on mods in the filter (patch 438)

Mods in the filter results — NEVER: "1 mod may fit 9 of 11 weapons,
and if there is no 11th weapon, the mod is pointless". The "Mods"
section is gone from the window. What a mod gives is already written
in the mod installation screen — no labels needed in the list. And
so: the filter's qualities are now only those actually found on
weapons (22) — Night Vision and other mod-only abilities are not in
the list, no empty selections.

---
## Filter button — square with a funnel (patch 437)

The owner's word: the filter should be a square button with a funnel
icon, like the category icons in the crafting screen. To the right
of the search field there is now a square button: inside, a funnel
icon from the same icon set as the crafting screen; in the corner, a
colored badge with the number of active conditions (no badge when
there are none). The search field takes all the remaining width.

---
## Search and filter fit inside the window again (patch 436)

Defect: in the loot and buy windows the search field refused to
shrink below its intrinsic width, pushing the filter button beyond
the window border. Now the row uses exactly the space it is given.
The installer also names the rollback command right away: if the new
version is not to your liking, one line from the .install-backup
folder brings everything back.

---
## Installer hints follow your workflow (patch 435)

The owner's word: it is easier to accumulate commits and record them
in one go than to commit after every install. The installer no
longer nags: the hint now says honestly — commit whenever you like,
several installs can be folded into one commit; if the platform
rebuilds the project before that, just run the installer again (it
archives your edits in advance). The manual git fetch from the
instructions is no longer needed: it was required once, to replace
an outdated installer.

---
## The installer speaks human (patch 434)

The owner's word: "so much noise in the output, and no understanding
of whether the patch is installed". The result is now clear from one
line: "Done: the app is updated to №N" — with the app's own version
shown next to it as proof. The backup message became understandable:
what is inside (as a list) and that the folder can be deleted if
nothing valuable is there. The bureaucratic talk about "trees" and
"queues" is gone.

---
## The "Show" count is honest again (patch 433)

Defect of 432: the found-items counter counted groups by service
keys while the window is grouped by dictionary labels — so it always
showed 0. Now it counts exactly the groups that reach the results,
by the same labels; locked in with a behavioral test on the
dictionary.

---
## Filter results contain only what matched (patch 432)

Defect of 430: picking "Weapons, rarity 6" in the filter still listed
ammo, chems and junk in the results — consumables were never cut by
the filter, since the filter targets gear. Now the results contain
only gear that matched plus the selected mods; consumables and junk
stay in the usual catalog and in search. The number on the "Show"
button is now honest — it counts exactly what will be shown. Also,
Power Armor was added to the flat lists (filter and search) — it used
to be missing there.

---
## Installation no longer fears local edits (patch 431)

Real-life case: the project folder rolled back to an old state (the
platform rebuilt it from git), local edits remained inside — and the
installer refused to bring the project to the fresh version, demanding
manual cleanup first. Now the installer itself saves all uncommitted
edits into an archive folder `.install-backup/<date-time>/` (deletes
nothing) and brings the project to the target version in one step.
If the project is rebuilt from git (hosting/platform), the installer
suggests committing the result — otherwise a rebuild brings the old
files back.

---
## "Show" leads to results (patch 430)

Defect of 429: the filter was applied, but after the "Show" button
the window returned to the category catalog — filtered items had to
be dug out of folders by hand. Now with an active filter the window
immediately shows a flat, alphabetically sorted list of matches with
a "Found: N" header (each row keeps its type label:
Weapons/Armor/…). Reset the filter — the usual folder catalog
returns. Also: the "Mods" section now appears in search too (it used
to be lost).

---
## Filter — a separate window (patch 429)

The owner's word about mobile screens: the item list must not hide
behind the settings. The "Filter (N)" button in the search row now
opens a separate window: first it shows only the category checkboxes —
**Weapons, Armor, Power Armor, Clothing**. Parameters are NOT shown
up front: check a category and "Rarity" plus that category's
parameters appear (weapons — damage, fire rate, distance, damage
type, weapon type, ammo, qualities, effects; armor — resistances and
body parts). At the bottom, a "Show (N)" button tells how many items
match the filter. Header and button stay put, the settings scroll.
The main window is as before: search, filter button, full-height list.

---
## Installing the latest version — one step (patch 428)

The installer's cutoff now also fires when the target is the key
(latest) patch itself: the tree is brought to its state from the
branch history in one step, without walking the old chain. Before,
only installs on top of the latest were instant; installing the
fresh version itself re-checked every patch in order. The full walk
remains for a dirty tree (uncommitted edits — commit or stash them)
and for installing older versions.

---
## Search and filter — together; category checkboxes (patch 427)

Add-item window (loot and buy): search and the "Filter" button now
share one row. The filter panel is pinned at the top and no longer
scrolls with the list — a divider line separates it from the items.
The filter gains category checkboxes, 3 per row: **Weapons, Armor,
Power Armor, Clothing** (Clothing added as a fourth — it is in the
window and would vanish under any check mark otherwise). With
categories checked, the panel shows only their parameters, and the
list shows only those kinds. The Filter button shows the number of
active conditions. Unchecked — everything as before.

---
## Installer cutoff — at the latest patch (patch 426)

The installer's key patch moved from №391 to №425 (the latest one).
Installation no longer walks the whole old chain: a clean tree is
brought to the №425 state from the branch history in one step, and
only patches after it are checked and applied. Uncommitted changes
block the fast path — commit or stash before installing. A latch
keeps the cutoff equal to the branch's latest patch (moved by the
agent with a patch).

---
## Filters in loot and purchase windows (patch 425)

The «Add» and «Buy» windows now have a «Filter» spoiler — like the
perks one. Weight is not filtered; the rest is as you chose:
- «from–to» ranges with grey hints of the catalog bounds (rarity 0–6,
  damage 0–21, fire rate 0–7, armor DR) — the hint disappears once the
  field is touched;
- qualities — all 32 in the game (including those absent on weapons:
  mods grant them, except Bombardment), effects — all 10;
- types (Light/Heavy…), damage type, range, body parts — chips;
- ammo — a dropdown (41 variants from the catalog).

Per your word «mods are mods — effects appear only when installed»:
weapons are filtered by their own qualities/effects only; a selection
no weapon has opens a «Mods» section listing the mods that grant it
(night scopes, targeting computer, etc.). If nothing fits — only the
mods remain in the window.

---
## Rarity in properties (patch 424)

Weapon, armor and power armor cards now show «Редкость: N» (the
book rarity; items without rarity have no line). The first step
toward loot/purchase filters: the list of filterable properties is
sent separately; the filters come after we review it.

---
## Material names in the report (patch 423)

You caught the same class of defect as with the button: the report
line said «Потрачено: item_common_materials ×2» — a service id instead
of a name. The report now speaks properly: «Потрачено: Обычные
материалы ×2» (Common materials ×2), with the same words as the
window's requirement lines. A check is added: no report line may
contain service identifiers.

---
## Repair window without placeholders (patch 422)

You caught a defect: the repair button (and the whole repair window)
showed service names instead of words — «repair.actions.remake»
instead of «Repair» and so on. The cause: repair dictionary keys were
called without a prefix, and by the «no fallbacks» rule the key's own
name leaked onto the screen. All 23 call sites are fixed (card
buttons, the repair window, the temporary-repair note). The check now
reads the dictionary the same way the screen does — such a defect can
no longer slip past the tests.

---
## Independent settings; armor durability (patch 421)

«Weapon durability loss» and «Random weapon quality» are now two
independent settings: quality is no longer hidden behind wear (toggle
them separately as you like). The old combined switch in saves splits
evenly into both settings.

Armor (regular, not power armor) now has durability too: with
«Random quality» every found armor piece is born with its own
durability (bought = whole), the card shows «Durability: N/100», and
damaged armor is repaired by the same repair window: with the «Jury
Rigging» perk — three buttons; without — donor and materials. Rarity
and mods of the armor affect the difficulty like a weapon's. Armor
cannot wear from shots — it is only damaged by being born with poor
durability.

---
## Repair button follows durability display (patch 420)

One simple rule, as you said: if durability is not displayed — there
is no repair button at all. If durability is visible on the card —
the button opens the choice window (with the «Jury Rigging» perk —
three buttons including «Without cost (poor quality)»; without the
perk — donor and materials). A weapon shows durability when either
the quality or the wear setting is on; power armor always shows it,
so a damaged piece always has the button. No more instant repair:
everything goes through the window, the test and the time.

---
## The window only when the setting is on (patch 419)

You caught a real bug: with the «Jury Rigging» perk and the
durability setting OFF, the repair window still opened — the perk
intercepted the press before the setting was checked. The order is
now reversed: the setting is checked first. Off — always the instant
free «Fix» with no window, perk or not. On — the window: with the
perk, three buttons («Without cost (poor quality)» exists only with
the perk); without the perk — «From a donor» and «From materials».

---
## Repair rules locked in (patch 418)

The app itself did not change — both of your rules were already in
effect after the previous update; now they are locked by checks so
they cannot be lost: the repair choice window appears only when the
durability setting is on (off — the instant free «Fix» with no
window), and the «Without cost (poor quality)» button in the window
exists only with the «Jury Rigging» perk (without the perk the window
has the donor and the materials).

---
## Repair choice window (patch 417)

By your word the unconditional free repair is gone. With the
«Jury Rigging» perk the button opens a choice window with three
buttons: «Without cost (poor quality)», «From a donor (quick
repair)», «From materials». No donor — the donor button is grey; no
materials — the materials button is grey; neither — both grey, the
free one remains. No more instant actions: every choice is the test
and half an hour of work (2 AP halve it); the free option only spends
nothing, and its result is temporary (a complication 19–20 breaks the
item again — shown in the report and on the card). Without the perk
the repair window is as before.

---
## Jury Rigging (patch 416)

The «Jury Rigging» perk works now. The same single «Fix» button is
free with this perk too, even with the durability setting on. Per the
book, such a repair is temporary: the item breaks again at the next
complication while being used, and the complication range for skill
checks with the item is 19–20. While the item is temporarily repaired,
its card shows a yellow note. A proper repair with materials (the
«Repair» button) removes the note — the item is fixed for good. Firing
wear does not remove the note: only a complication releases the item.

The «Weapon durability loss» setting is now on by default. If it was
saved off in your save — turn it on once in the settings; an explicit
choice is never overridden.

---
## One repair button (patch 415)

By your word there is one button again. With the durability setting
off it is the old instant free «Fix». With it on — the book «Repair»:
a window with the donor, materials and the crafting-style report; no
materials (and no donor) — the button is grey. Free repair exists only
when the settings are off (later — also with the «Jury Rigging» perk,
on the same button). The «repair is per one piece» law now covers
everything: a weapon stack is also repaired one instance per test,
like power armor pieces; even the instant free fix separates one piece
from the stack and repairs only it. The repaired piece merges with the
whole ones.

---
## Repair — as you said (patch 414)

By your corrections there are two buttons now. «Fix» is the old
instant free repair. «Repair» is the book test with materials. The
repair window offers a donor when a second identical item is in the
bag; with no donor there is no selection window — pressing the button
attempts the repair right away and shows the report. The report comes
from the Crafting window: the same check and dice lines, the same 2 AP
question and time — only instead of «received: item» it says «the
item's durability has been restored». When materials are missing (and
no donor), the «Repair» button is disabled; when the durability
setting is off, there is no «Repair» button at all. Power armor is
repaired one piece at a time: one test — one piece, the rest of the
stack waits for its own tests.

---
## Repair — by the book (patch 413)

The repair mechanics you provided is implemented in full. The «Repair»
button now opens a repair window: an INT + Repair test with difficulty
equal to the item's rarity; +1 difficulty for each installed
modification. If you have a second identical item in the bag, you can
mark it as a donor: it is scrapped, provides the materials and lowers
the difficulty by 1. Materials follow the book rarity table (the
window shows «have / need» for every line). Time is half an hour; on
a success you may spend 2 AP to halve it; each complication adds 15
minutes, and a d20 rolled 19–20 on a complication loses one more set
of materials. On a failure the materials stay in the bag, but the
time is gone. Instant free repair is no more — an item's durability
is now honestly earned.

---
## Dormant perks: the game warns and leaves the call to you (patch 412)

By your word, the migrator no longer removes perks taken under the old
rules. If a perk does not meet the book (missing level or attributes,
unavailable to robots, mutually exclusive with another perk, a rank the
book does not have) — it stays in the list, shown greyed with a «Not
active» note explaining exactly what is missing. Such a perk grants no
bonuses and no recipes; once you meet the requirements it wakes up on
its own — or do not wait: the «Replace» button swaps it for any other
perk, the character decides. On load the game names the list of such
perks once; reloading the same character does not repeat the notice.
Only perks missing from the catalog entirely are still removed. Perk
requirements now apply uniformly everywhere: a dormant rank unlocks no
crafting recipes and does not affect salvage.

---
## Old saves' perks repair themselves (patch 411)

The app is now public, and the book rules for perks have changed — so
on every character load the perks are checked against the book and
repaired automatically, without bumping the save version. If a perk
had more ranks than allowed, the extras are removed and the picks are
freed; if a perk was taken under the old rules (wrong level, wrong
attributes, a robot, mutually exclusive with another perk) — it is
removed and its slot is freed too. After such a cleanup the game shows
a short notice naming the changed perks, in the interface language.
Reloading changes nothing and shows no notice. Also fixed the load-time
perk notices themselves: their text dictionary was missing, so they
silently never worked.

---
## Perks follow the book (patch 410)

By your word «the book takes priority», all perk ranks and
requirements now match the book, guided by its descriptions wherever
the rank number itself looked wrong. Result: 45 perks got book ranks
(Ammosmith all 3 — this also fixed ammo recipes of rarity 2–3 that
were unreachable before), 48 perks got book requirements (level, step
per rank, attributes). The Pharmacist now removes +2/+3/+4 radiation
by rank, Power User grants +3/+6/+10 charges — exactly per the book.
Armorer, Science and Gun Nut keep 4 ranks: their descriptions
(«and so on») continue the series to mod rank 4, otherwise rank-4 mod
recipes would be lost. «Whatever the description says is what works»
is now pinned by a test.

---
## Perk audit against your list (patch 409)

Audited every perk against your prepared list of descriptions. Main
fix: 123 perks still had short English blurbs in the Russian UI — now
all 185 perks carry full Russian names and texts, verbatim from your
catalog (Патронщик, Фанат колы, Кровосос, Водохлёб, etc.). Exceptions:
three perks work by your word rather than the book — Field Surgeon,
Pharmacist and Power User — their texts now describe the actual app
behavior. The Bloodsucker gained its book detail: a blood pack also
quenches thirst one step better than a regular drink. No coverage
gaps: 184 from your list plus our EMT.

---
## «Гулеподобный» as written (patch 408)

The perk is now three ranks, as in the book: 1 HP for every 4 points
of radiation taken, at rank 2 — every 3, at rank 3 — every 2 (level
requirement +8 per rank). Radiation now applies normally — the counter
grows — and the healing comes on top. The rate counts radiation from
food and drinks (shown in the consumption report) and manual counter
changes; removing radiation grants no healing. Note: the book line
«your maximum HP is still reduced» changes nothing in the app —
radiation never reduces max HP here; that is app-wide behavior, not
the perk's.

---
## Ghoulish and the glowing pack (patch 407)

«Гулеподобный» (the Russian name of Ghoulish) now accounts for every
radiation increase — including manual counter changes: instead of harm
the character heals the same amount of HP, and the counter does not
grow. The Glowing blood pack got its written mechanics: +5 radiation
DR until the end of the scene (the +4 HP heal stays). The catalog
split is now pinned: 43 of 185 perks have explicit mechanics, the
other 142 are descriptive.

---
## Eleven more perks now work (patch 406)

«Ghoulish»: radiation from food and drinks heals instead of harm, HP
for HP. «Bloodsucker»: blood packs (already in the gear list) heal
twice as much. «Super Duper»: every craft rolls a combat die — on an
Effect, half of the spent materials go back to your inventory, and the
craft report shows it. «Rejuvenated»: +2 max HP while fully fed, and
fullness/thirst last twice as long. «Dromedary»: any drink quench
thirst one step better, purified water — three steps at once. «Field
Surgeon»: stimpaks heal +3 HP, RadAway removes 1 more radiation;
«Pharmacist» adds another 1 (2 together). «Power User»: fusion cores
hold 1 more charge (4 with the Nuclear Physicist). «Cap Collector»:
the buy window opens with the 10% discount already applied. «Natural
Resistance»: sleeping rough no longer rolls for disease. The «Chemist»
now also doubles chem duration. «Quack Surgeon» and the night perks
stay text until first aid and a day cycle exist.

---
## Book conditions restored to perks (patch 405)

Your question prompted a full re-check, which found two gaps. «Load and
Fire» now boosts only heavy weapons with a fire rate of 2 or higher —
the Fat Man and other single-shot launchers are no longer sped up, as
the book says. «In Shining Armor» rank 2 got its second half: while
wearing glare-blocking optics (currently the Welding Shield — the only
optics in the gear list) energy damage resistance gains another +1,
for +3 total in metal armor with the shield. All active perks were
also audited — every mechanic is in place.

---
## Four perks now actually work (patch 404)

As you asked, all four adaptable perks from the previous step landed in
one patch. «Old World Gourmet»: packaged and canned food heals 2 HP
more and deals 1 less radiation (down to zero). «Load and Fire»: heavy
weapons fire 1 (rank 1) or 2 (rank 2) more shots — visible on weapon
cards in inventory and on the gear screen. «In Shining Armor»: +2
energy damage resistance while wearing metal armor (the rank-2
dazzle protection stays perk text — combat scenes are out of the
app's scope). «Jury-Rigged Ammo»: at a workbench, ammo of rarity 1
(and 2 with rank 2) can be made from any junk — 5 pieces and 10
minutes instead of regular materials and an hour of work; the craft
report reminds you: attacks with such ammo get a Complication Range +1.


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
## Eight new perks from your references (patch 403)

The perk catalog grows from 177 to 185: Crippler, Crushing Blow,
Fierce Loyalty, In Shining Armor, Jury-Rigged Ammo, Load and Fire,
Miss Fortune, Old World Gourmet. Texts follow your compiled reference
(full Russian, concise English); ranks and requirements unchanged.

---
## The «What's new» window scrolls (patch 402)

Long release notes no longer fall off the screen: the list scrolls,
the title and the button stay put.

---
## Release 2 (declared by the owner)

The «What's new» notes now cover patches 336–400: mod crafting (weapons
and armor), real mod names instead of numbers, mods as tangible things
with auto-reconciliation on load, robot mods under the same rules,
item stats in the picker row, and the fixed PWA installation. Details
in the «What's new» window after the update.

---
## One law for all mods (patch 400)

Mod rules are no longer split into «weapon» and «the rest»: armor and
clothing follow the same rules as weapons — a mod is tangible, can be
installed and removed, and on every character load entries are
reconciled with slots by deficiency (missing ones are bound/created,
surplus ones return to the stack, reloading never duplicates). Factory
loadouts, mods leaving with a sold host, and «no service keys on
screen» are just as universal.

---
## Mods unified as «stack ↔ slots» (patch 399)

Following the owner's model («a mod is a tangible entry; being
installed is just its status» — like bottles: empty ones form one
stack, filled ones change state): on every character load, mod entries
are reconciled with weapon slots by deficiency — missing ones are
bound or created, surplus ones return to the stack. Reloading never
duplicates anything. Factory mods of kit weapons are ordinary mods:
they can be removed and live their own life. Selling a weapon still
takes its mods with it. An installed mod «knows» the weapon and slot
it sits in; screens show only names, no service keys.

---
## Old saves: bag mods get their names back (patch 398)

A serious bug fixed: saves made before the mod catalog revision kept
bag mods under legacy numbers (mod_043 and alike), because the load
bridge translated only mods already installed on weapons — mods in the
bag stayed legacy and showed a bare «mod_043» instead of a name. They
are now translated on load too: name, price and stats come back. The
fix happens right when a save is opened, no player action needed, and
re-loading is safe. A mod that was one of the removed duplicates gets
the name of the canon it was merged into.

---
## Ammo icon in the crafting window (patch 397)

The «Ammo» category tile rendered blank: no glyph named «ammo» exists
in the bundled icon font. The category now has a proper bullet icon
(«bullet»), as suggested. All category icon names are now checked
against the font's glyph map automatically — no more blank tiles from
non-existent names.

---
## Nothing on our side blocks installation anymore (patch 396)

Since the earliest versions the app intercepted the install event and
forbade the browser from showing its native dialog — installation went
only through the in-app button. In some browsers (today's Yandex) that
path never raises a window, so there was no dialog at all. The
interception is relaxed: the browser is free to show its native
install path again; the button and diagnostics keep working.

---
## The install check tells the truth about browsers (patch 395)

The install diagnostics no longer misleads with color and names things
directly: a real app (an icon in the app list, a window without the
address bar) is installed by Chrome — menu ⋮ → «Install app» (Samsung
Internet can too). Mi Browser cannot install a real PWA at all; Yandex
Browser creates a shortcut that opens in the browser — not an app. The
site passes every install check — it is only about browser
capabilities.

---
## Diagnostics names the browser and the no-prompt path (patch 394)

If every check is green but the native install prompt never arrives,
that is browser behavior, not a fault: not every browser sends the
prompt, and even Chrome shows it with a delay. The check now displays
the browser name; when there is no prompt it explains: install via the
browser menu («Install app» / «Add to Home screen») — you still get a
real app with an icon and no address bar.

---
## The installer explains the cutoff in plain words (patch 393)

When an install goes through the cutoff, patches up to the key one do
not appear in the "applied" list — their content arrives from the
branch history as a whole. It used to look like a patch was skipped;
now the installer explicitly says those patches are already in the
tree and are not applied one by one.

---
## The diagnostics itself fixed (patch 392)

Both red lines in the install check were bugs of the diagnostics, not
the app: "Not installed before" is normal and is now shown as a green
line, and the icon check always reported failure because of an internal
mistake (the wrong image constructor was used). After the update the
check will honestly show the icon status for the first time: if they
are green — the install problem is elsewhere, and the "already
installed" line will hint at it.

---
## Patch installs: cutoff at a key patch (patch 391)

The installer no longer re-verifies the whole chain from scratch: a
baseline.json file names the key patch (currently 391). On a clean
tree (everything committed) the installer brings the files to the key
patch's state straight from the branch history and only checks the
patches after it — hundreds of checks become a few. With uncommitted
changes or incomplete history it automatically falls back to the old
full pass, nothing breaks. The cutoff can be moved to a later patch at
any time — just name the number.

---
## Install diagnostics behind a switch (patch 390)

The technical check inside the install dialog is no longer shown to
everyone: Settings (the "Appearance" section) now has an "Install
diagnostics" toggle. It is off by default and the dialogs look as
before; when enabled, the install dialog shows the check: whether the
app is already installed, manifest, icons, service worker, build version.

---
## The install window now diagnoses itself (patch 389)

When the app can't be installed, the install dialog now shows live
diagnostics: whether the browser already considers the app installed
(the most common cause — an old shortcut; remove it, reload, install
again), whether the manifest/icons/service worker are reachable, whether
the native prompt is available, and the app version. The manifest now
carries an entry that lets the browser report "already installed".

---
## Weapon lines in the picker now include ammo, effects, qualities (patch 388)

The item stats line for weapons now lists the ammo type after range
(two calibers → "Энергоячейка / Ядерный блок"), then effects and
qualities — the same localized names as on the weapon card. Weapons
without ammo or qualities simply omit those parts.

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
