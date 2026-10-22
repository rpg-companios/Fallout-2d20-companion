import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  TextInput,
  } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import { tHomeScreen } from '../screens/HomeScreen/logic/homeScreenI18n';
import { confirmAlert, showRawAlert } from '../alerts/alertService';
import useSettingPackStore, {
  selectActiveSettingId,
  selectInstalledSettings,
} from '../../src/store/settingPackStore';
import { downloadSettingRelease } from '../../src/engine/settings/settingReleaseClient';
import {
  parseSettingLink,
  repositoryFromAssetUrl,
} from '../../src/engine/settings/settingRelease';
import useSettingUpdateStore, {
  selectSettingInstallingId,
  selectSettingUpdateError,
  selectSettingUpdatePlans,
  selectSettingUpdateStatus,
} from '../../src/store/settingUpdateStore';

const MAX_TRPG_ARCHIVE_BYTES = 50 * 1024 * 1024;
const isTrpgName = (name) => typeof name === 'string' && name.toLowerCase().endsWith('.trpg');

// tHomeScreen не подставляет параметры (это дело AlertHost); для строк,
// собранных вручную, подстановка нужна здесь.
const withParams = (template, params) => String(template).replace(
  /\{(\w+)\}/g,
  (match, key) => (Object.hasOwn(params, key) ? String(params[key]) : match),
);

const pickLocalTrpg = async () => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      input.type = 'file';
      input.accept = '.trpg';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !isTrpgName(file.name)) {
          finish(null);
          return;
        }
        if (file.size > MAX_TRPG_ARCHIVE_BYTES) {
          reject(new Error('archive exceeds the supported size limit'));
          return;
        }
        try {
          finish({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
        } catch (error) {
          reject(error);
        }
      };
      input.addEventListener('cancel', () => finish(null), { once: true });
      input.click();
    });
  }

  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (!isTrpgName(asset.name)) return null;
  if (asset.size !== undefined && asset.size > MAX_TRPG_ARCHIVE_BYTES) {
    throw new Error('archive exceeds the supported size limit');
  }
  const { File } = await import('expo-file-system');
  const picked = new File(asset.uri);
  const fileSize = picked.info().size;
  if (fileSize !== undefined && fileSize > MAX_TRPG_ARCHIVE_BYTES) {
    throw new Error('archive exceeds the supported size limit');
  }
  const bytes = await picked.bytes();
  if (bytes.byteLength > MAX_TRPG_ARCHIVE_BYTES) {
    throw new Error('archive exceeds the supported size limit');
  }
  return { name: asset.name, bytes };
};

const ActionButton = ({ label, onPress, disabled = false }) => (
  <TouchableOpacity
    style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={[styles.actionButtonText, disabled && styles.actionButtonTextDisabled]}>{label}</Text>
  </TouchableOpacity>
);

export default function GameSettingsModal({ visible, onClose }) {
  useLocale();
  const installed = useSettingPackStore(selectInstalledSettings);
  const activeId = useSettingPackStore(selectActiveSettingId);
  const selectSetting = useSettingPackStore((state) => state.selectSetting);
  const deleteSetting = useSettingPackStore((state) => state.deleteSetting);
  const installLocalPackage = useSettingPackStore((state) => state.installLocalPackage);
  const updatePlans = useSettingUpdateStore(selectSettingUpdatePlans);
  const updateStatus = useSettingUpdateStore(selectSettingUpdateStatus);
  const updateError = useSettingUpdateStore(selectSettingUpdateError);
  const installingId = useSettingUpdateStore(selectSettingInstallingId);
  const checkForUpdates = useSettingUpdateStore((state) => state.checkForUpdates);
  const installUpdate = useSettingUpdateStore((state) => state.installUpdate);
  const addSource = useSettingUpdateStore((state) => state.addSource);
  const [linkText, setLinkText] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [activatingId, setActivatingId] = useState(null);
  const pickingRef = useRef(false);

  const confirmDelete = async (entry) => {
    // Заголовок из каталога, имя пакета — подстановкой в тело диалога.
    if (await confirmAlert('settingDelete', { name: entry.name })) {
      try {
        await deleteSetting(entry.id);
      } catch {
        await showRawAlert({
          title: tHomeScreen('gameSetting.packageInstallTitle'),
          message: tHomeScreen('gameSetting.packageDeleteFailed'),
        });
      }
    }
  };

  const handlePickLocal = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const file = await pickLocalTrpg();
      if (file) setPickedFile(file);
    } catch {
      await showRawAlert({
        title: tHomeScreen('gameSetting.packageInstallTitle'),
        message: tHomeScreen('gameSetting.packagePickFailed'),
      });
    } finally {
      pickingRef.current = false;
    }
  };

  const handleInstallLocal = async () => {
    if (!pickedFile || isInstalling) return;
    setIsInstalling(true);
    try {
      await installLocalPackage(pickedFile);
      setPickedFile(null);
      await showRawAlert({
        title: tHomeScreen('gameSetting.packageInstallTitle'),
        message: tHomeScreen('gameSetting.packageInstalled'),
      });
    } catch {
      await showRawAlert({
        title: tHomeScreen('gameSetting.packageInstallTitle'),
        message: tHomeScreen('gameSetting.packageInstallFailed'),
      });
    } finally {
      setIsInstalling(false);
    }
  };

  // Единственный способ получить сеттинг — ссылка или файл: приложение
  // не знает ни одного адреса заранее и ничего не предлагает установить.
  const handleInstallLink = async () => {
    const text = linkText.trim();
    if (!text || linkBusy) return;
    setLinkBusy(true);
    try {
      const parsed = parseSettingLink(text);
      if (parsed.assetUrl) {
        const asset = parsed.assetUrl.split('/').pop() || 'setting.trpg';
        const archive = await downloadSettingRelease({
          release: { asset, assetUrl: parsed.assetUrl },
        });
        await installLocalPackage({ name: archive.name, bytes: archive.bytes });
        const repository = repositoryFromAssetUrl(parsed.assetUrl);
        if (repository) addSource({ repository });
        setLinkText('');
        await showRawAlert({
          title: tHomeScreen('gameSetting.packageInstallTitle'),
          message: tHomeScreen('gameSetting.packageInstalled'),
        });
      } else {
        addSource(parsed);
        const found = await checkForUpdates({ force: true });
        setLinkText('');
        if (found.length === 0) {
          await showRawAlert({
            title: tHomeScreen('gameSetting.updateTitle'),
            message: tHomeScreen('gameSetting.sourceAdded'),
          });
        }
      }
    } catch (error) {
      await showRawAlert({
        title: tHomeScreen('gameSetting.packageInstallTitle'),
        message: error?.message ? String(error.message) : tHomeScreen('gameSetting.linkFailed'),
      });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleCheckUpdates = async () => {
    if (updateStatus === 'checking') return;
    try {
      const found = await checkForUpdates({ force: true });
      if (found.length === 0) {
        await showRawAlert({
          title: tHomeScreen('gameSetting.updateTitle'),
          message: tHomeScreen('gameSetting.updateNone'),
        });
      }
    } catch {
      await showRawAlert({
        title: tHomeScreen('gameSetting.updateTitle'),
        message: tHomeScreen('gameSetting.updateError'),
      });
    }
  };

  const installedIds = new Set(installed.map((entry) => entry.id));
  // Релиз для сеттинга, которого ещё нет на устройстве: приложение не несёт
  // сеттинг внутри, поэтому первый релиз — это предложение установки.
  const pendingInstalls = Object.values(updatePlans)
    .filter((plan) => plan && !installedIds.has(plan.settingId));

  const handleInstallUpdate = async (entry) => {
    if (installingId) return;
    try {
      const result = await installUpdate(entry.id);
      await showRawAlert({
        title: tHomeScreen('gameSetting.updateTitle'),
        message: withParams(tHomeScreen('gameSetting.updateInstalled'), { version: result.version }),
      });
    } catch {
      await showRawAlert({
        title: tHomeScreen('gameSetting.updateTitle'),
        message: tHomeScreen('gameSetting.updateFailed'),
      });
    }
  };

  const handleActivate = async (entry) => {
    if (activatingId !== null || entry.id === activeId || !entry.runtime?.entry) return;
    setActivatingId(entry.id);
    try {
      await selectSetting(entry.id);
      onClose?.();
    } catch {
      await showRawAlert({
        title: tHomeScreen('gameSetting.packageInstallTitle'),
        message: tHomeScreen('gameSetting.packageActivationFailed'),
      });
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{tHomeScreen('gameSetting.title')}</Text>
          <ScrollView style={styles.scroll}>
            {installed.length === 0 ? (
              <Text style={styles.packageStatus}>{tHomeScreen('gameSetting.noInstalledSettings')}</Text>
            ) : null}
            {installed.map((entry) => {
              const selected = entry.id === activeId;
              const activating = activatingId === entry.id;
              const update = updatePlans[entry.id] ?? null;
              const updating = installingId === entry.id;
              return (
                <View key={entry.id} style={[styles.installedRow, selected && styles.installedRowActive]}>
                  <View style={styles.installedInfo}>
                    <Text style={styles.settingName} numberOfLines={2}>{entry.name}</Text>
                    {!entry.runtime?.entry ? (
                      <Text style={styles.packageStatus}>{tHomeScreen('gameSetting.pendingRuntime')}</Text>
                    ) : null}
                    {update ? (
                      <Text style={styles.updateStatus}>
                        {withParams(tHomeScreen('gameSetting.updateAvailableShort'), {
                          version: update.toVersion,
                        })}
                      </Text>
                    ) : null}
                  </View>
                  {update ? (
                    <ActionButton
                      label={updating
                        ? tHomeScreen('gameSetting.updateInstalling')
                        : tHomeScreen('gameSetting.updateNow')}
                      onPress={() => handleInstallUpdate(entry)}
                      disabled={Boolean(installingId)}
                    />
                  ) : (
                    <ActionButton
                      label={activating ? tHomeScreen('gameSetting.activating') : tHomeScreen('gameSetting.select')}
                      onPress={() => handleActivate(entry)}
                      disabled={selected || activatingId !== null || !entry.runtime?.entry}
                    />
                  )}
                  <ActionButton
                    label={tHomeScreen('gameSetting.delete')}
                    onPress={() => confirmDelete(entry)}
                  />
                </View>
              );
            })}

            {pendingInstalls.map((plan) => (
              <View key={plan.settingId} style={styles.installedRow}>
                <View style={styles.installedInfo}>
                  <Text style={styles.settingName} numberOfLines={2}>
                    {plan.release?.name ?? plan.settingId}
                  </Text>
                  <Text style={styles.updateStatus}>
                    {withParams(tHomeScreen('gameSetting.updateAvailableShort'), {
                      version: plan.toVersion,
                    })}
                  </Text>
                </View>
                <ActionButton
                  label={installingId === plan.settingId
                    ? tHomeScreen('gameSetting.updateInstalling')
                    : tHomeScreen('gameSetting.updateNow')}
                  onPress={() => handleInstallUpdate({ id: plan.settingId })}
                  disabled={Boolean(installingId)}
                />
              </View>
            ))}

            <View style={styles.updateRow}>
              <ActionButton
                label={updateStatus === 'checking'
                  ? tHomeScreen('gameSetting.updateChecking')
                  : tHomeScreen('gameSetting.updateCheck')}
                onPress={handleCheckUpdates}
                disabled={updateStatus === 'checking' || Boolean(installingId)}
              />
              {updateError ? (
                <Text style={styles.updateError} numberOfLines={2}>
                  {tHomeScreen('gameSetting.updateError')}
                </Text>
              ) : null}
            </View>

            <View style={styles.plusBlock}>
              <Text style={styles.plusMark}>+</Text>
              <TextInput
                style={styles.linkInput}
                value={linkText}
                onChangeText={setLinkText}
                placeholder={tHomeScreen('gameSetting.linkPlaceholder')}
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!linkBusy}
              />
              <ActionButton
                label={linkBusy ? tHomeScreen('gameSetting.installing') : tHomeScreen('gameSetting.linkInstall')}
                onPress={handleInstallLink}
                disabled={!linkText.trim() || linkBusy}
              />
              <TouchableOpacity style={styles.filePick} onPress={handlePickLocal} disabled={isInstalling}>
                <MaterialCommunityIcons name="file-plus-outline" size={22} color="#f0e68c" />
                <Text style={styles.filePickText}>{tHomeScreen('gameSetting.localTrpg')}</Text>
              </TouchableOpacity>
              {pickedFile ? (
                <Text style={styles.fileName}>{pickedFile.name}</Text>
              ) : null}
              <ActionButton
                label={isInstalling ? tHomeScreen('gameSetting.installing') : tHomeScreen('gameSetting.install')}
                onPress={handleInstallLocal}
                disabled={!pickedFile || isInstalling}
              />
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{tHomeScreen('buttons.ok')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4af37',
    padding: 16,
  },
  title: { color: '#f0e68c', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  scroll: { flexGrow: 0 },
  installedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#1f2937',
  },
  installedRowActive: { borderColor: '#d4af37' },
  installedInfo: { flex: 1, minWidth: 0 },
  settingName: { flex: 1, color: '#f9fafb', fontSize: 15 },
  packageStatus: { color: '#fbbf24', fontSize: 11, marginTop: 4 },
  updateStatus: { color: '#93c5fd', fontSize: 11, marginTop: 4 },
  updateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  updateError: { color: '#fca5a5', fontSize: 11, flex: 1, minWidth: 0 },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#d4af37',
  },
  actionButtonDisabled: { backgroundColor: '#4b5563' },
  actionButtonText: { color: '#111827', fontWeight: '700', fontSize: 13 },
  actionButtonTextDisabled: { color: '#9ca3af' },
  plusBlock: {
    marginTop: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#6b7280',
    borderRadius: 10,
    padding: 12,
    backgroundColor: 'rgba(17,24,39,0.85)',
  },
  plusMark: {
    color: '#9ca3af',
    fontSize: 28,
    fontWeight: '200',
    textAlign: 'center',
    lineHeight: 32,
  },
  blockTitle: {
    color: '#f0e68c',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  linkInput: {
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#f9fafb',
    backgroundColor: '#1f2937',
    marginBottom: 8,
  },
  filePick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  filePickText: { color: '#f0e68c', fontSize: 16, fontWeight: '700' },
  fileName: { color: '#e5e7eb', textAlign: 'center', marginBottom: 8 },
  close: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#d4af37',
  },
  closeText: { color: '#111827', fontWeight: '700' },
});
