// Модалка крафта (редизайн, патч 318, слово владельца): квадраты категорий
// (8, включая пустые данными) → список рецептов-спойлеров (недоступные серые,
// доступные белые) → кнопка «Создать» → (если можно больше одной — отдельное
// окно количества) → прогон пакета → отчёт. «Назад» слева сверху ведёт к
// квадратам; «Закрыть» внизу окна квадратов возвращает в инвентарь. За один
// заход можно скрафтить сколько угодно разных предметов.
// Вся механика и все строки — в модели (modules/fallout/crafting/windowModel.js);
// здесь только кнопки, списки и иконки квадратов.

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, SafeAreaView, ScrollView, ImageBackground } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import styles from '../../../styles/CraftingModal.styles';
// 329 (слово владельца): фон окна категорий — фоновое изображение окон
// сеттинга (как на экранах Снаряжения/Персонажа, opacity 0.3).
const BG_IMAGE = require('../../../../../assets/bg.png');
import {
  buildCraftTiles,
  buildCategoryModel,
  craftBatch,
  buildCraftReport,
  craftDict,
  craftFormat,
} from '../../../crafting/windowModel';
import { settleCraftTime } from '../../../crafting/operations';
import { getActionPoints } from '../../../../../domain/actionPoints';
// 357: отчёт о крафте — общий компонент окна крафта и модалки установки модов.
import CraftReportView from '../../../crafting/CraftReportView';

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

// Строки по perRow квадратов (патч 322): 8 категорий = 3+3+2.
const chunkIntoRows = (items, perRow) => {
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
};

export default function CraftingModal({ visible, onClose }) {
  const [view, setView] = useState('categories'); // 'categories' | 'category'
  const [category, setCategory] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [qtyTarget, setQtyTarget] = useState(null); // { row, max }
  const [qty, setQty] = useState(1);
  const [report, setReport] = useState(null);
  const [askZeroTarget, setAskZeroTarget] = useState(null); // 363: inline-вопрос про бросок
  const [settledTime, setSettledTime] = useState(null); // {minutes, spendActionPoints} (323)
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

  // 356: выбор «сложность снята навыком» для текущего создания (спросили —
  // применили ко всей пачке; ответ движка честный: бросок или автоуспех).
  const create = (row, count, zeroDifficulty = 'auto') => {
    // 323: время откладывается — окно спросит про 2 ОД после успеха.
    const run = craftBatch(row.recipeId, count, { deferTime: true, zeroDifficulty });
    const rep = buildCraftReport(row.recipeId, run);
    let settled = null;
    // 324: вопрос про 2 ОД — только если в пуле хватает (иначе полное время).
    if (rep.pendingTime && (!rep.pendingTime.hasSuccess || getActionPoints() < 2)) {
      settled = settleCraftTime(row.recipeId, run, { spendActionPoints: false });
    }
    setQtyTarget(null);
    setOpenId(null);
    setSettledTime(settled);
    setReport({ ...rep, run }); // run — для решения про 2 ОД (323)
  };
  // Решение владельца (318): можно сделать больше одной — спросить количество
  // отдельным окном (по умолчанию 1); одна — создать сразу.
  const onPressCreate = (row) => {
    // 356 (механизм проверок): сложность 0 — спросить про бросок кубиков.
    // 363: системный Alert на Web — тихая заглушка, вопрос задаёт inline-диалог
    // (как окно количества): «да» — бросаем, «нет» — автоуспех.
    if (row.zeroDifficulty) {
      setAskZeroTarget({ row });
      return;
    }
    proceedCreate(row, 'auto');
  };
  const proceedCreate = (row, zeroDifficulty) => {
    if (row.maxCraft > 1) {
      setQty(1);
      setQtyTarget({ row, max: row.maxCraft, zeroDifficulty });
    } else {
      create(row, 1, zeroDifficulty);
    }
  };
  const finishReport = () => {
    setReport(null);
    setSettledTime(null);
    setRefresh((tick) => tick + 1); // материалы ушли — модель пересобирается
  };

  // Решение владельца (323): ОД — групповой ресурс будущего мастера; сейчас
  // выбор да/нет: «да» — время успеха вдвое, «нет» — полное по правилам.
  const settleTimeDecision = (spendActionPoints) => {
    const settled = settleCraftTime(report.recipeId, report.run, { spendActionPoints });
    setSettledTime(settled);
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
            <ImageBackground source={BG_IMAGE} style={styles.bg} imageStyle={styles.bgImage}>
            <ScrollView style={styles.body} contentContainerStyle={styles.tilesContent}>
              {/* Патч 322: строки по 3 квадрата, прокрутка (владелец: окно на ПК
                  не прокручивалось). Выравнивание остатка строки: одинокая — по
                  центру; две — от левого края; полная — как есть. */}
              {chunkIntoRows(tiles, 3).map((rowTiles, rowIdx) => (
                <View
                  key={`tileRow_${rowIdx}`}
                  style={[styles.tileRow, rowTiles.length === 1 && styles.tileRowCenter, rowTiles.length === 2 && styles.tileRowLeft]}>
                  {rowTiles.map((tile) => (
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
              ))}
              <TouchableOpacity style={styles.closeBtn} onPress={close}>
                <Text style={styles.closeBtnText}>{ui.close ?? ''}</Text>
              </TouchableOpacity>
            </ScrollView>
            </ImageBackground>
          )}

          {!report && view === 'category' && (
            <FlatList
              style={styles.list}
              data={rows}
              keyExtractor={(row) => row.recipeId}
              ListEmptyComponent={<Text style={styles.empty}>{ui.emptyCategory ?? '—'}</Text>}
              renderItem={({ item }) => {
                const expanded = item.recipeId === openId;
                // 329 (слово владельца): доступные — светлые, недоступные по
                // перку/рангу — серые; доступность материалов — в скобках
                // рядом с названием; сложность/навык/время — внутри спойлера.
                const perkLocked = item.status === 'missing-perk';
                const note = item.canCraft
                  ? (ui.ready ?? '')
                  : perkLocked ? (ui.perkShort ?? '') : (ui.shortMaterials ?? '');
                return (
                  <View style={[styles.row, perkLocked && styles.rowDisabled]}>
                    <TouchableOpacity
                      style={styles.spoilerHead}
                      onPress={() => setOpenId(expanded ? null : item.recipeId)}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowName, perkLocked && styles.rowNameLocked]} numberOfLines={2}>
                          {item.outputName}
                        </Text>
                        {/* 326: никаких сводок по видам — счётчики штук на строках материалов */}
                        <Text style={[
                          styles.rowNote,
                          item.canCraft ? styles.rowNoteOk : perkLocked ? styles.rowNoteLocked : styles.rowNoteBad,
                        ]}>
                          ({note})
                        </Text>
                        <Text style={styles.spoilerArrow}>{expanded ? '▾' : '▸'}</Text>
                      </View>
                    </TouchableOpacity>

                    {expanded && (
                      <View style={styles.spoilerBody}>
                        <Text style={styles.rowMeta}>{item.metaLine}</Text>
                        {perkLocked && <Text style={styles.rowReason}>{item.reason}</Text>}
                        {/* 334 (слово владельца): заголовки по материалам излишни —
                            плоский список: тип материала и количество. */}
                        {item.materials.map((m) => (
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
            <CraftReportView
              report={report}
              settledTime={settledTime}
              onSettleTime={settleTimeDecision}
              onDone={finishReport}
            />
          )}
        </SafeAreaView>

        {/* 363: вопрос про бросок при снятой сложности — inline-диалог
            (системный Alert на Web молчит, кнопка выглядела мёртвой). */}
        <Modal visible={!!askZeroTarget} transparent animationType="fade" onRequestClose={() => setAskZeroTarget(null)}>
          <View style={styles.qtyOverlay}>
            <View style={styles.qtyDialog}>
              <Text style={styles.qtyText}>{ui.askZeroTitle ?? ''}</Text>
              <Text style={styles.qtyText}>{ui.askZeroText ?? ''}</Text>
              <View style={styles.qtyActions}>
                <TouchableOpacity
                  style={styles.qtyCancel}
                  onPress={() => { const t = askZeroTarget; setAskZeroTarget(null); if (t) proceedCreate(t.row, 'auto'); }}>
                  <Text style={styles.qtyCancelText}>{ui.askZeroAuto ?? ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bigCraft, styles.qtyActionsBigCraft]}
                  onPress={() => { const t = askZeroTarget; setAskZeroTarget(null); if (t) proceedCreate(t.row, 'roll'); }}>
                  <Text style={styles.bigCraftText}>{ui.askZeroRoll ?? ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
                  onPress={() => qtyTarget && create(qtyTarget.row, qty, qtyTarget.zeroDifficulty)}>
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
