# Game Master («Admin») & «Loot/Trade» Guide

This guide explains how to run campaigns in Game Master mode, connect players to rooms, organize settlements, stashes, and merchants, and hand out loot or run live trading sessions at the table.

---

## 1. Enabling Game Master Mode & Switching Views

By default, the app opens in **«User»** mode for managing your own personal characters. To unlock Game Master tools:

1. On the main screen, open **`☰` → «Settings»**.
2. Turn on the **«Admin screen»** switch.
3. An **«Admin»** button will appear in the top header of the main screen.

### «User» Mode vs. «Admin» Mode
- **«User» mode** — your personal characters and personal folders. Characters created here never mix into the Game Master view on their own.
- **«Admin» mode** — the Game Master workspace with two bottom tabs:
  1. **«Campaigns»** — online campaign rooms and live cards of connected player characters.
  2. **«Loot/Trade»** — locations, loot containers, and merchants.
- Tap **«User»** in the top bar anytime to return to your personal characters.
- *Desktop tip:* you can keep two browser tabs open side by side — one in «Admin» mode to run the session, and another in «User» mode to preview things through a player's eyes.

---

## 2. «Campaigns» Tab (Rooms & Connecting Players)

### Creating a Campaign Room (Game Master)
1. Switch to **«Admin»** mode and stay on the **«Campaigns»** tab.
2. Tap the create-room tile, enter a campaign name, and confirm.
3. An **invite code** formatted like `GM-XXX-XXX` will appear — copy it and share it with your players.
4. Inside an opened room, tap **`⋮`** in the room header anytime to:
   - **«Edit»** — fix a typo or rename the campaign (the invite code stays the same and the new title updates live for connected players);
   - **«Delete»** — remove the campaign room.

### Connecting a Character (Player)
1. In **«User»** mode, tap **`⋮`** on the character card you are playing and select **«Server»**.
2. Enter the `GM-XXX-XXX` invite code from your Game Master and tap **«Connect»**.
3. A network badge appears in the top-right corner of the character card:
   - **green** — the Game Master is online and the room is active;
   - **dim** — the Game Master is currently offline (no need to re-enter the code: your character reconnects automatically whenever the room is open).
4. Moving a character between your personal folders never resets its room connection.

### What the Game Master Sees Inside a Room
- Every character connected to the room appears as a card inside that campaign room.
- Whenever a player updates health, caps, gear, or stats and saves their sheet, the card updates automatically for the Game Master.
- Tapping any player card opens that character's full sheet in read-only inspection mode (stats, equipment, inventory, and perks), with a button to return to the room.

---

## 3. «Loot/Trade» Tab & Keeping Long Campaigns Organized

The second tab is where the Game Master prepares places, stashes, and traders. Everything is stored on the Game Master's device and backed up to their Google Drive cloud (via the cloud sync icon in the top-left corner).

Cards on the main screen always follow a clear, fixed order:
1. **Locations**
2. **Loot Containers (Chests)**
3. **Merchants**

### Locations (Nested «Matryoshka» Organization)
Long campaigns quickly accumulate dozens of stashes and shops. To keep the main screen clean and uncluttered:
- create **Locations** (such as *«Diamond City»*, *«Red Rocket»*, or *«Vault 81»*);
- place loot containers and merchants inside them — packed cards disappear from the main screen and live neatly as a compact text list inside their location.

### Room Binding & Shared Traders/Containers
- **Locations** can be bound to **one room or multiple rooms at once** — handy when different parties visit the same settlements across campaigns.
- **Loot containers and merchants** are not locked to a single room:
  - when creating one, you can optionally link it straight into one or more locations, or leave it on the main screen;
  - on the main screen, drag any chest or merchant by the **four-way arrow handle** in its top-left corner onto a Location card (or use **`⋮` → «Move to location…»**);
  - the same merchant or stash can belong to **multiple locations at the same time** (for example, a traveling caravan trader visiting several towns — marked with a shared badge `🔗 ×2` inside locations).
- Inside an opened location, use **«↗ To screen»** to bring a chest or merchant back out onto the main screen, or **«Unlink»** (when shared across multiple locations) to remove it only from the current location while keeping it in the others.

### Smart Check When Deleting a Location
When deleting a location, the app checks every chest and merchant inside it:
- if any of them exist **only inside this location**, you get a clear warning with a choice: **«Move to screen»** (keep them on the main screen) or **«Delete all»** (delete them along with the location);
- chests and merchants that are also linked to **other locations** are never deleted and remain untouched in those other places.

---

## 4. Stocking Chests & Configuring Merchants

Open any chest or merchant card and tap **«+ Add item»** to browse and search the full equipment catalog (including a dedicated Caps entry for chests).

### Rolling Item Quantities on the Spot
- **Regular items & caps:** choose exact pieces (**`pcs`**), Fallout Combat Dice (**`CD`**), or twenty-sided dice (**`d20`**). As soon as you press «Save», the dice are rolled automatically and the resulting total is placed into the container.
- **Ammunition:** ammo is always added by **number of packs**. For each pack, the app automatically rolls the tabletop rulebook's found-ammo formula.

### Merchant Pricing & Caps Limit
Each merchant has three core economy settings:
1. **Merchant Caps** — how many caps the trader currently carries (entered manually or rolled with dice). A merchant cannot pay players more caps than they have in their pouch.
2. **Sale Markup (`%`)** — how much higher (or lower, if negative) than base value this merchant sells goods in general.
3. **Buyback Markdown (`%`)** — how much below base value the merchant buys items from players (defaults to `50`, entered as a plain positive number without a minus sign).

**Item-specific specialization:** any individual item in a shop can also have its own item markup (`%`), which **adds together** with the merchant's general sale markup.
*Example:* a clinic doctor can have `0%` general markup on everyday bandages, plus `+40%` item markup on scarce Stimpaks.

> **Game Master's secret:** players only ever see the final cap prices in the trade window — the merchant's markup and markdown percentages stay hidden. Meanwhile, the active character's relevant perks (such as Cap Collector discounts or extra found-item bonuses) apply automatically.

---

## 5. Issuing to Players, Live Controls & Locks

Tap **`⋮` → «Issue»** on a card (or the **«Issue»** button inside its detail view):
1. Pick the **campaign room** (if more than one is available).
2. Choose who receives it:
   - **Entire room** — opens simultaneously for everyone in the room;
   - **Single character** — opens privately only for that character's player (great for solo scouting or private deals).

Issued cards display an active **«ISSUED»** badge for the Game Master.

### Player Experience
- A window for the chest, merchant, or location pops up automatically. If the targeted character isn't currently loaded, a quick banner lets the player open that character and the window in one tap.
- Players can tap **«Minimize»** anytime to collapse the window into a small pill, check their inventory, weight, or stats, and expand it right back.

#### Loot Containers
- Room-wide chests work in real time on a **first-come, first-served** basis: as soon as one player takes an item, everyone else sees the updated count immediately.
- Clicking **«Close»** closes the chest window for that player without interrupting teammates who are still browsing it.
- Once the very last item is taken, the chest closes automatically and asks the Game Master: **«Container is empty. Delete it?»**.

#### Merchants (Two-Pane Barter Buffer)
- The trade window shows the merchant's stock alongside the character's inventory.
- Trading uses a **staged buffer**: items selected to buy or offered for sale appear in *grey italics* on the opposite side while the player's cap balance and the merchant's remaining caps update live at the top.
- Nothing is final until confirmed — players can freely adjust quantities or take items back out of the offer before completing the deal.

#### Locations & Locks (`🔒` / `🔓`)
- When a **Location** is issued, players see the list of stashes and merchants at that site.
- Players can step into any unlocked chest or shop, close that nested window to return to the location list, or minimize the whole location. The outer location window stays open for the party until the Game Master closes the scene.
- The Game Master can put a **Lock (`🔒`)** on any chest or shop in a location and write a note (such as *«Lockpick — Difficulty 2»* or *«Requires Overseer's Key»*). Players see the locked entry and its requirement in the list, but cannot peek inside until they overcome the obstacle in play and the Game Master flips the lock to **«Unlocked» (`🔓`)**.

### Live Scene Controls for the Game Master
While a chest, merchant, or location is active, the Game Master has a **live control panel** inside the card:
- after a good barter roll or Charisma check, adjust sale markup, buyback markdown, or caps **live on the fly** — either for the whole party or **personally for one specific character**;
- toggle locks (`🔒` / `🔓`) inside an active location with instant updates on players' screens;
- every item taken, bought, or sold and every cap spent is saved straight back into the Game Master's cards automatically.
