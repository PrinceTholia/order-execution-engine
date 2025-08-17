/**
 * Health Check Controller
 * 
 * Provides comprehensive system health monitoring endpoints for 
 * deployment environments, load balancers, and debugging.
 * Includes basic health checks and detailed service status monitoring.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from "../services/database/database.service";
import { DEXRouterService } from '../services/dex-router/dex-router.service';
import { OrderQueueService } from '../services/order-queue/queue.service';
import { WebSocketService } from '../services/websocket/websocket.service';

// 💡 Beginner Tip: Interface for comprehensive health response
interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  services: {
    database: boolean;
    redis: boolean;
    dexRouter: boolean;
    queue: boolean;
    websocket: boolean;
  };
  stats?: {
    queueStats?: any;
    connectionStats?: any;
  };
}

// Response interface for basic health check
interface BasicHealthResponse {
  status: string;
  timestamp: string;
}

// Response interface for current prices
interface PricesResponse {
  timestamp: string;
  prices: Record<string, number>;
}

/**
 * Register Health Check Routes
 * 
 * This function registers all health-related monitoring endpoints.
 * Used by load balancers, monitoring systems, and for debugging.
 */
export async function registerHealthRoutes(
  fastify: FastifyInstance,
  services: {
    database: DatabaseService;
    dexRouter: DEXRouterService;
    orderQueue: OrderQueueService;
    websocket: WebSocketService;
  }
): Promise<void> {
  
  /**
   * GET /health
   * 
   * Basic health check endpoint for load balancer health checks.
   * Returns simple OK status without checking dependencies.
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response: BasicHealthResponse = {
        status: 'ok',
        timestamp: new Date().toISOString()
      };

      return reply.status(200).send(response);

    } catch (error) {
      console.error('🚨 Basic health check failed:', error);
      return reply.status(503).send({
        status: 'down',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  });

  /**
   * GET /health/detailed
   * 
   * Comprehensive health check including all service dependencies.
   * Essential for monitoring system health and debugging issues.
   */
  fastify.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 🏗️ Architecture Note: Check if all required services are available
      if (!services.database || !services.dexRouter || !services.orderQueue || !services.websocket) {
        return reply.status(503).send({
          status: 'down',
          timestamp: new Date().toISOString(),
          error: 'Required services not properly initialized'
        });
      }

      // Check all services in parallel for faster response
      const [
        databaseHealthy,
        dexHealth,
        queueStats,
        connectionStats
      ] = await Promise.all([
        services.database.healthCheck().catch(() => false),
        services.dexRouter.healthCheck().catch(() => ({ raydium: false, meteora: false })),
        services.orderQueue.getQueueStats().catch(() => null),
        // Remove .catch() since this is synchronous
        Promise.resolve(services.websocket.getConnectionStats())
      ]);


      // 💡 Beginner Tip: Determine overall system health based on critical services
      const criticalServicesHealthy = databaseHealthy && 
                                     dexHealth.raydium && 
                                     dexHealth.meteora;

      const redisHealthy = queueStats !== null; // If we got queue stats, Redis is working

      const response: HealthResponse = {
        status: criticalServicesHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          database: databaseHealthy,
          redis: redisHealthy,
          dexRouter: dexHealth.raydium && dexHealth.meteora,
          queue: queueStats !== null,
          websocket: connectionStats !== null
        },
        stats: {
          queueStats,
          connectionStats
        }
      };

      // Return appropriate status code based on health
      const statusCode = criticalServicesHealthy ? 200 : 503;
      return reply.status(statusCode).send(response);

    } catch (error) {
      console.error('🚨 Detailed health check failed:', error);
      return reply.status(503).send({
        status: 'down',
        timestamp: new Date().toISOString(),
        error: 'Health check system failure'
      });
    }
  });

  /**
   * GET /health/prices
   * 
   * Returns current mock DEX prices for all supported token pairs.
   * Useful for debugging routing decisions and price comparisons.
   */
  fastify.get('/health/prices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 🏗️ Architecture Note: Verify DEX router service is available
      if (!services.dexRouter) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'DEX router service not available'
        });
      }

      const prices = services.dexRouter.getCurrentPrices();

      const response: PricesResponse = {
        timestamp: new Date().toISOString(),
        prices
      };

      return reply.status(200).send(response);

    } catch (error) {
      console.error('🚨 Failed to get current prices:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve current market prices'
      });
    }
  });

  /**
   * GET /health/queue
   * 
   * Returns detailed queue statistics for monitoring processing capacity.
   * Shows current queue load and processing metrics.
   */
  fastify.get('/health/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!services.orderQueue) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'Order queue service not available'
        });
      }

      const queueStats = await services.orderQueue.getQueueStats();

      return reply.status(200).send({
        timestamp: new Date().toISOString(),
        queue: queueStats,
        capacity: {
          maxConcurrent: 10,
          maxPerMinute: 100,
          currentLoad: queueStats?.active || 0
        }
      });

    } catch (error) {
      console.error('🚨 Failed to get queue stats:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve queue statistics'
      });
    }
  });

  /**
   * GET /health/websocket
   * 
   * Returns WebSocket connection statistics for monitoring real-time connectivity.
   * Shows active connections and user engagement metrics.
   */
  fastify.get('/health/websocket', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!services.websocket) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'WebSocket service not available'
        });
      }

      const connectionStats = services.websocket.getConnectionStats();

      return reply.status(200).send({
        timestamp: new Date().toISOString(),
        websocket: connectionStats,
        endpoint: 'ws://localhost:3000/ws?userId=<userId>'
      });

    } catch (error) {
      console.error('🚨 Failed to get WebSocket stats:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve WebSocket statistics'
      });
    }
  });

  /**
   * GET /health/dex
   * 
   * Returns DEX router health and routing capabilities.
   * Shows connectivity to Raydium and Meteora DEXes.
   */
  fastify.get('/health/dex', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!services.dexRouter) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'DEX router service not available'
        });
      }

      const dexHealth = await services.dexRouter.healthCheck();

      return reply.status(200).send({
        timestamp: new Date().toISOString(),
        dexes: dexHealth,
        routing: {
          supportedPairs: ['SOL/USDC', 'SOL/USDT', 'BONK/USDC', 'RAY/USDC', 'ORCA/USDC'],
          providers: ['raydium', 'meteora']
        }
      });

    } catch (error) {
      console.error('🚨 Failed to get DEX health:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve DEX health status'
      });
    }
  });

  console.log('🏥 Health check routes registered successfully');
}
