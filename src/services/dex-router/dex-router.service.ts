/**
 * DEX Router Service
 * 
 * Handles price comparison between Raydium and Meteora DEXes.
 * For this assignment, we're using mock implementation with realistic
 * price variations and network delays.
 */

import { 
  DEXRoute, 
  DEXProvider, 
  RoutingResult, 
  Order, 
  ExecutionResult 
} from '../../types/order.types';

// 💡 Beginner Tip: Mock base prices for different token pairs
const MOCK_BASE_PRICES: Record<string, number> = {
  'SOL/USDC': 142.50,
  'SOL/USDT': 142.45,
  'BONK/USDC': 0.0000234,
  'RAY/USDC': 1.85,
  'ORCA/USDC': 3.21
};

export class DEXRouterService {
  
  /**
   * Find Best Route Across DEXes
   * 
   * Compares prices from both Raydium and Meteora to find the best
   * execution venue for the given order.
   */
  async findBestRoute(
    baseToken: string, 
    quoteToken: string, 
    amount: number, 
    side: 'buy' | 'sell'
  ): Promise<RoutingResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Finding best route for ${amount} ${baseToken}/${quoteToken} (${side})`);

    try {
      // Get quotes from both DEXes in parallel
      // 🏗️ Architecture Note: Parallel requests are faster than sequential
      const [raydiumQuote, meteoraQuote] = await Promise.all([
        this.getRaydiumQuote(baseToken, quoteToken, amount, side),
        this.getMeteraQuote(baseToken, quoteToken, amount, side)
      ]);

      const routes = [raydiumQuote, meteoraQuote];
      
      // Find best route based on price
      // For buy orders: lowest price is best
      // For sell orders: highest price is best
      const bestRoute = side === 'buy' 
        ? routes.reduce((best, current) => current.price < best.price ? current : best)
        : routes.reduce((best, current) => current.price > best.price ? current : best);

      const alternatives = routes.filter(route => route.provider !== bestRoute.provider);

      const result: RoutingResult = {
        bestRoute,
        alternatives,
        totalRoutes: routes.length,
        routingTime: Date.now() - startTime
      };

      console.log(`🎯 Best route: ${bestRoute.provider} at $${bestRoute.price} (${result.routingTime}ms)`);
      
      return result;

    } catch (error: any) {
      console.error('❌ Routing failed:', error);
      throw new Error(`Failed to find route: ${error instanceof Error ? error.message : String(error)}`);
    }

  }

  /**
   * Get Quote from Raydium
   * 
   * Simulates fetching a price quote from Raydium DEX.
   * In real implementation, this would call Raydium SDK.
   */
  private async getRaydiumQuote(
    baseToken: string, 
    quoteToken: string, 
    amount: number, 
    side: 'buy' | 'sell'
  ): Promise<DEXRoute> {
    // Simulate network delay (200-400ms)
    await this.sleep(200 + Math.random() * 200);
    
    const pair = `${baseToken}/${quoteToken}`;
    const basePrice = MOCK_BASE_PRICES[pair] || 100; // Default price
    
    // 💡 Beginner Tip: Add realistic price variation (±2%)
    const priceVariation = 0.98 + (Math.random() * 0.04); // 0.98 to 1.02
    const mockPrice = basePrice * priceVariation;
    
    // Simulate different liquidity levels
    const mockLiquidity = 50000 + (Math.random() * 200000); // $50K - $250K
    
    return {
      provider: DEXProvider.RAYDIUM,
      price: mockPrice,
      liquidity: mockLiquidity,
      estimatedGas: 5000, // Mock gas estimate
      confidence: 0.95 + (Math.random() * 0.05), // 95-100% confidence
      timestamp: new Date()
    };
  }

  /**
   * Get Quote from Meteora
   * 
   * Simulates fetching a price quote from Meteora DEX.
   * Meteora typically has slightly different pricing and liquidity.
   */
  private async getMeteraQuote(
    baseToken: string, 
    quoteToken: string, 
    amount: number, 
    side: 'buy' | 'sell'
  ): Promise<DEXRoute> {
    // Simulate network delay (150-350ms)
    await this.sleep(150 + Math.random() * 200);
    
    const pair = `${baseToken}/${quoteToken}`;
    const basePrice = MOCK_BASE_PRICES[pair] || 100;
    
    // Meteora might have slightly different pricing
    const priceVariation = 0.97 + (Math.random() * 0.05); // 0.97 to 1.02
    const mockPrice = basePrice * priceVariation;
    
    // Different liquidity characteristics
    const mockLiquidity = 30000 + (Math.random() * 150000); // $30K - $180K
    
    return {
      provider: DEXProvider.METEORA,
      price: mockPrice,
      liquidity: mockLiquidity,
      estimatedGas: 4500, // Slightly lower gas
      confidence: 0.92 + (Math.random() * 0.08), // 92-100% confidence
      timestamp: new Date()
    };
  }

  /**
   * Execute Order on Selected DEX
   * 
   * Simulates executing the order on the chosen DEX.
   * In real implementation, this would call the DEX SDK.
   */
  async executeOrder(order: Order, route: DEXRoute): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    console.log(`⚡ Executing order ${order.id} on ${route.provider} at $${route.price}`);

    try {
      // Simulate execution time (2-4 seconds)
      const executionDelay = 2000 + (Math.random() * 2000);
      await this.sleep(executionDelay);

      // 🏗️ Architecture Note: Mock a small percentage of failures for realism
      const shouldFail = Math.random() < 0.05; // 5% failure rate
      
      if (shouldFail) {
        throw new Error(`${route.provider} execution failed: Insufficient liquidity`);
      }

      // Simulate small price slippage (0.1-0.3%)
      const slippage = 0.001 + (Math.random() * 0.002); // 0.1% to 0.3%
      const slippageDirection = order.side === 'buy' ? 1 : -1;
      const executionPrice = route.price * (1 + (slippage * slippageDirection));

      // Calculate executed amount (might be slightly less due to slippage)
      const executedAmount = order.amount * (1 - slippage * 0.5);

      const result: ExecutionResult = {
        success: true,
        orderId: order.id,
        executionPrice,
        executedAmount,
        transactionHash: this.generateMockTxHash(),
        gasUsed: route.estimatedGas,
        executionTime: Date.now() - startTime
      };

      console.log(`✅ Order ${order.id} executed: $${executionPrice.toFixed(4)} (${result.executionTime}ms)`);
      
      return result;

    } catch (error) {
      console.error(`❌ Execution failed for order ${order.id}:`, error);
      
      return {
        success: false,
        orderId: order.id,
        executionTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : String(error)
      };

    }
  }

  /**
   * Generate Mock Transaction Hash
   * 
   * Creates a realistic-looking Solana transaction hash for demo purposes.
   */
  private generateMockTxHash(): string {
    // Solana transaction hashes are base58 encoded and ~88 characters long
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let hash = '';
    for (let i = 0; i < 88; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
  }

  /**
   * Sleep Helper Function
   * 
   * Simulates network delays and processing time.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get Current Market Prices
   * 
   * Returns current mock prices for all supported pairs.
   * Useful for debugging and API endpoints.
   */
  getCurrentPrices(): Record<string, number> {
    // Add some time-based variation to make prices feel "live"
    const timeVariation = Math.sin(Date.now() / 10000) * 0.02; // ±2% based on time
    
    const livePrices: Record<string, number> = {};
    for (const [pair, basePrice] of Object.entries(MOCK_BASE_PRICES)) {
      livePrices[pair] = basePrice * (1 + timeVariation + (Math.random() * 0.01 - 0.005));
    }
    
    return livePrices;
  }

  /**
   * Health Check
   * 
   * Verifies that routing service can reach both DEXes.
   */
  async healthCheck(): Promise<{ raydium: boolean; meteora: boolean }> {
    try {
      const [raydiumHealth, meteoraHealth] = await Promise.all([
        this.checkDEXHealth(DEXProvider.RAYDIUM),
        this.checkDEXHealth(DEXProvider.METEORA)
      ]);

      return {
        raydium: raydiumHealth,
        meteora: meteoraHealth
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return { raydium: false, meteora: false };
    }
  }

  /**
   * Check Individual DEX Health
   */
  private async checkDEXHealth(dex: DEXProvider): Promise<boolean> {
    try {
      // Simulate health check call
      await this.sleep(100 + Math.random() * 100);
      
      // Mock 99% uptime
      return Math.random() > 0.01;
    } catch {
      return false;
    }
  }
}
