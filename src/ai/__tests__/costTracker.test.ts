/**
 * AI Automod - AI Automod for Reddit
 * Copyright (C) 2025 CoinsTax LLC
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Cost Tracker Tests
 *
 * Comprehensive test suite for the Cost Tracker component including:
 * - Budget enforcement
 * - Atomic cost recording (concurrent safety)
 * - Atomic budget reset
 * - Per-provider tracking
 * - Alert thresholds
 * - Spending reports
 *
 * @module ai/costTracker.test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CostTracker } from '../costTracker.js';
import type { CostRecord } from '../../types/ai.js';

/**
 * Mock Devvit context structure
 */
interface MockContext {
  redis: MockRedis;
}

/**
 * Mock Redis client implementing required Redis operations
 */
class MockRedis {
  private data: Map<string, string> = new Map();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async set(key: string, value: string, _options?: { expiration?: Date }): Promise<void> {
    this.data.set(key, value);
  }

  async incrBy(key: string, increment: number): Promise<number> {
    const current = parseInt(this.data.get(key) || '0');
    const newValue = current + increment;
    this.data.set(key, String(newValue));
    return newValue;
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  // Test helper methods
  clear(): void {
    this.data.clear();
  }

  getData(): Map<string, string> {
    return this.data;
  }
}

/**
 * Mock logger for testing
 */
class MockLogger {
  logs: Array<{ level: string; message: string; context?: any }> = [];

  info(message: string, context?: any): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: any): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, context?: any): void {
    this.logs.push({ level: 'error', message, context });
  }

  clear(): void {
    this.logs = [];
  }

  hasLogContaining(level: string, text: string): boolean {
    return this.logs.some((log) => log.level === level && log.message.includes(text));
  }
}

/**
 * Create mock Devvit context for testing
 */
function createMockContext(): MockContext {
  const mockRedis = new MockRedis();

  return {
    redis: mockRedis,
  };
}

describe('CostTracker', () => {
  let mockContext: MockContext;
  let mockRedis: MockRedis;
  let mockLogger: MockLogger;
  let costTracker: CostTracker;
  let consoleSpy: {
    log: any;
    warn: any;
    error: any;
  };

  beforeEach(() => {
    // Reset singleton instance before each test
    (CostTracker as any).instance = null;

    mockContext = createMockContext();
    mockRedis = mockContext.redis;

    // Create a mock logger for test assertions
    mockLogger = new MockLogger();

    // Spy on console methods and redirect to mockLogger
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation((msg, ctx) => {
        mockLogger.info(String(msg), ctx);
      }),
      warn: jest.spyOn(console, 'warn').mockImplementation((msg, ctx) => {
        mockLogger.warn(String(msg), ctx);
      }),
      error: jest.spyOn(console, 'error').mockImplementation((msg, ctx) => {
        mockLogger.error(String(msg), ctx);
      }),
    };

    costTracker = CostTracker.getInstance(mockContext as any);
  });

  afterEach(() => {
    // Restore console methods
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CostTracker.getInstance(mockContext as any);
      const instance2 = CostTracker.getInstance(mockContext as any);
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = CostTracker.getInstance(mockContext as any);
      (CostTracker as any).instance = null;
      const instance2 = CostTracker.getInstance(mockContext as any);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('canAfford', () => {
    it('should return true when budget is available', async () => {
      const canAfford = await costTracker.canAfford(2.5);
      expect(canAfford).toBe(true);
    });

    it('should return false when cost would exceed daily budget', async () => {
      // Set daily spending to $4.00 = 400 cents (daily limit is $5.00 = 500 cents)
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '400');

      // Try to spend $2.00 (would total $6.00, exceeding $5.00 limit)
      const canAfford = await costTracker.canAfford(2.0);
      expect(canAfford).toBe(false);
    });

    it('should return false when budget is already exceeded', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '550'); // $5.50 = 550 cents

      const canAfford = await costTracker.canAfford(0.1);
      expect(canAfford).toBe(false);
    });
  });

  describe('recordCost', () => {
    const createCostRecord = (overrides: Partial<CostRecord> = {}): CostRecord => ({
      id: 'test-' + Date.now(),
      timestamp: Date.now(),
      provider: 'openai',
      userId: 't2_testuser',
      tokensUsed: 1500,
      costUSD: 0.075,
      cached: false,
      ...overrides,
    });

    it('should record cost atomically using INCRBY (cents)', async () => {
      const record = createCostRecord({ costUSD: 0.05, provider: 'openai' });
      await costTracker.recordCost(record);

      const today = new Date().toISOString().split('T')[0];
      const month = today.substring(0, 7);

      // Verify increments were applied ($0.05 = 5 cents)
      expect(await mockRedis.get(`cost:daily:${today}`)).toBe('5');
      expect(await mockRedis.get(`cost:daily:${today}:openai`)).toBe('5');
      expect(await mockRedis.get(`cost:monthly:${month}`)).toBe('5');
    });

    it('should track per-provider costs separately', async () => {
      const today = new Date().toISOString().split('T')[0];

      await costTracker.recordCost(createCostRecord({ costUSD: 0.05, provider: 'openai' }));
      await costTracker.recordCost(createCostRecord({ costUSD: 0.1, provider: 'openai' }));
      await costTracker.recordCost(createCostRecord({ costUSD: 0.02, provider: 'gemini' }));

      // $0.05 = 5 cents, $0.10 = 10 cents, $0.02 = 2 cents, total = 17 cents
      expect(await mockRedis.get(`cost:daily:${today}:openai`)).toBe('15');
      expect(await mockRedis.get(`cost:daily:${today}:gemini`)).toBe('2');
      expect(await mockRedis.get(`cost:daily:${today}`)).toBe('17');
    });

    it('should handle concurrent cost recording without race conditions', async () => {
      // Simulate 10 concurrent API calls recording costs
      const promises = Array.from({ length: 10 }, () =>
        costTracker.recordCost(createCostRecord({ costUSD: 0.05, provider: 'openai' }))
      );

      await Promise.all(promises);

      const today = new Date().toISOString().split('T')[0];
      const total = parseInt((await mockRedis.get(`cost:daily:${today}`)) || '0');

      // Should be exactly 50 cents (10 * $0.05), no lost updates
      expect(total).toBe(50);
    });

    it('should store individual cost record with TTL', async () => {
      const record = createCostRecord();
      await costTracker.recordCost(record);

      const recordKey = `cost:record:${record.timestamp}:${record.userId}`;
      const stored = await mockRedis.get(recordKey);
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!)).toEqual(record);
    });

    it('should trigger budget alert after recording', async () => {
      // Record costs to reach 50% threshold ($2.50)
      await costTracker.recordCost(createCostRecord({ costUSD: 2.5 }));

      expect(mockLogger.hasLogContaining('warn', '50% of daily budget used')).toBe(true);
    });
  });

  describe('getBudgetStatus', () => {
    it('should return correct budget status with no spending', async () => {
      const status = await costTracker.getBudgetStatus();

      expect(status.dailyLimit).toBe(5.0);
      expect(status.dailySpent).toBe(0);
      expect(status.dailyRemaining).toBe(5.0);
      expect(status.monthlySpent).toBe(0);
      expect(status.alertLevel).toBe('NONE');
      expect(status.perProviderSpent).toEqual({
        openai: 0,
        gemini: 0,
      });
    });

    it('should return correct budget status with spending', async () => {
      const today = new Date().toISOString().split('T')[0];
      const month = today.substring(0, 7);

      // Set values in cents: $2.50 = 250, $2.00 = 200, $0.50 = 50, $15.75 = 1575
      await mockRedis.set(`cost:daily:${today}`, '250');
      await mockRedis.set(`cost:daily:${today}:openai`, '200');
      await mockRedis.set(`cost:daily:${today}:gemini`, '50');
      await mockRedis.set(`cost:monthly:${month}`, '1575');

      const status = await costTracker.getBudgetStatus();

      expect(status.dailySpent).toBe(2.5);
      expect(status.dailyRemaining).toBe(2.5);
      expect(status.monthlySpent).toBe(15.75);
      expect(status.perProviderSpent.openai).toBe(2.0);
      expect(status.perProviderSpent.gemini).toBe(0.5);
    });

    it('should calculate alert level NONE for low spending', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '100'); // $1.00 = 100 cents = 20%

      const status = await costTracker.getBudgetStatus();
      expect(status.alertLevel).toBe('NONE');
    });

    it('should calculate alert level WARNING_50 at 50% threshold', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '250'); // $2.50 = 250 cents = 50%

      const status = await costTracker.getBudgetStatus();
      expect(status.alertLevel).toBe('WARNING_50');
    });

    it('should calculate alert level WARNING_75 at 75% threshold', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '375'); // $3.75 = 375 cents = 75%

      const status = await costTracker.getBudgetStatus();
      expect(status.alertLevel).toBe('WARNING_75');
    });

    it('should calculate alert level WARNING_90 at 90% threshold', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '450'); // $4.50 = 450 cents = 90%

      const status = await costTracker.getBudgetStatus();
      expect(status.alertLevel).toBe('WARNING_90');
    });

    it('should calculate alert level EXCEEDED when over budget', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '550'); // $5.50 = 550 cents = 110%

      const status = await costTracker.getBudgetStatus();
      expect(status.alertLevel).toBe('EXCEEDED');
    });

    it('should handle missing Redis keys gracefully', async () => {
      const status = await costTracker.getBudgetStatus();

      expect(status.dailySpent).toBe(0);
      expect(status.monthlySpent).toBe(0);
      expect(status.perProviderSpent).toEqual({
        openai: 0,
        gemini: 0,
      });
    });
  });

  describe('resetDailyBudget', () => {
    it('should reset daily budget using sequential operations', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Set yesterday's spending in cents: $4.50 = 450, $3.00 = 300, $1.50 = 150
      await mockRedis.set(`cost:daily:${yesterday}`, '450');
      await mockRedis.set(`cost:daily:${yesterday}:openai`, '300');
      await mockRedis.set(`cost:daily:${yesterday}:gemini`, '150');

      // Reset budget
      await costTracker.resetDailyBudget();

      // Yesterday's total should be archived (in cents)
      expect(await mockRedis.get(`cost:archive:${yesterday}`)).toBe('450');

      // Yesterday's keys should be deleted
      expect(await mockRedis.get(`cost:daily:${yesterday}`)).toBeUndefined();
      expect(await mockRedis.get(`cost:daily:${yesterday}:openai`)).toBeUndefined();
      expect(await mockRedis.get(`cost:daily:${yesterday}:gemini`)).toBeUndefined();

      // Today's keys should be initialized to '0'
      expect(await mockRedis.get(`cost:daily:${today}`)).toBe('0');
      expect(await mockRedis.get(`cost:daily:${today}:openai`)).toBe('0');
      expect(await mockRedis.get(`cost:daily:${today}:gemini`)).toBe('0');
    });

    it('should preserve existing today spending when resetting', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Set some today spending (e.g., from late-night activity): $1.25 = 125 cents
      await mockRedis.set(`cost:daily:${today}`, '125');
      await mockRedis.set(`cost:daily:${today}:openai`, '125');

      await costTracker.resetDailyBudget();

      // Today's spending should remain (get/set pattern doesn't overwrite existing)
      expect(await mockRedis.get(`cost:daily:${today}`)).toBe('125');
      expect(await mockRedis.get(`cost:daily:${today}:openai`)).toBe('125');
    });

    it('should log successful budget reset', async () => {
      await costTracker.resetDailyBudget();
      expect(mockLogger.hasLogContaining('info', 'Daily budget reset completed')).toBe(true);
    });
  });

  describe('getSpendingReport', () => {
    it('should generate spending report for specified days', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Set spending for today in cents: $2.50 = 250, $2.00 = 200, $0.50 = 50
      await mockRedis.set(`cost:daily:${today}`, '250');
      await mockRedis.set(`cost:daily:${today}:openai`, '200');
      await mockRedis.set(`cost:daily:${today}:gemini`, '50');

      const report = await costTracker.getSpendingReport(1);

      expect(report.startDate).toBe(today);
      expect(report.endDate).toBe(today);
      expect(report.totalSpent).toBe(2.5);
      expect(report.dailySpending).toHaveLength(1);
      expect(report.dailySpending[0].totalUSD).toBe(2.5);
      expect(report.dailySpending[0].perProvider.openai).toBe(2.0);
      expect(report.dailySpending[0].perProvider.gemini).toBe(0.5);
    });

    it('should generate multi-day spending report', async () => {
      const today = new Date();
      const dates = Array.from({ length: 3 }, (_, i) => {
        const date = new Date(today.getTime() - i * 86400000);
        return date.toISOString().split('T')[0];
      });

      // Set spending for 3 days in cents: $1.00 = 100, $2.00 = 200, $1.50 = 150
      await mockRedis.set(`cost:daily:${dates[0]}`, '100');
      await mockRedis.set(`cost:daily:${dates[1]}`, '200');
      await mockRedis.set(`cost:daily:${dates[2]}`, '150');

      const report = await costTracker.getSpendingReport(3);

      expect(report.dailySpending).toHaveLength(3);
      expect(report.totalSpent).toBe(4.5);
    });

    it('should calculate provider breakdown correctly', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Set values in cents: $3.00 = 300, $2.00 = 200, $1.00 = 100
      await mockRedis.set(`cost:daily:${today}`, '300');
      await mockRedis.set(`cost:daily:${today}:openai`, '200');
      await mockRedis.set(`cost:daily:${today}:gemini`, '100');

      const report = await costTracker.getSpendingReport(1);

      const openaiBreakdown = report.providerBreakdown.find(
        (p: { provider: string }) => p.provider === 'openai'
      );
      const geminiBreakdown = report.providerBreakdown.find(
        (p: { provider: string }) => p.provider === 'gemini'
      );

      expect(openaiBreakdown?.totalUSD).toBe(2.0);
      expect(geminiBreakdown?.totalUSD).toBe(1.0);
    });

    it('should limit report to 90 days maximum', async () => {
      const report = await costTracker.getSpendingReport(100);
      expect(report.dailySpending).toHaveLength(90);
    });

    it('should handle missing data gracefully', async () => {
      const report = await costTracker.getSpendingReport(7);

      expect(report.totalSpent).toBe(0);
      expect(report.dailySpending).toHaveLength(7);
      expect(report.dailySpending[0].totalUSD).toBe(0);
    });
  });

  describe('checkBudgetAlert', () => {
    it('should log warning at 50% threshold', async () => {
      // Record $2.50 worth of costs to hit 50% threshold
      await costTracker.recordCost({
        id: 'test-alert-50',
        timestamp: Date.now(),
        provider: 'openai',
        userId: 't2_test',
        tokensUsed: 5000,
        costUSD: 2.5,
        cached: false,
      });

      expect(mockLogger.hasLogContaining('warn', '50% of daily budget used')).toBe(true);
    });

    it('should log warning at 75% threshold', async () => {
      // Record $3.75 worth of costs to hit 75% threshold
      await costTracker.recordCost({
        id: 'test-alert-75',
        timestamp: Date.now(),
        provider: 'openai',
        userId: 't2_test',
        tokensUsed: 7500,
        costUSD: 3.75,
        cached: false,
      });

      expect(mockLogger.hasLogContaining('warn', '75% of daily budget used')).toBe(true);
    });

    it('should log critical at 90% threshold', async () => {
      // Record $4.50 worth of costs to hit 90% threshold
      await costTracker.recordCost({
        id: 'test-alert-90',
        timestamp: Date.now(),
        provider: 'openai',
        userId: 't2_test',
        tokensUsed: 9000,
        costUSD: 4.5,
        cached: false,
      });

      expect(mockLogger.hasLogContaining('warn', 'CRITICAL: 90% of daily budget used')).toBe(
        true
      );
    });

    it('should log error when budget exceeded', async () => {
      // Record $5.50 worth of costs to exceed budget
      await costTracker.recordCost({
        id: 'test-alert-exceeded',
        timestamp: Date.now(),
        provider: 'openai',
        userId: 't2_test',
        tokensUsed: 11000,
        costUSD: 5.5,
        cached: false,
      });

      expect(mockLogger.hasLogContaining('error', 'BUDGET EXCEEDED')).toBe(true);
    });

    it('should not log when budget usage is below 50%', async () => {
      mockLogger.clear();

      // Record $1.00 worth of costs (20% of budget)
      await costTracker.recordCost({
        id: 'test-no-alert',
        timestamp: Date.now(),
        provider: 'openai',
        userId: 't2_test',
        tokensUsed: 2000,
        costUSD: 1.0,
        cached: false,
      });

      // Should not have any budget-related warnings
      const budgetLogs = mockLogger.logs.filter((log) => log.message.includes('budget'));
      expect(budgetLogs).toHaveLength(0);
    });
  });

  describe('Integration: Budget Enforcement Flow', () => {
    it('should enforce budget across multiple operations', async () => {
      const record = {
        id: 'test-1',
        timestamp: Date.now(),
        provider: 'openai' as const,
        userId: 't2_test',
        tokensUsed: 1000,
        costUSD: 1.5,
        cached: false,
      };

      // Record 3 costs (total $4.50, just under $5.00 limit)
      await costTracker.recordCost({ ...record, id: 'test-1', costUSD: 1.5 });
      await costTracker.recordCost({ ...record, id: 'test-2', costUSD: 1.5 });
      await costTracker.recordCost({ ...record, id: 'test-3', costUSD: 1.5 });

      // Check if we can afford more
      expect(await costTracker.canAfford(0.5)).toBe(true);
      expect(await costTracker.canAfford(1.0)).toBe(false);

      const status = await costTracker.getBudgetStatus();
      expect(status.dailySpent).toBe(4.5);
      expect(status.alertLevel).toBe('WARNING_90');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small costs (sub-cent precision)', async () => {
      const record = {
        id: 'test-small',
        timestamp: Date.now(),
        provider: 'gemini' as const,
        userId: 't2_test',
        tokensUsed: 100,
        costUSD: 0.001, // Will round to 0 cents
        cached: false,
      };

      await costTracker.recordCost(record);

      const today = new Date().toISOString().split('T')[0];
      const spentCents = parseInt((await mockRedis.get(`cost:daily:${today}`)) || '0');
      // $0.001 rounds to 0 cents (Math.round(0.1) = 0)
      expect(spentCents).toBe(0);
    });

    it('should handle zero cost (cached results)', async () => {
      const record = {
        id: 'test-cached',
        timestamp: Date.now(),
        provider: 'openai' as const,
        userId: 't2_test',
        tokensUsed: 0,
        costUSD: 0,
        cached: true,
      };

      await costTracker.recordCost(record);

      const today = new Date().toISOString().split('T')[0];
      const spentCents = parseInt((await mockRedis.get(`cost:daily:${today}`)) || '0');
      expect(spentCents).toBe(0);
    });

    it('should handle negative remaining budget gracefully', async () => {
      const today = new Date().toISOString().split('T')[0];
      await mockRedis.set(`cost:daily:${today}`, '600'); // $6.00 = 600 cents (over budget)

      const status = await costTracker.getBudgetStatus();
      expect(status.dailyRemaining).toBe(0); // Should be clamped to 0
    });
  });
});
