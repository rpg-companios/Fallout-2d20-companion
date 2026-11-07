// components/gm/PlayerNoticesModal.js
// Патч 558 — список того, что Мастер прислал ИГРАЮЩЕМУ персонажу.
//
// Слово владельца:
//   «На списке персонажей ничего не всплывает — меняется цвет иконки сервера
//    (например, синий). Списком, что происходит. Трансляции и разовые команды
//    разделить: если мастер прислал уровень — окно по типу релиза с кнопкой ОК.
//    Трансляция не даёт "доставлено".»
//
// Значит: над списком персонажей не висит ни одного окна (этим занимается
// флаг homeFocused), а когда игрок открыл конкретного персонажа — показывается
// одно окно со списком: раздел «Трансляции» и раздел «Разовые команды».
// «Понятно» помечает всё прочитанным для этого персонажа и гасит синюю иконку.

import React, { useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import useCharacterStore from '../../src/store/characterStore';
import useAppSettingsStore, { selectUiMode } from '../../src/store/appSettingsStore';
import useUiModeStore from '../../src/room/uiModeStore';
import usePlayerNoticesStore, {
  PLAYER_NOTICE_KIND,
  unreadNoticesFor,
} from '../../src/room/playerNoticesStore';
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

  // На списке персонажей ничего не всплывает — там только синяя иконка.
  // Только когда игрок действительно сидит за персонажем: homeFocused === false.
  if (isGmMode || homeFocused !== false || !currentCharacterId || unread.length === 0) return null;

  const translations = unread.filter((item) => item.kind === PLAYER_NOTICE_KIND.TRANSLATION);
  const commands = unread.filter((item) => item.kind === PLAYER_NOTICE_KIND.COMMAND);

  const renderSection = (title, items) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section} key={title}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {items.map((item) => (
          <Text key={item.id} style={styles.line}>
            • {item.kind === PLAYER_NOTICE_KIND.TRANSLATION
              ? formatGm(tGm('notices.translationLine', locale), { name: item.text || '—' })
              : item.text}
            {item.roomName ? (
              <Text style={styles.lineMeta}>{` (${item.roomName})`}</Text>
            ) : null}
          </Text>
        ))}
      </View>
    );
  };

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
            {renderSection(tGm('notices.sectionTranslations', locale), translations)}
            {renderSection(tGm('notices.sectionCommands', locale), commands)}
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
  section: { marginBottom: 12 },
  sectionTitle: { color: '#c9d2bd', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  line: { color: '#e8e6d9', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  lineMeta: { color: '#9ca88f', fontSize: 12 },
  closeBtn: { backgroundColor: '#3f4a3a', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 14 },
  closeText: { color: '#f0e68c', fontSize: 14, fontWeight: '700' },
};
