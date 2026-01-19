/**
 * Fee Calculator Factory
 * 
 * Routes to the correct calculator based on venue.
 */

import type { Venue, FeeCalculator, FeeEstimateParams } from '../types';

// Import venue-specific calculators (to be implemented)
// import { KalshiFeeCalculator } from './kalshi';
// import { PolymarketFeeCalculator } from './polymarket';
// import { AerodromeFeeCalculator } from './aerodrome';
// import { HyperliquidFeeCalculator } from './hyperliquid';

/**
 * Registry of all fee calculators
 */
const calculators: Map<Venue, FeeCalculator> = new Map();

/**
 * Register a calculator for a venue
 */
export function registerCalculator(calculator: FeeCalculator): void {
  calculators.set(calculator.venue, calculator);
}

/**
 * Get calculator for a specific venue
 */
export function getCalculator(venue: Venue): FeeCalculator | undefined {
  return calculators.get(venue);
}

/**
 * Get calculator that can handle the given params
 */
export function getCalculatorForParams(params: FeeEstimateParams): FeeCalculator | undefined {
  const calculator = calculators.get(params.venue);
  if (calculator?.canHandle(params)) {
    return calculator;
  }
  return undefined;
}

/**
 * List all supported venues
 */
export function getSupportedVenues(): Venue[] {
  return Array.from(calculators.keys());
}

/**
 * Check if a venue is supported
 */
export function isVenueSupported(venue: Venue): boolean {
  return calculators.has(venue);
}

// Initialize calculators
// TODO: Uncomment as calculators are implemented
// registerCalculator(new KalshiFeeCalculator());
// registerCalculator(new PolymarketFeeCalculator());
// registerCalculator(new AerodromeFeeCalculator());
// registerCalculator(new HyperliquidFeeCalculator());
