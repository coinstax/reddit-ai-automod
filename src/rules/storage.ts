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
 * Rule Storage - Manages rules in Redis
 *
 * This module provides persistent storage for rules using Redis.
 * It supports:
 * - CRUD operations for rules
 * - Subreddit-specific and global rules
 * - Default rule initialization
 * - Efficient retrieval with priority ordering
 *
 * @module rules/storage
 */

import { RedisClient } from '@devvit/public-api';
import { Rule, RuleSet } from '../types/rules.js';

/**
 * Rule Storage class
 * Manages rule persistence in Redis with subreddit isolation
 */
export class RuleStorage {
  constructor(private redis: RedisClient) {}

  /**
   * Sanitize input for use in Redis keys
   * Only allows alphanumeric, underscore, and hyphen characters
   * Prevents Redis injection attacks
   *
   * @param input - The input string to sanitize
   * @returns Sanitized string safe for use in Redis keys
   * @throws Error if input is invalid or too long
   */
  private sanitizeRedisKey(input: string): string {
    if (!input || typeof input !== 'string') {
      throw new Error('Invalid Redis key input');
    }

    // Remove any characters that aren't alphanumeric, underscore, or hyphen
    const sanitized = input.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Limit length to prevent excessive key sizes
    if (sanitized.length > 100) {
      throw new Error('Redis key component too long');
    }

    return sanitized;
  }

  /**
   * Get all rules for a subreddit
   *
   * Returns rules sorted by priority (highest first).
   * Includes both subreddit-specific and global rules.
   *
   * @param subreddit - The subreddit name (or 'global' for global rules)
   * @returns Array of rules sorted by priority
   *
   * @example
   * ```typescript
   * const storage = new RuleStorage(redis);
   * const rules = await storage.getRules('FriendsOver40');
   * // Returns: [rule1, rule2, ...] sorted by priority
   * ```
   */
  async getRules(subreddit: string): Promise<Rule[]> {
    try {
      // Sanitize the subreddit name for safe Redis key usage
      const sanitizedSub = this.sanitizeRedisKey(subreddit);
      // Try to get from Redis
      const key = `rules:${sanitizedSub}:set`;
      const stored = await this.redis.get(key);

      if (stored) {
        const ruleSet: RuleSet = JSON.parse(stored);
        return ruleSet.rules;
      }

      // If no rules found, return empty array
      return [];
    } catch (error) {
      console.error('[RuleStorage] Error getting rules:', {
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get rule set configuration
   *
   * Returns the full rule set including metadata.
   *
   * @param subreddit - The subreddit name
   * @returns RuleSet or null if not found
   */
  async getRuleSet(subreddit: string): Promise<RuleSet | null> {
    try {
      const sanitizedSub = this.sanitizeRedisKey(subreddit);
      const key = `rules:${sanitizedSub}:set`;
      const stored = await this.redis.get(key);

      if (stored) {
        return JSON.parse(stored);
      }

      return null;
    } catch (error) {
      console.error('[RuleStorage] Error getting rule set:', {
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Save rule set to Redis
   *
   * Persists the complete rule set including all rules and metadata.
   * Automatically updates the updatedAt timestamp.
   *
   * @param ruleSet - The rule set to save
   */
  async saveRuleSet(ruleSet: RuleSet): Promise<void> {
    try {
      const sanitizedSub = this.sanitizeRedisKey(ruleSet.subreddit ?? 'unknown');
      const key = `rules:${sanitizedSub}:set`;
      ruleSet.updatedAt = Date.now();
      await this.redis.set(key, JSON.stringify(ruleSet));

      console.log('[RuleStorage] Saved rule set:', {
        subreddit: ruleSet.subreddit,
        ruleCount: ruleSet.rules.length,
      });
    } catch (error) {
      console.error('[RuleStorage] Error saving rule set:', {
        subreddit: ruleSet.subreddit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Add a rule to a subreddit's rule set
   *
   * @param subreddit - The subreddit name
   * @param rule - The rule to add
   */
  async addRule(subreddit: string, rule: Rule): Promise<void> {
    try {
      // Get existing rule set or create new one (getRuleSet sanitizes internally)
      let ruleSet = await this.getRuleSet(subreddit);

      if (!ruleSet) {
        ruleSet = {
          subreddit,
          rules: [],
          updatedAt: Date.now(),
        };
      }

      // Add rule and sort by priority
      ruleSet.rules.push(rule);
      ruleSet.rules.sort((a, b) => b.priority - a.priority);

      // Save updated rule set
      await this.saveRuleSet(ruleSet);

      console.log('[RuleStorage] Added rule:', {
        subreddit,
        ruleId: rule.id,
        ruleName: rule.name,
        priority: rule.priority,
      });
    } catch (error) {
      console.error('[RuleStorage] Error adding rule:', {
        subreddit,
        ruleId: rule.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a rule in a subreddit's rule set
   *
   * @param subreddit - The subreddit name
   * @param ruleId - The ID of the rule to update
   * @param updates - Partial rule updates
   */
  async updateRule(subreddit: string, ruleId: string, updates: Partial<Rule>): Promise<void> {
    try {
      // Get existing rule set (getRuleSet sanitizes internally)
      const ruleSet = await this.getRuleSet(subreddit);

      if (!ruleSet) {
        throw new Error(`Rule set not found for subreddit: ${subreddit}`);
      }

      // Find and update the rule
      const ruleIndex = ruleSet.rules.findIndex((r) => r.id === ruleId);

      if (ruleIndex === -1) {
        throw new Error(`Rule not found: ${ruleId}`);
      }

      // Update rule fields
      ruleSet.rules[ruleIndex] = {
        ...ruleSet.rules[ruleIndex],
        ...updates,
      } as Rule;

      // Re-sort if priority changed
      if (updates.priority !== undefined) {
        ruleSet.rules.sort((a, b) => b.priority - a.priority);
      }

      // Save updated rule set
      await this.saveRuleSet(ruleSet);

      console.log('[RuleStorage] Updated rule:', {
        subreddit,
        ruleId,
        updates: Object.keys(updates),
      });
    } catch (error) {
      console.error('[RuleStorage] Error updating rule:', {
        subreddit,
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a rule from a subreddit's rule set
   *
   * @param subreddit - The subreddit name
   * @param ruleId - The ID of the rule to delete
   */
  async deleteRule(subreddit: string, ruleId: string): Promise<void> {
    try {
      // Get existing rule set (getRuleSet sanitizes internally)
      const ruleSet = await this.getRuleSet(subreddit);

      if (!ruleSet) {
        throw new Error(`Rule set not found for subreddit: ${subreddit}`);
      }

      // Filter out the rule
      const initialCount = ruleSet.rules.length;
      ruleSet.rules = ruleSet.rules.filter((r) => r.id !== ruleId);

      if (ruleSet.rules.length === initialCount) {
        throw new Error(`Rule not found: ${ruleId}`);
      }

      // Save updated rule set
      await this.saveRuleSet(ruleSet);

      console.log('[RuleStorage] Deleted rule:', {
        subreddit,
        ruleId,
      });
    } catch (error) {
      console.error('[RuleStorage] Error deleting rule:', {
        subreddit,
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Initialize default rules for a subreddit
   *
   * This will load default rules from the defaults module.
   * Only initializes if no rules exist for the subreddit.
   *
   * @param subreddit - The subreddit name
   * @param defaultRules - Optional array of default rules to initialize
   */
  async initializeDefaults(subreddit: string, defaultRules?: Rule[]): Promise<void> {
    try {
      // Check if rules already exist (getRuleSet sanitizes internally)
      const existing = await this.getRuleSet(subreddit);

      if (existing && existing.rules.length > 0) {
        console.log('[RuleStorage] Rules already exist, skipping initialization:', {
          subreddit,
          existingRuleCount: existing.rules.length,
        });
        return;
      }

      // Create new rule set with defaults
      if (defaultRules && defaultRules.length > 0) {
        const ruleSet: RuleSet = {
          subreddit,
          rules: defaultRules.sort((a, b) => b.priority - a.priority),
          updatedAt: Date.now(),
        };

        await this.saveRuleSet(ruleSet);

        console.log('[RuleStorage] Initialized default rules:', {
          subreddit,
          ruleCount: defaultRules.length,
        });
      }
    } catch (error) {
      console.error('[RuleStorage] Error initializing defaults:', {
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all subreddits that have rules configured
   *
   * Note: This is a placeholder implementation. In production, you would maintain
   * a separate Redis SET of configured subreddit names that gets updated when
   * rules are added/removed.
   *
   * @returns Array of subreddit names
   */
  async getConfiguredSubreddits(): Promise<string[]> {
    // TODO: Implement using a separate Redis SET to track configured subreddits
    // For now, return empty array as this is not critical for Phase 3.2
    console.warn('[RuleStorage] getConfiguredSubreddits not implemented');
    return [];
  }
}
