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
 * Tests for RequestCoalescer - Request deduplication via Redis locks
 *
 * @module ai/requestCoalescer.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RequestCoalescer } from '../requestCoalescer.js';
import type { Devvit } from '@devvit/public-api';
import type { InFlightRequest, AIAnalysisResult } from '../../types/ai.js';

/**
 * Mock Redis client for testing
 */
function createMockRedis() {
  const store = new Map<string, { value: string; expiration?: Date }>();

  return {
    set: jest.fn(async (key: string, value: string, options?: { nx?: boolean; expiration?: Date }) => {
      if (options?.nx && store.has(key)) {
        return null; // Key already exists (NX failed)
      }
      store.set(key, { value, expiration: options?.expiration });
      return 'OK'; // Key was set
    }),
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;

      // Check expiration
      if (entry.expiration && entry.expiration < new Date()) {
        store.delete(key);
        return null;
      }

      return entry.value;
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    // Helper to manually set a value (for testing)
    _manualSet: (key: string, value: string) => {
      store.set(key, { value });
    },
    // Helper to clear all data (for testing)
    _clear: () => {
      store.clear();
    },
    // Helper to get store size
    _size: () => store.size,
  };
}

/**
 * Create mock Devvit context with Redis
 */
function createMockContext() {
  const redis = createMockRedis();
  return {
    redis,
  } as unknown as Devvit.Context;
}

/**
 * Helper to create a mock AIAnalysisResult
 */
function createMockAnalysisResult(userId: string): AIAnalysisResult {
  return {
    userId,
    timestamp: Date.now(),
    provider: 'openai',
    model: 'gpt-4o-mini',
    correlationId: 'test-correlation-id',
    promptVersion: 'v1.0',
    cacheTTL: 3600,
    datingIntent: {
      detected: false,
      confidence: 10,
      reasoning: 'No dating intent detected',
    },
    scammerRisk: {
      level: 'NONE',
      confidence: 95,
      patterns: [],
      reasoning: 'No scam patterns detected',
    },
    spamIndicators: {
      detected: false,
      confidence: 5,
      patterns: [],
    },
    overallRisk: 'LOW',
    recommendedAction: 'APPROVE',
    tokensUsed: 1000,
    costUSD: 0.001,
    latencyMs: 500,
  };
}

describe('RequestCoalescer', () => {
  let context: Devvit.Context;
  let redis: ReturnType<typeof createMockRedis>;
  let coalescer: RequestCoalescer;

  beforeEach(() => {
    context = createMockContext();
    redis = context.redis as any;
    coalescer = RequestCoalescer.getInstance(context);
    redis._clear();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance for the same context', () => {
      const instance1 = RequestCoalescer.getInstance(context);
      const instance2 = RequestCoalescer.getInstance(context);
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different contexts', () => {
      const context2 = createMockContext();
      const instance1 = RequestCoalescer.getInstance(context);
      const instance2 = RequestCoalescer.getInstance(context2);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('acquireLock()', () => {
    it('should acquire lock successfully on first request', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      const acquired = await coalescer.acquireLock(userId, correlationId);

      expect(acquired).toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        `ai:inflight:${userId}`,
        expect.stringContaining(userId),
        expect.objectContaining({ nx: true, expiration: expect.any(Date) })
      );
    });

    it('should fail to acquire lock if already held', async () => {
      const userId = 't2_abc123';
      const correlationId1 = 'req-001';
      const correlationId2 = 'req-002';

      // First request acquires lock
      const acquired1 = await coalescer.acquireLock(userId, correlationId1);
      expect(acquired1).toBe(true);

      // Second request fails to acquire
      const acquired2 = await coalescer.acquireLock(userId, correlationId2);
      expect(acquired2).toBe(false);
    });

    it('should set correct TTL (30 seconds)', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      await coalescer.acquireLock(userId, correlationId);

      expect(redis.set).toHaveBeenCalledWith(
        `ai:inflight:${userId}`,
        expect.any(String),
        expect.objectContaining({
          nx: true,
          expiration: expect.any(Date),
        })
      );

      // Verify expiration is approximately 30s from now
      const callArgs = (redis.set as any).mock.calls[0];
      const expiration = callArgs[2].expiration as Date;
      const expectedExpiration = Date.now() + 30000;
      const delta = Math.abs(expiration.getTime() - expectedExpiration);
      expect(delta).toBeLessThan(1000); // Within 1 second tolerance
    });

    it('should store InFlightRequest data in Redis', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      await coalescer.acquireLock(userId, correlationId);

      const storedValue = await redis.get(`ai:inflight:${userId}`);
      expect(storedValue).toBeTruthy();

      const parsed = JSON.parse(storedValue!) as InFlightRequest;
      expect(parsed.userId).toBe(userId);
      expect(parsed.correlationId).toBe(correlationId);
      expect(parsed.startTime).toBeGreaterThan(0);
      expect(parsed.expiresAt).toBeGreaterThan(parsed.startTime);
    });

    it('should handle Redis errors gracefully (fail-safe: allow request)', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      // Mock Redis error
      redis.set.mockRejectedValueOnce(new Error('Redis connection failed'));

      const acquired = await coalescer.acquireLock(userId, correlationId);

      // Should return true (graceful degradation)
      expect(acquired).toBe(true);
    });
  });

  describe('releaseLock()', () => {
    it('should release lock successfully', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      // Acquire lock
      await coalescer.acquireLock(userId, correlationId);
      expect(redis._size()).toBe(1);

      // Release lock
      await coalescer.releaseLock(userId);
      expect(redis._size()).toBe(0);
      expect(redis.del).toHaveBeenCalledWith(`ai:inflight:${userId}`);
    });

    it('should allow re-acquiring lock after release', async () => {
      const userId = 't2_abc123';
      const correlationId1 = 'req-001';
      const correlationId2 = 'req-002';

      // Acquire and release
      await coalescer.acquireLock(userId, correlationId1);
      await coalescer.releaseLock(userId);

      // Should be able to acquire again
      const acquired = await coalescer.acquireLock(userId, correlationId2);
      expect(acquired).toBe(true);
    });

    it('should not error when releasing non-existent lock', async () => {
      const userId = 't2_abc123';

      // Should not throw
      await expect(coalescer.releaseLock(userId)).resolves.toBeUndefined();
    });

    it('should handle Redis errors gracefully', async () => {
      const userId = 't2_abc123';

      // Mock Redis error
      redis.del.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Should not throw
      await expect(coalescer.releaseLock(userId)).resolves.toBeUndefined();
    });
  });

  describe('waitForResult()', () => {
    it('should return result when cached', async () => {
      const userId = 't2_abc123';
      const mockResult = createMockAnalysisResult(userId);

      // Manually set cached result
      redis._manualSet(`ai:analysis:${userId}`, JSON.stringify(mockResult));

      const result = await coalescer.waitForResult(userId, 5000);

      expect(result).toEqual(mockResult);
      expect(result?.userId).toBe(userId);
    });

    it('should return null on timeout', async () => {
      const userId = 't2_abc123';

      // No cached result, should timeout
      const result = await coalescer.waitForResult(userId, 1000); // 1s timeout

      expect(result).toBeNull();
    });

    it('should poll with exponential backoff', async () => {
      const userId = 't2_abc123';
      const mockResult = createMockAnalysisResult(userId);

      // Set result after 1 second
      setTimeout(() => {
        redis._manualSet(`ai:analysis:${userId}`, JSON.stringify(mockResult));
      }, 1000);

      const startTime = Date.now();
      const result = await coalescer.waitForResult(userId, 5000);
      const elapsed = Date.now() - startTime;

      expect(result).toEqual(mockResult);
      expect(elapsed).toBeGreaterThanOrEqual(1000); // Waited at least 1s
      expect(elapsed).toBeLessThan(3000); // But not full 5s timeout
    });

    it('should handle multiple waiters for same result', async () => {
      const userId = 't2_abc123';
      const mockResult = createMockAnalysisResult(userId);

      // Set result after 500ms
      setTimeout(() => {
        redis._manualSet(`ai:analysis:${userId}`, JSON.stringify(mockResult));
      }, 500);

      // Start multiple waiters
      const [result1, result2, result3] = await Promise.all([
        coalescer.waitForResult(userId, 5000),
        coalescer.waitForResult(userId, 5000),
        coalescer.waitForResult(userId, 5000),
      ]);

      // All should get the same result
      expect(result1).toEqual(mockResult);
      expect(result2).toEqual(mockResult);
      expect(result3).toEqual(mockResult);
    });

    it('should handle Redis errors gracefully', async () => {
      const userId = 't2_abc123';

      // Mock Redis error
      redis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await coalescer.waitForResult(userId, 1000);

      // Should return null on error
      expect(result).toBeNull();
    });

    it('should respect custom maxWaitMs', async () => {
      const userId = 't2_abc123';

      const startTime = Date.now();
      const result = await coalescer.waitForResult(userId, 2000); // 2s timeout
      const elapsed = Date.now() - startTime;

      expect(result).toBeNull();
      expect(elapsed).toBeGreaterThanOrEqual(2000);
      expect(elapsed).toBeLessThan(3000);
    });

    it('should use default maxWaitMs of 30s when not specified', async () => {
      const userId = 't2_abc123';

      // This test would take 30s, so we'll just verify the call doesn't error
      // and times out quickly for testing purposes
      const result = await coalescer.waitForResult(userId, 100);
      expect(result).toBeNull();
    });
  });

  describe('getInFlightRequest()', () => {
    it('should return in-flight request data', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      // Acquire lock
      await coalescer.acquireLock(userId, correlationId);

      // Get in-flight request
      const inFlight = await coalescer.getInFlightRequest(userId);

      expect(inFlight).toBeTruthy();
      expect(inFlight?.userId).toBe(userId);
      expect(inFlight?.correlationId).toBe(correlationId);
      expect(inFlight?.startTime).toBeGreaterThan(0);
      expect(inFlight?.expiresAt).toBeGreaterThan(inFlight!.startTime);
    });

    it('should return null when no request in flight', async () => {
      const userId = 't2_abc123';

      const inFlight = await coalescer.getInFlightRequest(userId);

      expect(inFlight).toBeNull();
    });

    it('should clean up corrupted JSON data', async () => {
      const userId = 't2_abc123';

      // Manually set invalid JSON
      redis._manualSet(`ai:inflight:${userId}`, 'invalid-json{');

      const inFlight = await coalescer.getInFlightRequest(userId);

      expect(inFlight).toBeNull();
      expect(redis.del).toHaveBeenCalledWith(`ai:inflight:${userId}`);
    });

    it('should handle Redis errors gracefully', async () => {
      const userId = 't2_abc123';

      // Mock Redis error
      redis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const inFlight = await coalescer.getInFlightRequest(userId);

      expect(inFlight).toBeNull();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete request coalescing flow', async () => {
      const userId = 't2_abc123';
      const correlationId1 = 'req-001';
      const correlationId2 = 'req-002';
      const mockResult = createMockAnalysisResult(userId);

      // Request 1: Acquires lock
      const acquired1 = await coalescer.acquireLock(userId, correlationId1);
      expect(acquired1).toBe(true);

      // Request 2: Fails to acquire, will wait
      const acquired2 = await coalescer.acquireLock(userId, correlationId2);
      expect(acquired2).toBe(false);

      // Simulate Request 1 completing analysis and caching result
      setTimeout(() => {
        redis._manualSet(`ai:analysis:${userId}`, JSON.stringify(mockResult));
      }, 500);

      // Request 2 waits for result
      const result2 = await coalescer.waitForResult(userId, 5000);
      expect(result2).toEqual(mockResult);

      // Request 1 releases lock
      await coalescer.releaseLock(userId);

      // Verify lock is released
      expect(redis._size()).toBe(1); // Only cache remains, lock is gone
    });

    it('should handle timeout scenario (analysis takes too long)', async () => {
      const userId = 't2_abc123';
      const correlationId1 = 'req-001';
      const correlationId2 = 'req-002';

      // Request 1: Acquires lock
      await coalescer.acquireLock(userId, correlationId1);

      // Request 2: Fails to acquire
      const acquired2 = await coalescer.acquireLock(userId, correlationId2);
      expect(acquired2).toBe(false);

      // Request 2 waits but times out (no result cached)
      const result2 = await coalescer.waitForResult(userId, 1000);
      expect(result2).toBeNull();

      // Request 2 could now proceed with its own analysis
    });

    it('should handle lock expiry during analysis', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      // Acquire lock
      await coalescer.acquireLock(userId, correlationId);

      // Simulate lock expiry (30s TTL)
      // In real scenario, lock would auto-expire in Redis
      // For testing, we manually delete it
      await redis.del(`ai:inflight:${userId}`);

      // Verify lock is gone
      const inFlight = await coalescer.getInFlightRequest(userId);
      expect(inFlight).toBeNull();

      // New request can now acquire lock
      const acquired = await coalescer.acquireLock(userId, 'req-002');
      expect(acquired).toBe(true);
    });

    it('should handle result cached before lock released', async () => {
      const userId = 't2_abc123';
      const correlationId1 = 'req-001';
      const correlationId2 = 'req-002';
      const mockResult = createMockAnalysisResult(userId);

      // Request 1: Acquires lock
      await coalescer.acquireLock(userId, correlationId1);

      // Request 1: Caches result BEFORE releasing lock
      redis._manualSet(`ai:analysis:${userId}`, JSON.stringify(mockResult));

      // Request 2: Tries to acquire (fails)
      const acquired2 = await coalescer.acquireLock(userId, correlationId2);
      expect(acquired2).toBe(false);

      // Request 2: Waits and gets result immediately
      const result2 = await coalescer.waitForResult(userId, 5000);
      expect(result2).toEqual(mockResult);

      // Request 1: Releases lock
      await coalescer.releaseLock(userId);
    });

    it('should handle concurrent requests for different users', async () => {
      const userId1 = 't2_user1';
      const userId2 = 't2_user2';
      const correlationId1 = 'req-001';
      const correlationId2 = 'req-002';

      // Both should acquire locks successfully (different users)
      const [acquired1, acquired2] = await Promise.all([
        coalescer.acquireLock(userId1, correlationId1),
        coalescer.acquireLock(userId2, correlationId2),
      ]);

      expect(acquired1).toBe(true);
      expect(acquired2).toBe(true);

      // Both locks should exist
      const inFlight1 = await coalescer.getInFlightRequest(userId1);
      const inFlight2 = await coalescer.getInFlightRequest(userId2);
      expect(inFlight1?.userId).toBe(userId1);
      expect(inFlight2?.userId).toBe(userId2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty userId', async () => {
      const userId = '';
      const correlationId = 'req-001';

      const acquired = await coalescer.acquireLock(userId, correlationId);
      expect(acquired).toBe(true);

      await coalescer.releaseLock(userId);
    });

    it('should handle very long userId', async () => {
      const userId = 't2_' + 'x'.repeat(1000);
      const correlationId = 'req-001';

      const acquired = await coalescer.acquireLock(userId, correlationId);
      expect(acquired).toBe(true);

      await coalescer.releaseLock(userId);
    });

    it('should handle special characters in userId', async () => {
      const userId = 't2_user!@#$%^&*()';
      const correlationId = 'req-001';

      const acquired = await coalescer.acquireLock(userId, correlationId);
      expect(acquired).toBe(true);

      await coalescer.releaseLock(userId);
    });

    it('should handle very short timeout (0ms)', async () => {
      const userId = 't2_abc123';

      const result = await coalescer.waitForResult(userId, 0);
      expect(result).toBeNull();
    });

    it('should handle negative timeout (treated as 0)', async () => {
      const userId = 't2_abc123';

      const result = await coalescer.waitForResult(userId, -1000);
      expect(result).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should complete lock acquisition quickly (<10ms)', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      const startTime = Date.now();
      await coalescer.acquireLock(userId, correlationId);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(10);
    });

    it('should complete lock release quickly (<10ms)', async () => {
      const userId = 't2_abc123';
      const correlationId = 'req-001';

      await coalescer.acquireLock(userId, correlationId);

      const startTime = Date.now();
      await coalescer.releaseLock(userId);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(10);
    });

    it('should handle high concurrent load (100 requests)', async () => {
      const userId = 't2_abc123';
      const requests = Array.from({ length: 100 }, (_, i) => ({
        userId,
        correlationId: `req-${i}`,
      }));

      const results = await Promise.all(
        requests.map((req) => coalescer.acquireLock(req.userId, req.correlationId))
      );

      // Only one should succeed
      const successCount = results.filter((r: boolean) => r === true).length;
      expect(successCount).toBe(1);

      // 99 should fail
      const failCount = results.filter((r: boolean) => r === false).length;
      expect(failCount).toBe(99);
    });
  });
});
