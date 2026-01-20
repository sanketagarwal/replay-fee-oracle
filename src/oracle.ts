/**
 * Replay Cost Oracle
 * 
 * Comprehensive trading cost calculation including:
 * - Explicit costs: exchange fees, gas
 * - Implicit costs: spread, slippage (from live orderbook)
 */

import type { 
  Venue, 
  FeeEstimate, 
  FeeEstimateParams, 
  FeeSchedule, 
  TradeLeg, 
  ArbitrageAnalysis,
  TradingCost,
  OrderbookSnapshot,
  CostEstimateMode,
} from './types';
import { canArbitrage } from './types';
import { 
  type FeeCalculator,
  KalshiFeeCalculator, 
  PolymarketFeeCalculator,
} from './calculators';
import { 
  calculateSlippage, 
  estimateSpreadCost, 
  estimateSlippage 
} from './calculators/cost-calculator';
import { ReplayLabsClient } from './client/replay-labs';

export interface CostOracleConfig {
  /** Replay Labs API key for live orderbook data */
  replayLabsApiKey?: string;
  /** Replay Labs API base URL */
  replayLabsBaseUrl?: string;
  /** Default estimation mode */
  defaultMode?: CostEstimateMode;
}

export interface CostEstimateParams extends FeeEstimateParams {
  /** Trade side (required for spread/slippage calculation) */
  side?: 'BUY' | 'SELL';
  /** Estimation mode override */
  mode?: CostEstimateMode;
}

/**
 * Main Oracle class - entry point for all cost calculations
 */
export class CostOracle {
  private calculators: Map<Venue, FeeCalculator>;
  private replayLabsClient: ReplayLabsClient | null = null;
  private defaultMode: CostEstimateMode;
  
  constructor(config?: CostOracleConfig) {
    this.calculators = new Map();
    this.defaultMode = config?.defaultMode ?? 'PUBLIC_SCHEDULE';
    
    // Register prediction market fee calculators
    this.registerCalculator(new KalshiFeeCalculator());
    this.registerCalculator(new PolymarketFeeCalculator());
    
    // Initialize Replay Labs client if API key provided
    if (config?.replayLabsApiKey) {
      this.replayLabsClient = new ReplayLabsClient({
        apiKey: config.replayLabsApiKey,
        baseUrl: config.replayLabsBaseUrl,
      });
      this.defaultMode = 'LIVE_ORDERBOOK';
    }
  }
  
  /**
   * Set Replay Labs client for live orderbook data
   */
  setReplayLabsClient(client: ReplayLabsClient): void {
    this.replayLabsClient = client;
    this.defaultMode = 'LIVE_ORDERBOOK';
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
   * Estimate fees for a single trade (backwards compatible)
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const calculator = this.calculators.get(params.venue);
    
    if (!calculator) {
      throw new Error(`No calculator registered for venue: ${params.venue}`);
    }
    
    return calculator.estimate(params);
  }
  
  /**
   * Estimate TOTAL trading cost including spread and slippage
   * 
   * This is the recommended method for accurate cost estimation.
   * Uses live orderbook data when available.
   */
  async estimateCost(params: CostEstimateParams): Promise<TradingCost> {
    const mode = params.mode ?? this.defaultMode;
    const side = params.side ?? 'BUY';
    const price = params.price ?? 0.5;
    
    // 1. Get explicit costs (fees) from calculator
    const feeEstimate = await this.estimate(params);
    const exchangeFee = feeEstimate.breakdown.exchange_fee;
    const gasFee = feeEstimate.breakdown.gas_fee ?? 0;
    const explicitCost = exchangeFee + gasFee;
    
    // 2. Get implicit costs (spread, slippage)
    let spreadCost = 0;
    let slippage = 0;
    let orderbook: OrderbookSnapshot | undefined;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    const assumptions: string[] = [...feeEstimate.assumptions];
    
    if (mode === 'LIVE_ORDERBOOK' && this.replayLabsClient && params.market_id) {
      try {
        // Fetch live orderbook
        orderbook = await this.replayLabsClient.getOrderbook(params.venue, params.market_id);
        
        // Calculate spread and slippage from orderbook
        const slippageResult = calculateSlippage(orderbook, params.size_usd, side);
        spreadCost = slippageResult.spread_cost_usd;
        slippage = slippageResult.slippage_usd;
        confidence = 'high';
        
        assumptions.push(`Live orderbook: spread=${orderbook.spread_bps.toFixed(0)}bps`);
        assumptions.push(`Levels consumed: ${slippageResult.levels_consumed}`);
        assumptions.push(`Price impact: ${slippageResult.price_impact_pct.toFixed(3)}%`);
      } catch (err) {
        // Fall back to estimates
        assumptions.push(`Orderbook fetch failed, using estimates`);
        spreadCost = estimateSpreadCost(params.venue, params.size_usd, price);
        slippage = estimateSlippage(params.venue, params.size_usd, price);
        confidence = 'low';
      }
    } else {
      // Use estimates when no live data
      spreadCost = estimateSpreadCost(params.venue, params.size_usd, price);
      slippage = estimateSlippage(params.venue, params.size_usd, price);
      assumptions.push(`Spread/slippage estimated (no live orderbook)`);
    }
    
    const implicitCost = spreadCost + slippage;
    const totalCost = explicitCost + implicitCost;
    const totalCostPct = params.size_usd > 0 ? (totalCost / params.size_usd) * 100 : 0;
    
    return {
      venue: params.venue,
      size_usd: params.size_usd,
      side,
      
      // Explicit costs
      exchange_fee_usd: exchangeFee,
      gas_fee_usd: gasFee,
      explicit_cost_usd: explicitCost,
      
      // Implicit costs
      spread_cost_usd: spreadCost,
      slippage_usd: slippage,
      implicit_cost_usd: implicitCost,
      
      // Totals
      total_cost_usd: totalCost,
      total_cost_pct: totalCostPct,
      
      // Metadata
      breakdown: {
        exchange_fee: exchangeFee,
        gas_fee: gasFee,
        spread_cost: spreadCost,
        slippage,
        best_bid: orderbook?.best_bid,
        best_ask: orderbook?.best_ask,
        mid_price: orderbook?.mid_price,
        spread_bps: orderbook?.spread_bps,
      },
      confidence,
      mode,
      assumptions,
      estimated_at: new Date().toISOString(),
      orderbook_snapshot: orderbook,
    };
  }
  
  /**
   * Fetch current orderbook for a market
   */
  async getOrderbook(venue: Venue, marketId: string): Promise<OrderbookSnapshot> {
    if (!this.replayLabsClient) {
      throw new Error('Replay Labs client not configured. Initialize with replayLabsApiKey.');
    }
    return this.replayLabsClient.getOrderbook(venue, marketId);
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
   * Analyze a cross-venue prediction market arbitrage
   * 
   * NOTE: Cross-venue arbitrage only applies to prediction markets (Kalshi ↔ Polymarket)
   * where the same event can be traded on both venues.
   * 
   * @param legs - Trade legs (buy/sell on different prediction market venues)
   * @param grossProfit - Expected gross profit before fees
   * @param minProfitThresholdPct - Minimum profit % to be considered profitable (default 0.5%)
   * @param useLiveOrderbook - If true, uses live orderbook for spread/slippage (default: true if configured)
   */
  async analyzeArbitrage(
    legs: TradeLeg[],
    grossProfit: number,
    minProfitThresholdPct: number = 0.5,
    useLiveOrderbook: boolean = true
  ): Promise<ArbitrageAnalysis> {
    // Validate that all legs are from compatible venues (prediction markets)
    const venues = legs.map(l => l.venue);
    const uniqueVenues = [...new Set(venues)];
    
    if (uniqueVenues.length >= 2) {
      for (let i = 0; i < uniqueVenues.length; i++) {
        for (let j = i + 1; j < uniqueVenues.length; j++) {
          const v1 = uniqueVenues[i]!;
          const v2 = uniqueVenues[j]!;
          if (!canArbitrage(v1, v2)) {
            throw new Error(
              `Cross-venue arbitrage requires different venues. Got ${v1} and ${v2}.`
            );
          }
        }
      }
    }
    
    // Estimate TOTAL COST for each leg (fees + spread + slippage)
    const useFullCost = useLiveOrderbook && this.replayLabsClient;
    
    const legEstimates = await Promise.all(
      legs.map(leg => {
        if (useFullCost) {
          return this.estimateCost({
            venue: leg.venue,
            size_usd: leg.size_usd,
            order_type: leg.order_type ?? 'MARKET',
            price: leg.price,
            market_id: leg.market_id,
            side: leg.direction,
          });
        } else {
          return this.estimate({
            venue: leg.venue,
            size_usd: leg.size_usd,
            order_type: leg.order_type ?? 'MARKET',
            price: leg.price,
            market_id: leg.market_id,
          });
        }
      })
    );
    
    // Calculate totals - use total_cost_usd if available (TradingCost), else total_fee_usd (FeeEstimate)
    const totalCosts = legEstimates.reduce((sum, est) => {
      // Check if it's a TradingCost (has total_cost_usd) or FeeEstimate (has total_fee_usd)
      if ('total_cost_usd' in est) {
        return sum + est.total_cost_usd;
      }
      return sum + est.total_fee_usd;
    }, 0);
    const netProfit = grossProfit - totalCosts;
    const totalSize = legs.reduce((sum, leg) => sum + leg.size_usd, 0);
    const netProfitPct = totalSize > 0 ? (netProfit / totalSize) * 100 : 0;
    
    return {
      legs,
      gross_profit_usd: grossProfit,
      total_fees_usd: totalCosts, // Now includes spread + slippage if live orderbook used
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
let oracleInstance: CostOracle | null = null;

/**
 * Get the singleton Oracle instance
 */
export function getOracle(config?: CostOracleConfig): CostOracle {
  if (!oracleInstance) {
    oracleInstance = new CostOracle(config);
  }
  return oracleInstance;
}

/**
 * Create a new Oracle instance (for testing or custom configuration)
 */
export function createOracle(config?: CostOracleConfig): CostOracle {
  return new CostOracle(config);
}

/**
 * Initialize oracle with Replay Labs for live orderbook data
 */
export function initOracleWithReplayLabs(apiKey: string, baseUrl?: string): CostOracle {
  oracleInstance = new CostOracle({
    replayLabsApiKey: apiKey,
    replayLabsBaseUrl: baseUrl,
    defaultMode: 'LIVE_ORDERBOOK',
  });
  return oracleInstance;
}

// Backwards compatibility
export { CostOracle as FeeOracle };
