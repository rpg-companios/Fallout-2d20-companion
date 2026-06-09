---
name: Expo Web platform stubs
description: Platform-specific stubs and Metro config required to run this Expo app on web without native/WASM modules.
---

## Rule
Two changes are required for Expo web compatibility in this project:

1. **`db/Database.web.js`** — stubs out SQLiteAdapter so Metro doesn't bundle WatermelonDB's WASM files on web.

2. **`metro.config.js`** — sets `unstable_conditionNames: ['require', 'react-native', 'default']` to prevent Metro from resolving Zustand's ESM exports (which use `import.meta.env`, unsupported in Metro's JS engine).

**Why:** Metro bundles all platforms from the same source tree. Without the `.web.js` stub, it tries to load native SQLite WASM binaries in the browser. Without the conditionNames override, it picks up Zustand's ESM entry point which contains `import.meta.env` — a syntax Metro cannot parse.

**How to apply:** If dependencies are updated and `import.meta` errors reappear, check whether the new package version added an ESM export condition and ensure metro.config.js still forces CJS resolution.
