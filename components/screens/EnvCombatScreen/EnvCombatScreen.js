// components/screens/EnvCombatScreen/EnvCombatScreen.js
// 3-я вкладка пространства Мастера (navbar2): «Окружающая среда/бой» (патч 482).
// Оформлена по аналогии с «Добыча/Торговля»:
// - 4 плитки конструктора: Погода, Радиация, Увечье, Провал атаки;
// - панель выбора комнаты/получателя и шага игрового времени;
// - сохранение настроенных состояний с названием и описанием как отдельных плиток;
// - папки состояний с названием и описанием (перемещение плиток в/из папок + синхронизация в облако).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as db from '../../../db';
import { SUPPORTED_LOCALES, setCurrentLocale, useLocale } from '../../../i18n/locale';
import { getLocaleLabel } from '../HomeScreen/logic/localeLabel';
import { tHomeScreen } from '../HomeScreen/logic/homeScreenI18n';
import useAppSettingsStore from '../../../src/store/appSettingsStore';
import useRoomStore from '../../../src/room/roomStore';
import useUiModeStore from '../../../src/room/uiModeStore';
import { formatRoomCodeForDisplay } from '../../../src/room/roomCode';
import {
  ENV_ENTRY_KIND,
  ENV_MECHANIC_TYPE,
  countPresetsInFolder,
  createEnvFolder,
  createEnvPreset,
  detachFolderPresets,
  isEnvEntryVisibleInFolder,
  sortEnvEntries,
} from '../../../domain/envCombatPresets';
import {
  ENV_DIRECTIVE_KIND,
  evaluateStrengthAmount,
  rollHitZoneForCharacter,
} from '../../../modules/fallout/gm/gmEnvCombat';
import { formatGm, tGm } from '../../../modules/fallout/gm/gmI18n';
import {
  deleteGmEnvEntryFromCloudIfEnabled,
  openCloudFolderInDrive,
  syncAllCharactersWithCloud,
  syncGmEnvEntryToCloudIfEnabled,
} from '../../cloudSync/googleDriveSync';
import { showRawAlert } from '../../alerts/alertService';
import { FEATURE_IDS, guardAdminAction } from '../../../src/premium/adminAccessGate';
import styles from '../../../styles/LootTradeScreen.styles';
import homeStyles from '../../../styles/HomeScreen.styles';
import IconText from '../../lootTrade/LootTradeIconText';
import EnvMechanicModal from './modals/EnvMechanicModal';

const NUM_COLS = 3;
const MENU_WIDTH = 230;

const MECHANIC_TILE_META = Object.freeze({
  [ENV_MECHANIC_TYPE.WEATHER]: { icon: 'weather-lightning-rainy', color: '#38bdf8' },
  [ENV_MECHANIC_TYPE.RADIATION]: { icon: 'radioactive', color: '#4ade80' },
  [ENV_MECHANIC_TYPE.INJURY]: { icon: 'bone', color: '#f87171' },
  [ENV_MECHANIC_TYPE.ATTACK_FAIL]: { icon: 'pistol', color: '#fbbf24' },
});

const formatPresetFormulaBadge = (preset, locale) => {
  const p = preset?.payload || {};
  if (preset?.mechanicType === ENV_MECHANIC_TYPE.WEATHER || preset?.mechanicType === ENV_MECHANIC_TYPE.RADIATION) {
    const val = p.valueMode === 'cd' ? `${p.value ?? 1} {CD}` : `${p.value ?? 1}`;
    const u = p.durationUnit || 'once';
    if (u === 'once') return `${val} · ${tGm('envCombat.duration.shortUnits.once', locale)}`;
    return `${val} × ${p.totalIntervals ?? 1} ${tGm(`envCombat.duration.shortUnits.${u}`, locale)}`;
  }
  if (preset?.mechanicType === ENV_MECHANIC_TYPE.INJURY) {
    return p.zoneKey ? `${p.zoneKey}` : 'd20';
  }
  if (preset?.mechanicType === ENV_MECHANIC_TYPE.ATTACK_FAIL) {
    return tGm(`envCombat.attackFail.outcomes.${p.outcome || 'weaponJam'}.title`, locale);
  }
  return '';
};

const chunkIntoRows = (items, cols = NUM_COLS) => {
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    const slice = items.slice(i, i + cols);
    while (slice.length < cols) slice.push(null);
    rows.push(slice);
  }
  return rows;
};

export default function EnvCombatScreen() {
  const locale = useLocale();
  const localeLabel = (code) => getLocaleLabel({
    code,
    displayLocale: locale,
    translate: tHomeScreen,
  });
  const setUiMode = useAppSettingsStore((s) => s.setUiMode);
  const setTabUiMode = useUiModeStore((s) => s.setTabUiMode);
  const roomsMap = useRoomStore((s) => s.rooms);
  const sendGmDirective = useRoomStore((s) => s.sendGmDirective);

  const [entries, setEntries] = useState([]);
  const [gmRoomRecords, setGmRoomRecords] = useState([]);
  const [selectedRoomCode, setSelectedRoomCode] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('all');
  const [currentFolderId, setCurrentFolderId] = useState(null);

  const [syncing, setSyncing] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  // Модалка механики
  const [activeMechanic, setActiveMechanic] = useState(null); // { mechanicType, initialPayload?, initialPresetMeta? }

  // Модалка папки / редактирования метаданных плитки
  const [folderModal, setFolderModal] = useState(null); // { mode: 'create'|'edit', id?, name, description }
  const [metaEditModal, setMetaEditModal] = useState(null); // { entry, name, description }
  const [moveFolderModal, setMoveFolderModal] = useState(null); // { entry }

  // Контекстное меню ⋮ карточки
  const [cardMenu, setCardMenu] = useState(null); // { entry, x, y }
  const menuRefs = useRef({});

  const loadData = useCallback(async () => {
    try {
      const [loadedEntries, loadedRooms] = await Promise.all([
        db.listGmEnvEntries(),
        db.getGmRooms(),
      ]);
      setEntries(Array.isArray(loadedEntries) ? loadedEntries : []);
      const rooms = Array.isArray(loadedRooms) ? loadedRooms : [];
      setGmRoomRecords(rooms);
      setSelectedRoomCode((prev) => {
        if (prev && rooms.some((r) => r.code === prev)) return prev;
        return rooms[0]?.code || '';
      });
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const activeRoom = selectedRoomCode ? roomsMap?.[selectedRoomCode] || null : null;
  const roomCharacters = useMemo(() => {
    if (!activeRoom) return [];
    const rawEntries = Array.isArray(activeRoom.snapshots)
      ? activeRoom.snapshots
      : Object.values(activeRoom.snapshots || {});
    return rawEntries
      .filter((entry) => entry?.characterId && entry?.snapshot)
      .map((entry) => {
        const payload = entry.snapshot;
        return {
          characterId: entry.characterId,
          name: payload?.name || entry.fromName || payload?.data?.characterName || '—',
          level: Number(payload?.level) || 1,
          snapshot: payload?.data || payload || {},
        };
      });
  }, [activeRoom]);

  useEffect(() => {
    if (selectedTargetId !== 'all' && !roomCharacters.some((c) => c.characterId === selectedTargetId)) {
      setSelectedTargetId('all');
    }
  }, [roomCharacters, selectedTargetId]);

  const folders = useMemo(
    () => entries.filter((e) => e.kind === ENV_ENTRY_KIND.FOLDER),
    [entries],
  );

  const currentFolder = useMemo(
    () => (currentFolderId ? folders.find((f) => f.id === currentFolderId) || null : null),
    [folders, currentFolderId],
  );

  useEffect(() => {
    if (currentFolderId && !currentFolder) {
      setCurrentFolderId(null);
    }
  }, [currentFolderId, currentFolder]);

  const visibleSavedEntries = useMemo(
    () => sortEnvEntries(entries.filter((e) => isEnvEntryVisibleInFolder(e, currentFolderId))),
    [entries, currentFolderId],
  );

  // Подсчёт активной погоды и увечий по подключённым персонажам выбранной комнаты
  const roomHazardCounts = useMemo(() => {
    let weather = 0;
    let injuries = 0;
    for (const c of roomCharacters) {
      const effs = Array.isArray(c.snapshot?.activeTimedEffects) ? c.snapshot.activeTimedEffects : [];
      for (const ef of effs) {
        if (ef?.effectType === 'gmPeriodic' && ef.gmPeriodic?.category === 'weather') weather += 1;
        if (ef?.effectType === 'injury') injuries += 1;
      }
    }
    return { weather, injuries };
  }, [roomCharacters]);

  const handleToggleExitGm = () => {
    setTabUiMode('user');
    setUiMode('user');
  };

  const handleSyncCloud = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncAllCharactersWithCloud({ interactive: true });
      await loadData();
    } catch (err) {
      showRawAlert({ title: 'Cloud Sync', message: err?.message || 'Error' });
    } finally {
      setSyncing(false);
    }
  };

  const dispatchEnvDirective = async ({ kind, targetCharacterId = null, envPayload = {} }) => {
    if (!guardAdminAction(FEATURE_IDS.GM_ENV_COMBAT)) return;

    const effectiveTarget = targetCharacterId
      ? { targetType: 'character', targetCharacterId }
      : (selectedTargetId === 'all'
          ? { targetType: 'all', targetCharacterId: null }
          : { targetType: 'character', targetCharacterId: selectedTargetId });

    // Настольный режим (офлайн без комнаты): показываем расчёт на экране Ведущего
    if (!selectedRoomCode || !activeRoom) {
      const lines = [];
      if (envPayload.valueMode) {
        const rolled = evaluateStrengthAmount({ valueMode: envPayload.valueMode, value: envPayload.value ?? 1 });
        lines.push(`${tGm('envCombat.valueMode.label', locale)}: ${rolled.amount}${rolled.rolls ? ` [${rolled.rolls.join(', ')}]` : ''}`);
      }
      if (kind === ENV_DIRECTIVE_KIND.INJURY_APPLY) {
        const z = rollHitZoneForCharacter({}, locale);
        lines.push(`d20 = ${z.roll} → ${z.zone?.label || envPayload.zoneKey}`);
      }
      showRawAlert({
        title: tGm('envCombat.tabletopResultTitle', locale),
        message: lines.join('\n') || 'OK',
      });
      setActiveMechanic(null);
      return;
    }

    try {
      await sendGmDirective({
        code: selectedRoomCode,
        kind,
        targetType: effectiveTarget.targetType,
        targetCharacterId: effectiveTarget.targetCharacterId,
        envPayload,
      });
      setActiveMechanic(null);
    } catch (err) {
      showRawAlert({ title: tGm('envCombat.screenTitle', locale), message: err?.message || 'Failed' });
    }
  };

  const handleTimeStep = async ({ scenes = 0, gameMinutes = 0, label }) => {
    if (!selectedRoomCode || !activeRoom) return;
    try {
      await sendGmDirective({
        code: selectedRoomCode,
        kind: ENV_DIRECTIVE_KIND.TIME_ADVANCE,
        targetType: 'all',
        envPayload: { scenes, gameMinutes },
      });
    } catch (err) {
      showRawAlert({ title: label, message: err?.message || 'Error' });
    }
  };

  const persistEntry = async (entry) => {
    const saved = await db.saveGmEnvEntry(entry);
    await loadData();
    void syncGmEnvEntryToCloudIfEnabled(saved.id).catch(() => {});
    return saved;
  };

  const handleSavePresetFromModal = async ({ id, mechanicType, name, description, parentFolderId, payload }) => {
    const preset = createEnvPreset({
      id,
      mechanicType,
      name,
      description,
      parentFolderId: parentFolderId ?? currentFolderId ?? null,
      payload,
    });
    await persistEntry(preset);
    showRawAlert({
      title: tGm('envCombat.screenTitle', locale),
      message: formatGm(tGm('envCombat.presetModal.savedToast', locale), { name: preset.name }),
    });
  };

  const handleApplySavedPreset = (preset) => {
    const p = { ...(preset.payload || {}), customTitle: preset.name };
    const kind = preset.mechanicType === ENV_MECHANIC_TYPE.WEATHER
      ? ENV_DIRECTIVE_KIND.WEATHER_APPLY
      : preset.mechanicType === ENV_MECHANIC_TYPE.RADIATION
        ? ENV_DIRECTIVE_KIND.RADIATION_APPLY
        : preset.mechanicType === ENV_MECHANIC_TYPE.INJURY
          ? ENV_DIRECTIVE_KIND.INJURY_APPLY
          : ENV_DIRECTIVE_KIND.ATTACK_FAIL;
    void dispatchEnvDirective({ kind, envPayload: p });
  };

  const handleSaveFolderModal = async () => {
    if (!folderModal) return;
    const folder = createEnvFolder({
      id: folderModal.id || undefined,
      name: folderModal.name.trim() || tGm('envCombat.folderModal.createTitle', locale),
      description: folderModal.description.trim(),
    });
    await persistEntry(folder);
    setFolderModal(null);
  };

  const handleSaveMetaEdit = async () => {
    if (!metaEditModal?.entry) return;
    const updated = {
      ...metaEditModal.entry,
      name: metaEditModal.name.trim() || metaEditModal.entry.name,
      description: metaEditModal.description.trim(),
      updatedAt: Date.now(),
    };
    await persistEntry(updated);
    setMetaEditModal(null);
  };

  const handleDuplicatePreset = async (entry) => {
    const copy = createEnvPreset({
      mechanicType: entry.mechanicType,
      name: `${entry.name} (${tGm('envCombat.menu.copySuffix', locale)})`,
      description: entry.description,
      parentFolderId: entry.parentFolderId,
      payload: entry.payload,
    });
    await persistEntry(copy);
  };

  const handleMovePresetToFolder = async (entry, folderId) => {
    const moved = {
      ...entry,
      parentFolderId: folderId || null,
      updatedAt: Date.now(),
    };
    await persistEntry(moved);
    setMoveFolderModal(null);
  };

  const handleDeleteEntry = async (entry) => {
    if (entry.kind === ENV_ENTRY_KIND.FOLDER) {
      const updatedList = detachFolderPresets(entries, entry.id);
      const detachedPresets = updatedList.filter(
        (it) => it.kind === ENV_ENTRY_KIND.PRESET
          && entries.find((orig) => orig.id === it.id)?.parentFolderId === entry.id,
      );
      for (const pr of detachedPresets) {
        await db.saveGmEnvEntry(pr);
        void syncGmEnvEntryToCloudIfEnabled(pr.id).catch(() => {});
      }
      if (currentFolderId === entry.id) setCurrentFolderId(null);
    }
    await db.deleteGmEnvEntry(entry.id);
    void deleteGmEnvEntryFromCloudIfEnabled(entry.id).catch(() => {});
    await loadData();
  };

  const openEntryMenu = (entry) => {
    const ref = menuRefs.current[entry.id];
    const win = Dimensions.get('window');
    if (ref && typeof ref.measureInWindow === 'function') {
      ref.measureInWindow((px, py, pw, ph) => {
        const left = Math.max(8, Math.min(px + pw - MENU_WIDTH, win.width - MENU_WIDTH - 8));
        const top = Math.max(8, Math.min(py + ph + 4, win.height - 260));
        setCardMenu({ entry, x: left, y: top });
      });
    } else {
      setCardMenu({ entry, x: Math.max(16, win.width - MENU_WIDTH - 24), y: 140 });
    }
  };

  const baseTiles = [
    {
      mechanicType: ENV_MECHANIC_TYPE.WEATHER,
      title: tGm('envCombat.tiles.weather.title', locale),
      subtitle: tGm('envCombat.tiles.weather.subtitle', locale),
      badge: roomHazardCounts.weather > 0
        ? formatGm(tGm('envCombat.tiles.weather.activeBadge', locale), { count: roomHazardCounts.weather })
        : null,
    },
    {
      mechanicType: ENV_MECHANIC_TYPE.RADIATION,
      title: tGm('envCombat.tiles.radiation.title', locale),
      subtitle: tGm('envCombat.tiles.radiation.subtitle', locale),
      badge: null,
    },
    {
      mechanicType: ENV_MECHANIC_TYPE.INJURY,
      title: tGm('envCombat.tiles.injury.title', locale),
      subtitle: tGm('envCombat.tiles.injury.subtitle', locale),
      badge: roomHazardCounts.injuries > 0
        ? formatGm(tGm('envCombat.tiles.injury.activeBadge', locale), { count: roomHazardCounts.injuries })
        : null,
    },
    {
      mechanicType: ENV_MECHANIC_TYPE.ATTACK_FAIL,
      title: tGm('envCombat.tiles.attackFail.title', locale),
      subtitle: tGm('envCombat.tiles.attackFail.subtitle', locale),
      badge: null,
    },
  ];

  const savedGridCells = useMemo(() => {
    const cells = [];
    if (!currentFolderId) {
      cells.push({ type: 'newFolder' });
    }
    visibleSavedEntries.forEach((entry) => {
      cells.push({ type: 'entry', entry });
    });
    return chunkIntoRows(cells, NUM_COLS);
  }, [visibleSavedEntries, currentFolderId]);

  const baseTileRows = useMemo(() => chunkIntoRows(baseTiles, NUM_COLS), [locale, roomHazardCounts]);

  return (
    <View style={styles.container}>
      {/* Верхняя шапка в едином стиле с «Добыча/Торговля» и «Список кампаний» */}
      <View style={homeStyles.headerBar}>
        <View style={{ flex: 1 }}>
          <Text style={homeStyles.headerTitle} numberOfLines={1}>
            {tGm('envCombat.screenTitle', locale)}
          </Text>
          <Text style={localStyles.headerSubtitle} numberOfLines={1}>
            {tGm('envCombat.screenSubtitle', locale)}
          </Text>
        </View>

        <View style={homeStyles.headerActions}>
          <TouchableOpacity
            style={homeStyles.iconBtn}
            onPress={handleSyncCloud}
            disabled={syncing}
            accessibilityLabel={tHomeScreen('cloud.sync')}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#f0e68c" />
            ) : (
              <MaterialCommunityIcons name="cloud-sync-outline" size={20} color="#f0e68c" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={homeStyles.iconBtn}
            onPress={() => openCloudFolderInDrive().catch(() => {})}
            accessibilityLabel="Google Drive"
          >
            <MaterialCommunityIcons name="google-drive" size={20} color="#d1d5db" />
          </TouchableOpacity>

          <TouchableOpacity
            style={homeStyles.langBtn}
            onPress={() => setLanguageMenuOpen(true)}
          >
            <Text style={homeStyles.langBtnText}>{localeLabel(locale)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[homeStyles.adminButton, homeStyles.adminButtonActive]}
            onPress={handleToggleExitGm}
          >
            <MaterialCommunityIcons name="account-cog" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Панель выбора комнаты, получателя и продвижения времени */}
      <View style={localStyles.targetBar}>
        <View style={localStyles.targetRow}>
          <Text style={localStyles.barLabel}>{tGm('envCombat.targetBar.roomLabel', locale)}:</Text>
          {gmRoomRecords.length === 0 ? (
            <Text style={localStyles.offlineTag}>{tGm('envCombat.targetBar.noRooms', locale)}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.pillsScroll}>
              {gmRoomRecords.map((rm) => {
                const selected = selectedRoomCode === rm.code;
                const live = Boolean(roomsMap?.[rm.code]);
                return (
                  <TouchableOpacity
                    key={rm.code}
                    style={[localStyles.pill, selected && localStyles.pillActive]}
                    onPress={() => setSelectedRoomCode(rm.code)}
                  >
                    <View style={[localStyles.dot, { backgroundColor: live ? '#16a34a' : '#9ca3af' }]} />
                    <Text style={[localStyles.pillText, selected && localStyles.pillTextActive]}>
                      {rm.name || formatRoomCodeForDisplay(rm.code)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {activeRoom ? (
          <>
            <View style={localStyles.targetRow}>
              <Text style={localStyles.barLabel}>{tGm('envCombat.targetBar.recipientLabel', locale)}:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.pillsScroll}>
                <TouchableOpacity
                  style={[localStyles.pill, selectedTargetId === 'all' && localStyles.pillActive]}
                  onPress={() => setSelectedTargetId('all')}
                >
                  <Text style={[localStyles.pillText, selectedTargetId === 'all' && localStyles.pillTextActive]}>
                    {formatGm(tGm('envCombat.targetBar.allParty', locale), { count: roomCharacters.length })}
                  </Text>
                </TouchableOpacity>
                {roomCharacters.map((c) => {
                  const selected = selectedTargetId === c.characterId;
                  return (
                    <TouchableOpacity
                      key={c.characterId}
                      style={[localStyles.pill, selected && localStyles.pillActive]}
                      onPress={() => setSelectedTargetId(c.characterId)}
                    >
                      <Text style={[localStyles.pillText, selected && localStyles.pillTextActive]}>
                        {c.name || '—'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={localStyles.targetRow}>
              <Text style={localStyles.barLabel}>{tGm('envCombat.targetBar.timeStepLabel', locale)}</Text>
              <View style={localStyles.pillsScroll}>
                {[
                  { key: 'stepScene', scenes: 1, gameMinutes: 0 },
                  { key: 'step10m', scenes: 0, gameMinutes: 10 },
                  { key: 'step1h', scenes: 0, gameMinutes: 60 },
                  { key: 'step1d', scenes: 0, gameMinutes: 1440 },
                ].map((st) => {
                  const lbl = tGm(`envCombat.targetBar.${st.key}`, locale);
                  return (
                    <TouchableOpacity
                      key={st.key}
                      style={localStyles.timeBtn}
                      onPress={() => handleTimeStep({ scenes: st.scenes, gameMinutes: st.gameMinutes, label: lbl })}
                    >
                      <MaterialCommunityIcons name="clock-fast" size={14} color="#f0e68c" />
                      <Text style={localStyles.timeBtnText}>{lbl}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}
      </View>

      {/* Основное полотно плиток */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        {/* Раздел 1: 4 базовые плитки конструктора */}
        <Text style={localStyles.sectionTitle}>{tGm('envCombat.tilesSectionTitle', locale)}</Text>
        {baseTileRows.map((row, rIdx) => (
          <View key={`base-row-${rIdx}`} style={styles.row}>
            {row.map((tile, cIdx) => {
              if (!tile) return <View key={`empty-base-${cIdx}`} style={styles.emptyCell} />;
              const meta = MECHANIC_TILE_META[tile.mechanicType];
              return (
                <TouchableOpacity
                  key={tile.mechanicType}
                  testID={`env-tile-${tile.mechanicType}`}
                  style={[styles.cardCell, localStyles.mechanicTile]}
                  activeOpacity={0.8}
                  onPress={() => setActiveMechanic({ mechanicType: tile.mechanicType })}
                >
                  <View style={localStyles.tileTopRow}>
                    <MaterialCommunityIcons name={meta.icon} size={26} color={meta.color} />
                    {tile.badge ? (
                      <View style={localStyles.activePillBadge}>
                        <Text style={localStyles.activePillText}>{tile.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>{tile.title}</Text>
                  <Text style={localStyles.tileDesc} numberOfLines={3}>{tile.subtitle}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Раздел 2: Папки и сохранённые плитки состояний */}
        <View style={localStyles.savedHeaderRow}>
          <Text style={localStyles.sectionTitle}>
            {currentFolder
              ? `📁 ${currentFolder.name}`
              : tGm('envCombat.savedSectionTitle', locale)}
          </Text>
          {currentFolder ? (
            <TouchableOpacity
              style={localStyles.backBtn}
              onPress={() => setCurrentFolderId(null)}
            >
              <Text style={localStyles.backBtnText}>{tGm('envCombat.backToRoot', locale)}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {currentFolder?.description ? (
          <Text style={localStyles.folderHeaderDesc}>{currentFolder.description}</Text>
        ) : null}

        {savedGridCells.map((row, rIdx) => (
          <View key={`saved-row-${rIdx}`} style={styles.row}>
            {row.map((cell, cIdx) => {
              if (!cell) return <View key={`saved-empty-${cIdx}`} style={styles.emptyCell} />;

              if (cell.type === 'newFolder') {
                return (
                  <TouchableOpacity
                    key="create-folder-cell"
                    testID="env-create-folder-tile"
                    style={styles.createCell}
                    activeOpacity={0.75}
                    onPress={() => setFolderModal({ mode: 'create', name: '', description: '' })}
                  >
                    <MaterialCommunityIcons name="folder-plus-outline" size={40} color="#5a5a5a" />
                    <Text style={styles.createLabel}>{tGm('envCombat.newFolderBtn', locale)}</Text>
                  </TouchableOpacity>
                );
              }

              const entry = cell.entry;
              const isFolder = entry.kind === ENV_ENTRY_KIND.FOLDER;
              const meta = !isFolder ? MECHANIC_TILE_META[entry.mechanicType] : null;
              const nestedCount = isFolder ? countPresetsInFolder(entries, entry.id) : 0;

              return (
                <TouchableOpacity
                  key={entry.id}
                  testID={`env-saved-${entry.id}`}
                  style={[styles.cardCell, isFolder && localStyles.folderCard]}
                  activeOpacity={0.82}
                  onPress={() => {
                    if (isFolder) {
                      setCurrentFolderId(entry.id);
                    } else {
                      handleApplySavedPreset(entry);
                    }
                  }}
                >
                  <View style={localStyles.tileTopRow}>
                    <MaterialCommunityIcons
                      name={isFolder ? 'folder-outline' : (meta?.icon || 'bookmark-outline')}
                      size={24}
                      color={isFolder ? '#f0e68c' : (meta?.color || '#f0e68c')}
                    />
                    <TouchableOpacity
                      ref={(r) => { menuRefs.current[entry.id] = r; }}
                      style={localStyles.dotsBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openEntryMenu(entry);
                      }}
                    >
                      <MaterialCommunityIcons name="dots-vertical" size={18} color="#d1d5db" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.cardName} numberOfLines={2}>{entry.name}</Text>
                  {entry.description ? (
                    <Text style={localStyles.tileDesc} numberOfLines={2}>{entry.description}</Text>
                  ) : null}

                  <View style={{ marginTop: 'auto', paddingTop: 6 }}>
                    {isFolder ? (
                      <Text style={localStyles.formulaBadge}>
                        {formatGm(tGm('envCombat.folderBadge', locale), { count: nestedCount })}
                      </Text>
                    ) : (
                      <IconText style={localStyles.formulaBadge}>
                        {formatPresetFormulaBadge(entry, locale)}
                      </IconText>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {visibleSavedEntries.length === 0 ? (
          <Text style={localStyles.emptyHint}>
            {currentFolder
              ? tGm('envCombat.emptyFolder', locale)
              : tGm('envCombat.emptySaved', locale)}
          </Text>
        ) : null}
      </ScrollView>

      {/* Контекстное меню ⋮ для сохранённой плитки или папки */}
      <Modal
        visible={cardMenu != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCardMenu(null)}
      >
        <Pressable style={localStyles.menuBackdrop} onPress={() => setCardMenu(null)}>
          {cardMenu?.entry ? (
            <View style={[localStyles.menuPopup, { left: cardMenu.x, top: cardMenu.y, width: MENU_WIDTH }]}>
              {cardMenu.entry.kind === ENV_ENTRY_KIND.PRESET ? (
                <>
                  <TouchableOpacity
                    style={localStyles.menuItem}
                    onPress={() => {
                      const target = cardMenu.entry;
                      setCardMenu(null);
                      handleApplySavedPreset(target);
                    }}
                  >
                    <MaterialCommunityIcons name="play-circle-outline" size={18} color="#f0e68c" />
                    <Text style={[localStyles.menuItemText, { color: '#f0e68c', fontWeight: '700' }]}>
                      {tGm('envCombat.menu.apply', locale)}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={localStyles.menuItem}
                    onPress={() => {
                      const target = cardMenu.entry;
                      setCardMenu(null);
                      setActiveMechanic({
                        mechanicType: target.mechanicType,
                        initialPayload: target.payload,
                        initialPresetMeta: {
                          id: target.id,
                          name: target.name,
                          description: target.description,
                          parentFolderId: target.parentFolderId,
                          openSavePanel: true,
                        },
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="tune-variant" size={18} color="#e5e7eb" />
                    <Text style={localStyles.menuItemText}>{tGm('envCombat.menu.openConfigure', locale)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={localStyles.menuItem}
                    onPress={() => {
                      const target = cardMenu.entry;
                      setCardMenu(null);
                      setMetaEditModal({ entry: target, name: target.name, description: target.description || '' });
                    }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color="#e5e7eb" />
                    <Text style={localStyles.menuItemText}>{tGm('envCombat.menu.editMeta', locale)}</Text>
                  </TouchableOpacity>

                  {folders.length > 0 ? (
                    <TouchableOpacity
                      style={localStyles.menuItem}
                      onPress={() => {
                        const target = cardMenu.entry;
                        setCardMenu(null);
                        setMoveFolderModal({ entry: target });
                      }}
                    >
                      <MaterialCommunityIcons name="folder-move-outline" size={18} color="#e5e7eb" />
                      <Text style={localStyles.menuItemText}>{tGm('envCombat.menu.moveToFolder', locale)}</Text>
                    </TouchableOpacity>
                  ) : null}

                  {cardMenu.entry.parentFolderId ? (
                    <TouchableOpacity
                      style={localStyles.menuItem}
                      onPress={() => {
                        const target = cardMenu.entry;
                        setCardMenu(null);
                        void handleMovePresetToFolder(target, null);
                      }}
                    >
                      <MaterialCommunityIcons name="folder-upload-outline" size={18} color="#e5e7eb" />
                      <Text style={localStyles.menuItemText}>{tGm('envCombat.menu.moveToRoot', locale)}</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={localStyles.menuItem}
                    onPress={() => {
                      const target = cardMenu.entry;
                      setCardMenu(null);
                      void handleDuplicatePreset(target);
                    }}
                  >
                    <MaterialCommunityIcons name="content-copy" size={18} color="#e5e7eb" />
                    <Text style={localStyles.menuItemText}>{tGm('envCombat.menu.duplicate', locale)}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={localStyles.menuItem}
                  onPress={() => {
                    const target = cardMenu.entry;
                    setCardMenu(null);
                    setFolderModal({
                      mode: 'edit',
                      id: target.id,
                      name: target.name,
                      description: target.description || '',
                    });
                  }}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color="#e5e7eb" />
                  <Text style={localStyles.menuItemText}>{tGm('envCombat.menu.editMeta', locale)}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={localStyles.menuItem}
                onPress={() => {
                  const target = cardMenu.entry;
                  setCardMenu(null);
                  void handleDeleteEntry(target);
                }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#f87171" />
                <Text style={[localStyles.menuItemText, { color: '#f87171' }]}>
                  {tGm('envCombat.menu.delete', locale)}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      {/* Модалка создания / редактирования папки */}
      <Modal
        visible={folderModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setFolderModal(null)}
      >
        <View style={localStyles.modalBackdrop}>
          <View style={localStyles.modalCard}>
            <Text style={localStyles.modalTitle}>
              {tGm(folderModal?.mode === 'edit' ? 'envCombat.folderModal.editTitle' : 'envCombat.folderModal.createTitle', locale)}
            </Text>
            <Text style={localStyles.inputLabel}>{tGm('envCombat.folderModal.nameLabel', locale)}</Text>
            <TextInput
              style={localStyles.textInput}
              value={folderModal?.name || ''}
              onChangeText={(txt) => setFolderModal((prev) => (prev ? { ...prev, name: txt } : prev))}
              placeholder={tGm('envCombat.folderModal.namePlaceholder', locale)}
              placeholderTextColor="#6b7280"
            />
            <Text style={localStyles.inputLabel}>{tGm('envCombat.folderModal.descLabel', locale)}</Text>
            <TextInput
              style={[localStyles.textInput, { minHeight: 60 }]}
              multiline
              value={folderModal?.description || ''}
              onChangeText={(txt) => setFolderModal((prev) => (prev ? { ...prev, description: txt } : prev))}
              placeholder={tGm('envCombat.folderModal.descPlaceholder', locale)}
              placeholderTextColor="#6b7280"
            />
            <View style={localStyles.modalFooter}>
              <TouchableOpacity style={localStyles.cancelBtn} onPress={() => setFolderModal(null)}>
                <Text style={localStyles.cancelBtnText}>{tGm('commands.cancelBtn', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.saveBtn} onPress={handleSaveFolderModal}>
                <Text style={localStyles.saveBtnText}>{tGm('envCombat.folderModal.saveBtn', locale)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка редактирования названия/описания сохранённой плитки */}
      <Modal
        visible={metaEditModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMetaEditModal(null)}
      >
        <View style={localStyles.modalBackdrop}>
          <View style={localStyles.modalCard}>
            <Text style={localStyles.modalTitle}>{tGm('envCombat.presetModal.editTitle', locale)}</Text>
            <Text style={localStyles.inputLabel}>{tGm('envCombat.presetModal.nameLabel', locale)}</Text>
            <TextInput
              style={localStyles.textInput}
              value={metaEditModal?.name || ''}
              onChangeText={(txt) => setMetaEditModal((prev) => (prev ? { ...prev, name: txt } : prev))}
            />
            <Text style={localStyles.inputLabel}>{tGm('envCombat.presetModal.descLabel', locale)}</Text>
            <TextInput
              style={[localStyles.textInput, { minHeight: 60 }]}
              multiline
              value={metaEditModal?.description || ''}
              onChangeText={(txt) => setMetaEditModal((prev) => (prev ? { ...prev, description: txt } : prev))}
            />
            <View style={localStyles.modalFooter}>
              <TouchableOpacity style={localStyles.cancelBtn} onPress={() => setMetaEditModal(null)}>
                <Text style={localStyles.cancelBtnText}>{tGm('commands.cancelBtn', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.saveBtn} onPress={handleSaveMetaEdit}>
                <Text style={localStyles.saveBtnText}>{tGm('envCombat.presetModal.saveBtn', locale)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модалка перемещения плитки в папку */}
      <Modal
        visible={moveFolderModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveFolderModal(null)}
      >
        <View style={localStyles.modalBackdrop}>
          <View style={localStyles.modalCard}>
            <Text style={localStyles.modalTitle}>{tGm('envCombat.menu.moveToFolder', locale)}</Text>
            <TouchableOpacity
              style={localStyles.folderPickRow}
              onPress={() => handleMovePresetToFolder(moveFolderModal.entry, null)}
            >
              <MaterialCommunityIcons name="view-grid-outline" size={18} color="#f0e68c" />
              <Text style={localStyles.folderPickText}>{tGm('envCombat.presetModal.noFolder', locale)}</Text>
            </TouchableOpacity>
            {folders.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={localStyles.folderPickRow}
                onPress={() => handleMovePresetToFolder(moveFolderModal.entry, f.id)}
              >
                <MaterialCommunityIcons name="folder-outline" size={18} color="#f0e68c" />
                <Text style={localStyles.folderPickText}>{f.name}</Text>
              </TouchableOpacity>
            ))}
            <View style={localStyles.modalFooter}>
              <TouchableOpacity style={localStyles.cancelBtn} onPress={() => setMoveFolderModal(null)}>
                <Text style={localStyles.cancelBtnText}>{tGm('commands.cancelBtn', locale)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Меню выбора языка */}
      <Modal
        visible={languageMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageMenuOpen(false)}
      >
        <Pressable style={localStyles.menuBackdrop} onPress={() => setLanguageMenuOpen(false)}>
          <View style={[localStyles.modalCard, { maxWidth: 260, alignSelf: 'center', marginTop: 80 }]}>
            {SUPPORTED_LOCALES.map((loc) => (
              <TouchableOpacity
                key={loc}
                style={localStyles.folderPickRow}
                onPress={() => {
                  setCurrentLocale(loc);
                  setLanguageMenuOpen(false);
                }}
              >
                <Text style={[localStyles.folderPickText, loc === locale && { color: '#f0e68c', fontWeight: '700' }]}>
                  {localeLabel(loc)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Модалка настройки 4 механик */}
      <EnvMechanicModal
        visible={activeMechanic != null}
        mechanicType={activeMechanic?.mechanicType}
        initialPayload={activeMechanic?.initialPayload}
        initialPresetMeta={activeMechanic?.initialPresetMeta}
        folders={folders}
        roomCharacters={roomCharacters}
        selectedTargetId={selectedTargetId}
        hasLiveRoom={Boolean(selectedRoomCode && activeRoom)}
        onClose={() => setActiveMechanic(null)}
        onDispatchDirective={dispatchEnvDirective}
        onSavePresetTile={handleSavePresetFromModal}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  headerSubtitle: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 1,
  },
  targetBar: {
    backgroundColor: 'rgba(24, 27, 32, 0.94)',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  barLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  offlineTag: {
    color: '#f0e68c',
    fontSize: 12,
    fontStyle: 'italic',
  },
  pillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#272c33',
  },
  pillActive: {
    borderColor: '#f0e68c',
    backgroundColor: '#f0e68c',
  },
  pillText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(240,230,140,0.45)',
    backgroundColor: 'rgba(240,230,140,0.1)',
  },
  timeBtnText: {
    color: '#f0e68c',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#f0e68c',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  savedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  folderHeaderDesc: {
    color: '#9ca3af',
    fontSize: 12,
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#f0e68c',
    backgroundColor: 'rgba(240,230,140,0.1)',
  },
  backBtnText: {
    color: '#f0e68c',
    fontSize: 12,
    fontWeight: '700',
  },
  mechanicTile: {
    minHeight: 118,
    justifyContent: 'flex-start',
  },
  folderCard: {
    borderColor: 'rgba(240, 230, 140, 0.5)',
    backgroundColor: 'rgba(38, 43, 50, 0.96)',
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  tileDesc: {
    color: '#9ca3af',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  activePillBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  activePillText: {
    color: '#fca5a5',
    fontSize: 10,
    fontWeight: '700',
  },
  formulaBadge: {
    color: '#f0e68c',
    fontSize: 11,
    fontWeight: '700',
  },
  dotsBtn: {
    padding: 4,
    borderRadius: 4,
  },
  emptyHint: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  menuPopup: {
    position: 'absolute',
    backgroundColor: '#1f2328',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(240, 230, 140, 0.45)',
    paddingVertical: 4,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  menuItemText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1f2328',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(240, 230, 140, 0.45)',
    padding: 16,
    gap: 8,
  },
  modalTitle: {
    color: '#f0e68c',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  inputLabel: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#272c33',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4b5563',
    color: '#f9fafb',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#272c33',
  },
  cancelBtnText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 5,
    backgroundColor: '#f0e68c',
  },
  saveBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  folderPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: '#272c33',
    marginBottom: 4,
  },
  folderPickText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
});
