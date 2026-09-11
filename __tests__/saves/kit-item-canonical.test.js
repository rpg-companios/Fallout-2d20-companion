// Баг-репорт владельца (2026-09-11): «выпил 4 очищенных воды — жажда осталась».
//
// Причина: киты brotherhoodOutcast/ncr выдавали воду битой ссылкой
// { itemId: 'food_purified_water', itemType: 'food' } — предмета с таким id
// нет ни в одном каталоге (настоящая — 'drink_purified_water', тип 'drinks').
// Необогащаемый инстанс попадал в слушатель выживания веткой «еда»:
// +1 сытости, +0 воды. Фикс: (1) данные китов указывают на настоящую воду;
// (2) мост канонизации при загрузке переименовывает битые инстансы в инвентаре
// старых сейвов (по образцу моста навыков, патч 225; версия схемы не меняется).

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEGACY_KIT_ITEM_RENAMES,
  canonizeKitItemInstance,
  canonizeLoadedCharacterItems,
} from '../../domain/kitItemCanonical';
import useCharacterStore from '../../src/store/characterStore';

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('kitItemCanonical: мост канонизации предметов китов', () => {
  it('переименовывает битую воду в настоящую (id, тип)', () => {
    const canon = canonizeKitItemInstance({ id: 'food_purified_water', itemType: 'food', quantity: 3 });
    expect(canon).toEqual({ id: 'drink_purified_water', itemType: 'drinks', quantity: 3 });
  });

  it('сбрасывает stackKey фальшивки (подпись не должна клеиться с новой стопкой)', () => {
    const canon = canonizeKitItemInstance({ id: 'food_purified_water', stackKey: 'food_purified_water', quantity: 1 });
    expect(canon.stackKey).toBeUndefined();
  });

  it('чужие инстансы возвращаются как есть (тот же объект)', () => {
    const steak = { id: 'food_deathclaw_steak', itemType: 'food', quantity: 2 };
    const water = { id: 'drink_purified_water', itemType: 'drinks', quantity: 1 };
    expect(canonizeKitItemInstance(steak)).toBe(steak);
    expect(canonizeKitItemInstance(water)).toBe(water);
    expect(canonizeKitItemInstance(null)).toBeNull();
  });

  it('canonizeLoadedCharacterItems: маппит equipment.items и не мутирует аргумент', () => {
    const data = {
      equipment: { items: [
        { id: 'food_purified_water', itemType: 'food', quantity: 4 },
        { id: 'weapon_laser_musket', itemType: 'weapon' },
      ] },
      level: 2,
    };
    const out = canonizeLoadedCharacterItems(data);
    expect(out.equipment.items[0]).toEqual({ id: 'drink_purified_water', itemType: 'drinks', quantity: 4 });
    expect(out.equipment.items[1]).toBe(data.equipment.items[1]);
    expect(out.level).toBe(2);
    // аргумент не тронут
    expect(data.equipment.items[0].id).toBe('food_purified_water');
  });

  it('идемпотентен: чистый сейв возвращается той же ссылкой', () => {
    const data = { equipment: { items: [{ id: 'drink_purified_water', itemType: 'drinks', quantity: 2 }] } };
    expect(canonizeLoadedCharacterItems(data)).toBe(data);
  });

  it('без инвентаря — сейв возвращается как есть', () => {
    const data = { level: 1 };
    expect(canonizeLoadedCharacterItems(data)).toBe(data);
    expect(canonizeLoadedCharacterItems(null)).toBe(null);
  });

  it('инстанс после моста проходит normalizeItems и попадает в стор напитком', async () => {
    // Продакшн-последовательность loadCharacter: мост → normalizeForStore.
    const { normalizeForStore } = await import('../../src/store/migrations');
    const canonized = canonizeLoadedCharacterItems({
      equipment: { items: [{ id: 'food_purified_water', itemType: 'food', quantity: 4 }] },
    });
    const normalized = normalizeForStore(canonized);
    useCharacterStore.setState({ items: normalized.items });
    const item = useCharacterStore.getState().items.drink_purified_water;
    expect(item).toBeDefined();
    expect(item.itemType).toBe('drinks');
    expect(item.quantity).toBe(4);
    expect(useCharacterStore.getState().items.food_purified_water).toBeUndefined();
  });
});

describe('данные китов: вода ссылается на настоящий каталог', () => {
  const kitsDir = path.resolve(__dirname, '../../modules/fallout/data/equipmentKits');

  const kitJson = (name) => JSON.parse(
    fs.readFileSync(path.join(kitsDir, `${name}.json`), 'utf8'),
  );

  const collectFixedItems = (obj, out = []) => {
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) {
      obj.forEach((entry) => collectFixedItems(entry, out));
      return out;
    }
    if (obj.itemId) out.push(obj);
    Object.values(obj).forEach((value) => collectFixedItems(value, out));
    return out;
  };

  it('ни один кит больше не ссылается на битый food_purified_water', () => {
    const broken = [];
    for (const file of fs.readdirSync(kitsDir)) {
      if (!file.endsWith('.json')) continue;
      const kit = kitJson(file.replace('.json', ''));
      collectFixedItems(kit)
        .filter((entry) => entry.itemId === 'food_purified_water')
        .forEach((entry) => broken.push({ file, entry }));
    }
    expect(broken).toEqual([]);
  });

  it('brotherhoodOutcast и ncr выдают настоящую воду (drink_purified_water, drinks)', () => {
    const drinks = require('../../modules/fallout/data/consumables/drinks.json');
    const water = drinks.find((entry) => entry.id === 'drink_purified_water');
    expect(water).toBeDefined();
    expect(water.itemType).toBe('drinks');
    expect(water.purified).toBe(true);

    for (const name of ['brotherhoodOutcast', 'ncr']) {
      const entries = collectFixedItems(kitJson(name))
        .filter((entry) => entry.itemId === 'drink_purified_water');
      expect(entries.length).toBeGreaterThanOrEqual(1);
      for (const entry of entries) {
        expect(entry.itemType).toBe('drinks');
      }
    }
  });

  it('таблица переименований покрывает ровно битые id (санити-чек)', () => {
    expect(Object.keys(LEGACY_KIT_ITEM_RENAMES)).toEqual(['food_purified_water']);
  });
});
