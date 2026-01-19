/**
 * Base Fee Calculator Interface
 * 
 * All venue-specific calculators extend this.
 */

import type { Venue, FeeEstimate, FeeEstimateParams, FeeSchedule, FeeBreakdown, Confidence, FeeEstimateMode } from '../types';

/**
 * Fee calculator interface that all venue implementations must follow
 */
export interface FeeCalculator {
  /** Venue this calculator handles */
  readonly venue: Venue;
  
  /**
   * Estimate fees for a trade
   */
  estimate(params: FeeEstimateParams): Promise<FeeEstimate>;
  
  /**
   * Get the current fee schedule for this venue
   */
  getSchedule(): FeeSchedule;
}

/**
 * Base class with common functionality
 */
export abstract class BaseFeeCalculator implements FeeCalculator {
  abstract readonly venue: Venue;
  
  abstract estimate(params: FeeEstimateParams): Promise<FeeEstimate>;
  abstract getSchedule(): FeeSchedule;
  
  /**
   * Create a fee estimate response
   * 
   * Note: All estimates from static calculators are PUBLIC_SCHEDULE mode.
   * For ACCOUNT_SPECIFIC mode, would need auth or explicit user-provided rates.
   */
  protected createEstimate(
    params: FeeEstimateParams,
    breakdown: Partial<FeeBreakdown>,
    confidence: Confidence,
    assumptions: string[],
    mode: FeeEstimateMode = 'PUBLIC_SCHEDULE'
  ): FeeEstimate {
    const exchangeFee = breakdown.exchange_fee ?? 0;
    const gasFee = breakdown.gas_fee ?? 0;
    const slippage = breakdown.slippage_estimate ?? 0;
    const settlement = breakdown.settlement_fee ?? 0;
    const rebate = breakdown.rebate ?? 0;
    
    const totalFee = exchangeFee + gasFee + slippage + settlement - rebate;
    const feePct = params.size_usd > 0 ? (totalFee / params.size_usd) * 100 : 0;
    
    // Add mode disclaimer to assumptions
    const modeDisclaimer = mode === 'PUBLIC_SCHEDULE' 
      ? '⚠️ PUBLIC_SCHEDULE: Based on documented fees, not account-specific'
      : '✅ ACCOUNT_SPECIFIC: Using provided/authenticated rates';
    
    return {
      venue: this.venue,
      size_usd: params.size_usd,
      total_fee_usd: totalFee,
      fee_pct: feePct,
      breakdown: {
        exchange_fee: exchangeFee,
        gas_fee: gasFee || undefined,
        slippage_estimate: slippage || undefined,
        settlement_fee: settlement || undefined,
        rebate: rebate || undefined,
      },
      confidence,
      mode,
      assumptions: [modeDisclaimer, ...assumptions],
      estimated_at: new Date().toISOString(),
    };
  }
}
