# Order Execution Engine

A high-performance order execution engine that processes market orders with DEX routing and real-time WebSocket status updates.

## 🏗️ Architecture Overview

This system implements a market order execution engine with the following key components:

- **HTTP API**: Accepts order submissions and returns immediate order IDs
- **WebSocket Server**: Provides real-time order status updates
- **DEX Router**: Compares prices between Raydium and Meteora DEXes
- **Queue System**: Manages concurrent order processing (up to 10 orders)
- **Database**: Persists order data and audit trails

### Why Market Orders?

**Choice: Market Orders**

Market orders were chosen for this implementation because they provide the optimal balance between technical complexity and demonstrable functionality within the 48-hour timeline. They showcase DEX routing capabilities through immediate price comparison and execution, while maintaining straightforward testing scenarios that clearly demonstrate the system's queue management and real-time update capabilities.

**Extension Path**: The architecture supports easy extension to limit orders (add price monitoring) and sniper orders (add event listening) through the existing routing and queue infrastructure.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

### Installation

1. **Clone the repository**
