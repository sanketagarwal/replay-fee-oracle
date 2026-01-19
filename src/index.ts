/**
 * Replay Fee Oracle
 * 
 * Unified fee calculation for multi-venue trading.
 * 
 * @example
 * ```ts
 * import { getOracle } from 'replay-fee-oracle';
 * 
 * const oracle = getOracle();
 * 
 * // Estimate fee for a single trade
 * const estimate = await oracle.estimate({
 *   venue: 'KALSHI',
 *   size_usd: 1000,
 *   price: 0.65,
 *   order_type: 'MARKET',
 * });
 * 
 * console.log(`Fee: $${estimate.total_fee_usd.toFixed(2)} (${estimate.fee_pct.toFixed(3)}%)`);
 * 
 * // Analyze a cross-venue arbitrage
 * const arb = await oracle.analyzeArbitrage(
 *   [
 *     { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.60 },
 *     { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.65 },
 *   ],
 *   50, // $50 gross profit
 *   0.5  // 0.5% min profit threshold
 * );
 * 
 * console.log(`Net profit: $${arb.net_profit_usd.toFixed(2)}`);
 * console.log(`Profitable: ${arb.is_profitable}`);
 * ```
 */

// Core exports
export { FeeOracle, getOracle, createOracle } from './oracle';

// Types
export type {
  Venue,
  OrderType,
  Confidence,
  FeeEstimate,
  FeeEstimateParams,
  FeeBreakdown,
  FeeSchedule,
  VolumeTier,
  TradeLeg,
  ArbitrageAnalysis,
} from './types';

// Calculators (for advanced usage)
export {
  BaseFeeCalculator,
  type FeeCalculator,
  KalshiFeeCalculator,
  PolymarketFeeCalculator,
  HyperliquidFeeCalculator,
  AerodromeFeeCalculator,
} from './calculators';
