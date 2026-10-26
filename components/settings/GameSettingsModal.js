import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import { tHomeScreen } from '../screens/HomeScreen/logic/homeScreenI18n';
import { confirmAlert } from '../alerts/alertService';
import useSettingPackStore, {
  getVanillaCatalog,
  selectActiveSettingId,
  selectInstalledSettings,
} from '../../src/store/settingPackStore';
import useContentPackStore, {
  selectContentPacks,
} from '../../src/store/contentPackStore';

const isTrpgName = (name) => typeof name === 'string' && name.toLowerCase().endsWith('.trpg');

// Паки контента (прототип P): выбираем .json и ЧИТАЕМ текст (сами данные,
// а не имя файла — в отличие от заглушки .trpg).
const pickLocalContentPack = () => new Promise((resolve) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    resolve(null);
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) { resolve(null); return; }
    try {
      resolve({ name: file.name, text: await file.text() });
    } catch {
      resolve(null);
    }
  };
  input.click();
});

const pickLocalTrpg = () => new Promise((resolve) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    resolve(null);
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.trpg';
  input.onchange = () => {
    const file = input.files && input.files[0];
    resolve(file && isTrpgName(file.name) ? file.name : null);
  };
  input.click();
});

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
  const installVanilla = useSettingPackStore((state) => state.installVanilla);
  const installLocalFile = useSettingPackStore((state) => state.installLocalFile);
  const [pickedFileName, setPickedFileName] = useState(null);
  const pickingRef = useRef(false);
  // Паки контента (прототип P).
  const contentPacks = useContentPackStore(selectContentPacks);
  const installPackText = useContentPackStore((state) => state.installPackText);
  const countPackUsage = useContentPackStore((state) => state.countPackUsage);
  const deletePack = useContentPackStore((state) => state.deletePack);
  const [packResult, setPackResult] = useState(null); // { ok, message? , errors? }

  const available = getVanillaCatalog().filter(
    (entry) => !installed.some((item) => item.id === entry.id),
  );

  const confirmDelete = async (entry) => {
    // Заголовок из каталога, имя пакета — подстановкой в тело диалога.
    if (await confirmAlert('settingDelete', { name: entry.name })) {
      deleteSetting(entry.id);
    }
  };

  const handlePickLocal = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const name = await pickLocalTrpg();
      if (name) setPickedFileName(name);
    } finally {
      pickingRef.current = false;
    }
  };

  const handleInstallContentPack = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const picked = await pickLocalContentPack();
      if (!picked) return;
      const result = installPackText(picked.text);
      if (result.ok) {
        setPackResult({
          ok: true,
          message: tHomeScreen('gameSetting.contentPacks.installedOk', {
            name: result.pack.manifest.name,
            w: result.summary.weapons,
            m: result.summary.weaponMods,
            a: result.summary.ammo,
          }),
        });
      } else {
        setPackResult({ ok: false, errors: result.errors });
      }
    } finally {
      pickingRef.current = false;
    }
  };

  const confirmDeleteContentPack = async (pack) => {
    const count = await countPackUsage(pack.manifest.packId);
    if (await confirmAlert('contentPackDelete', { name: pack.manifest.name, count })) {
      await deletePack(pack.manifest.packId);
      setPackResult(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{tHomeScreen('gameSetting.title')}</Text>
          <ScrollView style={styles.scroll}>
            {installed.map((entry) => {
              const selected = entry.id === activeId;
              return (
                <View key={entry.id} style={[styles.installedRow, selected && styles.installedRowActive]}>
                  <Text style={styles.settingName} numberOfLines={2}>{entry.name}</Text>
                  <ActionButton
                    label={tHomeScreen('gameSetting.select')}
                    onPress={() => selectSetting(entry.id)}
                    disabled={selected}
                  />
                  <ActionButton
                    label={tHomeScreen('gameSetting.delete')}
                    onPress={() => confirmDelete(entry)}
                  />
                </View>
              );
            })}

            <View style={styles.plusBlock}>
              <Text style={styles.plusMark}>+</Text>
              <Text style={styles.blockTitle}>{tHomeScreen('gameSetting.chooseSetting')}</Text>
              {available.map((entry) => (
                <View key={entry.id} style={styles.availableRow}>
                  <Text style={styles.settingName} numberOfLines={2}>{entry.name}</Text>
                  <ActionButton
                    label={tHomeScreen('gameSetting.install')}
                    onPress={() => installVanilla(entry.id)}
                  />
                </View>
              ))}
            </View>

            <View style={styles.plusBlock}>
              <Text style={styles.plusMark}>+</Text>
              <TouchableOpacity style={styles.filePick} onPress={handlePickLocal}>
                <MaterialCommunityIcons name="file-plus-outline" size={22} color="#f0e68c" />
                <Text style={styles.filePickText}>{tHomeScreen('gameSetting.localTrpg')}</Text>
              </TouchableOpacity>
              {pickedFileName ? (
                <Text style={styles.fileName}>{pickedFileName}</Text>
              ) : null}
              <ActionButton
                label={tHomeScreen('gameSetting.install')}
                onPress={() => {
                  if (!pickedFileName) return;
                  installLocalFile(pickedFileName);
                  setPickedFileName(null);
                }}
                disabled={!pickedFileName}
              />
            </View>

            {/* Паки контента (прототип P): установка JSON из генератора,
               удаление — полное (каскад по сейвам). */}
            <View style={styles.plusBlock}>
              <Text style={styles.plusMark}>+</Text>
              <Text style={styles.blockTitle}>{tHomeScreen('gameSetting.contentPacks.title')}</Text>
              {contentPacks.map((pack) => (
                <View key={pack.manifest.packId} style={styles.availableRow}>
                  <Text style={styles.settingName} numberOfLines={2}>{pack.manifest.name}</Text>
                  <ActionButton
                    label={tHomeScreen('gameSetting.delete')}
                    onPress={() => confirmDeleteContentPack(pack)}
                  />
                </View>
              ))}
              {contentPacks.length === 0 && (
                <Text style={styles.filePickText}>{tHomeScreen('gameSetting.contentPacks.empty')}</Text>
              )}
              <TouchableOpacity style={styles.filePick} onPress={handleInstallContentPack}>
                <MaterialCommunityIcons name="package-variant-closed" size={22} color="#f0e68c" />
                <Text style={styles.filePickText}>{tHomeScreen('gameSetting.contentPacks.install')}</Text>
              </TouchableOpacity>
              {packResult && packResult.ok && (
                <Text style={styles.packOkText}>{packResult.message}</Text>
              )}
              {packResult && !packResult.ok && (
                <View>
                  <Text style={styles.packErrorTitle}>
                    {tHomeScreen('gameSetting.contentPacks.errorsTitle')}
                  </Text>
                  {packResult.errors.slice(0, 5).map((e, i) => (
                    <Text key={`packErr_${i}`} style={styles.packErrorText}>
                      {`${e.path}: ${e.message}`}
                    </Text>
                  ))}
                </View>
              )}
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
  packOkText: { color: '#86efac', marginTop: 8, fontSize: 13 },
  packErrorTitle: { color: '#fca5a5', marginTop: 8, fontSize: 13, fontWeight: '700' },
  packErrorText: { color: '#fca5a5', marginTop: 2, fontSize: 12 },
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
  settingName: { flex: 1, color: '#f9fafb', fontSize: 15 },
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
