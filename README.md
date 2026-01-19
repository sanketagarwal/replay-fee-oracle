# Replay Fee Oracle

Unified fee calculation framework for multi-venue trading. Provides accurate fee estimates for arbitrage analysis across prediction markets and DEXs.

## Supported Venues

| Venue | Fee Model | Notes |
|-------|-----------|-------|
| **Kalshi** | Probability-scaled | Higher fees at 50% odds, lower at edges |
| **Polymarket** | Maker/Taker | 0% maker, 1bp taker |
| **Hyperliquid** | Volume-tiered | Staking discounts available |
| **Aerodrome** | Pool-based | Varies by pool type (concentrated, stable, volatile) |

## Installation

```bash
npm install
```

## Usage

### Basic Fee Estimation

```ts
import { getOracle } from 'replay-fee-oracle';

const oracle = getOracle();

// Estimate fee for a single trade
const estimate = await oracle.estimate({
  venue: 'KALSHI',
  size_usd: 1000,
  price: 0.65,
  order_type: 'MARKET',
});

console.log(`Fee: $${estimate.total_fee_usd.toFixed(2)} (${estimate.fee_pct.toFixed(3)}%)`);
// Fee: $6.50 (0.650%)
```

### Arbitrage Analysis

```ts
const arb = await oracle.analyzeArbitrage(
  [
    { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.60 },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.65 },
  ],
  50, // $50 gross profit
  0.5  // 0.5% min profit threshold
);

console.log(`Gross: $${arb.gross_profit_usd}`);
console.log(`Fees: $${arb.total_fees_usd.toFixed(2)}`);
console.log(`Net: $${arb.net_profit_usd.toFixed(2)}`);
console.log(`Profitable: ${arb.is_profitable}`);
```

### Compare Venues

```ts
const estimates = await oracle.compareVenues(1000, { 
  price: 0.5, 
  order_type: 'MARKET' 
});

estimates.forEach(e => {
  console.log(`${e.venue}: $${e.total_fee_usd.toFixed(2)} (${e.fee_pct.toFixed(3)}%)`);
});
```

### User Context (Hyperliquid)

```ts
import { HyperliquidFeeCalculator } from 'replay-fee-oracle';

// With volume tier and staking
const calculator = new HyperliquidFeeCalculator({
  volume_14d_usd: 10_000_000, // $10M volume
  hype_staked: 10000,         // 10% discount
});

const estimate = await calculator.estimate({
  venue: 'HYPERLIQUID',
  size_usd: 10000,
  order_type: 'MARKET',
});
// Lower fees due to tier + staking discount
```

## API Reference

### `FeeOracle`

Main entry point for fee calculations.

| Method | Description |
|--------|-------------|
| `estimate(params)` | Estimate fee for a single trade |
| `getSchedule(venue)` | Get fee schedule for a venue |
| `getAllSchedules()` | Get all fee schedules |
| `analyzeArbitrage(legs, grossProfit, threshold)` | Analyze multi-leg arbitrage |
| `compareVenues(sizeUsd, options)` | Compare fees across venues |

### `FeeEstimateParams`

```ts
{
  venue: 'KALSHI' | 'POLYMARKET' | 'HYPERLIQUID' | 'AERODROME';
  size_usd: number;
  order_type?: 'MARKET' | 'LIMIT';  // default: MARKET
  price?: number;                    // 0-1 for prediction markets
  market_id?: string;
  token_id?: string;
  pool_address?: string;
}
```

### `FeeEstimate`

```ts
{
  venue: Venue;
  size_usd: number;
  total_fee_usd: number;
  fee_pct: number;
  breakdown: {
    exchange_fee: number;
    gas_fee?: number;
    slippage_estimate?: number;
    settlement_fee?: number;
    rebate?: number;
  };
  confidence: 'high' | 'medium' | 'low';
  assumptions: string[];
  estimated_at: string;
}
```

## Fee Schedules

Fee schedules are stored in `src/schedules/` as JSON files. Update these when venues change their fee structures.

## Development

```bash
# Type check
npm run type-check

# Run tests
npm test

# Build
npm run build
```

## License

MIT
