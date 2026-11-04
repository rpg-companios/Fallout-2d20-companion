import React from 'react';
import {
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/locale';
import { tLootTrade, formatLootTrade } from '../screens/LootTradeScreen/logic/lootTradeI18n';
import { modalStyles, lockLightStyles, LOCK_PALETTE } from './lockPickingStyles';

/**
 * Патч 525: входная модалка отдельно выданной точки проверки.
 *
 * По структуре это окно локации (карточка точки + кнопки «Смотреть» /
 * «Взломать»), но без «Покинуть локацию» и без «Свернуть»: отдельный замок
 * или терминал не является локацией. Мини-игра вообще не монтируется, пока
 * игрок не нажмёт «Взломать» — поэтому пустая «как бы запущенная» доска
 * больше не показывается.
 *
 * Гамма — светлая палитра модалок (`ADMIN_MODAL_PALETTE` через
 * `lootTradeFormStyles`), а не зелёный терминал. Каркас окна, подписи и
 * кнопки импортированы, своих базовых стилей нет (docs/ui-modals-rules.md).
 */

const styles = lockLightStyles;

const StandaloneCheckModal = ({
  visible,
  check,
  isLock = true,
  blocked = false,
  badge = null,
  onView,
  onHack,
  onClose,
}) => {
  useLocale();
  const title = check?.name || tLootTrade(isLock ? 'lock.title' : 'terminal.title');
  const icon = isLock ? 'lock' : 'console';
  const viewLabel = tLootTrade(isLock ? 'lock.view' : 'terminal.view');
  const hackLabel = tLootTrade(isLock ? 'lock.hack' : 'terminal.hack');
  const difficulty = Math.max(0, Math.floor(Number(check?.difficulty) || 0));

  return (
    <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons name={icon} size={22} color={LOCK_PALETTE.text} />
            <Text numberOfLines={1} style={[modalStyles.title, styles.headerTitle]}>
              {title}
            </Text>
            <TouchableOpacity
              testID="check-entry-close"
              accessibilityRole="button"
              accessibilityLabel={tLootTrade('lock.close')}
              style={styles.closeButton}
              onPress={onClose}
            >
              <MaterialCommunityIcons name="close" size={20} color={LOCK_PALETTE.mutedText} />
            </TouchableOpacity>
          </View>

          {Boolean(check?.description) ? (
            <Text style={modalStyles.hintText}>{check.description}</Text>
          ) : null}

          <View style={styles.pointCard} testID="check-entry-point">
            <MaterialCommunityIcons name={icon} size={26} color={LOCK_PALETTE.text} />
            <View style={styles.pointBody}>
              <Text style={modalStyles.label}>{title}</Text>
              <Text style={modalStyles.hintText}>
                {formatLootTrade(tLootTrade('card.terminalDifficulty'), { difficulty })}
              </Text>
            </View>
          </View>

          {badge ? <Text style={styles.badgeText}>{badge}</Text> : null}

          <View style={modalStyles.footer} testID="check-entry-actions">
            <TouchableOpacity
              testID="check-view-button"
              accessibilityRole="button"
              disabled={blocked}
              style={[
                modalStyles.btn,
                modalStyles.cancelBtn,
                blocked && styles.buttonDisabled,
              ]}
              onPress={onView}
            >
              <Text style={modalStyles.cancelBtnText}>{viewLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="check-hack-button"
              accessibilityRole="button"
              disabled={blocked}
              style={[
                modalStyles.btn,
                modalStyles.saveBtn,
                blocked && styles.buttonDisabled,
              ]}
              onPress={onHack}
            >
              <Text style={modalStyles.saveBtnText}>{hackLabel}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hintText} testID="check-entry-hint">
            {tLootTrade('player.checkEntryHint')}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

export default StandaloneCheckModal;
