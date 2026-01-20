/**
 * Core Types for Replay Cost Oracle
 * 
 * "Cost" is broader than "Fee":
 * - Fee = exchange's cut (explicit)
 * - Cost = fee + gas + spread + slippage (total trading friction)
 */

/**
 * Supported prediction market venues
 */
export type Venue = 'KALSHI' | 'POLYMARKET';

export type OrderType = 'MARKET' | 'LIMIT';
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Cost estimation mode
 * 
 * PUBLIC_SCHEDULE: Uses publicly documented fee schedules + estimated spread/slippage.
 *                  Good for screening opportunities.
 * 
 * LIVE_ORDERBOOK: Uses real-time orderbook data for accurate spread/slippage.
 *                 Requires Replay Labs API access.
 * 
 * ACCOUNT_SPECIFIC: Uses user-provided rates or authenticated API calls.
 *                   Required for exact fee calculation.
 */
export type CostEstimateMode = 'PUBLIC_SCHEDULE' | 'LIVE_ORDERBOOK' | 'ACCOUNT_SPECIFIC';

// Backwards compatibility
export type FeeEstimateMode = CostEstimateMode;

/**
 * Venue metadata
 */
export const VENUE_INFO: Record<Venue, { description: string }> = {
  KALSHI: { 
    description: 'US-regulated prediction market for binary event contracts' 
  },
  POLYMARKET: { 
    description: 'Crypto-native prediction market on Polygon' 
  },
};

/**
 * All supported venues (all are prediction markets)
 */
export const SUPPORTED_VENUES: Venue[] = ['KALSHI', 'POLYMARKET'];

/**
 * Check if two venues can be used for cross-venue arbitrage
 * (both must be prediction markets - which all our venues are)
 */
export function canArbitrage(venue1: Venue, venue2: Venue): boolean {
  return venue1 !== venue2;
}

/**
 * Parameters for fee estimation
 */
export interface FeeEstimateParams {
  /** Trading venue */
  venue: Venue;
  
  /** Trade size in USD */
  size_usd: number;
  
  /** Order type (MARKET = taker, LIMIT = maker) */
  order_type?: OrderType;
  
  /** Contract price (0-1 for prediction markets) */
  price?: number;
  
  /** Market/contract identifier */
  market_id?: string;
  
  /** Token/contract identifier (for Polymarket) */
  token_id?: string;
  
  /** Pool address (for DEXs like Aerodrome) */
  pool_address?: string;
}

/**
 * Trading cost estimate result
 * 
 * Includes both EXPLICIT costs (fees) and IMPLICIT costs (spread, slippage).
 * 
 * ⚠️ IMPORTANT: 
 * - PUBLIC_SCHEDULE mode: Uses static fee schedules, estimated spread/slippage
 * - LIVE_ORDERBOOK mode: Uses real-time orderbook for accurate spread/slippage
 * - Neither is account-accurate for fees (volume tiers, staking, etc.)
 */
export interface TradingCost {
  /** Venue this estimate is for */
  venue: Venue;
  
  /** Input trade size */
  size_usd: number;
  
  /** Trade side (affects which side of book we cross) */
  side: 'BUY' | 'SELL';
  
  // ═══════════════════════════════════════════════════════════════
  // EXPLICIT COSTS (fees charged by platform/chain)
  // ═══════════════════════════════════════════════════════════════
  
  /** Exchange/platform trading fee */
  exchange_fee_usd: number;
  
  /** Gas fee for on-chain execution */
  gas_fee_usd: number;
  
  /** Total explicit costs */
  explicit_cost_usd: number;
  
  // ═══════════════════════════════════════════════════════════════
  // IMPLICIT COSTS (market friction)
  // ═══════════════════════════════════════════════════════════════
  
  /** Cost of crossing the spread (half-spread for market orders) */
  spread_cost_usd: number;
  
  /** Estimated slippage based on order size vs book depth */
  slippage_usd: number;
  
  /** Total implicit costs */
  implicit_cost_usd: number;
  
  // ═══════════════════════════════════════════════════════════════
  // TOTALS
  // ═══════════════════════════════════════════════════════════════
  
  /** Total trading cost (explicit + implicit) */
  total_cost_usd: number;
  
  /** Total cost as percentage of trade size */
  total_cost_pct: number;
  
  // ═══════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════
  
  /** Detailed breakdown */
  breakdown: CostBreakdown;
  
  /** Estimate confidence */
  confidence: Confidence;
  
  /** How this estimate was computed */
  mode: CostEstimateMode;
  
  /** Assumptions made in calculation */
  assumptions: string[];
  
  /** Timestamp of estimate */
  estimated_at: string;
  
  /** Orderbook snapshot used (if LIVE_ORDERBOOK mode) */
  orderbook_snapshot?: OrderbookSnapshot;
}

/**
 * Legacy fee estimate (explicit costs only)
 * 
 * Use TradingCost for comprehensive cost estimation.
 */
export interface FeeEstimate {
  venue: Venue;
  size_usd: number;
  total_fee_usd: number;
  fee_pct: number;
  breakdown: FeeBreakdown;
  confidence: Confidence;
  mode: CostEstimateMode;
  assumptions: string[];
  estimated_at: string;
}

/**
 * Legacy fee breakdown (explicit costs only)
 */
export interface FeeBreakdown {
  exchange_fee: number;
  gas_fee?: number;
  slippage_estimate?: number;
  settlement_fee?: number;
  rebate?: number;
}

/**
 * Full cost breakdown (explicit + implicit)
 */
export interface CostBreakdown {
  // Explicit
  exchange_fee: number;
  gas_fee: number;
  settlement_fee?: number;
  rebate?: number;
  
  // Implicit
  spread_cost: number;
  slippage: number;
  
  // Market data (if available)
  best_bid?: number;
  best_ask?: number;
  mid_price?: number;
  spread_bps?: number;
}

/**
 * Orderbook snapshot for cost calculation
 */
export interface OrderbookSnapshot {
  venue: Venue;
  market_id: string;
  timestamp: string;
  best_bid: number;
  best_ask: number;
  mid_price: number;
  spread: number;
  spread_bps: number;
  bid_depth_usd: number;
  ask_depth_usd: number;
  levels: OrderbookLevel[];
}

export interface OrderbookLevel {
  price: number;
  size: number;
  side: 'BID' | 'ASK';
}

/**
 * Volume tier for tiered fee structures
 */
export interface VolumeTier {
  min_volume_usd: number;
  max_volume_usd?: number;
  maker_fee_bps: number;
  taker_fee_bps: number;
}

/**
 * Fee schedule metadata
 */
export interface FeeSchedule {
  venue: Venue;
  updated_at: string;
  version: string;
  
  /** Base maker fee in basis points */
  maker_fee_bps: number;
  
  /** Base taker fee in basis points */
  taker_fee_bps: number;
  
  /** Volume tiers (if applicable) */
  tiers?: VolumeTier[];
  
  /** Pool-specific fees (for DEXs) */
  pool_fees?: {
    concentrated_bps: number;
    stable_bps: number;
    volatile_bps: number;
  };
  
  /** Gas estimate (for on-chain venues) */
  gas_estimate?: {
    chain: string;
    avg_gas_units?: number;
    avg_gas_price_gwei?: number;
    avg_cost_usd: number;
  };
  
  /** Source of fee schedule */
  source: string;
  source_url: string;
  
  /** Disclaimer */
  disclaimer: string;
}

/**
 * Multi-leg trade for arbitrage calculations
 */
export interface TradeLeg {
  venue: Venue;
  direction: 'BUY' | 'SELL';
  size_usd: number;
  price?: number;
  market_id?: string;
  order_type?: OrderType;
}

/**
 * Arbitrage analysis result
 */
export interface ArbitrageAnalysis {
  /** Trade legs */
  legs: TradeLeg[];
  
  /** Gross profit before costs */
  gross_profit_usd: number;
  
  /** Total costs across all legs (fees + spread + slippage if using live orderbook) */
  total_fees_usd: number;
  
  /** Net profit after costs */
  net_profit_usd: number;
  
  /** Net profit as percentage */
  net_profit_pct: number;
  
  /** Per-leg cost estimates (FeeEstimate for basic, TradingCost for live orderbook) */
  leg_estimates: (FeeEstimate | TradingCost)[];
  
  /** Is this arbitrage profitable after costs? */
  is_profitable: boolean;
  
  /** Minimum profit threshold used */
  min_profit_threshold_pct: number;
}
