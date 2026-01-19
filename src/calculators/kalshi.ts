/**
 * Kalshi Fee Calculator
 * 
 * Kalshi fees scale with probability - higher fees near 50%, lower at edges.
 */

import { BaseFeeCalculator } from './interface';
import type { FeeEstimate, FeeEstimateParams, FeeSchedule } from '../types';
import kalshiSchedule from '../schedules/kalshi.json';

interface ProbabilityCurvePoint {
  price_min: number;
  price_max: number;
  multiplier: number;
}

export class KalshiFeeCalculator extends BaseFeeCalculator {
  venue = 'KALSHI' as const;
  
  private schedule: typeof kalshiSchedule;
  
  constructor() {
    super();
    this.schedule = kalshiSchedule;
  }
  
  /**
   * Get fee multiplier based on contract price (probability)
   */
  private getProbabilityMultiplier(price: number): number {
    const curve = this.schedule.probability_curve.curve as ProbabilityCurvePoint[];
    
    for (const point of curve) {
      if (price >= point.price_min && price < point.price_max) {
        return point.multiplier;
      }
    }
    
    // Edge case: price exactly 1.0
    if (price === 1.0) {
      return 0.20;
    }
    
    // Default to full fee if not in curve
    return 1.0;
  }
  
  /**
   * Calculate Kalshi fee for a trade
   * 
   * Kalshi fees are based on:
   * 1. Base fee rate (maker vs taker)
   * 2. Probability multiplier (lower fees at extreme odds)
   * 3. Contract value (price * contracts)
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const price = params.price ?? 0.5;
    const sizeUsd = params.size_usd;
    
    // Determine base fee rate
    const isMarketOrder = params.order_type === 'MARKET';
    const baseFeeRate = isMarketOrder 
      ? this.schedule.base_fees.taker_fee_bps / 10000
      : this.schedule.base_fees.maker_fee_bps / 10000;
    
    // Apply probability multiplier
    const multiplier = this.getProbabilityMultiplier(price);
    const effectiveFeeRate = baseFeeRate * multiplier;
    
    // Calculate fee
    // Kalshi charges on contract value, not just the trade amount
    const contractValue = sizeUsd;
    const exchangeFee = contractValue * effectiveFeeRate;
    
    // Build assumptions
    const assumptions: string[] = [
      `${isMarketOrder ? 'Taker' : 'Maker'} order assumed`,
      `Price ${(price * 100).toFixed(1)}% → multiplier ${multiplier.toFixed(2)}`,
      `Effective fee rate: ${(effectiveFeeRate * 100).toFixed(3)}%`,
    ];
    
    // Determine confidence
    // Lower confidence for mid-range prices (fee curve is approximate)
    const confidence = price > 0.3 && price < 0.7 ? 'medium' : 'high';
    
    return this.createEstimate(
      params,
      {
        exchange_fee: Math.max(exchangeFee, this.schedule.min_fee_usd),
      },
      confidence,
      assumptions
    );
  }
  
  getSchedule(): FeeSchedule {
    return {
      venue: 'KALSHI',
      updated_at: this.schedule.updated_at,
      version: this.schedule.version,
      maker_fee_bps: this.schedule.base_fees.maker_fee_bps,
      taker_fee_bps: this.schedule.base_fees.taker_fee_bps,
      source: this.schedule.source,
      source_url: this.schedule.source_url,
      disclaimer: this.schedule.disclaimer,
    };
  }
}
