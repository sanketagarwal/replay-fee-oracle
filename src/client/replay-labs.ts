/**
 * Replay Labs API Client
 * 
 * Fetches live orderbook data for accurate spread/slippage calculation.
 */

import type { Venue, OrderbookSnapshot, OrderbookLevel } from '../types';

const DEFAULT_BASE_URL = 'https://replay-lab-delta.preview.recall.network';

export interface ReplayLabsConfig {
  baseUrl?: string;
  apiKey: string;
}

export interface KalshiOrderbookResponse {
  orderbook: {
    yes: [number, number][];        // [price_cents, quantity]
    yes_dollars: [string, number][];
    no: [number, number][];
    no_dollars: [string, number][];
  };
}

export interface PolymarketOrderbookResponse {
  market: string;
  asset_id: string;
  timestamp: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
}

export class ReplayLabsClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ReplayLabsConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.apiKey = config.apiKey;
  }

  private async fetch<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Replay Labs API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get Kalshi orderbook and convert to normalized format
   */
  async getKalshiOrderbook(ticker: string): Promise<OrderbookSnapshot> {
    const response = await this.fetch<KalshiOrderbookResponse>(
      `/api/kalshi/markets/${ticker}/orderbook`
    );

    return this.parseKalshiOrderbook(ticker, response);
  }

  /**
   * Get Polymarket orderbook and convert to normalized format
   */
  async getPolymarketOrderbook(tokenId: string): Promise<OrderbookSnapshot> {
    const response = await this.fetch<PolymarketOrderbookResponse>(
      `/api/polymarket/clob/book?token_id=${encodeURIComponent(tokenId)}`
    );

    return this.parsePolymarketOrderbook(tokenId, response);
  }

  /**
   * Get orderbook for any supported venue
   */
  async getOrderbook(venue: Venue, marketId: string): Promise<OrderbookSnapshot> {
    switch (venue) {
      case 'KALSHI':
        return this.getKalshiOrderbook(marketId);
      case 'POLYMARKET':
        return this.getPolymarketOrderbook(marketId);
      default:
        throw new Error(`Orderbook not supported for venue: ${venue}`);
    }
  }

  /**
   * Parse Kalshi orderbook response
   * 
   * Kalshi uses cents (0-100) for prices, we convert to dollars (0-1)
   */
  private parseKalshiOrderbook(ticker: string, response: KalshiOrderbookResponse): OrderbookSnapshot {
    const { orderbook } = response;

    // Convert yes side to normalized levels
    // In Kalshi: yes_dollars is [["0.38", 445957], ...] = price, quantity
    const bids: OrderbookLevel[] = orderbook.yes_dollars
      .map(([priceStr, qty]) => ({
        price: parseFloat(priceStr),
        size: qty,
        side: 'BID' as const,
      }))
      .sort((a, b) => b.price - a.price); // Highest bid first

    // For asks, we use the no side inverted (1 - no_price = yes_ask)
    // Or we can infer from the spread
    const asks: OrderbookLevel[] = orderbook.no_dollars
      .map(([priceStr, qty]) => ({
        price: 1 - parseFloat(priceStr), // Convert no price to yes ask
        size: qty,
        side: 'ASK' as const,
      }))
      .sort((a, b) => a.price - b.price); // Lowest ask first

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

    // Calculate depth in USD (price * quantity for each level)
    const bidDepthUsd = bids.reduce((sum, l) => sum + l.price * l.size, 0);
    const askDepthUsd = asks.reduce((sum, l) => sum + l.price * l.size, 0);

    return {
      venue: 'KALSHI',
      market_id: ticker,
      timestamp: new Date().toISOString(),
      best_bid: bestBid,
      best_ask: bestAsk,
      mid_price: midPrice,
      spread,
      spread_bps: spreadBps,
      bid_depth_usd: bidDepthUsd,
      ask_depth_usd: askDepthUsd,
      levels: [...bids, ...asks],
    };
  }

  /**
   * Parse Polymarket orderbook response
   * 
   * Polymarket uses 0-1 prices directly
   */
  private parsePolymarketOrderbook(tokenId: string, response: PolymarketOrderbookResponse): OrderbookSnapshot {
    const bids: OrderbookLevel[] = response.bids
      .map(b => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
        side: 'BID' as const,
      }))
      .sort((a, b) => b.price - a.price);

    const asks: OrderbookLevel[] = response.asks
      .map(a => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
        side: 'ASK' as const,
      }))
      .sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

    // Depth in USD (assuming each share = $1 at resolution)
    const bidDepthUsd = bids.reduce((sum, l) => sum + l.price * l.size, 0);
    const askDepthUsd = asks.reduce((sum, l) => sum + l.price * l.size, 0);

    return {
      venue: 'POLYMARKET',
      market_id: tokenId,
      timestamp: response.timestamp,
      best_bid: bestBid,
      best_ask: bestAsk,
      mid_price: midPrice,
      spread,
      spread_bps: spreadBps,
      bid_depth_usd: bidDepthUsd,
      ask_depth_usd: askDepthUsd,
      levels: [...bids, ...asks],
    };
  }
}

// Singleton instance
let clientInstance: ReplayLabsClient | null = null;

export function getReplayLabsClient(config?: ReplayLabsConfig): ReplayLabsClient {
  if (!clientInstance && config) {
    clientInstance = new ReplayLabsClient(config);
  }
  if (!clientInstance) {
    throw new Error('ReplayLabsClient not initialized. Call with config first.');
  }
  return clientInstance;
}

export function initReplayLabsClient(config: ReplayLabsConfig): ReplayLabsClient {
  clientInstance = new ReplayLabsClient(config);
  return clientInstance;
}
