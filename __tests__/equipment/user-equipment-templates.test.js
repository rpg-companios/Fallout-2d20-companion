import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  USER_EQUIPMENT_FILE_NAMES,
  USER_EQUIPMENT_KINDS,
  validateUserEquipmentDocument,
} from '../../domain/userEquipment.js';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog.js';
import { SETTING } from '../../modules/fallout/index.js';

const docsRoot = join(process.cwd(), 'docs', 'user-equipment');
const templatePath = (kind) => join(docsRoot, 'templates', USER_EQUIPMENT_FILE_NAMES[kind]);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const equipmentCatalog = getEquipmentCatalog('en-EN');
const readme = readFileSync(join(docsRoot, 'README.md'), 'utf8');
const readmeEn = readFileSync(join(docsRoot, 'README.en.md'), 'utf8');

const readCatalog = (path) => readJson(join(process.cwd(), path));

describe('пользовательское снаряжение: шаблоны и документация', () => {
  it('имена файлов в реестре сеттинга совпадают с загрузчиком', () => {
    expect(SETTING.userData.equipment.kinds).toEqual(USER_EQUIPMENT_KINDS);
    expect(SETTING.userData.equipment.fileNames).toEqual(USER_EQUIPMENT_FILE_NAMES);
  });

  it('руководство доступно на русском и английском с переходами между версиями', () => {
    expect(readme).toContain('[English version](README.en.md)');
    expect(readmeEn).toContain('[Русская версия](README.md)');
  });

  it.each(USER_EQUIPMENT_KINDS)('%s: примерный JSON проходит текущую валидацию каталога', (kind) => {
    const fileName = USER_EQUIPMENT_FILE_NAMES[kind];
    const rawText = readFileSync(templatePath(kind), 'utf8');
    const result = validateUserEquipmentDocument(rawText, {
      expectedSettingId: SETTING.meta.id,
      expectedKind: kind,
      fileName,
      catalog: equipmentCatalog,
    });
    expect(result.ok, JSON.stringify(result.errors, null, 2)).toBe(true);
  });

  it('документация содержит каждый canonical quality/effect ID с обоими именами', () => {
    const qualitiesRu = readCatalog('modules/fallout/i18n/ru-RU/data/system/qualities.json');
    const qualitiesEn = readCatalog('modules/fallout/i18n/en-EN/data/system/qualities.json');
    const effectsRu = readCatalog('modules/fallout/i18n/ru-RU/data/system/damageEffects.json');
    const effectsEn = readCatalog('modules/fallout/i18n/en-EN/data/system/damageEffects.json');
    const armorEffectsRu = readCatalog('modules/fallout/i18n/ru-RU/data/equipment/armor/armor_effects.json');
    const armorEffectsEn = readCatalog('modules/fallout/i18n/en-EN/data/equipment/armor/armor_effects.json');
    const armorEffects = readCatalog('modules/fallout/data/equipment/armor_effects.json');

    for (const entry of qualitiesRu) {
      const en = qualitiesEn.find((candidate) => candidate.id === entry.id);
      expect(en, `missing English quality ${entry.id}`).toBeTruthy();
      const row = `| \`${entry.id}\` | ${entry.name} | ${en.name} |`;
      expect(readme).toContain(row);
      expect(readmeEn).toContain(row);
    }
    for (const entry of effectsRu) {
      const en = effectsEn.find((candidate) => candidate.id === entry.id);
      expect(en, `missing English damage effect ${entry.id}`).toBeTruthy();
      const row = `| \`${entry.id}\` | ${entry.name} | ${en.name} |`;
      expect(readme).toContain(row);
      expect(readmeEn).toContain(row);
    }
    for (const id of Object.keys(armorEffects)) {
      const row = `| \`${id}\` | ${armorEffectsRu[id]?.description} | ${armorEffectsEn[id]?.description} |`;
      expect(readme).toContain(row);
      expect(readmeEn).toContain(row);
    }
  });
});
