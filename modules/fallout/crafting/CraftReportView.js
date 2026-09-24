// Общий отчёт о крафте (патч 357, слово владельца: «не хватает отчёта о
// крафте» в модалке установки модов). Один и тот же вид в окне крафта и в
// модалке установки модов: строка арифметики проверки, исход с кубиками
// (или автоуспех), что получено/потрачено/сгорело, время и вопрос про 2 ОД
// (323/324). Данные считает buildCraftReport (windowModel) — здесь только
// отрисовка; строки берутся из словаря крафта (ru/en).
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { craftDict, craftFormat, formatCraftMinutes } from './windowModel';
import { getActionPoints } from '../../../domain/actionPoints';
import s from '../styles/CraftReportView.styles';

// report — результат buildCraftReport (плюс run для решения про 2 ОД);
// settledTime — итог applyActivityMinutes после решения про ОД;
// onSettleTime(spendActionPoints) — «да/нет» на вопрос про 2 ОД;
// onDone — «Готово», закрыть отчёт.
export default function CraftReportView({ report, settledTime, onSettleTime, onDone }) {
  const ui = craftDict().ui;
  if (!report) return null;
  return (
    <View style={s.list}>
      <View style={s.resultBox}>
        {report.lines.map((line, i) => (
          <Text key={`r_${i}`} style={s.resultLine}>{line}</Text>
        ))}
        {/* 323: время — после решения про ОД (успех можно сократить вдвое). */}
        {settledTime && (
          <Text style={s.resultLine}>
            {`${craftFormat(ui.timeSpent ?? '', { time: formatCraftMinutes(settledTime.minutes) })}`
              + (settledTime.spendActionPoints ? `. ${ui.apHalvedNote ?? ''}` : '')}
          </Text>
        )}
      </View>

      {report.pendingTime && settledTime === null && (
        <View style={s.apBox}>
          <Text style={s.apQuestion}>
            {craftFormat(ui.apQuestion ?? '', { pool: getActionPoints() })}
          </Text>
          <View style={s.qtyActions}>
            <TouchableOpacity
              style={[s.bigCraft, s.qtyActionsBigCraft]}
              onPress={() => onSettleTime(true)}>
              <Text style={s.bigCraftText}>{ui.apYes ?? ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.qtyCancel}
              onPress={() => onSettleTime(false)}>
              <Text style={s.qtyCancelText}>{ui.apNo ?? ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={s.doneBtn} onPress={onDone}>
        <Text style={s.doneBtnText}>{ui.done ?? ''}</Text>
      </TouchableOpacity>
    </View>
  );
}
