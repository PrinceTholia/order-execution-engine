-- Order Execution Engine Database Schema
-- 
-- This schema is designed for high-performance order processing with proper
-- indexing for fast lookups and efficient queue operations.

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 📊 Orders Table
-- 
-- Central table storing all order information. Optimized for fast status
-- lookups and efficient queue processing.
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    
    -- Order details
    type VARCHAR(20) NOT NULL DEFAULT 'market',
    base_token VARCHAR(20) NOT NULL,
    quote_token VARCHAR(20) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Execution results
    execution_price DECIMAL(20, 8),
    executed_amount DECIMAL(20, 8),
    selected_dex VARCHAR(20),
    transaction_hash VARCHAR(128),
    
    -- Error handling
    error_message TEXT,
    
    -- Constraints
    CONSTRAINT valid_amount CHECK (amount > 0),
    CONSTRAINT valid_status CHECK (status IN (
        'pending', 'processing', 'routing', 'executing', 
        'completed', 'failed', 'cancelled'
    )),
    CONSTRAINT valid_dex CHECK (selected_dex IS NULL OR selected_dex IN (
        'raydium', 'meteora'
    ))
);

-- 📈 DEX Routes Table
-- 
-- Stores routing information and price quotes from different DEXes.
-- Useful for analytics and debugging routing decisions.
CREATE TABLE dex_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Route details
    provider VARCHAR(20) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    liquidity DECIMAL(20, 8) NOT NULL,
    estimated_gas INTEGER NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    
    -- Metadata
    is_selected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_provider CHECK (provider IN ('raydium', 'meteora'))
);

-- 📊 Order Events Table
-- 
-- Audit trail of all order status changes. Essential for debugging
-- and providing detailed order history to users.
CREATE TABLE order_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(30) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    message TEXT,
    
    -- Additional data (stored as JSON for flexibility)
    event_data JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 🔍 Performance Indexes
-- 
-- These indexes are crucial for fast query performance under load.

-- Primary lookup indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- DEX routes indexes
CREATE INDEX idx_dex_routes_order_id ON dex_routes(order_id);
CREATE INDEX idx_dex_routes_provider ON dex_routes(provider);
CREATE INDEX idx_dex_routes_selected ON dex_routes(is_selected) WHERE is_selected = TRUE;

-- Order events indexes
CREATE INDEX idx_order_events_order_id ON order_events(order_id);
CREATE INDEX idx_order_events_created_at ON order_events(created_at DESC);

-- 🔄 Automatic Updated_At Trigger
-- 
-- Automatically updates the updated_at timestamp when order records change.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 📋 Useful Views for Development
-- 
-- These views make it easier to query order data during development.

-- Active orders view
CREATE VIEW active_orders AS
SELECT 
    id,
    user_id,
    base_token || '/' || quote_token AS trading_pair,
    side,
    amount,
    status,
    created_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) AS age_seconds
FROM orders
WHERE status NOT IN ('completed', 'failed', 'cancelled');

-- Order summary view
CREATE VIEW order_summary AS
SELECT 
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_seconds
FROM orders
GROUP BY status;
