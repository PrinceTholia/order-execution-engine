"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
// Load test environment variables
(0, dotenv_1.config)({ path: '.env.test' });
// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use dynamic port for tests
// Global test timeout
jest.setTimeout(30000);
// Setup global test environment
beforeAll(async () => {
    console.log('🧪 Starting test suite...');
});
afterAll(async () => {
    console.log('✅ Test suite completed');
});
//# sourceMappingURL=setup.js.map