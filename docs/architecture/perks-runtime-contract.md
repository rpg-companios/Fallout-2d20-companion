# Perks runtime contract

`domain/perks.js` owns setting-neutral selection, rank normalization, prerequisite evaluation, and effect aggregation. It does not import a perk catalog, effect registry, origin model, or attribute schema. It queries the active runtime's optional `services.perks` capability.

```js
services: {
  perks: {
    getEffect(effectId),
    getAttributeCode(value),
    getCharacterContext(character),
    getSelectionIneligibility(perk, context),
    getEquipmentContext(equippedArmor),
  },
}
```

All methods are optional. `getEffect` returns an effect descriptor (`{ apply(ctx) }`) or `null`; `getAttributeCode` returns the setting's canonical attribute code or `null`; context methods return additional setting-owned context; `getSelectionIneligibility` returns a reason string or `null`. An absent capability is valid: aggregation contributes no setting-specific perk bonuses, and no origin/equipment restrictions are assumed by the engine.

Fallout provides this capability from `modules/fallout/runtimeServices.js`; its effect registry and implementations live in `modules/fallout/perks/effects/`. Fallout's SPECIAL filter order lives in `modules/fallout/perks/attributeFilters.js`. These paths are not imported by engine-owned perk logic.
