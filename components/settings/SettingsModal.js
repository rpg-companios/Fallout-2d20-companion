import React from 'react';
import { Modal, View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { ENGINE_SETTINGS, getModuleSettings } from '../../domain/settingsCatalog';
import { tHomeScreen } from '../screens/HomeScreen/logic/homeScreenI18n';
import { getModuleI18n } from '../../domain/registry';
import { getCurrentLocale } from '../../i18n/locale';

// Строки настроек: движковые — из i18n экрана Home (homeScreenI18n),
// модульные — из i18n модуля (system/settings.json).
const tSetting = (key) => {
  if (!key) return '';
  const moduleDict = getModuleI18n(getCurrentLocale());
  let current = moduleDict?.settings;
  if (!current) return tHomeScreen(key);
  for (const part of key.split('.')) {
    current = current?.[part];
    if (current === undefined) return tHomeScreen(key);
  }
  return current;
};

const tSection = (sectionKey) => {
  const moduleDict = getModuleI18n(getCurrentLocale());
  const direct = moduleDict?.settings?.[sectionKey];
  return typeof direct === 'string' ? direct : tHomeScreen(`settings.${sectionKey}Title`);
};

const ALL_SETTINGS = [...ENGINE_SETTINGS, ...getModuleSettings()];

const SettingRow = ({ setting }) => {
  const value = useAppSettingsStore((state) => state.getSettingValue(setting.id));
  const setValue = useAppSettingsStore((state) => state.setValue);

  if (setting.type === 'number') {
    const min = setting.min ?? 0;
    const max = setting.max ?? 100;
    return (
      <View style={styles.loss}>
        <Text style={styles.label}>{tSetting(setting.labelKey)}</Text>
        <View style={styles.counter}>
          <TouchableOpacity disabled={Number(value) <= min} onPress={() => setValue(setting.id, Number(value) - 1)}>
            <Text style={styles.button}>−</Text>
          </TouchableOpacity>
          <Text style={styles.value}>{value}</Text>
          <TouchableOpacity disabled={Number(value) >= max} onPress={() => setValue(setting.id, Number(value) + 1)}>
            <Text style={styles.button}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.description}>{tSetting(setting.descriptionKey)}</Text>
      </View>
    );
  }

  if (setting.type === 'select') {
    return (
      <View style={[styles.row, styles.settingRow]}>
        <View style={styles.text}>
          <Text style={styles.label}>{tSetting(setting.labelKey)}</Text>
          <Text style={styles.description}>{tSetting(setting.descriptionKey)}</Text>
        </View>
        <View style={styles.selectButtons}>
          {(setting.options || []).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.selectButton, value === opt.value && styles.selectButtonActive]}
              onPress={() => setValue(setting.id, opt.value)}
            >
              <Text style={[styles.selectText, value === opt.value && styles.selectTextActive]}>
                {tSetting(opt.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // boolean
  return (
    <View style={[styles.row, styles.settingRow]}>
      <View style={styles.text}>
        <Text style={styles.label}>{tSetting(setting.labelKey)}</Text>
        <Text style={styles.description}>{tSetting(setting.descriptionKey)}</Text>
      </View>
      <Switch value={Boolean(value)} onValueChange={(v) => setValue(setting.id, v)} />
    </View>
  );
};

export default function SettingsModal({ visible, onClose }) {
  // родительский (зависимый) показывается только при включённом dependsOn
  const parentValue = useAppSettingsStore((state) =>
    state.getSettingValue('weaponDurabilityLossEnabled'));
  const visibleSettings = ALL_SETTINGS.filter(
    (s) => !s.dependsOn || parentValue === true || s.id === s.dependsOn,
  );

  // группировка по секциям с сохранением порядка
  const sections = [];
  for (const s of visibleSettings) {
    let sec = sections.find((x) => x.key === s.sectionKey);
    if (!sec) {
      sec = { key: s.sectionKey, settings: [] };
      sections.push(sec);
    }
    sec.settings.push(s);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{tHomeScreen('settings.title')}</Text>

          {sections.map((section) => (
            <View key={section.key}>
              <Text style={styles.sectionTitle}>{tSection(section.key)}</Text>
              {section.settings.map((s) => <SettingRow key={s.id} setting={s} />)}
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
  label: { fontSize: 16, fontWeight: '700' },
  description: { fontSize: 13, color: '#555', lineHeight: 18, marginTop: 6 },
  separator: { height: 1, backgroundColor: '#ddd', marginVertical: 18 },
  loss: { borderTopWidth: 1, borderColor: '#ddd', marginTop: 18, paddingTop: 16 },
  counter: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 20 },
  button: { fontSize: 28, fontWeight: '700', paddingHorizontal: 12 },
  value: { fontSize: 22, minWidth: 45, textAlign: 'center' },
  close: { alignSelf: 'flex-end', marginTop: 18, padding: 10 },
  selectButtons: { flexDirection: 'row', gap: 6 },
  selectButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
  selectButtonActive: { backgroundColor: '#f0e68c', borderColor: '#c9b458' },
  selectText: { fontSize: 13 },
  selectTextActive: { fontWeight: '700' },
});
