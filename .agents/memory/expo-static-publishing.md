---
name: Expo static publishing
description: Production publishing rules for the Expo web build and hashed JavaScript assets
---

Expo web output is a static site. It must be published from the generated `dist` directory with a static deployment target rather than relying on an SPA server fallback.

**Why:** A fallback server can return `index.html` with HTTP 200 when an old cached index requests a removed hashed JavaScript bundle. The browser then parses `<` as JavaScript and reports `Unexpected token '<'`.

**How to apply:** Keep the production build and its asset directory from the same `expo export --platform web` run, avoid caching `index.html` and JavaScript in the service worker, and use one service worker registration with a versioned cache.