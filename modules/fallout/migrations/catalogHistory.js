// Fallout-owned historical migrations for catalog IDs and rules. These are
// registered by the active setting at their original schema transitions.
import { catalogGetWeaponModById } from 'engine:db/catalogSource';
import { generateItemId } from '../logic/itemIdentity.js';
import { getPerks } from 'engine:domain/registry';
import { getFalloutUniqQualityName as getUniqQualityName } from '../logic/uniqQualities.js';
import { trimSelectedPerksToMaxRanks } from 'engine:domain/perks';
import { composeFalloutNameWithQualities } from '../logic/uniqQualities.js';
import { resolveMutuallyExclusiveQualities } from '../logic/weaponQualityConflicts.js';

// --- v0 -> v1: разделение эффектов (effect_) и качеств (quality_) в экипировке ---
// В старых сохранениях экипированное оружие хранило качества вперемешку
// (quality_burst и пр. — теперь это effect_*) и/или поле damageEffects
// (голые строки). Миграция разводит их по effects/qualities с прямыми id,
// точно как в data-миграции (патчи 09/11). Идемпотентна.
const _EFFECT_OLD_IDS = new Set([
  'quality_burst', 'quality_breaking', 'quality_persistent', 'quality_piercing_x',
  'quality_radioactive', 'quality_spread', 'quality_stun', 'quality_vicious',
  'quality_freeze', 'quality_arc',
]);
const _ID_RENAME_V0V1 = {
  quality_burst: 'effect_burst', quality_breaking: 'effect_breaking',
  quality_persistent: 'effect_persistent', quality_piercing_x: 'effect_piercing_x',
  quality_radioactive: 'effect_radioactive', quality_spread: 'effect_spread',
  quality_stun: 'effect_stun', quality_vicious: 'effect_vicious',
  quality_freeze: 'effect_freeze', quality_arc: 'effect_arc',
  quality_supressed: 'quality_suppressed',
};
const _BARE_TO_EFFECT = {
  burst: 'effect_burst', piercing: 'effect_piercing_x', persistent: 'effect_persistent',
  spread: 'effect_spread', vicious: 'effect_vicious', stun: 'effect_stun',
  radioactive: 'effect_radioactive', breaking: 'effect_breaking', arc: 'effect_arc',
  freeze: 'effect_freeze',
};
const _isEffectId = (id) => String(id).startsWith('effect_');
const _remapIdV0V1 = (old) => (old === 'quality_silent' ? 'quality_suppressed' : (_ID_RENAME_V0V1[old] || old));

const _migrateEquippedEntryV0V1 = (entry) => {
  if (!entry || typeof entry !== 'object') return entry;
  const effectsMap = new Map();
  (entry.effects || []).forEach((e) => {
    const id = (e && e.effectId) || e;
    if (id) effectsMap.set(id, e && e.value != null ? { effectId: id, value: e.value } : { effectId: id });
  });
  const qualities = [];
  (entry.qualities || []).forEach((q) => {
    const oldId = (q && q.qualityId) || q;
    const id = _remapIdV0V1(oldId);
    if (_isEffectId(id)) effectsMap.set(id, q && q.value != null ? { effectId: id, value: q.value } : { effectId: id });
    else if (id) qualities.push(q && q.value != null ? { qualityId: id, value: q.value } : { qualityId: id });
  });
  (entry.damageEffects || []).forEach((name) => {
    const id = _BARE_TO_EFFECT[name] || name;
    if (id) effectsMap.set(id, { effectId: id });
  });
  const out = { ...entry };
  out.effects = [...effectsMap.values()];
  out.qualities = qualities;
  delete out.damageEffects;
  delete out.damage_effects;
  return out;
};

export const migrateLegacyWeaponEffectIdsV0V1 = (state) => {
  const next = { ...state };
  if (Array.isArray(next.equippedWeapons)) {
    next.equippedWeapons = next.equippedWeapons.map(_migrateEquippedEntryV0V1);
  }
  return next;
};

/** v1 -> v2: seed the tagged-skill reward journal for existing saves. */
export const migrateTaggedSkillRewardJournalV1V2 = (state) => {
  const next = { ...state };
  if (!Array.isArray(next.rewardedSkills)) {
    next.rewardedSkills = next.skillsSaved
      ? [...new Set([...(next.selectedSkills || []), ...(next.extraTaggedSkills || [])])]
      : [];
  }
  return next;
};

/** v2 -> v3: keep the last saved quality in each Fallout opposite pair. */
export const migrateConflictingWeaponQualitiesV2V3 = (state) => {
  const normalizeWeapon = (item) => {
    if (!item || typeof item !== 'object') return item;
    const raw = item.qualities;
    if (Array.isArray(raw)) return { ...item, qualities: resolveMutuallyExclusiveQualities(raw) };
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return { ...item, qualities: JSON.stringify(resolveMutuallyExclusiveQualities(parsed)) };
        }
      } catch (_) {}
    }
    return item;
  };
  return {
    ...state,
    equipment: state.equipment
      ? { ...state.equipment, items: (state.equipment.items || []).map(normalizeWeapon) }
      : state.equipment,
    equippedWeapons: Array.isArray(state.equippedWeapons)
      ? state.equippedWeapons.map(normalizeWeapon)
      : state.equippedWeapons,
  };
};

const PERK_ID_REMAP_V18 = {
  triggerRush: 'scrounger',
  slacker: 'dodger',
  bullRush: 'painTrain',
};

// v5 -> v6: ориджин «savage» переименован в «tribal» (каноническое англ.
// название — Tribal; savage был заглушкой). Старые сейвы с origin.id
// 'savage' переводятся на 'tribal', иначе персонаж потеряет ориджин.
export const migrateSavageOriginV5V6 = (state) => {
  const next = { ...state };
  const origin = next.origin;
  if (!origin) return next;
  const originId = typeof origin === 'string' ? origin : origin?.id;
  if (originId === 'savage') {
    next.origin = typeof origin === 'string'
      ? 'tribal'
      : { ...origin, id: 'tribal' };
  }
  return next;
};

// v6 -> v7: «Опасная бритва» — вариант выкидного ножа (trueItemId +
// replaceOriginalNameTo): для программы это нож (истинный id), стек
// разделяется именем (baseName). Старые сейвы (патч 63) хранили бритву
// отдельным предметом weapon_straight_razor — переводим на истинный id
// и пересобираем id/stackKey по правилу «id + моды + имя».
export const migrateStraightRazorV6V7 = (state) => {
  const next = { ...state };
  const collections = [];
  if (Array.isArray(next.equipment?.items)) collections.push(next.equipment.items);
  if (Array.isArray(next.equippedWeapons)) collections.push(next.equippedWeapons);
  if (collections.length === 0) return state;

  // Отрезаем префиксы установленных модов от сохранённого имени:
  // «Зазубренное лезвие Опасная бритва» → «Опасная бритва».
  const stripModPrefixes = (name, appliedMods) => {
    if (!name) return name;
    let out = String(name);
    for (const modId of Object.values(appliedMods || {})) {
      const mod = catalogGetWeaponModById(modId);
      const prefix = mod?.prefix;
      if (prefix && out.startsWith(`${prefix} `)) out = out.slice(prefix.length + 1);
    }
    return out.trim();
  };

  let changed = false;
  for (const collection of collections) {
    for (let i = 0; i < collection.length; i += 1) {
      const item = collection[i];
      if (!item || item.weaponId !== 'weapon_straight_razor') continue;
      changed = true;
      const baseName = stripModPrefixes(item.name, item.appliedMods) || '';
      const rewritten = {
        ...item,
        weaponId: 'weapon_switchblade',
        ...(baseName ? { baseName } : {}),
      };
      const newId = generateItemId(rewritten.weaponId, rewritten.appliedMods || {}, rewritten.baseName || '');
      collection[i] = { ...rewritten, id: newId, stackKey: newId };
    }
  }
  return changed ? next : state;
};

// v7 -> v8: качество «Элегантная» у формальной одежды/шляпы Председателей
// (патч 67). Старые сейвы (комплект с патча 63) хранят одежду без качества —
// если персонаж из семьи Председателей, одежда/шляпа получают
// uniqQualities ['elegant'], пересобираются id/stackKey (учитывают качество)
// и имя («Элегантная Формальная одежда»).
export const migrateChairmenClothingV7V8 = (state) => {
  const next = { ...state };
  const trait = next.trait;
  const isChairmen = Boolean(
    trait
    && (trait.id === 'treefamilies-chairmen'
      || (Array.isArray(trait.ids) && trait.ids.includes('treefamilies-chairmen'))),
  );
  if (!isChairmen) return state;
  const collections = [];
  if (Array.isArray(next.equipment?.items)) collections.push(next.equipment.items);
  if (Array.isArray(next.equippedWeapons)) collections.push(next.equippedWeapons);
  if (collections.length === 0) return state;

  const ELEGANT_CLOTHING_IDS = new Set(['clothing_fancy_clothes', 'headwear_fancy_hat']);
  const qualityName = getUniqQualityName('elegant');
  let changed = false;
  for (const collection of collections) {
    for (let i = 0; i < collection.length; i += 1) {
      const item = collection[i];
      if (!item) continue;
      const baseId = item.weaponId || item.id || item.clothingId || item.itemId;
      if (!ELEGANT_CLOTHING_IDS.has(baseId)) continue;
      if (Array.isArray(item.uniqQualities) && item.uniqQualities.includes('elegant')) continue;
      changed = true;
      // Имя уже начинается с качества (было выдано после 67, но поле
      // потеряно) — не дублируем; иначе собираем «Элегантная» + имя.
      const name = qualityName && item.name && item.name.startsWith(`${qualityName} `)
        ? item.name
        : composeFalloutNameWithQualities(item.name || baseId, ['elegant'], getUniqQualityName);
      const newId = generateItemId(baseId, {}, undefined, undefined, ['elegant']);
      collection[i] = {
        ...item,
        uniqQualities: ['elegant'],
        name: name || item.name,
        id: newId,
        stackKey: newId,
      };
    }
  }
  return changed ? next : state;
};

// v17 -> v18: канонические id перков. triggerRush был смесью Халявщика и
// Ган-фу; в RU это Халявщик → scrounger. slacker → dodger, bullRush → painTrain.
export const migrateLegacyPerkIdsV17V18 = (state) => {
  if (!Array.isArray(state.selectedPerks)) return state;
  const remapped = state.selectedPerks.map((selected) => {
    if (!selected || typeof selected !== 'object') return selected;
    const id = selected.id || selected.perkId;
    const nextId = PERK_ID_REMAP_V18[id];
    if (!nextId) return selected;
    return { ...selected, id: nextId };
  });
  const { selectedPerks, removed } = trimSelectedPerksToMaxRanks(remapped, getPerks());
  if (removed.length === 0) {
    return { ...state, selectedPerks };
  }
  return {
    ...state,
    selectedPerks,
    pendingPerkDuplicateNotice: true,
  };
};

// v25 -> v26: патч 333 — из общих модов брони/одежды убраны три
// «материала»-дубля модов синтов (mod_std_laminate, mod_std_rubberized,
// mod_std_microcarbon; слово владельца: «Ламинированная, Прорезиненная,
// Микроуглеродистая, Нановолоконная — это уникальные моды брони синтов»).
// Ссылки на них в сейве аккуратно снимаются: appliedArmorModId,
// appliedClothingModId и встроенный appliedArmorMod старого формата.
// Остальные моды (включая все uniq_synth_*) не трогаются.
export const migrateRemovedSynthModsV25V26 = (state) => {
  const REMOVED = new Set([
    'mod_std_laminate',
    'mod_std_rubberized',
    'mod_std_microcarbon',
  ]);
  const strip = (item) => {
    if (!item || typeof item !== 'object') return item;
    const stdHit = REMOVED.has(item.appliedArmorModId)
      || REMOVED.has(item.appliedClothingModId)
      || REMOVED.has(item.appliedArmorMod?.id);
    if (!stdHit) return item;
    const next = { ...item };
    delete next.appliedArmorModId;
    delete next.appliedClothingModId;
    delete next.appliedArmorMod;
    return next;
  };
  const next = { ...state };
  if (Array.isArray(next.inventory)) next.inventory = next.inventory.map(strip);
  if (next.modifiedItems && typeof next.modifiedItems === 'object') {
    const cleaned = {};
    for (const [key, item] of Object.entries(next.modifiedItems)) {
      cleaned[key] = strip(item);
    }
    next.modifiedItems = cleaned;
  }
  if (next.equippedArmor) next.equippedArmor = strip(next.equippedArmor);
  return next;
};
