/**
 * Aerodrome Fee Calculator
 * 
 * DEX with pool-specific swap fees plus gas costs.
 */

import { BaseFeeCalculator } from './interface';
import type { FeeEstimate, FeeEstimateParams, FeeSchedule } from '../types';
import aerodromeSchedule from '../schedules/aerodrome.json';

type PoolType = 'concentrated' | 'stable' | 'volatile';
type TickSpacing = 1 | 10 | 100 | 200;

interface AerodromePoolContext {
  pool_type: PoolType;
  tick_spacing?: TickSpacing;  // For concentrated liquidity pools
  price_impact_pct?: number;   // From quoter
}

export class AerodromeFeeCalculator extends BaseFeeCalculator {
  venue = 'AERODROME' as const;
  
  private schedule: typeof aerodromeSchedule;
  
  constructor() {
    super();
    this.schedule = aerodromeSchedule;
  }
  
  /**
   * Get fee rate based on pool type and tick spacing
   */
  private getPoolFeeRate(poolType: PoolType, tickSpacing?: TickSpacing): number {
    const poolFees = this.schedule.pool_fees;
    
    if (poolType === 'concentrated' && tickSpacing) {
      const clFees = poolFees.concentrated_liquidity;
      switch (tickSpacing) {
        case 1:
          return clFees.tick_spacing_1.fee_bps / 10000;
        case 10:
          return clFees.tick_spacing_10.fee_bps / 10000;
        case 100:
          return clFees.tick_spacing_100.fee_bps / 10000;
        case 200:
          return clFees.tick_spacing_200.fee_bps / 10000;
        default:
          return clFees.tick_spacing_100.fee_bps / 10000; // Default to 30bp
      }
    }
    
    if (poolType === 'stable') {
      return poolFees.stable_pools.fee_bps / 10000;
    }
    
    // Default to volatile pool fee
    return poolFees.volatile_pools.fee_bps / 10000;
  }
  
  /**
   * Estimate gas cost on Base L2
   */
  private estimateGasCost(): number {
    const gasEstimate = this.schedule.gas_estimate;
    // Gas cost = gas units * gas price (in ETH) * ETH price
    // For simplicity, use pre-computed estimate
    return gasEstimate.avg_cost_usd;
  }
  
  /**
   * Calculate Aerodrome fee for a swap
   * 
   * Fees depend on:
   * 1. Pool type (concentrated, stable, volatile)
   * 2. Tick spacing (for CL pools)
   * 3. Gas cost on Base L2
   * 4. Slippage/price impact (from quoter)
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const sizeUsd = params.size_usd;
    
    // Default to volatile pool if no context
    // In production, would query pool metadata from pool_address
    const poolType: PoolType = 'volatile';
    
    // Get pool fee rate
    const poolFeeRate = this.getPoolFeeRate(poolType);
    const exchangeFee = sizeUsd * poolFeeRate;
    
    // Gas cost
    const gasFee = this.estimateGasCost();
    
    // Build assumptions
    const assumptions: string[] = [
      `Pool type: ${poolType} (default, use estimateWithPoolContext for specific pools)`,
    ];
    
    assumptions.push(`Pool fee: ${(poolFeeRate * 100).toFixed(2)}%`);
    assumptions.push(`Gas estimate: $${gasFee.toFixed(4)} (Base L2)`);
    
    // Note about slippage
    assumptions.push(`Note: Use /api/aerodrome/quote for accurate slippage estimate`);
    
    return this.createEstimate(
      params,
      {
        exchange_fee: exchangeFee,
        gas_fee: gasFee,
      },
      'medium', // Medium confidence without pool-specific context
      assumptions
    );
  }
  
  /**
   * Estimate with pool context (more accurate)
   */
  async estimateWithPoolContext(
    params: FeeEstimateParams,
    poolContext: AerodromePoolContext
  ): Promise<FeeEstimate> {
    const sizeUsd = params.size_usd;
    
    // Get pool fee rate from context
    const poolFeeRate = this.getPoolFeeRate(poolContext.pool_type, poolContext.tick_spacing);
    const exchangeFee = sizeUsd * poolFeeRate;
    
    // Gas cost
    const gasFee = this.estimateGasCost();
    
    // Slippage cost (if provided from quoter)
    const slippageCost = poolContext.price_impact_pct 
      ? sizeUsd * (poolContext.price_impact_pct / 100)
      : 0;
    
    // Build assumptions
    const assumptions: string[] = [
      `Pool type: ${poolContext.pool_type}`,
    ];
    
    if (poolContext.tick_spacing) {
      assumptions.push(`Tick spacing: ${poolContext.tick_spacing}`);
    }
    
    assumptions.push(`Pool fee: ${(poolFeeRate * 100).toFixed(2)}%`);
    assumptions.push(`Gas estimate: $${gasFee.toFixed(4)} (Base L2)`);
    
    if (poolContext.price_impact_pct !== undefined) {
      assumptions.push(`Price impact: ${poolContext.price_impact_pct.toFixed(3)}%`);
    }
    
    return this.createEstimate(
      params,
      {
        exchange_fee: exchangeFee,
        gas_fee: gasFee,
        slippage_estimate: slippageCost || undefined,
      },
      poolContext.price_impact_pct !== undefined ? 'high' : 'medium',
      assumptions
    );
  }
  
  getSchedule(): FeeSchedule {
    return {
      venue: 'AERODROME',
      updated_at: this.schedule.updated_at,
      version: this.schedule.version,
      maker_fee_bps: 0, // DEX doesn't have maker/taker
      taker_fee_bps: this.schedule.pool_fees.volatile_pools.fee_bps,
      pool_fees: {
        concentrated_bps: this.schedule.pool_fees.concentrated_liquidity.tick_spacing_100.fee_bps,
        stable_bps: this.schedule.pool_fees.stable_pools.fee_bps,
        volatile_bps: this.schedule.pool_fees.volatile_pools.fee_bps,
      },
      gas_estimate: this.schedule.gas_estimate,
      source: this.schedule.source,
      source_url: this.schedule.source_url,
      disclaimer: this.schedule.disclaimer,
    };
  }
}
