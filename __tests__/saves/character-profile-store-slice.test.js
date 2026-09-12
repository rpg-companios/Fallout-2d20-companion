// Шаг 7 миграции: профиль персонажа (origin/trait/level/characterName,
// флаги сохранения, удача, очки перков) — в characterStore. Единственный
// источник — стор; фасад useCharacter() поля больше не отдаёт, экраны
// (CharacterScreen, PerksAndTraitsScreen, InventoryScreen,
// WeaponsAndArmorScreen, SurvivalConsumeModal) читают/пишут стор напрямую.
// Сеттеры поддерживают функциональный апдейтер (прецедент setEquippedWeapons).
//
// maxLuckPoints НЕ персистится (правило 1 counters-storage.md: потолок —
// производная; пересчитывается при загрузке/смене атрибутов).
//
// Зеркало _characterContext подрезано до equipmentState: recalculateDerivedStats
// читает trait/level из публичных полей, powerArmorSlice.characterRules —
// origin/trait напрямую.

import { afterEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useCharacterStore from '../../src/store/characterStore';

const origin = { id: 'ghoul', name: 'Гуль' };
const trait = { id: 'ghoul-trait', name: 'Особость гуля' };

afterEach(async () => {
  useCharacterStore.getState().resetCharacterStore();
  await useCharacterStore.persist.clearStorage();
});

describe('characterStore: слайс профиля (Шаг 7)', () => {
  it('начальные значения: пустой профиль', () => {
    const s = useCharacterStore.getState();
    expect(s.origin).toBeNull();
    expect(s.trait).toBeNull();
    expect(s.level).toBe(1);
    expect(s.characterName).toBe('');
    expect(s.attributesSaved).toBe(false);
    expect(s.skillsSaved).toBe(false);
    expect(s.luckPoints).toBe(0);
    expect(s.maxLuckPoints).toBe(0);
    expect(s.availablePerkAttributePoints).toBe(0);
  });

  it('прямые сеты: origin/trait/level/имя/флаги', () => {
    const store = useCharacterStore.getState();
    store.setOrigin(origin);
    store.setTrait(trait);
    store.setLevel(4);
    store.setCharacterName('Даст');
    store.setAttributesSaved(true);
    store.setSkillsSaved(true);
    const s = useCharacterStore.getState();
    expect(s.origin).toEqual(origin);
    expect(s.trait).toEqual(trait);
    expect(s.level).toBe(4);
    expect(s.characterName).toBe('Даст');
    expect(s.attributesSaved).toBe(true);
    expect(s.skillsSaved).toBe(true);
  });

  it('функциональный апдейтер (паттерн CharacterScreen/трейт-конфирм)', () => {
    const store = useCharacterStore.getState();
    store.setOrigin(origin);
    store.setOrigin((prev) => (prev?.id === 'ghoul' ? null : prev)); // сняли ориджин
    store.setLevel((prev) => prev + 1);
    store.setCharacterName((prev) => `${prev}!`);
    const s = useCharacterStore.getState();
    expect(s.origin).toBeNull();
    expect(s.level).toBe(2);
    expect(s.characterName).toBe('!');
  });

  it('удача: setLuckPoints с апдейтером (трата/восстановление)', () => {
    const store = useCharacterStore.getState();
    store.setLuckPoints(3);
    store.setMaxLuckPoints(4);
    store.setLuckPoints((prev) => Math.max(0, prev - 1)); // потратил очко
    expect(useCharacterStore.getState().luckPoints).toBe(2);
    store.setLuckPoints((prev) => Math.min(4, prev + 1)); // восстановил
    expect(useCharacterStore.getState().luckPoints).toBe(3);
  });

  it('addPerkAttributePoints: ±points, не ниже нуля', () => {
    const store = useCharacterStore.getState();
    store.addPerkAttributePoints(2);
    expect(useCharacterStore.getState().availablePerkAttributePoints).toBe(2);
    store.addPerkAttributePoints(-5); // перерасход — клампится в 0
    expect(useCharacterStore.getState().availablePerkAttributePoints).toBe(0);
  });

  it('recalculateDerivedStats читает trait/level из публичных полей (зеркало подрезано)', () => {
    const store = useCharacterStore.getState();
    store.setCharacterContext({ equipmentState: {} });
    // после узкого setCharacterContext зеркало не содержит trait/level
    expect(useCharacterStore.getState()._characterContext).toEqual({ equipmentState: {} });
  });

  it('профиль персистится; maxLuckPoints в кэш не пишется (правило 1)', async () => {
    const store = useCharacterStore.getState();
    store.setOrigin(origin);
    store.setLevel(3);
    store.setCharacterName('Даст');
    store.setAttributesSaved(true);
    store.setLuckPoints(2);
    store.setMaxLuckPoints(4);
    store.setAvailablePerkAttributePoints(1);

    // Что реально лежит в persisted-кэше:
    const raw = JSON.parse(await AsyncStorage.getItem('character-store'));
    expect(raw.state.origin).toEqual(origin);
    expect(raw.state.level).toBe(3);
    expect(raw.state.characterName).toBe('Даст');
    expect(raw.state.luckPoints).toBe(2);
    expect(raw.state.availablePerkAttributePoints).toBe(1);
    expect(raw.state.maxLuckPoints).toBeUndefined(); // потолок — производная

    // И переживает rehydrate:
    await useCharacterStore.persist.rehydrate();
    const s = useCharacterStore.getState();
    expect(s.origin).toEqual(origin);
    expect(s.level).toBe(3);
    expect(s.luckPoints).toBe(2);
    expect(s.availablePerkAttributePoints).toBe(1);
  });

  it('resetCharacterStore сбрасывает профиль', () => {
    const store = useCharacterStore.getState();
    store.setOrigin(origin);
    store.setTrait(trait);
    store.setLevel(5);
    store.setCharacterName('Даст');
    store.setAttributesSaved(true);
    store.setSkillsSaved(true);
    store.setLuckPoints(3);
    store.setMaxLuckPoints(4);
    store.addPerkAttributePoints(2);
    store.resetCharacterStore();
    const s = useCharacterStore.getState();
    expect(s.origin).toBeNull();
    expect(s.trait).toBeNull();
    expect(s.level).toBe(1);
    expect(s.characterName).toBe('');
    expect(s.attributesSaved).toBe(false);
    expect(s.skillsSaved).toBe(false);
    expect(s.luckPoints).toBe(0);
    expect(s.maxLuckPoints).toBe(0);
    expect(s.availablePerkAttributePoints).toBe(0);
  });
});
