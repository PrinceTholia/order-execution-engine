"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dex_router_service_1 = require("../../src/services/dex-router/dex-router.service");
describe('DEX Router Service Unit Tests', () => {
    let dexRouter;
    beforeEach(() => {
        dexRouter = new dex_router_service_1.DEXRouterService();
    });
    test('Should compare Raydium and Meteora prices', async () => {
        // Mock the price fetching methods
        jest.spyOn(dexRouter, 'getRaydiumQuote').mockResolvedValue({
            provider: 'raydium',
            price: 100.50,
            fee: 0.003,
            estimatedGas: 5000
        });
        jest.spyOn(dexRouter, 'getMeteraQuote').mockResolvedValue({
            provider: 'meteora',
            price: 100.75,
            fee: 0.002,
            estimatedGas: 4500
        });
        const result = await dexRouter.findBestRoute('SOL', 'USDC', 1, 'buy');
        expect(result).toHaveProperty('bestRoute');
        expect(result.bestRoute).toHaveProperty('provider');
        expect(result.bestRoute).toHaveProperty('price');
        expect(result.bestRoute.provider).toBe('meteora'); // Better price
    });
    test('Should handle DEX routing errors gracefully', async () => {
        jest.spyOn(dexRouter, 'getRaydiumQuote').mockRejectedValue(new Error('Network error'));
        jest.spyOn(dexRouter, 'getMeteraQuote').mockRejectedValue(new Error('Network error'));
        await expect(dexRouter.findBestRoute('SOL', 'USDC', 1, 'buy'))
            .rejects.toThrow('Failed to find route');
    });
});
//# sourceMappingURL=dex-router.test.js.map