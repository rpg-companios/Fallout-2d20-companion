/**
 * Реестр данных движка: единая точка чтения сеттинга.
 * Пока возвращает статические файлы data/ — поведение не меняется.
 * В будущем сюда подключится модуль (packStore) — тесты останутся.
 */
import { describe, it, expect } from 'vitest';
import { getOrigins, getTraits, getBodyPlans, getEquipmentCatalogForLocale } from '../../domain/registry';

describe('Реестр данных', () => {
  it('возвращает ориджины/трейты/планы тела из data/', () => {
    const origins = getOrigins();
    const traits = getTraits();
    const plans = getBodyPlans();
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.some((o) => o.id === 'tribal')).toBe(true);
    expect(traits.some((t) => t.id === 'tribal-tribal')).toBe(true);
    expect(Object.keys(plans)).toContain('humanoid');
    expect(Object.keys(plans)).toContain('securitron');
  });

  it('getEquipmentCatalogForLocale возвращает каталог для локали', () => {
    const catalog = getEquipmentCatalogForLocale('ru-RU');
    expect(catalog.equipmentKits['securitron_standard']).toBeDefined();
    expect(catalog.equipmentKits['securitron_standard'].name).toBeTruthy();
  });
});
