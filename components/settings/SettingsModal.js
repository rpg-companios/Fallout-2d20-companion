import React from 'react';
import { Modal, View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import useAppSettingsStore from '../../src/store/appSettingsStore';
import { tHomeScreen } from '../screens/HomeScreen/logic/homeScreenI18n';

export default function SettingsModal({ visible, onClose }) {
  const durabilityLossEnabled = useAppSettingsStore((state) => state.weaponDurabilityLossEnabled);
  const qualityEnabled = useAppSettingsStore((state) => state.randomWeaponQualityEnabled);
  const loss = useAppSettingsStore((state) => state.weaponDurabilityLossPer10Shots);
  const foldersEnabled = useAppSettingsStore((state) => state.characterFoldersEnabled);

  const setDurabilityLossEnabled = useAppSettingsStore((state) => state.setWeaponDurabilityLossEnabled);
  const setQualityEnabled = useAppSettingsStore((state) => state.setRandomWeaponQualityEnabled);
  const setLoss = useAppSettingsStore((state) => state.setWeaponDurabilityLossPer10Shots);
  const setFoldersEnabled = useAppSettingsStore((state) => state.setCharacterFoldersEnabled);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{tHomeScreen('settings.title')}</Text>

          <Text style={styles.sectionTitle}>{tHomeScreen('settings.survivalModeTitle')}</Text>

          <View style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.label}>{tHomeScreen('settings.durabilityTitle')}</Text>
              <Text style={styles.description}>{tHomeScreen('settings.durabilityDescription')}</Text>
            </View>
            <Switch value={durabilityLossEnabled} onValueChange={setDurabilityLossEnabled} />
          </View>

          {durabilityLossEnabled && (
            <>
              <View style={styles.loss}>
                <Text style={styles.label}>{tHomeScreen('settings.lossTitle')}</Text>
                <View style={styles.counter}>
                  <TouchableOpacity disabled={loss <= 1} onPress={() => setLoss(loss - 1)}>
                    <Text style={styles.button}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.value}>{loss}</Text>
                  <TouchableOpacity disabled={loss >= 100} onPress={() => setLoss(loss + 1)}>
                    <Text style={styles.button}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.description}>{tHomeScreen('settings.lossDescription')}</Text>
              </View>

              <View style={[styles.row, styles.settingRow]}>
                <View style={styles.text}>
                  <Text style={styles.label}>{tHomeScreen('settings.qualityTitle')}</Text>
                  <Text style={styles.description}>{tHomeScreen('settings.qualityDescription')}</Text>
                </View>
                <Switch value={qualityEnabled} onValueChange={setQualityEnabled} />
              </View>
            </>
          )}

          <View style={styles.separator} />

          <View style={styles.row}>
            <View style={styles.text}>
              <Text style={styles.label}>{tHomeScreen('settings.foldersTitle')}</Text>
              <Text style={styles.description}>{tHomeScreen('settings.foldersDescription')}</Text>
            </View>
            <Switch value={foldersEnabled} onValueChange={setFoldersEnabled} />
          </View>

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
});
