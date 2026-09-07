// __tests__/avatar/premium-registry.test.js
//
// Движковый реестр премиум-фич (domain/premium.js, задел патча 193).
// UI нет: проверяем, что скелет ведёт себя правильно до и после подключения
// будущего провайдера лицензий.

import { describe, it, expect, afterEach } from 'vitest';
import {
  FEATURE_IDS,
  registerFeatures,
  getFeature,
  listFeatures,
  getEntitlement,
  setEntitlement,
  isFeatureAvailable,
} from '../../domain/premium';

describe('premium: реестр фич', () => {
  it('customAvatar зарегистрирована как премиум-фича', () => {
    const feature = getFeature(FEATURE_IDS.CUSTOM_AVATAR);
    expect(feature).toBeTruthy();
    expect(feature.premium).toBe(true);
  });

  it('в open-beta (права по умолчанию) премиум-фича доступна', () => {
    expect(getEntitlement().plan).toBe('open-beta');
    expect(isFeatureAvailable(FEATURE_IDS.CUSTOM_AVATAR)).toBe(true);
  });

  it('неизвестная фича недоступна — опечатка не открывает премию', () => {
    expect(isFeatureAvailable('no-such-feature')).toBe(false);
    expect(getFeature('no-such-feature')).toBeNull();
  });

  it('непремиум-фича доступна при любом праве', () => {
    registerFeatures([{ id: 'test.freeFeature', premium: false }]);
    setEntitlement({ allFeatures: false, features: [] });
    expect(isFeatureAvailable('test.freeFeature')).toBe(true);
  });

  it('право списком фич: входит — доступна, не входит — нет', () => {
    setEntitlement({ allFeatures: false, features: [FEATURE_IDS.CUSTOM_AVATAR] });
    expect(isFeatureAvailable(FEATURE_IDS.CUSTOM_AVATAR)).toBe(true);
    setEntitlement({ allFeatures: false, features: ['somethingElse'] });
    expect(isFeatureAvailable(FEATURE_IDS.CUSTOM_AVATAR)).toBe(false);
  });

  it('просроченное право не открывает премиум-фичу', () => {
    setEntitlement({
      allFeatures: false,
      features: [FEATURE_IDS.CUSTOM_AVATAR],
      expiresAt: Date.now() - 1000,
    });
    expect(isFeatureAvailable(FEATURE_IDS.CUSTOM_AVATAR)).toBe(false);
  });

  it('listFeatures отдаёт и premium, и обычные фичи', () => {
    const ids = listFeatures().map((f) => f.id);
    expect(ids).toContain(FEATURE_IDS.CUSTOM_AVATAR);
    expect(ids).toContain('test.freeFeature');
  });

  afterEach(() => {
    // не протекаем состоянием права в другие тесты
    setEntitlement(null);
  });
});
