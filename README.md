# 🚀 Order Execution Engine

A **high-performance DEX order execution engine** that processes market orders with real-time WebSocket updates and intelligent routing between Raydium and Meteora exchanges.

![System Status](https://img.shields.io/badge/Status-Live-brightgreen) ![Build](https://img.shields.io/badge/Build-Passing-success) ![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue)


## 🌐 Live System

**🔗 Production URL**: https://order-execution-engine.onrender.com

### API Endpoints
- **Health Check**: `GET https://order-execution-engine.onrender.com/health`
- **Order Execution**: `POST https://order-execution-engine.onrender.com/orders/execute`
- **WebSocket**: `wss://order-execution-engine.onrender.com/ws`

### Quick Test
```
curl https://order-execution-engine.onrender.com/health
# Expected: {"status":"ok","timestamp":"2025-08-17T..."}
```


## 🏗️ Architecture Overview

This system implements a **production-ready market order execution engine** with the following components:

- **🌐 HTTP API**: Accepts order submissions with immediate order ID response
- **⚡ WebSocket Server**: Real-time bi-directional communication for order status updates
- **🔀 DEX Router**: Intelligent price comparison and routing between Raydium and Meteora
- **📊 Queue System**: Concurrent order processing with Redis-backed persistence
- **💾 Database**: Secure PostgreSQL storage for order history and audit trails


## 🚀 Key Features

- **⚡ High Concurrency**: Processes up to **10 simultaneous orders** through Redis-backed BullMQ queues
- **🎛️ Rate Limiting**: Intelligent throughput control at **100 orders/minute** for system stability
- **🔄 Real-time Updates**: WebSocket-driven status streaming (`pending → routing → executing → completed`)
- **🛡️ Robust Retry Logic**: Exponential backoff strategy with **3 retry attempts**
- **☁️ Cloud-Ready**: Production deployment with health monitoring and graceful shutdown
- **🔐 Type Safety**: Full TypeScript implementation with compile-time error prevention


## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Runtime** | Node.js 22 + TypeScript | Async I/O and type safety |
| **Web Framework** | Fastify | High-performance HTTP server |
| **Queue System** | BullMQ + Redis | Reliable job processing |
| **Database** | PostgreSQL | ACID-compliant data persistence |
| **Real-time** | WebSocket | Bi-directional communication |
| **Cloud Services** | Render + Upstash | Managed deployment and Redis |
| **Testing** | Jest | Unit and integration tests |


## 📋 Setup Instructions

### Prerequisites
- **Node.js** v18+ 
- **PostgreSQL** v13+
- **Redis** v6+ (or managed service)
- **Git**

### 🔧 Local Development

**1. Clone the repository**
```
git clone https://github.com/PrinceTholia/order-execution-engine.git
cd order-execution-engine
```

**2. Install dependencies**
```
npm install
```

**3. Environment configuration**

Create `.env` file:
```
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=order_execution_db

# Redis Configuration  
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

**Alternative: Use connection URLs**
```
DATABASE_URL=postgresql://user:password@host:5432/database
REDIS_URL=redis://default:password@host:port
```

**4. Database setup**
```
-- Connect to PostgreSQL and run:
CREATE DATABASE order_execution_db;

-- Run the schema (located in scripts/001_initial_schema.sql)
\i scripts/001_initial_schema.sql
```

**5. Start development server**
```
npm run dev
```

Visit `http://localhost:3000/health` to verify setup.

**6. Production build**
```
npm run build
npm start
```


## 🏛️ System Design Decisions

### **Architecture Patterns**
- **🏗️ Microservices-Inspired**: Each service has single responsibility with clear interfaces
- **📡 Event-Driven**: WebSocket updates triggered by queue processing events  
- **🔄 Publisher-Subscriber**: Real-time order status broadcasting to interested clients
- **🏭 Factory Pattern**: Dependency injection for service initialization
- **📦 Repository Pattern**: Abstracted data access layer for maintainability

### **Performance Optimizations**
- **⚡ Non-blocking I/O**: Node.js event loop for concurrent request handling
- **🔗 Connection Pooling**: Efficient database connection reuse
- **💾 Redis Caching**: Queue state persistence and fast lookups  
- **📊 Selective Broadcasting**: WebSocket updates sent only to relevant users
- **⚖️ Load Balancing**: Concurrent worker processing with rate limiting

### **Reliability Features**
- **🔄 Retry Mechanisms**: Exponential backoff for transient failures
- **💾 Job Persistence**: Queue survives system restarts
- **🏥 Health Monitoring**: Multi-layer system health checks
- **🛡️ Error Boundaries**: Graceful degradation during partial service failures
- **📋 Audit Trail**: Complete order history for compliance and debugging


## 📊 API Documentation

### **Order Submission**
```
POST /orders/execute
Content-Type: application/json

{
  "baseToken": "SOL",
  "quoteToken": "USDC", 
  "amount": 2.5,
  "side": "buy"
}
```

**Response:**
```
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Order received and queued for processing",
  "timestamp": "2025-08-17T14:30:00.000Z"
}
```

### **WebSocket Connection**
```
const ws = new WebSocket('wss://order-execution-engine.onrender.com/ws?userId=user123');

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Order status:', update);
  // Example: {orderId: "...", status: "routing", progress: 40}
};
```

### **Health Check**
```
GET /health

Response: {"status":"ok","timestamp":"2025-08-17T14:30:00.000Z"}
```


## 🧪 Testing

**Run the test suite:**
```
npm test                # Run all tests
npm run test:coverage   # Run with coverage report  
npm run test:watch      # Run in watch mode
```

**Test Coverage:**
- ✅ **DEX Routing Logic**: Price comparison and route selection
- ✅ **Queue Behavior**: Concurrent processing and retry mechanisms
- ✅ **WebSocket Lifecycle**: Connection management and message flow
- ✅ **Database Operations**: Order CRUD and transaction handling
- ✅ **API Endpoints**: Request validation and response formatting


## 📈 Performance Metrics

| Metric | Value | Description |
|--------|-------|-------------|
| **Concurrent Orders** | 10 | Maximum simultaneous order processing |
| **Throughput** | 100/min | Rate-limited orders per minute |
| **Response Time** | 

**Built with ❤️ for high-performance DEX trading**

⭐ If this project helped you, consider giving it a star!
