// components/gm/PlayerNoticesModal.js
// Патч 558/559 — «что Мастер прислал» ИГРАЮЩЕМУ персонажу.
//
// Слово владельца (558): «На списке персонажей ничего не всплывает — меняется
// цвет иконки сервера (например, синий). Списком, что происходит. Если мастер
// прислал уровень — окно по типу релиза с кнопкой ок».
// Слово владельца (559): «А мы можем трансляцию оставить как есть. Она оффлайн
// не работает. А посланные эффекты в стиле "что нового" при входе».
//
// Значит: над списком персонажей не висит ни одного окна (этим занимается
// флаг homeFocused), а при входе в персонажа показывается одно окно в стиле
// «Что нового» со списком применённых эффектов (уровень, крышки, лечение,
// увечья, медикаменты). Трансляции сюда не входят — они работают плашкой.
// «Понятно» помечает всё прочитанным для этого персонажа и гасит синюю иконку.

import React, { useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore, { selectUiMode } from '../../src/store/appSettingsStore';
import useUiModeStore from '../../src/room/uiModeStore';
import usePlayerNoticesStore, { unreadNoticesFor } from '../../src/room/playerNoticesStore';
import usePlayerFocusStore from '../../src/room/playerFocusStore';
import { useLocale } from '../../i18n/locale';
import { formatGm, tGm } from '../../modules/fallout/gm/gmI18n';

export default function PlayerNoticesModal() {
  const locale = useLocale();
  const notices = usePlayerNoticesStore((s) => s.notices);
  const hydrate = usePlayerNoticesStore((s) => s.hydrate);
  const markReadForCharacter = usePlayerNoticesStore((s) => s.markReadForCharacter);
  const currentCharacterId = useCharacterStore((s) => s.currentCharacterId);
  const characterName = useCharacterStore((s) => s.characterName);
  const homeFocused = usePlayerFocusStore((s) => s.homeFocused);
  const storeUiMode = useAppSettingsStore(selectUiMode);
  const tabUiMode = useUiModeStore((s) => s.tabUiMode);
  const isGmMode = (tabUiMode || storeUiMode) === 'gm';

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const unread = useMemo(
    () => unreadNoticesFor(notices, currentCharacterId),
    [notices, currentCharacterId],
  );

  // Только при входе в персонажа: homeFocused === false. На списке — тишина,
  // там о пришедшем говорит только синяя иконка сервера.
  if (isGmMode || homeFocused !== false || !currentCharacterId || unread.length === 0) return null;

  const close = () => markReadForCharacter(currentCharacterId);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.dialog} testID="player-notices-modal">
          <Text style={styles.title}>{tGm('notices.title', locale)}</Text>
          <Text style={styles.subtitle}>
            {formatGm(tGm('notices.subtitle', locale), { character: characterName || '—' })}
          </Text>
          <ScrollView style={styles.scroll} nestedScrollEnabled>
            {unread.map((item) => (
              <Text key={item.id} style={styles.line}>
                • {item.text}
                {item.roomName ? (
                  <Text style={styles.lineMeta}>{` (${item.roomName})`}</Text>
                ) : null}
              </Text>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={close} testID="player-notices-ok">
            <Text style={styles.closeText}>{tGm('notices.ok', locale)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#1f241f', borderRadius: 14, borderWidth: 1, borderColor: '#3f4a3a', padding: 18, width: '100%', maxWidth: 420, maxHeight: '85%' },
  scroll: { flexShrink: 1 },
  title: { color: '#f0e68c', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#9ca88f', fontSize: 12, marginBottom: 10 },
  line: { color: '#e8e6d9', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  lineMeta: { color: '#9ca88f', fontSize: 12 },
  closeBtn: { backgroundColor: '#3f4a3a', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 14 },
  closeText: { color: '#f0e68c', fontSize: 14, fontWeight: '700' },
};
