/**
 * Order Queue Service
 * 
 * This service manages the order processing queue using BullMQ.
 * It handles up to 10 concurrent orders and processes 100 orders/minute
 * as specified in the assignment requirements.
 * 
 * Architecture:
 * - Uses BullMQ with Redis for reliable job processing
 * - Implements exponential backoff retry strategy
 * - Provides real-time WebSocket updates during order lifecycle
 * - Supports concurrent processing with rate limiting
 */

import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Order, OrderId, OrderStatus, ExecutionResult } from '../../types/order.types';
import { WebSocketService } from '../websocket/websocket.service';
import { DEXRouterService } from '../dex-router/dex-router.service';
import { DatabaseService } from '../database/database.service';

export class OrderQueueService {
  private queue: Queue;
  private worker!: Worker;  // Definite assignment assertion - initialized in constructor
  private queueEvents: QueueEvents;
  private database: DatabaseService;
  private dexRouter: DEXRouterService;
  private websocketService: WebSocketService;
  
  /**
   * Constructor
   * 
   * Initializes the queue service with proper dependency injection.
   * Order of initialization is critical to prevent undefined worker errors.
   * 
   * @param database - Database service for order persistence
   * @param dexRouter - DEX routing service for price comparison
   * @param websocketService - WebSocket service for real-time updates
   */
  constructor(
    database: DatabaseService,
    dexRouter: DEXRouterService,
    websocketService: WebSocketService
  ) {
    this.database = database;
    this.dexRouter = dexRouter;
    this.websocketService = websocketService;

    // CRITICAL: Initialize in this exact order to prevent undefined errors
    
    // 1. Create Redis connection first
    const connection = this.createRedisConnection();
    
    // 2. Initialize queue second
    this.queue = new Queue('order-execution', { connection });
    
    // 3. Initialize queue events for monitoring
    this.queueEvents = new QueueEvents('order-execution', { connection });
    
    // 4. Initialize worker third
    this.initializeWorker(connection);
    
    // 5. Setup event listeners last (after worker is created)
    this.setupEventListeners();

    console.log('✅ OrderQueueService initialized successfully');
  }

  /**
   * Create Redis Connection
   * 
   * Creates a shared Redis connection for Queue, Worker, and QueueEvents.
   * Using a shared connection prevents opening too many Redis connections.
   * 
   * @returns IORedis connection instance
   */
  private createRedisConnection(): IORedis {
    try {
      const connection = new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null,           // Required for BullMQ
        enableReadyCheck: false,              // Faster connection
        lazyConnect: true                     // Connect only when needed
      });

      console.log('🔗 Redis connection created for queue service');
      return connection;
    } catch (error: any) {
      console.error('❌ Failed to create Redis connection:', error);
      throw new Error(`Redis connection failed: ${error.message}`);
    }
  }

  /**
   * Initialize Worker
   * 
   * Creates the BullMQ worker that processes jobs from the queue.
   * Configured for high concurrency (10 concurrent jobs) and rate limiting.
   * 
   * @param connection - Redis connection to use
   */
  private initializeWorker(connection: IORedis): void {
    try {
      this.worker = new Worker(
        'order-execution',
        this.processOrder.bind(this),  // Bind context for 'this' access
        {
          connection,
          concurrency: 10,              // Process up to 10 orders simultaneously
          limiter: {
            max: 100,                   // Maximum 100 jobs
            duration: 60000             // Per minute (60 seconds)
          }
        }
      );

      console.log('👷 Order processing worker initialized');
    } catch (error: any) {
      console.error('❌ Failed to initialize worker:', error);
      throw new Error(`Worker initialization failed: ${error.message}`);
    }
  }

  /**
   * Add Order to Processing Queue
   * 
   * This is called when a new order is submitted via HTTP API.
   * The order gets queued for processing and the user receives
   * real-time updates via WebSocket throughout the process.
   * 
   * @param order - The order object to process
   */
  async addOrderToQueue(order: Order): Promise<void> {
    try {
      // Add order to queue with retry configuration
      await this.queue.add(
        'process-market-order',
        { 
          orderId: order.id,
          orderData: order 
        },
        {
          // Exponential backoff retry strategy as per requirements
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,              // Start with 2 second delay
          },
          // Memory management: remove completed jobs after processing
          removeOnComplete: 50,       // Keep last 50 successful jobs
          removeOnFail: 20,           // Keep last 20 failed jobs for debugging
        }
      );

      console.log(`📥 Order ${order.id} added to processing queue`);
      
      // Notify user immediately that order is queued
      await this.websocketService.sendOrderUpdate(order.userId, {
        orderId: order.id,
        oldStatus: OrderStatus.PENDING,
        newStatus: OrderStatus.PENDING,
        message: 'Order received and queued for processing',
        progress: 10
      });

    } catch (error: any) {
      console.error(`Failed to queue order ${order.id}:`, error);
      throw new Error(`Queue submission failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process Individual Order
   * 
   * This is the main processing function that gets called by the worker
   * for each order in the queue. It orchestrates the entire order lifecycle:
   * 1. Order received → Processing
   * 2. DEX price comparison → Routing
   * 3. Execute on best DEX → Executing
   * 4. Transaction confirmed → Completed/Failed
   * 
   * @param job - BullMQ job containing order data
   * @returns ExecutionResult with transaction details
   */
  private async processOrder(job: Job): Promise<ExecutionResult> {
    const { orderId, orderData } = job.data;
    const startTime = Date.now();

    try {
      console.log(`🔄 Starting to process order ${orderId}`);
      
      // Step 1: Update order status to PROCESSING
      await this.updateOrderStatus(orderData, OrderStatus.PROCESSING, 'Order processing started');
      await job.updateProgress(20);

      // Step 2: DEX Routing Phase
      // This is where we compare prices across Raydium and Meteora
      await this.updateOrderStatus(orderData, OrderStatus.ROUTING, 'Comparing prices across DEXes');
      await job.updateProgress(40);

      const routingResult = await this.dexRouter.findBestRoute(
        orderData.baseToken,
        orderData.quoteToken,
        orderData.amount,
        orderData.side
      );

      console.log(`📊 Best route found: ${routingResult.bestRoute.provider} at $${routingResult.bestRoute.price}`);

      // Step 3: Order Execution Phase
      await this.updateOrderStatus(orderData, OrderStatus.EXECUTING, `Executing order on ${routingResult.bestRoute.provider}`);
      await job.updateProgress(70);

      // Execute the swap on the chosen DEX
      const executionResult = await this.dexRouter.executeOrder(orderData, routingResult.bestRoute);

      if (executionResult.success) {
        // Step 4: Order Completed Successfully
        await this.updateOrderStatus(orderData, OrderStatus.COMPLETED, 'Order executed successfully');
        await job.updateProgress(100);

        // Persist execution results to database
        await this.database.updateOrderExecution(orderId, {
          executionPrice: executionResult.executionPrice!,
          executedAmount: executionResult.executedAmount!,
          selectedDEX: routingResult.bestRoute.provider,
          transactionHash: executionResult.transactionHash,
          status: OrderStatus.COMPLETED
        });

        // Send final completion notification with all details
        await this.websocketService.sendOrderCompletion(orderData.userId, {
          orderId,
          executionPrice: executionResult.executionPrice!,
          executedAmount: executionResult.executedAmount!,
          selectedDEX: routingResult.bestRoute.provider,
          transactionHash: executionResult.transactionHash,
          totalTime: Date.now() - startTime
        });

        console.log(`✅ Order ${orderId} completed in ${Date.now() - startTime}ms`);
        return executionResult;

      } else {
        // Order execution failed
        throw new Error(executionResult.errorMessage || 'Execution failed');
      }

    } catch (error: any) {
      console.error(`❌ Order ${orderId} processing failed:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Update order status to failed
      await this.updateOrderStatus(orderData, OrderStatus.FAILED, `Execution failed: ${errorMessage}`);
      
      // Update database with failure reason
      await this.database.updateOrderStatus(orderId, OrderStatus.FAILED, errorMessage);
      
      // Notify user of failure with detailed error
      await this.websocketService.sendOrderUpdate(orderData.userId, {
        orderId,
        oldStatus: OrderStatus.EXECUTING,
        newStatus: OrderStatus.FAILED,
        message: `Order failed: ${errorMessage}`,
        progress: 0
      });

      throw error; // Re-throw for BullMQ retry mechanism
    }
  }

  /**
   * Update Order Status Helper
   * 
   * Centralizes status updates and ensures consistent WebSocket notifications.
   * This prevents code duplication and ensures all status changes are tracked.
   * 
   * @param order - Order object to update
   * @param newStatus - New status to set
   * @param message - Human-readable status message
   */
  private async updateOrderStatus(order: Order, newStatus: OrderStatus, message: string): Promise<void> {
    const oldStatus = order.status;
    order.status = newStatus;
    order.updatedAt = new Date();

    // Update database first (persistence)
    await this.database.updateOrderStatus(order.id, newStatus);

    // Send WebSocket update second (real-time notification)
    await this.websocketService.sendOrderUpdate(order.userId, {
      orderId: order.id,
      oldStatus,
      newStatus,
      message,
      progress: this.getProgressForStatus(newStatus)
    });

    console.log(`📈 Order ${order.id} status: ${oldStatus} → ${newStatus}`);
  }

  /**
   * Progress Calculation Helper
   * 
   * Maps order status to progress percentage for UI progress bars.
   * This provides users with visual feedback on order processing stages.
   * 
   * @param status - Current order status
   * @returns Progress percentage (0-100)
   */
  private getProgressForStatus(status: OrderStatus): number {
    const progressMap = {
      [OrderStatus.PENDING]: 10,      // Order received
      [OrderStatus.PROCESSING]: 20,   // Validation complete
      [OrderStatus.ROUTING]: 40,      // Price comparison done
      [OrderStatus.EXECUTING]: 70,    // Transaction building/sending
      [OrderStatus.COMPLETED]: 100,   // Fully completed
      [OrderStatus.FAILED]: 0,        // Reset progress on failure
      [OrderStatus.CANCELLED]: 0      // Reset progress on cancellation
    };
    return progressMap[status] || 0;
  }

  /**
   * Setup Event Listeners
   * 
   * Monitor queue and worker events for debugging, metrics, and health monitoring.
   * These events help track system performance and identify bottlenecks.
   * 
   * IMPORTANT: This method is called after worker initialization to prevent
   * "Cannot read properties of undefined (reading 'on')" errors.
   */
  private setupEventListeners(): void {
    // Add defensive check to ensure worker exists
    if (!this.worker) {
      console.error('❌ Cannot setup event listeners: worker is undefined');
      throw new Error('Worker must be initialized before setting up event listeners');
    }

    if (!this.queueEvents) {
      console.error('❌ Cannot setup event listeners: queueEvents is undefined');
      throw new Error('QueueEvents must be initialized before setting up event listeners');
    }

    try {
      // Queue Events (for monitoring)
      this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
        console.log(`✅ Job ${jobId} completed successfully`);
      });

      this.queueEvents.on('failed', ({ jobId, failedReason }) => {
        console.error(`❌ Job ${jobId} failed permanently: ${failedReason}`);
      });

      this.queueEvents.on('progress', ({ jobId, data }) => {
        console.log(`📊 Job ${jobId} progress: ${data}%`);
      });

      this.queueEvents.on('stalled', ({ jobId }) => {
        console.warn(`⚠️ Job ${jobId} has stalled and will be retried`);
      });

      // Worker Events (for error handling)
      this.worker.on('error', (error: any) => {
        console.error('🚨 Worker error:', error);
      });

      this.worker.on('ready', () => {
        console.log('🚀 Worker is ready to process jobs');
      });

      console.log('📡 Event listeners setup complete');
    } catch (error: any) {
      console.error('❌ Failed to setup event listeners:', error);
      throw new Error(`Event listener setup failed: ${error.message}`);
    }
  }

  /**
   * Get Queue Statistics
   * 
   * Provides real-time queue metrics for monitoring and debugging.
   * Used by health check endpoints and admin dashboards.
   * 
   * @returns Object containing queue statistics
   */
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed()
      ]);

      return {
        waiting: waiting.length,          // Orders waiting to be processed
        active: active.length,            // Orders currently being processed
        completed: completed.length,      // Successfully completed orders
        failed: failed.length,            // Failed orders (after all retries)
        total: waiting.length + active.length + completed.length + failed.length,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Failed to get queue stats:', error);
      return null;
    }
  }

  /**
   * Health Check
   * 
   * Verifies that the queue service is healthy and operational.
   * Checks Redis connection, worker status, and queue accessibility.
   * 
   * @returns Boolean indicating service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test Redis connection
      const client = await this.queue.client;
      await client.ping();
      
      // Check if worker is running
      if (!this.worker || this.worker.isRunning() === false) {
        return false;
      }

      // Try to get basic queue info
      await this.getQueueStats();
      
      return true;
    } catch (error: any) {
      console.error('Queue service health check failed:', error);
      return false;
    }
  }

  /**
   * Graceful Shutdown
   * 
   * Properly close all connections and workers when application shuts down.
   * This ensures no jobs are lost and all Redis connections are cleaned up.
   * 
   * Call this during application shutdown (SIGTERM/SIGINT handlers).
   */
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down queue service...');
    
    try {
      // Close worker first (stops processing new jobs)
      if (this.worker) {
        await this.worker.close();
        console.log('✅ Worker closed');
      }

      // Close queue events
      if (this.queueEvents) {
        await this.queueEvents.close();
        console.log('✅ Queue events closed');
      }

      // Close queue last
      if (this.queue) {
        await this.queue.close();
        console.log('✅ Queue closed');
      }

      console.log('✅ Queue service shutdown complete');
    } catch (error: any) {
      console.error('❌ Error during queue service shutdown:', error);
    }
  }
}
