import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AddItemModal from '../../../../../components/screens/InventoryScreen/modals/AddItemModal';
import {
  getItemPrice, getCartTotal, getRemaining,
  addToCart, changeQuantity, finishPurchase,
} from '../../../../../domain/startingPurchase';
import styles from '../../../../../styles/StartingPurchaseModal.styles';
import { tCharacterScreen } from '../logic/characterScreenI18n';

/**
 * Стартовая покупка снаряжения.
 *
 * Игрок получил сумму крышек и тратит её за один заход: набирает предметы в
 * корзину, жмёт «Завершить» — предметы уходят в инвентарь, остаток становится
 * обычными крышками. Каталог ограничен потолком редкости комплекта.
 *
 * Бюджет живёт только пока открыто окно: в сейв он не попадает, отдельным
 * кошельком не становится (см. docs/architecture/counters-storage.md, правило 1).
 */
const StartingPurchaseModal = ({ visible, onClose, budget = 0, maxRarity = null, onFinish }) => {
  const [cart, setCart] = useState([]);
  const [catalogVisible, setCatalogVisible] = useState(false);

  // Новое открытие окна — новая покупка.
  useEffect(() => {
    if (visible) {
      setCart([]);
      setCatalogVisible(false);
    }
  }, [visible]);

  const remaining = getRemaining(budget, cart);
  const spent = getCartTotal(cart);

  const handleSelectItem = (item, quantity = 1) => {
    setCart((prev) => addToCart(prev, budget, item, quantity, maxRarity));
    setCatalogVisible(false);
  };

  const handleFinish = () => {
    onFinish(finishPurchase(cart, budget));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{tCharacterScreen('modals.startingPurchase.title')}</Text>
          <Text style={styles.hint}>{tCharacterScreen('modals.startingPurchase.hint')}</Text>

          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>{tCharacterScreen('modals.startingPurchase.remaining')}</Text>
            <Text style={[styles.budgetValue, remaining === 0 && styles.budgetValueEmpty]}>
              {remaining} / {budget}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.addButton, remaining <= 0 && styles.addButtonDisabled]}
            onPress={() => setCatalogVisible(true)}
          >
            <Text style={styles.addButtonText}>
              {tCharacterScreen('modals.startingPurchase.addItem')}
            </Text>
          </TouchableOpacity>

          {cart.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {tCharacterScreen('modals.startingPurchase.empty')}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.cartList}>
              {cart.map((line) => (
                <View key={line.key} style={styles.cartRow}>
                  <View style={styles.cartInfo}>
                    <Text style={styles.cartName}>{line.item.name}</Text>
                    <Text style={styles.cartMeta}>
                      {getItemPrice(line.item)} × {line.quantity} = {getItemPrice(line.item) * line.quantity}
                    </Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => setCart((prev) => changeQuantity(prev, budget, line.key, -1))}
                    >
                      <Text style={styles.qtyButtonText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{line.quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => setCart((prev) => changeQuantity(prev, budget, line.key, 1))}
                    >
                      <Text style={styles.qtyButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
              <Text style={styles.finishButtonText}>
                {tCharacterScreen('modals.startingPurchase.finish')} ({spent})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <AddItemModal
        visible={catalogVisible}
        onClose={() => setCatalogVisible(false)}
        onSelectItem={handleSelectItem}
        selectionMode="loot"
        maxRarity={maxRarity}
      />
    </Modal>
  );
};

export default StartingPurchaseModal;
