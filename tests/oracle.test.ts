import { describe, it, expect, beforeEach } from 'vitest';
import { 
  FeeOracle, 
  getOracle, 
  createOracle,
  KalshiFeeCalculator,
  PolymarketFeeCalculator,
  HyperliquidFeeCalculator,
  AerodromeFeeCalculator,
  canArbitrage,
  VENUE_INFO,
  PREDICTION_VENUES,
} from '../src';

describe('FeeOracle', () => {
  let oracle: FeeOracle;
  
  beforeEach(() => {
    oracle = createOracle();
  });
  
  describe('getSupportedVenues', () => {
    it('should return all supported venues', () => {
      const venues = oracle.getSupportedVenues();
      expect(venues).toContain('KALSHI');
      expect(venues).toContain('POLYMARKET');
      expect(venues).toContain('HYPERLIQUID');
      expect(venues).toContain('AERODROME');
    });
  });
  
  describe('estimate', () => {
    it('should estimate Kalshi fees', async () => {
      const estimate = await oracle.estimate({
        venue: 'KALSHI',
        size_usd: 1000,
        price: 0.5,
        order_type: 'MARKET',
      });
      
      expect(estimate.venue).toBe('KALSHI');
      expect(estimate.size_usd).toBe(1000);
      expect(estimate.total_fee_usd).toBeGreaterThan(0);
      expect(estimate.fee_pct).toBeGreaterThan(0);
      expect(estimate.confidence).toBeDefined();
      expect(estimate.assumptions.length).toBeGreaterThan(0);
    });
    
    it('should estimate Polymarket fees', async () => {
      const estimate = await oracle.estimate({
        venue: 'POLYMARKET',
        size_usd: 1000,
        order_type: 'MARKET',
      });
      
      expect(estimate.venue).toBe('POLYMARKET');
      expect(estimate.total_fee_usd).toBeGreaterThan(0);
      // Polymarket has very low fees
      expect(estimate.fee_pct).toBeLessThan(0.1);
    });
    
    it('should throw for unknown venue', async () => {
      await expect(oracle.estimate({
        venue: 'UNKNOWN' as any,
        size_usd: 1000,
      })).rejects.toThrow('No calculator registered for venue');
    });
  });
  
  describe('getSchedule', () => {
    it('should return schedule for Kalshi', () => {
      const schedule = oracle.getSchedule('KALSHI');
      expect(schedule).toBeDefined();
      expect(schedule?.venue).toBe('KALSHI');
      expect(schedule?.source_url).toBeDefined();
    });
    
    it('should return undefined for unknown venue', () => {
      const schedule = oracle.getSchedule('UNKNOWN' as any);
      expect(schedule).toBeUndefined();
    });
  });
  
  describe('analyzeArbitrage', () => {
    it('should analyze cross-venue arbitrage', async () => {
      const arb = await oracle.analyzeArbitrage(
        [
          { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.60 },
          { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.65 },
        ],
        50, // $50 gross profit
        0.5  // 0.5% threshold
      );
      
      expect(arb.gross_profit_usd).toBe(50);
      expect(arb.total_fees_usd).toBeGreaterThan(0);
      expect(arb.net_profit_usd).toBeLessThan(50);
      expect(arb.leg_estimates).toHaveLength(2);
      expect(arb.is_profitable).toBeDefined();
    });
  });
  
  describe('compareVenues', () => {
    it('should compare fees across all venues', async () => {
      const estimates = await oracle.compareVenues(1000, { 
        price: 0.5, 
        order_type: 'MARKET' 
      });
      
      expect(estimates).toHaveLength(4);
      estimates.forEach(e => {
        expect(e.size_usd).toBe(1000);
        expect(e.total_fee_usd).toBeGreaterThanOrEqual(0);
      });
    });
  });
});

describe('KalshiFeeCalculator', () => {
  let calculator: KalshiFeeCalculator;
  
  beforeEach(() => {
    calculator = new KalshiFeeCalculator();
  });
  
  it('should have higher fees at 50% probability', async () => {
    const at50 = await calculator.estimate({
      venue: 'KALSHI',
      size_usd: 1000,
      price: 0.50,
      order_type: 'MARKET',
    });
    
    const at10 = await calculator.estimate({
      venue: 'KALSHI',
      size_usd: 1000,
      price: 0.10,
      order_type: 'MARKET',
    });
    
    // Fee at 50% should be higher than at 10% (probability scaling)
    expect(at50.total_fee_usd).toBeGreaterThan(at10.total_fee_usd);
  });
  
  it('should have lower fees for maker orders', async () => {
    const taker = await calculator.estimate({
      venue: 'KALSHI',
      size_usd: 1000,
      price: 0.50,
      order_type: 'MARKET',
    });
    
    const maker = await calculator.estimate({
      venue: 'KALSHI',
      size_usd: 1000,
      price: 0.50,
      order_type: 'LIMIT',
    });
    
    expect(maker.total_fee_usd).toBeLessThan(taker.total_fee_usd);
  });
});

describe('PolymarketFeeCalculator', () => {
  let calculator: PolymarketFeeCalculator;
  
  beforeEach(() => {
    calculator = new PolymarketFeeCalculator();
  });
  
  it('should have zero maker fee', async () => {
    const maker = await calculator.estimate({
      venue: 'POLYMARKET',
      size_usd: 1000,
      order_type: 'LIMIT',
    });
    
    // Only gas fee, no exchange fee
    expect(maker.breakdown.exchange_fee).toBe(0.0001); // min fee
  });
  
  it('should have 1bp taker fee', async () => {
    const taker = await calculator.estimate({
      venue: 'POLYMARKET',
      size_usd: 10000,
      order_type: 'MARKET',
    });
    
    // 0.01% of $10000 = $1
    expect(taker.breakdown.exchange_fee).toBeCloseTo(1, 2);
  });
  
  it('should include gas estimate', async () => {
    const estimate = await calculator.estimate({
      venue: 'POLYMARKET',
      size_usd: 1000,
      order_type: 'MARKET',
    });
    
    expect(estimate.breakdown.gas_fee).toBeDefined();
    expect(estimate.breakdown.gas_fee).toBeGreaterThan(0);
  });
});

describe('HyperliquidFeeCalculator', () => {
  it('should use base tier for new users', async () => {
    const calculator = new HyperliquidFeeCalculator();
    
    const estimate = await calculator.estimate({
      venue: 'HYPERLIQUID',
      size_usd: 10000,
      order_type: 'MARKET',
    });
    
    // Base taker fee: 3.5 bps = 0.035%
    // $10000 * 0.00035 = $3.50
    expect(estimate.breakdown.exchange_fee).toBeCloseTo(3.5, 1);
    expect(estimate.confidence).toBe('medium'); // No user context
  });
  
  it('should apply volume tier discount', async () => {
    const calculator = new HyperliquidFeeCalculator({
      volume_14d_usd: 10_000_000, // $10M volume = tier 3
    });
    
    const estimate = await calculator.estimate({
      venue: 'HYPERLIQUID',
      size_usd: 10000,
      order_type: 'MARKET',
    });
    
    // Tier 3 taker fee: 2.5 bps
    // $10000 * 0.00025 = $2.50
    expect(estimate.breakdown.exchange_fee).toBeCloseTo(2.5, 1);
    expect(estimate.confidence).toBe('high');
  });
  
  it('should apply staking discount', async () => {
    const calculator = new HyperliquidFeeCalculator({
      volume_14d_usd: 0,
      hype_staked: 10000, // 10% discount
    });
    
    const estimate = await calculator.estimate({
      venue: 'HYPERLIQUID',
      size_usd: 10000,
      order_type: 'MARKET',
    });
    
    // Base: 3.5 bps, with 10% discount: 3.15 bps
    // $10000 * 0.000315 = $3.15
    expect(estimate.breakdown.exchange_fee).toBeCloseTo(3.15, 1);
  });
});

describe('AerodromeFeeCalculator', () => {
  let calculator: AerodromeFeeCalculator;
  
  beforeEach(() => {
    calculator = new AerodromeFeeCalculator();
  });
  
  it('should use volatile pool fee by default', async () => {
    const estimate = await calculator.estimate({
      venue: 'AERODROME',
      size_usd: 1000,
    });
    
    // Volatile pool: 30 bps = 0.30%
    // $1000 * 0.003 = $3
    expect(estimate.breakdown.exchange_fee).toBeCloseTo(3, 1);
  });
  
  it('should include gas fee', async () => {
    const estimate = await calculator.estimate({
      venue: 'AERODROME',
      size_usd: 1000,
    });
    
    expect(estimate.breakdown.gas_fee).toBeDefined();
    // Base L2 gas is very low
    expect(estimate.breakdown.gas_fee!).toBeLessThan(0.1);
  });
  
  it('should support pool context for accurate fees', async () => {
    const estimate = await calculator.estimateWithPoolContext(
      { venue: 'AERODROME', size_usd: 1000 },
      { pool_type: 'stable', price_impact_pct: 0.1 }
    );
    
    // Stable pool: 4 bps = 0.04%
    // $1000 * 0.0004 = $0.40
    expect(estimate.breakdown.exchange_fee).toBeCloseTo(0.4, 2);
    expect(estimate.breakdown.slippage_estimate).toBeCloseTo(1, 1); // 0.1% of $1000
    expect(estimate.confidence).toBe('high');
  });
});

describe('Singleton', () => {
  it('should return same instance', () => {
    const oracle1 = getOracle();
    const oracle2 = getOracle();
    expect(oracle1).toBe(oracle2);
  });
});

describe('Venue Categories', () => {
  it('should categorize prediction markets correctly', () => {
    expect(VENUE_INFO['KALSHI'].category).toBe('PREDICTION_MARKET');
    expect(VENUE_INFO['POLYMARKET'].category).toBe('PREDICTION_MARKET');
  });
  
  it('should categorize crypto venues correctly', () => {
    expect(VENUE_INFO['HYPERLIQUID'].category).toBe('PERPS');
    expect(VENUE_INFO['AERODROME'].category).toBe('SPOT_DEX');
  });
  
  it('should list prediction venues', () => {
    expect(PREDICTION_VENUES).toContain('KALSHI');
    expect(PREDICTION_VENUES).toContain('POLYMARKET');
    expect(PREDICTION_VENUES).not.toContain('HYPERLIQUID');
    expect(PREDICTION_VENUES).not.toContain('AERODROME');
  });
});

describe('canArbitrage', () => {
  it('should allow arb between prediction markets', () => {
    expect(canArbitrage('KALSHI', 'POLYMARKET')).toBe(true);
    expect(canArbitrage('POLYMARKET', 'KALSHI')).toBe(true);
  });
  
  it('should not allow arb between different asset types', () => {
    expect(canArbitrage('KALSHI', 'HYPERLIQUID')).toBe(false);
    expect(canArbitrage('KALSHI', 'AERODROME')).toBe(false);
    expect(canArbitrage('POLYMARKET', 'HYPERLIQUID')).toBe(false);
    expect(canArbitrage('POLYMARKET', 'AERODROME')).toBe(false);
  });
  
  it('should not allow arb within same venue', () => {
    expect(canArbitrage('KALSHI', 'KALSHI')).toBe(false);
    expect(canArbitrage('POLYMARKET', 'POLYMARKET')).toBe(false);
  });
});

describe('Cross-venue arbitrage validation', () => {
  let oracle: FeeOracle;
  
  beforeEach(() => {
    oracle = createOracle();
  });
  
  it('should throw when trying to arb across different asset types', async () => {
    await expect(oracle.analyzeArbitrage([
      { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.50 },
      { venue: 'HYPERLIQUID', direction: 'SELL', size_usd: 1000 },
    ], 50)).rejects.toThrow('Cross-venue arbitrage not supported');
  });
  
  it('should allow arb between prediction markets', async () => {
    const result = await oracle.analyzeArbitrage([
      { venue: 'KALSHI', direction: 'BUY', size_usd: 1000, price: 0.50 },
      { venue: 'POLYMARKET', direction: 'SELL', size_usd: 1000, price: 0.55 },
    ], 50);
    
    expect(result.legs).toHaveLength(2);
    expect(result.total_fees_usd).toBeGreaterThan(0);
  });
});
