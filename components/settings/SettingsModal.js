import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import {
  ENGINE_SETTINGS,
  getSettingsForSurface,
  SETTING_CONTROL_SURFACES,
} from '../../domain/settingsCatalog';
import { tHomeScreen } from '../screens/HomeScreen/logic/homeScreenI18n';
import { getSettingNames } from '../../domain/registry.js';
import {
  getCurrentModuleLocale,
  useLocale,
  useModuleLocale,
} from '../../i18n/locale';
import { getActiveModuleId } from '../../domain/moduleLocale';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import {
  createUserEquipmentTemplate,
  USER_EQUIPMENT_FILE_NAMES,
  USER_EQUIPMENT_KINDS,
} from '../../domain/userEquipment.js';
import useUserEquipmentStore from '../../src/store/userEquipmentStore.js';
import {
  pickUserEquipmentJsonFile,
  saveUserEquipmentJsonFile,
} from '../../src/utils/userEquipmentFileTransfer.js';
import { showRawAlert } from '../alerts/alertService';
import {
  syncUserEquipmentToCloudIfEnabled,
  syncUserEquipmentWithCloud,
} from '../cloudSync/googleDriveSync.js';

const resolvePath = (dictionary, key) => {
  let current = dictionary;
  for (const part of key.split('.')) {
    current = current?.[part];
    if (current === undefined) return undefined;
  }
  return current;
};

const isEngineSetting = (setting) =>
  ENGINE_SETTINGS.some((candidate) => candidate.id === setting.id);

const requireModuleText = (key) => {
  const value = resolvePath(getSettingNames(getCurrentModuleLocale()), key);
  if (typeof value !== 'string') {
    throw new Error(`[SettingsModal] В активном сеттинге отсутствует строка "${key}"`);
  }
  return value;
};

// Движковые строки принадлежат движку, строки механик — только активному
// сеттингу: между этими словарями нет перекрёстных фолбэков.
const tSetting = (setting, key) => {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`[SettingsModal] У настройки "${setting.id}" отсутствует ключ перевода`);
  }
  return isEngineSetting(setting) ? tHomeScreen(key) : requireModuleText(key);
};

const tSection = (section) => (
  section.owner === 'engine'
    ? tHomeScreen(`settings.${section.sectionKey}Title`)
    : requireModuleText(`settings.${section.sectionKey}`)
);

// Число со свободным вводом (флаг freeInput в данных настройки, например
// курс времени выживания): ввод с клавиатуры + −/+, фиксация при потере
// фокуса/Enter с клампом в min/max.
const FreeNumberRow = ({ setting, min, max }) => {
  const value = useAppSettingsStore((state) => state.getSettingValue(setting.id));
  const setValue = useAppSettingsStore((state) => state.setValue);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    setValue(setting.id, clamped);
  };

  return (
    <View style={styles.loss}>
      <Text style={styles.label}>{tSetting(setting, setting.labelKey)}</Text>
      <View style={styles.counter}>
        <TouchableOpacity
          disabled={Number(value) <= min}
          onPress={() => setValue(setting.id, Number(value) - 1)}
        >
          <Text style={styles.button}>−</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          maxLength={4}
        />
        <TouchableOpacity
          disabled={Number(value) >= max}
          onPress={() => setValue(setting.id, Number(value) + 1)}
        >
          <Text style={styles.button}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.description}>{tSetting(setting, setting.descriptionKey)}</Text>
    </View>
  );
};

const SettingRow = ({ setting }) => {
  const value = useAppSettingsStore((state) => state.getSettingValue(setting.id));
  const setValue = useAppSettingsStore((state) => state.setValue);

  if (setting.type === 'number') {
    const min = setting.min ?? 0;
    const max = setting.max ?? 100;
    if (setting.freeInput) {
      return <FreeNumberRow setting={setting} min={min} max={max} />;
    }
    return (
      <View style={styles.loss}>
        <Text style={styles.label}>{tSetting(setting, setting.labelKey)}</Text>
        <View style={styles.counter}>
          <TouchableOpacity disabled={Number(value) <= min} onPress={() => setValue(setting.id, Number(value) - 1)}>
            <Text style={styles.button}>−</Text>
          </TouchableOpacity>
          <Text style={styles.value}>{value}</Text>
          <TouchableOpacity disabled={Number(value) >= max} onPress={() => setValue(setting.id, Number(value) + 1)}>
            <Text style={styles.button}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.description}>{tSetting(setting, setting.descriptionKey)}</Text>
      </View>
    );
  }

  if (setting.type === 'select') {
    const hasColumnOptions = setting.optionsLayout === 'column';
    return (
      <View style={[styles.row, styles.settingRow]}>
        <View style={[styles.text, hasColumnOptions && styles.columnOptionsText]}>
          <Text style={styles.label}>{tSetting(setting, setting.labelKey)}</Text>
          <Text style={styles.description}>{tSetting(setting, setting.descriptionKey)}</Text>
        </View>
        <View style={[styles.selectButtons, hasColumnOptions && styles.selectButtonsColumn]}>
          {setting.options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.selectButton, value === option.value && styles.selectButtonActive]}
              onPress={() => setValue(setting.id, option.value)}
            >
              <Text style={[
                styles.selectText,
                hasColumnOptions && styles.selectTextColumn,
                value === option.value && styles.selectTextActive,
              ]}>
                {tSetting(setting, option.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.settingRow]}>
      <View style={styles.text}>
        <Text style={styles.label}>{tSetting(setting, setting.labelKey)}</Text>
        <Text style={styles.description}>{tSetting(setting, setting.descriptionKey)}</Text>
      </View>
      <Switch value={Boolean(value)} onValueChange={(nextValue) => setValue(setting.id, nextValue)} />
    </View>
  );
};

const USER_EQUIPMENT_LABEL_KEYS = Object.freeze({
  weapons: 'weapons',
  armor: 'armor',
  weaponMods: 'weaponMods',
  armorMods: 'armorMods',
});

const formatSettingText = (key, params = {}) => Object.entries(params).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  tHomeScreen(`settings.userEquipment.${key}`),
);

const UserEquipmentSection = ({ moduleLocale }) => {
  const settingId = getActiveModuleId();
  const settingData = useUserEquipmentStore((state) => state.bySetting[settingId]);
  const revision = useUserEquipmentStore((state) => state.revision);
  const importDocument = useUserEquipmentStore((state) => state.importDocument);
  const [busy, setBusy] = useState(null);
  void revision;

  const reportError = (error) => showRawAlert({
    title: tHomeScreen('settings.userEquipment.errorTitle'),
    message: error?.message || String(error),
  });

  const handleImport = async (kind) => {
    if (busy) return;
    setBusy(kind);
    try {
      const selected = await pickUserEquipmentJsonFile();
      if (!selected) return;
      if (selected.error) throw selected.error;
      const result = importDocument({
        rawText: selected.text,
        settingId,
        expectedKind: kind,
        fileName: selected.name,
        catalog: getEquipmentCatalog(moduleLocale),
      });
      if (!result.ok) {
        await reportError(result.errors.slice(0, 8).map((entry) => entry.message).join('\n'));
        return;
      }
      let cloudMessage = '';
      try {
        const cloud = await syncUserEquipmentToCloudIfEnabled();
        if (cloud?.synced) cloudMessage = `\n\n${formatSettingText('syncSuccess')}`;
        else if (cloud?.reason === 'not-configured') cloudMessage = `\n\n${formatSettingText('syncSkipped')}`;
      } catch (error) {
        cloudMessage = `\n\n${formatSettingText('syncError')} ${error?.message || ''}`;
      }
      await showRawAlert({
        title: tHomeScreen('settings.userEquipment.successTitle'),
        message: `${formatSettingText('importSuccess')}\n${formatSettingText('count', { count: result.importedCount })}${cloudMessage}`,
      });
    } catch (error) {
      await reportError(error);
    } finally {
      setBusy(null);
    }
  };

  const handleTemplate = async (kind) => {
    if (busy) return;
    setBusy(`template:${kind}`);
    try {
      const template = createUserEquipmentTemplate(kind, settingId);
      const saved = await saveUserEquipmentJsonFile(template, USER_EQUIPMENT_FILE_NAMES[kind]);
      if (!saved) throw new Error(tHomeScreen('settings.userEquipment.transferError'));
      await showRawAlert({
        title: tHomeScreen('settings.userEquipment.successTitle'),
        message: `${formatSettingText('templateSaved')}\n${USER_EQUIPMENT_FILE_NAMES[kind]}`,
      });
    } catch (error) {
      await reportError(error);
    } finally {
      setBusy(null);
    }
  };

  const handleCloudSync = async () => {
    if (busy) return;
    setBusy('cloud');
    try {
      const result = await syncUserEquipmentWithCloud();
      if (result?.synced) {
        await showRawAlert({
          title: tHomeScreen('settings.userEquipment.cloudTitle'),
          message: `${formatSettingText('syncSuccess')}\n${formatSettingText('count', { count: result.records })}`,
        });
      } else {
        await showRawAlert({
          title: tHomeScreen('settings.userEquipment.cloudTitle'),
          message: formatSettingText('syncSkipped'),
        });
      }
    } catch (error) {
      await reportError(new Error(`${formatSettingText('syncError')}\n${error?.message || ''}`));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.userEquipmentSection}>
      <Text style={styles.sectionTitle}>{tHomeScreen('settings.userEquipment.title')}</Text>
      <Text style={styles.description}>{tHomeScreen('settings.userEquipment.description')}</Text>
      {USER_EQUIPMENT_KINDS.map((kind) => (
        <View key={kind} style={styles.userEquipmentRow}>
          <View style={styles.userEquipmentText}>
            <Text style={styles.label}>{tHomeScreen(`settings.userEquipment.${USER_EQUIPMENT_LABEL_KEYS[kind]}`)}</Text>
            <Text style={styles.description}>{formatSettingText('count', { count: settingData?.[kind]?.length || 0 })}</Text>
          </View>
          <View style={styles.userEquipmentActions}>
            <TouchableOpacity
              style={[styles.userEquipmentButton, busy && styles.userEquipmentButtonDisabled]}
              disabled={Boolean(busy)}
              onPress={() => handleImport(kind)}
            >
              <Text style={styles.userEquipmentButtonText}>{tHomeScreen('settings.userEquipment.import')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.userEquipmentButton, busy && styles.userEquipmentButtonDisabled]}
              disabled={Boolean(busy)}
              onPress={() => handleTemplate(kind)}
            >
              <Text style={styles.userEquipmentButtonText}>{tHomeScreen('settings.userEquipment.template')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity
        style={[styles.userEquipmentButton, styles.userEquipmentSyncButton, busy && styles.userEquipmentButtonDisabled]}
        disabled={Boolean(busy)}
        onPress={handleCloudSync}
      >
        <Text style={styles.userEquipmentButtonText}>{tHomeScreen('settings.userEquipment.sync')}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function SettingsModal({ visible, onClose }) {
  useLocale();
  const moduleLocale = useModuleLocale();
  const activeSettingId = getActiveModuleId();
  useAppSettingsStore((state) => state.values); // зависимости между настройками
  const getSettingValue = useAppSettingsStore((state) => state.getSettingValue);
  const visibleSettings = getSettingsForSurface(SETTING_CONTROL_SURFACES.SETTINGS).filter(
    (setting) => !setting.dependsOn || getSettingValue(setting.dependsOn) === true,
  );

  const sections = [];
  for (const setting of visibleSettings) {
    const owner = isEngineSetting(setting) ? 'engine' : 'module';
    const key = `${owner}:${setting.sectionKey}`;
    let section = sections.find((candidate) => candidate.key === key);
    if (!section) {
      section = { key, owner, sectionKey: setting.sectionKey, settings: [] };
      sections.push(section);
    }
    section.settings.push(setting);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{tHomeScreen('settings.title')}</Text>

          {/* Секции настроек прокручиваются: при включённых разделах строк
              больше высоты окна (узкие экраны, предпросмотры), заголовок и
              кнопка закрытия остаются на месте (патч 211). */}
          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {sections.map((section) => (
              <View key={section.key}>
                <Text style={styles.sectionTitle}>{tSection(section)}</Text>
                {section.settings.map((setting) => <SettingRow key={setting.id} setting={setting} />)}
                <View style={styles.separator} />
              </View>
            ))}
            {activeSettingId ? <UserEquipmentSection moduleLocale={moduleLocale} /> : null}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Text>{tHomeScreen('buttons.ok')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'center', padding: 20 },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxHeight: '92%', // окно не вылезает за экран: контент уходит в прокрутку
  },
  scroll: { flexShrink: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  userEquipmentSection: { borderTopWidth: 1, borderColor: '#ddd', marginTop: 8, paddingTop: 16 },
  userEquipmentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10 },
  userEquipmentText: { flex: 1, minWidth: 130 },
  userEquipmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  userEquipmentButton: { backgroundColor: '#e8e2ca', borderColor: '#c9b458', borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  userEquipmentButtonDisabled: { opacity: 0.5 },
  userEquipmentButtonText: { color: '#333', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  userEquipmentSyncButton: { marginTop: 12, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  settingRow: { marginTop: 16 },
  text: { flex: 1 },
  columnOptionsText: { flex: 3 },
  label: { fontSize: 16, fontWeight: '700' },
  description: { fontSize: 13, color: '#555', lineHeight: 18, marginTop: 6 },
  separator: { height: 1, backgroundColor: '#ddd', marginVertical: 18 },
  loss: { borderTopWidth: 1, borderColor: '#ddd', marginTop: 18, paddingTop: 16 },
  counter: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 20 },
  button: { fontSize: 28, fontWeight: '700', paddingHorizontal: 12 },
  value: { fontSize: 22, minWidth: 45, textAlign: 'center' },
  input: {
    fontSize: 22,
    minWidth: 64,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderColor: '#999',
    paddingVertical: 4,
  },
  close: { alignSelf: 'flex-end', marginTop: 18, padding: 10 },
  selectButtons: { flexDirection: 'row', gap: 6 },
  selectButtonsColumn: { flex: 2, flexDirection: 'column' },
  selectButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
  selectButtonActive: { backgroundColor: '#f0e68c', borderColor: '#c9b458' },
  selectText: { fontSize: 13 },
  selectTextColumn: { textAlign: 'center' },
  selectTextActive: { fontWeight: '700' },
});
