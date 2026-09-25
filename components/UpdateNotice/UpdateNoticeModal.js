// components/UpdateNotice/UpdateNoticeModal.js
// Окно «Что нового» (патч 321; 335 — один раз на релиз): приложение при
// запуске читает /version.json всегда свежим; если РЕЛИЗ на сервере новее
// запомненного — показывает описание релиза. Галочки нет: закрытие окна
// само запоминает релиз — до следующего релиза окно не беспокоит.
// Логика и строки описания — src/utils/appVersion.js и public/version.json;
// здесь только отрисовка.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
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
  const locale = useLocale();

  useEffect(() => {
    // Веб-платформа: localStorage и /version.json существуют только там.
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    let cancelled = false;
    fetchLatestVersion().then((latest) => {
      if (cancelled || !latest) return;
      const acked = readAckedVersion(window.localStorage);
      if (shouldShowUpdateNotice(latest.release, acked)) setNotice(latest);
    });
    return () => { cancelled = true; };
  }, []);

  if (!notice) return null;

  // 335 (слово владельца): один раз на релиз, без галочки — закрытие окна
  // само запоминает релиз.
  const close = () => {
    writeAckedVersion(storage(), notice.release);
    setNotice(null);
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
  closeBtn: { backgroundColor: '#3f4a3a', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 14 },
  closeText: { color: '#f0e68c', fontSize: 14, fontWeight: '700' },
};
