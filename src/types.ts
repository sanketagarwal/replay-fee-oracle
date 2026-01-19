/**
 * Replay Fee Oracle — Type Definitions
 * 
 * Unified types for fee calculation across all venues.
 */

// Supported venues
export type Venue = 'KALSHI' | 'POLYMARKET' | 'AERODROME' | 'HYPERLIQUID';

// Order types
export type OrderType = 'LIMIT' | 'MARKET';
export type Side = 'BUY' | 'SELL';

// Confidence levels for estimates
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Input parameters for fee estimation
 */
export interface FeeEstimateParams {
  venue: Venue;
  order_type: OrderType;
  side: Side;
  size_usd: number;
  price?: number;  // 0-1 for prediction markets, token price for DEX
  
  // Venue-specific params
  pool_address?: string;      // Aerodrome
  market_ticker?: string;     // Kalshi
  token_id?: string;          // Polymarket
  coin?: string;              // Hyperliquid
}

/**
 * Fee breakdown by type
 */
export interface FeeBreakdown {
  exchange_fee: number;       // Core trading fee
  settlement_fee?: number;    // Settlement/clearing fee (Kalshi)
  gas_fee?: number;           // On-chain gas (Aerodrome, Polymarket)
  funding_cost?: number;      // Funding rate cost (Hyperliquid perps)
  slippage_estimate?: number; // Expected slippage for market orders
}

/**
 * Unified fee estimate response
 */
export interface FeeEstimate {
  venue: Venue;
  timestamp: string;          // ISO 8601
  
  // Cost breakdown
  gross_cost: number;         // size_usd * price (what you're buying)
  fees: FeeBreakdown;
  total_fee: number;          // Sum of all fees
  net_cost: number;           // gross_cost + total_fee
  
  // Fee as percentage
  fee_pct: number;            // total_fee / gross_cost * 100
  
  // Confidence and assumptions
  confidence: Confidence;
  assumptions: string[];      // Human-readable assumptions made
  
  // Metadata
  schedule_version?: string;  // Version of fee schedule used
}

/**
 * Volume tier definition
 */
export interface VolumeTier {
  min_volume_usd: number;
  max_volume_usd?: number;
  maker_fee_bps: number;
  taker_fee_bps: number;
}

/**
 * Fee schedule for a venue
 */
export interface FeeSchedule {
  venue: Venue;
  updated_at: string;         // ISO 8601
  version: string;            // Semantic version
  
  // Base fees (in basis points, 100 bps = 1%)
  maker_fee_bps: number;
  taker_fee_bps: number;
  
  // Volume tiers (optional)
  tiers?: VolumeTier[];
  
  // Additional fees
  settlement_fee_bps?: number;
  min_fee_usd?: number;
  
  // Gas estimates (for on-chain venues)
  gas_estimate?: {
    avg_gas_units: number;
    avg_gas_price_gwei: number;
    avg_cost_usd: number;
  };
  
  // Pool-specific fees (Aerodrome)
  pool_fees?: {
    concentrated_bps: number;   // CL pools
    stable_bps: number;         // Stable pools
    volatile_bps: number;       // Volatile pools
  };
  
  // Metadata
  source: string;             // Where this data came from
  source_url?: string;
  disclaimer: string;
}

/**
 * Cross-venue comparison result
 */
export interface VenueComparison {
  venue: Venue;
  total_fee: number;
  fee_pct: number;
  available: boolean;         // Is this venue available for this trade?
  note?: string;              // Why unavailable, or special notes
}

export interface FeeComparisonResult {
  comparison: VenueComparison[];
  cheapest: Venue | null;
  savings_usd: number;        // vs most expensive
  savings_pct: number;
  notes: string[];
}

/**
 * Calculator interface — all venue calculators implement this
 */
export interface FeeCalculator {
  venue: Venue;
  
  /**
   * Estimate fees for a trade
   */
  estimate(params: FeeEstimateParams): Promise<FeeEstimate>;
  
  /**
   * Get the fee schedule for this venue
   */
  getSchedule(): FeeSchedule;
  
  /**
   * Check if this calculator can handle the given params
   */
  canHandle(params: FeeEstimateParams): boolean;
}
