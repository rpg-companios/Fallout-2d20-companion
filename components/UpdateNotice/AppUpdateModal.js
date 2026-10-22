// components/UpdateNotice/AppUpdateModal.js
// Окно «Доступна новая версия» для APK и PWA.
//
// Отличие от UpdateNoticeModal: тот показывает «что нового» в УЖЕ
// загруженной веб-версии, а этот — что на сервере лежит сборка новее
// установленной (app-release.json движка, см. src/utils/appUpdates.js).
// В APK кнопка ведёт на постоянный адрес APK последнего релиза, в PWA —
// обновляет страницу.
//
// Окно управляется стором: план кладёт проверка (автоматическая при запуске
// или ручная из «О приложении»), здесь только отрисовка.

import React from 'react';
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { tApp } from '../../i18n/appI18n';
import { useLocale, useModuleLocale } from '../../i18n/locale';
import { notesForLocale } from '../../src/utils/appVersion';
import { dismissAppUpdate, openAppUpdate } from '../../src/utils/appUpdates';
import useAppUpdateStore, { selectAppUpdatePlan } from '../../src/store/appUpdateStore';

const substitute = (text, params) => String(text ?? '').replace(
  /\{(\w+)\}/g,
  (match, key) => (params?.[key] != null ? String(params[key]) : match),
);

export default function AppUpdateModal() {
  const plan = useAppUpdateStore(selectAppUpdatePlan);
  const locale = useLocale();
  useModuleLocale();

  if (!plan) return null;

  const isWeb = Platform.OS === 'web';
  const lines = notesForLocale(plan.notes, locale);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissAppUpdate}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{tApp('appUpdate.title')}</Text>
          <Text style={styles.version}>
            {substitute(tApp('appUpdate.versionLabel'), { version: plan.version })}
          </Text>
          {/* Заметки длинные — список прокручивается, кнопки на месте. */}
          <ScrollView style={styles.scroll} nestedScrollEnabled>
            {lines.map((line, index) => (
              <Text key={`n_${index}`} style={styles.line}>• {line}</Text>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => openAppUpdate(plan)}
          >
            <Text style={styles.primaryText}>
              {isWeb ? tApp('appUpdate.reload') : tApp('appUpdate.download')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={dismissAppUpdate}>
            <Text style={styles.secondaryText}>{tApp('appUpdate.later')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#1f241f', borderRadius: 14, borderWidth: 1, borderColor: '#3f4a3a', padding: 18, width: '100%', maxWidth: 420, maxHeight: '85%' },
  scroll: { flexShrink: 1, marginTop: 4 },
  title: { color: '#f0e68c', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  version: { color: '#cfc9a3', fontSize: 13, marginBottom: 8 },
  line: { color: '#e8e6d9', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  primaryBtn: { backgroundColor: '#c9b458', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 14 },
  primaryText: { color: '#1a1a1a', fontSize: 14, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#3f4a3a', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  secondaryText: { color: '#f0e68c', fontSize: 14, fontWeight: '700' },
};
