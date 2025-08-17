/**
 * Main Application Entry Point
 * 
 * This file initializes the Fastify server, sets up all services with
 * proper dependency injection, registers routes, and starts the server.
 * It also handles graceful shutdown for production deployment.
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

// Load environment variables
dotenv.config();

// 💡 Beginner Tip: Configuration from environment variables
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Use 0.0.0.0 for Docker compatibility

/**
 * Initialize Fastify Server
 * 
 * Creates Fastify instance with logging and error handling configuration.
 */
const initializeFastify = (): FastifyInstance => {
  const app = Fastify({
    // Enable logging in development, structured logs in production
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
    // Request ID for tracing
    genReqId: () => {
      return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    // Body size limits
    bodyLimit: 1048576, // 1MB
  });

  return app;
};

/**
 * Initialize All Services
 * 
 * Creates instances of all services with proper dependency injection.
 * Order matters here - some services depend on others.
 */
const initializeServices = (app: FastifyInstance) => {
  console.log('🔧 Initializing services...');

  // 1. Database Service (no dependencies)
  const databaseService = new DatabaseService();

  // 2. DEX Router Service (no dependencies)
  const dexRouterService = new DEXRouterService();

  // 3. WebSocket Service (depends on Fastify app)
  const websocketService = new WebSocketService(app);

  // 4. Order Queue Service (depends on WebSocket, DEX Router, and Database)
  const orderQueueService = new OrderQueueService(
    websocketService,
    dexRouterService,
    databaseService
  );

  console.log('✅ All services initialized');

  return {
    databaseService,
    dexRouterService,
    websocketService,
    orderQueueService
  };
};

/**
 * Register All Routes
 * 
 * Sets up all API endpoints and passes required services to controllers.
 */
async function registerRoutes(app: FastifyInstance, services: any): Promise<void> {
  console.log('🛣️  Registering routes...');

  await registerOrderRoutes(
    app,
    services.orderQueueService,
    services.databaseService
  );

  await registerHealthRoutes(app, {
    database: services.databaseService,
    dexRouter: services.dexRouterService,
    orderQueue: services.orderQueueService,
    websocket: services.websocketService
  });

  app.register(require('@fastify/cors'), {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://your-frontend-domain.com']
      : true,
    credentials: true,
  });
  console.log('✅ All routes registered');
}


/**
 * Setup Global Error Handlers
 * 
 * Catches unhandled errors and provides meaningful responses.
 */
// Add this after initializing Fastify
const setupErrorHandlers = (app: FastifyInstance) => {
  // Handle validation errors as 400 instead of 500
  app.setErrorHandler((error, request, reply) => {
    // If Fastify validation error (Ajv)
    if (error.validation) {
      let msg = error.message;
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

    // Handle Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation
      });
    }

    // Default error handling
    console.error('🚨 Unhandled error:', error);
    
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : error.name,
      message: process.env.NODE_ENV === 'production' 
        ? 'An error occurred' 
        : error.message
    });
  });
};


/**
 * Main Application Function
 * 
 * Orchestrates the entire application startup process.
 */
const startApplication = async (): Promise<void> => {
  try {
    console.log('🚀 Starting Order Execution Engine...');

    // Initialize Fastify
    const app = initializeFastify();

    // Register WebSocket plugin
    await app.register(fastifyWebsocket);

    // Initialize services
    const services = initializeServices(app);

    // Wait for database connection
    console.log('🔌 Checking database connection...');
    const dbHealthy = await services.databaseService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    console.log('✅ Database connected');

    // Register routes
    await registerRoutes(app, services);

    // In your registerRoutes function
async function registerRoutes(app: FastifyInstance, services: any): Promise<void> {
  console.log('🛣️  Registering routes...');

  // Make sure all services are passed
  await registerHealthRoutes(app, {
    database: services.databaseService,
    dexRouter: services.dexRouterService, 
    orderQueue: services.orderQueueService,
    websocket: services.websocketService
  });

  await registerOrderRoutes(
    app, 
    services.orderQueueService, 
    services.databaseService
  );
};


    // Setup error handlers
    setupErrorHandlers(app);

    // Start server
    await app.listen({ 
      port: PORT, 
      host: HOST 
    });

    console.log(`🌟 Server running at http://${HOST}:${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
    console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
    
    // Setup graceful shutdown
    setupGracefulShutdown(app, services);

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * Graceful Shutdown Handler
 * 
 * Properly closes all connections and services when the app shuts down.
 */
const setupGracefulShutdown = (app: FastifyInstance, services: any): void => {
  const shutdown = async (signal: string) => {
    console.log(`\n🚦 Received ${signal}, starting graceful shutdown...`);
    
    try {
      // Stop accepting new requests
      console.log('⏹️  Stopping server...');
      await app.close();
      
      // Shutdown queue service (this also closes Redis connections)
      console.log('📤 Shutting down queue service...');
      await services.orderQueueService.shutdown();
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Listen for shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
};

// Start the application
startApplication();

// Export for testing
export default startApplication;
