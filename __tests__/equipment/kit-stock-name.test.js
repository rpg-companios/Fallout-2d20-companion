import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../../db/Database', async () => {
  const catalog = await import('../../db/catalogSource');
  return {
    getWeaponById: async (id) => catalog.catalogGetWeaponById(id),
    getWeaponModById: async (id) => catalog.catalogGetWeaponModById(id),
    getAmmoById: async (id) => catalog.catalogGetAmmoById(id),
    getItemByName: async () => null,
  };
});

import { setCurrentLocale, setCurrentModuleLocale } from '../../i18n/locale';
import { resolveKitItems } from '../../domain/kitResolver';

beforeAll(() => {
  setCurrentLocale('ru-RU');
  setCurrentModuleLocale('ru-RU');
});

describe('resolveKitItems — ложа превращает пистолет в винтовку', () => {
  it('лазерный пистолет со стандартной ложей называется «Лазерная винтовка»', async () => {
    const kit = {
      id: 't',
      items: [
        { type: 'fixed', weaponId: 'weapon_laser_gun', itemType: 'weapon', modIds: ['mod_058'] },
      ],
    };
    const resolved = await resolveKitItems(kit);
    const pistol = resolved.items.find((i) => i.weaponId === 'weapon_laser_gun');
    expect(pistol.name).toContain('Лазерная винтовка');
    expect(pistol.name).not.toContain('Лазерный пистолет');
  });

  it('длинный ствол добавляет префикс, а ложа меняет имя → «Длинноствольная Лазерная винтовка»', async () => {
    const kit = {
      id: 't',
      items: [
        { type: 'fixed', weaponId: 'weapon_laser_gun', itemType: 'weapon', modIds: ['mod_058', 'mod_204'] },
      ],
    };
    const resolved = await resolveKitItems(kit);
    const pistol = resolved.items.find((i) => i.weaponId === 'weapon_laser_gun');
    expect(pistol.name).toMatch(/Длинноствольн/);
    expect(pistol.name).toContain('Лазерная винтовка');
  });

  it('без ложи имя остаётся пистолетом (префикс ствола может быть, но имя пистолета)', async () => {
    const kit = {
      id: 't',
      items: [
        { type: 'fixed', weaponId: 'weapon_laser_gun', itemType: 'weapon' },
      ],
    };
    const resolved = await resolveKitItems(kit);
    const pistol = resolved.items.find((i) => i.weaponId === 'weapon_laser_gun');
    expect(pistol.name).toContain('Лазерный пистолет');
  });
});
