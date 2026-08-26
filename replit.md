# Fallout 2d20 RPG Companion App

A mobile-focused web application built with React Native (Expo) for managing tabletop RPG characters in a Fallout 2d20 setting.

## Architecture

- **Framework**: Expo ~54.0.34 with React Native ~0.81.5, targeting web via Metro bundler
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

- No external auth or third-party API integrations — fully self-contained
- PWA-enabled with service worker and manifest
- Supports English and Russian localization
