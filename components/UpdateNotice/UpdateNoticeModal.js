// components/UpdateNotice/UpdateNoticeModal.js
// Окно «Что нового» (патч 321, слово владельца): приложение при запуске
// читает /version.json всегда свежим; если версия на сервере новее
// запомненной на устройстве — показывает чейнджлог. Галочка «больше не
// показывать» запоминает версию; без галочки окно появится снова при
// следующем запуске. Логика и строки чейнджлога — src/utils/appVersion.js
// и public/version.json; здесь только отрисовка.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { tApp } from '../../i18n/appI18n';
import { useLocale } from '../../i18n/locale';
import {
  fetchLatestVersion,
  readAckedVersion,
  writeAckedVersion,
  shouldShowUpdateNotice,
  notesForLocale,
} from '../../src/utils/appVersion';

const storage = () => (typeof window !== 'undefined' ? window.localStorage : null);

export default function UpdateNoticeModal() {
  const [notice, setNotice] = useState(null);
  const [dontShow, setDontShow] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    // Веб-платформа: localStorage и /version.json существуют только там.
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    let cancelled = false;
    fetchLatestVersion().then((latest) => {
      if (cancelled || !latest) return;
      const acked = readAckedVersion(window.localStorage);
      if (shouldShowUpdateNotice(latest.version, acked)) setNotice(latest);
    });
    return () => { cancelled = true; };
  }, []);

  if (!notice) return null;

  const close = () => {
    if (dontShow) writeAckedVersion(storage(), notice.version);
    setNotice(null);
    setDontShow(false);
  };

  const lines = notesForLocale(notice.notes, locale);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{tApp('updateNotice.title')}</Text>
          {lines.map((line, index) => (
            <Text key={`n_${index}`} style={styles.line}>• {line}</Text>
          ))}
          <TouchableOpacity style={styles.checkRow} onPress={() => setDontShow((v) => !v)}>
            <MaterialCommunityIcons
              name={dontShow ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={20}
              color="#d4af37"
            />
            <Text style={styles.checkText}>{tApp('updateNotice.dontShow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={close}>
            <Text style={styles.closeText}>{tApp('updateNotice.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#1f241f', borderRadius: 14, borderWidth: 1, borderColor: '#3f4a3a', padding: 18, width: '100%', maxWidth: 420 },
  title: { color: '#f0e68c', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  line: { color: '#e8e6d9', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  checkText: { color: '#c9c6b5', fontSize: 13 },
  closeBtn: { backgroundColor: '#3f4a3a', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 14 },
  closeText: { color: '#f0e68c', fontSize: 14, fontWeight: '700' },
};
