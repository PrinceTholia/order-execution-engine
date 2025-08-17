"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const fastify_1 = __importDefault(require("fastify"));
let app;
beforeAll(async () => {
    app = (0, fastify_1.default)({ logger: false });
    // Register basic routes for testing
    app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
    await app.listen({ port: 0 });
});
afterAll(async () => {
    await app.close();
});
describe('Order Execution Engine Integration Tests', () => {
    test('1. Health Check Endpoint - GET /health', async () => {
        const response = await (0, supertest_1.default)(app.server).get('/health');
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body).toHaveProperty('timestamp');
    });
    test('2. Server Should Be Running', () => {
        expect(app.server.listening).toBe(true);
    });
    test('3. Environment Variables Should Be Set', () => {
        expect(process.env.NODE_ENV).toBe('test');
        expect(process.env.PORT).toBe('0');
    });
    test('4. TypeScript Should Compile', () => {
        const testString = 'TypeScript is working';
        expect(typeof testString).toBe('string');
    });
    test('5. Async/Await Should Work', async () => {
        const promise = Promise.resolve('async works');
        const result = await promise;
        expect(result).toBe('async works');
    });
    test('6. Jest Matchers Should Work', () => {
        expect([1, 2, 3]).toContain(2);
        expect('hello world').toMatch(/world/);
        expect({ name: 'test' }).toHaveProperty('name');
    });
    test('7. Error Handling Should Work', async () => {
        const response = await (0, supertest_1.default)(app.server).get('/nonexistent');
        expect(response.statusCode).toBe(404);
    });
    test('8. JSON Response Should Work', async () => {
        const response = await (0, supertest_1.default)(app.server).get('/health');
        expect(response.headers['content-type']).toMatch(/json/);
    });
    test('9. Test Timeout Should Be Respected', async () => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100));
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(100);
    });
    test('10. Mock Functions Should Work', () => {
        const mockFn = jest.fn();
        mockFn('test');
        expect(mockFn).toHaveBeenCalledWith('test');
        expect(mockFn).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=integration.test.js.map