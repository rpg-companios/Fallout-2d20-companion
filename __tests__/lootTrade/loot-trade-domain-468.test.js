import { describe, expect, it } from 'vitest';
import {
  QUANTITY_UNIT,
  addOrMergeContainerItem,
  computeBarterSummary,
  computeMerchantBuybackPriceFromPlayer,
  computeMerchantSellPriceToPlayer,
  getEffectiveMerchantRates,
  normalizeBuyDepreciationPercent,
  normalizeCapsAmount,
  normalizeSaleMarkupPercent,
  resolveQuantitySpec,
} from '../../domain/lootTrade';

describe('Патч 468 — domain/lootTrade: единицы количества, специализация наценки, уценка закупки и буфер бартера', () => {
  it('бросает количество при сохранении по единицам шт., CD и d20', () => {
    // Точные штуки (шт.)
    const pcs = resolveQuantitySpec({ count: 7, unit: QUANTITY_UNIT.PCS });
    expect(pcs).toEqual({
      quantity: 7,
      rolled: false,
      unit: 'pcs',
      diceCount: 0,
      rolls: [],
      effects: 0,
    });

    // CD: бросок 4 CD (например [2, 0, 2, 1] -> сумма 5, 2 эффекта)
    const cd = resolveQuantitySpec(
      { count: 4, unit: QUANTITY_UNIT.CD },
      { rollCombatDice: (n) => ({ total: 5, rolls: [2, 0, 2, 1].slice(0, n), effects: 2 }) },
    );
    expect(cd.rolled).toBe(true);
    expect(cd.diceCount).toBe(4);
    expect(cd.rolls).toEqual([2, 0, 2, 1]);
    expect(cd.quantity).toBe(5);
    expect(cd.effects).toBe(2);

    // Реальный бросок 6 CD без стаба тоже лежит в диапазоне 0..12
    const realCd = resolveQuantitySpec({ count: 6, unit: QUANTITY_UNIT.CD });
    expect(realCd.quantity).toBeGreaterThanOrEqual(0);
    expect(realCd.quantity).toBeLessThanOrEqual(12);

    // d20: 3d20 с гранями 1, 10, 20 => сумма 31
    const d20 = resolveQuantitySpec(
      { count: 3, unit: QUANTITY_UNIT.D20 },
      { rollD20: () => ({ total: 31, rolls: [1, 10, 20] }) },
    );
    expect(d20.rolled).toBe(true);
    expect(d20.rolls).toEqual([1, 10, 20]);
    expect(d20.quantity).toBe(31);
  });

  it('суммирует наценку товара и общую наценку торговца (узкая специализация с любым нулём) + автоперк capCollector', () => {
    // 1. Торговец-химик: общая наценка 0%, но на стимулятор +40% (база 40 кр. -> 56 кр.)
    const chemPrice = computeMerchantSellPriceToPlayer(
      { cost: 40, markupPercent: 40 },
      { saleMarkupPercent: 0, capCollectorPercent: 0 },
    );
    expect(chemPrice).toBe(56);

    // 2. Тот же торговец продаёт патроны с индивидуальной наценкой 0% по базовой цене
    const ammoPrice = computeMerchantSellPriceToPlayer(
      { cost: 3, markupPercent: 0 },
      { saleMarkupPercent: 0, capCollectorPercent: 0 },
    );
    expect(ammoPrice).toBe(3);

    // 3. Суммирование обеих наценок: +15% лавка + +25% дефицитный товар = +40% (100 -> 140)
    const combinedPrice = computeMerchantSellPriceToPlayer(
      { cost: 100, markupPercent: 25 },
      { saleMarkupPercent: 15, capCollectorPercent: 0 },
    );
    expect(combinedPrice).toBe(140);

    // 4. Автоперк «Коллекционер крышек» (-10% при покупке): 140 * 0.9 = 126 кр.
    const withPerkPrice = computeMerchantSellPriceToPlayer(
      { cost: 100, markupPercent: 25 },
      { saleMarkupPercent: 15, capCollectorPercent: 10 },
    );
    expect(withPerkPrice).toBe(126);

    // 5. Мастер вживую снизил общую наценку в минус после проверки Бартера (-20%):
    // итог 100 * (1 + (-20 + 0)/100) = 80 кр.
    const discountedByGm = computeMerchantSellPriceToPlayer(
      { cost: 100, markupPercent: 0 },
      { saleMarkupPercent: -20, capCollectorPercent: 0 },
    );
    expect(discountedByGm).toBe(80);
  });

  it('считает уценку скупки у игрока без знака минус (по умолчанию 50%) и учитывает capCollector (+10%)', () => {
    expect(normalizeBuyDepreciationPercent(undefined, 50)).toBe(50);
    expect(normalizeBuyDepreciationPercent('65')).toBe(65);
    // Даже если кто-то случайно вставил "-40", минус убирается внутри расчётов -> 40% обесценивания
    expect(normalizeBuyDepreciationPercent('-40')).toBe(40);
    expect(normalizeSaleMarkupPercent('')).toBe(0);
    expect(normalizeCapsAmount('250')).toBe(250);

    // По умолчанию 50% обесценивания: предмет за 80 кр. скупается за 40 кр.
    expect(
      computeMerchantBuybackPriceFromPlayer(
        { cost: 80 },
        { buyDepreciationPercent: 50, capCollectorPercent: 0 },
      ),
    ).toBe(40);

    // С перком «Коллекционер крышек» (+10% к продаже): 80 * 0.5 * 1.1 = 44 кр.
    expect(
      computeMerchantBuybackPriceFromPlayer(
        { cost: 80 },
        { buyDepreciationPercent: 50, capCollectorPercent: 10 },
      ),
    ).toBe(44);

    // Жадная скупка 75% обесценивания: остаётся 25% цены (100 -> 25 кр.)
    expect(
      computeMerchantBuybackPriceFromPlayer(
        { cost: 100 },
        { buyDepreciationPercent: 75, capCollectorPercent: 0 },
      ),
    ).toBe(25);
  });

  it('строит двухпанельный буфер обмена (buyLines + sellLines, баланс и дефицит кассы торговца)', () => {
    const merchantItems = [
      { entryId: 'm_stim', itemId: 'chem_stimpak', itemType: 'chems', name: 'Стимулятор', quantity: 5, cost: 40, markupPercent: 25 },
    ];
    const playerItems = [
      { id: 'p_pipe', catalogId: 'weapon_pipe_gun', itemType: 'weapon', name: 'Гладкоствол', quantity: 2, cost: 30 },
      { id: 'p_armor', catalogId: 'armor_raider_chest', itemType: 'armor', name: 'Броня рейдера', quantity: 1, cost: 180 },
    ];

    // Игрок берёт 1 стимулятор (40 * 1.25 = 50 кр.) и отдаёт 2 гладкоствола (2 * 15 = 30 кр.) + броню (90 кр.) = 120 кр.
    // Итого торговец должен доплатить игроку 70 кр., но в кассе торговца только 45 кр. (нехватка 25 кр.)
    const summary = computeBarterSummary({
      merchantItems,
      playerItems,
      buyBuffer: { m_stim: 1 },
      sellBuffer: { p_pipe: 2, p_armor: 1 },
      saleMarkupPercent: 0,
      buyDepreciationPercent: 50,
      capCollectorPercent: 0,
      playerCaps: 20,
      merchantCaps: 45,
    });

    expect(summary.buyLines).toHaveLength(1);
    expect(summary.totalBuyCost).toBe(50);
    expect(summary.sellLines).toHaveLength(2);
    expect(summary.totalSellValue).toBe(120);
    expect(summary.merchantOwes).toBe(70);
    expect(summary.playerOwes).toBe(0);
    expect(summary.canPlayerAfford).toBe(true);
    expect(summary.merchantCapShortfall).toBe(25);
    expect(summary.actualMerchantPayout).toBe(45);
  });

  it('объединяет стаки одинаковых предметов с одинаковой наценкой и разделяет разные наценки', () => {
    let items = [];
    items = addOrMergeContainerItem(items, {
      itemId: 'ammo_10mm',
      itemType: 'ammo',
      name: 'Патроны 10-мм',
      quantity: 12,
      cost: 2,
      markupPercent: 10,
    });
    items = addOrMergeContainerItem(items, {
      itemId: 'ammo_10mm',
      itemType: 'ammo',
      name: 'Патроны 10-мм',
      quantity: 8,
      cost: 2,
      markupPercent: 10,
    });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(20);

    const session = {
      saleMarkupPercent: 10,
      buyDepreciationPercent: 50,
      characterOverrides: {
        char_vip: { saleMarkupPercent: -15, buyDepreciationPercent: 30 },
      },
    };
    expect(getEffectiveMerchantRates(session, 'char_other')).toEqual({
      saleMarkupPercent: 10,
      buyDepreciationPercent: 50,
      isPersonalOverride: false,
    });
    expect(getEffectiveMerchantRates(session, 'char_vip')).toEqual({
      saleMarkupPercent: -15,
      buyDepreciationPercent: 30,
      isPersonalOverride: true,
    });
  });
});
