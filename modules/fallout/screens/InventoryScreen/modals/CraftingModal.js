// Модалка крафта (редизайн, патч 318, слово владельца): квадраты категорий
// (8, включая пустые данными) → список рецептов-спойлеров (недоступные серые,
// доступные белые) → кнопка «Создать» → (если можно больше одной — отдельное
// окно количества) → прогон пакета → отчёт. «Назад» слева сверху ведёт к
// квадратам; «Закрыть» внизу окна квадратов возвращает в инвентарь. За один
// заход можно скрафтить сколько угодно разных предметов.
// Вся механика и все строки — в модели (modules/fallout/crafting/windowModel.js);
// здесь только кнопки, списки и иконки квадратов.

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import styles from '../../../styles/CraftingModal.styles';
import {
  buildCraftTiles,
  buildCategoryModel,
  craftBatch,
  buildCraftReport,
  craftDict,
  craftFormat,
} from '../../../crafting/windowModel';

// Иконки квадратов (MaterialCommunityIcons); порядок задаёт модель (318).
const CATEGORY_ICONS = {
  food: 'food',
  drinks: 'cup',
  chems: 'flask',
  explosives: 'bomb',
  weapons: 'sword',
  armor: 'shield-outline',
  powerArmor: 'shield-half-full',
  ammo: 'ammo',
};

const RARITY_LABEL_KEYS = {
  common: 'rarityCommon',
  uncommon: 'rarityUncommon',
  rare: 'rarityRare',
};

export default function CraftingModal({ visible, onClose }) {
  const [view, setView] = useState('categories'); // 'categories' | 'category'
  const [category, setCategory] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [qtyTarget, setQtyTarget] = useState(null); // { row, max }
  const [qty, setQty] = useState(1);
  const [report, setReport] = useState(null);
  const [refresh, setRefresh] = useState(0); // пересборка модели после крафта

  const d = useMemo(() => (visible ? craftDict() : null), [visible]);
  const ui = d?.ui ?? {};
  const tiles = useMemo(() => (visible ? buildCraftTiles() : []), [visible, refresh]);
  const rows = useMemo(
    () => (visible && category ? buildCategoryModel(category) : []),
    [visible, category, refresh],
  );
  const categoryLabel = d?.categoryNames?.[category] ?? '';
  const detail = openId ? rows.find((row) => row.recipeId === openId) : null;

  const resetAll = () => {
    setView('categories');
    setCategory(null);
    setOpenId(null);
    setQtyTarget(null);
    setQty(1);
    setReport(null);
  };
  const close = () => { resetAll(); onClose?.(); };

  const openCategory = (tile) => {
    setCategory(tile.category);
    setView('category');
    setOpenId(null);
    setReport(null);
  };
  const back = () => {
    setView('categories');
    setCategory(null);
    setOpenId(null);
  };

  const create = (row, count) => {
    const run = craftBatch(row.recipeId, count);
    setQtyTarget(null);
    setOpenId(null);
    setReport(buildCraftReport(row.recipeId, run));
  };
  // Решение владельца (318): можно сделать больше одной — спросить количество
  // отдельным окном (по умолчанию 1); одна — создать сразу.
  const onPressCreate = (row) => {
    if (row.maxCraft > 1) {
      setQty(1);
      setQtyTarget({ row, max: row.maxCraft });
    } else {
      create(row, 1);
    }
  };
  const finishReport = () => {
    setReport(null);
    setRefresh((tick) => tick + 1); // материалы ушли — модель пересобирается
  };

  const headerTitle = report
    ? (report.title || ui.resultTitle || '')
    : view === 'category' ? categoryLabel : (ui.title ?? '');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            {view === 'category' && !report && (
              <TouchableOpacity onPress={back}>
                <Text style={styles.backText}>{ui.back ?? '←'}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
            <View style={styles.headerSpacer} />
            {view === 'categories' && !report && (
              <TouchableOpacity onPress={close}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {!report && view === 'categories' && (
            <View style={styles.body}>
              <View style={styles.tilesWrap}>
                {tiles.map((tile) => (
                  <TouchableOpacity
                    key={tile.category}
                    style={styles.tile}
                    onPress={() => openCategory(tile)}>
                    <MaterialCommunityIcons
                      name={CATEGORY_ICONS[tile.category] ?? 'circle-outline'}
                      style={styles.tileIcon}
                    />
                    <Text style={styles.tileLabel} numberOfLines={2}>{tile.label}</Text>
                    <Text style={[styles.tileCount, tile.available === 0 && styles.tileCountZero]}>
                      {tile.available}/{tile.recipes}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={close}>
                <Text style={styles.closeBtnText}>{ui.close ?? ''}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!report && view === 'category' && (
            <FlatList
              style={styles.list}
              data={rows}
              keyExtractor={(row) => row.recipeId}
              ListEmptyComponent={<Text style={styles.empty}>{ui.emptyCategory ?? '—'}</Text>}
              renderItem={({ item }) => {
                const expanded = item.recipeId === openId;
                return (
                  <View style={[styles.row, !item.canCraft && styles.rowDisabled]}>
                    <TouchableOpacity
                      style={styles.spoilerHead}
                      onPress={() => setOpenId(expanded ? null : item.recipeId)}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowName, item.canCraft && styles.rowNameReady]}>
                          {item.outputName}
                        </Text>
                        <Text style={styles.spoilerArrow}>{expanded ? '▾' : '▸'}</Text>
                      </View>
                      <Text style={styles.rowMeta}>{item.metaLine}</Text>
                      <Text style={item.canCraft ? styles.rowReady : styles.rowReason}>
                        {item.canCraft
                          ? `${ui.materialsTitle}: ${item.materialGroups
                            .map((g) => `${ui[RARITY_LABEL_KEYS[g.type]] ?? g.type} ${g.have}/${g.total}`)
                            .join(', ')}`
                          : (item.reason || '')}
                      </Text>
                    </TouchableOpacity>

                    {expanded && (
                      <View style={styles.spoilerBody}>
                        <Text style={styles.detailLabel}>{ui.materialsTitle}</Text>
                        {item.materialGroups.map((group) => (
                          <View key={group.type}>
                            <Text style={styles.rarityLine}>
                              {ui[RARITY_LABEL_KEYS[group.type]] ?? group.type} {group.have}/{group.total}
                            </Text>
                            {item.materials.filter((m) => m.rarity === group.type).map((m) => (
                              <View key={m.itemId} style={styles.materialLine}>
                                <Text style={styles.materialName}>{m.name}</Text>
                                <Text style={m.enough ? styles.materialOk : styles.materialBad}>{m.haveLine}</Text>
                              </View>
                            ))}
                          </View>
                        ))}
                        {item.materials.filter((m) => !m.rarity).map((m) => (
                          <View key={m.itemId} style={styles.materialLine}>
                            <Text style={styles.materialName}>{m.name}</Text>
                            <Text style={m.enough ? styles.materialOk : styles.materialBad}>{m.haveLine}</Text>
                          </View>
                        ))}
                        {item.canCraft && (
                          <TouchableOpacity
                            style={styles.bigCraft}
                            onPress={() => onPressCreate(item)}>
                            <Text style={styles.bigCraftText}>{ui.create ?? ''}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}

          {report && (
            <View style={styles.list}>
              <View style={styles.resultBox}>
                {report.lines.map((line, i) => (
                  <Text key={`r_${i}`} style={styles.resultLine}>{line}</Text>
                ))}
              </View>
              <TouchableOpacity style={styles.doneBtn} onPress={finishReport}>
                <Text style={styles.doneBtnText}>{ui.done ?? ''}</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>

        {/* Окно количества (318): «сколько штук создать?» с − и +, по умолчанию 1. */}
        <Modal visible={!!qtyTarget} transparent animationType="fade" onRequestClose={() => setQtyTarget(null)}>
          <View style={styles.qtyOverlay}>
            <View style={styles.qtyDialog}>
              <Text style={styles.qtyText}>
                {qtyTarget
                  ? craftFormat(ui.qtyPrompt ?? '', { max: qtyTarget.max, name: qtyTarget.row.outputName })
                  : ''}
              </Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQty((q) => Math.max(1, q - 1))}>
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{qty}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQty((q) => Math.min(qtyTarget?.max ?? 1, q + 1))}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.qtyActions}>
                <TouchableOpacity
                  style={styles.qtyCancel}
                  onPress={() => setQtyTarget(null)}>
                  <Text style={styles.qtyCancelText}>{ui.cancel ?? ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bigCraft, styles.qtyActionsBigCraft]}
                  onPress={() => qtyTarget && create(qtyTarget.row, qty)}>
                  <Text style={styles.bigCraftText}>{ui.create ?? ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
