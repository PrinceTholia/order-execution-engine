/**
 * Main Application Entry Point
 *
 * This file initializes the Fastify server, sets up all services with
 * proper dependency injection, registers routes, and starts the server.
 * It also handles graceful shutdown for production deployment.
 * 
 * Architecture:
 * - Fastify web framework with WebSocket support
 * - Service layer with dependency injection
 * - Global error handling and request validation
 * - Production-ready logging and monitoring
 * - Graceful shutdown for zero-downtime deployments
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';

// Import all services
import { OrderQueueService } from './services/order-queue/queue.service';
import { WebSocketService } from './services/websocket/websocket.service';
import { DEXRouterService } from './services/dex-router/dex-router.service';
import { DatabaseService } from './services/database/database.service';

// Import controllers
import { registerOrderRoutes } from './controllers/order.controller';
import { registerHealthRoutes } from './controllers/health.controller';

// Load environment variables from .env file
dotenv.config();

/**
 * Server Configuration
 * 
 * Configuration constants loaded from environment variables.
 * Uses sensible defaults for development and requires explicit
 * configuration for production deployment.
 */
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Use 0.0.0.0 for Docker compatibility

/**
 * Initialize Fastify Server
 *
 * Creates Fastify instance with logging and error handling configuration.
 * Configures different logging strategies for development vs production.
 * 
 * @returns Configured Fastify application instance
 */
const initializeFastify = (): FastifyInstance => {
  const app = Fastify({
    // Enable structured logging in production, pretty logging in development
    logger: process.env.NODE_ENV === 'production' ? {
      level: 'info',
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          headers: req.headers,
          hostname: req.hostname,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      }
    } : {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
    // Generate unique request IDs for tracing and debugging
    genReqId: () => {
      return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    // Set body size limit to 1MB for API requests
    bodyLimit: 1048576
  });

  return app;
};

/**
 * Parse Database Configuration
 * Handles both DATABASE_URL (Render default) and individual DB_* vars
 */
function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    // Parse DATABASE_URL format: postgres://user:password@host:port/database
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1) // Remove leading slash
    };
  }
  
  // Fallback to individual environment variables
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  };
}

/**
 * Parse Redis Configuration
 * Handles both REDIS_URL (Upstash format) and individual REDIS_* vars
 */
function getRedisConfig() {
  if (process.env.REDIS_URL) {
    // Parse REDIS_URL format: redis://default:password@host:port
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password
    };
  }
  
  // Fallback to individual environment variables
  return {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  };
}


/**
 * Validate Environment Variables
 * 
 * Ensures all required environment variables are present before
 * starting the application. Prevents runtime failures due to
 * missing configuration.
 */
function validateEnvironment(): void {
  // Check if we have either URL format or individual fields
  const hasDatabase = process.env.DATABASE_URL || 
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME);
    
  const hasRedis = process.env.REDIS_URL || 
    (process.env.REDIS_HOST && process.env.REDIS_PORT);
  
  if (!hasDatabase) {
    console.error('❌ Missing database configuration. Need either DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    process.exit(1);
  }
  
  if (!hasRedis) {
    console.error('❌ Missing Redis configuration. Need either REDIS_URL or REDIS_HOST, REDIS_PORT');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated');
}


/**
 * Initialize All Services
 *
 * Creates instances of all services with proper dependency injection.
 * Order of initialization is critical - some services depend on others.
 * 
 * Service Dependency Graph:
 * 1. DatabaseService (no dependencies)
 * 2. DEXRouterService (no dependencies) 
 * 3. WebSocketService (requires Fastify app instance)
 * 4. OrderQueueService (depends on database, dex router, websocket)
 * 
 * @param app - Fastify application instance required by WebSocketService
 * @returns Object containing all initialized service instances
 */
async function initializeServices(app: FastifyInstance): Promise<{
  databaseService: DatabaseService,
  dexRouterService: DEXRouterService,
  websocketService: WebSocketService,
  orderQueueService: OrderQueueService
}> {
  try {
    console.log('🔧 Initializing services...');

    // Step 1: Initialize database service (constructor handles initialization)
    const databaseService = new DatabaseService();
    console.log('✅ Database service initialized');

    // Step 2: Initialize DEX router service
    const dexRouterService = new DEXRouterService();
    console.log('✅ DEX router service initialized');

    // Step 3: Initialize WebSocket service with Fastify app instance
    const websocketService = new WebSocketService(app);
    console.log('✅ WebSocket service initialized');

    // Step 4: Initialize order queue service last (depends on all others)
    const orderQueueService = new OrderQueueService(
      databaseService,
      dexRouterService,
      websocketService
    );
    console.log('✅ Order queue service initialized');

    console.log('🎉 All services initialized successfully');
    
    // Return all service instances for dependency injection
    return {
      databaseService,
      dexRouterService,
      websocketService,
      orderQueueService
    };
  } catch (error: any) {
    console.error('💥 Service initialization failed:', error);
    throw error; // Re-throw to stop application startup
  }
}

/**
 * Register All Routes
 *
 * Sets up all API endpoints and passes required services to controllers.
 * Routes are organized by domain (health, orders) for better maintainability.
 * 
 * @param app - Fastify application instance
 * @param services - Object containing all service instances for injection
 */
async function registerRoutes(app: FastifyInstance, services: {
  databaseService: DatabaseService,
  dexRouterService: DEXRouterService,
  websocketService: WebSocketService,
  orderQueueService: OrderQueueService
}): Promise<void> {
  console.log('🛣️  Registering routes...');

  // Register health check routes first (for load balancer probes)
  await registerHealthRoutes(app, {
    database: services.databaseService,
    dexRouter: services.dexRouterService, 
    orderQueue: services.orderQueueService,
    websocket: services.websocketService
  });

  // Register order execution routes
  await registerOrderRoutes(
    app, 
    services.orderQueueService, 
    services.databaseService
  );

  // Register CORS middleware with environment-specific origins
  await app.register(require('@fastify/cors'), {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://your-frontend-domain.com'] // Restrict to specific domains in production
      : true, // Allow all origins in development
    credentials: true, // Allow cookies and auth headers
  });
  
  console.log('✅ All routes registered');
}

/**
 * Setup Global Error Handlers
 *
 * Catches unhandled errors and provides meaningful responses.
 * Handles validation errors, JSON parsing errors, and generic server errors.
 * 
 * @param app - Fastify application instance
 */
const setupErrorHandlers = (app: FastifyInstance): void => {
  app.setErrorHandler((error, request, reply) => {
    // Handle Fastify/Ajv validation errors
    if (error.validation) {
      let msg = error.message;
      
      // Provide user-friendly error messages for common validation failures
      if (msg.includes('must be >= 0.0001')) {
        msg = 'Order amount must be greater than zero';
      }
      
      return reply.status(400).send({
        error: 'Validation Error',
        message: msg,
        details: error.validation
      });
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return reply.status(400).send({
        error: 'Invalid JSON',
        message: 'Request body contains invalid JSON syntax'
      });
    }

    // Log all unhandled errors for debugging
    console.error('🚨 Unhandled error:', {
      error: error.message,
      stack: error.stack,
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
      }
    });
    
    // Return appropriate error response
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : error.name,
      message: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing your request' 
        : error.message, // Detailed errors only in development
      requestId: request.id // Include request ID for tracking
    });
  });
};

/**
 * Setup Graceful Shutdown
 *
 * Properly closes all connections and services when the app shuts down.
 * Ensures no data loss and clean resource cleanup on application termination.
 * 
 * @param app - Fastify application instance
 * @param services - Service instances to shutdown
 */
const setupGracefulShutdown = (app: FastifyInstance, services: {
  orderQueueService: OrderQueueService
}): void => {
  const shutdown = async (signal: string) => {
    console.log(`\n🚦 Received ${signal}, starting graceful shutdown...`);
    
    try {
      // Step 1: Stop accepting new HTTP requests
      console.log('⏹️  Stopping HTTP server...');
      await app.close();
      
      // Step 2: Shutdown queue service (closes Redis connections and completes jobs)
      console.log('📤 Shutting down queue service...');
      await services.orderQueueService.shutdown();
      
      console.log('✅ Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1); // Force exit if graceful shutdown fails
    }
  };

  // Listen for termination signals from process manager
  process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
  process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker/K8s termination

  // Handle unexpected errors to prevent zombie processes
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled promise rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
};

/**
 * Main Application Function
 *
 * Orchestrates the entire application startup process.
 * This is the main entry point that coordinates all initialization steps.
 */
async function startApplication(): Promise<void> {
  try {
    console.log('🚀 Starting Order Execution Engine...');

    // Step 1: Validate environment configuration
    validateEnvironment();

    // Step 2: Initialize Fastify web server
    const app = initializeFastify();

    // Step 3: Register WebSocket plugin for real-time updates
    await app.register(fastifyWebsocket);

    // Step 4: Initialize all application services (pass app to services)
    const services = await initializeServices(app);

    // Step 5: Verify database connectivity before starting
    console.log('🔌 Checking database connection...');
    const dbHealthy = await services.databaseService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed - cannot start server');
    }
    console.log('✅ Database connection verified');

    // Step 6: Register all API routes and middleware
    await registerRoutes(app, services);

    // Step 7: Setup global error handling
    setupErrorHandlers(app);

    // Step 8: Start the HTTP server
    await app.listen({ 
      port: PORT, 
      host: HOST 
    });

    // Step 9: Display startup information
    console.log(`🌟 Server running at http://${HOST}:${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
    console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
    
    // Step 10: Setup graceful shutdown handlers
    setupGracefulShutdown(app, services);

    console.log('🎉 Order Execution Engine started successfully!');

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startApplication();

// Export for testing and external usage
export default startApplication;
