// Модалка еды/питья выживания (docs/survival-system-design.md §2, §3, §7).
//
// kind='eat'  — предметы инвентаря itemType 'food';  подъём шкалы по §2.
//               На секции 5 еды модалка заблокирована («не можете больше
//               есть», суп тоже — его +1 воды не спасает).
// kind='drink'— предметы itemType 'drinks'; подъём по §3. На потолке воды
//               пить можно — шкала не двигается, эффекты напитка работают.
//
// Применение — штатная механика употребления (applyConsumableFull +
// отчёт buildConsumableResultReport): предмет уходит из инвентаря по общим
// правилам, а шкала выживания поднимается слушателем расходников модуля
// (survivalConsumableListener, патч 208) — тем же кодом, что и употребление
// через инвентарь. Превью подъёма в списке — чистые функции
// foodGain/drinkGain по данным.

import React, { useMemo } from 'react';
import { FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useCharacter } from '../../../../../components/CharacterContext';
import useCharacterStore from '../../../../../src/store/characterStore';
import { selectItemsByEquipped } from '../../../../../src/store/selectors';
import { getEquipmentCatalog } from '../../../../../i18n/equipmentCatalog';
import { useLocale, useModuleLocale } from '../../../../../i18n/locale';
import { resolveItem } from '../../../../../domain/resolveItem';
import {
  drinkGain,
  foodGain,
  SURVIVAL_RULES,
  type SurvivalState,
} from '../../../survival/survival';
import { useSurvivalState } from '../../../survival/hooks';
import { canConsumeOnSelf } from '../../../../../domain/itemfitRules';
import { rerollConsumableRadiationRoll } from '../../../../../domain/effects';
import { buildConsumableResultReport } from '../../../../../components/screens/InventoryScreen/logic/consumableResultReport';
import { showAlert as showCatalogAlert, showRawAlert } from '../../../../../components/alerts/alertService';
import { tWeaponsAndArmorScreen } from '../weaponsAndArmorScreenI18n';
import { survivalModalStyles as styles } from './survivalModalStyles';

type ConsumeKind = 'eat' | 'drink';

// Строка списка: сырой предмет стора (его потребляет applyConsumableFull)
// и локализованная запись каталога (имя + признаки для превью подъёма).
interface ConsumeEntry {
    storeItem: Record<string, unknown>;
    display: Record<string, unknown>;
}

interface SurvivalConsumeModalProps {
    visible: boolean;
    kind: ConsumeKind;
    onClose: () => void;
}

const t = (path: string): string => tWeaponsAndArmorScreen(path);

const SurvivalConsumeModal = ({ visible, kind, onClose }: SurvivalConsumeModalProps) => {
    useLocale();
    const moduleLocale = useModuleLocale();
    const {
        applyConsumableFull,
        previewConsumableRadiation,
        origin,
        trait,
    } = useCharacter();
    const survival = useSurvivalState();
    const storeItems = useCharacterStore((state) => state.items);
    const catalog = useMemo(() => getEquipmentCatalog(moduleLocale), [moduleLocale]);

    const targetType = kind === 'eat' ? 'food' : 'drinks';
    const isEat = kind === 'eat';

    const items = useMemo<ConsumeEntry[]>(
        () => selectItemsByEquipped({ items: storeItems }, false)
            .filter((item: { itemType?: string }) => item?.itemType === targetType)
            .map((item: Record<string, unknown>) => ({
                storeItem: item,
                display: resolveItem(item, catalog) as Record<string, unknown>,
            })),
        [storeItems, catalog, targetType],
    );

    const blocked = isEat && ((survival as SurvivalState | null)?.food ?? 0) >= SURVIVAL_RULES.max.food;

    const gainText = (item: Record<string, unknown>): string => {
        const gain = isEat ? foodGain(item) : drinkGain(item);
        const parts: string[] = [];
        if (gain.food > 0) parts.push(t('survival.gain.food').replace('{n}', String(gain.food)));
        if (gain.water > 0) parts.push(t('survival.gain.water').replace('{n}', String(gain.water)));
        return parts.join(', ');
    };

    const adjustStoreItemQuantity = (itemId: string, delta: number): void => {
        const { items: current } = useCharacterStore.getState();
        const item = current[itemId];
        if (!item) return;
        const newQty = (item.quantity || 1) + delta;
        if (newQty <= 0) {
            const updated = { ...current };
            delete updated[itemId];
            useCharacterStore.setState({ items: updated });
            return;
        }
        useCharacterStore.getState().updateItem(itemId, { quantity: newQty });
    };

    const handleConsume = async (entry: ConsumeEntry) => {
        const state = survival as SurvivalState | null;
        if (!state) return;
        // Канонический контракт (domain/resolveItem): в сторе предмет — ссылка,
        // данные (эффекты, признаки soup/state/purified, имя) — из каталога.
        // Применяем и превьюим каталожную запись, как инвентарь; из ссылки
        // берём только id для списания штуки.
        const catalogItem = entry.display;
        const itemName = String(catalogItem?.name || '');
        const storeItemId = String(entry.storeItem?.id || '');

        const finish = (radiationRequestedAmount: number | null | undefined) => {
            const applyResult = applyConsumableFull(catalogItem, { radiationRequestedAmount });
            // Результат слушателя выживания (патч 208): шкала уже обновлена
            // внутри applyConsumableFull тем же кодом, что и для инвентаря.
            const extensionResults = (
                applyResult as {
                    extensionResults?: Array<{ id?: string; ok?: boolean; reason?: string; gained?: { food: number; water: number } }>;
                }
            ).extensionResults ?? [];
            const survivalResult = extensionResults.find((result) => result.id === 'survival');
            if (survivalResult && survivalResult.ok === false) {
                // Потолок шкалы: модалка блокирует строки, страховка от гонки состояний.
                showRawAlert({ title: t('survival.eat.blocked'), buttons: undefined });
                return;
            }
            adjustStoreItemQuantity(storeItemId, -1);
            const gained = survivalResult?.gained ?? { food: 0, water: 0 };
            const report = buildConsumableResultReport({ itemName, ...applyResult });
            const gainLines: string[] = [];
            if (gained.food > 0) {
                gainLines.push(t('survival.gain.food').replace('{n}', String(gained.food)));
            }
            if (gained.water > 0) {
                gainLines.push(t('survival.gain.water').replace('{n}', String(gained.water)));
            }
            const message = [
                report.message,
                gainLines.length > 0 ? gainLines.join('\n') : null,
            ].filter(Boolean).join('\n\n');
            showRawAlert({ title: report.title, message, buttons: undefined });
        };

        if (!canConsumeOnSelf(catalogItem, { origin, trait })) {
            showRawAlert({ title: t('survival.consumeNotAllowed'), buttons: undefined });
            return;
        }

        const preview = previewConsumableRadiation(catalogItem);
        if (!preview.canOfferReroll) {
            finish(preview.requestedAmount);
            return;
        }
        // Штатный выбор из каталога (как в инвентаре): 'reroll' — перебросить,
        // 'keep'/закрытие — оставить.
        const choice = await showCatalogAlert('leadBellyReroll', {
            radiationAmount: preview.receivedRadiationDamage,
        });
        if (choice === 'reroll') {
            finish(rerollConsumableRadiationRoll(catalogItem, preview.rolls).requestedAmount);
        } else {
            finish(preview.requestedAmount);
        }
    };

    const renderRow = ({ item }: { item: ConsumeEntry }) => {
        const name = String(item.display?.name || '');
        const qty = Number(item.storeItem?.quantity) || 1;
        return (
            <TouchableOpacity
                style={[styles.row, blocked && styles.rowDisabled]}
                onPress={() => handleConsume(item)}
                disabled={blocked}
            >
                <Text style={styles.rowName}>{name}</Text>
                <View style={styles.rowMeta}>
                    <Text style={styles.rowGain}>{gainText(item.display)}</Text>
                    {qty > 1 ? <Text style={styles.rowQty}>×{qty}</Text> : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.content}>
                    <Text style={styles.title}>{t(isEat ? 'survival.eat.title' : 'survival.drink.title')}</Text>
                    {isEat && blocked ? (
                        <View style={styles.blockBanner}>
                            <Text style={styles.blockBannerText}>{t('survival.eat.blocked')}</Text>
                        </View>
                    ) : null}
                    {items.length === 0 ? (
                        <Text style={styles.emptyText}>{t(isEat ? 'survival.eat.empty' : 'survival.drink.empty')}</Text>
                    ) : (
                        <FlatList
                            data={items}
                            keyExtractor={(entry) => String(entry.storeItem?.id || '')}
                            renderItem={renderRow}
                            style={styles.list}
                        />
                    )}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                            <Text style={styles.buttonText}>{t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default SurvivalConsumeModal;
