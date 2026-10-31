import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  StyleSheet: {
    create: (s) => s,
    flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {})),
  },
  Dimensions: { get: () => ({ width: 1024, height: 768 }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Switch: 'Switch',
  ActivityIndicator: 'ActivityIndicator',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
}));

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
  Ionicons: 'Ionicons',
  FontAwesome5: 'FontAwesome5',
}));

vi.mock('@react-navigation/material-top-tabs', () => ({
  createMaterialTopTabNavigator: () => ({
    Navigator: 'Navigator',
    Screen: 'Screen',
  }),
}));

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => cb(),
}));

vi.mock('../../db', () => import('../../db/Database.web.js'));
vi.mock('../../db/Database', () => import('../../db/Database.web.js'));

const alertsLog = [];
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: (payload) => { alertsLog.push(payload); },
  showAlert: (id) => { alertsLog.push({ id }); },
  confirmAlert: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../components/cloudSync/googleDriveSync', () => ({
  syncCharacterToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteCharacterFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmContainerToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmContainerFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmEnvEntryToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmEnvEntryFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncGmRoomToCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  deleteGmRoomFromCloudIfEnabled: vi.fn().mockResolvedValue({ ok: true }),
  syncAllCharactersWithCloud: vi.fn().mockResolvedValue({ uploaded: 0, downloaded: 0 }),
  openCloudFolderInDrive: vi.fn().mockResolvedValue(undefined),
}));

// Регистрируем сеттинговые слушатели выживания и хода времени (как в App.js)
import '../../modules/fallout/survival/index.js';

import * as db from '../../db/Database.web.js';
import { createRoomRegistry } from '../../server/roomRegistry.js';
import useRoomStore, {
  resetRoomClientForTests,
  setRoomClientFactoryForTests,
} from '../../src/room/roomStore';
import useUiModeStore from '../../src/room/uiModeStore';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import useCharacterStore from '../../src/store/characterStore';
import { slimItem } from '../../domain/saveSlimming';
import { resolveItem } from '../../domain/resolveItem';
import { applyConsumableToEffects } from '../../domain/effects';
import {
  ENV_ENTRY_KIND,
  ENV_MECHANIC_TYPE,
  countPresetsInFolder,
  createEnvFolder,
  createEnvPreset,
  detachFolderPresets,
  isEnvEntryVisibleInFolder,
  sortEnvEntries,
} from '../../domain/envCombatPresets';
import {
  GM_TAB_ROUTES,
  buildGmWorkspaceSections,
} from '../../components/gm/GmWorkspaceNavigator';
import {
  ENV_DIRECTIVE_KIND,
  computeRadiationExposure,
  getCharacterZonesForInjury,
  isFirstAidCapableItem,
  isReusableMedicalTool,
  rollFirstAidBoost,
} from '../../modules/fallout/gm/gmEnvCombat';
import { applyDirectiveToLiveCharacterStore } from '../../modules/fallout/gm/gmDirectives';
import { applyEnvCombatDirectiveToStoredRow } from '../../modules/fallout/gm/gmEnvCombat';
import { donorCandidatesFor, repairTargetFor } from '../../modules/fallout/repair/operations';
import { sleepSurvival } from '../../modules/fallout/survival/operations';
import { createSurvivalState } from '../../modules/fallout/survival/survival';

const ROOT = path.resolve(__dirname, '../..');

function createNodeWsAdapter(url) {
  const raw = new WebSocket(url);
  const adapter = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => raw.send(data),
    close: (code, reason) => raw.close(code, reason),
  };
  raw.on('open', () => {
    adapter.readyState = 1;
    adapter.onopen?.();
  });
  raw.on('message', (buf) => {
    adapter.onmessage?.({ data: buf.toString() });
  });
  raw.on('close', (code, reason) => {
    adapter.readyState = 3;
    adapter.onclose?.({ code, reason: reason?.toString?.() || '' });
  });
  raw.on('error', (err) => {
    adapter.onerror?.(err);
  });
  return adapter;
}

const waitUntil = async (predicate, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timeout waiting for condition');
};

describe('Патч 482: экран Мастера «Окружающая среда/бой», периодические тики, увечья, Первая помощь и лечение соседа', () => {
  let serverInstance = null;

  beforeEach(async () => {
    alertsLog.length = 0;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    await db.initDatabase();
    useCharacterStore.getState().resetCharacterStore();
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
    delete process.env.EXPO_PUBLIC_ROOM_SERVER_URL;
  });

  it('GmWorkspaceNavigator включает 3-ю вкладку «Окружающая среда/бой», а сохранённые плитки и папки персистятся в БД', async () => {
    const sections = buildGmWorkspaceSections({ gmLootTradeLicensed: true, gmEnvCombatLicensed: true });
    expect(sections.map((s) => s.name)).toEqual([
      GM_TAB_ROUTES.CAMPAIGNS,
      GM_TAB_ROUTES.LOOT_TRADE,
      GM_TAB_ROUTES.ENV_COMBAT,
    ]);

    const appSrc = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
    expect(appSrc).toContain("tApp('tabs.gmEnvCombat')");
    expect(appSrc).toContain('gmEnvCombatLicensed={gmEnvCombatLicensed}');

    const folder = createEnvFolder({
      name: 'Светящееся море',
      description: 'Радиационные бури и кислотные осадки',
    });
    const presetInFolder = createEnvPreset({
      mechanicType: ENV_MECHANIC_TYPE.WEATHER,
      name: 'Тяжёлая рад-буря',
      description: '3 сцены по 2 CD в конце каждой сцены',
      parentFolderId: folder.id,
      payload: { conditionKey: 'radStorm', valueMode: 'cd', value: 2, durationUnit: 'scenes', totalIntervals: 3 },
    });
    const rootPreset = createEnvPreset({
      mechanicType: ENV_MECHANIC_TYPE.ATTACK_FAIL,
      name: 'Осечка пистолета',
      description: 'Быстрое заклинивание',
      payload: { outcome: 'weaponJam' },
    });

    await db.saveGmEnvEntry(folder);
    await db.saveGmEnvEntry(presetInFolder);
    await db.saveGmEnvEntry(rootPreset);

    const all = await db.listGmEnvEntries();
    expect(all).toHaveLength(3);
    expect(all.find((e) => e.id === folder.id)?.kind).toBe(ENV_ENTRY_KIND.FOLDER);
    expect(countPresetsInFolder(all, folder.id)).toBe(1);
    expect(sortEnvEntries(all.filter((e) => isEnvEntryVisibleInFolder(e, null))).map((e) => e.id)).toEqual([
      folder.id,
      rootPreset.id,
    ]);
    expect(all.filter((e) => isEnvEntryVisibleInFolder(e, folder.id)).map((e) => e.id)).toEqual([
      presetInFolder.id,
    ]);

    // При удалении папки вложенные плитки не теряются, а возвращаются в корень
    const detached = detachFolderPresets(all, folder.id);
    const movedBack = detached.find((e) => e.id === presetInFolder.id);
    expect(movedBack.parentFolderId).toBeNull();

    await db.deleteGmEnvEntry(folder.id);
    const remaining = await db.listGmEnvEntries();
    expect(remaining).toHaveLength(2);
  });

  it('Погода и Радиация применяют эффект ровно в конце каждого из N промежутков (сцены и часы) с учётом наименьшего СУ рад. и иммунитетов', () => {
    // 1. Проверка фонового СУ рад. (наименьшее по всем 6 зонам тела) и иммунитетов
    const unsealedHero = {
      origin: { id: 'vaultDweller', characterType: 'human' },
      equippedArmor: {
        head: { armor: null, clothing: null }, // шлем отсутствует → 0 СУ рад. на голове!
        body: { armor: { radiationDamageRating: 4 }, clothing: null },
        leftArm: { armor: { radiationDamageRating: 4 }, clothing: null },
        rightArm: { armor: { radiationDamageRating: 4 }, clothing: null },
        leftLeg: { armor: { radiationDamageRating: 4 }, clothing: null },
        rightLeg: { armor: { radiationDamageRating: 4 }, clothing: null },
      },
    };
    expect(computeRadiationExposure(unsealedHero, 5, { resistMode: 'minBody' })).toEqual({
      immune: false,
      dr: 0,
      netRad: 5,
      blocked: 0,
    });

    const sealedHazmatHero = {
      origin: { id: 'vaultDweller', characterType: 'human' },
      equippedArmor: Object.fromEntries(
        ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].map((slot) => [
          slot,
          { armor: null, clothing: { radiationDamageRating: 3 } },
        ]),
      ),
    };
    expect(computeRadiationExposure(sealedHazmatHero, 5, { resistMode: 'minBody' })).toEqual({
      immune: false,
      dr: 3,
      netRad: 2,
      blocked: 3,
    });

    // Гуль / Робот полностью иммунны к радиации
    expect(computeRadiationExposure({ origin: 'ghoul' }, 10, { resistMode: 'direct' }).immune).toBe(true);
    expect(computeRadiationExposure({ origin: { id: 'misterHandy', characterType: 'robot' } }, 10).immune).toBe(true);

    // 2. Периодическое облучение: 3 ед. за сцену на 3 сцены → 0 в момент старта, по +3 в конце 1-й, 2-й и 3-й сцены!
    const store = useCharacterStore.getState();
    store.setOrigin({ id: 'vaultDweller', characterType: 'human' });
    store.setLevel(3);
    store.setCurrentHealth(15);
    store.setRadiation(0);

    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.RADIATION_APPLY,
      envPayload: {
        presetKey: 'barrel',
        radResistMode: 'direct',
        valueMode: 'fixed',
        value: 3,
        durationUnit: 'scenes',
        totalIntervals: 3,
      },
    }, useCharacterStore, 'ru-RU');

    // Сразу при выдаче тик ещё НЕ произошёл
    expect(useCharacterStore.getState().radiation).toBe(0);
    expect(Object.values(useCharacterStore.getState().effects)).toHaveLength(1);

    // Конец 1-й сцены → +3 рад (осталось 2/3)
    useCharacterStore.getState().advanceScene();
    expect(useCharacterStore.getState().radiation).toBe(3);
    expect(Object.values(useCharacterStore.getState().effects)).toHaveLength(1);

    // Конец 2-й сцены → +6 рад (осталось 1/3)
    useCharacterStore.getState().advanceScene();
    expect(useCharacterStore.getState().radiation).toBe(6);
    expect(Object.values(useCharacterStore.getState().effects)).toHaveLength(1);

    // Конец 3-й сцены → +9 рад, эффект полностью завершён и снят!
    useCharacterStore.getState().advanceScene();
    expect(useCharacterStore.getState().radiation).toBe(9);
    expect(Object.values(useCharacterStore.getState().effects).filter((e) => e.active !== false && e.effectType === 'gmPeriodic')).toHaveLength(0);

    // Лишняя 4-я сцена больше ничего не начисляет
    useCharacterStore.getState().advanceScene();
    expect(useCharacterStore.getState().radiation).toBe(9);

    // 3. Почасовой кислотный дождь (2 часа по 4 урона): тикает через advanceEffectsByGameHours
    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.WEATHER_APPLY,
      envPayload: {
        conditionKey: 'acidRain',
        valueMode: 'fixed',
        value: 4,
        durationUnit: 'hours',
        totalIntervals: 2,
        shelterProtected: false,
      },
    }, useCharacterStore, 'ru-RU');

    const hpStart = useCharacterStore.getState().currentHealth;
    useCharacterStore.getState().advanceEffectsByGameHours(1);
    expect(useCharacterStore.getState().currentHealth).toBe(hpStart - 4);
    const secondHour = useCharacterStore.getState().advanceEffectsByGameHours(1);
    expect(useCharacterStore.getState().currentHealth).toBe(hpStart - 8);
    expect(secondHour.periodicLogs).toHaveLength(1);
    expect(Object.values(useCharacterStore.getState().effects)
      .filter((effect) => effect.active !== false && effect.effectType === 'gmPeriodic' && effect.gmPeriodic?.category === 'weather'))
      .toHaveLength(0);
  });

  it('Увечья адаптируются под слоты робота, проходят 2 стадии лечения (активное → стабилизировано → зажило во сне) и не стираются Аддиктолом', () => {
    const robotZones = getCharacterZonesForInjury({
      origin: { id: 'misterHandy', characterType: 'robot', bodyPlan: 'misterHandy' },
      equippedRobotSlots: { optics: {}, body: {}, arm1: {}, arm2: {}, arm3: {}, thruster: {} },
    }, 'ru-RU');
    expect(robotZones.every((z) => z.isRobotZone)).toBe(true);
    expect(robotZones.some((z) => z.key === 'optics' || z.key === 'thruster')).toBe(true);

    // Наложим увечье торса живому персонажу
    useAppSettingsStore.getState().setValue('survivalModeEnabled', true);
    const store = useCharacterStore.getState();
    store.setOrigin({ id: 'vaultDweller', characterType: 'human' });
    store.setStateExtension('survival', createSurvivalState('human'));
    store.setLevel(4);
    store.setCurrentHealth(16);

    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.INJURY_APPLY,
      envPayload: { zoneKey: 'leftArm', bleedDice: 1 },
    }, useCharacterStore, 'ru-RU');

    const activeEffectsBefore = Object.values(useCharacterStore.getState().effects);
    expect(activeEffectsBefore).toHaveLength(1);
    expect(activeEffectsBefore[0].effectType).toBe('injury');
    expect(activeEffectsBefore[0].injuryStage).toBe('active');

    // Расходник со снятием всех негативных эффектов (Аддиктол) НЕ должен стирать увечье!
    const afterAddictol = applyConsumableToEffects(
      { name: 'Аддиктол', removeNegativeEffects: ['all'] },
      activeEffectsBefore,
    );
    expect(afterAddictol.effects).toHaveLength(1);
    expect(afterAddictol.effects[0].effectType).toBe('injury');

    const robotRepairCheck = rollFirstAidBoost({
      ...useCharacterStore.getState(),
      origin: { id: 'misterHandy', characterType: 'robot', bodyPlan: 'misterHandy' },
      skills: { REPAIR: { id: 'REPAIR', base: 2, total: 2 } },
      selectedSkills: ['REPAIR'],
    }, { targetIsRobot: true, rollD20: () => 3 }, 'ru-RU');
    expect(robotRepairCheck.skillId).toBe('REPAIR');
    expect(robotRepairCheck.bonusHp).toBe(robotRepairCheck.tn);

    // Полноценный сон/отдых заживляет уже стабилизированную травму.
    useCharacterStore.getState().updateEffect(activeEffectsBefore[0].id, { injuryStage: 'stabilized', bleedDice: 0 });
    const sleepResult = sleepSurvival({ place: 'bed', hours: 1 });
    expect(sleepResult.injuriesHealed).toContain('leftArm');
    expect(Object.values(useCharacterStore.getState().effects)
      .filter((e) => e.active !== false && e.effectType === 'injury')).toHaveLength(0);
  });

  it('Провал атаки: заклинивание снимается кнопкой, поломка даёт 0% и чинится, а неремонтопригодный взрыв возвращает оружие в сумку и блокирует починку/экипировку', () => {
    const store = useCharacterStore.getState();
    store.setOrigin({ id: 'vaultDweller', characterType: 'human' });
    store.setLevel(5);
    store.setCurrentHealth(20);

    // Выдаём экипированный 10-мм пистолет и пачку патронов
    useCharacterStore.setState({
      items: {
        wep_pistol_1: {
          id: 'wep_pistol_1',
          instanceId: 'wep_pistol_1',
          weaponId: 'weapon_10mm_pistol',
          name: '10-мм пистолет',
          itemType: 'weapon',
          ammoId: 'ammo_10mm',
          equipped: true,
          durabilityTracked: true,
          durability: 85,
          quantity: 1,
        },
        ammo_stack_1: {
          id: 'ammo_stack_1',
          weaponId: 'ammo_10mm',
          name: '10-мм патроны',
          itemType: 'ammo',
          quantity: 15,
        },
      },
    });

    // 1) Потеря боезапаса (5 патронов)
    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.ATTACK_FAIL,
      envPayload: { outcome: 'ammoLoss', weaponId: 'wep_pistol_1', ammoMode: 'fixed', value: 5 },
    }, useCharacterStore, 'ru-RU');
    expect(useCharacterStore.getState().items.ammo_stack_1.quantity).toBe(10);

    // 2) Заклинивание → устранение осечки
    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.ATTACK_FAIL,
      envPayload: { outcome: 'weaponJam', weaponId: 'wep_pistol_1' },
    }, useCharacterStore, 'ru-RU');
    expect(useCharacterStore.getState().items.wep_pistol_1.jammed).toBe(true);

    useCharacterStore.getState().updateItem('wep_pistol_1', { jammed: false });
    expect(useCharacterStore.getState().items.wep_pistol_1.jammed).toBe(false);

    // 3) Обычная поломка → прочность 0%, forceBroken: true, доступна починка
    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.ATTACK_FAIL,
      envPayload: { outcome: 'weaponBreak', weaponId: 'wep_pistol_1' },
    }, useCharacterStore, 'ru-RU');
    const brokenWep = useCharacterStore.getState().items.wep_pistol_1;
    expect(brokenWep.durability).toBe(0);
    expect(brokenWep.forceBroken).toBe(true);
    expect(repairTargetFor(brokenWep)).not.toBeNull();

    useCharacterStore.getState().repairWeapon('wep_pistol_1');
    expect(useCharacterStore.getState().items.wep_pistol_1.durability).toBe(100);
    expect(useCharacterStore.getState().items.wep_pistol_1.forceBroken).toBe(false);

    // 4) Взрыв оружия с repairable: false → урон стрелку, прочность 0%, снято в сумку, НЕ чинится и НЕ надевается!
    applyDirectiveToLiveCharacterStore({
      kind: ENV_DIRECTIVE_KIND.ATTACK_FAIL,
      envPayload: {
        outcome: 'weaponExplode',
        weaponId: 'wep_pistol_1',
        valueMode: 'fixed',
        value: 6,
        repairable: false,
      },
    }, useCharacterStore, 'ru-RU');

    const ruinedWep = useCharacterStore.getState().items.wep_pistol_1;
    expect(useCharacterStore.getState().currentHealth).toBe(14);
    expect(ruinedWep.durability).toBe(0);
    expect(ruinedWep.unrepairable).toBe(true);
    expect(ruinedWep.equipped).toBe(false);
    expect(repairTargetFor(ruinedWep)).toBeNull();
    expect(donorCandidatesFor({ weaponId: 'weapon_10mm_pistol' }, 'other_id')).not.toContain('wep_pistol_1');

    // Попытка снова надеть или починить разрушенное оружие отклоняется стором
    useCharacterStore.getState().equipItem('wep_pistol_1');
    useCharacterStore.getState().repairWeapon('wep_pistol_1');
    expect(useCharacterStore.getState().items.wep_pistol_1.equipped).toBe(false);
    expect(useCharacterStore.getState().items.wep_pistol_1.durability).toBe(0);

    // Slim-save сохраняет флаги jammed / forceBroken / unrepairable без потерь
    const slimmed = slimItem({ ...ruinedWep, jammed: true }, null);
    expect(slimmed.unrepairable).toBe(true);
    expect(slimmed.forceBroken).toBe(true);
    expect(slimmed.jammed).toBe(true);
    const hydrated = { ...slimmed };
    expect(hydrated.unrepairable).toBe(true);
    expect(hydrated.forceBroken).toBe(true);
    expect(hydrated.jammed).toBe(true);
  });

  it('Первая помощь добавляет +(ИНТ + Медицина/Ремонт) при успехе 2d20, саквояж многоразовый, а Применить на другого лечит соседа по комнате через WS', async () => {
    expect(isFirstAidCapableItem({ id: 'chem_stimpak' })).toBe(true);
    expect(isFirstAidCapableItem({ id: 'item_doctors_bag' })).toBe(true);
    expect(isReusableMedicalTool({ id: 'item_doctors_bag' })).toBe(true);
    expect(isReusableMedicalTool({ id: 'chem_stimpak' })).toBe(false);

    // Настраиваем медика Игрока 1: ИНТ = 8, Медицина = 3 (отмечена) → ПП = 11!
    const medicStore = useCharacterStore.getState();
    medicStore.setOrigin({ id: 'vaultDweller', characterType: 'human' });
    medicStore.setBaseAttributes([
      { name: 'STR', value: 5 }, { name: 'PER', value: 5 }, { name: 'END', value: 5 },
      { name: 'CHA', value: 5 }, { name: 'INT', value: 8 }, { name: 'AGI', value: 5 }, { name: 'LCK', value: 5 },
    ]);
    medicStore.setBaseSkills([{ name: 'MEDICINE', value: 3 }]);
    medicStore.setSelectedSkills(['MEDICINE']);

    const faPass = rollFirstAidBoost(useCharacterStore.getState(), {
      targetIsRobot: false,
      rollD20: () => 5, // 5 <= 11 → успех!
    }, 'ru-RU');
    expect(faPass.passed).toBe(true);
    expect(faPass.tn).toBe(11);
    expect(faPass.bonusHp).toBe(11);

    const faFail = rollFirstAidBoost(useCharacterStore.getState(), {
      targetIsRobot: false,
      rollD20: () => 19, // 19 > 11 → провал
    }, 'ru-RU');
    expect(faFail.passed).toBe(false);
    expect(faFail.bonusHp).toBe(0);

    // PEER_ASSIST — отдельный тип очереди (не gm.directive) и его можно ack-нуть игроком комнаты.
    const woundedId = 'char_wounded_neighbor';
    const woundedData = {
      schemaVersion: 22,
      characterName: 'Псина-Рейнджер',
      level: 5,
      origin: { id: 'vaultDweller', characterType: 'human' },
      currentHealth: 3,
      radiation: 0,
      attributes: [
        { name: 'STR', value: 6 }, { name: 'PER', value: 6 }, { name: 'END', value: 6 },
        { name: 'CHA', value: 5 }, { name: 'INT', value: 5 }, { name: 'AGI', value: 6 }, { name: 'LCK', value: 5 },
      ],
      activeTimedEffects: [{
        id: 'gm-injury-rightArm', effectType: 'injury', effectKind: 'negative', isPermanent: true,
        scenesLeft: 9999, injuryZone: 'rightArm', injuryStage: 'active', isRobotZone: false, bleedDice: 0,
        effectName: 'Injury: Right Arm', effectLabel: 'Right Arm [Active Injury]',
      }],
    };
    const registry = createRoomRegistry();
    const { room } = registry.createRoom({ clientId: 'gm_482', prefix: 'TST', name: 'Боевая сцена 482' });
    const roomCode = room.code;
    registry.joinRoom({ code: roomCode, clientId: 'player_medic_482', name: 'Доктор Ли', role: 'player' });
    registry.joinRoom({ code: roomCode, clientId: 'player_wounded_482', name: 'Псина-Рейнджер', role: 'player' });
    registry.putSnapshot({
      code: roomCode,
      characterId: woundedId,
      revision: 1,
      snapshot: woundedData,
      fromClientId: 'player_wounded_482',
      fromName: 'Псина-Рейнджер',
    });
    const peerIssued = registry.issuePeerAssist({
      code: roomCode,
      clientId: 'player_medic_482',
      payload: {
        targetCharacterId: woundedId,
        fromCharacterName: 'Доктор Ли',
        envPayload: {
          item: { id: 'chem_stimpak', name: 'Стимулятор', healAmount: 4 },
          firstAidBonusHp: 11,
          firstAidReportLine: 'Первая помощь успешна → +11 ОЗ!',
          stabilizeInjury: true,
          stabilizeInjuryZone: 'rightArm',
        },
      },
    });
    expect(peerIssued.directive.kind).toBe('peer.consumable');
    expect(peerIssued.directive.originRole).toBe('peer');
    expect(peerIssued.directive.targetCharacterId).toBe(woundedId);

    const delivered = applyEnvCombatDirectiveToStoredRow(peerIssued.directive, {
      id: woundedId,
      name: 'Псина-Рейнджер',
      level: 5,
      data: woundedData,
    }, 'ru-RU');
    expect(delivered.nextData.currentHealth).toBeGreaterThan(3);
    expect(delivered.nextData.activeTimedEffects.find((e) => e.injuryZone === 'rightArm').injuryStage)
      .toBe('stabilized');
    const ack = registry.ackDirective({
      code: roomCode,
      clientId: 'player_wounded_482',
      directiveId: peerIssued.directive.directiveId,
      characterId: woundedId,
    });
    expect(ack.directive.ackedByCharacterIds).toContain(woundedId);
    expect(delivered.summaryLine).toContain('Доктор Ли');


  });
});
