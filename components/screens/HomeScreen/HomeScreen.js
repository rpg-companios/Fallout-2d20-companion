import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Linking,
  TextInput,
  PanResponder,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCharacter } from '../../CharacterContext';
import { findEnrichedOrigin } from '../../../domain/origins';
import { setCurrentLocale, useLocale } from '../../../i18n/locale';
import { tHomeScreen } from './logic/homeScreenI18n';
import * as db from '../../../db';
import {
  createCharacterExportPayload,
  parseCharacterImportPayload,
  downloadCharacterPayload,
  pickCharacterFile,
  IMPORT_ERRORS,
} from './logic/characterTransfer';
import { openCloudFolderInDrive, syncAllCharactersWithCloud } from '../../cloudSync/googleDriveSync';
import { forcePwaUpdate } from '../../../src/utils/forcePwaUpdate';
import styles from '../../../styles/HomeScreen.styles';
import SettingsModal from '../../settings/SettingsModal';
import useAppSettingsStore from '../../../src/store/appSettingsStore';

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

const CharacterCell = ({ character, onPress, onDelete, onDownload, onDragStart, onDragMove, onDragEnd }) => {
  const originImage = getOriginImage(character.originName);
  // PanResponder keeps ownership of the pointer after it leaves the small handle,
  // which Touchable's touch callbacks do not guarantee on web and native.
  const callbacks = useRef({});
  callbacks.current = { character, onDragStart, onDragMove, onDragEnd };
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (_event, gesture) => callbacks.current.onDragStart({ pageX: gesture.x0, pageY: gesture.y0 }, callbacks.current.character),
    onPanResponderMove: (_event, gesture) => callbacks.current.onDragMove({ pageX: gesture.moveX, pageY: gesture.moveY }),
    onPanResponderRelease: (_event, gesture) => callbacks.current.onDragEnd({ pageX: gesture.moveX, pageY: gesture.moveY }),
    onPanResponderTerminate: (_event, gesture) => callbacks.current.onDragEnd({ pageX: gesture.moveX, pageY: gesture.moveY }),
  })).current;
  return (
    <TouchableOpacity style={styles.characterCell} onPress={onPress} activeOpacity={0.8}>
      <View {...panResponder.panHandlers} style={styles.dragHandle}><MaterialCommunityIcons name="arrow-all" size={18} color="#111827" /></View>
      <View style={styles.characterImageContainer}>{originImage ? <Image source={originImage} style={styles.characterImage} resizeMode="cover" /> : <View style={styles.characterImagePlaceholder}><Text style={styles.characterImagePlaceholderText}>?</Text></View>}</View>
      <TouchableOpacity style={styles.deleteButton} onPress={(event) => { event?.stopPropagation?.(); onDelete(); }} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}><Text style={styles.deleteIcon}>🗑</Text></TouchableOpacity>
      <TouchableOpacity style={styles.downloadButton} onPress={(event) => { event?.stopPropagation?.(); onDownload(); }} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}><MaterialCommunityIcons name="download" size={16} color="#8a8a8a" /></TouchableOpacity>
      <Text style={styles.characterName} numberOfLines={2}>{character.name}</Text>
      {character.level ? <Text style={styles.characterLevel}>{tHomeScreen("labels.level")} {character.level}</Text> : null}
    </TouchableOpacity>
  );
};

const EmptyCell = ({ id }) => <View key={id} style={styles.emptyCell} />;

export default function HomeScreen({ navigation }) {
  const locale = useLocale();
  const { getCharactersList, loadCharacter, resetCharacter, deleteCharacter } = useCharacter();
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
  const characterFoldersEnabled = useAppSettingsStore((state) => state.characterFoldersEnabled);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [communityVisible, setCommunityVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [iosInstallVisible, setIosInstallVisible] = useState(false);
  const [androidInstallVisible, setAndroidInstallVisible] = useState(false);
  const [desktopInstallVisible, setDesktopInstallVisible] = useState(false);

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
  const languageOptions = [
    { code: 'ru-RU', label: tHomeScreen('language.russian'), flag: '🇷🇺' },
    { code: 'en-EN', label: tHomeScreen('language.english'), flag: '🇬🇧' },
  ];

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const savedFolders = await db.getCharacterFolders();
      const folderLists = await Promise.all(savedFolders.map((folder) => db.getCharactersInFolder(folder.id)));
      const counts = Object.fromEntries(savedFolders.map((folder, index) => [folder.id, folderLists[index].length]));
      const visible = activeFolder ? folderLists[savedFolders.findIndex((folder) => folder.id === activeFolder.id)] || [] : await db.getRootCharactersList();
      visible.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setCharacters(visible);
      setFolders(savedFolders);
      setFolderCounts(counts);
    } catch (e) {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, [getCharactersList, activeFolder]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList])
  );

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    await db.createCharacterFolder(folderName);
    setFolderName('');
    setFolderDraftVisible(false);
    loadList();
  };

  const handleMoveToFolder = async (folderId, characterId = movingCharacterId) => {
    if (!characterId) return;
    await db.moveCharacterToFolder(characterId, folderId);
    setMovingCharacterId(null);
    setDrag(null);
    loadList();
  };

  const handleDragStart = (event, character) => {
    setMovingCharacterId(character.id);
    setDrag({ character, x: event.pageX, y: event.pageY });
    Object.entries(folderRefs.current).forEach(([id, ref]) => ref?.measureInWindow?.((x, y, width, height) => { dropBounds.current[id] = { x, y, width, height }; }));
    rootDropRef.current?.measureInWindow?.((x, y, width, height) => { dropBounds.current.root = { x, y, width, height }; });
  };
  const handleDragMove = (event) => setDrag((current) => current && { ...current, x: event.pageX, y: event.pageY });
  const handleDragEnd = async (event) => {
    const target = Object.entries(dropBounds.current).find(([id, b]) => id !== 'root' && b && event.pageX >= b.x && event.pageX <= b.x + b.width && event.pageY >= b.y && event.pageY <= b.y + b.height);
    if (target) await handleMoveToFolder(target[0]);
    else {
      const root = dropBounds.current.root;
      if (root && event.pageX >= root.x && event.pageX <= root.x + root.width && event.pageY >= root.y && event.pageY <= root.y + root.height) await handleMoveToFolder(null);
      else { setMovingCharacterId(null); setDrag(null); }
    }
  };

  const handleDeleteFolder = (folder) => {
    const remove = async () => {
      await db.deleteCharacterFolderAndCharacters(folder.id);
      if (activeFolder?.id === folder.id) setActiveFolder(null);
      loadList();
    };
    const message = `${tHomeScreen('folders.deleteMessage')} ${tHomeScreen('folders.characters')}: ${folderCounts[folder.id] || 0}.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) remove();
      return;
    }
    Alert.alert(tHomeScreen('folders.deleteTitle'), message, [{ text: tHomeScreen('folders.cancel'), style: 'cancel' }, { text: tHomeScreen('folders.deleteConfirm'), style: 'destructive', onPress: remove }]);
  };

  const handleCreate = () => {
    resetCharacter();
    navigation.navigate('CharacterTab');
  };

  const handleOpen = async (id) => {
    const ok = await loadCharacter(id);
    if (ok) {
      navigation.navigate('CharacterTab');
    }
  };

  const handleDelete = (character) => {
    const confirmDelete = async () => {
      await deleteCharacter(character.id);
      loadList();
    };

    const confirmMessage = tHomeScreen('deleteConfirm');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(confirmMessage);
      if (confirmed) {
        confirmDelete();
      }
      return;
    }

    Alert.alert(
      tHomeScreen('title'),
      confirmMessage,
      [
        {
          text: tHomeScreen('buttons.yes') || 'Да',
          style: 'destructive',
          onPress: confirmDelete,
        },
        { text: tHomeScreen('buttons.no') || 'Нет', style: 'cancel' },
      ],
      { cancelable: false }
    );
  };


  const handleDownload = async (character) => {
    if (false) { // cross-platform
      Alert.alert(
        tHomeScreen('title'),
        tHomeScreen('download.unsupported')
      );
      return;
    }

    const row = await db.loadCharacterById(character.id);
    if (!row) {
      Alert.alert(tHomeScreen('title'), tHomeScreen('download.errors.notFound'));
      return;
    }

    const payload = createCharacterExportPayload(row);
    downloadCharacterPayload(payload, row.name);
  };

  const handleUpload = async () => {
    if (false) { // cross-platform
      Alert.alert(
        tHomeScreen('title'),
        tHomeScreen('upload.unsupported')
      );
      return;
    }

    const rawText = await pickCharacterFile();
    if (!rawText) return;

    const parsed = parseCharacterImportPayload(rawText);
    if (parsed.error) {
      Alert.alert(
        tHomeScreen('title'),
        tHomeScreen(IMPORT_ERRORS[parsed.error], tHomeScreen('upload.errors.default'))
      );
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

    const overwriteMessage = tHomeScreen('upload.overwriteConfirm');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(overwriteMessage);
      if (confirmed) {
        await persistImport();
      }
      return;
    }

    Alert.alert(
      tHomeScreen('title'),
      overwriteMessage,
      [
        { text: tHomeScreen('buttons.no') || 'Нет', style: 'cancel' },
        {
          text: tHomeScreen('buttons.yes') || 'Да',
          style: 'destructive',
          onPress: persistImport,
        },
      ],
      { cancelable: true }
    );
  };

  const handleCloudSync = async () => {
    setMenuVisible(false);
    if (Platform.OS !== 'web') {
      Alert.alert(
        tHomeScreen('title'),
        tHomeScreen('cloudSync.unsupported')
      );
      return;
    }

    try {
      const result = await syncAllCharactersWithCloud({
        confirmDownload: async (items) => {
          const message = tHomeScreen(
            'cloudSync.remoteIsNewer',
            `В облаке найдены более новые версии (${items.length}). Загрузить их?`
          );
          return window.confirm(message);
        },
      });
      await loadList();
      await openCloudFolderInDrive();
      Alert.alert(
        tHomeScreen('title'),
        tHomeScreen(
          'cloudSync.success',
          `Синхронизация завершена. Выгружено: ${result.uploaded}, загружено: ${result.downloaded}.`
        )
      );
    } catch (e) {
      Alert.alert(
        tHomeScreen('title'),
        tHomeScreen('cloudSync.error', `Ошибка синхронизации: ${e?.message || e}`)
      );
    }
  };

  const openExternalLink = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener');
      }
    }
  };

  const allItems = [
    ...(activeFolder ? [] : [{ type: 'create' }, { type: 'upload' }, { type: 'createFolder' }]),
    ...(activeFolder ? [] : (folderDraftVisible ? [{ type: 'folderDraft' }] : [])),
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
                onPress={() => setCurrentLocale(lang.code)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={[styles.langSegmentText, locale === lang.code && styles.langSegmentTextActive]}>
                  {lang.code === 'ru-RU' ? 'ru' : 'en'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{tHomeScreen("title")}</Text>
        <Text style={styles.subtitle}>{tHomeScreen("subtitle")}</Text>
      </View>
      {activeFolder && <View style={styles.folderHeader}><TouchableOpacity onPress={() => { setActiveFolder(null); setMovingCharacterId(null); }}><Text style={styles.folderBack}>← {tHomeScreen('folders.back')}</Text></TouchableOpacity><Text style={styles.folderHeaderTitle}>{activeFolder.name}</Text><Text style={styles.folderHeaderCount}>{tHomeScreen('folders.characters')}: {folderCounts[activeFolder.id] || 0}</Text>{movingCharacterId && <View ref={rootDropRef} collapsable={false}><TouchableOpacity style={styles.rootDropZone} onPress={() => handleMoveToFolder(null)}><Text style={styles.rootDropText}>{tHomeScreen('folders.back')}</Text></TouchableOpacity></View>}</View>}
      {movingCharacterId && !activeFolder && <Text style={styles.moveHint}>{tHomeScreen('folders.moving')}: {tHomeScreen('folders.moveHint')}</Text>}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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
                  return <ActionCell key="create-folder" icon={<MaterialCommunityIcons name="folder-plus-outline" size={38} color={characterFoldersEnabled ? '#5a5a5a' : '#aaa'} />} label={tHomeScreen('folders.create')} disabled={!characterFoldersEnabled} onPress={() => setFolderDraftVisible(true)} />;
                }
                if (item.type === 'folderDraft') {
                  return <View key="folder-draft" style={styles.folderDraftCell}><MaterialCommunityIcons name="folder-outline" size={38} color="#5a5a5a" /><TextInput autoFocus value={folderName} onChangeText={setFolderName} placeholder={tHomeScreen('folders.namePlaceholder')} style={styles.folderNameInput} /><View style={styles.folderDraftActions}><TouchableOpacity onPress={handleCreateFolder}><Text>{tHomeScreen('folders.confirm')}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setFolderDraftVisible(false); setFolderName(''); }}><Text>{tHomeScreen('folders.cancel')}</Text></TouchableOpacity></View></View>;
                }
                if (item.type === 'folder') {
                  return <TouchableOpacity ref={(ref) => { folderRefs.current[item.id] = ref; }} key={item.id} style={[styles.folderCell, movingCharacterId && styles.folderDropTarget]} onPress={() => { if (!movingCharacterId) setActiveFolder(item); }}><TouchableOpacity style={styles.folderDeleteButton} onPress={(event) => { event?.stopPropagation?.(); handleDeleteFolder(item); }}><Text>×</Text></TouchableOpacity><MaterialCommunityIcons name="folder-outline" size={52} color="#d4af37" /><Text style={styles.folderName}>{item.name}</Text><Text style={styles.folderCount}>{tHomeScreen('folders.characters')}: {folderCounts[item.id] || 0}</Text></TouchableOpacity>;
                }
                if (item.type === 'empty') {
                  return <EmptyCell key={item.id} id={item.id} />;
                }
                return (
                  <CharacterCell
                    key={item.id}
                    character={item}
                    onPress={() => handleOpen(item.id)}
                    onDelete={() => handleDelete(item)}
                    onDownload={() => handleDownload(item)}
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
              Alert.alert(
                tHomeScreen('menu.buyCoffee'),
                tHomeScreen('menu.buyCoffeeDescription')
              );
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

      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />

      <Modal visible={aboutVisible} transparent animationType="slide" onRequestClose={() => setAboutVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('menu.about')}</Text>
            <Text style={styles.infoText}>
              {tHomeScreen('about.description'
              )}
            </Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setAboutVisible(false)}>
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
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setDesktopInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

