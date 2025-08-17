"use strict";
/**
 * Queue Integration Tests
 *
 * Tests BullMQ queue behavior and job processing
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
describe('Queue Integration', () => {
    let queue;
    let connection;
    beforeAll(async () => {
        connection = new ioredis_1.default({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: null
        });
        queue = new bullmq_1.Queue('test-queue', { connection });
    });
    afterAll(async () => {
        await queue.close();
        connection.disconnect();
    });
    beforeEach(async () => {
        // Clean queue before each test
        await queue.obliterate({ force: true });
    });
    it('should add jobs to queue successfully', async () => {
        await queue.add('test-job', { orderId: 'test-123', data: 'test data' });
        const waiting = await queue.getWaiting();
        expect(waiting).toHaveLength(1);
        expect(waiting[0].data.orderId).toBe('test-123');
    });
    it('should process jobs with worker', async () => {
        const processedJobs = [];
        const worker = new bullmq_1.Worker('test-queue', async (job) => {
            processedJobs.push(job.data);
            return { success: true };
        }, { connection, concurrency: 1 });
        // Add job to queue
        await queue.add('test-job', { orderId: 'worker-test-456' });
        // Wait for processing
        await new Promise(resolve => {
            worker.on('completed', resolve);
        });
        expect(processedJobs).toHaveLength(1);
        expect(processedJobs[0].orderId).toBe('worker-test-456');
        await worker.close();
    });
    it('should respect concurrency limits', async () => {
        let concurrentJobs = 0;
        let maxConcurrency = 0;
        const worker = new bullmq_1.Worker('test-queue', async (job) => {
            concurrentJobs++;
            maxConcurrency = Math.max(maxConcurrency, concurrentJobs);
            // Simulate work
            await new Promise(resolve => setTimeout(resolve, 100));
            concurrentJobs--;
            return { success: true };
        }, { connection, concurrency: 2 }); // Max 2 concurrent
        // Add 5 jobs quickly
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(queue.add('test-job', { jobNumber: i }));
        }
        await Promise.all(promises);
        // Wait for all jobs to complete
        let completedCount = 0;
        await new Promise(resolve => {
            worker.on('completed', () => {
                completedCount++;
                if (completedCount === 5)
                    resolve(undefined);
            });
        });
        expect(maxConcurrency).toBeLessThanOrEqual(2);
        await worker.close();
    });
});
//# sourceMappingURL=queue.test.js.map