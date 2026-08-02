import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import ruInventoryScreen from '../../i18n/ru-RU/screens/inventory/screen.json';
import enInventoryScreen from '../../i18n/en-EN/screens/inventory/screen.json';
import ruCharacterScreen from '../../i18n/ru-RU/screens/character/screen.json';
import enCharacterScreen from '../../i18n/en-EN/screens/character/screen.json';
import ruWaAScreen from '../../i18n/ru-RU/screens/weaponsAndArmor/screen.json';
import enWaAScreen from '../../i18n/en-EN/screens/weaponsAndArmor/screen.json';

// ПРАВИЛО (владелец, 2026-08-02): никаких фолбэков, легаси и хардкода;
// i18n-friendly на всех этапах. Любая строка UI — только из словаря ru-RU/en-EN.
// Этот файл — инвариант: фолбэк-литерал в t-вызове или хардкод-маркер в хелпере
// не должен вернуться в кодовую базу ни в одном следующем патче.

const HELPERS = 'tApp|tInventory|tCharacterScreen|tHomeScreen|tPerksAndTraits|tWeaponsAndArmorScreen';
// t-вызов со вторым строковым литералом = фолбэк (любые кавычки, любой перенос строк).
const FALLBACK_CALL = new RegExp(
  `(${HELPERS})\\(\\s*(['"])([^'"]+)\\2\\s*,\\s*(['"])`,
  'g',
);

const SOURCE_ROOTS = ['App.js', 'components'];

const listSourceFiles = (entry, acc = []) => {
  const stat = statSync(entry);
  if (stat.isDirectory()) {
    for (const name of readdirSync(entry)) {
      if (name === 'node_modules' || name === '__tests__' || name === '.git') continue;
      listSourceFiles(join(entry, name), acc);
    }
    return acc;
  }
  if (entry.endsWith('.js') && !entry.endsWith('.test.js')) acc.push(entry);
  return acc;
};

describe('i18n: правило владельца — никаких фолбэков и хардкода', () => {
  it('ни один t-вызов в исходниках не несёт литеральный фолбэк', () => {
    const offenders = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of listSourceFiles(root)) {
        const src = readFileSync(file, 'utf8');
        FALLBACK_CALL.lastIndex = 0;
        let m;
        while ((m = FALLBACK_CALL.exec(src)) !== null) {
          offenders.push(`${file}: ${m[1]}('${m[3]}', …)`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('все t-хелперы без fallback-параметра и без RU-хардкода «Ошибка ключа»', () => {
    const helperFiles = [
      'i18n/appI18n.js',
      'components/screens/HomeScreen/logic/homeScreenI18n.js',
      'components/screens/CharacterScreen/logic/characterScreenI18n.js',
      'components/screens/InventoryScreen/logic/inventoryI18n.js',
      'components/screens/PerksAndTraitsScreen/perksAndTraitsScreenI18n.js',
      'components/screens/WeaponsAndArmorScreen/weaponsAndArmorScreenI18n.js',
    ];
    for (const file of helperFiles) {
      const src = readFileSync(file, 'utf8');
      expect(src.includes('fallback = '), `${file}: fallback-параметр`).toBe(false);
      expect(src.includes('Ошибка ключа'), `${file}: RU-хардкод ошибки`).toBe(false);
    }
  });

  it('CharacterContext: tPA/tPALabel/tPAAction — прямой доступ к словарю локали, без цепочек ??', () => {
    const src = readFileSync('components/CharacterContext.js', 'utf8');
    expect(src).not.toContain("?? INV_ALERTS_DICT['ru-RU']");
    expect(src).not.toContain("?? INV_LABELS_DICT['ru-RU']");
    expect(src).not.toContain("?? INV_ACTIONS_DICT['ru-RU']");
    expect(src).not.toContain('?? key');
  });

  it('ключи, читаемые напрямую (tPA*/заголовки), есть в ОБЕИХ локалях', () => {
    // tPA (алерты CharacterContext)
    const alertKeys = [
      'robotArmorOnlyTitle', 'robotArmorOnlyMessage',
      'mutantCannotWearStandardArmorTitle', 'mutantCannotWearStandardArmorMessage',
      'powerArmorNeedsCoreTitle', 'powerArmorNeedsCoreMessage',
      'powerArmorNeedsFrameMessage',
      'powerArmorDepletedTitle', 'powerArmorDepletedMessage',
      'powerArmorBrokenPieceMessage',
      'bothSlotsBusy', 'bothSlotsBusyPrompt',
      'replaceEquipmentTitle',
      // бывшие «живые» фолбэки — тексты переехали в словарь
      'conditionsRemovedTitle', 'conditionsRemovedMessage',
      'addictionRollTitle', 'addictionRollMessage',
      'addictionGainedTitle', 'addictionGainedMessage',
      'addictionAvoidedTitle', 'addictionAvoidedMessage',
      'cannotEquipItem',
    ];
    for (const dict of [ruInventoryScreen, enInventoryScreen]) {
      for (const key of alertKeys) {
        expect(typeof dict.alerts[key], `alerts.${key}`).toBe('string');
      }
      // tPALabel / tPAAction
      for (const slot of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
        expect(typeof dict.labels[slot], `labels.${slot}`).toBe('string');
      }
      expect(typeof dict.actions.cancel, 'actions.cancel').toBe('string');
    }
    // шаблоны — в конвенции formatInventoryText ({x}), двойных скобок нет
    for (const dict of [ruInventoryScreen, enInventoryScreen]) {
      for (const key of ['conditionsRemovedMessage', 'addictionRollMessage']) {
        expect(dict.alerts[key]).not.toContain('{{');
      }
    }
  });

  it('бывший хардкод UI переехал в словари обеих локалей', () => {
    for (const dict of [ruCharacterScreen, enCharacterScreen]) {
      expect(typeof dict.labels.needToPick, 'labels.needToPick').toBe('string');
      expect(typeof dict.defaultCharacterName, 'defaultCharacterName').toBe('string');
      expect(typeof dict.modals.ncrCitizen?.title, 'modals.ncrCitizen.title').toBe('string');
      expect(typeof dict.modals.ncrCitizen?.originLabel, 'modals.ncrCitizen.originLabel').toBe('string');
    }
    for (const dict of [ruWaAScreen, enWaAScreen]) {
      for (const slot of ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
        expect(typeof dict.robotSlots?.misterHandy?.[slot], `robotSlots.misterHandy.${slot}`).toBe('string');
      }
      expect(typeof dict.robotBodyUpgrade?.title, 'robotBodyUpgrade.title').toBe('string');
      expect(typeof dict.robotBodyUpgrade?.comingSoon, 'robotBodyUpgrade.comingSoon').toBe('string');
    }
  });
});
