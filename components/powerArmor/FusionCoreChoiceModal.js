/**
 * FusionCoreChoiceModal — диалог выбора Ядерного блока (план §5.1/§5.4).
 *
 * Поднимается контекстом (pendingCoreChoice) только когда в инвентаре несколько
 * блоков с РАЗНЫМ зарядом — игрок выбирает, какой поставить в каркас. Если заряд
 * одинаковый у всех, контекст берёт первый блок молча и диалог не показывается.
 *
 * kind 'equip'   — отмена (крест/Отмена) прерывает надевание каркаса;
 * kind 'depleted'— отмена снимает обесточенный пакет в инвентарь.
 */
import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useCharacter } from '../CharacterContext';
import { tInventory } from '../screens/InventoryScreen/logic/inventoryI18n';
import { getEquipmentCatalog } from '../../i18n/equipmentCatalog';
import { useLocale } from '../../i18n/locale';
import { FUSION_CORE_ID } from '../../domain/powerArmor';

const FusionCoreChoiceModal = () => {
  const locale = useLocale();
  const { pendingCoreChoice, resolveCoreChoice } = useCharacter();

  if (!pendingCoreChoice) return null;

  const coreCatalogName = (getEquipmentCatalog(locale)?.ammoTypes || [])
    .find((entry) => entry.id === FUSION_CORE_ID)?.name || FUSION_CORE_ID;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => resolveCoreChoice(null)}
    >
      <View style={localStyles.overlay}>
        <View style={localStyles.content}>
          <Text style={localStyles.title}>
            {tInventory('screen.alerts.powerArmorChooseCoreTitle', 'Выбор Ядерного блока')}
          </Text>
          {(pendingCoreChoice.cores || []).map((core) => (
            <TouchableOpacity
              key={core.id}
              style={localStyles.coreRow}
              onPress={() => resolveCoreChoice(core.id)}
            >
              <Text style={localStyles.coreRowText}>
                {`${coreCatalogName} (${core.charges}/${core.maxCharges})`}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={localStyles.cancelRow}
            onPress={() => resolveCoreChoice(null)}
          >
            <Text style={localStyles.cancelRowText}>
              {tInventory('screen.actions.cancel', 'Отмена')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const localStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderColor: '#5a5a5a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  title: {
    color: '#f0e68c',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  coreRow: {
    borderColor: '#5a5a5a',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  coreRowText: {
    color: '#e0e0e0',
    fontSize: 14,
    textAlign: 'center',
  },
  cancelRow: {
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelRowText: {
    color: '#f0e68c',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default FusionCoreChoiceModal;
