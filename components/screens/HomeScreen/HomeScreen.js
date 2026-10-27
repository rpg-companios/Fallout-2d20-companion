import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
  Linking,
  TextInput,
  PanResponder,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useCharacterStore from '../../../src/store/characterStore';
// Шаг 8б (патч 242): сохранения — обычный модуль без React.
import * as savesModule from '../../../src/saves/characterSaves';
import { findEnrichedOrigin } from '../../../domain/origins';
import {
  SUPPORTED_LOCALES,
  useLocale,
  useModuleLocale,
} from '../../../i18n/locale';
import {
  getActiveModuleId,
  getModuleLocales,
  shouldOfferModuleLocaleChoice,
} from '../../../domain/moduleLocale';
import { tHomeScreen } from './logic/homeScreenI18n';
import { getLocaleLabel } from './logic/localeLabel';
import * as db from '../../../db';
import {
  createCharacterExportPayload,
  parseCharacterImportPayload,
  downloadCharacterPayload,
  pickCharacterFile,
  IMPORT_ERRORS,
} from './logic/characterTransfer';
import { deleteCharacterFromCloudIfEnabled, openCloudFolderInDrive, syncAllCharactersWithCloud } from '../../cloudSync/googleDriveSync';
import { showAlert as showCatalogAlert, showRawAlert, confirmAlert } from '../../alerts/alertService';
import { forcePwaUpdate } from '../../../src/utils/forcePwaUpdate';
import { debugLog } from '../../../src/debug/falloutDebug';
import styles from '../../../styles/HomeScreen.styles';
import SettingsModal from '../../settings/SettingsModal';
// 446 (владелец, 2026-10-25): окно «Игровой сеттинг» скрыто в UI — установка
// сеттингов уходит в будущее. То, что остаётся живым из его содержимого —
// установку паков контента — перенесено в Настройки → «Собственное
// снаряжение». Файл окна (components/settings/GameSettingsModal.js) и его
// стор сохранены для будущего режима установки сеттингов; ниже — только
// погашенные места монтажа. Возврат в UI = GAME_SETTINGS_UI_ENABLED = true.
import GameSettingsModal from '../../settings/GameSettingsModal';
const GAME_SETTINGS_UI_ENABLED = false;

// 447: GM-режим («Админ»/админка) — НЕ закончен: вход в него скрыт
// выключателем, весь код комнат (roomClient/roomStore/эффекты привязок)
// сохранён для следующего этапа — «сервер состояний», который через
// интернет сведёт клиента и админа и будет транслировать админу состояние
// персонажа клиента. Возврат в UI = GM_MODE_UI_ENABLED = true. Если uiMode
// уже 'gm' (переключили раньше), кнопка выхода остаётся — чтобы не
// запереть пользователя внутри скрытого режима.
const GM_MODE_UI_ENABLED = false;

// 448/451: Toggle отображения пространства админа подключён к appSettingsStore:
// adminScreenEnabled (default: false). Управляется через окно настроек.
import useSettingPackStore, {
  selectBundledSettingActive,
} from '../../../src/store/settingPackStore';
import useAppSettingsStore, {
  selectAdminScreenEnabled,
  selectCharacterDeleteActionPlacement,
  selectCharacterFoldersEnabled,
  selectPwaInstallDiagnosticsEnabled,
  selectUiMode,
} from '../../../src/store/appSettingsStore';
import * as avatarCache from '../../../db/avatarCache';
// Комнаты мастера (gm-rooms, этапы 0–2): стор соединения + адреса комнат.
import useRoomStore from '../../../src/room/roomStore';
import { isRoomServerConfigured } from '../../../src/room/roomClient';
import { toCanonicalRoomCode, formatRoomCodeForDisplay } from '../../../src/room/roomCode';

const getOriginImage = (originName) => {
  if (!originName) return null;
  const found = findEnrichedOrigin(originName);
  return found ? found.image : null;
};

const NUM_COLS = 3;

const ActionCell = ({ icon, label, onPress, disabled = false }) => (
  <TouchableOpacity style={[styles.createCell, disabled && styles.disabledCell]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
    {typeof icon === 'string' ? <Text style={styles.createPlus}>{icon}</Text> : icon}
    <Text style={styles.createLabel}>{label}</Text>
  </TouchableOpacity>
);

const CHARACTER_ACTION_MENU_WIDTH = 220;

const CharacterCell = ({
  character,
  deleteActionPlacement,
  onPress,
  onDelete,
  onDownload,
  onDuplicate,
  onServer,
  serverAvailable = false,
  serverBound = false,
  onDragStart,
  onDragMove,
  onDragEnd,
}) => {
  const originImage = getOriginImage(character.originName);
  const [customImageUrl, setCustomImageUrl] = useState(null);

  // Загружаем кастомную картинку при монтировании
  useEffect(() => {
    if (character?.id) {
      avatarCache.getAvatarCache(character.id).then((cached) => {
        setCustomImageUrl(cached?.data_url || cached?.dataUrl || null);
      });
    }
  }, [character?.id]);
  const actionButtonRef = useRef(null);
  const [actionMenuPosition, setActionMenuPosition] = useState(null);

  const openActionMenu = (event) => {
    event?.stopPropagation?.();
    actionButtonRef.current?.measureInWindow((x, y, width, height) => {
      const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
      // Пункт «Сервер» (gm-rooms) добавляет одну строку к меню.
      const menuHeight = (deleteActionPlacement === 'menu' ? 144 : 100) + (serverAvailable ? 44 : 0);
      const left = Math.max(8, Math.min(x + width - CHARACTER_ACTION_MENU_WIDTH, windowWidth - CHARACTER_ACTION_MENU_WIDTH - 8));
      const top = y + height + menuHeight + 8 <= windowHeight
        ? y + height + 4
        : Math.max(8, y - menuHeight - 4);
      setActionMenuPosition({ top, left });
    });
  };

  const runAction = (action) => {
    setActionMenuPosition(null);
    action();
  };

  // PanResponder keeps ownership of the pointer after it leaves the small handle,
  // which Touchable's touch callbacks do not guarantee on web and native.
  const callbacks = useRef({});
  callbacks.current = { character, onDragStart, onDragMove, onDragEnd };
  // Track the last known pointer position: on release/terminate the gesture can
  // report moveX/moveY as 0 when no move was registered in that cycle.
  const lastPoint = useRef({ pageX: 0, pageY: 0 });
  const dragging = useRef(false);
  const panResponder = useRef(PanResponder.create({
    // Capture variants keep the parent TouchableOpacity/ScrollView from taking
    // the touch before the handle gets it.
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Never hand the gesture over to the enclosing ScrollView: otherwise the
    // first vertical movement terminates the drag and the handle immediately
    // re-grabs the finger, which makes the card jitter.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (_event, gesture) => {
      dragging.current = true;
      lastPoint.current = { pageX: gesture.x0, pageY: gesture.y0 };
      callbacks.current.onDragStart({ pageX: gesture.x0, pageY: gesture.y0 }, callbacks.current.character);
    },
    onPanResponderMove: (_event, gesture) => {
      if (gesture.moveX === 0 && gesture.moveY === 0) return;
      lastPoint.current = { pageX: gesture.moveX, pageY: gesture.moveY };
      callbacks.current.onDragMove(lastPoint.current);
    },
    onPanResponderRelease: () => {
      callbacks.current.onDragEnd(lastPoint.current);
      // Let the synthetic press that follows the release be swallowed.
      setTimeout(() => { dragging.current = false; }, 0);
    },
    onPanResponderTerminate: () => {
      callbacks.current.onDragEnd(lastPoint.current);
      setTimeout(() => { dragging.current = false; }, 0);
    },
  })).current;

  return (
    <TouchableOpacity style={styles.characterCell} onPress={() => { if (!dragging.current) onPress(); }} activeOpacity={0.8}>
      {serverBound && (
        <View style={styles.characterServerBadge} pointerEvents="none">
          <MaterialCommunityIcons name="server-network" size={16} color="#7c5c10" />
        </View>
      )}
      <View {...panResponder.panHandlers} style={styles.dragHandle}><MaterialCommunityIcons name="arrow-all" size={18} color="#111827" /></View>
      <View style={styles.characterImageContainer}>
        {customImageUrl ? (
          <Image source={{ uri: customImageUrl }} style={styles.characterImage} resizeMode="cover" />
        ) : originImage ? (
          <Image source={originImage} style={styles.characterImage} resizeMode="cover" />
        ) : (
          <View style={styles.characterImagePlaceholder}>
            <Text style={styles.characterImagePlaceholderText}>?</Text>
          </View>
        )}
      </View>
      {deleteActionPlacement === 'card' && (
        <TouchableOpacity style={styles.deleteButton} onPress={(event) => { event?.stopPropagation?.(); onDelete(); }} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }} accessibilityLabel={tHomeScreen('characterActions.delete')}>
          <Text style={styles.deleteIcon}>🗑</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        ref={actionButtonRef}
        style={styles.characterActionButton}
        onPress={openActionMenu}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
        accessibilityLabel={tHomeScreen('characterActions.openMenu')}
      >
        <MaterialCommunityIcons name="dots-vertical" size={20} color="#4b5563" />
      </TouchableOpacity>
      <Text style={styles.characterName} numberOfLines={2}>{character.name}</Text>
      {character.level ? <Text style={styles.characterLevel}>{tHomeScreen("labels.level")} {character.level}</Text> : null}

      <Modal
        visible={Boolean(actionMenuPosition)}
        transparent
        animationType="none"
        onRequestClose={() => setActionMenuPosition(null)}
      >
        <Pressable style={styles.characterActionBackdrop} onPress={() => setActionMenuPosition(null)}>
          {actionMenuPosition && (
            <View style={[styles.characterActionMenu, actionMenuPosition]}>
              {serverAvailable && (
                <TouchableOpacity style={styles.characterActionItem} onPress={() => runAction(onServer)}>
                  <MaterialCommunityIcons name="server-network" size={19} color="#111827" />
                  <Text style={styles.characterActionText}>{tHomeScreen('server.menuItem')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.characterActionItem} onPress={() => runAction(onDownload)}>
                <MaterialCommunityIcons name="download" size={19} color="#111827" />
                <Text style={styles.characterActionText}>{tHomeScreen('characterActions.download')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.characterActionItem} onPress={() => runAction(onDuplicate)}>
                <MaterialCommunityIcons name="content-copy" size={19} color="#111827" />
                <Text style={styles.characterActionText}>{tHomeScreen('characterActions.duplicate')}</Text>
              </TouchableOpacity>
              {deleteActionPlacement === 'menu' && (
                <TouchableOpacity style={styles.characterActionItem} onPress={() => runAction(onDelete)}>
                  <MaterialCommunityIcons name="delete-outline" size={19} color="#b91c1c" />
                  <Text style={[styles.characterActionText, styles.characterActionDeleteText]}>{tHomeScreen('characterActions.delete')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
};

const EmptyCell = ({ id }) => <View key={id} style={styles.emptyCell} />;


// 389: живая диагностика установки PWA — показывается в окнах инструкции
// (iOS/Android/десктоп). Только web. Главный вопрос «почему не ставится»:
// Chrome молча не показывает диалог, если считает приложение установленным;
// манифест/иконки/воркер проверяются живьём; «уже установлено» — через
// getInstalledRelatedApps (related_applications добавлены в manifest.json).
// 392: «установлено / не установлено» — не провал, а пояснение, поэтому
// оно вне списка проверок с красным стилем (краснеет только настоящий
// провал: воркер / манифест / иконки).
// 394: владельцу без нативного диалога нужно имя браузера и обходной путь —
// диалог шлют не все браузеры, а Chrome держит паузу после отмен.
const BROWSER_LABEL_KEYS = {
  chrome: 'pwa.browserChrome',
  mi: 'pwa.browserMi',
  samsung: 'pwa.browserSamsung',
  yandex: 'pwa.browserYandex',
  firefox: 'pwa.browserFirefox',
  opera: 'pwa.browserOpera',
  edge: 'pwa.browserEdge',
  safari: 'pwa.browserSafari',
  other: 'pwa.browserOther',
};

const detectBrowserId = () => {
  const ua = navigator.userAgent || '';
  // Порядок важен: Edge/Opera/Samsung/Yandex сами построены на Chrome
  // и содержат «Chrome/» в userAgent.
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/MiuiBrowser|XiaoMi/i.test(ua)) return 'mi';
  if (/YaBrowser/i.test(ua)) return 'yandex';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Chrome\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'safari';
  return 'other';
};

const INSTALL_DIAG_LINES = [
  ['sw', 'pwa.diagSwYes', 'pwa.diagSwNo'],
  ['manifest', 'pwa.diagManifestYes', 'pwa.diagManifestNo'],
  ['icons', 'pwa.diagIconsYes', 'pwa.diagIconsNo'],
];

const PwaInstallDiagnostics = ({ installPrompt }) => {
  // 390: блок показывается только с включённой настройкой
  // «Диагностика установки» (по умолчанию выключена).
  const diagnosticsEnabled = useAppSettingsStore(selectPwaInstallDiagnosticsEnabled);
  const [results, setResults] = useState(null);
  const versionRef = useRef('');

  useEffect(() => {
    if (!diagnosticsEnabled) return undefined;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    let cancelled = false;
    const run = async () => {
      const found = {};
      try {
        const related = await navigator.getInstalledRelatedApps?.() || [];
        found.installed = related.length > 0;
      } catch (_) { found.installed = false; }
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        found.sw = Boolean(reg?.active || reg?.waiting || reg?.installing);
      } catch (_) { found.sw = false; }
      found.manifest = false;
      found.icons = false;
      try {
        const res = await fetch('/manifest.json', { cache: 'no-store' });
        if (res.ok) {
          found.manifest = true;
          const manifest = await res.json();
          const icons = (manifest.icons || []).filter((icon) => icon?.src).slice(0, 2);
          // 392: именно window.Image — в этом файле «Image» из react-native,
          // его конструктор строит компонент, а не картинку, и проверка
          // рапортовала «иконки не загружаются» всегда. try/catch, чтобы
          // никакой бросок не подвесил обещание.
          const loaded = await Promise.all(icons.map((icon) => new Promise((resolve) => {
            try {
              const img = new window.Image();
              img.onload = () => resolve(true);
              img.onerror = () => resolve(false);
              img.src = icon.src;
            } catch (_) {
              resolve(false);
            }
          })));
          found.icons = loaded.length > 0 && loaded.every(Boolean);
        }
      } catch (_) { /* манифест недоступен */ }
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          versionRef.current = String(data?.version ?? '');
        }
      } catch (_) { /* версия недоступна */ }
      if (!cancelled) setResults(found);
    };
    run();
    return () => { cancelled = true; };
  }, [diagnosticsEnabled]);

  if (Platform.OS !== 'web' || !diagnosticsEnabled || !results) return null;
  return (
    <View style={styles.diagBlock}>
      <Text style={styles.diagTitle}>{tHomeScreen('pwa.diagnosticsTitle')}</Text>
      {results.installed ? (
        <Text style={styles.diagTextInfo}>ℹ {tHomeScreen('pwa.diagInstalledYes')}</Text>
      ) : (
        <Text style={styles.diagText}>✓ {tHomeScreen('pwa.diagInstalledNo')}</Text>
      )}
      {INSTALL_DIAG_LINES.map(([key, yesKey, noKey]) => (
        <Text key={key} style={[styles.diagText, !results[key] && styles.diagTextBad]}>
          {results[key] ? '✓' : '✕'} {tHomeScreen(results[key] ? yesKey : noKey)}
        </Text>
      ))}
      <Text style={styles.diagText}>
        {tHomeScreen('pwa.diagBrowser')}: {tHomeScreen(BROWSER_LABEL_KEYS[detectBrowserId()])}
      </Text>
      {installPrompt ? (
        <Text style={styles.diagText}>✓ {tHomeScreen('pwa.diagPromptAvailable')}</Text>
      ) : (
        <>
          <Text style={styles.diagText}>• {tHomeScreen('pwa.diagPromptAbsent')}</Text>
          {/*
            395: обходной путь — хорошая новость, а не тревога: янтарный
            цвет (diagTextInfo) владелец прочёл как красный/ошибку. Зелёная
            галочка в одном ряду с остальными «✓ это работает».
          */}
          <Text style={styles.diagText}>✓ {tHomeScreen('pwa.diagPromptWorkaround')}</Text>
          <Text style={styles.diagText}>• {tHomeScreen('pwa.diagStaleShortcut')}</Text>
        </>
      )}
      {versionRef.current ? (
        <Text style={styles.diagText}>
          {tHomeScreen('pwa.diagVersion')}: {versionRef.current}
        </Text>
      ) : null}
    </View>
  );
};

export default function HomeScreen({ navigation }) {
  const locale = useLocale();
  const moduleLocale = useModuleLocale();
  // Шаг 8б (патч 242): папка сохранений — модуль src/saves/characterSaves.js,
  // сброс — стор-экшен; фасад useCharacter() сейв-члены больше не отдаёт.
  const getCharactersList = savesModule.getCharactersList;
  const loadCharacter = savesModule.loadCharacter;
  const deleteCharacter = savesModule.deleteCharacter;
  const resetCharacter = useCharacterStore((s) => s.resetCharacter);
  const [characters, setCharacters] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderCounts, setFolderCounts] = useState({});
  const [folderDraftVisible, setFolderDraftVisible] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [activeFolder, setActiveFolder] = useState(null);
  const [movingCharacterId, setMovingCharacterId] = useState(null);
  const [drag, setDrag] = useState(null);
  const folderRefs = useRef({});
  const rootDropRef = useRef(null);
  const dropBounds = useRef({});
  const characterFoldersEnabled = useAppSettingsStore(selectCharacterFoldersEnabled);
  const characterDeleteActionPlacement = useAppSettingsStore(selectCharacterDeleteActionPlacement);
  const setSettingValue = useAppSettingsStore((state) => state.setValue);
  const setModuleLocale = useAppSettingsStore((state) => state.setModuleLocale);
  const activeModuleId = getActiveModuleId();
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  // null = синка не идёт. Иначе { stage, current, total } — модалка-заглушка
  // перекрывает экран, поэтому повторный запуск невозможен by design.
  const [syncProgress, setSyncProgress] = useState(null);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null); // null | 'privacy' | 'terms'
  const [communityVisible, setCommunityVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [gameSettingsVisible, setGameSettingsVisible] = useState(false);
  const bundledSettingActive = useSettingPackStore(selectBundledSettingActive);

  // ── Комнаты мастера (gm-rooms, этапы 0–2) ──
  // uiMode: 'user' | 'gm' — кнопка «Админ/Пользователь» в шапке (§3.9:
  // кнопки нет, когда адрес сервера недоступен — пространства нет).
  const uiMode = useAppSettingsStore(selectUiMode);
  const adminScreenEnabled = useAppSettingsStore(selectAdminScreenEnabled);
  const isGmMode = uiMode === 'gm';
  const roomServerAvailable = isRoomServerConfigured();
  const roomRooms = useRoomStore((state) => state.rooms);
  // В режиме мастера папки = комнаты и доступны всегда (настройка
  // «каталоги персонажей» на них не распространяется).
  const foldersEnabled = isGmMode || characterFoldersEnabled;
  const [folderRooms, setFolderRooms] = useState({}); // folderId -> code
  const [roomBindings, setRoomBindings] = useState({}); // characterId -> code
  const [roomDialog, setRoomDialog] = useState(null); // { code } — адрес/участники комнаты
  const [serverDialog, setServerDialog] = useState(null); // { character, boundCode, address, busy, error }
  const [copiedCode, setCopiedCode] = useState(null);

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [iosInstallVisible, setIosInstallVisible] = useState(false);
  const [androidInstallVisible, setAndroidInstallVisible] = useState(false);
  const [desktopInstallVisible, setDesktopInstallVisible] = useState(false);

  useEffect(() => {
    if (!foldersEnabled && folderDraftVisible) {
      setFolderDraftVisible(false);
      setFolderName('');
    }
  }, [foldersEnabled, folderDraftVisible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);

    if (window.__pwaInstallPrompt) {
      setInstallPrompt(window.__pwaInstallPrompt);
    }

    const onPromptReady = (e) => setInstallPrompt(e.detail);
    const onInstalled = () => { setIsStandalone(true); setInstallPrompt(null); };

    window.addEventListener('pwaInstallPromptReady', onPromptReady);
    window.addEventListener('pwaInstalled', onInstalled);
    return () => {
      window.removeEventListener('pwaInstallPromptReady', onPromptReady);
      window.removeEventListener('pwaInstalled', onInstalled);
    };
  }, []);

  const isIosSafari = Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios|opios|mercury/i.test(navigator.userAgent);

  const isAndroidMobile = Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent) &&
    /mobile/i.test(navigator.userAgent);

  const showInstallButton = Platform.OS === 'web' && !isStandalone;

  const handleInstallPress = async () => {
    if (installPrompt) {
      try {
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
          setInstallPrompt(null);
          setIsStandalone(true);
          window.__pwaInstallPrompt = null;
          return;
        }
      } catch (_) {}
    }
    if (isIosSafari) {
      setIosInstallVisible(true);
    } else if (isAndroidMobile) {
      setAndroidInstallVisible(true);
    } else {
      setDesktopInstallVisible(true);
    }
  };
  const localizeLocaleLabel = (code) => getLocaleLabel({
    code,
    displayLocale: locale,
    translate: tHomeScreen,
  });
  const languageOptions = SUPPORTED_LOCALES.map((code) => ({
    code,
    label: localizeLocaleLabel(code),
  }));
  const moduleLanguageOptions = getModuleLocales(activeModuleId).map((code) => ({
    code,
    label: localizeLocaleLabel(code),
  }));
  const showModuleLanguageSelector = shouldOfferModuleLocaleChoice({
    moduleId: activeModuleId,
    engineLocale: locale,
  });

  const loadList = useCallback(async ({ duplicatedCharacterId, sourceCharacterId } = {}) => {
    setLoading(true);
    try {
      const savedFolders = await db.getCharacterFolders();
      const folderLists = await Promise.all(savedFolders.map((folder) => db.getCharactersInFolder(folder.id)));
      const counts = Object.fromEntries(savedFolders.map((folder, index) => [folder.id, folderLists[index].length]));
      const visible = activeFolder ? folderLists[savedFolders.findIndex((folder) => folder.id === activeFolder.id)] || [] : await db.getRootCharactersList();
      visible.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (duplicatedCharacterId && sourceCharacterId) {
        const duplicateIndex = visible.findIndex((item) => item.id === duplicatedCharacterId);
        const sourceIndex = visible.findIndex((item) => item.id === sourceCharacterId);
        if (duplicateIndex >= 0 && sourceIndex >= 0) {
          const [duplicate] = visible.splice(duplicateIndex, 1);
          const currentSourceIndex = visible.findIndex((item) => item.id === sourceCharacterId);
          visible.splice(currentSourceIndex + 1, 0, duplicate);
        }
      }
      setCharacters(visible);
      setFolders(savedFolders);
      setFolderCounts(counts);
      // Комнаты мастера: штампы папок-комнат и связки персонажей.
      // Сбой этих таблиц не должен ронять основной список персонажей.
      if (roomServerAvailable) {
        try {
          const [roomRows, bindingRows] = await Promise.all([
            db.getFolderRooms(),
            db.getCharacterRoomBindings(),
          ]);
          setFolderRooms(Object.fromEntries(roomRows.map((row) => [row.folder_id, row.code])));
          setRoomBindings(Object.fromEntries(bindingRows.map((row) => [row.character_id, row.code])));
        } catch (roomError) {
          debugLog('room.dbLoad:failed', { message: roomError?.message || String(roomError) });
        }
      }
    } catch (e) {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, [getCharactersList, activeFolder, roomServerAvailable]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList])
  );

  const handleCreateFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    if (!isGmMode) {
      await db.createCharacterFolder(name);
      setFolderName('');
      setFolderDraftVisible(false);
      loadList();
      return;
    }
    // Режим мастера: папка — это серверная комната (§1 плана gm-rooms).
    // Сначала комната на сервере, потом локальная папка со штампом;
    // при сбое сети папку не создаём — сироты «папка без комнаты» не нужны.
    try {
      const { code, ownerToken } = await useRoomStore.getState().createRoom({ name });
      const folder = await db.createCharacterFolder(name);
      await db.upsertFolderRoom(folder.id, code, ownerToken);
      setFolderName('');
      setFolderDraftVisible(false);
      setRoomDialog({ code });
      loadList();
    } catch (error) {
      debugLog('room.create:failed', { message: error?.message || String(error) });
      setFolderDraftVisible(false);
      showHomeAlert(tHomeScreen('room.createdTitle'), tHomeScreen('room.createFailed'));
    }
  };

  const copyRoomCode = async (code) => {
    const text = formatRoomCodeForDisplay(code);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
      } catch (error) {
        debugLog('room.copy:failed', { message: error?.message || String(error) });
      }
    }
  };

  // Пункт меню персонажа «Сервер» (пользовательская сторона).
  const handleServer = async (character) => {
    try {
      const binding = await db.getCharacterRoomBinding(character.id);
      setServerDialog({ character, boundCode: binding?.code || null, address: '', busy: false, error: null });
    } catch (error) {
      debugLog('server.menu:failed', { message: error?.message || String(error) });
    }
  };

  const handleServerJoin = async () => {
    if (!serverDialog || serverDialog.busy) return;
    const canonical = toCanonicalRoomCode(serverDialog.address);
    if (!canonical) {
      setServerDialog({ ...serverDialog, error: tHomeScreen('server.invalidAddress') });
      return;
    }
    const joining = { ...serverDialog, busy: true, error: null };
    setServerDialog(joining);
    try {
      await useRoomStore.getState().joinRoom({ code: canonical, name: joining.character.name, role: 'player' });
      await db.setCharacterRoomBinding(joining.character.id, canonical);
      setServerDialog(null);
      loadList();
    } catch (error) {
      const code = error?.message;
      const key = code === 'ROOM_NOT_FOUND' ? 'server.notFound'
        : code === 'ROOM_FULL' ? 'server.roomFull'
        : 'server.unavailable';
      debugLog('room.join:failed', { code: canonical, error: String(code) });
      setServerDialog({ ...joining, busy: false, error: tHomeScreen(key) });
    }
  };

  const handleServerLeave = async () => {
    if (!serverDialog) return;
    const { character, boundCode } = serverDialog;
    try {
      await useRoomStore.getState().leaveRoom({ code: boundCode });
    } catch (error) {
      debugLog('room.leave:failed', { message: error?.message || String(error) });
    }
    await db.setCharacterRoomBinding(character.id, null);
    setServerDialog(null);
    loadList();
  };

  const handleToggleUiMode = () => {
    setSettingValue('uiMode', isGmMode ? 'user' : 'gm');
    setFolderDraftVisible(false);
    setFolderName('');
    setRoomDialog(null);
    setServerDialog(null);
  };

  // Мастер держит свои комнаты открытыми (presence игроков).
  useEffect(() => {
    if (!isGmMode || !roomServerAvailable) return;
    Object.values(folderRooms).forEach((code) => {
      const store = useRoomStore.getState();
      if (!store.rooms[code]) {
        store.joinRoom({ code, name: 'GM', role: 'gm' }).catch(() => {});
      }
    });
  }, [isGmMode, folderRooms, roomServerAvailable]);

  // Игрок переподключает своих персонажей к их комнатам (по связкам).
  useEffect(() => {
    if (isGmMode || !roomServerAvailable) return;
    Object.entries(roomBindings).forEach(([characterId, code]) => {
      const store = useRoomStore.getState();
      if (!store.rooms[code]) {
        const character = characters.find((item) => item.id === characterId);
        store.joinRoom({ code, name: character?.name || '—', role: 'player' }).catch(() => {});
      }
    });
  }, [isGmMode, roomBindings, characters, roomServerAvailable]);

  const handleMoveToFolder = async (folderId, characterId = movingCharacterId) => {
    if (!characterId) return;
    try {
      await db.moveCharacterToFolder(characterId, folderId);
      setMovingCharacterId(null);
      setDrag(null);
      dropBounds.current = {};
      await loadList();
    } catch (error) {
      // Keep the drag state visible if persistence fails so the user can retry
      // instead of losing the intended move silently.
    }
  };

  const measureDropTargets = useCallback(() => {
    const measurements = Object.entries(folderRefs.current)
      .map(([id, ref]) => new Promise((resolve) => {
        if (!ref?.measureInWindow) {
          resolve();
          return;
        }
        ref.measureInWindow((x, y, width, height) => {
          dropBounds.current[id] = { x, y, width, height };
          resolve();
        });
      }));

    measurements.push(new Promise((resolve) => {
      if (!rootDropRef.current?.measureInWindow) {
        resolve();
        return;
      }
      rootDropRef.current.measureInWindow((x, y, width, height) => {
        dropBounds.current.root = { x, y, width, height };
        resolve();
      });
    }));

    return Promise.all(measurements);
  }, []);

  // The root drop zone is conditionally rendered after movingCharacterId is
  // set. Measuring it inside handleDragStart happens before that render, so
  // rootDropRef is null. Measure again after the zone has mounted.
  useEffect(() => {
    if (!movingCharacterId) {
      delete dropBounds.current.root;
      return;
    }

    const frame = requestAnimationFrame(() => {
      measureDropTargets();
    });
    return () => cancelAnimationFrame(frame);
  }, [movingCharacterId, activeFolder, measureDropTargets]);

  const handleDragStart = async (event, character) => {
    dropBounds.current = {};
    setMovingCharacterId(character.id);
    setDrag({ character, x: event.pageX, y: event.pageY });
    await measureDropTargets();
  };
  const handleDragMove = (event) => setDrag((current) => current && { ...current, x: event.pageX, y: event.pageY });
  const handleDragEnd = async (event) => {
    // A final measurement covers the case where the pointer is released
    // immediately after the conditionally rendered root zone appears.
    await measureDropTargets();
    const target = Object.entries(dropBounds.current).find(([id, b]) => id !== 'root' && b && event.pageX >= b.x && event.pageX <= b.x + b.width && event.pageY >= b.y && event.pageY <= b.y + b.height);
    if (target) await handleMoveToFolder(target[0]);
    else {
      const root = dropBounds.current.root;
      if (root && event.pageX >= root.x && event.pageX <= root.x + root.width && event.pageY >= root.y && event.pageY <= root.y + root.height) await handleMoveToFolder(null);
      else { setMovingCharacterId(null); setDrag(null); }
    }
  };

  // Показ уведомления через общий AlertHost: одна и та же React-модалка на
  // вебе и на нативе. Раньше здесь была своя копия развилки Platform.OS с
  // window.alert — таких копий по проекту было пять.
  const showHomeAlert = (title, message = '') => showRawAlert({ title, message });

  const handleDeleteFolder = async (folder) => {
    const remove = async () => {
      // deleteCharacterFolderAndCharacters возвращает id удалённых персонажей —
      // их облачные копии тоже надо убрать, иначе вся папка воскреснет при
      // следующей синхронизации (но уже без структуры каталогов).
      const removedIds = await db.deleteCharacterFolderAndCharacters(folder.id);
      for (const id of removedIds || []) {
        await deleteCharacterFromCloudIfEnabled(id);
      }
      debugLog('folder.delete:done', { folderId: folder.id, characters: removedIds?.length || 0 });
      if (activeFolder?.id === folder.id) setActiveFolder(null);
      loadList();
    };
    const confirmed = await confirmAlert('folderDelete', { count: folderCounts[folder.id] || 0 });
    if (confirmed) remove();
  };

  const handleCreate = () => {
    if (!bundledSettingActive) return;
    resetCharacter();
    navigation.navigate('CharacterTab');
  };

  const handleOpen = async (id) => {
    if (!bundledSettingActive) return;
    const ok = await loadCharacter(id);
    if (ok) {
      navigation.navigate('CharacterTab');
    }
  };

  const handleDelete = async (character) => {
    // Удаление сквозное: локально И в облаке. Без удаления в облаке персонаж
    // воскресал при следующей синхронизации — она не отличает «я это удалил»
    // от «этого у меня ещё не было» (сверка идёт по наличию id локально).
    // Поэтому текст предупреждения обязан быть прямым: операция необратима и
    // затрагивает все устройства.
    const confirmDelete = async () => {
      debugLog('character.delete:start', { id: character.id });
      const cloud = await deleteCharacterFromCloudIfEnabled(character.id);
      await deleteCharacter(character.id);
      debugLog('character.delete:done', { id: character.id, cloud });
      await loadList();

      // Если облачная копия осталась (сеть/авторизация отвалились), молчать
      // нельзя: при следующем синке персонаж вернётся, и это выглядит как баг.
      if (cloud.reason === 'error') {
        await showCatalogAlert('characterDeleteCloudFailed');
      }
    };

    if (await confirmAlert('characterDelete')) await confirmDelete();
  };

  const handleDuplicate = async (character) => {
    try {
      const duplicate = await db.duplicateCharacter(
        character.id,
        tHomeScreen('characterActions.copySuffix'),
      );
      await loadList({
        duplicatedCharacterId: duplicate.id,
        sourceCharacterId: character.id,
      });
    } catch (error) {
      debugLog('home.duplicateCharacter.failed', { message: error?.message });
      showCatalogAlert('characterDuplicateError');
    }
  };

  const handleDownload = async (character) => {
    if (false) { // cross-platform
      showCatalogAlert('downloadUnsupported');
      return;
    }

    try {
      const row = await db.loadCharacterById(character.id);
      if (!row) {
        showCatalogAlert('downloadNotFound');
        return;
      }

      // 361: экспорт = тело сейва байт в байт (слайм — только в saveCharacter,
      // повторная обработка тела на экспорте давала расхождения «экспорт ≠ сейв»).
      const payload = createCharacterExportPayload(row);
      const result = await downloadCharacterPayload(payload, row.name);
      
      if (!result.success && !result.aborted) {
        showCatalogAlert('downloadFailed');
      }
    } catch (error) {
      debugLog('home.characterDownload.failed', { message: error?.message });
      showCatalogAlert('downloadUnexpected');
    }
  };

  const handleUpload = async () => {
    if (false) { // cross-platform
      showCatalogAlert('uploadUnsupported');
      return;
    }

    try {
      // Вызов pickCharacterFile должен быть первым в обработчике для user activation
      const rawText = await pickCharacterFile();
      if (!rawText) return;

      const parsed = parseCharacterImportPayload(rawText);
      if (parsed.error) {
        showHomeAlert(tHomeScreen('title'), tHomeScreen(IMPORT_ERRORS[parsed.error]));
        return;
      }

      const importedCharacter = parsed.character;
      const existing = characters.find((item) => item.name === importedCharacter.name);

      const persistImport = async () => {
        const id = existing?.id || importedCharacter.id || `char_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        await db.saveCharacter(
          id,
          importedCharacter.name,
          importedCharacter.level ?? 1,
          importedCharacter.originName ?? null,
          importedCharacter.data
        );
        await loadList();
      };

      if (!existing) {
        await persistImport();
        return;
      }

      if (await confirmAlert('importOverwrite')) await persistImport();
    } catch (error) {
      debugLog('home.characterUpload.failed', { message: error?.message });
      showCatalogAlert('uploadUnexpectedError');
    }
  };

  const handleCloudSync = async () => {
    setMenuVisible(false);
    if (Platform.OS !== 'web') {
      showCatalogAlert('cloudSyncUnsupported');
      return;
    }

    // Защита от повторного запуска: кнопка в меню, автосинк и второй клик
    // не должны стартовать вторую сессию поверх текущей.
    if (syncProgress) return;

    debugLog('sync.manual:start', {});
    setSyncProgress({ stage: 'auth', current: 0, total: 0 });
    try {
      const result = await syncAllCharactersWithCloud({
        onProgress: setSyncProgress,
        confirmDownload: async (items) => {
          debugLog('sync.manual:confirmDownload', { count: items.length });
          return confirmAlert('cloudRemoteIsNewer', { count: items.length });
        },
      });
      debugLog('sync.manual:done', result);
      setSyncProgress(null);
      await loadList();
      await openCloudFolderInDrive();
      await showCatalogAlert('cloudSyncSuccess', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
      });
    } catch (e) {
      const reason = e?.message || String(e);
      debugLog('sync.manual:failed', { message: reason });
      setSyncProgress(null);
      await showCatalogAlert('cloudSyncError', { reason });
    }
  };

  const openExternalLink = async (url) => {
    // Правило (владелец, патч 144): ВСЕ внешние/правовые ссылки открываются
    // строго в новой вкладке (web) или системном браузере (натив). Нельзя
    // перенаправлять текущую вкладку PWA — иначе юзер потеряет состояние
    // приложения (несохранённые изменения персонажа, открытую модалку).
    //
    // - web/PWA: window.open с target=_blank + noopener (безопасность: новая
    //   вкладка не получает window.opener, не может управлять исходной).
    // - native: Linking.openURL — на iOS/Android открывает системный браузер
    //   или дефолтный handler, юзер возвращается в приложение по back.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (opened) return;
      } catch {
        // window.open может быть заблокирован popup-blocker'ом — фолбэк ниже.
      }
    }
    try {
      await Linking.openURL(url);
    } catch {
      // Крайний фолбэк: не дать ссылке пропасть. На web без popup-blocker'а
      // window.open выше уже отработал. Здесь — последний шанс, на нативе.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // assigning to location эквивалентно «открыть в этой вкладке»,
        // но это лучше, чем молча ничего не делать.
        window.location.href = url;
      }
    }
  };

  const allItems = [
    ...(activeFolder
      ? []
      : [
          // В режиме мастера экран повторяет главный, но «создать/загрузить
          // персонажа» не показываем: здесь живут комнаты и копии игроков.
          ...(isGmMode ? [] : [{ type: 'create' }, { type: 'upload' }]),
          ...(foldersEnabled ? [{ type: 'createFolder' }] : []),
        ]),
    ...(activeFolder
      ? []
      : (folderDraftVisible && foldersEnabled ? [{ type: 'folderDraft' }] : [])),
    ...(activeFolder ? [] : folders.map((folder) => ({ type: 'folder', ...folder }))),
    ...characters.map(c => ({ type: 'character', ...c })),
  ];

  const rows = [];
  for (let i = 0; i < allItems.length; i += NUM_COLS) {
    rows.push(allItems.slice(i, i + NUM_COLS));
  }
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    while (lastRow.length < NUM_COLS) {
      lastRow.push({ type: 'empty', id: `empty_${lastRow.length}` });
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.languageRow}>
        <View style={styles.menuCell}>
          <Pressable style={styles.menuButton} onPress={() => setMenuVisible(true)}>
            <MaterialCommunityIcons name="menu" size={22} color="#f0e68c" />
          </Pressable>
        </View>
        <View style={styles.headerCenter}>
          {((GM_MODE_UI_ENABLED || adminScreenEnabled || isGmMode) && roomServerAvailable) && (
            <Pressable
              style={[styles.adminButton, isGmMode && styles.adminButtonActive]}
              onPress={handleToggleUiMode}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={tHomeScreen(isGmMode ? 'gm.exit' : 'gm.enter')}
            >
              <MaterialCommunityIcons
                name={isGmMode ? 'shield-crown-outline' : 'shield-account-outline'}
                size={18}
                color="#f0e68c"
              />
              <Text style={styles.adminButtonText}>{tHomeScreen(isGmMode ? 'gm.exit' : 'gm.enter')}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.languageContainer}>
          {languageOptions.map((lang, index) => {
            const isFirst = index === 0;
            const isLast = index === languageOptions.length - 1;
            return (
              <Pressable
                key={lang.code}
                style={[
                  styles.langSegment,
                  isFirst && styles.langSegmentLeft,
                  isLast && styles.langSegmentRight,
                  locale === lang.code && styles.langSegmentActive,
                ]}
                onPress={() => setSettingValue('language', lang.code)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={[styles.langSegmentText, locale === lang.code && styles.langSegmentTextActive]}>
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {showModuleLanguageSelector && (
        <View style={styles.moduleLanguageRow}>
          <Text style={styles.moduleLanguageLabel}>{tHomeScreen('language.settingTitle')}</Text>
          <View style={styles.languageContainer}>
            {moduleLanguageOptions.map((lang, index) => (
              <Pressable
                key={lang.code}
                style={[
                  styles.langSegment,
                  index === 0 && styles.langSegmentLeft,
                  index === moduleLanguageOptions.length - 1 && styles.langSegmentRight,
                  moduleLocale === lang.code && styles.langSegmentActive,
                ]}
                onPress={() => setModuleLocale(activeModuleId, lang.code)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={[
                  styles.langSegmentText,
                  moduleLocale === lang.code && styles.langSegmentTextActive,
                ]}>
                  {lang.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{tHomeScreen("title")}</Text>
        <Text style={styles.subtitle}>{tHomeScreen("subtitle")}</Text>
      </View>
      {activeFolder && <View style={styles.folderHeader}><TouchableOpacity onPress={() => { setActiveFolder(null); setMovingCharacterId(null); }}><Text style={styles.folderBack}>← {tHomeScreen('folders.back')}</Text></TouchableOpacity><Text style={styles.folderHeaderTitle}>{activeFolder.name}</Text><Text style={styles.folderHeaderCount}>{tHomeScreen('folders.characters')}: {folderCounts[activeFolder.id] || 0}</Text>{movingCharacterId && <View ref={rootDropRef} collapsable={false}><TouchableOpacity style={styles.rootDropZone} onPress={() => handleMoveToFolder(null)}><Text style={styles.rootDropText}>{tHomeScreen('folders.back')}</Text></TouchableOpacity></View>}</View>}
      {activeFolder && folderRooms[activeFolder.id] && (
        <View style={styles.folderRoomBar}>
          <TouchableOpacity style={styles.folderRoomBarButton} onPress={() => setRoomDialog({ code: folderRooms[activeFolder.id] })}>
            <MaterialCommunityIcons name="server-network" size={16} color="#f0e68c" />
            <Text style={styles.folderRoomBarText}>{formatRoomCodeForDisplay(folderRooms[activeFolder.id])}</Text>
            <Text style={styles.folderRoomBarPlayers}>
              {tHomeScreen('room.players')}: {(roomRooms[folderRooms[activeFolder.id]]?.members || []).filter((member) => member.role === 'player').length}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {movingCharacterId && !activeFolder && <Text pointerEvents="none" style={styles.moveHint}>{tHomeScreen('folders.moving')}: {tHomeScreen('folders.moveHint')}</Text>}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!drag}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#d4af37" style={styles.loader} />
        ) : (
          rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((item) => {
                if (item.type === 'create') {
                  return (
                    <ActionCell
                      key="create"
                      icon={tHomeScreen('createButton.plus')}
                      label={tHomeScreen('createButton.text')}
                      onPress={handleCreate}
                      disabled={!bundledSettingActive}
                    />
                  );
                }
                if (item.type === 'upload') {
                  return (
                    <ActionCell
                      key="upload"
                      icon={tHomeScreen('upload.icon')}
                      label={tHomeScreen('upload.button')}
                      onPress={handleUpload}
                    />
                  );
                }
                if (item.type === 'createFolder') {
                  return <ActionCell key="create-folder" icon={<MaterialCommunityIcons name={isGmMode ? 'server-plus-outline' : 'folder-plus-outline'} size={38} color={foldersEnabled ? '#5a5a5a' : '#aaa'} />} label={isGmMode ? tHomeScreen('room.createFolder') : tHomeScreen('folders.create')} disabled={!foldersEnabled} onPress={() => setFolderDraftVisible(true)} />;
                }
                if (item.type === 'folderDraft') {
                  return <View key="folder-draft" style={styles.folderDraftCell}><MaterialCommunityIcons name="folder-outline" size={38} color="#5a5a5a" /><TextInput autoFocus value={folderName} onChangeText={setFolderName} placeholder={tHomeScreen('folders.namePlaceholder')} style={styles.folderNameInput} /><View style={styles.folderDraftActions}><TouchableOpacity onPress={handleCreateFolder}><Text>{tHomeScreen('folders.confirm')}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setFolderDraftVisible(false); setFolderName(''); }}><Text>{tHomeScreen('folders.cancel')}</Text></TouchableOpacity></View></View>;
                }
                if (item.type === 'folder') {
                  return <TouchableOpacity ref={(ref) => { folderRefs.current[item.id] = ref; }} key={item.id} style={[styles.folderCell, movingCharacterId && styles.folderDropTarget]} onPress={() => { if (!movingCharacterId) setActiveFolder(item); }}><TouchableOpacity style={styles.folderDeleteButton} onPress={(event) => { event?.stopPropagation?.(); handleDeleteFolder(item); }}><Text>×</Text></TouchableOpacity><MaterialCommunityIcons name={folderRooms[item.id] ? 'server-network' : 'folder-outline'} size={52} color="#d4af37" /><Text style={styles.folderName}>{item.name}</Text>{folderRooms[item.id] && <Text style={styles.folderRoomCode}>{formatRoomCodeForDisplay(folderRooms[item.id])}</Text>}<Text style={styles.folderCount}>{tHomeScreen('folders.characters')}: {folderCounts[item.id] || 0}</Text></TouchableOpacity>;
                }
                if (item.type === 'empty') {
                  return <EmptyCell key={item.id} id={item.id} />;
                }
                return (
                  <CharacterCell
                    key={item.id}
                    character={item}
                    deleteActionPlacement={characterDeleteActionPlacement}
                    onPress={() => handleOpen(item.id)}
                    onDelete={() => handleDelete(item)}
                    onDownload={() => handleDownload(item)}
                    onDuplicate={() => handleDuplicate(item)}
                    onServer={() => handleServer(item)}
                    serverAvailable={roomServerAvailable && !isGmMode}
                    serverBound={Boolean(roomBindings[item.id])}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    moving={movingCharacterId === item.id}
                  />
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
      {drag && <View pointerEvents="none" style={[styles.dragPreview, { left: drag.x - 54, top: drag.y - 28 }]}><Text style={styles.dragPreviewText}>{drag.character.name}</Text></View>}

      {showInstallButton && (
        <TouchableOpacity style={styles.installButton} onPress={handleInstallPress}>
          <MaterialCommunityIcons name="download" size={16} color="#111827" style={{ marginRight: 6 }} />
          <Text style={styles.installButtonText}>{tHomeScreen('pwa.install')}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.menuPanel} onPress={() => {}}>
            {GAME_SETTINGS_UI_ENABLED && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setGameSettingsVisible(true); }}>
                <MaterialCommunityIcons name="book-open-page-variant-outline" size={20} color="#d4af37" />
                <Text style={styles.menuText}>{tHomeScreen('menu.gameSetting')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setSettingsVisible(true); }}>
              <MaterialCommunityIcons name="cog-outline" size={20} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.settings')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleCloudSync}>
              <FontAwesome5 name="google-drive" size={18} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.sync')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setAboutVisible(true); }}>
              <MaterialCommunityIcons name="information-outline" size={20} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.about')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setCommunityVisible(true); }}>
              <FontAwesome5 name="telegram-plane" size={18} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.community')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setMenuVisible(false);
              openExternalLink('https://boosty.to/fallout2d20ru');
            }}>
              <MaterialCommunityIcons name="coffee-outline" size={20} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.buyCoffee')}</Text>
            </TouchableOpacity>

            {/* Принудительное обновление PWA (для разработчика) */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                forcePwaUpdate();
              }}
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.checkUpdates')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Заглушка процесса синхронизации. Модалка без onRequestClose-выхода:
          закрыть её пользователь не может, что и решает исходную проблему —
          «не хватает ощущения процесса, и можно прервать его иначе». */}
      <Modal visible={!!syncProgress} transparent animationType="fade">
        <View style={styles.modalBackdropCenter}>
          <View style={styles.syncProgressModal}>
            <ActivityIndicator size="large" color="#d4af37" />
            <Text style={styles.syncProgressTitle}>{tHomeScreen('cloudSync.inProgress')}</Text>
            <Text style={styles.syncProgressStage}>
              {tHomeScreen(`cloudSync.stages.${syncProgress?.stage || 'auth'}`)}
              {syncProgress?.total > 1 ? ` (${syncProgress.current}/${syncProgress.total})` : ''}
            </Text>
            <Text style={styles.syncProgressHint}>{tHomeScreen('cloudSync.doNotClose')}</Text>
          </View>
        </View>
      </Modal>

      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      {GAME_SETTINGS_UI_ENABLED && (
        <GameSettingsModal visible={gameSettingsVisible} onClose={() => setGameSettingsVisible(false)} />
      )}

      {/* Комнаты мастера (gm-rooms): адрес комнаты + участники. */}
      <Modal visible={Boolean(roomDialog)} transparent animationType="fade" onRequestClose={() => setRoomDialog(null)}>
        <Pressable style={styles.serverModalBackdrop} onPress={() => setRoomDialog(null)}>
          <Pressable style={styles.serverModalPanel} onPress={() => {}}>
            <Text style={styles.serverModalTitle}>{tHomeScreen('room.codeTitle')}</Text>
            {roomDialog && (
              <>
                <Text style={styles.serverModalCode}>{formatRoomCodeForDisplay(roomDialog.code)}</Text>
                <Text style={styles.serverModalText}>{tHomeScreen('room.hint')}</Text>
                <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                  <Text style={styles.serverModalPlayersTitle}>{tHomeScreen('room.players')}</Text>
                  {(roomRooms[roomDialog.code]?.members || []).filter((member) => member.role === 'player').length === 0 && (
                    <Text style={styles.serverModalPlayer}>{tHomeScreen('room.noPlayers')}</Text>
                  )}
                  {(roomRooms[roomDialog.code]?.members || [])
                    .filter((member) => member.role === 'player')
                    .map((member) => (
                      <Text key={member.clientId} style={styles.serverModalPlayer}>{member.name}</Text>
                    ))}
                </ScrollView>
                <View style={styles.serverModalActions}>
                  <TouchableOpacity
                    style={styles.serverModalButton}
                    onPress={() => copyRoomCode(roomDialog.code)}
                  >
                    <Text style={styles.serverModalButtonText}>
                      {copiedCode === roomDialog.code ? tHomeScreen('room.copied') : tHomeScreen('room.copy')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.serverModalButton, styles.serverModalButtonSecondary]}
                    onPress={() => setRoomDialog(null)}
                  >
                    <Text style={[styles.serverModalButtonText, styles.serverModalButtonTextSecondary]}>{tHomeScreen('server.close')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Пользовательская сторона: подключение персонажа к комнате мастера. */}
      <Modal visible={Boolean(serverDialog)} transparent animationType="fade" onRequestClose={() => !serverDialog?.busy && setServerDialog(null)}>
        <Pressable style={styles.serverModalBackdrop} onPress={() => { if (!serverDialog?.busy) setServerDialog(null); }}>
          <Pressable style={styles.serverModalPanel} onPress={() => {}}>
            <Text style={styles.serverModalTitle}>{tHomeScreen('server.dialogTitle')}</Text>
            {serverDialog && (
              <>
                {serverDialog.boundCode ? (
                  <>
                    <Text style={styles.serverModalText}>
                      {tHomeScreen('server.connected').replace('{code}', formatRoomCodeForDisplay(serverDialog.boundCode))}
                    </Text>
                    <View style={styles.serverModalActions}>
                      <TouchableOpacity style={styles.serverModalButton} onPress={handleServerLeave}>
                        <Text style={styles.serverModalButtonText}>{tHomeScreen('server.disconnect')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.serverModalButton, styles.serverModalButtonSecondary]}
                        onPress={() => setServerDialog(null)}
                      >
                        <Text style={[styles.serverModalButtonText, styles.serverModalButtonTextSecondary]}>{tHomeScreen('server.close')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.serverModalText}>{tHomeScreen('server.addressLabel')}</Text>
                    <TextInput
                      value={serverDialog.address}
                      onChangeText={(text) => setServerDialog({ ...serverDialog, address: text, error: null })}
                      placeholder={tHomeScreen('server.addressPlaceholder')}
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={styles.serverModalInput}
                      editable={!serverDialog.busy}
                    />
                    {serverDialog.error && <Text style={styles.serverModalError}>{serverDialog.error}</Text>}
                    <View style={styles.serverModalActions}>
                      <TouchableOpacity
                        style={[styles.serverModalButton, serverDialog.busy && { opacity: 0.6 }]}
                        onPress={handleServerJoin}
                        disabled={serverDialog.busy}
                      >
                        <Text style={styles.serverModalButtonText}>
                          {serverDialog.busy ? tHomeScreen('server.connecting') : tHomeScreen('server.connect')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.serverModalButton, styles.serverModalButtonSecondary]}
                        onPress={() => { if (!serverDialog.busy) setServerDialog(null); }}
                      >
                        <Text style={[styles.serverModalButtonText, styles.serverModalButtonTextSecondary]}>{tHomeScreen('buttons.cancel')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={aboutVisible} transparent animationType="slide" onRequestClose={() => setAboutVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('menu.about')}</Text>
            <Text style={styles.infoText}>
              {tHomeScreen('about.description'
              )}
            </Text>
            <TouchableOpacity onPress={() => { setAboutVisible(false); setLegalDoc('privacy'); }}>
              <Text style={styles.linkText}>{tHomeScreen('about.privacyPolicy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAboutVisible(false); setLegalDoc('terms'); }}>
              <Text style={styles.linkText}>{tHomeScreen('about.termsOfService')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setAboutVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Правовые документы — встроенный iframe в модалке.
          Локаль берётся из useLocale() (глобальная настройка приложения).
          Если нужен EN для ru-юзера (или наоборот) — переключить язык в
          настройках и открыть модалку снова. */}
      <Modal visible={Boolean(legalDoc)} transparent animationType="slide" onRequestClose={() => setLegalDoc(null)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.legalModal}>
            {legalDoc && (
              <iframe
                title={legalDoc === 'privacy' ? tHomeScreen('about.privacyPolicy') : tHomeScreen('about.termsOfService')}
                src={legalDoc === 'privacy'
                  ? (locale === 'en-EN' ? '/privacy-policy.en.html' : '/privacy-policy.html')
                  : (locale === 'en-EN' ? '/terms-of-service.en.html' : '/terms-of-service.html')}
                style={styles.legalIframe}
              />
            )}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setLegalDoc(null)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={communityVisible} transparent animationType="slide" onRequestClose={() => setCommunityVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('menu.community')}</Text>
            <TouchableOpacity onPress={() => openExternalLink('https://fallout-2d20.ru')}>
              <Text style={styles.linkText}>fallout-2d20.ru</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openExternalLink('https://t.me/fallout_2d20_russia')}>
              <Text style={styles.linkText}>https://t.me/fallout_2d20_russia</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openExternalLink('https://vk.com/ttrp_fallout2d20/')}>
              <Text style={styles.linkText}>https://vk.com/ttrp_fallout2d20/</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCommunityVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={iosInstallVisible} transparent animationType="slide" onRequestClose={() => setIosInstallVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('pwa.install')}</Text>
            <Text style={styles.infoText}>{tHomeScreen('pwa.iosInstructions')}</Text>
        <PwaInstallDiagnostics installPrompt={installPrompt} />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setIosInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={androidInstallVisible} transparent animationType="slide" onRequestClose={() => setAndroidInstallVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('pwa.install')}</Text>
            <Text style={styles.infoText}>{tHomeScreen('pwa.androidInstructions')}</Text>
        <PwaInstallDiagnostics installPrompt={installPrompt} />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setAndroidInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={desktopInstallVisible} transparent animationType="slide" onRequestClose={() => setDesktopInstallVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('pwa.install')}</Text>
            <Text style={styles.infoText}>{tHomeScreen('pwa.desktopInstructions')}</Text>
        <PwaInstallDiagnostics installPrompt={installPrompt} />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setDesktopInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

