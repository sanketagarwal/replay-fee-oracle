/**
 * Cost Calculator
 * 
 * Calculates implicit trading costs (spread, slippage) from orderbook data.
 */

import type { OrderbookSnapshot } from '../types';

export interface SpreadSlippageResult {
  spread_cost_usd: number;
  slippage_usd: number;
  effective_price: number;
  price_impact_pct: number;
  levels_consumed: number;
}

/**
 * Calculate spread cost for a market order
 * 
 * For a BUY: you pay the ask price, fair value is mid → cost = (ask - mid) * size
 * For a SELL: you receive the bid price, fair value is mid → cost = (mid - bid) * size
 */
export function calculateSpreadCost(
  orderbook: OrderbookSnapshot,
  sizeUsd: number,
  side: 'BUY' | 'SELL'
): number {
  const { mid_price, best_bid, best_ask } = orderbook;
  
  if (side === 'BUY') {
    // Pay the ask, fair value is mid
    const halfSpread = best_ask - mid_price;
    // For prediction markets, size_usd / price = contracts, spread applies per contract
    const contracts = sizeUsd / best_ask;
    return halfSpread * contracts;
  } else {
    // Receive the bid, fair value is mid
    const halfSpread = mid_price - best_bid;
    const contracts = sizeUsd / best_bid;
    return halfSpread * contracts;
  }
}

/**
 * Calculate slippage by walking the orderbook
 * 
 * For large orders that consume multiple levels, the average execution price
 * will be worse than the best bid/ask.
 */
export function calculateSlippage(
  orderbook: OrderbookSnapshot,
  sizeUsd: number,
  side: 'BUY' | 'SELL'
): SpreadSlippageResult {
  // Get relevant side of book
  const levels = side === 'BUY'
    ? orderbook.levels.filter(l => l.side === 'ASK').sort((a, b) => a.price - b.price)
    : orderbook.levels.filter(l => l.side === 'BID').sort((a, b) => b.price - a.price);

  if (levels.length === 0) {
    return {
      spread_cost_usd: 0,
      slippage_usd: 0,
      effective_price: side === 'BUY' ? orderbook.best_ask : orderbook.best_bid,
      price_impact_pct: 0,
      levels_consumed: 0,
    };
  }

  const bestPrice = levels[0]!.price;
  let remainingUsd = sizeUsd;
  let totalContracts = 0;
  let weightedPriceSum = 0;
  let levelsConsumed = 0;

  for (const level of levels) {
    if (remainingUsd <= 0) break;

    // How much USD can we fill at this level?
    const levelValueUsd = level.price * level.size;
    const fillUsd = Math.min(remainingUsd, levelValueUsd);
    const fillContracts = fillUsd / level.price;

    weightedPriceSum += level.price * fillContracts;
    totalContracts += fillContracts;
    remainingUsd -= fillUsd;
    levelsConsumed++;
  }

  // If we couldn't fill the entire order, use the last level's price for the rest
  if (remainingUsd > 0 && levels.length > 0) {
    const lastPrice = levels[levels.length - 1]!.price;
    const remainingContracts = remainingUsd / lastPrice;
    weightedPriceSum += lastPrice * remainingContracts;
    totalContracts += remainingContracts;
  }

  const effectivePrice = totalContracts > 0 ? weightedPriceSum / totalContracts : bestPrice;
  
  // Slippage = difference between effective price and best price
  const slippagePerContract = Math.abs(effectivePrice - bestPrice);
  const slippageUsd = slippagePerContract * totalContracts;
  
  // Price impact as percentage
  const priceImpactPct = bestPrice > 0 ? (slippagePerContract / bestPrice) * 100 : 0;

  // Spread cost (separate from slippage)
  const midPrice = orderbook.mid_price;
  const spreadCostPerContract = side === 'BUY' 
    ? bestPrice - midPrice 
    : midPrice - bestPrice;
  const spreadCostUsd = Math.max(0, spreadCostPerContract * totalContracts);

  return {
    spread_cost_usd: spreadCostUsd,
    slippage_usd: slippageUsd,
    effective_price: effectivePrice,
    price_impact_pct: priceImpactPct,
    levels_consumed: levelsConsumed,
  };
}

/**
 * Estimate spread cost when orderbook is not available
 * Uses typical spread assumptions per venue
 */
export function estimateSpreadCost(
  venue: string,
  sizeUsd: number,
  price: number = 0.5
): number {
  // Typical spread estimates for prediction markets (in probability points)
  const typicalSpreads: Record<string, number> = {
    KALSHI: 0.02,      // 2 cents typical
    POLYMARKET: 0.01,  // 1 cent typical
  };

  const spread = typicalSpreads[venue] ?? 0.02;
  const halfSpread = spread / 2;
  
  // Contracts = size / price, spread cost = halfSpread * contracts
  const contracts = sizeUsd / price;
  return halfSpread * contracts;
}

/**
 * Estimate slippage when orderbook is not available
 * Uses a simple model: larger orders have proportionally more slippage
 */
export function estimateSlippage(
  venue: string,
  sizeUsd: number,
  _price: number = 0.5 // Price param reserved for future use
): number {
  // Slippage model: base_slippage * (size / typical_size) ^ 0.5
  // This assumes slippage grows sub-linearly with size
  
  const typicalSize = 1000; // $1000 reference size
  const baseSlippagePct: Record<string, number> = {
    KALSHI: 0.001,     // 0.1% at $1000
    POLYMARKET: 0.0005, // 0.05% at $1000
  };

  const baseSlippage = baseSlippagePct[venue] ?? 0.001;
  const sizeMultiplier = Math.sqrt(sizeUsd / typicalSize);
  
  return sizeUsd * baseSlippage * sizeMultiplier;
}
