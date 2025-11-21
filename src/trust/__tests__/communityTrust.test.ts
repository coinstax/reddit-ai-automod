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
 * Community Trust System - Comprehensive Test Suite
 *
 * Tests trust score calculations, decay, approval/removal tracking,
 * and integration scenarios without requiring Reddit deployment.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockContext } from '../../__mocks__/devvit';
import type { CommunityTrust } from '../../types/communityTrust';
import { CommunityTrustManager } from '../communityTrustManager';

describe('CommunityTrustManager', () => {
  let manager: CommunityTrustManager;
  let context: MockContext;

  beforeEach(() => {
    context = new MockContext();
    manager = new CommunityTrustManager(context as any);
  });

  describe('Initial State', () => {
    it('should return untrusted for new user', async () => {
      const result = await manager.getTrust('user1', 'test', 'post');

      expect(result.isTrusted).toBe(false);
      expect(result.approvalRate).toBe(0);
      expect(result.submissions).toBe(0);
      expect(result.reason).toContain('No history');
    });
  });

  describe('Building Trust - Posts', () => {
    it('should not trust user with only 2 approved posts (< 3 minimum)', async () => {
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      expect(result.isTrusted).toBe(false);
      expect(result.submissions).toBe(2);
      expect(result.approvalRate).toBe(100);
      expect(result.reason).toContain('Need 1 more');
    });

    it('should trust user with 3 approved posts (meets minimum)', async () => {
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      expect(result.isTrusted).toBe(true);
      expect(result.submissions).toBe(3);
      expect(result.approvalRate).toBe(100);
      expect(result.reason).toBe('Trusted contributor');
    });

    it('should trust user with 70% approval rate (4 posts, 3 approved)', async () => {
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'FLAG', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      expect(result.isTrusted).toBe(true);
      expect(result.submissions).toBe(4);
      expect(result.approvalRate).toBe(75);
    });

    it('should NOT trust user with 67% approval rate (3 posts, 2 approved)', async () => {
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'FLAG', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      expect(result.isTrusted).toBe(false);
      expect(result.submissions).toBe(3);
      expect(result.approvalRate).toBeCloseTo(66.67, 1);
      expect(result.reason).toContain('below 70%');
    });
  });

  describe('Separate Post/Comment Tracking', () => {
    it('should track posts and comments independently', async () => {
      // Approve 3 posts
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      // Approve 2 comments (below minimum)
      await manager.updateTrust('user1', 'test', 'APPROVE', 'comment');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'comment');

      const postTrust = await manager.getTrust('user1', 'test', 'post');
      const commentTrust = await manager.getTrust('user1', 'test', 'comment');

      expect(postTrust.isTrusted).toBe(true);
      expect(postTrust.submissions).toBe(3);

      expect(commentTrust.isTrusted).toBe(false);
      expect(commentTrust.submissions).toBe(2);
    });

    it('should prevent gaming through comments', async () => {
      // User spams 10 short comments (all approved)
      for (let i = 0; i < 10; i++) {
        await manager.updateTrust('user1', 'test', 'APPROVE', 'comment');
      }

      // Then posts rule-breaking content
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      // Comment trust is high
      const commentTrust = await manager.getTrust('user1', 'test', 'comment');
      expect(commentTrust.isTrusted).toBe(true);

      // But post trust is low (only 1 post)
      const postTrust = await manager.getTrust('user1', 'test', 'post');
      expect(postTrust.isTrusted).toBe(false);
      expect(postTrust.submissions).toBe(1);
    });
  });

  describe('Cross-Subreddit Isolation', () => {
    it('should track trust separately per subreddit', async () => {
      // User is trusted in r/FriendsOver40
      await manager.updateTrust('user1', 'FriendsOver40', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'FriendsOver40', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'FriendsOver40', 'APPROVE', 'post');

      // But new in r/bitcointaxes
      // (no posts yet)

      const trust1 = await manager.getTrust('user1', 'FriendsOver40', 'post');
      const trust2 = await manager.getTrust('user1', 'bitcointaxes', 'post');

      expect(trust1.isTrusted).toBe(true);
      expect(trust2.isTrusted).toBe(false);
      expect(trust2.submissions).toBe(0);
    });
  });

  describe('Retroactive Removal (ModAction)', () => {
    it('should decrease trust when mod removes approved post', async () => {
      // User gets 3 posts approved
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      // Track the third post for removal (using correct key format)
      await context.redis.set('v1:1:global:tracking:content:post3', JSON.stringify({
        userId: 'user1',
        subreddit: 'test',
        contentType: 'post',
      }));

      // Initial trust: 100%
      let trust = await manager.getTrust('user1', 'test', 'post');
      expect(trust.isTrusted).toBe(true);
      expect(trust.approvalRate).toBe(100);

      // Mod removes post3
      await manager.retroactiveRemoval('post3');

      // Trust recalculated: 2 approved, 1 removed = 67%
      trust = await manager.getTrust('user1', 'test', 'post');
      expect(trust.isTrusted).toBe(false); // Below 70%
      expect(trust.approvalRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('Decay System', () => {
    it('should apply 5% decay per month of inactivity', async () => {
      // User gets trusted (3 posts, 100% approval)
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      // Manually set lastActivity to 3 months ago
      const key = 'v1:1:user:user1:trust:test';
      const trustData = await context.redis.get(key);
      const trust = JSON.parse(trustData) as CommunityTrust;
      trust.lastActivity = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      await context.redis.set(key, JSON.stringify(trust));

      const result = await manager.getTrust('user1', 'test', 'post');

      // 100% - (3 months * 5%) = 85%
      expect(result.monthsInactive).toBe(3);
      expect(result.decayApplied).toBe(15);
      expect(result.approvalRate).toBe(85);
      expect(result.isTrusted).toBe(true); // Still above 70%
    });

    it('should lose trust after 6+ months of inactivity', async () => {
      // User gets trusted
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');

      // 7 months inactive (set to exactly 7 calendar months ago)
      const key = 'v1:1:user:user1:trust:test';
      const trustData = await context.redis.get(key);
      const trust = JSON.parse(trustData) as CommunityTrust;
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
      trust.lastActivity = sevenMonthsAgo;
      await context.redis.set(key, JSON.stringify(trust));

      const result = await manager.getTrust('user1', 'test', 'post');

      // 100% - (7 months * 5%) = 65%
      expect(result.monthsInactive).toBe(7);
      expect(result.decayApplied).toBe(35);
      expect(result.approvalRate).toBe(65);
      expect(result.isTrusted).toBe(false); // Below 70%
    });
  });

  describe('Edge Cases', () => {
    it('should handle removed posts reducing approval rate', async () => {
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'REMOVE', 'post');
      await manager.updateTrust('user1', 'test', 'REMOVE', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      // 2 approved, 2 removed = 50%
      expect(result.approvalRate).toBe(50);
      expect(result.isTrusted).toBe(false);
    });

    it('should handle mix of approved, flagged, and removed', async () => {
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'APPROVE', 'post');
      await manager.updateTrust('user1', 'test', 'FLAG', 'post');
      await manager.updateTrust('user1', 'test', 'REMOVE', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      // 3 approved out of 5 total = 60%
      expect(result.submissions).toBe(5);
      expect(result.approvalRate).toBe(60);
      expect(result.isTrusted).toBe(false); // Below 70%
    });

    it('should never go below 0% approval rate', async () => {
      await manager.updateTrust('user1', 'test', 'REMOVE', 'post');
      await manager.updateTrust('user1', 'test', 'REMOVE', 'post');
      await manager.updateTrust('user1', 'test', 'REMOVE', 'post');

      const result = await manager.getTrust('user1', 'test', 'post');

      expect(result.approvalRate).toBe(0);
      expect(result.isTrusted).toBe(false);
    });
  });
});
