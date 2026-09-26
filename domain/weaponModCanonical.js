// domain/weaponModCanonical.js
//
// Мост канонизации id модов оружия при загрузке сейвов (патч 375).

// Зачем: ревизия каталога (план 368, слово владельца) заменила безликие id
// `mod_NNN` на человекочитаемые канон-id (префикс `mod_` сохранён — на нём
// стоит закон префиксов предметов в store), а фантомные строки-дубли
// (95 строк → 31 улучшение) слила в одну. Старые сохранения несут прежние
// id в appliedMods (карта «слот → id») и modIds (список). Мост на загрузке
// переводит их на канон-id; повторный прогон — no-op. Схема сейва НЕ
// меняется (без подъёма версии), как для навыков (domain/skillCanonical.js).
// Робо-моды (robot_weapon_mod_*) в карту не входят и проходят насквозь.

// Карта сгенерирована патчем 375; источник истины —
// docs/reference-data/weapon-mods-id-map-375.json.

export const WEAPON_MOD_ID_MAP = Object.freeze({
  'mod_001': 'mod_rapid',
  'mod_002': 'mod_armor_piercing',
  'mod_003': 'mod_tuned',
  'mod_004': 'mod_hardened',
  'mod_005': 'mod_powerful',
  'mod_006': 'mod_advanced',
  'mod_007': 'mod_calibrated',
  'mod_008': 'mod_automatic',
  'mod_009': 'mod_hair_trigger',
  'mod_010': 'mod_38_receiver',
  'mod_011': 'mod_308_receiver',
  'mod_012': 'mod_45_receiver',
  'mod_013': 'mod_50_receiver',
  'mod_014': 'mod_automatic_piston',
  'mod_015': 'mod_snubnose',
  'mod_016': 'mod_bull_barrel',
  'mod_017': 'mod_long',
  'mod_018': 'mod_ported',
  'mod_019': 'mod_vented',
  'mod_020': 'mod_sawed_off',
  'mod_021': 'mod_shielded_barrel',
  'mod_022': 'mod_finned',
  'mod_023': 'mod_large_magazine',
  'mod_024': 'mod_quick_eject_mag',
  'mod_025': 'mod_large_quick_eject_mag',
  'mod_026': 'mod_comfort_grip',
  'mod_027': 'mod_sharpshooters_grip',
  'mod_028': 'mod_full_stock',
  'mod_029': 'mod_marksmans_stock',
  'mod_030': 'mod_recoil_compensating_stock',
  'mod_031': 'mod_full_capacitors',
  'mod_032': 'mod_capacitor_boosting_coil',
  'mod_033': 'mod_reflex_sight',
  'mod_034': 'mod_short_scope',
  'mod_035': 'mod_long_scope',
  'mod_036': 'mod_short_night_vision_scope',
  'mod_037': 'mod_long_night_vision_scope',
  'mod_038': 'mod_recon_scope',
  'mod_039': 'mod_bayonet',
  'mod_040': 'mod_compensator',
  'mod_041': 'mod_muzzle_break',
  'mod_042': 'mod_suppressor',
  'mod_043': 'mod_beta_wave_tuner',
  'mod_044': 'mod_boosted_capacitor',
  'mod_045': 'mod_photon_exciter',
  'mod_046': 'mod_photon_agitator',
  'mod_047': 'mod_three_crank_capacitor',
  'mod_048': 'mod_four_crank_capacitor',
  'mod_049': 'mod_five_crank_capacitor',
  'mod_050': 'mod_six_crank_capacitor',
  'mod_051': 'mod_long_barrel',
  'mod_052': 'mod_splitter',
  'mod_053': 'mod_automatic_barrel',
  'mod_054': 'mod_improved_barrel',
  'mod_055': 'mod_sniper_barrel',
  'mod_056': 'mod_flamer_barrel',
  'mod_057': 'mod_sharpshooters_grip',
  'mod_058': 'mod_standard_stock',
  'mod_059': 'mod_full_stock',
  'mod_060': 'mod_marksmans_stock',
  'mod_061': 'mod_recoil_compensating',
  'mod_062': 'mod_reflex_sight',
  'mod_063': 'mod_short_scope',
  'mod_064': 'mod_long_scope',
  'mod_065': 'mod_short_night_vision_scope',
  'mod_066': 'mod_long_night_vision_scope',
  'mod_067': 'mod_recon_scope',
  'mod_068': 'mod_beam_splitter',
  'mod_069': 'mod_beam_focuser_institute_laser',
  'mod_070': 'mod_gyro_compensating_lens',
  'mod_071': 'mod_deep_dish',
  'mod_072': 'mod_electric_signal_carrier_antennae',
  'mod_073': 'mod_signal_repeater',
  'mod_074': 'mod_napalm_fuel',
  'mod_075': 'mod_long_barrel',
  'mod_076': 'mod_large_tank',
  'mod_077': 'mod_huge_tank',
  'mod_078': 'mod_compression_nozzle',
  'mod_079': 'mod_vaporization_nozzle',
  'mod_080': 'mod_photon_exciter',
  'mod_081': 'mod_beta_wave_tuner',
  'mod_082': 'mod_boosted_capacitor',
  'mod_083': 'mod_photon_agitator',
  'mod_084': 'mod_charging_barrels',
  'mod_085': 'mod_reflex_sight',
  'mod_086': 'mod_beam_focuser_minigun',
  'mod_087': 'mod_long_barrel',
  'mod_088': 'mod_recoil_compensating_stock',
  'mod_089': 'mod_gunner_sight',
  'mod_090': 'mod_electrification_module',
  'mod_091': 'mod_ignition_module',
  'mod_092': 'mod_accelerated_barrel',
  'mod_093': 'mod_tri_barrel',
  'mod_094': 'mod_gunner_sight',
  'mod_095': 'mod_shredder',
  'mod_096': 'mod_triple_barrel',
  'mod_097': 'mod_quad_barrel',
  'mod_098': 'mod_scope',
  'mod_099': 'mod_night_vision_scope',
  'mod_100': 'mod_targeting_computer',
  'mod_101': 'mod_bayonet',
  'mod_102': 'mod_stabilizer',
  'mod_103': 'mod_serrated_blade',
  'mod_104': 'mod_electrified_blade',
  'mod_105': 'mod_electrified_serrated_blade',
  'mod_106': 'mod_stun_pack',
  'mod_107': 'mod_serrated_blade',
  'mod_108': 'mod_stealth_blade',
  'mod_109': 'mod_serrated_blade',
  'mod_110': 'mod_curved_blade',
  'mod_111': 'mod_extended_blade',
  'mod_112': 'mod_extra_flame_jets',
  'mod_113': 'mod_serrated_blade',
  'mod_114': 'mod_barbed',
  'mod_115': 'mod_spiked',
  'mod_116': 'mod_sharp',
  'mod_117': 'mod_chain_wrapped',
  'mod_118': 'mod_bladed',
  'mod_119': 'mod_spiked',
  'mod_120': 'mod_puncturing',
  'mod_121': 'mod_bladed',
  'mod_122': 'mod_spiked',
  'mod_123': 'mod_heavy',
  'mod_124': 'mod_hooked',
  'mod_125': 'mod_heavy',
  'mod_126': 'mod_puncturing',
  'mod_127': 'mod_extra_heavy',
  'mod_128': 'mod_barbed',
  'mod_129': 'mod_sharp',
  'mod_130': 'mod_spiked',
  'mod_131': 'mod_sharp',
  'mod_132': 'mod_electrified',
  'mod_133': 'mod_stun_pack',
  'mod_134': 'mod_puncturing',
  'mod_135': 'mod_heavy',
  'mod_136': 'mod_heating_coil',
  'mod_137': 'mod_stun_pack',
  'mod_138': 'mod_bladed',
  'mod_139': 'mod_barbed',
  'mod_140': 'mod_spiked',
  'mod_141': 'mod_spiked',
  'mod_142': 'mod_puncturing',
  'mod_143': 'mod_lead_lining',
  'mod_144': 'mod_extra_claw',
  'mod_145': 'mod_sharp',
  'mod_146': 'mod_spiked',
  'mod_147': 'mod_puncturing',
  'mod_148': 'mod_bladed',
  'mod_149': 'mod_puncturing',
  'mod_150': 'mod_heating_coil',
  'mod_151': 'mod_long_barrel',
  'mod_152': 'mod_recoil_compensating_stock',
  'mod_153': 'mod_gunner_sight',
  'mod_154': 'mod_electrification_module',
  'mod_155': 'mod_ignition_module',
  'mod_156': 'mod_long_barrel',
  'mod_157': 'mod_full_stock',
  'mod_158': 'mod_caustic',
  'mod_159': 'mod_large_ampoule',
  'mod_160': 'mod_large_vial',
  'mod_161': 'mod_fusion_mag',
  'mod_162': 'mod_capacitor_mk_iii',
  'mod_163': 'mod_capacitor_mk_iv',
  'mod_164': 'mod_capacitor_mk_v',
  'mod_165': 'mod_capacitor_mk_vi',
  'mod_166': 'mod_long_barrel',
  'mod_167': 'mod_light_barrel',
  'mod_168': 'mod_multi_shot_canister',
  'mod_169': 'mod_m79_launcher',
  'mod_170': 'mod_crystallizing_barrel',
  'mod_171': 'mod_fusion_mag',
  'mod_172': 'mod_recoil_compensating_stock',
  'mod_173': 'mod_reflex_tactical',
  'mod_174': 'mod_barbed_harpoon',
  'mod_175': 'mod_flechette_darts',
  'mod_176': 'mod_recoil_compensating_stock',
  'mod_177': 'mod_gunner_sight',
  'mod_178': 'mod_short_scope',
  'mod_179': 'mod_armor_piercing_receiver',
  'mod_180': 'mod_armor_piercing_automatic',
  'mod_181': 'mod_hardened_automatic',
  'mod_182': 'mod_rapid_automatic',
  'mod_183': 'mod_calibrated_powerful',
  'mod_184': 'mod_powerful_automatic',
  'mod_185': 'mod_hardened_piercing_auto',
  'mod_186': 'mod_9mm_receiver',
  'mod_187': 'mod_357_receiver',
  'mod_188': 'mod_heavy_barrel',
  'mod_189': 'mod_heavy_barrel',
  'mod_190': 'mod_long_barrel',
  'mod_191': 'mod_25mm_receiver',
  'mod_192': 'mod_speedy_receiver',
  'mod_193': 'mod_long_barrel',
  'mod_194': 'mod_comfort_grip',
  'mod_195': 'mod_extra_large_magazine',
  'mod_196': 'mod_front_sight_ring',
  'mod_197': 'mod_large_bayonet',
  'mod_198': 'mod_block_frame',
  'mod_199': 'mod_iron_sight',
  'mod_200': 'mod_illuminated_sight',
  'mod_201': 'mod_protected_winch',
  'mod_202': 'mod_reinforced_winch',
  'mod_203': 'mod_aerodynamic_barrel',
  'mod_204': 'mod_long_barrel',
  'mod_205': 'mod_incendiary_barrel',
});
const remapModId = (id) => WEAPON_MOD_ID_MAP[id] || id;

const remapModsContainer = (value) => {
  if (Array.isArray(value)) {
    return value.map((id) => (typeof id === 'string' ? remapModId(id) : id));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [slot, id] of Object.entries(value)) {
      out[slot] = typeof id === 'string' ? remapModId(id) : id;
    }
    return out;
  }
  return value;
};

/**
 * Переводит id модов оружия в сохранении на канонические.
 * Рекурсивный обход: предметы инвентаря, надетое оружие, слоты роботов —
 * контейнеры модов встречаются в любой ветке состояния. Идемпотентно:
 * канон-id отсутствуют в карте и не меняются.
 */
export function migrateWeaponModIdsToCanonical(state) {
  if (!state || typeof state !== 'object') return state;

  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const v = node[i];
        if (v && typeof v === 'object') walk(v);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    if ('appliedMods' in node) node.appliedMods = remapModsContainer(node.appliedMods);
    if ('modIds' in node) node.modIds = remapModsContainer(node.modIds);
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v);
    }
  };

  walk(state);
  return state;
}

/**
 * Ремонт сейвов, пострадавших от бага 380 (жалоба владельца: «моды не
 * ставятся в карточку оружия»). До фикса экран искал предмет-носитель по
 * uniqueId/id, а локализованная карточка несёт ключ в instanceId; фолбэк
 * «первый надетый предмет» отдавал броню — мод писался не в оружие:
 *   1) на предмете-НЕоружии появлялся посторонний appliedMods (для брони
 *      поле инертно — статы брони НЕ страдали);
 *   2) мод-предмет флагался equipped+installedOn на эту броню и пропадал
 *      из сумки, а оружие оставалось без мода.
 * Мост (при загрузке, без подъёма версии схемы, идемпотентно):
 *   1) appliedMods снимается с предметов, которые не оружие и не мод
 *      (оружие = есть weaponId вне каталога модов; мод = weaponId из
 *      каталога оружейных модов);
 *   2) флаг мод-предмета осиротён (носитель исчез, не оружие, или его
 *      appliedMods не ссылается на мод) → штатное «uninstall»
 *      (equipped:false, installedOn удалён) — мод снова виден в сумке
 *      и ставится заново уже исправленным экраном. Робо-привязки
 *      (installedOn с префиксом «robotSlot:») не трогаем — их носитель
 *      синтетический. Моды, попавшие до бага на ДРУГОЕ оружие, не
 *      отличимы от намеренных — не трогаем.
 *
 * @param {object} state — загруженное состояние персонажа
 * @param {Set<string>} weaponModIds — id оружейных модов каталога
 * @returns {object} то же состояние (items заменяется при ремонте)
 */
export function repairMisroutedWeaponMods(state, weaponModIds) {
  if (!state || typeof state !== 'object') return state;
  const items = state.items;
  if (!items || typeof items !== 'object') return state;

  const isKnownMod = (id) => Boolean(id && weaponModIds && weaponModIds.has(id));
  const isWeaponItem = (item) => Boolean(item.weaponId) && !isKnownMod(item.weaponId);
  const isModItem = (item) => isKnownMod(item.weaponId);

  let changed = false;
  const next = {};
  for (const [key, raw] of Object.entries(items)) {
    let item = raw;
    if (item && typeof item === 'object') {
      // 1) посторонний appliedMods на не-оружии/не-моде (броня, одежда…)
      if (
        item.appliedMods && typeof item.appliedMods === 'object'
        && !isWeaponItem(item) && !isModItem(item)
        && Object.keys(item.appliedMods).length > 0
      ) {
        item = { ...item };
        delete item.appliedMods;
        changed = true;
      }
      // 2) осиротевший флаг мод-предмета → возврат мода в сумку
      if (
        isModItem(item) && item.equipped && item.installedOn
        && !String(item.installedOn).startsWith('robotSlot:')
      ) {
        const host = items[item.installedOn];
        const hostIsWeapon = Boolean(host && isWeaponItem(host));
        const hostReferences = hostIsWeapon
          && host.appliedMods && typeof host.appliedMods === 'object'
          && Object.values(host.appliedMods).includes(item.weaponId);
        if (!hostIsWeapon || !hostReferences) {
          item = { ...item, equipped: false };
          delete item.installedOn;
          changed = true;
        }
      }
    }
    next[key] = item;
  }
  if (changed) state.items = next;
  return state;
}
