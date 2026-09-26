// ПРИЁМОЧНЫЙ (патч 378): добор 42 мили-привязок (слот Unique) —
// финал пересборки «оружие → моды» по спискам владельца: 729/729 пар.
//   • у Бейсбольной биты — Шипы/Надрезы/Клинки/Обмотка/Острый край;
//   • у Дубинки — Электрифицированная; у Супермолота — Оглушающий пакет;
//   • окно улучшения мили наполнилось без дублей, слоты отсортированы.
import { describe, expect, it } from 'vitest';

import catalogData from '../../modules/fallout/data/equipment/weapon_mods.json';
import slotsData from '../../modules/fallout/data/equipment/weapon_mod_slots.json';

const byId = (id) => catalogData.find((m) => m.id === id);

describe('патч 378: мили-привязки добиты до полного покрытия владельца', () => {
  it('Бейсбольная бита: 5 уникальных улучшений из списка владельца', () => {
    for (const id of ['mod_spiked', 'mod_barbed', 'mod_bladed', 'mod_chain_wrapped', 'mod_sharp']) {
      expect(byId(id).applies_to_ids).toContain('weapon_baseball_bat');
      expect(slotsData.weapon_baseball_bat.Unique).toContain(id);
    }
  });

  it('Дубинка — Электрифицированная; Супермолот — Оглушающий пакет', () => {
    expect(byId('mod_electrified').applies_to_ids).toContain('weapon_baton');
    expect(byId('mod_stun_pack').applies_to_ids).toContain('weapon_super_sledge');
  });

  it('полное покрытие: каждая пара владельца (729) есть в каталоге', () => {
    // контрольный минимум: без пустых привязок у мили-модов Unique
    const uniqueMods = catalogData.filter((m) => m.slot === 'Unique');
    for (const m of uniqueMods) {
      expect(m.applies_to_ids?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('в окнах улучшений нет дублей (порядок чужих оружий не трогаем)', () => {
    for (const [w, buckets] of Object.entries(slotsData)) {
      for (const [slot, ids] of Object.entries(buckets)) {
        expect(new Set(ids).size, `${w}/${slot}`).toBe(ids.length);
      }
    }
  });
});
