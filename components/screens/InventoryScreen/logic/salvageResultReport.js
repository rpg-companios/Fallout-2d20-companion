// Тексты результата разбора для строки инвентаря (патч 264).
// Чистый преобразователь контракта salvageItem в заголовок/сообщение алерта:
// никаких бросков и мутаций здесь нет. Минуты считаются как в контракте:
// база × множитель осложнения (262), «не начался» — ноль.

import { tInventory, formatInventoryText } from './inventoryI18n';
import { getEquipmentCatalog } from '../../../../i18n/equipmentCatalog';
import { getCurrentModuleLocale } from '../../../../i18n/locale';

const materialName = (itemId) => {
  const catalog = getEquipmentCatalog(getCurrentModuleLocale());
  const hit = (catalog.materials ?? []).find((m) => m.id === itemId)
    ?? (catalog.junk ?? []).find((m) => m.id === itemId);
  return hit?.name ?? itemId;
};

const minutesOf = (result) => (result.time ? result.time.minutes * result.time.durationMultiplier : 0);

const timeLine = (result) => {
  const minutes = minutesOf(result);
  if (minutes <= 0) return '';
  const base = formatInventoryText(tInventory('screen.salvage.timeLine'), { minutes });
  return result.time?.durationMultiplier > 1 ? `${base} ${tInventory('screen.salvage.complicationNote')}` : base;
};

export const buildSalvageReport = (result) => {
  if (result.done) {
    const items = (result.granted ?? []).map((g) => `${materialName(g.itemId)} ×${g.quantity}`).join(', ');
    const time = timeLine(result);
    if (!items) {
      return {
        title: tInventory('screen.salvage.emptyTitle'),
        message: time ? [tInventory('screen.salvage.empty'), time].join('\n') : tInventory('screen.salvage.empty'),
      };
    }
    return {
      title: tInventory('screen.salvage.doneTitle'),
      message: [formatInventoryText(tInventory('screen.salvage.done'), { items }), time].filter(Boolean).join('\n'),
    };
  }
  if (result.stage === 'gate' && result.reason === 'material') {
    // Не достигается из UI (кнопки материала нет) — честный текст на случай
    // прямого вызова операции (ГМ-инструменты, отладка).
    return { title: tInventory('screen.salvage.notStartedTitle'), message: tInventory('screen.salvage.material') };
  }
  if (result.stage === 'gate' && result.reason === 'no-materials') {
    return { title: tInventory('screen.salvage.doneTitle'), message: tInventory('screen.salvage.noMaterials') };
  }
  if (result.stage === 'check') {
    return {
      title: tInventory('screen.salvage.failTitle'),
      message: [tInventory('screen.salvage.fail'), timeLine(result)].filter(Boolean).join('\n'),
    };
  }
  return {
    title: tInventory('screen.salvage.notStartedTitle'),
    message: formatInventoryText(tInventory('screen.salvage.notStarted'), { reason: result.reason ?? 'unknown' }),
  };
};
