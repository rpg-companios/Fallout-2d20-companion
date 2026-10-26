// ПРИЁМОЧНЫЙ (патч 446, слово владельца 2026-10-25):
//  1) окно «Игровой сеттинг» СКРЫТО в UI (установка сеттингов — в будущее);
//  2) импорт предметов ушёл в Настройки → раздел «Собственное снаряжение»
//     (кнопка «Загрузить» принимает JSON пака контента);
//  3) паковое снаряжение — НЕ в общем списке: своя верхняя категория
//     «Самодельное снаряжение»/«Homebrew Equipment» окна добавления с
//     подразделами по аналогии родительского каталога (типы оружия, броня,
//     патроны; модов в ветке нет — закон 438);
//  4) паковые записи носят метки isPackItem/packId (src/itempack/runtime);
//  5) i18n в обеих локалях (закон: каждая видимая строка — в обеих);
//  6) ремонт-хвост main 445: отладка аватаров — через гейт falloutDebug
//     (плоских console.* нет), getFileExtension по тестовому контракту.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { setInstalledContentPacks, buildPackCatalogOverlay } from '../../src/itempack/runtime';

const PACK = {
  manifest: { packId: 'hb_test', name: 'Тез', locale: 'ru-RU' },
  names: { 'ru-RU': { hb_test_weapon_w: { name: 'Винт' }, hb_test_ammo_a: { name: 'Гвоздь' } } },
  items: {
    weapons: [{ id: 'hb_test_weapon_w', weaponType: 'Light', audience: 'all' }],
    weaponMods: [{ id: 'hb_test_mod_m', slot: 'Barrel' }],
    ammo: [{ id: 'hb_test_ammo_a' }],
  },
};

describe('патч 446: метки паковых предметов (runtime)', () => {
  it('все пулы оверлея несут isPackItem + packId', () => {
    setInstalledContentPacks([PACK]);
    const overlay = buildPackCatalogOverlay('ru-RU');
    setInstalledContentPacks([]);
    expect(overlay.weapons).toHaveLength(1);
    expect(overlay.robotWeapons).toHaveLength(1); // audience 'all' включает robot
    expect(overlay.weaponMods).toHaveLength(1);
    expect(overlay.ammoTypes).toHaveLength(1);
    for (const pool of ['weapons', 'robotWeapons', 'weaponMods', 'ammoTypes']) {
      for (const item of overlay[pool]) {
        expect(item.isPackItem, `${pool}:${item.id}`).toBe(true);
        expect(item.packId).toBe('hb_test');
      }
    }
    // патроны — тоже предметы каталога (itemType для обзорных списков)
    expect(overlay.ammoTypes[0].itemType).toBe('ammo');
  });
});

describe('патч 446: UI-проводка по исходникам (структурные защёлки)', () => {
  it('окно «Игровой сеттинг» погашено константой-выключателем', () => {
    const src = readFileSync('components/screens/HomeScreen/HomeScreen.js', 'utf8');
    expect(src).toContain('const GAME_SETTINGS_UI_ENABLED = false;');
    expect(src).toContain('погашенные места монтажа');
    // ни кнопка меню, ни маунт окна не могут показаться без выключателя
    const menuRow = /(GAME_SETTINGS_UI_ENABLED[\s\S]{0,300}menuItem)/;
    expect(src).toMatch(menuRow);
  });

  it('«Собственное снаряжение» — секция окна Настроек с кнопкой загрузки', () => {
    const src = readFileSync('components/settings/SettingsModal.js', 'utf8');
    expect(src).toContain('OwnEquipmentSection');
    expect(src).toContain("tHomeScreen('settings.ownEquipment.title')");
    expect(src).toContain("tHomeScreen('settings.ownEquipment.load')");
    expect(src).toContain('installPackText'); // тот же стор/валидация, что была
    expect(src).toContain('contentPackDelete'); // полное удаление — через диалог масштаба
  });

  it('секции паков в окне «Игровой сеттинг» больше нет', () => {
    const src = readFileSync('components/settings/GameSettingsModal.js', 'utf8');
    expect(src).not.toContain('contentPackStore');
    expect(src).not.toContain('installPackText');
  });

  it('окно добавления: самодельное отдельной категорией, общие группы без пакового', () => {
    const src = readFileSync('components/screens/InventoryScreen/modals/AddItemModal.js', 'utf8');
    expect(src).toContain("tInventory('modals.addItemModal.categories.homebrew')");
    expect(src).toContain('.filter((x) => x?.isPackItem)'); // сборка ветки
    expect(src).toContain('if (weapon?.isPackItem) continue;'); // исключение из общих групп
    expect(src).toContain('...packData,'); // ветка — в дереве категорий
    expect(src).toMatch(/homebrew: '.+'/); // иконка категории объявлена
  });
});

describe('патч 446: i18n (обе локали)', () => {
  for (const [loc, value] of [['ru-RU', 'Самодельное снаряжение'], ['en-EN', 'Homebrew Equipment']]) {
    it(`${loc}: categories.homebrew = «${value}»`, () => {
      const doc = JSON.parse(readFileSync(`i18n/${loc}/screens/inventory/modals/addItemModal.json`, 'utf8'));
      expect(doc.categories.homebrew).toBe(value);
    });
  }

  for (const loc of ['ru-RU', 'en-EN']) {
    it(`${loc}: settings.ownEquipment.* полный набор; gameSetting.contentPacks убран`, () => {
      const doc = JSON.parse(readFileSync(`i18n/${loc}/screens/home/screen.json`, 'utf8'));
      const oe = doc.settings?.ownEquipment;
      expect(oe, 'settings.ownEquipment отсутствует').toBeTruthy();
      for (const key of ['title', 'description', 'load', 'empty', 'installedOk', 'errorsTitle', 'delete']) {
        expect(typeof oe?.[key], `settings.ownEquipment.${key}`).toBe('string');
      }
      expect(doc.gameSetting?.contentPacks).toBeUndefined();
    });
  }
});

describe('патч 446: ремонт-хвост main 445 (аватары)', () => {
  it('в двух 445-файлах нет плоских console.* — только гейт', () => {
    // точечная проверка в дополнение к предохранителю console-trace
    for (const file of ['domain/useCharacterImage.js', 'modules/fallout/screens/CharacterScreen/CharacterScreen.js']) {
      const src = readFileSync(file, 'utf8');
      const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(codeOnly, file).not.toMatch(/\bconsole\s*(?:\?\.|\.)\s*(?:log|warn|error|info|debug|trace)\s*\(/);
      expect(codeOnly, file).toContain("debugLog('avatar.");
    }
  });
});
