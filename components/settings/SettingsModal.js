import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useAppSettingsStore from '../../src/store/appSettingsStore';
// 446: раздел «Собственное снаряжение» — импорт паков контента из Кузницы
// ушёл в глубь настроек, окно «Игровой сеттинг» скрыто в UI (владелец,
// 2026-10-25). Окно сеттинга отложено в будущее, установка паков живёт здесь.
import useContentPackStore, { selectContentPacks } from '../../src/store/contentPackStore';
import { confirmAlert } from '../alerts/alertService';
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
import {
  FEATURE_IDS,
  guardAdminAction,
  useAdminAccess,
} from '../../src/premium/adminAccessGate';

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

// 446: выбор JSON-файла пака контента (как читалось в «Игровом сеттинге» —
// текст файла, не имя). Только web-сборка; на нативных целях — отмена.
const pickContentPackJson = () => new Promise((resolve) => {
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
      resolve({ text: await file.text() });
    } catch {
      resolve(null);
    }
  };
  input.click();
});

// Раздел «Собственное снаряжение» (446): установка паков контента из
// Кузницы предметов + список установленных; удаление — полное (каскад по
// сейвам), диалог с числом следов (алерт contentPackDelete каталога).
const OwnEquipmentSection = () => {
  const contentPacks = useContentPackStore(selectContentPacks);
  const installPackText = useContentPackStore((state) => state.installPackText);
  const countPackUsage = useContentPackStore((state) => state.countPackUsage);
  const deletePack = useContentPackStore((state) => state.deletePack);
  const [packResult, setPackResult] = useState(null); // { ok, message? , errors? }
  const pickingRef = useRef(false);

  const handleLoadPack = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const picked = await pickContentPackJson();
      if (!picked) return;
      const result = installPackText(picked.text);
      if (result.ok) {
        setPackResult({
          ok: true,
          message: tHomeScreen('settings.ownEquipment.installedOk', {
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

  const confirmDeletePack = async (pack) => {
    const count = await countPackUsage(pack.manifest.packId);
    if (await confirmAlert('contentPackDelete', { name: pack.manifest.name, count })) {
      await deletePack(pack.manifest.packId);
      setPackResult(null);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>{tHomeScreen('settings.ownEquipment.title')}</Text>
      <Text style={styles.description}>{tHomeScreen('settings.ownEquipment.description')}</Text>
      {contentPacks.map((pack) => (
        <View key={pack.manifest.packId} style={[styles.row, styles.settingRow]}>
          <View style={styles.text}>
            <Text style={styles.label} numberOfLines={2}>{pack.manifest.name}</Text>
          </View>
          <TouchableOpacity style={styles.packDeleteButton} onPress={() => confirmDeletePack(pack)}>
            <Text style={styles.packDeleteText}>{tHomeScreen('settings.ownEquipment.delete')}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {contentPacks.length === 0 && (
        <Text style={styles.description}>{tHomeScreen('settings.ownEquipment.empty')}</Text>
      )}
      <TouchableOpacity style={styles.packLoad} onPress={handleLoadPack}>
        <MaterialCommunityIcons name="package-variant-closed" size={22} color="#b8860b" />
        <Text style={styles.packLoadText}>{tHomeScreen('settings.ownEquipment.load')}</Text>
      </TouchableOpacity>
      {packResult?.ok && (
        <Text style={styles.packOkText}>{packResult.message}</Text>
      )}
      {packResult && !packResult.ok && (
        <View>
          <Text style={styles.packErrorTitle}>{tHomeScreen('settings.ownEquipment.errorsTitle')}</Text>
          {packResult.errors.slice(0, 5).map((e, i) => (
            <Text key={`packErr_${i}`} style={styles.packErrorText}>{`${e.path}: ${e.message}`}</Text>
          ))}
        </View>
      )}
      <View style={styles.separator} />
    </View>
  );
};

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
  const { adminLicensed } = useAdminAccess();
  const isAdminScreenToggle = setting.id === 'adminScreenEnabled';

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
        <Text style={styles.label}>
          {tSetting(setting, setting.labelKey)}
          {isAdminScreenToggle && !adminLicensed ? ` 🔒 (${tHomeScreen('gm.licenseBadgeLocked')})` : ''}
        </Text>
        <Text style={styles.description}>{tSetting(setting, setting.descriptionKey)}</Text>
      </View>
      <Switch
        value={isAdminScreenToggle ? Boolean(value && adminLicensed) : Boolean(value)}
        onValueChange={(nextValue) => {
          if (isAdminScreenToggle && nextValue && !guardAdminAction(FEATURE_IDS.ADMIN_ACCESS)) {
            return;
          }
          setValue(setting.id, nextValue);
        }}
      />
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
            {/* 446: «Собственное снаряжение» — последняя секция настроек. */}
            <OwnEquipmentSection />
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
  // «Собственное снаряжение» (446)
  packLoad: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#c9b458', alignSelf: 'flex-start',
  },
  packLoadText: { fontSize: 14, color: '#333', fontWeight: '600' },
  packDeleteButton: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: '#ccc',
  },
  packDeleteText: { fontSize: 13, color: '#555' },
  packOkText: { marginTop: 10, fontSize: 13, color: '#256b2a' },
  packErrorTitle: { marginTop: 10, fontSize: 13, fontWeight: '700', color: '#8a1f1f' },
  packErrorText: { marginTop: 4, fontSize: 12, color: '#8a1f1f', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
});
