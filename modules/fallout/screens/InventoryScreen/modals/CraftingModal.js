// Модалка крафта (патч 265): вкладки верстаков → список рецептов → окно
// рецепта (материалы, количество) → прогон пакета → отчёт по формату владельца.
// Вся механика и все строки — в модели (modules/fallout/crafting/windowModel.js);
// здесь только кнопки и списки. Окно не объясняет замены пачек: рецепт знает,
// что просит, — остальное решает сумка (решение владельца 2026-09-17).

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, SafeAreaView } from 'react-native';
import styles from '../../../styles/CraftingModal.styles';
import { buildCraftModel, craftBatch, buildCraftReport } from '../../../crafting/windowModel';

export default function CraftingModal({ visible, onClose }) {
  const [benchIdx, setBenchIdx] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [qty, setQty] = useState(1);
  const [report, setReport] = useState(null);

  const model = useMemo(() => (visible ? buildCraftModel() : []), [visible]);
  const allRows = useMemo(
    () => new Map(model.flatMap((g) => g.rows).map((r) => [r.recipeId, r])),
    [model],
  );
  const bench = model[benchIdx] ?? model[0];
  const detail = openId ? allRows.get(openId) : null;
  const labels = detail?.labels ?? model[0]?.rows[0]?.labels ?? {};

  const reset = () => {
    setOpenId(null);
    setQty(1);
    setReport(null);
  };
  const close = () => { reset(); onClose?.(); };

  const openRecipe = (row) => {
    setOpenId(row.recipeId);
    setQty(Math.max(1, Math.min(row.maxCraft || 1, 1)));
    setReport(null);
  };

  const runCraft = (row) => {
    const run = craftBatch(row.recipeId, Math.max(1, Math.min(qty, row.maxCraft || 1)));
    setReport(buildCraftReport(row.recipeId, run));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            {!!openId && (
              <TouchableOpacity onPress={reset}><Text style={styles.backText}>←</Text></TouchableOpacity>
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {detail ? detail.outputName : labels.title ?? ''}
            </Text>
            <View style={styles.headerSpacer} />
            <TouchableOpacity onPress={close}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
          </View>

          {!openId && (
            <>
              <View style={styles.tabs}>
                {model.map((g, i) => (
                  <TouchableOpacity
                    key={g.category}
                    style={[styles.tab, i === benchIdx && styles.tabActive]}
                    onPress={() => setBenchIdx(i)}>
                    <Text style={[styles.tabText, i === benchIdx && styles.tabTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FlatList
                style={styles.list}
                data={bench?.rows ?? []}
                keyExtractor={(row) => row.recipeId}
                ListEmptyComponent={<Text style={styles.empty}>—</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.row, !item.canCraft && styles.rowDisabled]}
                    onPress={() => openRecipe(item)}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowName}>{item.outputName}</Text>
                      {item.canCraft && (
                        <View style={styles.craftBtn}>
                          <Text style={styles.craftBtnText}>{item.maxCraft > 1 ? `×${qty} ${item.timeLabel}` : item.timeLabel}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowMeta}>{item.metaLine}</Text>
                    {item.reason
                      ? <Text style={styles.rowReason}>{item.reason}</Text>
                      : <Text style={styles.rowReady}>{`${item.materials.filter((m) => m.enough).length}/${item.materials.length}`}</Text>}
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {detail && !report && (
            <View style={styles.list}>
              <Text style={styles.detailLabel}>{detail.labels.materialsTitle}</Text>
              {detail.materials.map((m) => (
                <View key={m.itemId} style={styles.materialLine}>
                  <Text style={styles.materialName}>{m.name}</Text>
                  <Text style={m.enough ? styles.materialOk : styles.materialBad}>{m.haveLine}</Text>
                </View>
              ))}
              {detail.canCraft && detail.maxCraft > 1 && (
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{qty}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty((q) => Math.min(detail.maxCraft, q + 1))}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
              {detail.reason && <Text style={styles.rowReason}>{detail.reason}</Text>}
              <TouchableOpacity
                style={[styles.bigCraft, !detail.canCraft && styles.bigCraftDisabled]}
                disabled={!detail.canCraft}
                onPress={() => runCraft(detail)}>
                <Text style={styles.bigCraftText}>
                  {detail.canCraft
                    ? (qty > 1 ? `${detail.labels.craft} ×${qty}` : detail.labels.craft)
                    : detail.labels.notAvailable}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {report && (
            <View style={styles.list}>
              <View style={styles.resultBox}>
                {report.lines.map((line, i) => (
                  <Text key={`r_${i}`} style={styles.resultLine}>{line}</Text>
                ))}
              </View>
              <TouchableOpacity style={styles.doneBtn} onPress={reset}>
                <Text style={styles.doneBtnText}>{labels.done}</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
