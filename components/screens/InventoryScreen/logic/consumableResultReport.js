import { formatInventoryText, tInventory } from './inventoryI18n';

const bulletList = (messages) => messages.map((message) => `• ${message}`).join('\n');

const conditionRemovalMessage = (conditionId, removed) => {
  const key = `screen.alerts.conditionRemoval.${conditionId}.${removed ? 'removed' : 'notPresent'}`;
  const message = tInventory(key);
  if (message === key) {
    throw new Error(`[consumableResultReport] Нет текста результата для состояния "${conditionId}"`);
  }
  return message;
};

const diseaseFailureMessage = (diseaseRiskResult) => {
  const { disease, infectionStatus } = diseaseRiskResult;
  if (!disease?.name) {
    throw new Error('[consumableResultReport] Проваленная проверка заражения не содержит болезнь');
  }

  const keyByStatus = {
    infected: 'diseaseInfectedSummary',
    duplicate: 'diseaseDuplicateSummary',
    immune: 'diseaseImmuneSummary',
  };
  const key = keyByStatus[infectionStatus];
  if (!key) {
    throw new Error(`[consumableResultReport] Неизвестный итог заражения: ${infectionStatus}`);
  }
  return formatInventoryText(tInventory(`screen.alerts.${key}`), { diseaseName: disease.name });
};

/**
 * Собирает один итог применения расходника. Механические результаты остаются
 * структурированными: UI не распознаёт локализованный текст и не парсит броски.
 */
export const buildConsumableResultReport = ({
  itemName,
  timedResult,
  addictionResult,
  diseaseRiskResult,
  conditionsRemoved = [],
  conditionRemovalsRequested = [],
  healAmount = 0,
  radiationAmount = null,
}) => {
  const positive = [];
  const negative = [];

  if (healAmount > 0) {
    positive.push(formatInventoryText(tInventory('screen.alerts.healMessage'), { healAmount }));
  }

  if (radiationAmount > 0) {
    negative.push(formatInventoryText(tInventory('screen.alerts.radiationIncreaseMessage'), {
      radiationAmount,
    }));
  } else if (radiationAmount < 0) {
    positive.push(formatInventoryText(tInventory('screen.alerts.radiationDecreaseMessage'), {
      radiationAmount: Math.abs(radiationAmount),
    }));
  }

  for (const event of timedResult?.notificationEvents || []) {
    if (event?.kind === 'positive') positive.push(event.message);
    else if (event?.kind === 'negative') negative.push(event.message);
    else throw new Error(`[consumableResultReport] Неизвестный тип события: ${event?.kind}`);
  }

  const removedSet = new Set(conditionsRemoved);
  for (const conditionId of new Set(conditionRemovalsRequested)) {
    positive.push(conditionRemovalMessage(conditionId, removedSet.has(conditionId)));
  }

  if (diseaseRiskResult?.status === 'checked') {
    if (diseaseRiskResult.check?.passed) {
      positive.push(tInventory('screen.alerts.diseaseCheckPassedSummary'));
    } else {
      // По решению владельца провал остаётся отрицательным итогом даже тогда,
      // когда иммунитет или уже активная болезнь не добавили нового состояния.
      negative.push(diseaseFailureMessage(diseaseRiskResult));
    }
  }

  if (addictionResult) {
    if (addictionResult.addicted) {
      negative.push(tInventory('screen.alerts.addictionGainedMessage'));
    } else {
      positive.push(tInventory('screen.alerts.addictionAvoidedMessage'));
    }
  }

  // Выбор цели уже подтверждает применение. Повторяем это только когда
  // расходник не дал ни одного отдельного фактического результата.
  if (positive.length === 0 && negative.length === 0) {
    positive.push(formatInventoryText(tInventory('screen.alerts.appliedMessage'), { itemName }));
  }

  const sections = [];
  if (positive.length > 0) {
    sections.push(`${tInventory('screen.alerts.positiveResultSection')}\n${bulletList(positive)}`);
  }
  if (negative.length > 0) {
    sections.push(`${tInventory('screen.alerts.negativeResultSection')}\n${bulletList(negative)}`);
  }

  return {
    title: tInventory('screen.alerts.consumableResultTitle'),
    message: sections.join('\n\n'),
    positive,
    negative,
  };
};
