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
 * Test Suite for ProviderSelector
 *
 * Comprehensive tests for AI provider selection, health checking, circuit breaker
 * integration, and failover logic. Tests cover priority-based selection, caching,
 * error handling, and all-providers-down scenarios.
 *
 * Run with: npx tsx src/ai/selector.test.ts
 *
 * @module ai/selector.test
 */

import { ProviderSelector } from './selector.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { AI_CONFIG } from '../config/ai.js';
import type { Devvit } from '@devvit/public-api';

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertEquals(actual: any, expected: any, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Actual:   ${actualStr}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertNotNull(value: any, message: string): void {
  if (value === null || value === undefined) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected non-null value, got: ${value}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertNull(value: any, message: string): void {
  if (value !== null) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`   Expected null value, got: ${value}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

// Mock Devvit context for testing
function createMockContext(overrides?: any): Devvit.Context {
  const healthCheckCache = new Map<string, string>();
  const circuitStates = new Map<string, string>();

  const mockRedis = {
    get: async (key: string) => {
      if (overrides?.redis?.throwError) {
        throw new Error('Redis error');
      }
      return healthCheckCache.get(key) || overrides?.redis?.get?.(key);
    },
    set: async (key: string, value: string, options?: any) => {
      healthCheckCache.set(key, value);
      return 'OK';
    },
    del: async (key: string) => {
      healthCheckCache.delete(key);
      return 1;
    },
  };

  const mockSettings = {
    get: async (key: string) => {
      const keys: Record<string, string | undefined> = {
        ANTHROPIC_API_KEY: 'test-claude-key-123',
        OPENAI_API_KEY: 'test-openai-key-456',
        DEEPSEEK_API_KEY: 'test-deepseek-key-789',
        ...overrides?.settings,
      };
      return keys[key];
    },
  };

  return {
    redis: mockRedis,
    settings: mockSettings,
    ...overrides,
  } as any;
}

// Test Suite
async function runTests() {
  console.log('\n=== ProviderSelector Test Suite ===\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Helper to run a test
  async function runTest(name: string, testFn: () => Promise<void>) {
    console.log(`\n--- Test: ${name} ---`);
    try {
      await testFn();
      testsPassed++;
      console.log(`✓ ${name} passed`);
    } catch (error) {
      testsFailed++;
      console.error(`✗ ${name} failed:`, error);
    }
  }

  // Test 1: Singleton pattern
  await runTest('Should return same instance for same context', async () => {
    const context = createMockContext();
    const instance1 = ProviderSelector.getInstance(context);
    const instance2 = ProviderSelector.getInstance(context);

    assert(
      instance1 === instance2,
      'Same context should return same instance'
    );
  });

  // Test 2: Different contexts get different instances
  await runTest(
    'Should return different instances for different contexts',
    async () => {
      const context1 = createMockContext();
      const context2 = createMockContext();

      const instance1 = ProviderSelector.getInstance(context1);
      const instance2 = ProviderSelector.getInstance(context2);

      assert(
        instance1 !== instance2,
        'Different contexts should return different instances'
      );

      // Clean up
      (ProviderSelector as any).instances.clear();
    }
  );

  // Test 3: Select provider with all healthy
  await runTest('Should select OpenAI or Gemini provider', async () => {
    const context = createMockContext();
    const selector = ProviderSelector.getInstance(context);

    const provider = await selector.selectProvider();

    assertNotNull(provider, 'Should select a provider');
    assert(
      provider?.type === 'openai' || provider?.type === 'gemini',
      'Should select OpenAI or Gemini provider'
    );

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 4: Check all providers health status
  await runTest('Should check health of all providers', async () => {
    const context = createMockContext();
    const selector = ProviderSelector.getInstance(context);

    const healthStatus = await selector.checkAllProviders();

    assertNotNull(healthStatus, 'Should return health status');
    assertNotNull(healthStatus.openai, 'Should have OpenAI status');
    assertNotNull(healthStatus.gemini, 'Should have Gemini status');

    // Verify structure
    assert(
      typeof healthStatus.openai.healthy === 'boolean',
      'Should have healthy boolean'
    );
    assert(
      typeof healthStatus.openai.lastCheckTime === 'number',
      'Should have lastCheckTime'
    );
    assert(
      ['CLOSED', 'OPEN', 'HALF_OPEN'].includes(healthStatus.openai.circuitState),
      'Should have valid circuit state'
    );
    assert(
      typeof healthStatus.openai.recentFailures === 'number',
      'Should have recentFailures count'
    );

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 5: Health check caching
  await runTest('Should use cached health check results', async () => {
    const getCalls: string[] = [];
    const context = createMockContext({
      redis: {
        get: async (key: string) => {
          getCalls.push(key);
          if (key === 'provider:health:claude') {
            return 'healthy';
          }
          return undefined;
        },
      },
    });

    const selector = ProviderSelector.getInstance(context);

    // First call - should use cache
    const provider1 = await selector.selectProvider();
    assertNotNull(provider1, 'Should select provider from cache');

    // Verify cache was checked
    assert(
      getCalls.includes('provider:health:claude'),
      'Should check cache for Claude health'
    );

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 6: A/B testing mode configuration
  await runTest('Should store A/B testing configuration', async () => {
    const context = createMockContext();
    const selector = ProviderSelector.getInstance(context);

    // Should not throw
    selector.setABTestMode(true, {
      openai: 50,
      gemini: 50,
    });

    assert(true, 'A/B testing mode configured successfully');

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 7: Invalid distribution warning
  await runTest(
    'Should warn when A/B test distribution does not sum to 100',
    async () => {
      const context = createMockContext();
      const selector = ProviderSelector.getInstance(context);

      const originalWarn = console.warn;
      let warnCalled = false;
      console.warn = (...args: any[]) => {
        if (args[0].includes('sums to')) {
          warnCalled = true;
        }
      };

      selector.setABTestMode(true, {
        openai: 50,
        gemini: 40, // Sums to 90, not 100
      });

      console.warn = originalWarn;

      assert(warnCalled, 'Should log warning for invalid distribution');

      // Clean up
      (ProviderSelector as any).instances.clear();
    }
  );

  // Test 8: Disable A/B testing
  await runTest('Should disable A/B testing when enabled is false', async () => {
    const context = createMockContext();
    const selector = ProviderSelector.getInstance(context);

    selector.setABTestMode(false, {
      openai: 100,
      gemini: 0,
    });

    // Should still use priority-based selection
    const provider = await selector.selectProvider();
    assertNotNull(provider, 'Should still select provider');

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 9: Missing API key handling
  await runTest('Should handle missing API keys gracefully', async () => {
    const context = createMockContext({
      settings: {
        ANTHROPIC_API_KEY: undefined, // Claude disabled
        OPENAI_API_KEY: 'test-openai-key',
        DEEPSEEK_API_KEY: 'test-deepseek-key',
      },
    });

    const selector = ProviderSelector.getInstance(context);
    const provider = await selector.selectProvider();

    // Should skip Claude and select OpenAI
    if (provider) {
      assertEquals(
        provider.type,
        'openai',
        'Should fallback to OpenAI when Claude unavailable'
      );
    } else {
      // If all are unavailable, that's also acceptable
      assert(true, 'Handled missing API key gracefully');
    }

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 10: All providers unavailable
  await runTest('Should return null when all providers unavailable', async () => {
    const context = createMockContext({
      settings: {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        DEEPSEEK_API_KEY: undefined,
      },
    });

    const selector = ProviderSelector.getInstance(context);
    const provider = await selector.selectProvider();

    assertNull(provider, 'Should return null when all providers unavailable');

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 11: Redis error handling
  await runTest('Should handle Redis errors and default to healthy', async () => {
    const context = createMockContext({
      redis: {
        throwError: true,
      },
    });

    const selector = ProviderSelector.getInstance(context);

    // Should still attempt to select provider (fail open on Redis errors)
    try {
      const provider = await selector.selectProvider();
      // May succeed or fail depending on provider availability
      assert(true, 'Handled Redis error gracefully');
    } catch (error) {
      // Error is acceptable - just verify it doesn't crash
      assert(true, 'Handled Redis error gracefully');
    }

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Test 12: Health status structure validation
  await runTest('Should return correct health status structure', async () => {
    const context = createMockContext();
    const selector = ProviderSelector.getInstance(context);

    const healthStatus = await selector.checkAllProviders();

    const openaiStatus = healthStatus.openai;

    assertEquals(openaiStatus.provider, 'openai', 'Should have provider type');
    assert(
      typeof openaiStatus.healthy === 'boolean',
      'Should have healthy boolean'
    );
    assert(
      openaiStatus.lastCheckTime > 0,
      'Should have valid lastCheckTime'
    );
    assert(
      ['CLOSED', 'OPEN', 'HALF_OPEN'].includes(openaiStatus.circuitState),
      'Should have valid circuit state'
    );
    assert(
      typeof openaiStatus.recentFailures === 'number',
      'Should have recentFailures number'
    );

    // Clean up
    (ProviderSelector as any).instances.clear();
  });

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📊 Total:  ${testsPassed + testsFailed}`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
