/**
 * Core Order System Types
 * 
 * This file defines the foundational types for our order execution engine.
 * These types ensure type safety across all services and provide clear
 * contracts for data flow throughout the application.
 */

// 💡 Beginner Tip: Enums provide type-safe constants and make our code more readable
export enum OrderStatus {
  PENDING = 'pending',           // Order received, waiting in queue
  PROCESSING = 'processing',     // Order being processed by DEX router
  ROUTING = 'routing',          // Finding best price across DEXes
  EXECUTING = 'executing',      // Executing on chosen DEX
  COMPLETED = 'completed',      // Successfully executed
  FAILED = 'failed',           // Execution failed
  CANCELLED = 'cancelled'       // Order cancelled by user
}

export enum OrderType {
  MARKET = 'market'             // Only implementing market orders for this assignment
}

export enum DEXProvider {
  RAYDIUM = 'raydium',         // Raydium DEX
  METEORA = 'meteora'          // Meteora DEX
}

// 🏗️ Architecture Note: Using branded types prevents mixing up different ID types
export type OrderId = string & { __brand: 'OrderId' };
export type UserId = string & { __brand: 'UserId' };

/**
 * Base Order Interface
 * 
 * Contains all the essential information needed to process a market order.
 * Every order in our system will implement this interface.
 */
export interface Order {
  id: OrderId;                    // Unique identifier for this order
  userId: UserId;                 // User who placed the order
  type: OrderType;                // Always 'market' for this assignment
  
  // Trading pair information
  baseToken: string;              // Token being bought/sold (e.g., 'SOL')
  quoteToken: string;             // Token used for payment (e.g., 'USDC')
  
  // Order specifics
  amount: number;                 // Amount of base token to trade
  side: 'buy' | 'sell';          // Direction of the trade
  
  // Status tracking
  status: OrderStatus;            // Current order status
  createdAt: Date;               // When order was created
  updatedAt: Date;               // Last status update
  
  // Execution details (populated after routing)
  executionPrice?: number;        // Final execution price
  executedAmount?: number;        // Actual amount executed
  selectedDEX?: DEXProvider;      // Which DEX was used
  transactionHash?: string;       // Blockchain transaction hash (for real implementation)
  
  // Error handling
  errorMessage?: string;          // Error details if order fails
}

/**
 * Order Creation Request
 * 
 * This is what the API endpoint receives when a user submits an order.
 * We validate this input and convert it to a full Order object.
 */
export interface CreateOrderRequest {
  userId: UserId;                 // User placing the order
  baseToken: string;              // e.g., 'SOL'
  quoteToken: string;             // e.g., 'USDC'
  amount: number;                 // Amount to trade
  side: 'buy' | 'sell';          // Buy or sell
}

/**
 * DEX Route Information
 * 
 * Contains pricing and routing information from each DEX.
 * Our router will compare these to find the best execution venue.
 */
export interface DEXRoute {
  provider: DEXProvider;          // Which DEX (Raydium/Meteora)
  price: number;                  // Price offered by this DEX
  liquidity: number;              // Available liquidity
  estimatedGas: number;           // Gas cost estimate
  confidence: number;             // Price confidence (0-1)
  timestamp: Date;                // When this quote was generated
}

/**
 * Routing Result
 * 
 * Contains the result of our DEX routing algorithm, including
 * the best route found and alternative options.
 */
export interface RoutingResult {
  bestRoute: DEXRoute;            // Optimal route for execution
  alternatives: DEXRoute[];       // Other available routes
  totalRoutes: number;            // Number of routes evaluated
  routingTime: number;            // Time taken to find routes (ms)
}

/**
 * Order Execution Result
 * 
 * Final result after attempting to execute an order.
 * Contains success/failure information and execution details.
 */
export interface ExecutionResult {
  success: boolean;               // Whether execution succeeded
  orderId: OrderId;              // Order that was executed
  executionPrice?: number;        // Final execution price
  executedAmount?: number;        // Amount actually executed
  transactionHash?: string;       // Blockchain transaction hash
  gasUsed?: number;              // Gas consumed
  executionTime: number;          // Total execution time (ms)
  errorMessage?: string;          // Error details if failed
}
