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
 * Cost Dashboard Caching Layer
 *
 * Pre-computes dashboard data and caches for 5 minutes to improve performance.
 * Reduces load on Redis by materializing dashboard views.
 *
 * Key Features:
 * - 5-minute TTL caching via Redis
 * - Aggregates data from CostTracker and SettingsService
 * - Manual cache invalidation support
 * - Handles missing data gracefully
 *
 * @module dashboard/costDashboardCache
 */

import { Context } from '@devvit/public-api';
import { CostTracker } from '../ai/costTracker.js';
import { SettingsService } from '../config/settingsService.js';

/**
 * Cost summary structure (per-provider breakdown + total)
 */
interface CostSummary {
  claude: number;
  openai: number;
  'openai-compatible': number;
  total: number;
}

/**
 * Request count structure (per-provider + total)
 * NOTE: Request counts are currently not tracked by CostTracker.
 * This is a placeholder for future enhancement.
 */
interface RequestCounts {
  claude: number;
  openai: number;
  'openai-compatible': number;
  total: number;
}

/**
 * Complete dashboard data structure
 */
interface DashboardData {
  /** Today's costs and request counts */
  daily: CostSummary & { requests: RequestCounts };
  /** This month's costs and request counts */
  monthly: CostSummary & { requests: RequestCounts };
  /** Current settings configuration */
  settings: {
    dailyLimit: number;
    monthlyLimit: number;
    dryRunMode: boolean;
    primaryProvider: string;
    fallbackProvider: string;
  };
  /** ISO timestamp of when this data was generated */
  lastUpdated: string;
}

/**
 * Cost Dashboard Cache
 *
 * Provides cached access to dashboard data with automatic expiration.
 *
 * @example
 * ```typescript
 * // Get dashboard data (from cache if available)
 * const data = await CostDashboardCache.getDashboardData(context);
 * console.log(`Daily: $${data.daily.total.toFixed(2)}`);
 *
 * // Invalidate cache after cost update
 * await costTracker.recordCost(record);
 * await CostDashboardCache.invalidateCache(context);
 * ```
 */
export class CostDashboardCache {
  /** Redis key for cached dashboard data */
  private static readonly CACHE_KEY = 'dashboard:cost:cache';

  /** Cache TTL in seconds (5 minutes) */
  private static readonly CACHE_TTL_SECONDS = 300;

  /**
   * Get cached dashboard data or compute fresh
   *
   * Tries to read from cache first. If cache miss or expired, computes
   * fresh data and caches it for 5 minutes.
   *
   * @param context - Devvit context with redis and settings access
   * @returns Complete dashboard data
   *
   * @example
   * ```typescript
   * const data = await CostDashboardCache.getDashboardData(context);
   * console.log(`Daily spent: $${data.daily.total.toFixed(2)}`);
   * console.log(`Primary AI: ${data.settings.primaryProvider}`);
   * ```
   */
  static async getDashboardData(context: Context): Promise<DashboardData> {
    try {
      // Try cache first
      const cached = await context.redis.get(this.CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }

      // Compute fresh data
      const data = await this.computeDashboardData(context);

      // Cache for 5 minutes
      await context.redis.set(
        this.CACHE_KEY,
        JSON.stringify(data),
        { expiration: new Date(Date.now() + this.CACHE_TTL_SECONDS * 1000) }
      );

      return data;
    } catch (error) {
      console.error('[CostDashboardCache] Failed to get dashboard data:', error);

      // Try to compute fresh data on cache error
      return this.computeDashboardData(context);
    }
  }

  /**
   * Invalidate cache (call when costs update)
   *
   * Forces next getDashboardData() call to compute fresh data.
   * This is optional since cache auto-expires after 5 minutes.
   *
   * @param context - Devvit context with redis access
   *
   * @example
   * ```typescript
   * // After recording a cost
   * await costTracker.recordCost(record);
   * await CostDashboardCache.invalidateCache(context);
   * ```
   */
  static async invalidateCache(context: Context): Promise<void> {
    try {
      await context.redis.del(this.CACHE_KEY);
    } catch (error) {
      console.error('[CostDashboardCache] Failed to invalidate cache:', error);
      // Non-critical error, cache will expire naturally
    }
  }

  /**
   * Compute dashboard data from CostTracker and SettingsService
   *
   * Internal method that fetches all data needed for the dashboard.
   * Aggregates costs from CostTracker and settings from SettingsService.
   *
   * @param context - Devvit context
   * @returns Freshly computed dashboard data
   * @private
   */
  private static async computeDashboardData(context: Context): Promise<DashboardData> {
    const costTracker = CostTracker.getInstance(context);

    // Fetch configuration from settings
    const budgetConfig = await SettingsService.getBudgetConfig(context);
    const aiConfig = await SettingsService.getAIConfig(context);
    const dryRunConfig = await SettingsService.getDryRunConfig(context);

    try {
      // Fetch daily costs per provider
      const [dailyClaude, dailyOpenAI, dailyDeepSeek] = await Promise.all([
        this.getDailyCost(costTracker, 'claude'),
        this.getDailyCost(costTracker, 'openai'),
        this.getDailyCost(costTracker, 'openai-compatible'),
      ]);

      const dailyCosts = {
        claude: dailyClaude,
        openai: dailyOpenAI,
        'openai-compatible': dailyDeepSeek,
      };

      // Fetch monthly costs per provider
      const [monthlyClaude, monthlyOpenAI, monthlyDeepSeek] = await Promise.all([
        this.getMonthlyCost(costTracker, 'claude'),
        this.getMonthlyCost(costTracker, 'openai'),
        this.getMonthlyCost(costTracker, 'openai-compatible'),
      ]);

      const monthlyCosts = {
        claude: monthlyClaude,
        openai: monthlyOpenAI,
        'openai-compatible': monthlyDeepSeek,
      };

      // Note: CostTracker doesn't track request counts currently
      // These would need to be added to CostTracker in the future
      // For now, we use zeros as placeholders
      const dailyRequests: RequestCounts = {
        claude: 0,
        openai: 0,
        'openai-compatible': 0,
        total: 0
      };

      const monthlyRequests: RequestCounts = {
        claude: 0,
        openai: 0,
        'openai-compatible': 0,
        total: 0
      };

      return {
        daily: {
          ...dailyCosts,
          total: dailyCosts.claude + dailyCosts.openai + dailyCosts['openai-compatible'],
          requests: dailyRequests,
        },
        monthly: {
          ...monthlyCosts,
          total: monthlyCosts.claude + monthlyCosts.openai + monthlyCosts['openai-compatible'],
          requests: monthlyRequests,
        },
        settings: {
          dailyLimit: budgetConfig.dailyLimitUSD,
          monthlyLimit: budgetConfig.monthlyLimitUSD,
          dryRunMode: dryRunConfig.dryRunMode,
          primaryProvider: aiConfig.primaryProvider,
          fallbackProvider: aiConfig.fallbackProvider,
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[CostDashboardCache] Failed to compute dashboard data:', error);

      // Return empty data on error
      return {
        daily: {
          claude: 0,
          openai: 0,
          'openai-compatible': 0,
          total: 0,
          requests: { claude: 0, openai: 0, 'openai-compatible': 0, total: 0 },
        },
        monthly: {
          claude: 0,
          openai: 0,
          'openai-compatible': 0,
          total: 0,
          requests: { claude: 0, openai: 0, 'openai-compatible': 0, total: 0 },
        },
        settings: {
          dailyLimit: budgetConfig.dailyLimitUSD,
          monthlyLimit: budgetConfig.monthlyLimitUSD,
          dryRunMode: dryRunConfig.dryRunMode,
          primaryProvider: aiConfig.primaryProvider,
          fallbackProvider: aiConfig.fallbackProvider,
        },
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Get daily cost for a specific provider
   *
   * Helper method to safely fetch daily cost with error handling.
   * CostTracker doesn't expose getDailyCost() directly, so we access
   * Redis keys directly.
   *
   * @param costTracker - CostTracker instance
   * @param provider - AI provider name
   * @returns Cost in USD
   * @private
   */
  private static async getDailyCost(
    costTracker: CostTracker,
    provider: string
  ): Promise<number> {
    try {
      // Access Redis directly since CostTracker doesn't expose getDailyCost()
      // Note: This is a workaround - ideally CostTracker would expose this method
      const status = await costTracker.getBudgetStatus();

      // Extract provider cost from budget status
      switch (provider) {
        case 'openai':
          return status.perProviderSpent.openai;
        case 'gemini':
          return status.perProviderSpent.gemini;
        default:
          return 0;
      }
    } catch (error) {
      console.error(`[CostDashboardCache] Failed to get daily cost for ${provider}:`, error);
      return 0;
    }
  }

  /**
   * Get monthly cost for a specific provider
   *
   * Helper method to safely fetch monthly cost with error handling.
   * Since CostTracker doesn't expose per-provider monthly costs,
   * we estimate based on current daily values and month progress.
   *
   * TODO: Add proper monthly tracking to CostTracker
   *
   * @param costTracker - CostTracker instance
   * @param provider - AI provider name
   * @returns Cost in USD
   * @private
   */
  private static async getMonthlyCost(
    costTracker: CostTracker,
    provider: string
  ): Promise<number> {
    try {
      // For now, return daily cost as monthly (placeholder)
      // TODO: Implement proper monthly cost tracking in CostTracker
      const status = await costTracker.getBudgetStatus();

      switch (provider) {
        case 'openai':
          return status.perProviderSpent.openai;
        case 'gemini':
          return status.perProviderSpent.gemini;
        default:
          return 0;
      }
    } catch (error) {
      console.error(`[CostDashboardCache] Failed to get monthly cost for ${provider}:`, error);
      return 0;
    }
  }
}
