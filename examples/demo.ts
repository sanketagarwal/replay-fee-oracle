/**
 * Demo script to manually test the Fee Oracle
 * 
 * Run with: npx tsx examples/demo.ts
 */

import { getOracle, type Venue, VENUE_INFO, canArbitrage, PREDICTION_VENUES } from '../src';

const oracle = getOracle();

// ═══════════════════════════════════════════════════════════════
// 0. VENUE CATEGORIES
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
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
console.log(`  KALSHI ↔ AERODROME:    ${canArbitrage('KALSHI', 'AERODROME') ? '✅ Yes' : '❌ No'} (different asset types)`);

// ═══════════════════════════════════════════════════════════════
// 1. SINGLE TRADE FEE ESTIMATES
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('📊 SINGLE TRADE FEE ESTIMATES');
console.log('═'.repeat(60));

const trades = [
  { venue: 'KALSHI' as Venue, size: 1000, price: 0.50, label: 'Kalshi @ 50% (worst case)' },
  { venue: 'KALSHI' as Venue, size: 1000, price: 0.10, label: 'Kalshi @ 10% (edge odds)' },
  { venue: 'KALSHI' as Venue, size: 1000, price: 0.90, label: 'Kalshi @ 90% (edge odds)' },
  { venue: 'POLYMARKET' as Venue, size: 1000, price: 0.50, label: 'Polymarket @ 50%' },
  { venue: 'HYPERLIQUID' as Venue, size: 1000, price: undefined, label: 'Hyperliquid (base tier)' },
  { venue: 'AERODROME' as Venue, size: 1000, price: undefined, label: 'Aerodrome (volatile pool)' },
];

for (const trade of trades) {
  const estimate = await oracle.estimate({
    venue: trade.venue,
    size_usd: trade.size,
    price: trade.price,
    order_type: 'MARKET',
  });
  
  console.log(`\n${trade.label}:`);
  console.log(`  Size:     $${estimate.size_usd}`);
  console.log(`  Fee:      $${estimate.total_fee_usd.toFixed(4)} (${estimate.fee_pct.toFixed(4)}%)`);
  console.log(`  Breakdown:`);
  console.log(`    Exchange: $${estimate.breakdown.exchange_fee.toFixed(4)}`);
  if (estimate.breakdown.gas_fee) {
    console.log(`    Gas:      $${estimate.breakdown.gas_fee.toFixed(4)}`);
  }
  console.log(`  Confidence: ${estimate.confidence}`);
  console.log(`  Assumptions:`);
  estimate.assumptions.forEach(a => console.log(`    - ${a}`));
}

// ═══════════════════════════════════════════════════════════════
// 2. VENUE COMPARISON
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('📈 VENUE COMPARISON ($1000 market order)');
console.log('═'.repeat(60));

const comparison = await oracle.compareVenues(1000, { 
  price: 0.5, 
  order_type: 'MARKET' 
});

comparison.sort((a, b) => a.total_fee_usd - b.total_fee_usd);

console.log('\nRanked by fee (lowest first):');
comparison.forEach((e, i) => {
  console.log(`  ${i + 1}. ${e.venue.padEnd(12)} $${e.total_fee_usd.toFixed(2).padStart(7)} (${e.fee_pct.toFixed(3)}%)`);
});

// ═══════════════════════════════════════════════════════════════
// 3. PREDICTION MARKET ARBITRAGE (Kalshi ↔ Polymarket)
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('💰 PREDICTION MARKET ARBITRAGE (Kalshi ↔ Polymarket only)');
console.log('═'.repeat(60));
console.log('\nNote: Cross-venue arb only applies to prediction markets');
console.log('trading the same event on both Kalshi and Polymarket.');

// Scenario 1: Small spread (likely unprofitable)
console.log('\n--- Scenario 1: Small spread (2%) ---');
const arb1 = await oracle.analyzeArbitrage(
  [
    { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.49 },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.51 },
  ],
  20, // $20 gross on 2% spread
  0.5
);

console.log(`  Kalshi BUY  @ 49% → Polymarket SELL @ 51%`);
console.log(`  Gross profit: $${arb1.gross_profit_usd.toFixed(2)}`);
console.log(`  Total fees:   $${arb1.total_fees_usd.toFixed(2)}`);
console.log(`  Net profit:   $${arb1.net_profit_usd.toFixed(2)}`);
console.log(`  Net %:        ${arb1.net_profit_pct.toFixed(2)}%`);
console.log(`  Verdict:      ${arb1.is_profitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}`);

// Scenario 2: Medium spread (borderline)
console.log('\n--- Scenario 2: Medium spread (5%) ---');
const arb2 = await oracle.analyzeArbitrage(
  [
    { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.475 },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.525 },
  ],
  50, // $50 gross on 5% spread
  0.5
);

console.log(`  Kalshi BUY  @ 47.5% → Polymarket SELL @ 52.5%`);
console.log(`  Gross profit: $${arb2.gross_profit_usd.toFixed(2)}`);
console.log(`  Total fees:   $${arb2.total_fees_usd.toFixed(2)}`);
console.log(`  Net profit:   $${arb2.net_profit_usd.toFixed(2)}`);
console.log(`  Net %:        ${arb2.net_profit_pct.toFixed(2)}%`);
console.log(`  Verdict:      ${arb2.is_profitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}`);

// Scenario 3: Wide spread (likely profitable)
console.log('\n--- Scenario 3: Wide spread (10%) ---');
const arb3 = await oracle.analyzeArbitrage(
  [
    { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.45 },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.55 },
  ],
  100, // $100 gross on 10% spread
  0.5
);

console.log(`  Kalshi BUY  @ 45% → Polymarket SELL @ 55%`);
console.log(`  Gross profit: $${arb3.gross_profit_usd.toFixed(2)}`);
console.log(`  Total fees:   $${arb3.total_fees_usd.toFixed(2)}`);
console.log(`  Net profit:   $${arb3.net_profit_usd.toFixed(2)}`);
console.log(`  Net %:        ${arb3.net_profit_pct.toFixed(2)}%`);
console.log(`  Verdict:      ${arb3.is_profitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}`);

// Scenario 4: Edge odds (lower Kalshi fees)
console.log('\n--- Scenario 4: Edge odds with 5% spread ---');
const arb4 = await oracle.analyzeArbitrage(
  [
    { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.05 },
    { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.10 },
  ],
  50, // $50 gross
  0.5
);

console.log(`  Kalshi BUY  @ 5% → Polymarket SELL @ 10%`);
console.log(`  Gross profit: $${arb4.gross_profit_usd.toFixed(2)}`);
console.log(`  Total fees:   $${arb4.total_fees_usd.toFixed(2)}`);
console.log(`  Net profit:   $${arb4.net_profit_usd.toFixed(2)}`);
console.log(`  Net %:        ${arb4.net_profit_pct.toFixed(2)}%`);
console.log(`  Verdict:      ${arb4.is_profitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}`);
console.log(`  Note: Lower Kalshi fees at edge odds!`);

// ═══════════════════════════════════════════════════════════════
// 4. FEE SCHEDULES
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('📋 FEE SCHEDULES');
console.log('═'.repeat(60));

const schedules = oracle.getAllSchedules();
for (const schedule of schedules) {
  console.log(`\n${schedule.venue}:`);
  console.log(`  Maker: ${schedule.maker_fee_bps} bps (${(schedule.maker_fee_bps / 100).toFixed(3)}%)`);
  console.log(`  Taker: ${schedule.taker_fee_bps} bps (${(schedule.taker_fee_bps / 100).toFixed(3)}%)`);
  if (schedule.gas_estimate) {
    console.log(`  Gas:   ~$${schedule.gas_estimate.avg_cost_usd} (${schedule.gas_estimate.chain})`);
  }
  console.log(`  Source: ${schedule.source_url}`);
}

console.log('\n' + '═'.repeat(60));
console.log('✅ Demo complete!');
console.log('═'.repeat(60) + '\n');
