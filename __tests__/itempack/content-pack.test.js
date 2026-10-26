// __tests__/itempack/content-pack.test.js
// Прототип P (2026-10-19): контракт «пак контента», валидатор, оверлей
// каталога, аудитория, каскад удаления — по gm-образцу фикстуры держим
// рядом с тестами. Справочники — реальные данные сеттинга (refsFallout),
// чтобы тест ломался, если сеттинг уйдёт из-под контракта.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// db/Database тянет react-native (Platform) — в тестах БД подменена:
// сам каскад проверяется через __setPackDbForTests, эти заглушки закрывают
// только импорт модулей.
vi.mock('../../db/Database', () => ({
  getCharactersList: async () => [],
  loadCharacterById: async () => null,
  updateCharacterSaveData: async () => {},
}));

import { setCurrentModuleLocale } from '../../i18n/locale';
import { validateContentPack } from '../../src/itempack/validate';
import { buildFalloutRefs } from '../../src/itempack/refsFallout';
import {
  setInstalledContentPacks,
  buildPackCatalogOverlay,
  getInstalledContentPacks,
} from '../../src/itempack/runtime';
import {
  catalogGetWeaponById,
  catalogGetSlotsForWeapon,
  catalogGetModsForWeaponSlot,
  catalogGetAmmoById,
  invalidateCatalogCache,
} from '../../db/catalogSource';
import { stripPackFromSaveData } from '../../domain/packItems';
import { classifyItemAccess, ACTIONS } from '../../domain/itemfitRules';
import useContentPackStore, { __setPackDbForTests } from '../../src/store/contentPackStore';

const refs = buildFalloutRefs();

/** Золотой валидный пак: оружие + свой мод + свои патроны + ванильные ссылки. */
const goldenPack = () => ({
  itemPackFormat: 1,
  manifest: {
    packId: 'test_pack',
    name: 'Тестовый арсенал',
    author: 'Test',
    locale: 'ru-RU',
    version: 1,
  },
  names: {
    'ru-RU': {
      hb_test_pack_ammo_nail: { name: 'Гвоздь специальный', description: 'Самодельный гвоздь.' },
      hb_test_pack_weapon_nailgun: { name: 'Гвоздомёт', description: 'Стреляет гвоздями.' },
      hb_test_pack_mod_nail_drum: { name: 'Барабан гвоздей', description: 'Больше гвоздей.' },
    },
  },
  items: {
    ammo: [{ id: 'hb_test_pack_ammo_nail', rarity: 1, cost: 1, weight: 0.01 }],
    weapons: [{
      id: 'hb_test_pack_weapon_nailgun',
      weaponType: 'Light',
      damage: 5,
      damageType: ['physical'],
      fireRate: 2,
      range: 'C',
      ammoId: 'hb_test_pack_ammo_nail',
      mainAttr: 'AGI',
      mainSkill: 'SMALL_GUNS',
      weight: 3,
      cost: 120,
      rarity: 1,
      qualities: [{ qualityId: 'quality_accurate' }],
      effects: [{ effectId: 'effect_vicious' }],
      audience: ['human', 'mutant'],
      modSlots: { Barrel: ['mod_long_barrel', 'hb_test_pack_mod_nail_drum'] },
    }],
    weaponMods: [{
      id: 'hb_test_pack_mod_nail_drum',
      modType: 'weapon',
      slot: 'Barrel',
      cost: 45,
      weight: 1,
      applies_to_ids: ['hb_test_pack_weapon_nailgun'],
      damageModifier: { op: '+', value: 1 },
      qualityChanges: [{ op: 'gain', id: 'quality_blast' }],
      effectChanges: [{ op: 'lose', id: 'effect_stun' }],
    }],
  },
});

const robotPack = () => ({
  itemPackFormat: 1,
  manifest: { packId: 'robot_pack', name: 'Робо-набор', locale: 'en-EN', version: 1 },
  names: {
    'en-EN': {
      hb_robot_pack_weapon_zap: { name: 'Indentured Zapper' },
    },
  },
  items: {
    weapons: [{
      id: 'hb_robot_pack_weapon_zap',
      weaponType: 'Energy',
      damage: 7,
      damageType: 'energy',
      fireRate: 1,
      range: 'M',
      ammoId: null,
      mainAttr: 'PER',
      mainSkill: 'ENERGY_WEAPONS',
      weight: 4,
      cost: 500,
      rarity: 2,
      audience: 'robot',
    }],
  },
});

beforeEach(() => {
  setCurrentModuleLocale('ru-RU'); // детерминизм имён каталога
  invalidateCatalogCache();
  setInstalledContentPacks([]);
  useContentPackStore.setState({ packs: [] });
});

afterEach(() => {
  invalidateCatalogCache();
  setInstalledContentPacks([]);
  __setPackDbForTests(null);
});

describe('Валидатор паков контента', () => {
  it('золотой пак проходит целиком', () => {
    const result = validateContentPack(goldenPack(), refs);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('робо-пак с аудиторией robot и английской локалью проходит', () => {
    const result = validateContentPack(robotPack(), refs);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('каждое нарушение — отдельной ошибкой с путём', () => {
    const bad = goldenPack();
    bad.items.weapons[0].id = 'weapon_nailgun'; // чужой префикс
    bad.items.weapons[0].qualities = [{ qualityId: 'quality_nope' }];
    bad.items.weapons[0].weaponType = 'Laser';
    bad.items.weapons[0].audience = ['human', 'dragon'];
    delete bad.names['ru-RU'].hb_test_pack_weapon_nailgun;
    const { ok, errors } = validateContentPack(bad, refs);
    expect(ok).toBe(false);
    const byPath = Object.fromEntries(errors.map((e) => [e.path, e.message]));
    expect(byPath['items.weapons[0].id']).toMatch('hb_test_pack_');
    expect(byPath['items.weapons[0].qualities[0]']).toMatch('неизвестное качество');
    expect(byPath['items.weapons[0].weaponType']).toMatch('свои категории пока не поддержаны');
    expect(byPath['items.weapons[0].audience']).toMatch('допустимо');
    // id переименован выше — ошибка имени приходит на НОВЫЙ id:
    expect(byPath['names.ru-RU.weapon_nailgun']).toMatch('нет имени');
  });

  it('резерв будущих версий отклоняется явно', () => {
    const future = goldenPack();
    future.influences = [];
    const { ok, errors } = validateContentPack(future, refs);
    expect(ok).toBe(false);
    expect(errors.find((e) => e.path === 'influences')?.message).toMatch('зарезервировано');
  });

  it('× и ÷ в опции мода отклоняются (интерпретатор — позже)', () => {
    const x = goldenPack();
    x.items.weaponMods[0].damageModifier = { op: '*', value: 2 };
    const { ok, errors } = validateContentPack(x, refs);
    expect(ok).toBe(false);
    expect(errors[0].message).toMatch('интерпретатором влияний');
  });

  it('мод из чужого слота не встаёт в modSlots', () => {
    const bad = goldenPack();
    bad.items.weapons[0].modSlots = { Barrel: ['mod_reflex_sight'] }; // Sight!
    const { ok, errors } = validateContentPack(bad, refs);
    expect(ok).toBe(false);
    expect(errors[0].path).toBe('items.weapons[0].modSlots.Barrel[0]');
    expect(errors[0].message).toMatch('принадлежит слоту "Sight"');
  });

  it('свой мод обязан заявлять applies_to_ids на оружие из modSlots', () => {
    const bad = goldenPack();
    bad.items.weaponMods[0].applies_to_ids = ['weapon_44_pistol']; // не своё оружие
    const { ok, errors } = validateContentPack(bad, refs);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.message.includes('applies_to_ids'))).toBe(true);
  });

  it('пустой пак отклоняется', () => {
    const p = goldenPack();
    p.items = { weapons: [], weaponMods: [], ammo: [] };
    const { ok, errors } = validateContentPack(p, refs);
    expect(ok).toBe(false);
    expect(errors.find((e) => e.path === 'items')?.message).toMatch('пак пуст');
  });

  it('ссылка на свои патроны из того же пака — валидна', () => {
    const p = goldenPack();
    p.items.weaponMods[0].ammoOverride = 'hb_test_pack_ammo_nail';
    expect(validateContentPack(p, refs).ok).toBe(true);
  });
});

describe('Оверлей каталога (runtime)', () => {
  it('пак появляется в оверлее с именами локали', () => {
    setInstalledContentPacks([goldenPack()]);
    const overlay = buildPackCatalogOverlay('ru-RU');
    expect(overlay.weapons.map((w) => w.id)).toContain('hb_test_pack_weapon_nailgun');
    expect(overlay.weapons[0].name).toBe('Гвоздомёт');
    expect(overlay.weaponMods[0].name).toBe('Барабан гвоздей');
    expect(overlay.modsOverrides['hb_test_pack_weapon_nailgun'].Barrel).toEqual([
      'mod_long_barrel', 'hb_test_pack_mod_nail_drum',
    ]);
  });

  it('без перевода на текущую локаль показывается id, не заглушка', () => {
    setInstalledContentPacks([goldenPack()]);
    const overlay = buildPackCatalogOverlay('en-EN');
    expect(overlay.weapons[0].name).toBe('hb_test_pack_weapon_nailgun');
  });

  it('аудитория robot отправляет запись в робо-список с флагом', () => {
    setInstalledContentPacks([robotPack()]);
    const overlay = buildPackCatalogOverlay('ru-RU');
    expect(overlay.weapons).toHaveLength(0);
    expect(overlay.robotWeapons).toHaveLength(1);
    expect(overlay.robotWeapons[0].isRobotWeapon).toBe(true);
    expect(overlay.robotWeapons[0].name).toBe('hb_robot_pack_weapon_zap'); // локаль пака en, а спрашиваем ru
  });
});

describe('Сквозная доступность через catalogSource', () => {
  it('оружие пака читается по id, как ванильное', () => {
    setInstalledContentPacks([goldenPack()]);
    invalidateCatalogCache();
    const row = catalogGetWeaponById('hb_test_pack_weapon_nailgun');
    expect(row).toBeTruthy();
    expect(row.weaponType).toBe('Light');
    expect(row.damage).toBe(5);
  });

  it('слот и моды собственного оружия видны в окне модификации', () => {
    setInstalledContentPacks([goldenPack()]);
    invalidateCatalogCache();
    expect(catalogGetSlotsForWeapon('hb_test_pack_weapon_nailgun')).toEqual(['Barrel']);
    const mods = catalogGetModsForWeaponSlot('hb_test_pack_weapon_nailgun', 'Barrel');
    expect(mods.map((m) => m.id)).toEqual(expect.arrayContaining(['mod_long_barrel', 'hb_test_pack_mod_nail_drum']));
  });

  it('свои патроны читаются из каталога', () => {
    setInstalledContentPacks([goldenPack()]);
    invalidateCatalogCache();
    expect(catalogGetAmmoById('hb_test_pack_ammo_nail')?.name).toBe('Гвоздь специальный');
  });
});

describe('Аудитория в правилах экипировки (itemfit)', () => {
  const charOf = (characterType) => ({ origin: { characterType } });
  const weaponOf = (audience) => ({ id: 'hb_test_pack_weapon_x', itemType: 'weapon', audience });

  it('робо-оружие человеку отказано слоем audience', () => {
    const result = classifyItemAccess(weaponOf('robot'), ACTIONS.EQUIP, charOf('human'));
    expect(result).toEqual({ status: 'denied', layer: 'audience' });
  });

  it('робо-оружие роботу разрешено', () => {
    const result = classifyItemAccess(weaponOf('robot'), ACTIONS.EQUIP, charOf('robot'));
    expect(result.status).toBe('allowed');
  });

  it('аудитория human покрывает ghoul и cyborg (человеческое тело)', () => {
    expect(classifyItemAccess(weaponOf(['human']), ACTIONS.EQUIP, charOf('ghoul')).status).toBe('allowed');
    expect(classifyItemAccess(weaponOf(['human']), ACTIONS.EQUIP, charOf('cyborg')).status).toBe('allowed');
    expect(classifyItemAccess(weaponOf(['human']), ACTIONS.EQUIP, charOf('mutant'))).toEqual({ status: 'denied', layer: 'audience' });
  });

  it('без аудитории поведение не меняется', () => {
    const plain = { id: 'weapon_44_pistol', itemType: 'weapon' };
    expect(classifyItemAccess(plain, ACTIONS.EQUIP, charOf('human')).status).toBe('allowed');
  });
});

describe('Полное удаление пака (каскад по сейвам)', () => {
  const saveFixture = () => ({
    character: { name: 'Дуайт' },
    inventory: [
      { id: 'hb_test_pack_weapon_nailgun', count: 1, mods: ['hb_test_pack_mod_nail_drum', 'mod_long_barrel'] },
      { id: 'weapon_44_pistol', count: 1 },
      // ванильный ствол с НАШИМ модом — ствол остаётся, мод исчезает:
      { id: 'weapon_10mm_pistol', count: 1, mods: ['hb_test_pack_mod_nail_drum'] },
    ],
    equipped: {
      hands: { id: 'hb_test_pack_weapon_nailgun' },
    },
    ammo: { hb_test_pack_ammo_nail: 12, ammo_44_magnum: 6 },
  });

  it('вырезает предметы и их моды со строковыми id, ванильные с нашими модами — только моды', () => {
    const original = saveFixture();
    const { data, removed } = stripPackFromSaveData(original, 'test_pack');
    // предмет пака (весь, со своими модами) + надетый экземпляр + мод на ванильном стволе:
    expect(removed).toBe(3);
    expect(data.inventory).toEqual([
      { id: 'weapon_44_pistol', count: 1 },
      { id: 'weapon_10mm_pistol', count: 1, mods: [] },
    ]);
    expect(data.equipped).toEqual({});
    // исходник не тронут (чистая копия)
    expect(original.inventory).toHaveLength(3);
  });

  it('строковый id словарем (карман боеприпасов) остаётся — вырезаем только массивы', () => {
    const { data } = stripPackFromSaveData(saveFixture(), 'test_pack');
    // осознанное решение v1: статистика-карман {id: count} не является
    // списком предметов; объектные ключи не режем (иначе словари данных).
    expect(data.ammo.hb_test_pack_ammo_nail).toBe(12);
  });
});

describe('Стор паков контента', () => {
  it('установка из текста: валидный пак записывается и синхронизирует рантайм', async () => {
    const result = useContentPackStore.getState().installPackText(JSON.stringify(goldenPack()));
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ weapons: 1, weaponMods: 1, ammo: 1 });
    expect(getInstalledContentPacks()).toHaveLength(1);
    invalidateCatalogCache();
    expect(catalogGetWeaponById('hb_test_pack_weapon_nailgun')).toBeTruthy();
  });

  it('невалидный JSON сообщает ошибку, реестр не трогает', () => {
    const result = useContentPackStore.getState().installPackText('{broken');
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toMatch('не JSON');
    expect(useContentPackStore.getState().packs).toHaveLength(0);
  });

  it('повторная установка того же paki замещает, а не множит', () => {
    const text = JSON.stringify(goldenPack());
    useContentPackStore.getState().installPackText(text);
    useContentPackStore.getState().installPackText(text);
    expect(useContentPackStore.getState().packs).toHaveLength(1);
  });

  it('удаление: каскад по сейвам + исчезновение из реестра и каталога', async () => {
    const updatedSaves = [];
    __setPackDbForTests({
      list: async () => [{ id: 'c1' }, { id: 'c2' }],
      load: async (id) => (id === 'c1'
        ? { data: { inventory: [{ id: 'hb_test_pack_weapon_nailgun' }] } }
        : { data: { inventory: [{ id: 'weapon_44_pistol' }] } }),
      update: async (id, data) => { updatedSaves.push([id, data]); },
    });

    const state = useContentPackStore.getState();
    state.installPackText(JSON.stringify(goldenPack()));
    expect(await state.countPackUsage('test_pack')).toBe(1);

    const removed = await state.deletePack('test_pack');
    expect(removed).toBe(1);
    expect(updatedSaves).toHaveLength(1);
    expect(updatedSaves[0][0]).toBe('c1');
    expect(updatedSaves[0][1].inventory).toEqual([]);

    expect(useContentPackStore.getState().packs).toHaveLength(0);
    expect(getInstalledContentPacks()).toHaveLength(0);
    invalidateCatalogCache();
    expect(catalogGetWeaponById('hb_test_pack_weapon_nailgun')).toBeNull();
  });
});
