/**
 * Demo script to manually test the Cost Oracle
 * 
 * Run with: npx tsx examples/demo.ts
 * 
 * For live orderbook data, set environment variable:
 *   REPLAY_LABS_API_KEY=your-api-key
 */

import { 
  getOracle, 
  initOracleWithReplayLabs,
  type Venue, 
  VENUE_INFO, 
  canArbitrage, 
  PREDICTION_VENUES 
} from '../src';

const API_KEY = process.env.REPLAY_LABS_API_KEY;
const BASE_URL = process.env.REPLAY_LABS_BASE_URL || 'https://replay-lab-delta.preview.recall.network';

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('🏦 REPLAY COST ORACLE DEMO');
  console.log('═'.repeat(60));
  console.log('\nCost = Explicit (fees, gas) + Implicit (spread, slippage)\n');

  // ═══════════════════════════════════════════════════════════════
  // 0. VENUE CATEGORIES
  // ═══════════════════════════════════════════════════════════════

  console.log('═'.repeat(60));
  console.log('🏛️  VENUE CATEGORIES');
  console.log('═'.repeat(60));

  console.log('\nPrediction Markets (cross-venue arb eligible):');
  for (const venue of PREDICTION_VENUES) {
    console.log(`  • ${venue}: ${VENUE_INFO[venue].description}`);
  }

  console.log('\nCrypto Trading Venues (single-venue fee calc only):');
  const cryptoVenues: Venue[] = ['HYPERLIQUID', 'AERODROME'];
  for (const venue of cryptoVenues) {
    console.log(`  • ${venue} [${VENUE_INFO[venue].category}]: ${VENUE_INFO[venue].description}`);
  }

  console.log('\nCan arbitrage check:');
  console.log(`  KALSHI ↔ POLYMARKET:   ${canArbitrage('KALSHI', 'POLYMARKET') ? '✅ Yes' : '❌ No'}`);
  console.log(`  KALSHI ↔ HYPERLIQUID:  ${canArbitrage('KALSHI', 'HYPERLIQUID') ? '✅ Yes' : '❌ No'} (different asset types)`);

  // ═══════════════════════════════════════════════════════════════
  // 1. BASIC FEE ESTIMATES (PUBLIC_SCHEDULE mode)
  // ═══════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(60));
  console.log('📊 BASIC FEE ESTIMATES (PUBLIC_SCHEDULE mode)');
  console.log('═'.repeat(60));
  console.log('\nThese use documented fee schedules only (no live orderbook).\n');

  const basicOracle = getOracle();

  const trades = [
    { venue: 'KALSHI' as Venue, size: 1000, price: 0.50, label: 'Kalshi @ 50% (worst case fees)' },
    { venue: 'KALSHI' as Venue, size: 1000, price: 0.10, label: 'Kalshi @ 10% (lower fees at edge)' },
    { venue: 'POLYMARKET' as Venue, size: 1000, price: 0.50, label: 'Polymarket @ 50%' },
    { venue: 'HYPERLIQUID' as Venue, size: 1000, price: undefined, label: 'Hyperliquid (base tier)' },
  ];

  for (const trade of trades) {
    const estimate = await basicOracle.estimate({
      venue: trade.venue,
      size_usd: trade.size,
      price: trade.price,
      order_type: 'MARKET',
    });

    console.log(`${trade.label}:`);
    console.log(`  Fee: $${estimate.total_fee_usd.toFixed(2)} (${estimate.fee_pct.toFixed(3)}%)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. FULL COST ESTIMATES (LIVE_ORDERBOOK mode)
  // ═══════════════════════════════════════════════════════════════

  if (API_KEY) {
    console.log('\n' + '═'.repeat(60));
    console.log('💰 FULL COST ESTIMATES (LIVE_ORDERBOOK mode)');
    console.log('═'.repeat(60));
    console.log('\nThese include spread + slippage from live orderbook data.\n');

    const liveOracle = initOracleWithReplayLabs(API_KEY, BASE_URL);

    // Kalshi market example
    const kalshiCost = await liveOracle.estimateCost({
      venue: 'KALSHI',
      size_usd: 1000,
      price: 0.40,
      side: 'BUY',
      order_type: 'MARKET',
      market_id: 'KXSB-26-SEA', // Example market
    });

    console.log('Kalshi KXSB-26-SEA (BUY $1000):');
    console.log('  ┌─────────────────────────────────────────');
    console.log('  │ EXPLICIT COSTS');
    console.log(`  │   Exchange fee:  $${kalshiCost.exchange_fee_usd.toFixed(2)}`);
    console.log(`  │   Gas fee:       $${kalshiCost.gas_fee_usd.toFixed(2)}`);
    console.log('  │ IMPLICIT COSTS');
    console.log(`  │   Spread cost:   $${kalshiCost.spread_cost_usd.toFixed(2)}`);
    console.log(`  │   Slippage:      $${kalshiCost.slippage_usd.toFixed(2)}`);
    console.log('  ├─────────────────────────────────────────');
    console.log(`  │ TOTAL COST:      $${kalshiCost.total_cost_usd.toFixed(2)} (${kalshiCost.total_cost_pct.toFixed(2)}%)`);
    console.log('  └─────────────────────────────────────────');
    
    if (kalshiCost.orderbook_snapshot) {
      console.log(`  Orderbook: bid=${kalshiCost.orderbook_snapshot.best_bid.toFixed(2)} / ask=${kalshiCost.orderbook_snapshot.best_ask.toFixed(2)} (spread: ${kalshiCost.orderbook_snapshot.spread_bps.toFixed(0)}bps)`);
    }
    console.log(`  Mode: ${kalshiCost.mode}, Confidence: ${kalshiCost.confidence}`);

    // ═══════════════════════════════════════════════════════════════
    // 3. ARBITRAGE ANALYSIS WITH LIVE DATA
    // ═══════════════════════════════════════════════════════════════

    console.log('\n' + '═'.repeat(60));
    console.log('🎯 ARBITRAGE ANALYSIS');
    console.log('═'.repeat(60));
    console.log('\nAnalyzing if arb is profitable after ALL costs...\n');

    // Example: 5% spread between Kalshi and Polymarket
    const arb = await liveOracle.analyzeArbitrage(
      [
        { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.475 },
        { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.525 },
      ],
      50, // $50 gross on 5% spread
      0.5  // 0.5% min profit threshold
    );

    console.log('Kalshi BUY @ 47.5% → Polymarket SELL @ 52.5%');
    console.log(`  Gross profit:  $${arb.gross_profit_usd.toFixed(2)}`);
    console.log(`  Total costs:   $${arb.total_fees_usd.toFixed(2)}`);
    console.log(`  Net profit:    $${arb.net_profit_usd.toFixed(2)}`);
    console.log(`  Net %:         ${arb.net_profit_pct.toFixed(2)}%`);
    console.log(`  Verdict:       ${arb.is_profitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}`);

  } else {
    console.log('\n' + '═'.repeat(60));
    console.log('⚠️  LIVE_ORDERBOOK mode not available');
    console.log('═'.repeat(60));
    console.log('\nTo enable live orderbook data, set REPLAY_LABS_API_KEY:');
    console.log('  export REPLAY_LABS_API_KEY=your-api-key');
    console.log('  npx tsx examples/demo.ts');
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. FEE SCHEDULES
  // ═══════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(60));
  console.log('📋 FEE SCHEDULES');
  console.log('═'.repeat(60));

  const schedules = basicOracle.getAllSchedules();
  for (const schedule of schedules) {
    console.log(`\n${schedule.venue}:`);
    console.log(`  Maker: ${schedule.maker_fee_bps} bps`);
    console.log(`  Taker: ${schedule.taker_fee_bps} bps`);
    if (schedule.gas_estimate) {
      console.log(`  Gas:   ~$${schedule.gas_estimate.avg_cost_usd} (${schedule.gas_estimate.chain})`);
    }
    console.log(`  Source: ${schedule.source_url}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Demo complete!');
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
