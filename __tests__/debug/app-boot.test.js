// Диагностика белого экрана (после 292): НЕ-UI хребет загрузки приложения в
// порядке App.js — единый реестр модулей, как в бандле Metro. Крах оценки
// модуля (TDZ/цикл) воспроизводится здесь со стеком.
import { describe, expect, it } from 'vitest';

describe('хребет загрузки приложения (диагностика 292)', () => {
  it('не-UI граф App.js вычисляется без краха, в порядке загрузки', async () => {
    const steps = [
      () => import('../../src/store/characterStore'),
      () => import('../../db/seed'),
      () => import('../../i18n/appI18n'),
      () => import('../../domain/registry'),
      () => import('../../i18n/equipmentCatalog'),
      () => import('../../modules/fallout/index.js'),
      () => import('../../modules/fallout/survival'),
      () => import('../../modules/fallout/diseases/migration'),
      () => import('../../db/catalogSource'),
      () => import('../../src/store/resolvers'),
      () => import('../../src/store/powerArmorSlice'),
      () => import('../../src/store/migrations'),
    ];
    for (const load of steps) {
      const mod = await load();
      expect(mod).toBeTruthy();
    }
  });
});
