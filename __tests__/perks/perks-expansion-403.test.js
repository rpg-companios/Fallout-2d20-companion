// ПРИЁМОЧНЫЙ (патч 403): владелец добавил референсы (22b5add на main:
// perks_structure / perks_catalog_ru / perks_mapping / perks_discrepancies
// / fallout2d20_perks) и заказал: «названия и перевод недостающих перков».
// Каталог расширен 177 → 185 (crippler, crushingBlow, fierceLoyalty,
// inShiningArmor, juryRiggedAmmo, loadAndFire, missFortune, oldWorldGourmet);
// требования = референс structure БЕЗ ИЗМЕНЕНИЙ (расхождения с PDF
// зафиксированы владельцем в discrepancies — значения приложения верны).
import { describe, expect, it } from 'vitest';

import catalog from '../../modules/fallout/data/perks/perks.json';
import ru from '../../modules/fallout/i18n/ru-RU/data/perks/perks.json';
import en from '../../modules/fallout/i18n/en-EN/data/perks/perks.json';
import structure from '../../docs/reference-data/perks_structure.json';
import catalogRu from '../../docs/reference-data/perks_catalog_ru.json';

const NEW_IDS = ['crippler', 'crushingBlow', 'fierceLoyalty', 'inShiningArmor', 'juryRiggedAmmo', 'loadAndFire', 'missFortune', 'oldWorldGourmet'];

const byId = (list) => Object.fromEntries(list.map((p) => [p.id, p]));

describe('патч 403: пополнение перков по референсам владельца', () => {
  it('каталог 185 = ru 185 = en 185; id сходятся во все стороны', () => {
    expect(catalog.length).toBe(185);
    expect(ru.length).toBe(185);
    expect(en.length).toBe(185);
    expect(new Set(catalog.map((p) => p.id))).toEqual(new Set(structure.map((p) => p.id)));
    expect(new Set(ru.map((p) => p.id))).toEqual(new Set(catalog.map((p) => p.id)));
    expect(new Set(en.map((p) => p.id))).toEqual(new Set(catalog.map((p) => p.id)));
  });

  it('8 новых: требования и ранги — точная копия референса structure', () => {
    const st = byId(structure);
    const cat = byId(catalog);
    for (const id of NEW_IDS) {
      expect(cat[id].maxRanks).toBe(st[id].maxRanks);
      expect(cat[id].prerequisites).toEqual(st[id].prerequisites);
      expect(cat[id].effectKey).toBe(`perks.${id}.effect`);
      expect(cat[id].nameKey).toBe(`perks.${id}.name`);
    }
  });

  it('ru-имена совпадают с каталогом владельца, тексты полные', () => {
    const ruById = byId(ru);
    const owner = byId(catalogRu);
    for (const id of NEW_IDS) {
      expect(ruById[id].name).toBe(owner[id].name);
      expect(ruById[id].name).toBe(ruById[id].name.toUpperCase());
      expect(ruById[id].effect.length).toBeGreaterThan(80);
    }
    expect(ruById.oldWorldGourmet.effect).toContain('Радиация');
    expect(ruById.crushingBlow.effect).toContain('2-м ранге');
  });

  it('en-имена новых перков на месте', () => {
    const enById = byId(en);
    expect(enById.crippler.name).toBe('Crippler');
    expect(enById.missFortune.name).toBe('Miss Fortune');
    expect(enById.oldWorldGourmet.name).toBe('Old World Gourmet');
    expect(enById.juryRiggedAmmo.name).toBe('Jury-Rigged Ammo');
    for (const id of NEW_IDS) expect(enById[id].effect.length).toBeGreaterThan(60);
  });
});
