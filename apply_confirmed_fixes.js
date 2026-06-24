#!/usr/bin/env node
// Applies fixes confirmed by runtime diagnostics. Run from project root:
//   node apply_confirmed_fixes.js
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
function p(rel) { return path.join(ROOT, rel); }
function read(rel) { if (!fs.existsSync(p(rel))) throw new Error(`Not found: ${rel}`); return fs.readFileSync(p(rel), 'utf8'); }
function write(rel, s) { fs.writeFileSync(p(rel), s, 'utf8'); console.log(`updated: ${rel}`); }
function replaceOnce(s, oldText, newText, rel) {
  if (!s.includes(oldText)) throw new Error(`Cannot patch ${rel}; missing:\n${oldText.slice(0, 300)}`);
  return s.replace(oldText, newText);
}
function ensureImport(s, importLine) {
  if (s.includes(importLine)) return s;
  const matches = [...s.matchAll(/^import .*;$/gm)];
  if (!matches.length) return importLine + '\n' + s;
  const last = matches[matches.length - 1];
  const end = last.index + last[0].length;
  return s.slice(0, end) + '\n' + importLine + s.slice(end);
}

// CharacterScreen: locale-aware display and store sync for trait-granted tagged skills.
{
  const rel = 'components/screens/CharacterScreen/CharacterScreen.js';
  let s = read(rel);

  s = s.replace('import { loadEnrichedOrigins } from "../../../domain/origins";', 'import { loadEnrichedOrigins, tOrigin } from "../../../domain/origins";');
  s = s.replace('import { loadTraitsData } from "../../../domain/traits";', 'import { loadTraitsData, tTrait } from "../../../domain/traits";');
  s = ensureImport(s, 'import { getEquipmentCatalog } from "../../../i18n/equipmentCatalog";');
  s = s.replace('import { getCurrentLocale } from "../../../i18n/locale";', 'import { useLocale } from "../../../i18n/locale";');
  // If diagnostics already changed the import, keep it.
  if (!s.includes('import { useLocale } from "../../../i18n/locale";')) {
    s = ensureImport(s, 'import { useLocale } from "../../../i18n/locale";');
  }

  if (!s.includes('const locale = useLocale();') && !s.includes('const debugLocale = useLocale();')) {
    s = replaceOnce(s,
`  const storeAttributes = useCharacterStore((state) => state.attributes);`,
`  const locale = useLocale();
  const storeAttributes = useCharacterStore((state) => state.attributes);`, rel);
  }

  // Diagnostics may have named it debugLocale. Create a stable alias for production logic.
  if (s.includes('const debugLocale = useLocale();') && !s.includes('const locale = debugLocale;')) {
    s = s.replace('  const debugLocale = useLocale();', '  const debugLocale = useLocale();\n  const locale = debugLocale;');
  }

  if (!s.includes('const localizedOrigin = useMemo(() =>')) {
    s = replaceOnce(s,
`  const [isOriginModalVisible, setIsOriginModalVisible] = useState(false);`,
`  const localizedOrigin = useMemo(() => {
    if (!origin?.id) return origin;
    return loadEnrichedOrigins().find((entry) => entry.id === origin.id) || { ...origin, name: tOrigin(origin.id) };
  }, [origin, locale]);

  const localizedTraitName = useMemo(() => {
    if (!trait) return null;
    const traitId = trait.id || trait.ids?.[0];
    const traitData = loadTraitsData().find((entry) => entry.id === traitId);
    return traitData?.displayNameKey ? tTrait(traitData.displayNameKey) : trait.name;
  }, [trait, locale]);

  const localizedEquipmentName = useMemo(() => {
    if (!equipment) return null;
    if (!equipment.id) return equipment.name;
    const catalog = getEquipmentCatalog(locale);
    return catalog?.equipmentKits?.[equipment.id]?.name || equipment.name;
  }, [equipment, locale]);

  const [isOriginModalVisible, setIsOriginModalVisible] = useState(false);`, rel);
  }

  // Store kit id, otherwise selected equipment cannot be re-localized after locale switch.
  s = s.replace(
`    setEquipment({
      name: kit.name,
      weight: kit.weight,
      price: kit.price,
      items: kit.items,
    });`,
`    setEquipment({
      id: kit.id,
      name: kit.name,
      weight: kit.weight,
      price: kit.price,
      items: kit.items,
    });`
  );

  // Sync trait-granted forced/extra skill +2/-2 to Zustand store. The screen reads skills from store when present.
  if (!s.includes('const syncTraitSkillDelta = (skillName, delta) =>')) {
    s = replaceOnce(s,
`    setSkills((currentSkills) => {
      let tempSkills = [...currentSkills];`,
`    const syncTraitSkillDelta = (skillName, delta) => {
      if (!delta) return;
      const store = useCharacterStore.getState();
      if (!store.skills?.[skillName]) {
        store.loadFromLegacyData({ skills });
      }
      useCharacterStore.getState().updateSkill(skillName, delta);
    };

    setSkills((currentSkills) => {
      let tempSkills = [...currentSkills];`, rel);

    s = replaceOnce(s,
`          tempSkills[index] = {
            ...tempSkills[index],
            value: Math.max(0, tempSkills[index].value - 2),
          };`,
`          const before = tempSkills[index].value;
          const next = Math.max(0, before - 2);
          tempSkills[index] = {
            ...tempSkills[index],
            value: next,
          };
          syncTraitSkillDelta(skillName, next - before);`, rel);

    s = replaceOnce(s,
`        if (index > -1 && tempSkills[index].value < 2) {
          tempSkills[index] = { ...tempSkills[index], value: 2 };
        }`,
`        if (index > -1 && tempSkills[index].value < 2) {
          const before = tempSkills[index].value;
          tempSkills[index] = { ...tempSkills[index], value: 2 };
          syncTraitSkillDelta(skillName, 2 - before);
        }`, rel);
  }

  // Display selected entities using current locale.
  s = s.replace('value={origin ? origin.name : tCharacterScreen("placeholders.selectNone", "Not selected")}', 'value={localizedOrigin ? localizedOrigin.name : tCharacterScreen("placeholders.selectNone", "Not selected")}');
  s = s.replace('value={trait ? trait.name : tCharacterScreen("placeholders.selectNone", "Not selected")}', 'value={localizedTraitName || tCharacterScreen("placeholders.selectNone", "Not selected")}');
  s = s.replace('value={equipment ? equipment.name : tCharacterScreen("placeholders.selectNone", "Not selected")}', 'value={localizedEquipmentName || tCharacterScreen("placeholders.selectNone", "Not selected")}');
  s = s.replace('if (origin && origin.equipmentKits) {', 'if (localizedOrigin && localizedOrigin.equipmentKits) {');
  s = s.replace('equipmentKits={origin?.equipmentKits}', 'equipmentKits={localizedOrigin?.equipmentKits || origin?.equipmentKits}');

  write(rel, s);
}

// WeaponsAndArmorScreen: rebuild modified weapon display name from current-locale catalog.
{
  const rel = 'components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js';
  let s = read(rel);

  if (!s.includes('const getLocalizedModifiedWeaponName = (catalog, weapon, base) =>')) {
    s = replaceOnce(s,
`const findLocalizedWeapon = (catalog, weapon) => {
  if (!weapon?.id) return weapon;`,
`const getLocalizedModifiedWeaponName = (catalog, weapon, base) => {
  const appliedModIds = Object.values(weapon?.appliedMods || {}).filter(Boolean);
  const prefixes = appliedModIds
    .map((modId) => (catalog?.weaponMods || []).find((mod) => mod.id === modId)?.prefix)
    .filter(Boolean);

  const localizedBaseName = base?.stockNames?.without || base?.name || weapon?.baseWeaponName || weapon?.name;
  return prefixes.length ? prefixes.join(' ') + ' ' + localizedBaseName : (base?.name || weapon?.name);
};

const findLocalizedWeapon = (catalog, weapon) => {
  if (!weapon?.id) return weapon;`, rel);
  }

  s = s.replace(
`      name: weapon.name,
      baseWeaponName: weapon.baseWeaponName,`,
`      name: getLocalizedModifiedWeaponName(catalog, weapon, base),
      baseWeaponName: base.stockNames?.without || base.name || weapon.baseWeaponName,`
  );

  write(rel, s);
}

console.log('\nConfirmed fixes applied. Run syntax checks:');
console.log('node -c components/screens/CharacterScreen/CharacterScreen.js');
console.log('node -c components/screens/WeaponsAndArmorScreen/WeaponsAndArmorScreen.js');
