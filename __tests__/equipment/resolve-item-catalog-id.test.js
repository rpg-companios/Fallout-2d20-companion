import { describe, it, expect, beforeAll } from 'vitest';

import { setCurrentLocale } from '../../i18n/locale';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { resolveItem } from '../../domain/resolveItem';

beforeAll(() => setCurrentLocale('ru-RU'));

describe('resolveItem catalog enrichment', () => {
  it('uses weaponId as the catalog id for normalized inventory weapon instances', () => {
    const catalog = getEquipmentCatalog('ru-RU');
    const resolved = resolveItem({
      id: 'weapon_10mm_pistol__instance_without_catalog_metadata',
      weaponId: 'weapon_10mm_pistol',
      itemType: 'weapon',
      quantity: 1,
      equipped: false,
    }, catalog);

    expect(resolved.weaponId).toBe('weapon_10mm_pistol');
    expect(resolved.ammoId).toBe('ammo_10mm');
    expect(resolved.name).toBeTruthy();
    expect(resolved.weight).toBeTruthy();
  });
});
