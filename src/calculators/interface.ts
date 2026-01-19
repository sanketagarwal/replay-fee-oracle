/**
 * Fee Calculator Interface
 * 
 * All venue-specific calculators implement this interface.
 * This ensures a unified API regardless of venue differences.
 */

import type {
  Venue,
  FeeCalculator,
  FeeEstimate,
  FeeEstimateParams,
  FeeSchedule,
} from '../types';

/**
 * Base class for fee calculators
 * Provides common functionality and enforces the interface
 */
export abstract class BaseFeeCalculator implements FeeCalculator {
  abstract venue: Venue;
  
  /**
   * Estimate fees for a trade
   * Must be implemented by each venue calculator
   */
  abstract estimate(params: FeeEstimateParams): Promise<FeeEstimate>;
  
  /**
   * Get the fee schedule for this venue
   * Must be implemented by each venue calculator
   */
  abstract getSchedule(): FeeSchedule;
  
  /**
   * Check if this calculator can handle the given params
   * Default: check if venue matches
   */
  canHandle(params: FeeEstimateParams): boolean {
    return params.venue === this.venue;
  }
  
  /**
   * Helper: Create a FeeEstimate with common fields populated
   */
  protected createEstimate(
    params: FeeEstimateParams,
    fees: FeeEstimate['fees'],
    confidence: FeeEstimate['confidence'],
    assumptions: string[]
  ): FeeEstimate {
    const grossCost = params.size_usd * (params.price ?? 1);
    const totalFee = Object.values(fees).reduce((sum, fee) => sum + (fee ?? 0), 0);
    
    return {
      venue: this.venue,
      timestamp: new Date().toISOString(),
      gross_cost: grossCost,
      fees,
      total_fee: totalFee,
      net_cost: grossCost + totalFee,
      fee_pct: (totalFee / grossCost) * 100,
      confidence,
      assumptions,
      schedule_version: this.getSchedule().version,
    };
  }
}
