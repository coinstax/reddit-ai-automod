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
 * Community Trust System Manager
 *
 * Tracks user behavior within specific subreddit communities to determine
 * whether they can skip expensive moderation layers. Separate tracking for
 * posts and comments prevents gaming the system.
 */

import { Devvit } from '@devvit/public-api';
import type {
  CommunityTrust,
  TrustEvaluation,
  ApprovedContentRecord,
} from '../types/communityTrust';
import { buildUserKey, buildGlobalKey, DEFAULT_SETTINGS_VERSION } from '../storage/keyBuilder.js';

/**
 * Manages community-specific trust scores for users
 */
export class CommunityTrustManager {
  private redis: Devvit.Context['redis'];

  private config = {
    minApprovalRate: 70,
    minSubmissionsPost: 3,
    minSubmissionsComment: 3, // Same threshold as posts to prevent gaming
    decayRatePerMonth: 5,
  };

  constructor(context: Devvit.Context) {
    this.redis = context.redis;
  }

  /**
   * Get trust evaluation for a user in a specific subreddit
   *
   * @param userId - User ID to evaluate
   * @param subreddit - Subreddit name
   * @param contentType - Type of content ('post' or 'comment')
   * @returns Trust evaluation with approval rate, submission count, and trust status
   */
  async getTrust(
    userId: string,
    subreddit: string,
    contentType: 'post' | 'comment'
  ): Promise<TrustEvaluation> {
    try {
      const key = buildUserKey(userId, DEFAULT_SETTINGS_VERSION, 'trust', subreddit);
      const trustData = await this.redis.get(key);

      if (!trustData) {
        console.log(
          `[CommunityTrust] No history for user ${userId} in r/${subreddit}`
        );
        return {
          isTrusted: false,
          approvalRate: 0,
          submissions: 0,
          reason: 'No history in this community',
          monthsInactive: 0,
          decayApplied: 0,
        };
      }

      const trust = JSON.parse(trustData) as CommunityTrust;

      // Convert date strings back to Date objects
      trust.lastActivity = new Date(trust.lastActivity);
      trust.lastCalculated = new Date(trust.lastCalculated);

      const stats = contentType === 'post' ? trust.posts : trust.comments;

      // Calculate months inactive
      const monthsInactive = this.getMonthsSince(trust.lastActivity);

      // Apply decay
      const rawApprovalRate =
        stats.submitted > 0 ? (stats.approved / stats.submitted) * 100 : 0;
      const decayAmount = monthsInactive * this.config.decayRatePerMonth;
      const approvalRate = Math.max(0, rawApprovalRate - decayAmount);

      // Check if trusted (different thresholds for posts vs comments)
      const minSubmissions =
        contentType === 'post'
          ? this.config.minSubmissionsPost
          : this.config.minSubmissionsComment;

      const isTrusted =
        stats.submitted >= minSubmissions &&
        approvalRate >= this.config.minApprovalRate;

      const reason = isTrusted
        ? 'Trusted contributor'
        : this.getReason(stats, approvalRate, contentType);

      console.log(
        `[CommunityTrust] User ${userId} in r/${subreddit} (${contentType}): ` +
          `trusted=${isTrusted}, approval=${approvalRate.toFixed(1)}%, ` +
          `submissions=${stats.submitted}`
      );

      return {
        isTrusted,
        approvalRate,
        submissions: stats.submitted,
        reason,
        monthsInactive,
        decayApplied: decayAmount,
      };
    } catch (error) {
      console.error(
        `[CommunityTrust] Error getting trust for user ${userId}:`,
        error
      );
      // Return safe default on error
      return {
        isTrusted: false,
        approvalRate: 0,
        submissions: 0,
        reason: 'Error evaluating trust',
        monthsInactive: 0,
        decayApplied: 0,
      };
    }
  }

  /**
   * Update trust score after a moderation action
   *
   * @param userId - User ID
   * @param subreddit - Subreddit name
   * @param action - Moderation action taken ('APPROVE', 'FLAG', or 'REMOVE')
   * @param contentType - Type of content ('post' or 'comment')
   * @returns Object with oldScore, newScore, and delta (all as percentages)
   */
  async updateTrust(
    userId: string,
    subreddit: string,
    action: 'APPROVE' | 'FLAG' | 'REMOVE',
    contentType: 'post' | 'comment'
  ): Promise<{ oldScore: number; newScore: number; delta: number }> {
    try {
      const key = buildUserKey(userId, DEFAULT_SETTINGS_VERSION, 'trust', subreddit);
      const trustData = await this.redis.get(key);

      let trust: CommunityTrust;

      if (!trustData) {
        trust = this.initializeTrust(userId, subreddit);
      } else {
        trust = JSON.parse(trustData) as CommunityTrust;
        // Convert date strings back to Date objects
        trust.lastActivity = new Date(trust.lastActivity);
        trust.lastCalculated = new Date(trust.lastCalculated);
      }

      const stats = contentType === 'post' ? trust.posts : trust.comments;

      // Calculate old approval rate before updating
      const oldApprovalRate =
        stats.submitted > 0 ? (stats.approved / stats.submitted) * 100 : 0;

      // Update counts
      stats.submitted++;
      if (action === 'APPROVE') {
        stats.approved++;
      } else if (action === 'FLAG') {
        stats.flagged++;
      } else if (action === 'REMOVE') {
        stats.removed++;
      }

      // Calculate new approval rate after updating
      const newApprovalRate =
        stats.submitted > 0 ? (stats.approved / stats.submitted) * 100 : 0;
      const delta = newApprovalRate - oldApprovalRate;

      // Update timestamps
      trust.lastActivity = new Date();
      trust.lastCalculated = new Date();

      // Track this user in the users set for this subreddit (for reset functionality)
      const usersSetKey = buildGlobalKey(DEFAULT_SETTINGS_VERSION, 'tracking', subreddit, 'users');
      await this.redis.zAdd(usersSetKey, { member: userId, score: Date.now() });

      await this.redis.set(key, JSON.stringify(trust));

      console.log(
        `[CommunityTrust] Updated trust for ${userId} in r/${subreddit}: ` +
          `${action} ${contentType} (submitted=${stats.submitted}, approved=${stats.approved})`
      );

      return { oldScore: oldApprovalRate, newScore: newApprovalRate, delta };
    } catch (error) {
      console.error(
        `[CommunityTrust] Error updating trust for user ${userId}:`,
        error
      );
      // Return zero values on error
      return { oldScore: 0, newScore: 0, delta: 0 };
    }
  }

  /**
   * Track approved content for potential retroactive removal
   *
   * Creates a 24-hour tracking record that allows us to update trust scores
   * if a moderator removes content we previously approved.
   *
   * @param contentId - Content ID (post or comment)
   * @param userId - User who created the content
   * @param subreddit - Subreddit name
   * @param contentType - Type of content ('post' or 'comment')
   */
  async trackApproved(
    contentId: string,
    userId: string,
    subreddit: string,
    contentType: 'post' | 'comment'
  ): Promise<void> {
    try {
      const key = buildGlobalKey(DEFAULT_SETTINGS_VERSION, 'tracking', 'content', contentId);
      const record: ApprovedContentRecord = {
        contentId,
        userId,
        subreddit,
        contentType,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      await this.redis.set(key, JSON.stringify(record), {
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      console.log(
        `[CommunityTrust] Tracking approved ${contentType} ${contentId} for user ${userId}`
      );
    } catch (error) {
      console.error(
        `[CommunityTrust] Error tracking approved content ${contentId}:`,
        error
      );
      // Don't throw - tracking is optional
    }
  }

  /**
   * Handle retroactive removal of previously approved content
   *
   * Called by ModAction handler when a moderator removes content we approved.
   * Decrements the approval count and increments the removal count.
   *
   * @param contentId - Content ID that was removed
   * @returns Object with oldScore, newScore, and delta, or null if no tracking record exists
   */
  async retroactiveRemoval(
    contentId: string
  ): Promise<{ oldScore: number; newScore: number; delta: number } | null> {
    try {
      // Note: For tracking keys, we need content ID as primary key since we don't know user/subreddit yet
      // Using global pattern: v1:1:global:tracking:content:{contentId}
      const trackingKey = buildGlobalKey(DEFAULT_SETTINGS_VERSION, 'tracking', 'content', contentId);
      const recordData = await this.redis.get(trackingKey);

      if (!recordData) {
        // We didn't approve this content, nothing to update
        return null;
      }

      const record = JSON.parse(recordData) as ApprovedContentRecord;
      const { userId, subreddit, contentType } = record;

      const trustKey = buildUserKey(userId, DEFAULT_SETTINGS_VERSION, 'trust', subreddit);
      const trustData = await this.redis.get(trustKey);

      if (!trustData) {
        // No trust record found, clean up tracking and return
        await this.redis.del(trackingKey);
        return null;
      }

      const trust = JSON.parse(trustData) as CommunityTrust;
      trust.lastActivity = new Date(trust.lastActivity);
      trust.lastCalculated = new Date(trust.lastCalculated);

      const stats = contentType === 'post' ? trust.posts : trust.comments;

      // Calculate old approval rate before updating
      const oldApprovalRate =
        stats.submitted > 0 ? (stats.approved / stats.submitted) * 100 : 0;

      // Undo the approval, add to removed
      stats.approved = Math.max(0, stats.approved - 1);
      stats.removed++;

      // Calculate new approval rate after updating
      const newApprovalRate =
        stats.submitted > 0 ? (stats.approved / stats.submitted) * 100 : 0;
      const delta = newApprovalRate - oldApprovalRate;

      trust.lastCalculated = new Date();

      await this.redis.set(trustKey, JSON.stringify(trust));
      await this.redis.del(trackingKey);

      console.log(
        `[CommunityTrust] Retroactive removal for ${contentType} ${contentId}: ` +
          `user ${userId} in r/${subreddit} - approval count reduced`
      );

      return { oldScore: oldApprovalRate, newScore: newApprovalRate, delta };
    } catch (error) {
      console.error(
        `[CommunityTrust] Error handling retroactive removal for ${contentId}:`,
        error
      );
      // Return null on error
      return null;
    }
  }

  /**
   * Initialize a new trust record for a user in a subreddit
   *
   * @param userId - User ID
   * @param subreddit - Subreddit name
   * @returns New CommunityTrust object
   */
  private initializeTrust(userId: string, subreddit: string): CommunityTrust {
    const now = new Date();
    return {
      userId,
      subreddit,
      posts: {
        submitted: 0,
        approved: 0,
        flagged: 0,
        removed: 0,
        approvalRate: 0,
      },
      comments: {
        submitted: 0,
        approved: 0,
        flagged: 0,
        removed: 0,
        approvalRate: 0,
      },
      lastActivity: now,
      lastCalculated: now,
    };
  }

  /**
   * Calculate number of months since a given date
   *
   * @param date - Date to calculate from
   * @returns Number of months (non-negative integer)
   */
  private getMonthsSince(date: Date): number {
    const now = new Date();
    const months =
      (now.getFullYear() - date.getFullYear()) * 12 +
      (now.getMonth() - date.getMonth());
    return Math.max(0, months);
  }

  /**
   * Generate reason string for why user is not trusted
   *
   * @param stats - Content type stats
   * @param approvalRate - Current approval rate
   * @param contentType - Type of content ('post' or 'comment')
   * @returns Human-readable reason string
   */
  private getReason(
    stats: { submitted: number },
    approvalRate: number,
    contentType: 'post' | 'comment'
  ): string {
    const minSubmissions =
      contentType === 'post'
        ? this.config.minSubmissionsPost
        : this.config.minSubmissionsComment;

    if (stats.submitted < minSubmissions) {
      const needed = minSubmissions - stats.submitted;
      return `Need ${needed} more submission${needed === 1 ? '' : 's'}`;
    }

    if (approvalRate < this.config.minApprovalRate) {
      return `Approval rate ${approvalRate.toFixed(1)}% below ${this.config.minApprovalRate}%`;
    }

    return 'Not trusted';
  }
}
