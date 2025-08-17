/**
 * Database Configuration
 * 
 * Centralized database connection configuration with proper
 * connection pooling for high-performance operations.
 */

import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// 💡 Beginner Tip: Connection pooling is essential for performance
// It reuses database connections instead of creating new ones for each query
const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'order_execution_engine',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  
  // Connection pool settings for high performance
  max: 20,                      // Maximum connections in pool
  min: 5,                       // Minimum connections to maintain
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout for new connections
  
  // 🏗️ Architecture Note: These settings optimize for order processing workload
  statement_timeout: 5000,       // 5 second query timeout
  query_timeout: 5000,          // 5 second total timeout
};

export const db = new Pool(dbConfig);

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await db.end();
  process.exit(0);
});

// Connection health check
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const client = await db.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};
