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
 * AI Provider Selector
 *
 * Intelligently selects which AI provider to use based on health status,
 * circuit breaker state, and priority configuration. Implements automatic
 * failover between Claude, OpenAI, and DeepSeek providers.
 *
 * Selection Strategy:
 * 1. Get enabled providers sorted by priority (Claude → OpenAI → DeepSeek)
 * 2. Check circuit breaker state for each provider
 * 3. Skip providers with OPEN circuits
 * 4. Check health status (cached for 5 minutes)
 * 5. Return first healthy provider with CLOSED or HALF_OPEN circuit
 * 6. Return null if all providers unavailable (caller handles degradation)
 *
 * @module ai/selector
 *
 * @example
 * ```typescript
 * const selector = ProviderSelector.getInstance(context);
 *
 * // Select best available provider
 * const provider = await selector.selectProvider();
 * if (provider === null) {
 *   console.error('All AI providers unavailable - degrading to trust scores');
 *   // Handle degradation
 * } else {
 *   const result = await provider.analyze(request);
 * }
 *
 * // Check all provider health
 * const healthStatus = await selector.checkAllProviders();
 * console.log('Claude healthy:', healthStatus.claude.healthy);
 * console.log('Circuit state:', healthStatus.claude.circuitState);
 * ```
 */

import { Devvit } from '@devvit/public-api';
import { IAIProvider } from './provider.js';
// import { ClaudeProvider } from './claude.js'; // DEPRECATED: Not approved by Reddit
import { OpenAIProvider } from './openai.js';
// import { OpenAICompatibleProvider } from './openaiCompatible.js'; // DEPRECATED: Not approved by Reddit
import { CircuitBreaker } from './circuitBreaker.js';
import { AIProviderType, ProviderHealthStatus } from '../types/ai.js';
import { AI_CONFIG, getEnabledProviders } from '../config/ai.js';
import { ConfigurationManager } from '../config/configManager.js';
import { SettingsService } from '../config/settingsService.js';
import { GeminiProvider } from './gemini.js';

/**
 * Provider Selector - Intelligent AI provider selection with automatic failover
 *
 * Singleton class that manages provider selection based on:
 * - Provider priority configuration (Claude #1, OpenAI #2, DeepSeek #3)
 * - Circuit breaker state (skip OPEN circuits)
 * - Health check results (cached for 5 minutes)
 * - A/B testing configuration (for Week 2 testing)
 *
 * Key features:
 * - Automatic failover to healthy providers
 * - Circuit breaker integration for fault tolerance
 * - Health check caching to reduce overhead
 * - A/B testing support for provider comparison
 * - Graceful degradation when all providers down
 */
export class ProviderSelector {
  /**
   * A/B testing enabled flag
   * When true, selectProvider uses distribution-based selection
   * When false (default), uses priority-based selection
   * NOTE: Currently unused - reserved for future A/B testing feature (Week 2)
   */
  // private _abTestEnabled: boolean = false;

  /**
   * A/B testing distribution percentages
   * Must sum to 100. Default: 100% Claude, 0% others
   * Example: { claude: 40, openai: 30, deepseek: 30 }
   * NOTE: Currently unused - reserved for future A/B testing feature (Week 2)
   */
  // private _abTestDistribution: Record<AIProviderType, number> = {
  //   claude: 100,
  //   openai: 0,
  //   deepseek: 0,
  // };

  /**
   * Private constructor - use getInstance() instead
   * @param context - Devvit context for Redis and Secrets Manager access
   */
  private constructor(private context: Devvit.Context) {}

  /**
   * Singleton instances keyed by Devvit context
   * Ensures one ProviderSelector per context
   */
  private static instances = new Map<any, ProviderSelector>();

  /**
   * Get or create ProviderSelector instance for this context
   *
   * Uses singleton pattern to ensure consistent state within a context.
   * Each Devvit context gets its own ProviderSelector instance.
   *
   * @param context - Devvit context containing Redis and Secrets Manager
   * @returns Singleton ProviderSelector instance for this context
   *
   * @example
   * ```typescript
   * // In a Devvit trigger handler
   * export async function onPostSubmit(event: PostSubmit, context: Devvit.Context) {
   *   const selector = ProviderSelector.getInstance(context);
   *   const provider = await selector.selectProvider();
   *   // Use provider...
   * }
   * ```
   */
  static getInstance(context: Devvit.Context): ProviderSelector {
    if (!this.instances.has(context)) {
      this.instances.set(context, new ProviderSelector(context));
    }
    return this.instances.get(context)!;
  }

  /**
   * Select the best available AI provider based on priority and health
   *
   * Selection algorithm:
   * 1. Get enabled providers sorted by priority (Claude → OpenAI → DeepSeek)
   * 2. For each provider in priority order:
   *    a. Check if provider is healthy (health check + circuit breaker)
   *    b. If healthy, create and return provider instance
   *    c. If unhealthy, log skip reason and try next provider
   * 3. If all providers unhealthy, return null
   *
   * Health checks are cached for 5 minutes to reduce overhead.
   * Providers with OPEN circuits are automatically skipped.
   *
   * @returns Promise resolving to provider instance, or null if all unavailable
   *
   * @example
   * ```typescript
   * const selector = ProviderSelector.getInstance(context);
   * const provider = await selector.selectProvider();
   *
   * if (provider === null) {
   *   console.error('All AI providers unavailable');
   *   // Degrade to trust-score-only mode
   * } else {
   *   console.log('Selected provider:', provider.type);
   *   const result = await provider.analyze(request);
   * }
   * ```
   */
  async selectProvider(excludeProvider?: AIProviderType): Promise<IAIProvider | null> {
    // Get user settings - this tells us what they selected
    const aiSettings = await SettingsService.getAIConfig(this.context);

    console.log('[ProviderSelector] User settings:', {
      primary: aiSettings.primaryProvider,
      fallback: aiSettings.fallbackProvider,
      excluding: excludeProvider,
    });

    // Try primary provider first (unless we're excluding it)
    if (aiSettings.primaryProvider && aiSettings.primaryProvider !== excludeProvider) {
      console.log('[ProviderSelector] Trying primary provider:', aiSettings.primaryProvider);
      const provider = await this.createProvider(aiSettings.primaryProvider, aiSettings);
      if (provider) {
        console.log('[ProviderSelector] ✓ Using primary provider:', aiSettings.primaryProvider);
        return provider;
      }
      console.warn('[ProviderSelector] ✗ Primary provider failed to create:', aiSettings.primaryProvider);
    }

    // Try fallback provider if configured (unless we're excluding it)
    if (aiSettings.fallbackProvider &&
        aiSettings.fallbackProvider !== 'none' &&
        aiSettings.fallbackProvider !== excludeProvider) {
      console.log('[ProviderSelector] Trying fallback provider:', aiSettings.fallbackProvider);
      const provider = await this.createProvider(aiSettings.fallbackProvider, aiSettings);
      if (provider) {
        console.log('[ProviderSelector] ✓ Using fallback provider:', aiSettings.fallbackProvider);
        return provider;
      }
      console.warn('[ProviderSelector] ✗ Fallback provider failed to create:', aiSettings.fallbackProvider);
    }

    console.error('[ProviderSelector] All providers failed');
    return null;
  }

  /**
   * Create a provider instance based on type
   * Returns null if provider not configured or fails to create
   */
  private async createProvider(type: AIProviderType, aiSettings: any): Promise<IAIProvider | null> {
    try {
      if (type === 'openai') {
        if (!aiSettings.openaiApiKey) {
          console.warn('[ProviderSelector] OpenAI API key not configured');
          return null;
        }
        return new OpenAIProvider(aiSettings.openaiApiKey);
      }

      if (type === 'gemini') {
        if (!aiSettings.geminiApiKey) {
          console.warn('[ProviderSelector] Gemini API key not configured');
          return null;
        }
        return new GeminiProvider(aiSettings.geminiApiKey);
      }

      console.warn('[ProviderSelector] Unknown provider type:', type);
      return null;
    } catch (error) {
      console.error(`[ProviderSelector] Failed to create ${type} provider:`, error);
      return null;
    }
  }

  /**
   * OLD COMPLEX LOGIC BELOW - KEEPING FOR NOW BUT NOT USED
   */
  private async _oldSelectProvider_UNUSED(): Promise<IAIProvider | null> {
    // Get enabled providers sorted by priority (now respects settings)
    const enabledProviders = await getEnabledProviders(this.context);

    if (enabledProviders.length === 0) {
      console.error('[ProviderSelector] No enabled providers configured');
      return null;
    }

    console.log(
      `[ProviderSelector] Checking providers in priority order: ${enabledProviders.join(' → ')}`
    );

    // Try each provider in priority order
    for (const providerType of enabledProviders) {
      try {
        // Check if provider is healthy
        const isHealthy = await this.isProviderHealthy(providerType);

        if (!isHealthy) {
          console.log(
            `[ProviderSelector] Skipping ${providerType} - unhealthy or circuit open`
          );
          continue;
        }

        // Provider is healthy, create instance
        const provider = await this.getProviderInstance(providerType);
        const priority = AI_CONFIG.providers[providerType].priority;

        console.log(
          `[ProviderSelector] Selected ${providerType} (priority ${priority})`
        );
        return provider;
      } catch (error) {
        console.error(
          `[ProviderSelector] Error checking ${providerType}:`,
          error
        );
        // Continue to next provider
      }
    }

    // All providers unavailable
    console.error('[ProviderSelector] All providers unavailable');
    return null;
  }

  /**
   * Health check all enabled providers and return detailed status
   *
   * Performs health checks on all enabled providers and returns comprehensive
   * status including circuit breaker state, recent failures, and response time.
   *
   * Process:
   * 1. Get all enabled providers from configuration
   * 2. For each provider:
   *    - Get circuit breaker state
   *    - If circuit OPEN, mark unhealthy (skip health check)
   *    - If circuit CLOSED/HALF_OPEN, perform health check
   *    - Cache result in Redis with 5 minute TTL
   * 3. Return ProviderHealthStatus for each provider
   *
   * Results are cached to avoid excessive health checks.
   *
   * @returns Promise resolving to health status for each provider
   *
   * @example
   * ```typescript
   * const selector = ProviderSelector.getInstance(context);
   * const healthStatus = await selector.checkAllProviders();
   *
   * // Check each provider
   * for (const [provider, status] of Object.entries(healthStatus)) {
   *   console.log(`${provider}:`);
   *   console.log(`  Healthy: ${status.healthy}`);
   *   console.log(`  Circuit: ${status.circuitState}`);
   *   console.log(`  Failures: ${status.recentFailures}`);
   * }
   *
   * // Check if any provider is healthy
   * const anyHealthy = Object.values(healthStatus).some(s => s.healthy);
   * if (!anyHealthy) {
   *   console.error('All providers down!');
   * }
   * ```
   */
  async checkAllProviders(): Promise<
    Record<AIProviderType, ProviderHealthStatus>
  > {
    const enabledProviders = await getEnabledProviders(this.context);
    const circuitBreaker = CircuitBreaker.getInstance(this.context);
    const healthStatus: Partial<Record<AIProviderType, ProviderHealthStatus>> =
      {};

    console.log(
      `[ProviderSelector] Health checking providers: ${enabledProviders.join(', ')}`
    );

    // Check each enabled provider
    for (const providerType of enabledProviders) {
      try {
        // Get circuit breaker state
        const circuitState = await circuitBreaker.getState(providerType);

        let healthy = false;
        let avgResponseTimeMs: number | undefined = undefined;

        // If circuit is OPEN, don't perform health check
        if (circuitState.state === 'OPEN') {
          console.log(
            `[ProviderSelector] ${providerType} circuit OPEN - marking unhealthy`
          );
          healthy = false;
        } else {
          // Circuit is CLOSED or HALF_OPEN, perform health check
          try {
            const startTime = Date.now();
            const provider = await this.getProviderInstance(providerType);
            healthy = await provider.healthCheck();
            avgResponseTimeMs = Date.now() - startTime;

            // Cache health check result
            const cacheKey = `provider:health:${providerType}`;
            const cacheValue = healthy ? 'healthy' : 'unhealthy';
            await this.context.redis.set(cacheKey, cacheValue, {
              expiration: new Date(
                Date.now() + AI_CONFIG.caching.healthCheckTTL * 1000
              ),
            });

            console.log(
              `[ProviderSelector] Health check for ${providerType}: ${healthy} (${avgResponseTimeMs}ms)`
            );
          } catch (error) {
            console.error(
              `[ProviderSelector] Health check failed for ${providerType}:`,
              error
            );
            healthy = false;
          }
        }

        // Build health status
        healthStatus[providerType] = {
          provider: providerType,
          healthy,
          lastCheckTime: Date.now(),
          circuitState: circuitState.state,
          recentFailures: circuitState.failureCount,
          avgResponseTimeMs,
        };
      } catch (error) {
        console.error(
          `[ProviderSelector] Error checking ${providerType}:`,
          error
        );

        // Default to unhealthy on error
        healthStatus[providerType] = {
          provider: providerType,
          healthy: false,
          lastCheckTime: Date.now(),
          circuitState: 'OPEN',
          recentFailures: 0,
        };
      }
    }

    return healthStatus as Record<AIProviderType, ProviderHealthStatus>;
  }

  /**
   * Enable A/B testing mode for provider selection
   *
   * When enabled, selectProvider will use the distribution percentages
   * instead of priority-based selection. This allows testing different
   * providers against each other to compare quality and cost.
   *
   * Distribution must sum to 100. Same user ID always gets same provider
   * (consistent hashing) to ensure fair comparison.
   *
   * Note: Not implemented in Phase 1.2 - prepared for Week 2 testing.
   *
   * @param enabled - Enable or disable A/B testing
   * @param distribution - Percentage distribution across providers (must sum to 100)
   *
   * @example
   * ```typescript
   * const selector = ProviderSelector.getInstance(context);
   *
   * // Enable A/B testing: 40% Claude, 30% OpenAI, 30% DeepSeek
   * selector.setABTestMode(true, {
   *   claude: 40,
   *   openai: 30,
   *   deepseek: 30
   * });
   *
   * // Disable A/B testing (back to priority-based)
   * selector.setABTestMode(false, {
   *   claude: 100,
   *   openai: 0,
   *   deepseek: 0
   * });
   * ```
   */
  setABTestMode(
    enabled: boolean,
    distribution: Record<AIProviderType, number>
  ): void {
    // Validate distribution sums to 100
    const sum = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      console.warn(
        `[ProviderSelector] A/B test distribution sums to ${sum}, expected 100`
      );
    }

    // TODO: Implement A/B testing in Week 2
    // this._abTestEnabled = enabled;
    // this._abTestDistribution = distribution;
    console.log('[ProviderSelector] A/B testing not yet implemented', { enabled, distribution });

    console.log(
      `[ProviderSelector] A/B testing ${enabled ? 'enabled' : 'disabled'}`
    );
    if (enabled) {
      console.log('[ProviderSelector] Distribution:', distribution);
    }
  }

  /**
   * Create provider instance with API key from Secrets Manager
   *
   * Retrieves API key from Devvit Settings and creates the
   * appropriate provider client instance (Claude, OpenAI, or DeepSeek).
   *
   * API keys are stored in Devvit settings:
   * - Claude: claudeApiKey
   * - OpenAI: openaiApiKey
   * - DeepSeek: deepseekApiKey
   *
   * @param type - Provider type to instantiate
   * @returns Promise resolving to provider instance
   * @throws Error if API key is missing or invalid
   * @private
   *
   * @example
   * ```typescript
   * // Internal use only - called by selectProvider()
   * const provider = await this.getProviderInstance('claude');
   * const result = await provider.analyze(request);
   * ```
   */
  private async getProviderInstance(type: AIProviderType): Promise<IAIProvider> {
    // Get effective config with settings-based API keys
    const config = await ConfigurationManager.getEffectiveAIConfig(this.context);
    const providerConfig = config.providers[type];

    // Check if API key is configured
    if (!providerConfig.apiKey) {
      console.warn(`[ProviderSelector] No API key configured for ${type}`);
      throw new Error(`No API key configured for ${type}. Please configure in Devvit settings.`);
    }

    // Create provider instance with settings-based API key
    // Note: Models are hardcoded in provider classes (gpt-4o-mini, gemini-1.5-flash)
    switch (type) {
      case 'openai':
        return new OpenAIProvider(providerConfig.apiKey);
      case 'gemini':
        return new GeminiProvider(providerConfig.apiKey);
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Check if a single provider is healthy
   *
   * Checks provider health using cached results when available.
   * Cache TTL is 5 minutes (AI_CONFIG.caching.healthCheckTTL).
   *
   * Health check logic:
   * 1. Check Redis cache for recent health check result
   * 2. If cached, return cached result
   * 3. If not cached, check circuit breaker state
   * 4. If circuit OPEN, return false (unhealthy)
   * 5. If circuit CLOSED/HALF_OPEN, perform health check
   * 6. Cache result and return
   *
   * @param type - Provider type to check
   * @returns Promise resolving to true if healthy, false otherwise
   * @private
   *
   * @example
   * ```typescript
   * // Internal use only - called by selectProvider()
   * const isHealthy = await this.isProviderHealthy('claude');
   * if (isHealthy) {
   *   const provider = await this.getProviderInstance('claude');
   *   // Use provider...
   * }
   * ```
   */
  private async isProviderHealthy(type: AIProviderType): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = `provider:health:${type}`;
      const cachedHealth = await this.context.redis.get(cacheKey);

      if (cachedHealth !== undefined) {
        const healthy = cachedHealth === 'healthy';
        console.log(
          `[ProviderSelector] Using cached health for ${type}: ${healthy}`
        );
        return healthy;
      }

      // Not cached, check circuit breaker state
      const circuitBreaker = CircuitBreaker.getInstance(this.context);
      const circuitState = await circuitBreaker.getState(type);

      // If circuit is OPEN, don't perform health check
      if (circuitState.state === 'OPEN') {
        console.log(
          `[ProviderSelector] ${type} circuit OPEN - skipping health check`
        );

        // Cache unhealthy result
        await this.context.redis.set(cacheKey, 'unhealthy', {
          expiration: new Date(
            Date.now() + AI_CONFIG.caching.healthCheckTTL * 1000
          ),
        });

        return false;
      }

      // Circuit is CLOSED or HALF_OPEN, perform health check
      try {
        const provider = await this.getProviderInstance(type);
        const healthy = await provider.healthCheck();

        // Cache result
        const cacheValue = healthy ? 'healthy' : 'unhealthy';
        await this.context.redis.set(cacheKey, cacheValue, {
          expiration: new Date(
            Date.now() + AI_CONFIG.caching.healthCheckTTL * 1000
          ),
        });

        console.log(`[ProviderSelector] Health check for ${type}: ${healthy}`);
        return healthy;
      } catch (error) {
        console.error(
          `[ProviderSelector] Health check failed for ${type}:`,
          error
        );

        // Cache unhealthy result
        await this.context.redis.set(cacheKey, 'unhealthy', {
          expiration: new Date(
            Date.now() + AI_CONFIG.caching.healthCheckTTL * 1000
          ),
        });

        return false;
      }
    } catch (error) {
      // Redis error or other unexpected error
      console.error(
        `[ProviderSelector] Error checking health for ${type}:`,
        error
      );

      // Default to healthy on error (fail open)
      // This prevents Redis issues from blocking all providers
      return true;
    }
  }
}
