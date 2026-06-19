import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { getCurrentLocale } from '../../../../i18n/locale';
import ArmorLayerModal from './ArmorLayerModal';
import { tCharacterScreen } from '../logic/characterScreenI18n';


const LAYER_COLORS = {
  plating: '#4a90d9',
  armor:   '#e67e22',
  frame:   '#27ae60',
};

const ArmorPickerModal = ({ visible, slotKey, equippedRobotSlots, onClose }) => {
  const locale = getCurrentLocale();
  const isRu = locale === 'ru-RU';
  const [activeLayer, setActiveLayer] = useState(null);

  const handleLayerClose = () => {
    setActiveLayer(null);
  };

  const currentPlating = slotKey ? equippedRobotSlots?.[slotKey]?.plating : null;
  const currentArmor   = slotKey ? equippedRobotSlots?.[slotKey]?.armor   : null;
  const currentFrame   = slotKey ? equippedRobotSlots?.[slotKey]?.frame   : null;

  const layers = [
    {
      key: 'plating',
      label: tCharacterScreen('labels.plating', 'Plating'),
      current: currentPlating?.name || null,
    },
    {
      key: 'armor',
      label: tCharacterScreen('labels.armor', 'Armor'),
      current: currentArmor?.name || null,
    },
    {
      key: 'frame',
      label: tCharacterScreen('labels.frame', 'Frame'),
      current: currentFrame?.name || null,
    },
  ];

  const currentItems = { plating: currentPlating, armor: currentArmor, frame: currentFrame };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{tCharacterScreen('labels.armor', 'Armor')}</Text>

            {layers.map((layer) => (
              <TouchableOpacity
                key={layer.key}
                style={styles.layerRow}
                onPress={() => setActiveLayer(layer.key)}
                activeOpacity={0.75}
              >
                <View style={[styles.layerDot, { backgroundColor: LAYER_COLORS[layer.key] }]} />
                <Text style={styles.layerLabel}>{layer.label}</Text>
                <Text style={styles.layerCurrent} numberOfLines={1}>
                  {layer.current || ('—')}
                </Text>
                <Text style={styles.layerArrow}>›</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.okButton} onPress={onClose}>
              <Text style={styles.okButtonText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ArmorLayerModal
        visible={visible && !!activeLayer}
        slotKey={slotKey}
        layer={activeLayer}
        currentItem={activeLayer ? currentItems[activeLayer] : null}
        onClose={handleLayerClose}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  layerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  layerLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    minWidth: 70,
  },
  layerCurrent: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    textAlign: 'right',
    marginRight: 6,
  },
  layerArrow: {
    fontSize: 20,
    color: '#aaa',
    lineHeight: 22,
  },
  okButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#2c2c2c',
    borderRadius: 8,
    alignItems: 'center',
  },
  okButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default ArmorPickerModal;
