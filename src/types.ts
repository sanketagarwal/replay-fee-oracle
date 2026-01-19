/**
 * Core Types for Replay Fee Oracle
 */

export type Venue = 'KALSHI' | 'POLYMARKET' | 'HYPERLIQUID' | 'AERODROME';
export type OrderType = 'MARKET' | 'LIMIT';
export type Confidence = 'high' | 'medium' | 'low';

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
 * Fee estimate result
 */
export interface FeeEstimate {
  /** Venue this estimate is for */
  venue: Venue;
  
  /** Input trade size */
  size_usd: number;
  
  /** Total estimated fee in USD */
  total_fee_usd: number;
  
  /** Fee as percentage of trade size */
  fee_pct: number;
  
  /** Fee breakdown */
  breakdown: FeeBreakdown;
  
  /** Estimate confidence */
  confidence: Confidence;
  
  /** Assumptions made in calculation */
  assumptions: string[];
  
  /** Timestamp of estimate */
  estimated_at: string;
}

/**
 * Breakdown of fee components
 */
export interface FeeBreakdown {
  /** Exchange/platform trading fee */
  exchange_fee: number;
  
  /** Gas fee (for on-chain venues) */
  gas_fee?: number;
  
  /** Estimated slippage cost */
  slippage_estimate?: number;
  
  /** Settlement/resolution fee */
  settlement_fee?: number;
  
  /** Any rebates or credits */
  rebate?: number;
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
  
  /** Gross profit before fees */
  gross_profit_usd: number;
  
  /** Total fees across all legs */
  total_fees_usd: number;
  
  /** Net profit after fees */
  net_profit_usd: number;
  
  /** Net profit as percentage */
  net_profit_pct: number;
  
  /** Per-leg fee estimates */
  leg_estimates: FeeEstimate[];
  
  /** Is this arbitrage profitable after fees? */
  is_profitable: boolean;
  
  /** Minimum profit threshold used */
  min_profit_threshold_pct: number;
}
