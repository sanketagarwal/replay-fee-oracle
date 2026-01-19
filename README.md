# Replay Fee Oracle

Unified fee calculation framework for Replay Labs API. Provides fee estimates across all supported venues with a common interface.

## Overview

Different trading venues have different fee structures:
- **Kalshi**: Maker/taker fees, volume tiers
- **Polymarket**: CLOB fees
- **Aerodrome**: Pool fees (0.05%/0.3%/1%) + gas
- **Hyperliquid**: Maker/taker + funding rates

This module provides:
1. **Unified interface** — Same output schema regardless of venue
2. **Per-venue implementations** — Specialized logic for each venue
3. **Fee schedules** — Maintained, versioned fee data
4. **Cross-venue comparison** — Compare costs across venues

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GET /api/fees/estimate                      │
│                                                                 │
│  Input: venue, order_type, size, price                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Fee Router                               │
│                                                                 │
│  Routes to correct calculator based on venue parameter          │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    Kalshi     │   │  Polymarket   │   │   Aerodrome   │   ...
│  Calculator   │   │  Calculator   │   │  Calculator   │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FeeEstimate (unified)                       │
│                                                                 │
│  { venue, gross_cost, fees: {...}, total_fee, confidence }     │
└─────────────────────────────────────────────────────────────────┘
```

## API

### Estimate Fees

```bash
GET /api/fees/estimate
  ?venue=KALSHI
  &order_type=LIMIT
  &side=BUY
  &size_usd=100
  &price=0.52
```

Response:
```json
{
  "venue": "KALSHI",
  "gross_cost": 52.00,
  "fees": {
    "exchange_fee": 0.52,
    "settlement_fee": 0.00
  },
  "total_fee": 0.52,
  "net_cost": 52.52,
  "confidence": "medium",
  "assumptions": [
    "Assumed limit order (maker fee)",
    "Standard tier pricing"
  ]
}
```

### Compare Venues

```bash
GET /api/fees/compare
  ?venues=KALSHI,POLYMARKET
  &size_usd=100
```

Response:
```json
{
  "comparison": [
    { "venue": "KALSHI", "total_fee": 0.52, "fee_pct": 0.52 },
    { "venue": "POLYMARKET", "total_fee": 0.35, "fee_pct": 0.35 }
  ],
  "cheapest": "POLYMARKET",
  "savings_usd": 0.17
}
```

### Get Fee Schedule

```bash
GET /api/fees/schedule?venue=KALSHI
```

Response:
```json
{
  "venue": "KALSHI",
  "updated_at": "2026-01-15T00:00:00Z",
  "maker_fee_bps": 0,
  "taker_fee_bps": 100,
  "tiers": [
    { "min_volume_usd": 0, "maker_fee_bps": 0, "taker_fee_bps": 100 },
    { "min_volume_usd": 100000, "maker_fee_bps": 0, "taker_fee_bps": 70 }
  ],
  "source": "kalshi_public_docs",
  "disclaimer": "Fees may change. Verify before trading."
}
```

## Supported Venues

| Venue | Status | Fee Types |
|-------|--------|-----------|
| Kalshi | 🔜 Planned | Maker/taker, volume tiers |
| Polymarket | 🔜 Planned | CLOB fees |
| Aerodrome | 🔜 Planned | Pool fee + gas |
| Hyperliquid | 🔜 Planned | Maker/taker + funding |

## Project Structure

```
replay-fee-oracle/
├── src/
│   ├── calculators/
│   │   ├── interface.ts         # FeeCalculator interface
│   │   ├── kalshi.ts
│   │   ├── polymarket.ts
│   │   ├── aerodrome.ts
│   │   ├── hyperliquid.ts
│   │   └── index.ts             # Factory/router
│   │
│   ├── schedules/               # Fee schedule data
│   │   ├── kalshi.json
│   │   ├── polymarket.json
│   │   ├── aerodrome.json
│   │   └── hyperliquid.json
│   │
│   ├── api/
│   │   ├── estimate.ts
│   │   ├── compare.ts
│   │   └── schedule.ts
│   │
│   └── types.ts
│
├── docs/
│   └── api-spec.md
│
└── README.md
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

## Contributing to Replay Labs

This module is designed to be integrated into the Replay Labs API as:
- `GET /api/fees/estimate`
- `GET /api/fees/compare`
- `GET /api/fees/schedule`

## License

MIT
