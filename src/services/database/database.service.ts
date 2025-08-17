/**
 * Database Service
 * 
 * Handles all database operations for orders, routing, and events.
 * Uses connection pooling for high performance.
 */

import { Pool } from 'pg';
import { db, checkDatabaseConnection } from '../../config/database.config';
import { 
  Order, 
  OrderId, 
  OrderStatus, 
  DEXProvider,
  UserId 
} from '../../types/order.types';

export class DatabaseService {
  private db: Pool;

  constructor() {
    this.db = db;
  }

  /**
   * Create New Order
   * 
   * Inserts a new order into the database when first submitted.
   */
  async createOrder(order: Order): Promise<void> {
    const query = `
      INSERT INTO orders (
        id, user_id, type, base_token, quote_token, 
        amount, side, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `;

    const values = [
      order.id,
      order.userId,
      order.type,
      order.baseToken,
      order.quoteToken,
      Math.min(order.amount, 999999), // Cap the amount
      order.side,
      order.status,
      order.createdAt,
      order.updatedAt
    ];

    try {
      await this.db.query(query, values);
      console.log(`📝 Order ${order.id} created in database`);
    } catch (error: any) {
      console.error(`Database error for order ${order.id}:`, error);
      if (error instanceof Error && error.message.includes('numeric field overflow')) {
        throw new Error('Order amount exceeds maximum allowed value');
      }
      throw new Error(`Database error: ${error instanceof Error ? error.message : String(error)}`);
    }

  }


  /**
   * Update Order Status
   * 
   * Updates order status and creates audit trail entry.
   */
  async updateOrderStatus(
    orderId: OrderId, 
    newStatus: OrderStatus, 
    errorMessage?: string
  ): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Get current status for audit trail
      const currentOrder = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );

      if (currentOrder.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const oldStatus = currentOrder.rows[0].status;

      // Update order status
      await client.query(
        `UPDATE orders 
         SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [newStatus, errorMessage, orderId]
      );

      // Create audit trail entry
      await client.query(
        `INSERT INTO order_events (order_id, event_type, old_status, new_status, message)
         VALUES ($1, 'status_change', $2, $3, $4)`,
        [orderId, oldStatus, newStatus, errorMessage || `Status changed to ${newStatus}`]
      );

      await client.query('COMMIT');
      console.log(`📊 Order ${orderId} status updated: ${oldStatus} → ${newStatus}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to update order status:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update Order Execution Details
   * 
   * Updates order with execution results when completed.
   */
  async updateOrderExecution(orderId: OrderId, executionData: {
    executionPrice: number;
    executedAmount: number;
    selectedDEX: DEXProvider;
    transactionHash?: string;
    status: OrderStatus;
  }): Promise<void> {
    const query = `
      UPDATE orders 
      SET execution_price = $1,
          executed_amount = $2,
          selected_dex = $3,
          transaction_hash = $4,
          status = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `;

    const values = [
      executionData.executionPrice,
      executionData.executedAmount,
      executionData.selectedDEX,
      executionData.transactionHash,
      executionData.status,
      orderId
    ];

    try {
      await this.db.query(query, values);
      console.log(`💰 Order ${orderId} execution details updated`);
    } catch (error) {
      console.error(`Failed to update execution details:`, error);
      throw error;
    }
  }

  /**
   * Get Order by ID
   * 
   * Retrieves complete order information.
   */
  async getOrder(orderId: OrderId): Promise<Order | null> {
    const query = 'SELECT * FROM orders WHERE id = $1';
    
    try {
      const result = await this.db.query(query, [orderId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        baseToken: row.base_token,
        quoteToken: row.quote_token,
        amount: parseFloat(row.amount),
        side: row.side,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        executionPrice: row.execution_price ? parseFloat(row.execution_price) : undefined,
        executedAmount: row.executed_amount ? parseFloat(row.executed_amount) : undefined,
        selectedDEX: row.selected_dex,
        transactionHash: row.transaction_hash,
        errorMessage: row.error_message
      };
    } catch (error) {
      console.error(`Failed to get order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get User Orders
   * 
   * Retrieves all orders for a specific user.
   */
  async getUserOrders(userId: UserId, limit: number = 50): Promise<Order[]> {
    const query = `
      SELECT * FROM orders 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;

    try {
      const result = await this.db.query(query, [userId, limit]);
      
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        baseToken: row.base_token,
        quoteToken: row.quote_token,
        amount: parseFloat(row.amount),
        side: row.side,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        executionPrice: row.execution_price ? parseFloat(row.execution_price) : undefined,
        executedAmount: row.executed_amount ? parseFloat(row.executed_amount) : undefined,
        selectedDEX: row.selected_dex,
        transactionHash: row.transaction_hash,
        errorMessage: row.error_message
      }));
    } catch (error) {
      console.error(`Failed to get orders for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Health Check
   * 
   * Verifies database connectivity.
   */
  async healthCheck(): Promise<boolean> {
    return await checkDatabaseConnection();
  }
}
