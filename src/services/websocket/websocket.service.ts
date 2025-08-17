/**
 * WebSocket Service
 * 
 * Manages WebSocket connections and sends real-time order updates
 * to users. Handles connection lifecycle and message broadcasting.
 */

import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { 
  WebSocketMessage, 
  WebSocketEventType, 
  OrderStatusUpdate, 
  OrderCompletionMessage 
} from '../../types/websocket.types';
import { UserId, OrderId } from '../../types/order.types';

// 💡 Beginner Tip: We store active connections in a Map for fast lookups
interface ClientConnection {
  socket: SocketStream['socket'];
  userId: UserId;
  connectedAt: Date;
  lastActivity: Date;
}

export class WebSocketService {
  private connections = new Map<string, ClientConnection>();
  private server: FastifyInstance;

  constructor(server: FastifyInstance) {
    this.server = server;
    this.setupWebSocketRoute();
    this.setupHeartbeat();
  }

  /**
   * Setup WebSocket Route
   * 
   * This creates the /ws endpoint that clients connect to.
   * The connection upgrades from HTTP to WebSocket automatically.
   */
  private setupWebSocketRoute(): void {
    // 🏗️ Architecture Note: This route handles the HTTP → WebSocket upgrade
    this.server.get('/ws', { websocket: true }, (connection, request) => {
      const { socket } = connection;
      
      // Extract userId from query parameters
      // Example: ws://localhost:3000/ws?userId=user123
      const userId = request.query?.userId as UserId;
      
      if (!userId) {
        socket.close(1008, 'userId parameter required');
        return;
      }

      const connectionId = this.generateConnectionId();
      
      // Store connection
      this.connections.set(connectionId, {
        socket,
        userId,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      console.log(`🔌 WebSocket connected: ${userId} (${connectionId})`);

      // Send connection confirmation
      this.sendToConnection(connectionId, {
        type: WebSocketEventType.CONNECTION_ESTABLISHED,
        userId,
        timestamp: new Date(),
        data: {
          connectionId,
          message: 'WebSocket connection established',
          serverTime: new Date().toISOString()
        }
      });

      // Handle incoming messages
      socket.on('message', (message) => {
        this.handleClientMessage(connectionId, message);
      });

      // Handle connection close
      socket.on('close', () => {
        console.log(`🔌 WebSocket disconnected: ${userId} (${connectionId})`);
        this.connections.delete(connectionId);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        console.error(`🚨 WebSocket error for ${userId}:`, error);
        this.connections.delete(connectionId);
      });
    });

    console.log('🌐 WebSocket route setup complete: /ws');
  }

  /**
   * Handle Client Messages
   * 
   * Process messages received from WebSocket clients.
   * Currently handles ping/pong for connection health.
   */
  private handleClientMessage(connectionId: string, message: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastActivity = new Date();

    try {
      const data = JSON.parse(message.toString());
      
      // Handle ping/pong for connection health
      if (data.type === 'ping') {
        this.sendToConnection(connectionId, {
          type: WebSocketEventType.CONNECTION_ESTABLISHED,
          userId: connection.userId,
          timestamp: new Date(),
          data: { type: 'pong', serverTime: new Date().toISOString() }
        });
      }

      console.log(`📨 Message from ${connection.userId}:`, data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Send Order Status Update
   * 
   * Sends real-time order status updates to the user who placed the order.
   * This is called by the queue service during order processing.
   */
  async sendOrderUpdate(userId: UserId, update: OrderStatusUpdate): Promise<void> {
    const message: WebSocketMessage<OrderStatusUpdate> = {
      type: WebSocketEventType.ORDER_STATUS_UPDATE,
      orderId: update.orderId,
      userId,
      timestamp: new Date(),
      data: update
    };

    await this.sendToUser(userId, message);
    console.log(`📊 Status update sent to ${userId}: ${update.oldStatus} → ${update.newStatus}`);
  }

  /**
   * Send Order Completion Notification
   * 
   * Sends final completion message when an order is successfully executed.
   */
  async sendOrderCompletion(userId: UserId, completion: OrderCompletionMessage): Promise<void> {
    const message: WebSocketMessage<OrderCompletionMessage> = {
      type: WebSocketEventType.ORDER_COMPLETED,
      orderId: completion.orderId,
      userId,
      timestamp: new Date(),
      data: completion
    };

    await this.sendToUser(userId, message);
    console.log(`🎉 Completion notification sent to ${userId} for order ${completion.orderId}`);
  }

  /**
   * Send Order Failed Notification
   * 
   * Notifies user when an order fails to execute.
   */
  async sendOrderFailed(userId: UserId, orderId: OrderId, errorMessage: string): Promise<void> {
    const message: WebSocketMessage = {
      type: WebSocketEventType.ORDER_FAILED,
      orderId,
      userId,
      timestamp: new Date(),
      data: {
        orderId,
        errorMessage,
        timestamp: new Date()
      }
    };

    await this.sendToUser(userId, message);
    console.log(`❌ Failure notification sent to ${userId} for order ${orderId}`);
  }

  /**
   * Send Message to Specific User
   * 
   * Finds all connections for a user and sends the message to each.
   * A user can have multiple browser tabs/devices connected.
   */
  private async sendToUser(userId: UserId, message: WebSocketMessage): Promise<void> {
    const userConnections = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.userId === userId);

    if (userConnections.length === 0) {
      console.warn(`⚠️  No active WebSocket connections for user ${userId}`);
      return;
    }

    // Send to all of user's connections
    userConnections.forEach(([connectionId, _]) => {
      this.sendToConnection(connectionId, message);
    });
  }

  /**
   * Send Message to Specific Connection
   * 
   * Low-level function to send a message to a specific WebSocket connection.
   */
  private sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`⚠️  Connection ${connectionId} not found`);
      return;
    }

    try {
      // 💡 Beginner Tip: WebSocket.send() requires a string, so we stringify JSON
      connection.socket.send(JSON.stringify(message));
      connection.lastActivity = new Date();
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      // Remove broken connection
      this.connections.delete(connectionId);
    }
  }

  /**
   * Setup Connection Heartbeat
   * 
   * Periodically checks connection health and removes stale connections.
   * This prevents memory leaks from disconnected clients.
   */
  private setupHeartbeat(): void {
    setInterval(() => {
      const now = new Date();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      // Find and remove stale connections
      for (const [connectionId, connection] of this.connections.entries()) {
        const timeSinceActivity = now.getTime() - connection.lastActivity.getTime();
        
        if (timeSinceActivity > staleThreshold) {
          console.log(`🧹 Removing stale connection: ${connection.userId} (${connectionId})`);
          connection.socket.close(1000, 'Connection timeout');
          this.connections.delete(connectionId);
        }
      }
    }, 60000); // Check every minute

    console.log('💓 WebSocket heartbeat initialized');
  }

  /**
   * Generate Connection ID
   * 
   * Creates a unique identifier for each WebSocket connection.
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get Connection Statistics
   * 
   * Returns current WebSocket connection stats for monitoring.
   */
  getConnectionStats() {
    const userCount = new Set(
      Array.from(this.connections.values()).map(conn => conn.userId)
    ).size;

    return {
      totalConnections: this.connections.size,
      uniqueUsers: userCount,
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        id,
        userId: conn.userId,
        connectedAt: conn.connectedAt,
        lastActivity: conn.lastActivity
      }))
    };
  }

  /**
   * Broadcast System Message
   * 
   * Sends a message to all connected users (for system announcements).
   */
  async broadcastSystemMessage(message: string): Promise<void> {
    const systemMessage: WebSocketMessage = {
      type: WebSocketEventType.ERROR, // Reusing error type for system messages
      userId: 'system' as UserId,
      timestamp: new Date(),
      data: {
        type: 'system_announcement',
        message,
        timestamp: new Date()
      }
    };

    this.connections.forEach((_, connectionId) => {
      this.sendToConnection(connectionId, systemMessage);
    });

    console.log(`📢 System message broadcasted to ${this.connections.size} connections`);
  }
}
