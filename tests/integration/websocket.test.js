"use strict";
/**
 * WebSocket Integration Tests
 *
 * Tests the complete WebSocket lifecycle including connection,
 * message handling, and proper cleanup.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const ws_1 = __importDefault(require("ws"));
const websocket_service_1 = require("../../src/services/websocket/websocket.service");
describe('WebSocket Integration', () => {
    let app;
    let websocketService;
    const port = 3001; // Different port for testing
    beforeAll(async () => {
        // Setup test server
        app = (0, fastify_1.default)({ logger: false }); // Disable logs in tests
        await app.register(websocket_1.default);
        websocketService = new websocket_service_1.WebSocketService(app);
        await app.listen({ port });
    });
    afterAll(async () => {
        await app.close();
    });
    it('should establish WebSocket connection with valid userId', (done) => {
        const ws = new ws_1.default(`ws://localhost:${port}/ws?userId=test-user-123`);
        ws.on('open', () => {
            expect(ws.readyState).toBe(ws_1.default.OPEN);
            ws.close();
        });
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            // Should receive connection established message
            expect(message.type).toBe('connection_established');
            expect(message.userId).toBe('test-user-123');
            expect(message.data.connectionId).toBeDefined();
            done();
        });
        ws.on('error', (error) => {
            done(error);
        });
    });
    it('should reject connection without userId', (done) => {
        const ws = new ws_1.default(`ws://localhost:${port}/ws`);
        ws.on('close', (code, reason) => {
            expect(code).toBe(1008); // Policy violation
            done();
        });
        ws.on('error', () => {
            // Expected behavior
        });
    });
    it('should handle ping/pong messages', (done) => {
        const ws = new ws_1.default(`ws://localhost:${port}/ws?userId=ping-test-user`);
        ws.on('open', () => {
            // Send ping message
            ws.send(JSON.stringify({ type: 'ping' }));
        });
        let messageCount = 0;
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            messageCount++;
            if (messageCount === 1) {
                // First message: connection established
                expect(message.type).toBe('connection_established');
            }
            else if (messageCount === 2) {
                // Second message: pong response
                expect(message.data.type).toBe('pong');
                ws.close();
                done();
            }
        });
    });
    it('should send order status updates to correct user', async () => {
        const userId = 'status-test-user';
        const orderId = 'test-order-456';
        return new Promise((resolve, reject) => {
            const ws = new ws_1.default(`ws://localhost:${port}/ws?userId=${userId}`);
            ws.on('open', async () => {
                // Wait a bit for connection to be registered
                setTimeout(async () => {
                    try {
                        await websocketService.sendOrderUpdate(userId, {
                            orderId: orderId,
                            oldStatus: 'pending',
                            newStatus: 'processing',
                            message: 'Order is now processing',
                            progress: 25
                        });
                    }
                    catch (error) {
                        reject(error);
                    }
                }, 100);
            });
            let receivedConnectionMsg = false;
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (!receivedConnectionMsg) {
                    receivedConnectionMsg = true;
                    return; // Skip connection established message
                }
                // This should be our order update
                expect(message.type).toBe('order_status_update');
                expect(message.orderId).toBe(orderId);
                expect(message.data.newStatus).toBe('processing');
                expect(message.data.progress).toBe(25);
                ws.close();
                resolve(undefined);
            });
            ws.on('error', reject);
        });
    });
});
//# sourceMappingURL=websocket.test.js.map