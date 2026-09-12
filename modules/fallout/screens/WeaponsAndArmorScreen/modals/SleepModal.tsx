// Модалка сна выживания (docs/survival-system-design.md §4, §5, §7).
//
// Место (кровать/пустошь) и часы 1–24. Перед подтверждением — прогноз
// чистым доменом forecastSleep (шаг шкал, усталость; максимум ОЗ от
// усталости не зависит — патч 232). Подтверждение
// — операция контекста sleepSurvival: применяет rest(), двигает таймеры
// эффектов на N × 12 сцен (мост контуров, §5) и в пустоши проверяет болезнь
// по имеющейся механике (событие sleepOnGround).

import React, { useMemo, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useCharacter } from '../../../../../components/CharacterContext';
import useCharacterStore from '../../../../../src/store/characterStore';
import { calculateMaxHealth } from '../../../../../domain/characterCreation';
import {
    forecastSleep,
    SURVIVAL_RULES,
    type SleepPlace,
    type SurvivalState,
    type RestResult,
} from '../../../survival/survival';
import { useSurvivalState, useSurvivalActions } from '../../../survival/hooks';
import { diseaseRiskReportLines } from '../../../../../components/screens/InventoryScreen/logic/consumableResultReport';
import { showRawAlert } from '../../../../../components/alerts/alertService';
import { useLocale, useModuleLocale } from '../../../../../i18n/locale';
import { tWeaponsAndArmorScreen } from '../weaponsAndArmorScreenI18n';
import { survivalModalStyles as styles } from './survivalModalStyles';

interface SleepModalProps {
    visible: boolean;
    onClose: () => void;
}

const t = (path: string): string => tWeaponsAndArmorScreen(path);

const stateName = (section: number): string => t(`survival.sleep.${section}`);

interface ForecastLine {
    key: string;
    text: string;
    tone: 'neutral' | 'positive' | 'negative';
}

// Максимум ОЗ после сна: базовый + бонус «прекрасно отдохнувший».
// Патч 232: усталость больше не снижает максимум (потеря текущих ОЗ
// за игровой час — SurvivalClock). Не ниже нуля.
const maxHpAfterSleep = (state: SurvivalState, baseMaxHealth: number): number =>
    Math.max(0, baseMaxHealth + state.hpBonus);

const buildForecastLines = (forecast: RestResult, baseMaxHealth: number): ForecastLine[] => {
    const lines: ForecastLine[] = [
        {
            key: 'state',
            text: t('survival.sleep.forecastState').replace('{state}', stateName(forecast.state.sleep)),
            tone: 'neutral',
        },
        {
            key: 'maxHp',
            text: t('survival.sleep.forecastMaxHp').replace('{n}', String(maxHpAfterSleep(forecast.state, baseMaxHealth))),
            tone: 'neutral',
        },
    ];
    const cleared = forecast.events.find((e) => e.type === 'fatigueSleepCleared');
    if (typeof cleared?.removed === 'number' && cleared.removed > 0) {
        lines.push({
            key: 'fatigueCleared',
            text: t('survival.sleep.forecastFatigueCleared').replace('{n}', String(cleared.removed)),
            tone: 'positive',
        });
    }
    const stepDowns = (ladder: string): number => forecast.events
        .filter((e) => e.type === 'step' && e.ladder === ladder).length;
    const foodDown = stepDowns('food');
    if (foodDown > 0) {
        lines.push({
            key: 'foodDown',
            text: t('survival.sleep.forecastFoodDown').replace('{n}', String(foodDown)),
            tone: 'negative',
        });
    }
    const waterDown = stepDowns('water');
    if (waterDown > 0) {
        lines.push({
            key: 'waterDown',
            text: t('survival.sleep.forecastWaterDown').replace('{n}', String(waterDown)),
            tone: 'negative',
        });
    }
    if (forecast.state.hpBonus > 0) {
        lines.push({ key: 'hpBonus', text: t('survival.sleep.forecastHpBonus'), tone: 'positive' });
    }
    return lines;
};

const SleepModal = ({ visible, onClose }: SleepModalProps) => {
    useLocale();
    useModuleLocale();
    const survival = useSurvivalState();
    const { sleepSurvival } = useSurvivalActions();
    const { attributes } = useCharacter();
    // Шаг 7: level/attributesSaved — стор напрямую.
    const level = useCharacterStore((state) => state.level);
    const attributesSaved = useCharacterStore((state) => state.attributesSaved);
    const [place, setPlace] = useState<SleepPlace>('bed');
    const [hours, setHours] = useState(8);

    // Базовый максимум ОЗ — формула сеттинга от атрибутов и уровня; строка
    // максимума показывается, когда персонаж собран (как счётчик ОЗ).
    const baseMaxHealth = attributesSaved ? calculateMaxHealth(attributes, level) : 0;

    const forecast = useMemo<RestResult | null>(() => {
        const state = survival as SurvivalState | null;
        if (!state) return null;
        return forecastSleep(state, { place, hours });
    }, [survival, place, hours]);

    const lines = forecast ? buildForecastLines(forecast, baseMaxHealth) : [];

    const handleConfirm = () => {
        const apply = sleepSurvival({ place, hours }) as {
            ok: boolean;
            reason?: string;
            result?: RestResult;
            bedRestCompleted?: number;
            bedRestHealed?: string[];
            diseaseRiskResult?: unknown;
        };
        if (!apply.ok || !apply.result) {
            onClose();
            return;
        }
        const { result, diseaseRiskResult } = apply;
        const reportLines: string[] = [
            t('survival.sleep.reportState').replace('{state}', stateName(result.state.sleep)),
        ];
        if (attributesSaved) {
            reportLines.push(
                t('survival.sleep.reportMaxHp').replace('{n}', String(maxHpAfterSleep(result.state, baseMaxHealth))),
            );
        }
        if (result.state.hpBonus > 0) {
            reportLines.push(t('survival.sleep.reportHpBonus'));
        }
        // Отдых в постели (патч 215): накопленные порции сна в кровати
        // снимают единицы болезней — показываем число излеченных.
        if ((apply.bedRestHealed as string[] | undefined)?.length) {
            reportLines.push(
                t('survival.sleep.reportBedRestHealed').replace('{n}', String((apply.bedRestHealed as string[]).length)),
            );
        }
        const cleared = (result.events as Array<{ type?: string; removed?: number }>)
            .find((e) => e.type === 'fatigueSleepCleared');
        if (typeof cleared?.removed === 'number' && cleared.removed > 0) {
            reportLines.push(t('survival.sleep.reportFatigueCleared').replace('{n}', String(cleared.removed)));
        }
        const diseaseLines = diseaseRiskReportLines(diseaseRiskResult);
        reportLines.push(...diseaseLines.positive, ...diseaseLines.negative);
        showRawAlert({
            title: t('survival.sleep.reportTitle').replace('{hours}', String(hours)),
            message: reportLines.join('\n'),
            buttons: undefined,
        });
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.content}>
                    <Text style={styles.title}>{t('survival.sleep.title')}</Text>
                    <View style={styles.placeRow}>
                        <TouchableOpacity
                            style={[styles.placeButton, place === 'bed' && styles.placeButtonActive]}
                            onPress={() => setPlace('bed')}
                        >
                            <Text style={styles.placeButtonText}>{t('survival.sleep.placeBed')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.placeButton, place === 'wasteland' && styles.placeButtonActive]}
                            onPress={() => setPlace('wasteland')}
                        >
                            <Text style={styles.placeButtonText}>{t('survival.sleep.placeWasteland')}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.hoursRow}>
                        <TouchableOpacity
                            style={styles.hoursButton}
                            onPress={() => setHours((h) => Math.max(1, h - 1))}
                        >
                            <Text style={styles.hoursButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.hoursValue}>{t('survival.sleep.hours').replace('{n}', String(hours))}</Text>
                        <TouchableOpacity
                            style={styles.hoursButton}
                            onPress={() => setHours((h) => Math.min(SURVIVAL_RULES.maxSleepHours, h + 1))}
                        >
                            <Text style={styles.hoursButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>
                    {place === 'wasteland' ? (
                        <Text style={styles.hint}>{t('survival.sleep.wastelandNote')}</Text>
                    ) : null}
                    {forecast ? (
                        <View style={styles.forecastBox}>
                            <Text style={styles.forecastTitle}>{t('survival.sleep.forecastTitle')}</Text>
                            {lines.map((line) => (
                                <Text
                                    key={line.key}
                                    style={
                                        line.tone === 'negative'
                                            ? styles.forecastLineNegative
                                            : line.tone === 'positive'
                                                ? styles.forecastLinePositive
                                                : styles.forecastLine
                                    }
                                >
                                    {line.text}
                                </Text>
                            ))}
                        </View>
                    ) : null}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={handleConfirm}>
                            <Text style={styles.buttonText}>{t('survival.sleep.confirm')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                            <Text style={styles.buttonText}>{t('survival.sleep.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default SleepModal;
