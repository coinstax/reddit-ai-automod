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
 * Tests for PromptManager
 *
 * Covers:
 * - Prompt version selection with consistent hashing
 * - Prompt building with variable substitution
 * - Content sanitization integration
 * - Post history formatting
 * - Metrics recording and retrieval
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PromptManager, promptManager } from '../prompts.js';
import { UserProfile, UserPostHistory } from '../../types/profile.js';
import { RedisClient } from '@devvit/public-api';

/**
 * Mock Redis client implementing required Redis operations
 */
class MockRedis {
  private data: Map<string, Map<string, string>> = new Map();

  async hIncrBy(key: string, field: string, increment: number): Promise<number> {
    if (!this.data.has(key)) {
      this.data.set(key, new Map());
    }
    const hash = this.data.get(key)!;
    const currentValue = parseInt(hash.get(field) || '0', 10);
    const newValue = currentValue + increment;
    hash.set(field, newValue.toString());
    return newValue;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const hash = this.data.get(key);
    if (!hash) return {};

    const result: Record<string, string> = {};
    hash.forEach((value, field) => {
      result[field] = value;
    });
    return result;
  }

  // Test helper methods
  clear(): void {
    this.data.clear();
  }

  getData(): Map<string, Map<string, string>> {
    return this.data;
  }
}

// Sample test data
const mockProfile: UserProfile = {
  userId: 't2_testuser123',
  username: 'testuser',
  accountAgeInDays: 365,
  commentKarma: 400,
  postKarma: 200,
  totalKarma: 600,
  emailVerified: true,
  isModerator: false,
  hasUserFlair: false,
  hasPremium: false,
  isVerified: false,
  fetchedAt: new Date(),
};

const mockPostHistory: UserPostHistory = {
  userId: 't2_testuser123',
  username: 'testuser',
  items: [
    {
      id: 't1_post1',
      type: 'post',
      subreddit: 'FriendsOver40',
      content: 'Looking for friends - Hi everyone, new here!',
      score: 5,
      createdAt: new Date(Date.now() - 1000 * 60 * 60),
    },
    {
      id: 't1_comment1',
      type: 'comment',
      subreddit: 'FriendsOver40',
      content: 'Thanks for the warm welcome!',
      score: 2,
      createdAt: new Date(Date.now() - 500 * 60 * 60),
    },
    {
      id: 't1_post2',
      type: 'post',
      subreddit: 'FriendsOver40',
      content: 'Hello world - Just saying hi',
      score: 3,
      createdAt: new Date(Date.now() - 2000 * 60 * 60),
    },
  ],
  metrics: {
    totalItems: 3,
    postsInTargetSubs: 2,
    postsInDatingSubs: 0,
    averageScore: 3.33,
    oldestItemDate: new Date(Date.now() - 2000 * 60 * 60),
    newestItemDate: new Date(Date.now() - 500 * 60 * 60),
  },
  totalPosts: 2,
  totalComments: 1,
  subreddits: ['FriendsOver40', 'AskReddit'],
  fetchedAt: new Date(),
};

describe('PromptManager', () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager();
  });

  describe('selectPromptVersion', () => {
    it('should return a valid prompt version', () => {
      const version = manager.selectPromptVersion('t2_testuser123');

      expect(version).toBeDefined();
      expect(version.version).toBeDefined();
      expect(version.prompt).toBeDefined();
      expect(version.enabled).toBe(true);
      expect(version.weight).toBeGreaterThan(0);
    });

    it('should consistently assign same user to same version', () => {
      const userId = 't2_testuser123';

      const version1 = manager.selectPromptVersion(userId);
      const version2 = manager.selectPromptVersion(userId);
      const version3 = manager.selectPromptVersion(userId);

      expect(version1.version).toBe(version2.version);
      expect(version2.version).toBe(version3.version);
    });

    it('should distribute users across versions based on weights', () => {
      const versionCounts = new Map<string, number>();
      const totalUsers = 1000;

      // Test with many different user IDs
      for (let i = 0; i < totalUsers; i++) {
        const userId = `t2_user${i}`;
        const version = manager.selectPromptVersion(userId);

        const count = versionCounts.get(version.version) || 0;
        versionCounts.set(version.version, count + 1);
      }

      // With 80/20 split, we expect roughly 800 v1.0 and 200 v1.1-dating-focus
      // Allow for some variance (±10%)
      const v1Count = versionCounts.get('v1.0') || 0;
      const v11Count = versionCounts.get('v1.1-dating-focus') || 0;

      expect(v1Count).toBeGreaterThan(700); // 80% - 10% = 70%
      expect(v1Count).toBeLessThan(900); // 80% + 10% = 90%
      expect(v11Count).toBeGreaterThan(100); // 20% - 10% = 10%
      expect(v11Count).toBeLessThan(300); // 20% + 10% = 30%
    });

    it('should handle different user ID formats', () => {
      const userIds = [
        't2_abc123',
        't2_xyz789',
        't2_longuseridherewithnumbers12345',
        't2_1',
      ];

      for (const userId of userIds) {
        const version = manager.selectPromptVersion(userId);
        expect(version).toBeDefined();
        expect(version.version).toBeDefined();
      }
    });
  });

  describe('buildPrompt', () => {
    it('should build a complete prompt with all variables substituted', async () => {
      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Looking for friends',
          body: 'Hi everyone!',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.piiRemoved).toBe(0); // No PII in test data
      expect(result.urlsRemoved).toBe(0); // No URLs in test data

      // Verify variable substitution
      expect(result.prompt).toContain('testuser');
      expect(result.prompt).toContain('365'); // Account age
      expect(result.prompt).toContain('600'); // Total karma
      expect(result.prompt).toContain('Yes'); // Email verified
      expect(result.prompt).toContain('No'); // Is moderator
      expect(result.prompt).toContain('FriendsOver40');
      expect(result.prompt).toContain('Looking for friends');
      expect(result.prompt).toContain('Hi everyone!');

      // Should not contain template variables
      expect(result.prompt).not.toContain('{username}');
      expect(result.prompt).not.toContain('{accountAge}');
      expect(result.prompt).not.toContain('{postHistory}');
    });

    it('should sanitize PII from post content', async () => {
      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Contact me',
          body: 'Email me at test@example.com or call 555-123-4567',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      // Should have removed email and phone
      expect(result.piiRemoved).toBe(2);
      expect(result.prompt).toContain('[EMAIL]');
      expect(result.prompt).toContain('[PHONE]');
      expect(result.prompt).not.toContain('test@example.com');
      expect(result.prompt).not.toContain('555-123-4567');
    });

    it('should sanitize URLs from post content', async () => {
      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Check this out',
          body: 'Visit https://example.com for more info',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.urlsRemoved).toBe(1);
      expect(result.prompt).toContain('[URL]');
      expect(result.prompt).not.toContain('https://example.com');
    });

    it('should format post history correctly', async () => {
      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      // Should include post and comment markers
      expect(result.prompt).toContain('[POST in r/FriendsOver40]');
      expect(result.prompt).toContain('[COMMENT in r/FriendsOver40]');

      // Should include post content
      expect(result.prompt).toContain('Looking for friends');
      expect(result.prompt).toContain('Thanks for the warm welcome!');
    });

    it('should handle empty post history', async () => {
      const emptyHistory: UserPostHistory = {
        userId: 't2_testuser123',
        username: 'testuser',
        items: [],
        metrics: {
          totalItems: 0,
          postsInTargetSubs: 0,
          postsInDatingSubs: 0,
          averageScore: 0,
          oldestItemDate: new Date(),
          newestItemDate: new Date(),
        },
        totalPosts: 0,
        totalComments: 0,
        subreddits: [],
        fetchedAt: new Date(),
      };

      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: emptyHistory,
        currentPost: {
          title: 'First post',
          body: 'This is my first post',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toContain('(No post history available)');
    });

    it('should limit post history to 20 most recent items', async () => {
      // Create post history with 25 items
      const largeHistory: UserPostHistory = {
        userId: 't2_testuser123',
        username: 'testuser',
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `t1_${i}`,
          type: (i % 2 === 0 ? 'post' : 'comment') as 'post' | 'comment',
          subreddit: 'FriendsOver40',
          content: `Content ${i}`,
          score: 1,
          createdAt: new Date(Date.now() - i * 1000),
        })),
        metrics: {
          totalItems: 25,
          postsInTargetSubs: 13,
          postsInDatingSubs: 0,
          averageScore: 1,
          oldestItemDate: new Date(Date.now() - 24 * 1000),
          newestItemDate: new Date(),
        },
        totalPosts: 13,
        totalComments: 12,
        subreddits: ['FriendsOver40'],
        fetchedAt: new Date(),
      };

      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: largeHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      // Should contain most recent items
      expect(result.prompt).toContain('Content 0');
      expect(result.prompt).toContain('Content 19');

      // Should NOT contain older items (beyond 20)
      expect(result.prompt).not.toContain('Content 20');
      expect(result.prompt).not.toContain('Content 24');
    });

    it('should use correct subreddit description', async () => {
      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver50',
        },
        subredditType: 'FriendsOver50',
      });

      expect(result.prompt).toContain(
        'a community for people aged 50+ to make platonic friendships'
      );
    });

    it('should handle unverified email', async () => {
      const unverifiedProfile: UserProfile = {
        ...mockProfile,
        emailVerified: false,
      };

      const result = await manager.buildPrompt({
        profile: unverifiedProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toContain('Email verified: No');
    });

    it('should handle moderator accounts', async () => {
      const modProfile: UserProfile = {
        ...mockProfile,
        isModerator: true,
      };

      const result = await manager.buildPrompt({
        profile: modProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toContain('Is moderator: Yes');
    });

    it('should use consistent prompt version for same user', async () => {
      const result1 = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test 1',
          body: 'Test 1',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      const result2 = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test 2',
          body: 'Test 2',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result1.version).toBe(result2.version);
    });
  });

  describe('recordUsage', () => {
    let mockRedis: RedisClient;

    beforeEach(() => {
      mockRedis = new MockRedis() as unknown as RedisClient;
    });

    it('should record correct usage', async () => {
      await manager.recordUsage('v1.0', 'correct', mockRedis);

      const data = await mockRedis.hGetAll('prompt:v1.0:metrics');

      expect(data.uses).toBe('1');
      expect(data.correct).toBe('1');
    });

    it('should record false positive usage', async () => {
      await manager.recordUsage('v1.0', 'false_positive', mockRedis);

      const data = await mockRedis.hGetAll('prompt:v1.0:metrics');

      expect(data.uses).toBe('1');
      expect(data.false_positive).toBe('1');
    });

    it('should record false negative usage', async () => {
      await manager.recordUsage('v1.1-dating-focus', 'false_negative', mockRedis);

      const data = await mockRedis.hGetAll('prompt:v1.1-dating-focus:metrics');

      expect(data.uses).toBe('1');
      expect(data.false_negative).toBe('1');
    });

    it('should accumulate multiple usage records', async () => {
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'false_positive', mockRedis);

      const data = await mockRedis.hGetAll('prompt:v1.0:metrics');

      expect(data.uses).toBe('3');
      expect(data.correct).toBe('2');
      expect(data.false_positive).toBe('1');
    });
  });

  describe('getMetrics', () => {
    let mockRedis: RedisClient;

    beforeEach(() => {
      mockRedis = new MockRedis() as unknown as RedisClient;
    });

    it('should return null for version with no data', async () => {
      const metrics = await manager.getMetrics('v1.0', mockRedis);

      expect(metrics).toBeNull();
    });

    it('should retrieve and calculate metrics correctly', async () => {
      // Record some usage
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'false_positive', mockRedis);
      await manager.recordUsage('v1.0', 'false_negative', mockRedis);

      const metrics = await manager.getMetrics('v1.0', mockRedis);

      expect(metrics).toBeDefined();
      expect(metrics!.version).toBe('v1.0');
      expect(metrics!.uses).toBe(5);
      expect(metrics!.correct).toBe(3);
      expect(metrics!.falsePositives).toBe(1);
      expect(metrics!.falseNegatives).toBe(1);

      // Accuracy = 3 / (3 + 1 + 1) = 0.6
      expect(metrics!.accuracy).toBeCloseTo(0.6);

      // False positive rate = 1 / (3 + 1 + 1) = 0.2
      expect(metrics!.falsePositiveRate).toBeCloseTo(0.2);
    });

    it('should handle zero outcomes gracefully', async () => {
      // Record uses but no outcomes yet
      await mockRedis.hIncrBy('prompt:v1.0:metrics', 'uses', 5);

      const metrics = await manager.getMetrics('v1.0', mockRedis);

      expect(metrics).toBeDefined();
      expect(metrics!.uses).toBe(5);
      expect(metrics!.correct).toBe(0);
      expect(metrics!.accuracy).toBe(0);
      expect(metrics!.falsePositiveRate).toBe(0);
    });

    it('should calculate perfect accuracy', async () => {
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'correct', mockRedis);

      const metrics = await manager.getMetrics('v1.0', mockRedis);

      expect(metrics!.accuracy).toBe(1.0);
      expect(metrics!.falsePositiveRate).toBe(0);
    });
  });

  describe('getAllMetrics', () => {
    let mockRedis: RedisClient;

    beforeEach(() => {
      mockRedis = new MockRedis() as unknown as RedisClient;
    });

    it('should return empty array when no metrics exist', async () => {
      const allMetrics = await manager.getAllMetrics(mockRedis);

      expect(allMetrics).toEqual([]);
    });

    it('should return metrics for all versions with data', async () => {
      // Record usage for v1.0
      await manager.recordUsage('v1.0', 'correct', mockRedis);
      await manager.recordUsage('v1.0', 'false_positive', mockRedis);

      // Record usage for v1.1-dating-focus
      await manager.recordUsage('v1.1-dating-focus', 'correct', mockRedis);

      const allMetrics = await manager.getAllMetrics(mockRedis);

      expect(allMetrics).toHaveLength(2);

      const v10Metrics = allMetrics.find((m) => m.version === 'v1.0');
      const v11Metrics = allMetrics.find((m) => m.version === 'v1.1-dating-focus');

      expect(v10Metrics).toBeDefined();
      expect(v10Metrics!.uses).toBe(2);

      expect(v11Metrics).toBeDefined();
      expect(v11Metrics!.uses).toBe(1);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(promptManager).toBeDefined();
      expect(promptManager).toBeInstanceOf(PromptManager);
    });

    it('should maintain state across multiple calls', () => {
      const version1 = promptManager.selectPromptVersion('t2_user123');
      const version2 = promptManager.selectPromptVersion('t2_user123');

      expect(version1.version).toBe(version2.version);
    });
  });

  describe('edge cases', () => {
    it('should handle very long post content', async () => {
      const longBody = 'a'.repeat(10000);

      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: longBody,
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      // Content sanitizer should truncate to 5000 chars
      expect(result.prompt).toBeDefined();
      expect(result.prompt.length).toBeLessThan(20000); // Reasonable upper bound
    });

    it('should handle special characters in username', async () => {
      const specialProfile: UserProfile = {
        ...mockProfile,
        username: 'test_user-123',
      };

      const result = await manager.buildPrompt({
        profile: specialProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toContain('test_user-123');
    });

    it('should handle zero karma accounts', async () => {
      const zeroKarmaProfile: UserProfile = {
        ...mockProfile,
        totalKarma: 0,
      };

      const result = await manager.buildPrompt({
        profile: zeroKarmaProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toContain('Total karma: 0');
    });

    it('should handle brand new accounts (0 days old)', async () => {
      const newProfile: UserProfile = {
        ...mockProfile,
        accountAgeInDays: 0,
      };

      const result = await manager.buildPrompt({
        profile: newProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      expect(result.prompt).toContain('Account age: 0');
    });

    it('should handle multiple PII types in same post', async () => {
      const result = await manager.buildPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Contact info',
          body: 'Email: test@example.com, Phone: 555-123-4567, Card: 1234 5678 9012 3456, SSN: 123-45-6789',
          subreddit: 'FriendsOver40',
        },
        subredditType: 'FriendsOver40',
      });

      // Should remove all PII types (email, phone, CC, SSN = 4 items)
      expect(result.piiRemoved).toBe(4);
      expect(result.prompt).toContain('[EMAIL]');
      expect(result.prompt).toContain('[PHONE]');
      expect(result.prompt).toContain('[CC]');
      expect(result.prompt).toContain('[SSN]');
    });
  });

  describe('buildEnhancedQuestionPrompt', () => {
    it('should build prompt with simple questions (backward compatibility)', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'simple_test',
            question: 'Is this a test?',
          },
        ],
      });

      expect(result.prompt).toBeDefined();
      expect(result.version).toBe('enhanced-questions');
      expect(result.prompt).toContain('simple_test');
      expect(result.prompt).toContain('Is this a test?');
    });

    it('should include confidence calibration section when provided', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            confidenceGuidance: {
              lowConfidence: 'Discussing dating as a topic, not seeking dates',
              mediumConfidence: 'Ambiguous language that could indicate interest',
              highConfidence: 'Explicit solicitation with location and contact info',
            },
          },
        ],
      });

      expect(result.prompt).toContain('CONFIDENCE CALIBRATION:');
      expect(result.prompt).toContain('HIGH CONFIDENCE (70-100%):');
      expect(result.prompt).toContain('Explicit solicitation with location and contact info');
      expect(result.prompt).toContain('MEDIUM CONFIDENCE (30-69%):');
      expect(result.prompt).toContain('Ambiguous language that could indicate interest');
      expect(result.prompt).toContain('LOW CONFIDENCE (0-29%):');
      expect(result.prompt).toContain('Discussing dating as a topic, not seeking dates');
    });

    it('should include analysis framework when provided', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            analysisFramework: {
              evidenceTypes: ['DIRECT', 'IMPLIED', 'DISCUSSION', 'NEGATED'],
              contextualFactors: ['subreddit culture', 'user post history'],
            },
          },
        ],
      });

      expect(result.prompt).toContain('ANALYSIS FRAMEWORK:');
      expect(result.prompt).toContain('Categorize each piece of evidence as:');
      expect(result.prompt).toContain('DIRECT');
      expect(result.prompt).toContain('IMPLIED');
      expect(result.prompt).toContain('DISCUSSION');
      expect(result.prompt).toContain('NEGATED');
      expect(result.prompt).toContain('Consider these contextual factors:');
      expect(result.prompt).toContain('subreddit culture');
      expect(result.prompt).toContain('user post history');
    });

    it('should include false positive filters when provided', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            analysisFramework: {
              falsePositiveFilters: [
                'quoting or referencing rules',
                'telling stories about past experiences',
                'giving advice to others',
              ],
            },
          },
        ],
      });

      expect(result.prompt).toContain('FALSE POSITIVE FILTERS:');
      expect(result.prompt).toContain('Before flagging content, check for these common false positive patterns:');
      expect(result.prompt).toContain('quoting or referencing rules');
      expect(result.prompt).toContain('telling stories about past experiences');
      expect(result.prompt).toContain('giving advice to others');
      expect(result.prompt).toContain('If ANY of these patterns are present, significantly reduce confidence or answer NO.');
    });

    it('should include negation detection when enabled', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            negationHandling: {
              enabled: true,
              patterns: ['not looking for {action}', "don't want {action}"],
            },
          },
        ],
      });

      expect(result.prompt).toContain('NEGATION DETECTION:');
      expect(result.prompt).toContain('Check carefully for negated statements');
      expect(result.prompt).toContain('not looking for {action}');
      expect(result.prompt).toContain("don't want {action}");
    });

    it('should include evidence requirements when provided', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            evidenceRequired: {
              minPieces: 2,
              types: ['DIRECT', 'IMPLIED'],
              includeQuotes: true,
              includePermalinks: true,
            },
          },
        ],
      });

      expect(result.prompt).toContain('EVIDENCE REQUIREMENTS:');
      expect(result.prompt).toContain('You must find at least 2 pieces of evidence before answering YES.');
      expect(result.prompt).toContain('Required evidence types: DIRECT, IMPLIED');
      expect(result.prompt).toContain('Include exact quotes from the content in your reasoning.');
      expect(result.prompt).toContain('Reference specific posts/comments that contain evidence.');
    });

    it('should include few-shot examples when provided', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            examples: [
              {
                scenario: "User posts 'Why is dating banned here?'",
                expectedAnswer: 'NO',
                confidence: 10,
                reasoning: 'User is discussing the dating ban, not seeking dates',
              },
              {
                scenario: "User posts '45M seeking female friends. DM me!'",
                expectedAnswer: 'YES',
                confidence: 85,
                reasoning: 'Gender preference + DM request suggests romantic intent',
              },
            ],
          },
        ],
      });

      expect(result.prompt).toContain('EXAMPLES OF CORRECT ANALYSIS:');
      expect(result.prompt).toContain('Example 1:');
      expect(result.prompt).toContain("User posts 'Why is dating banned here?'");
      expect(result.prompt).toContain('Expected Answer: NO');
      expect(result.prompt).toContain('Expected Confidence: 10%');
      expect(result.prompt).toContain('User is discussing the dating ban, not seeking dates');
      expect(result.prompt).toContain('Example 2:');
      expect(result.prompt).toContain("User posts '45M seeking female friends. DM me!'");
      expect(result.prompt).toContain('Expected Answer: YES');
      expect(result.prompt).toContain('Expected Confidence: 85%');
      expect(result.prompt).toContain('Gender preference + DM request suggests romantic intent');
    });

    it('should build prompt with all enhanced features combined', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            context: 'This is a platonic friendship community for people aged 40+',
            confidenceGuidance: {
              lowConfidence: 'Discussing dating as a topic, not seeking dates',
              mediumConfidence: 'Ambiguous language that could indicate interest',
              highConfidence: 'Explicit solicitation with location and contact info',
            },
            analysisFramework: {
              evidenceTypes: ['DIRECT', 'IMPLIED', 'DISCUSSION', 'NEGATED'],
              falsePositiveFilters: [
                'quoting or referencing rules',
                'telling stories about past experiences',
              ],
              contextualFactors: ['subreddit culture', 'user post history'],
            },
            evidenceRequired: {
              minPieces: 2,
              types: ['DIRECT', 'IMPLIED'],
              includeQuotes: true,
            },
            negationHandling: {
              enabled: true,
              patterns: ['not looking for {action}'],
            },
            examples: [
              {
                scenario: 'User discusses past dating',
                expectedAnswer: 'NO',
                confidence: 20,
                reasoning: 'Sharing story, not seeking',
              },
            ],
          },
        ],
      });

      // Verify all sections are present
      expect(result.prompt).toContain('high-precision content classifier');
      expect(result.prompt).toContain('USER PROFILE:');
      expect(result.prompt).toContain('DECISION FRAMEWORK:');
      expect(result.prompt).toContain('QUESTION 1: dating_intent');
      expect(result.prompt).toContain('ANALYSIS FRAMEWORK:');
      expect(result.prompt).toContain('FALSE POSITIVE FILTERS:');
      expect(result.prompt).toContain('NEGATION DETECTION:');
      expect(result.prompt).toContain('CONFIDENCE CALIBRATION:');
      expect(result.prompt).toContain('EVIDENCE REQUIREMENTS:');
      expect(result.prompt).toContain('EXAMPLES OF CORRECT ANALYSIS:');
      expect(result.prompt).toContain('YOUR TASK:');
      expect(result.prompt).toContain('QUESTIONS:');
      expect(result.prompt).toContain('RESPOND WITH JSON:');
      expect(result.prompt).toContain('This is a platonic friendship community for people aged 40+');
    });

    it('should handle multiple questions with different enhancements', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Test',
          body: 'Test content',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'dating_intent',
            question: 'Is this user seeking romantic relationships?',
            confidenceGuidance: {
              highConfidence: 'Explicit solicitation',
            },
          },
          {
            id: 'age_appropriate',
            question: 'Does this user appear to be over 40?',
            analysisFramework: {
              evidenceTypes: ['DIRECT', 'IMPLIED'],
            },
          },
        ],
      });

      // Should have sections for both questions
      expect(result.prompt).toContain('QUESTION 1: dating_intent');
      expect(result.prompt).toContain('QUESTION 2: age_appropriate');
      expect(result.prompt).toContain('dating_intent');
      expect(result.prompt).toContain('age_appropriate');
    });

    it('should sanitize PII from content', async () => {
      const result = await manager.buildEnhancedQuestionPrompt({
        profile: mockProfile,
        postHistory: mockPostHistory,
        currentPost: {
          title: 'Contact me',
          body: 'Email me at test@example.com',
          subreddit: 'FriendsOver40',
        },
        questions: [
          {
            id: 'test',
            question: 'Is this a test?',
          },
        ],
      });

      expect(result.piiRemoved).toBe(1);
      expect(result.prompt).toContain('[EMAIL]');
      expect(result.prompt).not.toContain('test@example.com');
    });
  });
});
