# Replay Cost Oracle

**The hidden killer of arbitrage profits isn't finding opportunities—it's costs eating them alive.**

A comprehensive trading cost framework for **prediction markets** (Kalshi, Polymarket) that answers: *"After ALL costs, is this trade actually profitable?"*

## What Makes This Different

Most fee calculators only consider explicit costs. This oracle captures **total trading friction**:

| Cost Type | What It Is | How We Calculate |
|-----------|-----------|------------------|
| **Explicit: Exchange Fee** | Platform's cut | Kalshi: `0.07×C×P×(1-P)`, Polymarket: 1bp taker |
| **Explicit: Gas Fee** | On-chain execution | Polygon gas estimates |
| **Implicit: Spread Cost** | Crossing bid-ask | Live orderbook: `(ask - mid) × contracts` |
| **Implicit: Slippage** | Walking the book | Live orderbook: weighted avg vs best price |

---

## Quick Start

```ts
import { initOracleWithReplayLabs } from 'replay-fee-oracle';

// Initialize with Replay Labs API for live orderbook data
const oracle = initOracleWithReplayLabs('your-api-key');

// Get TOTAL cost (fees + spread + slippage)
const cost = await oracle.estimateCost({
  venue: 'KALSHI',
  size_usd: 1000,
  price: 0.40,
  side: 'BUY',
  order_type: 'MARKET',
  market_id: 'KXSB-26-SEA',
});

console.log(`Exchange fee:  $${cost.exchange_fee_usd}`);   // $42.00
console.log(`Spread cost:   $${cost.spread_cost_usd}`);    // $25.00  ← from live orderbook!
console.log(`Slippage:      $${cost.slippage_usd}`);       // $0.00
console.log(`TOTAL COST:    $${cost.total_cost_usd}`);     // $67.00 (6.7%)
```

---

## Two Modes of Operation

### 1. PUBLIC_SCHEDULE Mode (No API Key Required)

Uses documented fee schedules. Good for screening, not for exact P&L.

```ts
import { getOracle } from 'replay-fee-oracle';

const oracle = getOracle();
const fee = await oracle.estimate({
  venue: 'KALSHI',
  size_usd: 1000,
  price: 0.50,
});
// Returns: FeeEstimate with exchange_fee only
```

### 2. LIVE_ORDERBOOK Mode (Recommended)

Uses Replay Labs API for real-time spread and slippage calculation.

```ts
import { initOracleWithReplayLabs } from 'replay-fee-oracle';

const oracle = initOracleWithReplayLabs(
  'your-api-key', 
  'https://replay-lab-delta.preview.recall.network'
);

const cost = await oracle.estimateCost({
  venue: 'KALSHI',
  size_usd: 1000,
  side: 'BUY',
  market_id: 'KXSB-26-SEA',
});
// Returns: TradingCost with fees + spread + slippage
```

---

## The Problem This Solves

Cross-venue arbitrage looks profitable on paper:

```
Kalshi:      BUY  "Trump wins" @ $0.58
Polymarket:  SELL "Trump wins" @ $0.62
Spread:      4 cents = 6.9% gross profit 🎉
```

But reality hits different:

```
Kalshi taker fee:     $42.00 (formula-based)
Polymarket taker fee:  $0.10 (1bp)
Spread cost (Kalshi):  $8.50 (from 200bps spread)
Spread cost (Poly):    $3.20 (from 80bps spread)
───────────────────────────────────
Total costs:          $53.80
Gross profit:         $40.00
Net profit:           -$13.80 ❌
```

**That "profitable" arb just lost you money.**

---

## Arbitrage Analysis

```ts
const arb = await oracle.analyzeArbitrage(
  [
    { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.58, market_id: 'PRES-2024-DJT' },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.62, market_id: '0x...' },
  ],
  40, // $40 gross profit
  0.5  // 0.5% minimum threshold
);

if (arb.is_profitable) {
  console.log(`✅ Execute: $${arb.net_profit_usd} profit`);
} else {
  console.log(`❌ Skip: costs ($${arb.total_fees_usd}) > profit ($${arb.gross_profit_usd})`);
}
```

---

## Supported Venues

| Venue | Fee Model | Key Features |
|-------|-----------|--------------|
| **Kalshi** | `0.07 × C × P × (1-P)` | US-regulated. Fee peaks at 50% odds, lower at extremes. |
| **Polymarket** | 0% maker, 1bp taker | Crypto-native on Polygon. Minimal fees. |

Both are prediction markets trading binary event contracts → cross-venue arbitrage is possible when the same event exists on both.

---

## API Reference

### `CostOracle`

| Method | Description |
|--------|-------------|
| `estimate(params)` | Fee only (PUBLIC_SCHEDULE) |
| `estimateCost(params)` | **Full cost** including spread/slippage (LIVE_ORDERBOOK) |
| `getOrderbook(venue, marketId)` | Fetch live orderbook snapshot |
| `analyzeArbitrage(legs, gross, threshold)` | Multi-leg arb analysis |
| `getSchedule(venue)` | Fee schedule for venue |
| `compareVenues(size, opts)` | Compare fees across venues |

### `TradingCost` (returned by `estimateCost`)

```ts
{
  venue: 'KALSHI',
  size_usd: 1000,
  side: 'BUY',
  
  // Explicit costs
  exchange_fee_usd: 42.00,
  gas_fee_usd: 0,
  explicit_cost_usd: 42.00,
  
  // Implicit costs (from live orderbook)
  spread_cost_usd: 25.00,
  slippage_usd: 0,
  implicit_cost_usd: 25.00,
  
  // Totals
  total_cost_usd: 67.00,
  total_cost_pct: 6.70,
  
  // Metadata
  mode: 'LIVE_ORDERBOOK',
  confidence: 'high',
  orderbook_snapshot: { ... },
}
```

---

## Installation

```bash
npm install
```

## Development

```bash
npm run type-check  # Type check
npm test            # Run tests
npm run build       # Build to dist/

# Run demo (set API key for live data)
export REPLAY_LABS_API_KEY=your-key
npx tsx examples/demo.ts
```

---

## Fee Schedule Sources

- Kalshi: https://help.kalshi.com/trading/fees
- Polymarket: https://docs.polymarket.com/polymarket-learn/trading/fees

---

## License

MIT
