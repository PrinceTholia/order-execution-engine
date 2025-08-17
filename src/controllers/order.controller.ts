/**
 * Order Controller
 * 
 * Handles HTTP requests for order submission and manages the
 * HTTP → WebSocket upgrade pattern required by the assignment.
 * This is the main entry point for users to submit orders.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { 
  Order, 
  OrderType, 
  OrderStatus, 
  CreateOrderRequest,
  OrderId,
  UserId 
} from '../types/order.types';
import { OrderQueueService } from '../services/order-queue/queue.service';
import { DatabaseService } from '../services/database/database.service';

// 💡 Beginner Tip: This interface defines the structure of incoming requests
interface ExecuteOrderRequestBody {
  userId: string;
  baseToken: string;
  quoteToken: string;
  amount: number;
  side: 'buy' | 'sell';
}

// Response interface for the order submission
interface ExecuteOrderResponse {
  orderId: string;
  status: string;
  message: string;
  timestamp: string;
}

/**
 * Register Order Routes
 * 
 * This function registers all order-related routes with the Fastify instance.
 * It uses dependency injection to receive the required services.
 */
export async function registerOrderRoutes(
  fastify: FastifyInstance,
  orderQueueService: OrderQueueService,
  databaseService: DatabaseService
): Promise<void> {

  /**
   * POST /orders/execute
   * 
   * Main endpoint for order submission. This follows the exact pattern
   * required by the assignment: receive order, return orderId immediately,
   * then client connects to WebSocket for real-time updates.
   */
  fastify.post<{ Body: ExecuteOrderRequestBody }>(
    '/orders/execute',
    {
      schema: {
        // 🏗️ Architecture Note: Request validation schema
        body: {
          type: 'object',
          required: ['userId', 'baseToken', 'quoteToken', 'amount', 'side'],
          properties: {
            userId: { type: 'string', minLength: 1 },
            baseToken: { type: 'string', minLength: 1 },
            quoteToken: { type: 'string', minLength: 1 },
            amount: { 
            type: 'number', 
            minimum: 0.0001,
            maximum: 1000000,
            // errorMessage: 'Amount must be between 0.0001 and 1,000,000'
          },
            side: { type: 'string', enum: ['buy', 'sell'] }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: ExecuteOrderRequestBody }>, reply: FastifyReply) => {
      const startTime = Date.now();
      
      try {
        // Extract and validate request data
        const { userId, baseToken, quoteToken, amount, side } = request.body;

        console.log(`📥 New order request from ${userId}: ${side} ${amount} ${baseToken}/${quoteToken}`);

        // Additional business validation
        if (amount > 1000000) {
          return reply.status(400).send({
            error: 'Amount too large',
            message: 'Maximum order amount is 1,000,000'
          });
        }

        if (amount < 0.0001) {
          return reply.status(400).send({
            error: 'Amount too small', 
            message: 'Minimum order amount is 0.0001'
          });
        }

        if (amount <= 0) {
          return reply.status(400).send({
            error: 'Invalid amount',
            message: 'Amount must be greater than 0'
          });
        }

        // Validate token symbols (basic check)
        const validTokens = ['SOL', 'USDC', 'USDT', 'BONK', 'RAY', 'ORCA'];
        if (!validTokens.includes(baseToken.toUpperCase()) || 
            !validTokens.includes(quoteToken.toUpperCase())) {
          return reply.status(400).send({
            error: 'Invalid token pair',
            message: 'One or both tokens are not supported'
          });
        }

        // Prevent same token trading pairs
        if (baseToken.toUpperCase() === quoteToken.toUpperCase()) {
          return reply.status(400).send({
            error: 'Invalid trading pair',
            message: 'Base token and quote token cannot be the same'
          });
        }

        // Generate unique order ID
        const orderId = uuidv4() as OrderId;

        // 💡 Beginner Tip: Create the complete Order object with all required fields
        const newOrder: Order = {
          id: orderId,
          userId: userId as UserId,
          type: OrderType.MARKET, // Always market orders for this assignment
          baseToken: baseToken.toUpperCase(),
          quoteToken: quoteToken.toUpperCase(),
          amount,
          side,
          status: OrderStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date()
          // Note: execution fields (executionPrice, etc.) are populated later
        };

        // Save order to database first
        await databaseService.createOrder(newOrder);

        // Add order to processing queue
        // 🏗️ Architecture Note: Queue handles all the heavy lifting
        await orderQueueService.addOrderToQueue(newOrder);

        // Prepare success response
        const response: ExecuteOrderResponse = {
          orderId: orderId,
          status: 'queued',
          message: 'Order received and queued for processing. Connect to WebSocket for real-time updates.',
          timestamp: new Date().toISOString()
        };

        const processingTime = Date.now() - startTime;
        console.log(`✅ Order ${orderId} submitted successfully (${processingTime}ms)`);

        // Return orderId immediately as required by assignment
        return reply.status(201).send(response);

      } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`❌ Order submission failed (${processingTime}ms):`, error);

        // Handle different types of errors
        if (error.message.includes('Queue submission failed')) {
          return reply.status(503).send({
            error: 'Service temporarily unavailable',
            message: 'Order processing queue is currently unavailable. Please try again.'
          });
        }

        if (error.message.includes('Database error')) {
          return reply.status(500).send({
            error: 'Database error',
            message: 'Failed to save order. Please try again.'
          });
        }

        // Generic error response
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'An unexpected error occurred while processing your order.'
        });
      }
    }
  );

  /**
   * GET /orders/:orderId
   * 
   * Retrieve specific order information by ID.
   * Useful for debugging and order history.
   */
  fastify.get<{ Params: { orderId: string } }>(
    '/orders/:orderId',
    async (request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) => {
      try {
        const { orderId } = request.params;

        const order = await databaseService.getOrder(orderId as OrderId);

        if (!order) {
          return reply.status(404).send({
            error: 'Order not found',
            message: `Order with ID ${orderId} does not exist`
          });
        }

        return reply.status(200).send({
          order,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Failed to retrieve order:`, error);
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Failed to retrieve order information'
        });
      }
    }
  );

  /**
   * GET /orders/user/:userId
   * 
   * Get all orders for a specific user.
   * Useful for order history and user dashboards.
   */
  fastify.get<{ Params: { userId: string }; Querystring: { limit?: string } }>(
    '/orders/user/:userId',
    async (request: FastifyRequest<{ 
      Params: { userId: string }; 
      Querystring: { limit?: string } 
    }>, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        const limit = parseInt(request.query.limit || '50');

        const orders = await databaseService.getUserOrders(userId as UserId, limit);

        return reply.status(200).send({
          userId,
          orders,
          count: orders.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Failed to retrieve user orders:`, error);
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Failed to retrieve user orders'
        });
      }
    }
  );

  console.log('🎮 Order routes registered successfully');
}
