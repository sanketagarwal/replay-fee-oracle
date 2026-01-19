# Replay Fee Oracle

**The hidden killer of arbitrage profits isn't finding opportunities—it's fees eating them alive.**

Replay Fee Oracle is a unified fee calculation framework that answers the critical question: *"After fees, is this trade actually profitable?"*

---

## ⚠️ Important: Fee Estimate Accuracy

**Current mode: `PUBLIC_SCHEDULE`** — estimates based on publicly documented fee structures.

| What this does | What this doesn't do |
|----------------|---------------------|
| ✅ Uses official fee docs (Kalshi, Polymarket, etc.) | ❌ Account-specific fees |
| ✅ Uses Kalshi's official formula | ❌ Your actual volume tier |
| ✅ Includes gas estimates (Polygon, Base) | ❌ Live API calls to venues |
| ✅ Good for screening/comparing opportunities | ❌ Exact execution cost |

**Use for:** Filtering opportunities, approximate P&L, venue comparison  
**Don't use for:** Exact execution cost, compliance reporting

For account-accurate fees, you'd need to either:
1. Provide explicit maker/taker rates via `user_context`
2. Authenticate with venue APIs (not implemented)

---

## The Problem

Cross-venue arbitrage looks profitable on paper:

```
Kalshi:      BUY  "Trump wins" @ $0.58
Polymarket:  SELL "Trump wins" @ $0.62
Spread:      4 cents = 6.9% gross profit 🎉
```

But reality hits different:

```
Kalshi taker fee:     ~$5.80 (1% at 58% probability)
Polymarket taker fee: ~$0.62 (1bp)
Gas on Polygon:       ~$0.01
─────────────────────────────────
Total fees:           $6.43
Net profit:           -$2.43 ❌
```

**That "profitable" arb just lost you money.**

The problem compounds because:
- **Fee structures differ wildly** — Kalshi scales with probability, Hyperliquid has volume tiers, Aerodrome varies by pool type
- **Context matters** — Your Hyperliquid fees depend on your 14-day volume and HYPE staking
- **Small spreads dominate** — Most real arb opportunities are 1-5%, where fees determine viability
- **Manual calculation doesn't scale** — You can't evaluate 1000 opportunities/hour by hand

## The Solution

Replay Fee Oracle normalizes fee calculation across all venues into a single interface:

```ts
const arb = await oracle.analyzeArbitrage([
  { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.58 },
  { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.62 },
], 40); // $40 gross profit

if (arb.is_profitable) {
  execute(arb);
} else {
  console.log(`Skip: fees ($${arb.total_fees_usd}) > profit ($${arb.gross_profit_usd})`);
}
```

## Real-World Scenarios

### 1. Cross-Venue Prediction Market Arbitrage

Same event, different prices across Kalshi and Polymarket. This is the core use case for `analyzeArbitrage()`:

```ts
// Scan for profitable arbs on the SAME EVENT across venues
const opportunities = await findPriceDiscrepancies();

for (const opp of opportunities) {
  // Only works for prediction markets (Kalshi ↔ Polymarket)
  const analysis = await oracle.analyzeArbitrage([
    { venue: 'KALSHI', direction: 'BUY', size_usd: opp.size, price: opp.kalshiPrice },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: opp.size, price: opp.polymarketPrice },
  ], opp.grossProfit, 0.5); // 0.5% minimum threshold
  
  if (analysis.is_profitable) {
    // This one actually makes money after fees
    await executeArb(analysis);
  }
}

// ⚠️ This would throw an error - can't arb across asset types:
// oracle.analyzeArbitrage([
//   { venue: 'KALSHI', ... },      // Prediction market
//   { venue: 'HYPERLIQUID', ... }, // Perps - different asset!
// ], ...);
```

### 2. Thin Liquidity Timing (arb-oppity integration)

When spreads widen during low-liquidity periods, you need to know if the wider spread covers fees:

```ts
// Liquidity signal detected: spread widened to 8% at 3am EST
const spreadPct = 8;
const tradeSize = 500;
const grossProfit = tradeSize * (spreadPct / 100);

const analysis = await oracle.analyzeArbitrage([
  { venue: 'KALSHI', direction: 'BUY', size_usd: tradeSize, price: 0.46 },
  { venue: 'POLYMARKET', direction: 'SELL', size_usd: tradeSize, price: 0.54 },
], grossProfit);

console.log(`
  Spread: ${spreadPct}%
  Gross:  $${analysis.gross_profit_usd}
  Fees:   $${analysis.total_fees_usd} (${(analysis.total_fees_usd / grossProfit * 100).toFixed(1)}% of gross)
  Net:    $${analysis.net_profit_usd}
  Action: ${analysis.is_profitable ? '✅ EXECUTE' : '❌ SKIP'}
`);
```

### 3. Optimal Venue Selection

Not all venues are equal for the same trade. Find the cheapest:

```ts
const estimates = await oracle.compareVenues(10000, { 
  price: 0.5, 
  order_type: 'MARKET' 
});

// Sort by fee percentage
estimates.sort((a, b) => a.fee_pct - b.fee_pct);

console.log('Cheapest venues for $10k trade:');
estimates.forEach((e, i) => {
  console.log(`${i + 1}. ${e.venue}: $${e.total_fee_usd.toFixed(2)} (${e.fee_pct.toFixed(3)}%)`);
});

// Output:
// 1. POLYMARKET: $1.01 (0.010%)
// 2. HYPERLIQUID: $3.50 (0.035%)
// 3. AERODROME: $30.01 (0.300%)
// 4. KALSHI: $100.00 (1.000%)
```

### 4. Position Sizing with Fee Constraints

Calculate the minimum trade size where fees don't eat all profit:

```ts
function findMinProfitableSize(
  venue1: Venue, 
  venue2: Venue, 
  spreadPct: number,
  minNetProfitPct: number = 0.5
): number {
  // Binary search for minimum size
  let low = 100, high = 10000;
  
  while (high - low > 10) {
    const mid = (low + high) / 2;
    const gross = mid * (spreadPct / 100);
    
    const analysis = await oracle.analyzeArbitrage([
      { venue: venue1, direction: 'BUY', size_usd: mid, price: 0.5 },
      { venue: venue2, direction: 'SELL', size_usd: mid, price: 0.5 + spreadPct/100 },
    ], gross, minNetProfitPct);
    
    if (analysis.is_profitable) {
      high = mid;
    } else {
      low = mid;
    }
  }
  
  return Math.ceil(high);
}

// For a 3% spread between Kalshi and Polymarket, 
// minimum size to be profitable is ~$X
const minSize = await findMinProfitableSize('KALSHI', 'POLYMARKET', 3);
```

### 5. Backtesting Fee Impact

When backtesting strategies, accurate fee modeling prevents overfitting to unrealistic profits:

```ts
async function backtest(trades: HistoricalTrade[]) {
  let totalGross = 0;
  let totalFees = 0;
  let totalNet = 0;
  
  for (const trade of trades) {
    const fee = await oracle.estimate({
      venue: trade.venue,
      size_usd: trade.size,
      price: trade.price,
      order_type: trade.orderType,
    });
    
    totalGross += trade.profit;
    totalFees += fee.total_fee_usd;
    totalNet += trade.profit - fee.total_fee_usd;
  }
  
  console.log(`
    Gross P&L:  $${totalGross.toFixed(2)}
    Total Fees: $${totalFees.toFixed(2)} (${(totalFees/totalGross*100).toFixed(1)}%)
    Net P&L:    $${totalNet.toFixed(2)}
    
    ${totalFees/totalGross > 0.5 ? '⚠️ Fees consuming >50% of profits!' : ''}
  `);
}
```

## How It Enables Accurate Arb Capture

### Before Replay Fee Oracle

```
1. Find price discrepancy ✅
2. Calculate gross profit ✅
3. Estimate fees... 🤷 (guess? ignore? use wrong numbers?)
4. Execute trade
5. Realize fees ate your profit 😭
```

### After Replay Fee Oracle

```
1. Find price discrepancy ✅
2. Calculate gross profit ✅
3. oracle.analyzeArbitrage() → exact fees, net profit, go/no-go ✅
4. Execute only profitable trades ✅
5. Actual profit matches expected 🎉
```

### Key Benefits

| Without Oracle | With Oracle |
|----------------|-------------|
| Guess fees or ignore them | Exact fee calculation per venue |
| Same logic for all venues | Venue-specific: probability curves, volume tiers, pool types |
| Surprise losses | Pre-trade P&L validation |
| Can't backtest accurately | Realistic historical fee modeling |
| Manual spreadsheet math | Programmatic, scales to 1000s of trades |

## Supported Venues

### Prediction Markets (Cross-Venue Arbitrage Eligible)

These venues trade binary event contracts. The same event (e.g., "Trump wins 2024") can exist on both, enabling cross-venue arbitrage.

| Venue | Fee Model | Key Features |
|-------|-----------|--------------|
| **Kalshi** | Formula: `0.07 × C × P × (1-P)` | US-regulated. Fee depends on contracts × probability variance |
| **Polymarket** | Maker/Taker | Crypto-native on Polygon. 0% maker, 1bp taker |

### Crypto Trading Venues (Single-Venue Fee Calculation)

These venues trade crypto assets. Cross-venue arbitrage doesn't apply (different asset classes).

| Venue | Asset Type | Fee Model | Key Features |
|-------|------------|-----------|--------------|
| **Hyperliquid** | Perps | Volume-tiered | Perpetual futures. 4 tiers + staking discounts |
| **Aerodrome** | Spot | Pool-based | DEX swaps on Base. 1bp (stable) to 100bp (volatile) |

```ts
import { VENUE_INFO, canArbitrage } from 'replay-fee-oracle';

// Check venue categories
VENUE_INFO['KALSHI'].category;      // 'PREDICTION_MARKET'
VENUE_INFO['HYPERLIQUID'].category; // 'PERPS'
VENUE_INFO['AERODROME'].category;   // 'SPOT_DEX'

// Check if cross-venue arb is valid
canArbitrage('KALSHI', 'POLYMARKET');   // true ✅
canArbitrage('KALSHI', 'HYPERLIQUID');  // false ❌ (different asset types)
```

## Installation

```bash
npm install
```

## Quick Start

```ts
import { getOracle } from 'replay-fee-oracle';

const oracle = getOracle();

// Single trade fee estimate
const estimate = await oracle.estimate({
  venue: 'KALSHI',
  size_usd: 1000,
  price: 0.65,
  order_type: 'MARKET',
});

console.log(`Fee: $${estimate.total_fee_usd.toFixed(2)} (${estimate.fee_pct.toFixed(3)}%)`);
console.log(`Breakdown:`, estimate.breakdown);
console.log(`Assumptions:`, estimate.assumptions);
```

## API Reference

### `FeeOracle`

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

### `ArbitrageAnalysis`

```ts
{
  legs: TradeLeg[];
  gross_profit_usd: number;
  total_fees_usd: number;
  net_profit_usd: number;
  net_profit_pct: number;
  leg_estimates: FeeEstimate[];
  is_profitable: boolean;
  min_profit_threshold_pct: number;
}
```

## Advanced: User Context

For venues with user-specific fees (volume tiers, staking):

```ts
import { HyperliquidFeeCalculator } from 'replay-fee-oracle';

const calculator = new HyperliquidFeeCalculator({
  volume_14d_usd: 10_000_000, // $10M → tier 3
  hype_staked: 10000,          // 10% additional discount
});

const estimate = await calculator.estimate({
  venue: 'HYPERLIQUID',
  size_usd: 10000,
  order_type: 'MARKET',
});

// Fees are lower due to tier + staking
```

## Fee Schedules

Fee schedules are stored in `src/schedules/` as JSON files. These should be updated when venues change their fee structures.

Current sources:
- Kalshi: https://help.kalshi.com/trading/fees
- Polymarket: https://docs.polymarket.com/polymarket-learn/trading/fees
- Hyperliquid: https://www.hyperliquid.review/fees
- Aerodrome: https://aerodrome.finance/docs

## Development

```bash
npm run type-check  # Type check
npm test            # Run tests (30 passing)
npm run build       # Build to dist/
npx tsx examples/demo.ts  # Run interactive demo
```

## License

MIT
