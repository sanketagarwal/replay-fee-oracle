/**
 * Kalshi Fee Calculator
 * 
 * Kalshi uses formula-based fees:
 *   taker_fee = 0.07 × contracts × P × (1-P)
 *   maker_fee = 0.0175 × contracts × P × (1-P)  [sports/macro markets]
 *   maker_fee = 0  [most other markets]
 * 
 * Source: https://help.kalshi.com/trading/fees
 */

import { BaseFeeCalculator } from './interface';
import type { FeeEstimate, FeeEstimateParams, FeeSchedule } from '../types';
import kalshiSchedule from '../schedules/kalshi.json';

export class KalshiFeeCalculator extends BaseFeeCalculator {
  venue = 'KALSHI' as const;
  
  private schedule: typeof kalshiSchedule;
  
  // Fee coefficients from Kalshi's published formula
  private readonly TAKER_COEFFICIENT = 0.07;
  private readonly MAKER_COEFFICIENT_SPECIAL = 0.0175; // sports/macro markets
  private readonly MAKER_COEFFICIENT_DEFAULT = 0;      // most markets
  
  constructor() {
    super();
    this.schedule = kalshiSchedule;
  }
  
  /**
   * Calculate fee using Kalshi's official formula:
   * fee = coefficient × num_contracts × P × (1 - P)
   * 
   * The P × (1-P) term peaks at 0.25 when P=0.50, and approaches 0 at extremes.
   * This means fees are highest at 50/50 odds and lowest at extreme odds.
   */
  private calculateFee(
    numContracts: number,
    price: number,
    coefficient: number
  ): number {
    // P × (1-P) is the probability variance term
    const varianceTerm = price * (1 - price);
    return coefficient * numContracts * varianceTerm;
  }
  
  /**
   * Convert USD trade size to approximate number of contracts
   * 
   * Each Kalshi contract costs `price` dollars and pays $1 if correct.
   * So $100 at price $0.50 = 200 contracts
   */
  private usdToContracts(sizeUsd: number, price: number): number {
    if (price <= 0 || price >= 1) return 0;
    return sizeUsd / price;
  }
  
  /**
   * Calculate Kalshi fee for a trade
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const price = params.price ?? 0.5;
    const sizeUsd = params.size_usd;
    
    // Convert USD to contracts
    const numContracts = this.usdToContracts(sizeUsd, price);
    
    // Determine coefficient based on order type
    const isMarketOrder = params.order_type === 'MARKET';
    const coefficient = isMarketOrder 
      ? this.TAKER_COEFFICIENT 
      : this.MAKER_COEFFICIENT_DEFAULT; // Assume most markets (maker = 0)
    
    // Calculate fee using official formula
    const exchangeFee = this.calculateFee(numContracts, price, coefficient);
    
    // Calculate P×(1-P) for display
    const varianceTerm = price * (1 - price);
    
    // Build assumptions
    const assumptions: string[] = [
      `${isMarketOrder ? 'Taker' : 'Maker'} order`,
      `Formula: ${coefficient} × ${numContracts.toFixed(0)} contracts × ${price.toFixed(2)} × ${(1-price).toFixed(2)}`,
      `P×(1-P) = ${varianceTerm.toFixed(4)} (max 0.25 at 50%)`,
      `Fee: $${exchangeFee.toFixed(2)}`,
    ];
    
    if (!isMarketOrder) {
      assumptions.push(`Note: Maker fee is 0 for most markets, 0.0175×C×P×(1-P) for sports/macro`);
    }
    
    // Confidence is high - we're using the official formula
    const confidence = 'high';
    
    return this.createEstimate(
      params,
      {
        exchange_fee: exchangeFee,
      },
      confidence,
      assumptions
    );
  }
  
  /**
   * Estimate with explicit contract count (more accurate)
   */
  async estimateByContracts(
    numContracts: number,
    price: number,
    orderType: 'MARKET' | 'LIMIT' = 'MARKET',
    isSpecialMarket: boolean = false
  ): Promise<FeeEstimate> {
    const isMarketOrder = orderType === 'MARKET';
    
    let coefficient: number;
    if (isMarketOrder) {
      coefficient = this.TAKER_COEFFICIENT;
    } else {
      coefficient = isSpecialMarket 
        ? this.MAKER_COEFFICIENT_SPECIAL 
        : this.MAKER_COEFFICIENT_DEFAULT;
    }
    
    const exchangeFee = this.calculateFee(numContracts, price, coefficient);
    const sizeUsd = numContracts * price;
    const varianceTerm = price * (1 - price);
    
    const assumptions: string[] = [
      `${isMarketOrder ? 'Taker' : 'Maker'} order`,
      `Formula: ${coefficient} × ${numContracts} × ${price.toFixed(2)} × ${(1-price).toFixed(2)}`,
      `P×(1-P) = ${varianceTerm.toFixed(4)}`,
      isSpecialMarket ? 'Sports/macro market (maker fee applies)' : 'Standard market',
    ];
    
    return this.createEstimate(
      { venue: 'KALSHI', size_usd: sizeUsd, price, order_type: orderType },
      { exchange_fee: exchangeFee },
      'high',
      assumptions
    );
  }
  
  getSchedule(): FeeSchedule {
    return {
      venue: 'KALSHI',
      updated_at: this.schedule.updated_at,
      version: this.schedule.version,
      maker_fee_bps: 0, // Most markets
      taker_fee_bps: 175, // ~1.75% at P=0.50 (0.07 × 0.25 = 0.0175)
      source: this.schedule.source,
      source_url: this.schedule.source_url,
      disclaimer: this.schedule.disclaimer,
    };
  }
}
