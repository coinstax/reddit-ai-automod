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
 * Configuration Manager
 *
 * Merges hardcoded AI_CONFIG defaults with runtime settings from Devvit Settings UI.
 * Provides the "effective" configuration that components should use.
 *
 * Key Features:
 * - Merges AI_CONFIG defaults with SettingsService values
 * - Settings take precedence over defaults
 * - API keys from settings override hardcoded config
 * - Budget limits from settings override defaults
 * - Type-safe configuration merging
 *
 * Merge Strategy:
 * - Start with complete AI_CONFIG defaults
 * - Override provider API keys if configured in settings
 * - Override budget limits with settings values
 * - Keep all other fields (models, costs, retry, circuit breaker) from AI_CONFIG
 *
 * @module config/configManager
 */

import type { Context } from '@devvit/public-api';
import { AI_CONFIG } from './ai.js';
import { SettingsService } from './settingsService.js';
import type { AIConfig } from '../types/ai.js';

/**
 * Configuration Manager
 *
 * Merges hardcoded defaults (AI_CONFIG) with runtime settings to produce
 * the effective configuration used by AI components.
 *
 * @example
 * ```typescript
 * // In AIAnalyzer
 * const config = await ConfigurationManager.getEffectiveAIConfig(context);
 * const claudeProvider = new ClaudeProvider(
 *   config.providers.claude.apiKey!,
 *   config.providers.claude.model
 * );
 * ```
 */
export class ConfigurationManager {
  /**
   * Get effective AI configuration
   *
   * Merges AI_CONFIG defaults with settings from Devvit Settings UI.
   * Settings take precedence where provided.
   *
   * **Merge Behavior**:
   * 1. Start with complete AI_CONFIG (defaults for everything)
   * 2. Fetch AIProviderConfig and BudgetConfig from SettingsService
   * 3. Add API keys to provider configs if configured in settings
   * 4. Override budget limits with settings values
   * 5. Keep all other AI_CONFIG fields unchanged (models, costs, retry, circuit breaker)
   *
   * **API Key Handling**:
   * - API keys are NOT in AI_CONFIG (security)
   * - API keys come from SettingsService (Devvit Settings UI)
   * - If no API key in settings, provider config has no apiKey field
   * - Providers check for apiKey existence before making calls
   *
   * **Budget Handling**:
   * - Default budget limits from AI_CONFIG
   * - Settings override with user-configured limits
   * - Alert thresholds converted from boolean flags to numeric array
   *
   * @param context - Devvit context with settings access
   * @returns Complete AI configuration with merged values
   *
   * @example
   * ```typescript
   * const config = await ConfigurationManager.getEffectiveAIConfig(context);
   *
   * // Check if API keys are configured
   * if (!config.providers.claude.apiKey) {
   *   console.warn('Claude API key not configured');
   * }
   *
   * // Use merged budget limits
   * console.log('Daily budget:', config.budget.dailyLimitUSD);
   *
   * // All other fields from AI_CONFIG
   * console.log('Claude model:', config.providers.claude.model);
   * console.log('Retry attempts:', config.retry.maxAttempts);
   * ```
   */
  static async getEffectiveAIConfig(context: Context): Promise<AIConfig> {
    // Fetch settings configurations
    const [aiProviderConfig, budgetConfig] = await Promise.all([
      SettingsService.getAIConfig(context),
      SettingsService.getBudgetConfig(context),
    ]);

    // Start with complete AI_CONFIG defaults
    const effectiveConfig: AIConfig = {
      ...AI_CONFIG,

      // Merge provider configurations
      providers: {
        openai: {
          ...AI_CONFIG.providers.openai,
          // Add API key if configured in settings
          ...(aiProviderConfig.openaiApiKey && { apiKey: aiProviderConfig.openaiApiKey }),
        },
        gemini: {
          ...AI_CONFIG.providers.gemini,
          // Add API key if configured in settings
          ...(aiProviderConfig.geminiApiKey && { apiKey: aiProviderConfig.geminiApiKey }),
        },
      },

      // Override budget configuration with settings
      budget: {
        dailyLimitUSD: budgetConfig.dailyLimitUSD,
        monthlyLimitUSD: budgetConfig.monthlyLimitUSD,
        // Convert boolean thresholds to numeric array
        alertThresholds: [
          ...(budgetConfig.alertThresholds.threshold50 ? [0.5] : []),
          ...(budgetConfig.alertThresholds.threshold75 ? [0.75] : []),
          ...(budgetConfig.alertThresholds.threshold90 ? [0.9] : []),
        ],
      },

      // Keep all other AI_CONFIG fields unchanged
      // - caching strategy
      // - retry configuration
      // - circuit breaker settings
      // - degradation level
    };

    return effectiveConfig;
  }

  /**
   * Check if any AI providers are configured
   *
   * Returns true if at least one enabled provider has an API key configured.
   * Useful for determining if AI analysis is possible.
   *
   * @param context - Devvit context with settings access
   * @returns True if any provider is configured
   *
   * @example
   * ```typescript
   * const hasProviders = await ConfigurationManager.hasConfiguredProviders(context);
   * if (!hasProviders) {
   *   console.warn('No AI providers configured - AI analysis disabled');
   *   return;
   * }
   * ```
   */
  static async hasConfiguredProviders(context: Context): Promise<boolean> {
    const config = await this.getEffectiveAIConfig(context);

    // Check if any enabled provider has an API key
    const providers = Object.values(config.providers);
    return providers.some((provider) => provider.enabled && 'apiKey' in provider && provider.apiKey);
  }

  /**
   * Get list of configured provider types
   *
   * Returns array of provider types that have API keys configured.
   * Useful for logging which providers are available.
   *
   * @param context - Devvit context with settings access
   * @returns Array of configured provider types
   *
   * @example
   * ```typescript
   * const providers = await ConfigurationManager.getConfiguredProviders(context);
   * console.log('Available providers:', providers); // ['claude', 'openai']
   * ```
   */
  static async getConfiguredProviders(context: Context): Promise<string[]> {
    const config = await this.getEffectiveAIConfig(context);

    // Filter to enabled providers with API keys
    return Object.entries(config.providers)
      .filter(([_, providerConfig]) => providerConfig.enabled && 'apiKey' in providerConfig && providerConfig.apiKey)
      .map(([type, _]) => type);
  }

  /**
   * Validate effective configuration
   *
   * Checks for common configuration issues:
   * - No providers configured
   * - Invalid budget limits
   * - Invalid provider priority
   *
   * Returns array of warning messages (empty if no issues).
   *
   * @param context - Devvit context with settings access
   * @returns Array of warning messages
   *
   * @example
   * ```typescript
   * const warnings = await ConfigurationManager.validateConfig(context);
   * if (warnings.length > 0) {
   *   warnings.forEach(warn => console.warn(warn));
   * }
   * ```
   */
  static async validateConfig(context: Context): Promise<string[]> {
    const warnings: string[] = [];

    try {
      const config = await this.getEffectiveAIConfig(context);

      // Check if any providers are configured
      const hasProviders = await this.hasConfiguredProviders(context);
      if (!hasProviders) {
        warnings.push('No AI providers configured - AI analysis will not work');
      }

      // Check budget limits are positive
      if (config.budget.dailyLimitUSD <= 0) {
        warnings.push('Daily budget limit must be positive');
      }
      if (config.budget.monthlyLimitUSD <= 0) {
        warnings.push('Monthly budget limit must be positive');
      }

      // Check daily limit doesn't exceed monthly limit
      if (config.budget.dailyLimitUSD * 30 > config.budget.monthlyLimitUSD) {
        warnings.push('Daily limit * 30 exceeds monthly limit - monthly limit may be hit early');
      }

      // Check that at least one alert threshold is enabled
      if (config.budget.alertThresholds.length === 0) {
        warnings.push('No budget alert thresholds enabled - you will not receive budget warnings');
      }
    } catch (error) {
      warnings.push(`Failed to validate config: ${error instanceof Error ? error.message : String(error)}`);
    }

    return warnings;
  }
}
