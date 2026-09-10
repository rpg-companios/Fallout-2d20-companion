---
name: Character store hydration
description: The persisted character store is a rebuildable working cache and must finish hydrating before character UI mounts.
---

The persisted character store is not the canonical character record. Treat it as a rebuildable working cache: await its hydration before mounting character context/UI, and if hydration/recalculation fails, clear only that cache and let the database-backed character load rebuild it.

**Why:** Web reopen failures can occur when a stale equipped-item or setting-extension cache is recalculated while the character provider is mounting. Clearing the cache preserves saved characters and avoids a white screen.

**How to apply:** Keep database character rows and catalog data intact during cache recovery. Add regression coverage for reopening with setting extensions and equipped items.

Legacy fields still exposed through `CharacterContext` are mirrors, not a second source of truth. Any action that commits canonical store changes must update the mirror in the same action, or screens using context queries can evaluate stale requirements.

**Why:** Perk requirements were evaluated from the context attribute array while the character sheet read Zustand; perk-granted attribute changes updated only Zustand, so the two screens showed different SPECIAL values.

**How to apply:** When removing a legacy mirror is not yet safe, update it at every store commit and cover the same action through both store- and context-backed consumers.