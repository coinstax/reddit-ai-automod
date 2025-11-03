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
 * Settings Service
 *
 * Provides abstraction layer between Devvit settings and application components.
 * Implements static caching with 60-second TTL to reduce repeated settings reads.
 *
 * Key Features:
 * - Static Map-based cache with expiry timestamps
 * - Type-safe settings retrieval
 * - Default value handling
 * - Cache invalidation for testing
 *
 * Cache Strategy:
 * - 60-second TTL for all cached data
 * - Per-method cache keys (independent expiry)
 * - Automatic expiry check on cache reads
 *
 * @module config/settingsService
 */

import type { Context } from '@devvit/public-api';
import type { AIProviderConfig, BudgetConfig, DryRunConfig } from '../types/config.js';

/**
 * Cache entry structure with data and expiry timestamp
 */
interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Unix timestamp (ms) when this cache entry expires */
  expiresAt: number;
}

/**
 * Settings Service
 *
 * Fetches and caches settings from Devvit Settings UI.
 * All methods are static for easy usage across the application.
 *
 * @example
 * ```typescript
 * // In PostSubmit handler
 * const aiConfig = await SettingsService.getAIConfig(context);
 * if (aiConfig.claudeApiKey) {
 *   // Use Claude provider
 * }
 *
 * // In cost tracking
 * const budgetConfig = await SettingsService.getBudgetConfig(context);
 * if (dailyCost >= budgetConfig.dailyLimitUSD) {
 *   // Budget exceeded
 * }
 * ```
 */
export class SettingsService {
  /** Cache TTL in milliseconds (60 seconds) */
  private static readonly CACHE_TTL_MS = 60 * 1000;

  /** Static cache for AI provider configuration */
  private static aiConfigCache?: CacheEntry<AIProviderConfig>;

  /** Static cache for budget configuration */
  private static budgetConfigCache?: CacheEntry<BudgetConfig>;

  /** Static cache for dry-run configuration */
  private static dryRunConfigCache?: CacheEntry<DryRunConfig>;

  /**
   * Get AI provider configuration from settings
   *
   * Returns API keys and provider selection configured via Devvit Settings UI.
   * Results are cached for 60 seconds to reduce repeated settings reads.
   *
   * **Settings Fields** (Reddit Approved Providers Only):
   * - `openaiApiKey` (string)
   * - `geminiApiKey` (string)
   * - `primaryProvider` (string: 'openai' | 'gemini')
   * - `fallbackProvider` (string: 'openai' | 'gemini' | 'none')
   *
   * **Default Values**:
   * - All API keys default to undefined (no keys configured)
   * - primaryProvider defaults to 'openai'
   * - fallbackProvider defaults to 'gemini'
   *
   * @param context - Devvit context with settings access
   * @returns AI provider configuration
   *
   * @example
   * ```typescript
   * const config = await SettingsService.getAIConfig(context);
   * console.log(config.primaryProvider); // 'openai'
   * console.log(config.openaiApiKey); // 'sk-...' or undefined
   * ```
   */
  static async getAIConfig(context: Context): Promise<AIProviderConfig> {
    // Check cache first
    if (this.aiConfigCache && Date.now() < this.aiConfigCache.expiresAt) {
      return this.aiConfigCache.data;
    }

    try {
      // Fetch all settings from Devvit
      const settings = await context.settings.getAll();

      // Build configuration with defaults
      // Note: Devvit select fields return arrays, so we need to extract the first value
      const primaryProviderValue = Array.isArray(settings.primaryProvider)
        ? settings.primaryProvider[0]
        : settings.primaryProvider;
      const fallbackProviderValue = Array.isArray(settings.fallbackProvider)
        ? settings.fallbackProvider[0]
        : settings.fallbackProvider;

      const config: AIProviderConfig = {
        openaiApiKey: settings.openaiApiKey as string | undefined,
        geminiApiKey: settings.geminiApiKey as string | undefined,
        primaryProvider: (primaryProviderValue as 'openai' | 'gemini') ?? 'openai',
        fallbackProvider: (fallbackProviderValue as 'openai' | 'gemini' | 'none') ?? 'gemini',
      };

      // Cache the result
      this.aiConfigCache = {
        data: config,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      };

      return config;
    } catch (error) {
      console.error('[SettingsService] Failed to fetch AI config:', error);

      // Return defaults on error (graceful degradation)
      return {
        openaiApiKey: undefined,
        geminiApiKey: undefined,
        primaryProvider: 'openai',
        fallbackProvider: 'gemini',
      };
    }
  }

  /**
   * Get budget configuration from settings
   *
   * Returns daily/monthly budget limits and alert threshold configuration.
   * Results are cached for 60 seconds to reduce repeated settings reads.
   *
   * **Settings Fields** (from Phase 4.2 implementation):
   * - `dailyBudgetLimit` (number, default: 5)
   * - `monthlyBudgetLimit` (number, default: 150)
   * - `budgetAlertThreshold50` (boolean, default: true)
   * - `budgetAlertThreshold75` (boolean, default: true)
   * - `budgetAlertThreshold90` (boolean, default: true)
   *
   * **Default Values**:
   * - dailyLimitUSD: 5.0
   * - monthlyLimitUSD: 150.0
   * - All alert thresholds: true (enabled)
   *
   * @param context - Devvit context with settings access
   * @returns Budget configuration
   *
   * @example
   * ```typescript
   * const config = await SettingsService.getBudgetConfig(context);
   * if (dailyCost >= config.dailyLimitUSD) {
   *   console.warn('Daily budget exceeded!');
   * }
   * ```
   */
  static async getBudgetConfig(context: Context): Promise<BudgetConfig> {
    // Check cache first
    if (this.budgetConfigCache && Date.now() < this.budgetConfigCache.expiresAt) {
      return this.budgetConfigCache.data;
    }

    try {
      // Fetch all settings from Devvit
      const settings = await context.settings.getAll();

      // Build configuration with defaults
      const config: BudgetConfig = {
        dailyLimitUSD: (settings.dailyBudgetLimit as number) ?? 5.0,
        monthlyLimitUSD: (settings.monthlyBudgetLimit as number) ?? 150.0,
        alertThresholds: {
          threshold50: (settings.budgetAlertThreshold50 as boolean) ?? true,
          threshold75: (settings.budgetAlertThreshold75 as boolean) ?? true,
          threshold90: (settings.budgetAlertThreshold90 as boolean) ?? true,
        },
      };

      // Cache the result
      this.budgetConfigCache = {
        data: config,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      };

      return config;
    } catch (error) {
      console.error('[SettingsService] Failed to fetch budget config:', error);

      // Return defaults on error (graceful degradation)
      return {
        dailyLimitUSD: 5.0,
        monthlyLimitUSD: 150.0,
        alertThresholds: {
          threshold50: true,
          threshold75: true,
          threshold90: true,
        },
      };
    }
  }

  /**
   * Get dry-run configuration from settings
   *
   * Returns dry-run mode and logging configuration.
   * Results are cached for 60 seconds to reduce repeated settings reads.
   *
   * **Settings Fields** (from Phase 4.2 implementation):
   * - `dryRunMode` (boolean, default: true)
   * - `dryRunLogDetails` (boolean, default: true)
   *
   * **Default Values**:
   * - dryRunMode: true (safe default - no actions taken)
   * - dryRunLogDetails: true (verbose logging enabled)
   *
   * @param context - Devvit context with settings access
   * @returns Dry-run configuration
   *
   * @example
   * ```typescript
   * const config = await SettingsService.getDryRunConfig(context);
   * const effectiveDryRun = config.dryRunMode || ruleSet.dryRun;
   * if (effectiveDryRun) {
   *   console.log('DRY RUN: Would remove post');
   * } else {
   *   await context.reddit.remove(post.id);
   * }
   * ```
   */
  static async getDryRunConfig(context: Context): Promise<DryRunConfig> {
    // Check cache first
    if (this.dryRunConfigCache && Date.now() < this.dryRunConfigCache.expiresAt) {
      return this.dryRunConfigCache.data;
    }

    try {
      // Fetch all settings from Devvit
      const settings = await context.settings.getAll();

      // Build configuration with defaults
      const config: DryRunConfig = {
        dryRunMode: (settings.dryRunMode as boolean) ?? true, // Safe default: dry-run enabled
        dryRunLogDetails: (settings.dryRunLogDetails as boolean) ?? true,
      };

      // Cache the result
      this.dryRunConfigCache = {
        data: config,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      };

      return config;
    } catch (error) {
      console.error('[SettingsService] Failed to fetch dry-run config:', error);

      // Return safe defaults on error (dry-run enabled)
      return {
        dryRunMode: true,
        dryRunLogDetails: true,
      };
    }
  }

  /**
   * Invalidate all cached settings
   *
   * Forces next settings read to fetch fresh data from Devvit.
   * Useful for testing and after settings updates.
   *
   * **When to use**:
   * - After settings are updated via UI
   * - Before/after tests that modify settings
   * - When debugging cache-related issues
   *
   * @example
   * ```typescript
   * // After updating settings
   * await updateSettings(context, { dailyBudgetLimit: 10 });
   * SettingsService.invalidateCache();
   * const config = await SettingsService.getBudgetConfig(context); // Fresh read
   * ```
   */
  static invalidateCache(): void {
    this.aiConfigCache = undefined;
    this.budgetConfigCache = undefined;
    this.dryRunConfigCache = undefined;
    console.log('[SettingsService] Cache invalidated');
  }

  /**
   * Get cache status for debugging
   *
   * Returns information about cached entries and their expiry times.
   * Useful for debugging cache-related issues.
   *
   * @returns Object with cache status for each config type
   *
   * @example
   * ```typescript
   * const status = SettingsService.getCacheStatus();
   * console.log('AI config cached:', status.aiConfig.cached);
   * console.log('Expires in:', status.aiConfig.expiresInMs, 'ms');
   * ```
   */
  static getCacheStatus(): {
    aiConfig: { cached: boolean; expiresInMs: number };
    budgetConfig: { cached: boolean; expiresInMs: number };
    dryRunConfig: { cached: boolean; expiresInMs: number };
  } {
    const now = Date.now();

    return {
      aiConfig: {
        cached: !!(this.aiConfigCache && now < this.aiConfigCache.expiresAt),
        expiresInMs: this.aiConfigCache ? Math.max(0, this.aiConfigCache.expiresAt - now) : 0,
      },
      budgetConfig: {
        cached: !!(this.budgetConfigCache && now < this.budgetConfigCache.expiresAt),
        expiresInMs: this.budgetConfigCache ? Math.max(0, this.budgetConfigCache.expiresAt - now) : 0,
      },
      dryRunConfig: {
        cached: !!(this.dryRunConfigCache && now < this.dryRunConfigCache.expiresAt),
        expiresInMs: this.dryRunConfigCache ? Math.max(0, this.dryRunConfigCache.expiresAt - now) : 0,
      },
    };
  }
}
