import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCharacter } from '../../CharacterContext';
import { ORIGINS } from '../CharacterScreen/logic/originsData';
import { setCurrentLocale, useLocale } from '../../../i18n/locale';
import { tHomeScreen } from './logic/homeScreenI18n';
import * as db from '../../../db';
import {
  createCharacterExportPayload,
  parseCharacterImportPayload,
  downloadCharacterPayloadWeb,
  pickCharacterFileWeb,
  IMPORT_ERRORS,
} from './logic/characterTransfer';
import { openCloudFolderInDrive, syncAllCharactersWithCloud } from '../../cloudSync/googleDriveSync';
import styles from '../../../styles/HomeScreen.styles';

const getOriginImage = (originName) => {
  if (!originName) return null;
  const found = ORIGINS.find(o => o.id === originName);
  return found ? found.image : null;
};

const NUM_COLS = 3;

const ActionCell = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.createCell} onPress={onPress} activeOpacity={0.7}>
    <Text style={styles.createPlus}>{icon}</Text>
    <Text style={styles.createLabel}>{label}</Text>
  </TouchableOpacity>
);

const CharacterCell = ({ character, onPress, onDelete, onDownload }) => {
  const originImage = getOriginImage(character.originName);
  return (
    <TouchableOpacity
      style={styles.characterCell}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.characterImageContainer}>
        {originImage ? (
          <Image source={originImage} style={styles.characterImage} resizeMode="cover" />
        ) : (
          <View style={styles.characterImagePlaceholder}>
            <Text style={styles.characterImagePlaceholderText}>?</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={(event) => {
          event?.stopPropagation?.();
          onDelete();
        }}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Text style={styles.deleteIcon}>🗑</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.downloadButton}
        onPress={(event) => {
          event?.stopPropagation?.();
          onDownload();
        }}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Text style={styles.downloadIcon}>⭳</Text>
      </TouchableOpacity>
      <Text style={styles.characterName} numberOfLines={2}>{character.name}</Text>
      {character.level ? (
        <Text style={styles.characterLevel}>{tHomeScreen("labels.level", "Ур.")} {character.level}</Text>
      ) : null}
    </TouchableOpacity>
  );
};

const EmptyCell = ({ id }) => <View key={id} style={styles.emptyCell} />;

export default function HomeScreen({ navigation }) {
  const locale = useLocale();
  const { getCharactersList, loadCharacter, resetCharacter, deleteCharacter } = useCharacter();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [communityVisible, setCommunityVisible] = useState(false);

  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [iosInstallVisible, setIosInstallVisible] = useState(false);
  const [androidInstallVisible, setAndroidInstallVisible] = useState(false);
  const [desktopInstallVisible, setDesktopInstallVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
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
    { code: 'ru-RU', label: tHomeScreen('language.russian', 'Русский'), flag: '🇷🇺' },
    { code: 'en-EN', label: tHomeScreen('language.english', 'English'), flag: '🇬🇧' },
  ];

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getCharactersList();
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setCharacters(list);
    } catch (e) {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, [getCharactersList]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList])
  );

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

    const confirmMessage = tHomeScreen('deleteConfirm', 'Вы действительно хотите удалить этого персонажа?');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(confirmMessage);
      if (confirmed) {
        confirmDelete();
      }
      return;
    }

    Alert.alert(
      tHomeScreen('title', 'Менеджер персонажей'),
      confirmMessage,
      [
        {
          text: tHomeScreen('buttons.yes', 'Да') || 'Да',
          style: 'destructive',
          onPress: confirmDelete,
        },
        { text: tHomeScreen('buttons.no', 'Нет') || 'Нет', style: 'cancel' },
      ],
      { cancelable: false }
    );
  };


  const handleDownload = async (character) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert(
        tHomeScreen('title', 'Менеджер персонажей'),
        tHomeScreen('download.unsupported', 'Загрузка/сохранение файлов поддерживается только в web-версии.')
      );
      return;
    }

    const row = await db.loadCharacterById(character.id);
    if (!row) {
      Alert.alert(tHomeScreen('title', 'Менеджер персонажей'), tHomeScreen('download.errors.notFound', 'Персонаж не найден.'));
      return;
    }

    const payload = createCharacterExportPayload(row);
    downloadCharacterPayloadWeb(payload, row.name);
  };

  const handleUpload = async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert(
        tHomeScreen('title', 'Менеджер персонажей'),
        tHomeScreen('upload.unsupported', 'Загрузка файлов поддерживается только в web-версии.')
      );
      return;
    }

    const rawText = await pickCharacterFileWeb();
    if (!rawText) return;

    const parsed = parseCharacterImportPayload(rawText);
    if (parsed.error) {
      Alert.alert(
        tHomeScreen('title', 'Менеджер персонажей'),
        tHomeScreen(IMPORT_ERRORS[parsed.error], tHomeScreen('upload.errors.default', 'Не удалось импортировать персонажа.'))
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

    const overwriteMessage = tHomeScreen('upload.overwriteConfirm', 'Персонаж с таким именем уже существует. Перезаписать его?');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(overwriteMessage);
      if (confirmed) {
        await persistImport();
      }
      return;
    }

    Alert.alert(
      tHomeScreen('title', 'Менеджер персонажей'),
      overwriteMessage,
      [
        { text: tHomeScreen('buttons.no', 'Нет') || 'Нет', style: 'cancel' },
        {
          text: tHomeScreen('buttons.yes', 'Да') || 'Да',
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
        tHomeScreen('title', 'Менеджер персонажей'),
        tHomeScreen('cloudSync.unsupported', 'Синхронизация с облаком доступна только в web-версии.')
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
        tHomeScreen('title', 'Менеджер персонажей'),
        tHomeScreen(
          'cloudSync.success',
          `Синхронизация завершена. Выгружено: ${result.uploaded}, загружено: ${result.downloaded}.`
        )
      );
    } catch (e) {
      Alert.alert(
        tHomeScreen('title', 'Менеджер персонажей'),
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
    { type: 'create' },
    { type: 'upload' },
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
        <Text style={styles.title}>{tHomeScreen("title", "Менеджер персонажей")}</Text>
        <Text style={styles.subtitle}>{tHomeScreen("subtitle", "Ролевая игра Fallout (2d20)")}</Text>
      </View>
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
                      icon={tHomeScreen('createButton.plus', '+')}
                      label={tHomeScreen('createButton.text', 'Создать\nперсонажа')}
                      onPress={handleCreate}
                    />
                  );
                }
                if (item.type === 'upload') {
                  return (
                    <ActionCell
                      key="upload"
                      icon={tHomeScreen('upload.icon', '⇪')}
                      label={tHomeScreen('upload.button', 'Загрузить\nперсонажа')}
                      onPress={handleUpload}
                    />
                  );
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
                  />
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {showInstallButton && (
        <TouchableOpacity style={styles.installButton} onPress={handleInstallPress}>
          <MaterialCommunityIcons name="download" size={16} color="#111827" style={{ marginRight: 6 }} />
          <Text style={styles.installButtonText}>{tHomeScreen('pwa.install', 'Установить приложение')}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.menuPanel} onPress={() => {}}>
            <TouchableOpacity style={styles.menuItem} onPress={handleCloudSync}>
              <FontAwesome5 name="google-drive" size={18} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.sync', 'Синхронизация с облаком')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setAboutVisible(true); }}>
              <MaterialCommunityIcons name="information-outline" size={20} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.about', 'О приложении')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setCommunityVisible(true); }}>
              <FontAwesome5 name="telegram-plane" size={18} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.community', 'Сообщество')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setMenuVisible(false);
              Alert.alert(
                tHomeScreen('menu.buyCoffee', 'Купить автору кофе'),
                tHomeScreen('menu.buyCoffeeDescription', 'Поддержка автора появится в следующих обновлениях.')
              );
            }}>
              <MaterialCommunityIcons name="coffee-outline" size={20} color="#d4af37" />
              <Text style={styles.menuText}>{tHomeScreen('menu.buyCoffee', 'Купить автору кофе')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={aboutVisible} transparent animationType="slide" onRequestClose={() => setAboutVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('menu.about', 'О приложении')}</Text>
            <Text style={styles.infoText}>
              {tHomeScreen(
                'about.description',
                'Fallout 2d20 Companion — менеджер персонажей для настольной ролевой игры: создание, хранение, редактирование, импорт/экспорт и облачная синхронизация.'
              )}
            </Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setAboutVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok', 'Ок')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={communityVisible} transparent animationType="slide" onRequestClose={() => setCommunityVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('menu.community', 'Сообщество')}</Text>
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
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok', 'Ок')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={iosInstallVisible} transparent animationType="slide" onRequestClose={() => setIosInstallVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('pwa.install', 'Установить приложение')}</Text>
            <Text style={styles.infoText}>{tHomeScreen('pwa.iosInstructions', '')}</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setIosInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok', 'Ок')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={androidInstallVisible} transparent animationType="slide" onRequestClose={() => setAndroidInstallVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('pwa.install', 'Установить приложение')}</Text>
            <Text style={styles.infoText}>{tHomeScreen('pwa.androidInstructions', '')}</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setAndroidInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok', 'Ок')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={desktopInstallVisible} transparent animationType="slide" onRequestClose={() => setDesktopInstallVisible(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>{tHomeScreen('pwa.install', 'Установить приложение')}</Text>
            <Text style={styles.infoText}>{tHomeScreen('pwa.desktopInstructions', '')}</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setDesktopInstallVisible(false)}>
              <Text style={styles.modalCloseButtonText}>{tHomeScreen('buttons.ok', 'Ок')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

