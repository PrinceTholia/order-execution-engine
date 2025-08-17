/**
 * Unit Tests for DEX Router Service
 * 
 * Tests the core routing logic independently from external dependencies
 * by mocking internal methods and verifying route selection algorithms.
 */

import { DEXRouterService } from '../../src/services/dex-router/dex-router.service';
import { DEXProvider } from '../../src/types/order.types';

describe('DEXRouterService', () => {
  let dexRouterService: DEXRouterService;

  beforeEach(() => {
    // Create fresh instance for each test to ensure isolation
    dexRouterService = new DEXRouterService();
  });

  afterEach(() => {
    // Restore all mocks after each test
    jest.restoreAllMocks();
  });

  describe('findBestRoute', () => {
    it('should select Meteora for buy orders when it offers lower price', async () => {
      // 💡 Beginner Tip: We mock private methods to control their return values
      jest.spyOn(dexRouterService as any, 'getRaydiumQuote').mockResolvedValue({
        provider: DEXProvider.RAYDIUM,
        price: 100.50, // Higher price
        liquidity: 150000,
        estimatedGas: 5000,
        confidence: 0.98,
        timestamp: new Date()
      });

      jest.spyOn(dexRouterService as any, 'getMeteraQuote').mockResolvedValue({
        provider: DEXProvider.METEORA,
        price: 98.75, // Lower price - better for buy orders
        liquidity: 120000,
        estimatedGas: 4500,
        confidence: 0.97,
        timestamp: new Date()
      });

      const result = await dexRouterService.findBestRoute('SOL', 'USDC', 10, 'buy');

      // 🏗️ Architecture Note: For buy orders, lower price is better
      expect(result.bestRoute.provider).toBe(DEXProvider.METEORA);
      expect(result.bestRoute.price).toBe(98.75);
      expect(result.alternatives).toHaveLength(1);
      expect(result.alternatives[0].provider).toBe(DEXProvider.RAYDIUM);
      expect(result.totalRoutes).toBe(2);
    });

    it('should select Raydium for sell orders when it offers higher price', async () => {
      jest.spyOn(dexRouterService as any, 'getRaydiumQuote').mockResolvedValue({
        provider: DEXProvider.RAYDIUM,
        price: 142.80, // Higher price - better for sell orders
        liquidity: 200000,
        estimatedGas: 5000,
        confidence: 0.99,
        timestamp: new Date()
      });

      jest.spyOn(dexRouterService as any, 'getMeteraQuote').mockResolvedValue({
        provider: DEXProvider.METEORA,
        price: 141.95, // Lower price
        liquidity: 180000,
        estimatedGas: 4500,
        confidence: 0.98,
        timestamp: new Date()
      });

      const result = await dexRouterService.findBestRoute('SOL', 'USDC', 5, 'sell');

      // For sell orders, higher price is better
      expect(result.bestRoute.provider).toBe(DEXProvider.RAYDIUM);
      expect(result.bestRoute.price).toBe(142.80);
      expect(result.routingTime).toBeGreaterThan(0);
    });

    it('should handle equal prices correctly', async () => {
      const samePrice = 100.00;

      jest.spyOn(dexRouterService as any, 'getRaydiumQuote').mockResolvedValue({
        provider: DEXProvider.RAYDIUM,
        price: samePrice,
        liquidity: 100000,
        estimatedGas: 5000,
        confidence: 0.98,
        timestamp: new Date()
      });

      jest.spyOn(dexRouterService as any, 'getMeteraQuote').mockResolvedValue({
        provider: DEXProvider.METEORA,
        price: samePrice,
        liquidity: 100000,
        estimatedGas: 4500,
        confidence: 0.98,
        timestamp: new Date()
      });

      const result = await dexRouterService.findBestRoute('SOL', 'USDC', 1, 'buy');

      // Should select one of them (implementation chooses first in array)
      expect([DEXProvider.RAYDIUM, DEXProvider.METEORA]).toContain(result.bestRoute.provider);
      expect(result.bestRoute.price).toBe(samePrice);
    });
  });

  describe('executeOrder', () => {
    it('should simulate successful order execution', async () => {
      const mockOrder = {
        id: 'test-order-123' as any,
        userId: 'user-456' as any,
        type: 'market' as any,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 10,
        side: 'buy' as const,
        status: 'pending' as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockRoute = {
        provider: DEXProvider.RAYDIUM,
        price: 142.50,
        liquidity: 150000,
        estimatedGas: 5000,
        confidence: 0.98,
        timestamp: new Date()
      };

      const result = await dexRouterService.executeOrder(mockOrder, mockRoute);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('test-order-123');
      expect(result.executionPrice).toBeCloseTo(142.50, 1); // Allow for slippage
      expect(result.transactionHash).toBeDefined();
      expect(result.transactionHash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/); // Base58 format
    });
  });

  describe('getCurrentPrices', () => {
    it('should return prices for all supported token pairs', () => {
      const prices = dexRouterService.getCurrentPrices();

      expect(prices).toHaveProperty('SOL/USDC');
      expect(prices).toHaveProperty('SOL/USDT');
      expect(typeof prices['SOL/USDC']).toBe('number');
      expect(prices['SOL/USDC']).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should return health status for both DEXes', async () => {
      const health = await dexRouterService.healthCheck();

      expect(health).toHaveProperty('raydium');
      expect(health).toHaveProperty('meteora');
      expect(typeof health.raydium).toBe('boolean');
      expect(typeof health.meteora).toBe('boolean');
    });
  });
});
