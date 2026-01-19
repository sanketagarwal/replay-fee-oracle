/**
 * Replay Fee Oracle
 * 
 * Unified fee calculation service for multi-venue trading.
 */

import type { 
  Venue, 
  FeeEstimate, 
  FeeEstimateParams, 
  FeeSchedule, 
  TradeLeg, 
  ArbitrageAnalysis 
} from './types';
import { 
  type FeeCalculator,
  KalshiFeeCalculator, 
  PolymarketFeeCalculator, 
  HyperliquidFeeCalculator, 
  AerodromeFeeCalculator 
} from './calculators';

/**
 * Main Oracle class - entry point for all fee calculations
 */
export class FeeOracle {
  private calculators: Map<Venue, FeeCalculator>;
  
  constructor() {
    this.calculators = new Map();
    
    // Register all calculators
    this.registerCalculator(new KalshiFeeCalculator());
    this.registerCalculator(new PolymarketFeeCalculator());
    this.registerCalculator(new HyperliquidFeeCalculator());
    this.registerCalculator(new AerodromeFeeCalculator());
  }
  
  /**
   * Register a fee calculator for a venue
   */
  registerCalculator(calculator: FeeCalculator): void {
    this.calculators.set(calculator.venue, calculator);
  }
  
  /**
   * Get calculator for a venue
   */
  getCalculator(venue: Venue): FeeCalculator | undefined {
    return this.calculators.get(venue);
  }
  
  /**
   * List all supported venues
   */
  getSupportedVenues(): Venue[] {
    return Array.from(this.calculators.keys());
  }
  
  /**
   * Estimate fees for a single trade
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const calculator = this.calculators.get(params.venue);
    
    if (!calculator) {
      throw new Error(`No calculator registered for venue: ${params.venue}`);
    }
    
    return calculator.estimate(params);
  }
  
  /**
   * Get fee schedule for a venue
   */
  getSchedule(venue: Venue): FeeSchedule | undefined {
    const calculator = this.calculators.get(venue);
    return calculator?.getSchedule();
  }
  
  /**
   * Get fee schedules for all venues
   */
  getAllSchedules(): FeeSchedule[] {
    return Array.from(this.calculators.values()).map(c => c.getSchedule());
  }
  
  /**
   * Analyze a multi-leg arbitrage trade
   * 
   * @param legs - Trade legs (buy/sell on different venues)
   * @param grossProfit - Expected gross profit before fees
   * @param minProfitThresholdPct - Minimum profit % to be considered profitable (default 0.5%)
   */
  async analyzeArbitrage(
    legs: TradeLeg[],
    grossProfit: number,
    minProfitThresholdPct: number = 0.5
  ): Promise<ArbitrageAnalysis> {
    // Estimate fees for each leg
    const legEstimates = await Promise.all(
      legs.map(leg => this.estimate({
        venue: leg.venue,
        size_usd: leg.size_usd,
        order_type: leg.order_type ?? 'MARKET',
        price: leg.price,
        market_id: leg.market_id,
      }))
    );
    
    // Calculate totals
    const totalFees = legEstimates.reduce((sum, est) => sum + est.total_fee_usd, 0);
    const netProfit = grossProfit - totalFees;
    const totalSize = legs.reduce((sum, leg) => sum + leg.size_usd, 0);
    const netProfitPct = totalSize > 0 ? (netProfit / totalSize) * 100 : 0;
    
    return {
      legs,
      gross_profit_usd: grossProfit,
      total_fees_usd: totalFees,
      net_profit_usd: netProfit,
      net_profit_pct: netProfitPct,
      leg_estimates: legEstimates,
      is_profitable: netProfitPct >= minProfitThresholdPct,
      min_profit_threshold_pct: minProfitThresholdPct,
    };
  }
  
  /**
   * Compare fees across venues for the same trade size
   */
  async compareVenues(
    sizeUsd: number,
    options?: { price?: number; order_type?: 'MARKET' | 'LIMIT' }
  ): Promise<FeeEstimate[]> {
    const venues = this.getSupportedVenues();
    
    return Promise.all(
      venues.map(venue => this.estimate({
        venue,
        size_usd: sizeUsd,
        price: options?.price,
        order_type: options?.order_type ?? 'MARKET',
      }))
    );
  }
}

// Singleton instance
let oracleInstance: FeeOracle | null = null;

/**
 * Get the singleton Oracle instance
 */
export function getOracle(): FeeOracle {
  if (!oracleInstance) {
    oracleInstance = new FeeOracle();
  }
  return oracleInstance;
}

/**
 * Create a new Oracle instance (for testing or custom configuration)
 */
export function createOracle(): FeeOracle {
  return new FeeOracle();
}
