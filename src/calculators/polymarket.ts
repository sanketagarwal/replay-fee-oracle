/**
 * Polymarket Fee Calculator
 * 
 * Simple maker/taker model with 0% maker and 1bp taker.
 */

import { BaseFeeCalculator } from './interface';
import type { FeeEstimate, FeeEstimateParams, FeeSchedule } from '../types';
import polymarketSchedule from '../schedules/polymarket.json';

export class PolymarketFeeCalculator extends BaseFeeCalculator {
  venue = 'POLYMARKET' as const;
  
  private schedule: typeof polymarketSchedule;
  
  constructor() {
    super();
    this.schedule = polymarketSchedule;
  }
  
  /**
   * Check if market is a short-duration crypto market (higher fees)
   */
  private isShortDurationCrypto(marketId?: string): boolean {
    // Short-duration crypto markets typically have specific identifiers
    // For now, we'll default to standard fees unless explicitly specified
    // In production, this would check market metadata
    if (!marketId) return false;
    
    // Heuristic: 15-minute markets often have "15m" or "crypto" in identifier
    const lowerMarketId = marketId.toLowerCase();
    return lowerMarketId.includes('15m') || 
           (lowerMarketId.includes('crypto') && lowerMarketId.includes('minute'));
  }
  
  /**
   * Calculate Polymarket fee for a trade
   * 
   * Most markets: 0% maker, 0.01% taker
   * Short-duration crypto: Higher taker fees
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const sizeUsd = params.size_usd;
    const isMarketOrder = params.order_type === 'MARKET';
    const isShortDuration = this.isShortDurationCrypto(params.token_id);
    
    // Determine fee rate
    let feeRateBps: number;
    let assumptions: string[] = [];
    
    if (isMarketOrder) {
      // Taker fee
      feeRateBps = isShortDuration 
        ? this.schedule.special_markets.short_duration_crypto.taker_fee_bps
        : this.schedule.base_fees.taker_fee_bps;
      
      assumptions.push(`Taker order (market order)`);
      if (isShortDuration) {
        assumptions.push(`Short-duration crypto market → higher fees`);
      }
    } else {
      // Maker fee (typically 0)
      feeRateBps = this.schedule.base_fees.maker_fee_bps;
      assumptions.push(`Maker order (limit order) → 0% fee`);
      
      if (this.schedule.maker_rebates.enabled) {
        assumptions.push(`Eligible for maker rebates program`);
      }
    }
    
    const feeRate = feeRateBps / 10000;
    const exchangeFee = sizeUsd * feeRate;
    
    // Gas estimate (minimal on Polygon)
    const gasEstimate = this.schedule.gas_estimate.avg_cost_usd;
    assumptions.push(`Gas estimate: $${gasEstimate.toFixed(4)} (Polygon)`);
    
    // Effective fee rate
    assumptions.push(`Fee rate: ${feeRateBps} bps (${(feeRate * 100).toFixed(3)}%)`);
    
    return this.createEstimate(
      params,
      {
        exchange_fee: Math.max(exchangeFee, this.schedule.min_fee_usd),
        gas_fee: gasEstimate,
      },
      'high', // Polymarket fees are well-documented and predictable
      assumptions
    );
  }
  
  getSchedule(): FeeSchedule {
    return {
      venue: 'POLYMARKET',
      updated_at: this.schedule.updated_at,
      version: this.schedule.version,
      maker_fee_bps: this.schedule.base_fees.maker_fee_bps,
      taker_fee_bps: this.schedule.base_fees.taker_fee_bps,
      source: this.schedule.source,
      source_url: this.schedule.source_url,
      disclaimer: this.schedule.disclaimer,
      gas_estimate: this.schedule.gas_estimate,
    };
  }
}
