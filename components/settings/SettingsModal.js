import React from 'react';
import { Modal, View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import {
  ENGINE_SETTINGS,
  getSettingsForSurface,
  SETTING_CONTROL_SURFACES,
} from '../../domain/settingsCatalog';
import { tHomeScreen } from '../screens/HomeScreen/logic/homeScreenI18n';
import { getModuleI18n } from '../../domain/registry';
import {
  getCurrentModuleLocale,
  useLocale,
  useModuleLocale,
} from '../../i18n/locale';

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
  const value = resolvePath(getModuleI18n(getCurrentModuleLocale()), key);
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

const SETTINGS_SCREEN_SETTINGS = getSettingsForSurface(SETTING_CONTROL_SURFACES.SETTINGS);

const SettingRow = ({ setting }) => {
  const value = useAppSettingsStore((state) => state.getSettingValue(setting.id));
  const setValue = useAppSettingsStore((state) => state.setValue);

  if (setting.type === 'number') {
    const min = setting.min ?? 0;
    const max = setting.max ?? 100;
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

export default function SettingsModal({ visible, onClose }) {
  useLocale();
  useModuleLocale();
  useAppSettingsStore((state) => state.values); // зависимости между настройками
  const getSettingValue = useAppSettingsStore((state) => state.getSettingValue);
  const visibleSettings = SETTINGS_SCREEN_SETTINGS.filter(
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

          {sections.map((section) => (
            <View key={section.key}>
              <Text style={styles.sectionTitle}>{tSection(section)}</Text>
              {section.settings.map((setting) => <SettingRow key={setting.id} setting={setting} />)}
              <View style={styles.separator} />
            </View>
          ))}

          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Text>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
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
  close: { alignSelf: 'flex-end', marginTop: 18, padding: 10 },
  selectButtons: { flexDirection: 'row', gap: 6 },
  selectButtonsColumn: { flex: 2, flexDirection: 'column' },
  selectButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
  selectButtonActive: { backgroundColor: '#f0e68c', borderColor: '#c9b458' },
  selectText: { fontSize: 13 },
  selectTextColumn: { textAlign: 'center' },
  selectTextActive: { fontWeight: '700' },
});
