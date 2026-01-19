/**
 * Hyperliquid Fee Calculator
 * 
 * Volume-tiered maker/taker fees with staking discounts.
 */

import { BaseFeeCalculator } from './interface';
import type { FeeEstimate, FeeEstimateParams, FeeSchedule, VolumeTier } from '../types';
import hyperliquidSchedule from '../schedules/hyperliquid.json';

interface HyperliquidUserContext {
  volume_14d_usd?: number;
  hype_staked?: number;
}

export class HyperliquidFeeCalculator extends BaseFeeCalculator {
  venue = 'HYPERLIQUID' as const;
  
  private schedule: typeof hyperliquidSchedule;
  private userContext?: HyperliquidUserContext;
  
  constructor(userContext?: HyperliquidUserContext) {
    super();
    this.schedule = hyperliquidSchedule;
    this.userContext = userContext;
  }
  
  /**
   * Set user context for personalized fee calculation
   */
  setUserContext(context: HyperliquidUserContext): void {
    this.userContext = context;
  }
  
  /**
   * Get fee tier based on 14-day trading volume
   */
  private getVolumeTier(volume14d: number): typeof hyperliquidSchedule.volume_tiers[0] {
    const tiers = this.schedule.volume_tiers;
    
    // Find highest matching tier
    for (let i = tiers.length - 1; i >= 0; i--) {
      const tier = tiers[i];
      if (tier && volume14d >= tier.min_volume_14d_usd) {
        return tier;
      }
    }
    
    // Default to tier 1
    return tiers[0]!;
  }
  
  /**
   * Get staking discount percentage
   */
  private getStakingDiscount(hypeStaked: number): number {
    const stakingTiers = this.schedule.staking_discounts.tiers;
    
    // Find highest matching tier
    for (let i = stakingTiers.length - 1; i >= 0; i--) {
      const tier = stakingTiers[i];
      if (tier && hypeStaked >= tier.min_hype_staked) {
        return tier.discount_pct / 100;
      }
    }
    
    return 0;
  }
  
  /**
   * Calculate Hyperliquid fee for a trade
   * 
   * Fees depend on:
   * 1. Order type (maker vs taker)
   * 2. 14-day trading volume (tier)
   * 3. HYPE staking amount (discount)
   */
  async estimate(params: FeeEstimateParams): Promise<FeeEstimate> {
    const sizeUsd = params.size_usd;
    const isMarketOrder = params.order_type === 'MARKET';
    
    // Get user's volume tier
    const volume14d = this.userContext?.volume_14d_usd ?? 0;
    const tier = this.getVolumeTier(volume14d);
    
    // Get base fee rate from tier
    const baseFeeRateBps = isMarketOrder ? tier.taker_fee_bps : tier.maker_fee_bps;
    
    // Apply staking discount
    const hypeStaked = this.userContext?.hype_staked ?? 0;
    const stakingDiscount = this.getStakingDiscount(hypeStaked);
    const effectiveFeeRateBps = baseFeeRateBps * (1 - stakingDiscount);
    
    const feeRate = effectiveFeeRateBps / 10000;
    const exchangeFee = sizeUsd * feeRate;
    
    // Build assumptions
    const assumptions: string[] = [
      `${isMarketOrder ? 'Taker' : 'Maker'} order`,
      `Volume tier ${tier.tier}: $${(volume14d / 1000000).toFixed(1)}M 14d volume`,
      `Base fee: ${baseFeeRateBps.toFixed(2)} bps`,
    ];
    
    if (stakingDiscount > 0) {
      assumptions.push(`Staking discount: ${(stakingDiscount * 100).toFixed(0)}% (${hypeStaked.toLocaleString()} HYPE)`);
    }
    
    assumptions.push(`Effective fee: ${effectiveFeeRateBps.toFixed(2)} bps (${(feeRate * 100).toFixed(4)}%)`);
    
    // Confidence based on whether we have user context
    const confidence = this.userContext ? 'high' : 'medium';
    if (!this.userContext) {
      assumptions.push(`Note: Using default tier (no user context provided)`);
    }
    
    return this.createEstimate(
      params,
      {
        exchange_fee: exchangeFee,
      },
      confidence,
      assumptions
    );
  }
  
  getSchedule(): FeeSchedule {
    const tiers: VolumeTier[] = this.schedule.volume_tiers.map(t => ({
      min_volume_usd: t.min_volume_14d_usd,
      max_volume_usd: t.max_volume_14d_usd ?? undefined,
      maker_fee_bps: t.maker_fee_bps,
      taker_fee_bps: t.taker_fee_bps,
    }));
    
    return {
      venue: 'HYPERLIQUID',
      updated_at: this.schedule.updated_at,
      version: this.schedule.version,
      maker_fee_bps: this.schedule.base_fees.maker_fee_bps,
      taker_fee_bps: this.schedule.base_fees.taker_fee_bps,
      tiers,
      source: this.schedule.source,
      source_url: this.schedule.source_url,
      disclaimer: this.schedule.disclaimer,
    };
  }
}
