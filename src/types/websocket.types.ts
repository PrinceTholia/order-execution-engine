/**
 * WebSocket Communication Types
 * 
 * Defines the structure for real-time order status updates.
 * These types ensure consistent communication between server and client.
 */

export enum WebSocketEventType {
  ORDER_CREATED = 'order_created',
  ORDER_STATUS_UPDATE = 'order_status_update',
  ORDER_COMPLETED = 'order_completed',
  ORDER_FAILED = 'order_failed',
  CONNECTION_ESTABLISHED = 'connection_established',
  ERROR = 'error'
}

/**
 * Base WebSocket Message Structure
 * 
 * All WebSocket messages follow this pattern for consistency.
 */
export interface WebSocketMessage<T = any> {
  type: WebSocketEventType;       // Type of event
  orderId?: OrderId;             // Associated order (if applicable)
  userId: UserId;                // User this message is for
  timestamp: Date;               // When event occurred
  data: T;                       // Event-specific data
}

/**
 * Order Status Update Message
 * 
 * Sent whenever an order's status changes.
 */
export interface OrderStatusUpdate {
  orderId: OrderId;
  oldStatus: OrderStatus;
  newStatus: OrderStatus;
  message: string;               // Human-readable status description
  progress?: number;             // Progress percentage (0-100)
  estimatedCompletion?: Date;    // When order might complete
}

/**
 * Order Completion Message
 * 
 * Sent when an order successfully completes execution.
 */
export interface OrderCompletionMessage {
  orderId: OrderId;
  executionPrice: number;
  executedAmount: number;
  selectedDEX: DEXProvider;
  transactionHash?: string;
  totalTime: number;             // Total processing time
}
