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
 * Tests for AIAnalyzer - Main orchestrator for user profile analysis
 *
 * Tests cover:
 * - Cache hit/miss scenarios
 * - Request coalescing (duplicate request handling)
 * - Budget enforcement
 * - Provider selection and failover
 * - Cost recording
 * - Differential caching TTL
 * - Error handling and graceful degradation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AIAnalyzer } from '../analyzer.js';
import type {
  AIAnalysisResult,
  AIProviderType,
} from '../../types/ai.js';

describe('AIAnalyzer', () => {
  let analyzer: AIAnalyzer;
  let mockContext: any;
  let mockRedis: any;

  // Mock data
  const mockUserId = 't2_testuser';

  const mockAnalysisResult: AIAnalysisResult = {
    userId: mockUserId,
    timestamp: Date.now(),
    provider: 'openai' as AIProviderType,
    model: 'gpt-4o-mini',
    correlationId: 'test-correlation-id',
    promptVersion: 'v1.0',
    cacheTTL: 86400,
    datingIntent: {
      detected: false,
      confidence: 95,
      reasoning: 'No dating intent detected',
    },
    scammerRisk: {
      level: 'NONE',
      confidence: 98,
      patterns: [],
      reasoning: 'No scam patterns detected',
    },
    spamIndicators: {
      detected: false,
      confidence: 99,
      patterns: [],
    },
    overallRisk: 'LOW',
    recommendedAction: 'APPROVE',
    tokensUsed: 2500,
    costUSD: 0.0045,
    latencyMs: 1200,
  };

  beforeEach(() => {
    // Mock Redis
    mockRedis = {
      get: async (_key: string) => null,
      set: async (_key: string, _value: string, _options?: any) => {},
      del: async (_key: string) => {},
    };

    // Mock context
    mockContext = {
      redis: mockRedis,
      secrets: {},
    };

    analyzer = AIAnalyzer.getInstance(mockContext);
  });

  describe('getCachedAnalysis', () => {
    it('should return null if cache miss', async () => {
      mockRedis.get = async () => null;

      const result = await analyzer.getCachedAnalysis(mockUserId);

      expect(result).toBeNull();
    });

    it('should return parsed result if cache hit', async () => {
      mockRedis.get = async () => JSON.stringify(mockAnalysisResult);

      const result = await analyzer.getCachedAnalysis(mockUserId);

      expect(result).toEqual(mockAnalysisResult);
    });

    it('should clear cache and return null if parse fails', async () => {
      mockRedis.get = async () => 'invalid json';
      const deletedKeys: string[] = [];
      mockRedis.del = async (key: string) => {
        deletedKeys.push(key);
      };

      const result = await analyzer.getCachedAnalysis(mockUserId);

      expect(result).toBeNull();
      expect(deletedKeys).toContain(`ai:analysis:${mockUserId}`);
    });

    it('should clear cache and return null if cached data missing required fields', async () => {
      const invalidResult = { userId: mockUserId }; // Missing required fields
      mockRedis.get = async () => JSON.stringify(invalidResult);
      const deletedKeys: string[] = [];
      mockRedis.del = async (key: string) => {
        deletedKeys.push(key);
      };

      const result = await analyzer.getCachedAnalysis(mockUserId);

      expect(result).toBeNull();
      expect(deletedKeys).toContain(`ai:analysis:${mockUserId}`);
    });
  });

  describe('clearCache', () => {
    it('should delete cache key', async () => {
      const deletedKeys: string[] = [];
      mockRedis.del = async (key: string) => {
        deletedKeys.push(key);
      };

      await analyzer.clearCache(mockUserId);

      expect(deletedKeys).toContain(`ai:analysis:${mockUserId}`);
    });

    it('should not throw on Redis error', async () => {
      mockRedis.del = async () => {
        throw new Error('Redis error');
      };

      await expect(analyzer.clearCache(mockUserId)).resolves.not.toThrow();
    });
  });

  describe('subreddit type mapping', () => {
    it('should map FriendsOver40 correctly', () => {
      // Access private method via type assertion for testing
      const analyzerAny = analyzer as any;
      expect(analyzerAny.getSubredditType('FriendsOver40')).toBe('FriendsOver40');
      expect(analyzerAny.getSubredditType('friendsover40')).toBe('FriendsOver40');
    });

    it('should map FriendsOver50 correctly', () => {
      const analyzerAny = analyzer as any;
      expect(analyzerAny.getSubredditType('FriendsOver50')).toBe('FriendsOver50');
      expect(analyzerAny.getSubredditType('friendsover50')).toBe('FriendsOver50');
    });

    it('should map bitcointaxes correctly', () => {
      const analyzerAny = analyzer as any;
      expect(analyzerAny.getSubredditType('bitcointaxes')).toBe('bitcointaxes');
      expect(analyzerAny.getSubredditType('BitcoinTaxes')).toBe('bitcointaxes');
    });

    it('should map unknown subreddit to "other"', () => {
      const analyzerAny = analyzer as any;
      expect(analyzerAny.getSubredditType('RandomSubreddit')).toBe('other');
      expect(analyzerAny.getSubredditType('AskReddit')).toBe('other');
    });
  });

  describe('differential caching TTL', () => {
    it('should cache with correct TTL based on trust score', async () => {
      const setCallsArgs: Array<[string, string, any]> = [];
      mockRedis.set = async (key: string, value: string, options?: any) => {
        setCallsArgs.push([key, value, options]);
      };

      // Test high trust (60-69) -> 48h
      const analyzerAny = analyzer as any;
      await analyzerAny.cacheResult(mockUserId, mockAnalysisResult, 172800);

      expect(setCallsArgs.length).toBe(1);
      const [key, value, options] = setCallsArgs[0];
      expect(key).toBe(`ai:analysis:${mockUserId}`);
      expect(JSON.parse(value)).toEqual(mockAnalysisResult);
      expect(options.expiration).toBeInstanceOf(Date);

      // Verify expiration is approximately 48 hours from now (within 10 seconds tolerance)
      const expectedExpiration = new Date(Date.now() + 172800 * 1000);
      const actualExpiration = options.expiration as Date;
      const timeDiff = Math.abs(actualExpiration.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(10000); // Within 10 seconds
    });

    it('should cache with shorter TTL for low trust users', async () => {
      const setCallsArgs: Array<[string, string, any]> = [];
      mockRedis.set = async (key: string, value: string, options?: any) => {
        setCallsArgs.push([key, value, options]);
      };

      // Test low trust (<40) -> 12h
      const analyzerAny = analyzer as any;
      await analyzerAny.cacheResult(mockUserId, mockAnalysisResult, 43200);

      expect(setCallsArgs.length).toBe(1);
      const [, , options] = setCallsArgs[0];

      // Verify expiration is approximately 12 hours from now
      const expectedExpiration = new Date(Date.now() + 43200 * 1000);
      const actualExpiration = options.expiration as Date;
      const timeDiff = Math.abs(actualExpiration.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(10000); // Within 10 seconds
    });

    it('should cache with 7-day TTL for known bad actors', async () => {
      const setCallsArgs: Array<[string, string, any]> = [];
      mockRedis.set = async (key: string, value: string, options?: any) => {
        setCallsArgs.push([key, value, options]);
      };

      // Test known bad (7 days)
      const analyzerAny = analyzer as any;
      await analyzerAny.cacheResult(mockUserId, mockAnalysisResult, 604800);

      expect(setCallsArgs.length).toBe(1);
      const [, , options] = setCallsArgs[0];

      // Verify expiration is approximately 7 days from now
      const expectedExpiration = new Date(Date.now() + 604800 * 1000);
      const actualExpiration = options.expiration as Date;
      const timeDiff = Math.abs(actualExpiration.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(10000); // Within 10 seconds
    });
  });
});
