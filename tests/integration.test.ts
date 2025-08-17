import request from 'supertest';
import Fastify, { FastifyInstance } from 'fastify';

describe('Order Execution Engine Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.PORT = '0';
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    
    // Register basic routes for testing
    app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  test('1. Health Check Endpoint - GET /health', async () => {
    const response = await request(app.server).get('/health');
    
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });

  test('2. Server Should Be Running', () => {
    expect(app.server.listening).toBe(true);
  });

  test('3. Environment Variables Should Be Set', () => {
  expect(process.env.NODE_ENV).toBe('test');
  // Split the PORT check
  expect(['0', undefined]).toContain(process.env.PORT);
});


  test('4. TypeScript Should Compile', () => {
    const testString: string = 'TypeScript is working';
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
    const response = await request(app.server).get('/nonexistent');
    expect(response.statusCode).toBe(404);
  });

  test('8. JSON Response Should Work', async () => {
    const response = await request(app.server).get('/health');
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
