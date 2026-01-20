/**
 * Replay Cost Oracle
 * 
 * Comprehensive trading cost calculation for prediction markets (Kalshi, Polymarket).
 * 
 * Includes:
 * - Explicit costs: exchange fees, gas
 * - Implicit costs: spread, slippage (from live orderbook)
 * 
 * @example
 * ```ts
 * import { getOracle, initOracleWithReplayLabs } from 'replay-fee-oracle';
 * 
 * // Option 1: Basic usage (fees only, estimated spread/slippage)
 * const oracle = getOracle();
 * const fee = await oracle.estimate({ venue: 'KALSHI', size_usd: 1000, price: 0.5 });
 * 
 * // Option 2: Full cost with live orderbook
 * const liveOracle = initOracleWithReplayLabs('your-api-key');
 * const cost = await liveOracle.estimateCost({
 *   venue: 'KALSHI',
 *   size_usd: 1000,
 *   price: 0.5,
 *   side: 'BUY',
 *   market_id: 'KXSB-26-SEA',
 * });
 * 
 * console.log(`Exchange fee: $${cost.exchange_fee_usd}`);
 * console.log(`Spread cost:  $${cost.spread_cost_usd}`);
 * console.log(`Slippage:     $${cost.slippage_usd}`);
 * console.log(`TOTAL COST:   $${cost.total_cost_usd} (${cost.total_cost_pct.toFixed(2)}%)`);
 * ```
 */

// Core exports
export { 
  CostOracle,
  FeeOracle,  // Backwards compatibility alias
  getOracle, 
  createOracle,
  initOracleWithReplayLabs,
  type CostOracleConfig,
  type CostEstimateParams,
} from './oracle';

// Types
export type {
  Venue,
  OrderType,
  Confidence,
  CostEstimateMode,
  FeeEstimateMode,  // Backwards compatibility alias
  TradingCost,
  FeeEstimate,      // Backwards compatibility alias
  FeeEstimateParams,
  CostBreakdown,
  FeeBreakdown,     // Backwards compatibility alias
  FeeSchedule,
  VolumeTier,
  TradeLeg,
  ArbitrageAnalysis,
  OrderbookSnapshot,
  OrderbookLevel,
} from './types';

// Venue utilities
export { 
  VENUE_INFO, 
  SUPPORTED_VENUES, 
  canArbitrage 
} from './types';

// Calculators (for advanced usage)
export {
  BaseFeeCalculator,
  type FeeCalculator,
  KalshiFeeCalculator,
  PolymarketFeeCalculator,
} from './calculators';

// Cost calculation utilities
export {
  calculateSlippage,
  calculateSpreadCost,
  estimateSpreadCost,
  estimateSlippage,
} from './calculators/cost-calculator';

// Replay Labs client
export {
  ReplayLabsClient,
  getReplayLabsClient,
  initReplayLabsClient,
  type ReplayLabsConfig,
} from './client/replay-labs';
