---
name: Zustand selector infinite loops
description: How to safely derive arrays/objects from Zustand store in React components without triggering infinite re-renders.
---

## Rule
Never pass an inline arrow function (or `useShallow(inlineArrowFn)`) directly to a Zustand `useStore` hook when the selector returns a new array/object each call.

**Wrong:**
```js
const items = useStore((state) => selectItems(state, arg));          // new array every render
const items = useStore(useShallow((state) => selectItems(state, arg))); // new fn ref every render → breaks snapshot cache
```

**Correct:** Subscribe to the stable primitive slice, then derive with `useMemo`:
```js
const rawItems = useStore((state) => state.items);  // stable object reference
const items = useMemo(() => selectItems({ items: rawItems }, arg), [rawItems]);
```

**Why:** Zustand's `getSnapshot` must return a referentially stable value or React throws "Maximum update depth exceeded". `useShallow` only works with a *stable* selector function reference — passing a new arrow function each render defeats it. Subscribing to the raw dict (which IS stable when unchanged) and deriving with `useMemo` is always safe.

**How to apply:** Any selector that calls `Object.values(state.items)`, `effectsDictToLegacyArray`, or any function that returns a new array/object — must follow this pattern in the component. Affects `selectItemsByEquipped`, `getEquippedArmor`, `selectActiveTimedEffects` in this project.
