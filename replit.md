# Positronium

A mobile-focused web application built with React Native (Expo) for managing tabletop RPG characters. It is a generic TTRPG character manager engine that currently ships with the **Fallout 2d20** setting pack (`modules/fallout`).

## Mandatory architecture context for AI agents

Before making architectural, state, catalog, save, or gameplay changes, read:

- `docs/architecture/engine-dna.md` — the authoritative engine/setting boundary,
  source-of-truth rules, TypeScript migration strategy, and AI working protocol;
- `setting-contract.md` — the setting package and `.trpg` contract;
- the relevant document under `docs/architecture/`.

This project is evolving from a Fallout-only application into a universal
TypeScript-oriented TTRPG engine with Fallout as a setting module. Do not perform
a big-bang JS→TS rewrite. Add new generic contracts/actions in TypeScript,
preserve working JavaScript behind compatibility facades, and migrate one
behavior-tested vertical slice at a time.

The engine must not import `modules/fallout`. Fallout-specific rules, data,
screens, migrations, and state extensions belong to the setting module or its
adapter. UI components must call one shared action/query instead of implementing
game rules independently. Catalog JSON is the source of truth; DB is storage or
projection; item instances store mutable state. Legacy save formats are handled
at the migration boundary and must not leak into modern runtime code.

## Architecture

- **Framework**: Expo ~57.0.16 with React Native ~0.86.2, targeting web via Metro bundler
- **Navigation**: `@react-navigation/material-top-tabs` with bottom tab bar
- **Storage**: `expo-sqlite` (web uses an in-browser WebAdapter), `@react-native-async-storage/async-storage`
- **UI**: `react-native-paper`, `@expo/vector-icons` (Ionicons)
- **i18n**: Custom localization system supporting English and Russian

## Project Structure

- `App.js` — Root component, sets up navigation and DB initialization
- `components/` — UI screens (Home, Character, WeaponsAndArmor, Inventory, PerksAndTraits) and shared context
- `data/` — Canonical JSON game data (weapon stats, item IDs, etc.)
- `db/` — Database layer with SQLite adapter and WebAdapter for browser
- `domain/` — Business logic (character creation, dice rolls, equipment rules)
- `i18n/` — Localization files and merge logic
- `assets/` — Images, fonts, global JSON data
- `styles/` — Component-specific StyleSheet files
- `public/` — Static web assets (index.html, PWA manifest, service worker)

## Running

- **Development/Production on Replit**: Builds with `node_modules/.bin/expo export --platform web` then serves on port 5000 with `serve`
- **Tests**: `npm test` (vitest)

## Deployment

- Build: `npm run build` (`expo export --platform web`)
- Serve: `npm run serve` (`serve -s dist -l 5000`)
- Target port: 5000 (mapped to external port 80)

## Notes

- Google Drive cloud sync uses the browser-side Google Identity Services flow;
  see `docs/cloud-sync-setup.md` for its configuration.
- PWA-enabled with service worker and manifest
- Supports English and Russian localization
