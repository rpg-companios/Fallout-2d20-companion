// ПРИЁМОЧНЫЙ (патч 555): ПК-режим карточек в окне комнаты Мастера.
//
// Требование владельца: «Переключатель будет в окне просмотра комнаты. Делай 555».
// Значит:
//   1) кнопка «ПК-режим» живёт в панели комнаты (folderRoomBar), а не в настройках;
//   2) выбор явный и сохраняется как настройка движка (не по ширине окна);
//   3) в ПК-режиме карточки становятся широкой колонкой, а все разделы —
//      раскрытыми, перки показываются с пояснением эффекта.
//
// Карточка здесь монтируется по-настоящему: проверяется поведение, а не текст
// исходника (урок патча 549).
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const React = require('react');
  const host = (name) => ({ children, ...props }) => React.createElement(name, props, children);
  return {
    Platform: { OS: 'web', select: (o) => o.web ?? o.default },
    StyleSheet: {
      create: (s) => s,
      flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
      hairlineWidth: 1,
    },
    Dimensions: { get: () => ({ width: 1200, height: 900 }) },
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    Image: host('Image'),
  };
});

vi.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    MaterialCommunityIcons: ({ name, size, color, ...props }) => React.createElement('Icon', props),
  };
});

vi.mock('../../i18n/locale', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocale: () => 'ru-RU',
    useModuleLocale: () => 'ru-RU',
    getCurrentLocale: () => 'ru-RU',
    getCurrentModuleLocale: () => 'ru-RU',
  };
});

import GmRoomCharacterCard from '../../components/gm/GmRoomCharacterCard';
import { extractGmCharacterSummary } from '../../modules/fallout/gm/gmCharacterSummary';
import { GM_DICTIONARIES } from '../../modules/fallout/gm/gmI18n';
import {
  ENGINE_SETTINGS,
  SETTING_CONTROL_SURFACES,
  getSettingDefault,
  getSettingsForSurface,
} from '../../domain/settingsCatalog';
import useAppSettingsStore from '../../src/store/appSettingsStore';

const read = (relative) => readFileSync(relative, 'utf8');

const buildSnapshotPayload = () => ({
  characterId: 'char_pc_1',
  name: 'Нейт',
  level: 6,
  originName: 'vaultDweller',
  updatedAt: Date.now(),
  avatarDataUrl: null,
  data: {
    schemaVersion: 22,
    characterName: 'Нейт',
    level: 6,
    origin: { id: 'vaultDweller' },
    caps: 140,
    currentHealth: 11,
    radiation: 2,
    luckPoints: 5,
    attributes: [
      { name: 'STR', value: 5 },
      { name: 'PER', value: 7 },
      { name: 'END', value: 6 },
      { name: 'CHA', value: 5 },
      { name: 'INT', value: 6 },
      { name: 'AGI', value: 8 },
      { name: 'LCK', value: 6 },
    ],
    skills: [
      { name: 'SMALL_GUNS', value: 3 },
      { name: 'MEDICINE', value: 2 },
    ],
    selectedSkills: ['SMALL_GUNS'],
    selectedPerks: [{ id: 'gunNut', rank: 2 }],
    equippedArmor: {
      head: { armor: null, clothing: null },
      body: {
        armor: { id: 'armor_leather_chest', physicalDamageRating: 1, energyDamageRating: 2, radiationDamageRating: 0, name: 'Кожаный нагрудник' },
        clothing: { id: 'cloth_vault_jumpsuit', physicalDamageRating: 0, energyDamageRating: 1, radiationDamageRating: 2, name: 'Комбинезон Убежища' },
      },
      leftArm: { armor: null, clothing: null },
      rightArm: { armor: null, clothing: null },
      leftLeg: { armor: null, clothing: null },
      rightLeg: { armor: null, clothing: null },
    },
    equippedWeapons: [
      { id: 'weapon_10mm_pistol', name: '10-мм пистолет', damage: 4, fireRate: 2, range: 'C', ammoId: 'ammo_10mm' },
    ],
    equipment: {
      items: [
        { id: 'weapon_10mm_pistol', name: '10-мм пистолет', weight: 2, quantity: 1, equipped: true },
        { id: 'ammo_10mm', type: 'ammo', name: '10-мм патроны', weight: 0, quantity: 24 },
        { id: 'chem_stimpak', itemType: 'chem', name: 'Стимулятор', weight: 0.5, quantity: 3 },
      ],
    },
  },
});

const renderCard = (pcMode) => {
  let renderer = null;
  act(() => {
    renderer = create(
      <GmRoomCharacterCard
        characterCard={{ id: 'char_pc_1', playerOnline: true, snapshotPayload: buildSnapshotPayload() }}
        pcMode={pcMode}
      />,
    );
  });
  return renderer;
};

const treeText = (renderer) => JSON.stringify(renderer.toJSON());

describe('патч 555: ПК-режим карточек в окне комнаты Мастера', () => {
  it('настройка gmPcMode заведена на панель комнаты, по умолчанию выключена', () => {
    const setting = ENGINE_SETTINGS.find((item) => item.id === 'gmPcMode');
    expect(setting).toBeTruthy();
    expect(setting.type).toBe('boolean');
    expect(setting.defaultValue).toBe(false);
    expect(setting.controlSurface).toBe(SETTING_CONTROL_SURFACES.ROOM);
    expect(getSettingDefault('gmPcMode')).toBe(false);
    expect(getSettingsForSurface(SETTING_CONTROL_SURFACES.ROOM).map((s) => s.id)).toEqual(['gmPcMode']);
    // В общем окне «Настройки» переключателя нет — он живёт в комнате.
    expect(getSettingsForSurface(SETTING_CONTROL_SURFACES.SETTINGS).some((s) => s.id === 'gmPcMode')).toBe(false);
  });

  it('выбор сохраняется в настройках движка и переключается туда-обратно', () => {
    const store = useAppSettingsStore.getState();
    act(() => {
      store.setValue('gmPcMode', true);
    });
    expect(useAppSettingsStore.getState().getSettingValue('gmPcMode')).toBe(true);
    act(() => {
      useAppSettingsStore.getState().setValue('gmPcMode', false);
    });
    expect(useAppSettingsStore.getState().getSettingValue('gmPcMode')).toBe(false);
  });

  it('подпись кнопки есть в обоих языках', () => {
    expect(GM_DICTIONARIES['ru-RU'].roomBar.pcMode).toBe('ПК-режим');
    expect(GM_DICTIONARIES['en-EN'].roomBar.pcMode).toBe('PC mode');
  });

  it('кнопка «ПК-режим» стоит в панели комнаты и передаётся карточкам', () => {
    const code = read('components/screens/HomeScreen/HomeScreen.js');
    expect(code).toContain('testID="gm-room-pc-mode-btn"');
    expect(code).toContain("setSettingValue('gmPcMode', !gmPcMode)");
    expect(code).toContain('styles.gmCardsListWrapPc');
    expect(code).toContain('pcMode={gmPcMode}');
    // Режим не выводится из ширины окна: только явное нажатие.
    expect(code).not.toContain("useWindowDimensions().width > 900");
  });

  it('в ПК-режиме карточка раскрывает все разделы и показывает пояснение перка', () => {
    const renderer = renderCard(true);
    const text = treeText(renderer);

    // S.P.E.C.I.A.L. и навыки раскрыты.
    expect(text).toContain('СИЛ');
    // Раздел перков раскрыт, перк показан с эффектом 2-го ранга.
    expect(text).toContain('ФАНАТИК ОРУЖИЯ');
    expect(text).toContain('2-му рангу модификаций');
    // Кнопка «раскрыть/свернуть всё» в ПК-режиме не нужна.
    expect(renderer.root.findAllByProps({ testID: 'gm-char-toggle-all-char_pc_1' })).toHaveLength(0);
    // Карточка получает широкий отступ ПК-режима.
    const card = renderer.root.findAllByProps({ testID: 'gm-char-card-char_pc_1' })[0];
    const styles = Array.isArray(card.props.style) ? card.props.style : [card.props.style];
    expect(styles.some((entry) => entry && entry.padding === 16)).toBe(true);
  });

  it('без ПК-режима карточка остаётся свёрнутой лентой', () => {
    const renderer = renderCard(false);
    const text = treeText(renderer);

    expect(text).not.toContain('СИЛ');
    expect(text).not.toContain('2-му рангу модификаций');
    expect(renderer.root.findAllByProps({ testID: 'gm-char-toggle-all-char_pc_1' }).length).toBeGreaterThan(0);
    const card = renderer.root.findAllByProps({ testID: 'gm-char-card-char_pc_1' })[0];
    const styles = Array.isArray(card.props.style) ? card.props.style : [card.props.style];
    expect(styles.some((entry) => entry && entry.padding === 16)).toBe(false);
  });

  it('сводка отдаёт текст эффекта текущего ранга перка', () => {
    const summary = extractGmCharacterSummary(buildSnapshotPayload(), {
      locale: 'ru-RU',
      moduleLocale: 'ru-RU',
    });
    expect(summary.perks).toHaveLength(1);
    expect(summary.perks[0].rank).toBe(2);
    expect(summary.perks[0].description).toContain('2-му рангу модификаций');
  });
});
