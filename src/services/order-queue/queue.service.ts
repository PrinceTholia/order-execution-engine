/**
 * Order Queue Service
 * 
 * This service manages the order processing queue using BullMQ.
 * It handles up to 10 concurrent orders and processes 100 orders/minute
 * as specified in the assignment requirements.
 */

import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Order, OrderId, OrderStatus, ExecutionResult } from '../../types/order.types';
import { WebSocketService } from '../websocket/websocket.service';
import { DEXRouterService } from '../dex-router/dex-router.service';
import { DatabaseService } from '../database/database.service';

// 💡 Beginner Tip: Connection is shared across Queue, Worker, and Events
// This prevents opening too many Redis connections
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,  // Essential for BullMQ
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true
});

export class OrderQueueService {
  private queue: Queue;
  private worker: Worker;
  private queueEvents: QueueEvents;
  
  constructor(
    private websocketService: WebSocketService,
    private dexRouter: DEXRouterService,
    private database: DatabaseService
  ) {
    // Initialize queue for order processing
    this.queue = new Queue('order-execution', { connection });
    
    // Initialize queue events for monitoring
    this.queueEvents = new QueueEvents('order-execution', { connection });
    
    // Initialize worker with concurrency control
    this.worker = new Worker(
      'order-execution',
      this.processOrder.bind(this),  // Bind 'this' context
      {
        connection,
        concurrency: 10,  // 🏗️ Architecture Note: Max 10 concurrent orders
        limiter: {
          max: 100,       // Process 100 orders
          duration: 60000 // Per minute (60 seconds)
        },
        // Retry configuration for failed jobs
        settings: {
          retryProcessDelay: 2000,  // Wait 2s before retry
        }
      }
    );
    
    this.setupEventListeners();
  }

  /**
   * Add Order to Processing Queue
   * 
   * This is called when a new order is submitted via HTTP.
   * The order gets queued for processing and the user receives
   * real-time updates via WebSocket.
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
          // 🏗️ Architecture Note: Exponential backoff retry strategy
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,  // Start with 2 second delay
          },
          // Remove completed jobs after 1 hour to save memory
          removeOnComplete: 50,
          removeOnFail: 20,
        }
      );

      console.log(`Order ${order.id} added to processing queue`);
      
      // Notify user that order is queued
      await this.websocketService.sendOrderUpdate(order.userId, {
        orderId: order.id,
        oldStatus: OrderStatus.PENDING,
        newStatus: OrderStatus.PENDING,
        message: 'Order received and queued for processing',
        progress: 10
      });

    } catch (error) {
      console.error(`Failed to queue order ${order.id}:`, error);
      throw new Error(`Queue submission failed: ${error.message}`);
    }
  }

  /**
   * Process Individual Order
   * 
   * This is the main processing function that gets called by the worker
   * for each order in the queue. It orchestrates the entire order lifecycle.
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
      await this.updateOrderStatus(orderData, OrderStatus.ROUTING, 'Comparing prices across DEXes');
      await job.updateProgress(40);

      // 💡 Beginner Tip: This is where we find the best price across DEXes
      const routingResult = await this.dexRouter.findBestRoute(
        orderData.baseToken,
        orderData.quoteToken,
        orderData.amount,
        orderData.side
      );

      console.log(`📊 Best route found: ${routingResult.bestRoute.provider} at ${routingResult.bestRoute.price}`);

      // Step 3: Order Execution Phase
      await this.updateOrderStatus(orderData, OrderStatus.EXECUTING, 'Executing order on selected DEX');
      await job.updateProgress(70);

      // Execute the swap on the chosen DEX
      const executionResult = await this.dexRouter.executeOrder(orderData, routingResult.bestRoute);

      if (executionResult.success) {
        // Step 4: Order Completed Successfully
        await this.updateOrderStatus(orderData, OrderStatus.COMPLETED, 'Order executed successfully');
        await job.updateProgress(100);

        // Update database with execution results
        await this.database.updateOrderExecution(orderId, {
          executionPrice: executionResult.executionPrice!,
          executedAmount: executionResult.executedAmount!,
          selectedDEX: routingResult.bestRoute.provider,
          transactionHash: executionResult.transactionHash,
          status: OrderStatus.COMPLETED
        });

        // Send completion notification
        await this.websocketService.sendOrderCompletion(orderData.userId, {
          orderId,
          executionPrice: executionResult.executionPrice!,
          executedAmount: executionResult.executedAmount!,
          selectedDEX: routingResult.bestRoute.provider,
          transactionHash: executionResult.transactionHash,
          totalTime: Date.now() - startTime
        });

        return executionResult;

      } else {
        // Order execution failed
        throw new Error(executionResult.errorMessage || 'Execution failed');
      }

    } catch (error) {
      console.error(`❌ Order ${orderId} processing failed:`, error);
      
      // Update order status to failed
      await this.updateOrderStatus(orderData, OrderStatus.FAILED, `Execution failed: ${error.message}`);
      
      // Update database
      await this.database.updateOrderStatus(orderId, OrderStatus.FAILED, error.message);
      
      // Notify user of failure
      await this.websocketService.sendOrderUpdate(orderData.userId, {
        orderId,
        oldStatus: OrderStatus.EXECUTING,
        newStatus: OrderStatus.FAILED,
        message: `Order failed: ${error.message}`,
        progress: 0
      });

      throw error; // Re-throw for BullMQ retry mechanism
    }
  }

  /**
   * Update Order Status Helper
   * 
   * Centralizes status updates and ensures consistent WebSocket notifications
   */
  private async updateOrderStatus(order: Order, newStatus: OrderStatus, message: string): Promise<void> {
    const oldStatus = order.status;
    order.status = newStatus;
    order.updatedAt = new Date();

    // Update database
    await this.database.updateOrderStatus(order.id, newStatus);

    // Send WebSocket update
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
   * Maps order status to progress percentage for UI
   */
  private getProgressForStatus(status: OrderStatus): number {
    const progressMap = {
      [OrderStatus.PENDING]: 10,
      [OrderStatus.PROCESSING]: 20,
      [OrderStatus.ROUTING]: 40,
      [OrderStatus.EXECUTING]: 70,
      [OrderStatus.COMPLETED]: 100,
      [OrderStatus.FAILED]: 0,
      [OrderStatus.CANCELLED]: 0
    };
    return progressMap[status] || 0;
  }

  /**
   * Setup Event Listeners
   * 
   * Monitor queue events for debugging and metrics
   */
  private setupEventListeners(): void {
    // Job completed successfully
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      console.log(`✅ Job ${jobId} completed successfully`);
    });

    // Job failed after all retries
    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`❌ Job ${jobId} failed permanently: ${failedReason}`);
    });

    // Job progress updates
    this.queueEvents.on('progress', ({ jobId, data }) => {
      console.log(`📊 Job ${jobId} progress: ${data}%`);
    });

    // Worker error handling
    this.worker.on('error', (error) => {
      console.error('🚨 Worker error:', error);
    });

    console.log('🎧 Queue event listeners initialized');
  }

  /**
   * Get Queue Statistics
   * 
   * Useful for monitoring and debugging
   */
  async getQueueStats() {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }

  /**
   * Graceful Shutdown
   * 
   * Properly close connections when application shuts down
   */
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down queue service...');
    await this.worker.close();
    await this.queue.close();
    await this.queueEvents.close();
    console.log('✅ Queue service shutdown complete');
  }
}
