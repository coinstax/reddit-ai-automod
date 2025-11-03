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
 * AI System Configuration
 *
 * Central configuration for all AI system components including:
 * - Provider settings (Claude, OpenAI, DeepSeek)
 * - Budget limits and cost tracking
 * - Caching strategies
 * - Retry and circuit breaker behavior
 * - System degradation levels
 *
 * This is the single source of truth for AI system settings.
 * All values are production-ready but can be adjusted for testing.
 *
 * @module config/ai
 */

import {
  AIConfig,
  AIProviderType,
  DegradationLevel,
} from '../types/ai.js';

/**
 * Primary AI system configuration
 *
 * Provider Priority Strategy:
 * 1. Claude 3.5 Haiku - Primary (fastest, good quality, moderate cost)
 * 2. GPT-4o Mini - Fallback (fast, good quality, low cost)
 * 3. DeepSeek V3 - Low-cost option (slowest, good quality, very low cost)
 *
 * Budget Strategy:
 * - Daily limit: $5.00 (prevents runaway costs)
 * - Monthly limit: $150.00 (supports ~10,000-15,000 analyses/month)
 * - Alert thresholds at 50%, 75%, 90% to warn before hitting limits
 *
 * Caching Strategy:
 * - High trust users (60-69 score): 48h cache - stable behavior, rarely analyzed
 * - Medium trust (40-59 score): 24h cache - moderate stability
 * - Low trust (<40 score): 12h cache - more frequent re-analysis needed
 * - Known bad actors: 7 days cache - behavior is well-established
 *
 * Retry Strategy:
 * - Max 3 attempts with exponential backoff (1s, 2s, 4s)
 * - Prevents overwhelming failing providers
 * - Falls back to next provider after max attempts
 *
 * Circuit Breaker Strategy:
 * - Opens after 5 consecutive failures
 * - Prevents cascading failures
 * - Tests recovery after 30 seconds
 * - Closes after 2 consecutive successes
 */
export const AI_CONFIG: AIConfig = {
  /**
   * AI Provider Configurations
   *
   * Each provider has:
   * - model: Specific model version to use
   * - enabled: Can be disabled for maintenance or cost control
   * - priority: 1 = primary, 2 = fallback, etc. (lower number = higher priority)
   * - costPerMTokenInput: Cost per million input tokens in USD (from provider pricing)
   * - costPerMTokenOutput: Cost per million output tokens in USD (from provider pricing)
   *
   * Cost data as of 2025-01-26:
   * - Claude 3.5 Haiku: $1.00 / $5.00 per MTok
   * - GPT-4o Mini: $0.15 / $0.60 per MTok
   * - DeepSeek V3: $0.27 / $1.10 per MTok
   *
   * Note: API keys are NOT stored here - they are in Devvit Secrets Manager
   */
  providers: {
    openai: {
      type: 'openai' as const,
      model: 'gpt-4o-mini',
      enabled: true,
      priority: 1, // Primary provider - Reddit approved, cheap, good quality
      costPerMTokenInput: 0.15,
      costPerMTokenOutput: 0.6,
    },
    gemini: {
      type: 'gemini' as const,
      model: 'gemini-1.5-flash',
      enabled: true,
      priority: 2, // Fallback provider - Reddit approved, cost-effective
      costPerMTokenInput: 0.075,
      costPerMTokenOutput: 0.30,
    },
  },

  /**
   * Budget Configuration
   *
   * Prevents runaway AI costs with hard limits:
   * - Daily limit: $5.00 - handles ~500-1000 analyses/day depending on provider mix
   * - Monthly limit: $150.00 - handles ~10,000-15,000 analyses/month
   * - Alert thresholds: Get warnings at 50%, 75%, 90% of daily budget
   *
   * When budget is exceeded:
   * - No more AI calls are made (BUDGET_EXCEEDED error)
   * - System degrades to trust-score-only mode
   * - Moderators are alerted to review spending
   *
   * Cost tracking is per-provider to identify which provider is most cost-effective
   */
  budget: {
    dailyLimitUSD: 5.0,
    monthlyLimitUSD: 150.0,
    alertThresholds: [0.5, 0.75, 0.9], // Alert at 50%, 75%, 90% of daily limit
  },

  /**
   * Caching Configuration
   *
   * Reduces costs and latency by caching AI analysis results:
   *
   * Analysis Caching:
   * - analysisTTL: Default cache time for AI analysis results
   * - Cached results are stored in Redis with user ID as key
   * - Cache is invalidated on new user activity that changes trust score
   *
   * Health Check Caching:
   * - healthCheckTTL: How long to cache provider health status
   * - Prevents excessive health checks on every request
   * - Health check = lightweight ping to verify provider is responding
   *
   * Differential Caching (Trust-Based):
   * - High trust users (60-69): 48h cache - very stable, rarely need re-analysis
   * - Medium trust (40-59): 24h cache - moderately stable
   * - Low trust (<40): 12h cache - need frequent re-analysis
   * - Known bad actors: 7 days cache - behavior well-established, save costs
   *
   * Why differential caching?
   * - High trust users are expensive to analyze but low risk
   * - Low trust users need frequent monitoring
   * - Known bad actors don't need re-analysis (already flagged)
   */
  caching: {
    analysisTTL: 86400, // 24 hours in seconds - default cache time
    healthCheckTTL: 300, // 5 minutes in seconds - health check cache
    differential: {
      highTrust: 172800, // 48 hours (60-69 trust score)
      mediumTrust: 86400, // 24 hours (40-59 trust score)
      lowTrust: 43200, // 12 hours (<40 trust score)
      knownBad: 604800, // 7 days (flagged users)
    },
  },

  /**
   * Retry Configuration
   *
   * Controls retry behavior for failed AI API calls:
   * - maxAttempts: Try up to 3 times total (1 initial + 2 retries)
   * - initialDelayMs: Wait 1 second before first retry
   * - maxDelayMs: Cap exponential backoff at 10 seconds
   * - backoffMultiplier: Double delay each retry (1s → 2s → 4s)
   *
   * Retry sequence:
   * 1. Initial call fails
   * 2. Wait 1000ms, retry 1
   * 3. Wait 2000ms, retry 2
   * 4. Wait 4000ms, retry 3
   * 5. Give up, try next provider
   *
   * Not all errors are retried:
   * - RATE_LIMIT: Retry with backoff
   * - TIMEOUT: Retry with same timeout
   * - INVALID_RESPONSE: Retry once
   * - BUDGET_EXCEEDED: DO NOT retry
   * - CIRCUIT_OPEN: Skip to next provider immediately
   */
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },

  /**
   * Circuit Breaker Configuration
   *
   * Implements Circuit Breaker pattern to prevent cascading failures:
   *
   * States:
   * - CLOSED: Normal operation, requests go through
   * - OPEN: Provider is failing, block all requests
   * - HALF_OPEN: Testing recovery, allow limited requests
   *
   * Transition logic:
   * - CLOSED → OPEN: After 5 consecutive failures
   * - OPEN → HALF_OPEN: After 30 seconds
   * - HALF_OPEN → CLOSED: After 2 consecutive successes
   * - HALF_OPEN → OPEN: On any failure
   *
   * Configuration:
   * - failureThreshold: 5 failures → open circuit
   * - halfOpenRetryDelay: 30 seconds before testing recovery
   * - successThreshold: 2 successes → close circuit
   * - timeout: 10 seconds per request before considering it failed
   *
   * Why circuit breakers?
   * - Prevents wasting time on failing providers
   * - Allows providers to recover without being hammered
   * - Automatically fails over to healthy providers
   * - Self-healing when provider recovers
   */
  circuitBreaker: {
    failureThreshold: 5,
    halfOpenRetryDelay: 30000, // 30 seconds in milliseconds
    successThreshold: 2,
    timeout: 10000, // 10 seconds in milliseconds
  },

  /**
   * System Degradation Level
   *
   * Controls how the system operates when AI providers are struggling:
   * - FULL: All AI features enabled (normal operation)
   * - REDUCED: Skip expensive checks, use simpler prompts
   * - MINIMAL: Trust scores only, no AI analysis
   * - EMERGENCY: Manual review only, no automation
   *
   * Default: FULL (normal operation)
   *
   * Degradation can be triggered by:
   * - Budget exhaustion
   * - All providers down
   * - Manual override by moderator
   *
   * This allows the bot to continue operating even when AI is unavailable
   */
  degradationLevel: DegradationLevel.FULL,
};

/**
 * Get provider configuration by type
 *
 * @param providerType - The AI provider to get config for
 * @returns Provider configuration object
 *
 * @example
 * const claudeConfig = getProviderConfig('claude');
 * console.log(claudeConfig.model); // 'claude-3-5-haiku-20241022'
 */
export function getProviderConfig(providerType: AIProviderType) {
  return AI_CONFIG.providers[providerType];
}

/**
 * Get all enabled providers sorted by priority from settings
 *
 * Returns enabled providers based on Devvit settings (primary/fallback)
 * instead of hardcoded priority. This allows users to control provider
 * selection via the Settings UI.
 *
 * Priority order:
 * 1. Primary provider from settings (if has API key)
 * 2. Fallback provider from settings (if has API key and not 'none')
 * 3. Any other enabled providers with API keys
 *
 * @param context - Devvit context for accessing settings
 * @returns Promise resolving to array of provider types in priority order
 *
 * @example
 * const providers = await getEnabledProviders(context);
 * // If settings: primary=openai, fallback=claude
 * // Returns: ['openai', 'claude', 'deepseek']
 * // Will try openai first, then claude, then deepseek
 */
export async function getEnabledProviders(context: any): Promise<AIProviderType[]> {
  // Import SettingsService dynamically to avoid circular dependency
  const { SettingsService } = await import('./settingsService.js');

  // Get provider settings - this tells us EXACTLY what the user selected
  const aiSettings = await SettingsService.getAIConfig(context);

  const providers: AIProviderType[] = [];

  console.log('[getEnabledProviders] User selected:', {
    primaryProvider: aiSettings.primaryProvider,
    fallbackProvider: aiSettings.fallbackProvider,
  });

  // SIMPLE LOGIC: Only add what the user explicitly selected

  // 1. Add primary provider (if set and has required config)
  if (aiSettings.primaryProvider) {
    const hasRequiredConfig = await checkProviderHasConfig(aiSettings, aiSettings.primaryProvider);
    if (hasRequiredConfig) {
      providers.push(aiSettings.primaryProvider);
      console.log('[getEnabledProviders] ✓ Added primary:', aiSettings.primaryProvider);
    } else {
      console.warn('[getEnabledProviders] ✗ Primary provider missing config:', aiSettings.primaryProvider);
    }
  }

  // 2. Add fallback provider (if not 'none' and not already added)
  if (aiSettings.fallbackProvider && aiSettings.fallbackProvider !== 'none') {
    if (!providers.includes(aiSettings.fallbackProvider)) {
      const hasRequiredConfig = await checkProviderHasConfig(aiSettings, aiSettings.fallbackProvider);
      if (hasRequiredConfig) {
        providers.push(aiSettings.fallbackProvider);
        console.log('[getEnabledProviders] ✓ Added fallback:', aiSettings.fallbackProvider);
      } else {
        console.warn('[getEnabledProviders] ✗ Fallback provider missing config:', aiSettings.fallbackProvider);
      }
    }
  }

  console.log('[getEnabledProviders] Final providers:', providers);
  return providers;
}

/**
 * Check if a provider has the required configuration
 * - openai: needs openaiApiKey
 * - gemini: needs geminiApiKey
 */
async function checkProviderHasConfig(aiSettings: any, provider: AIProviderType): Promise<boolean> {
  switch (provider) {
    case 'openai':
      return !!aiSettings.openaiApiKey;
    case 'gemini':
      return !!aiSettings.geminiApiKey;
    default:
      return false;
  }
}

/**
 * Get cache TTL based on trust score
 *
 * Implements differential caching strategy:
 * - Trust 60-69: 48h (high trust, stable users)
 * - Trust 40-59: 24h (medium trust, moderately stable)
 * - Trust <40: 12h (low trust, needs frequent checks)
 * - Known bad: 7 days (flagged users, no need to re-analyze)
 *
 * @param trustScore - User's trust score (0-100)
 * @param isKnownBad - Whether user is flagged as problematic
 * @returns Cache TTL in seconds
 *
 * @example
 * const ttl = getCacheTTLForTrustScore(65, false); // Returns 172800 (48h)
 * const badTtl = getCacheTTLForTrustScore(20, true); // Returns 604800 (7d)
 */
export function getCacheTTLForTrustScore(
  trustScore: number,
  isKnownBad: boolean = false
): number {
  const { differential } = AI_CONFIG.caching;

  if (isKnownBad) {
    return differential.knownBad;
  }

  if (trustScore >= 60) {
    return differential.highTrust;
  }

  if (trustScore >= 40) {
    return differential.mediumTrust;
  }

  return differential.lowTrust;
}

/**
 * Calculate estimated cost for an analysis
 *
 * Estimates cost based on average token usage:
 * - Input: ~2000 tokens (user profile + post history)
 * - Output: ~500 tokens (structured analysis result)
 *
 * @param provider - AI provider to use
 * @param inputTokens - Estimated input tokens (default: 2000)
 * @param outputTokens - Estimated output tokens (default: 500)
 * @returns Estimated cost in USD
 *
 * @example
 * const cost = estimateAnalysisCost('claude'); // ~$0.0035
 * const openaiCost = estimateAnalysisCost('openai'); // ~$0.0006
 */
export function estimateAnalysisCost(
  provider: AIProviderType,
  inputTokens: number = 2000,
  outputTokens: number = 500
): number {
  const config = getProviderConfig(provider);
  const inputCost = (inputTokens / 1_000_000) * config.costPerMTokenInput;
  const outputCost = (outputTokens / 1_000_000) * config.costPerMTokenOutput;
  return inputCost + outputCost;
}

/**
 * Validate configuration on module load
 *
 * Checks for common configuration errors:
 * - Duplicate provider priorities
 * - No enabled providers
 * - Invalid budget limits
 * - Invalid alert thresholds
 *
 * Logs warnings/errors to console but does not throw.
 * This allows the app to start even with config issues.
 */
function validateConfig(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check that priorities are unique
  const priorities = Object.values(AI_CONFIG.providers).map((p) => p.priority);
  const uniquePriorities = new Set(priorities);
  if (priorities.length !== uniquePriorities.size) {
    warnings.push(
      'Duplicate provider priorities detected - may cause unpredictable fallback behavior'
    );
  }

  // Check that at least one provider is enabled
  const hasEnabled = Object.values(AI_CONFIG.providers).some((p) => p.enabled);
  if (!hasEnabled) {
    errors.push('No AI providers are enabled - AI analysis will not work');
  }

  // Check budget limits are positive
  if (AI_CONFIG.budget.dailyLimitUSD <= 0) {
    errors.push('Daily budget limit must be positive');
  }
  if (AI_CONFIG.budget.monthlyLimitUSD <= 0) {
    errors.push('Monthly budget limit must be positive');
  }

  // Check daily limit is not greater than monthly limit
  if (AI_CONFIG.budget.dailyLimitUSD * 30 > AI_CONFIG.budget.monthlyLimitUSD) {
    warnings.push(
      'Daily limit * 30 exceeds monthly limit - monthly limit may be hit early'
    );
  }

  // Check alert thresholds are valid
  const { alertThresholds } = AI_CONFIG.budget;
  if (alertThresholds.some((t) => t <= 0 || t >= 1)) {
    errors.push('Alert thresholds must be between 0 and 1 (exclusive)');
  }
  if (alertThresholds.length !== new Set(alertThresholds).size) {
    warnings.push('Duplicate alert thresholds detected');
  }

  // Check retry config is sane
  if (AI_CONFIG.retry.maxAttempts < 1) {
    errors.push('Retry maxAttempts must be at least 1');
  }
  if (AI_CONFIG.retry.initialDelayMs < 0) {
    errors.push('Retry initialDelayMs must be non-negative');
  }
  if (AI_CONFIG.retry.maxDelayMs < AI_CONFIG.retry.initialDelayMs) {
    errors.push('Retry maxDelayMs must be >= initialDelayMs');
  }

  // Check circuit breaker config is sane
  if (AI_CONFIG.circuitBreaker.failureThreshold < 1) {
    errors.push('Circuit breaker failureThreshold must be at least 1');
  }
  if (AI_CONFIG.circuitBreaker.successThreshold < 1) {
    errors.push('Circuit breaker successThreshold must be at least 1');
  }
  if (AI_CONFIG.circuitBreaker.timeout < 1000) {
    warnings.push(
      'Circuit breaker timeout is very low (<1s) - may cause false failures'
    );
  }

  // Check cache TTLs are positive
  const { differential } = AI_CONFIG.caching;
  if (
    differential.highTrust <= 0 ||
    differential.mediumTrust <= 0 ||
    differential.lowTrust <= 0 ||
    differential.knownBad <= 0
  ) {
    errors.push('Cache TTLs must be positive');
  }

  // Log results
  if (errors.length > 0) {
    console.error('❌ AI_CONFIG validation errors:');
    errors.forEach((err) => console.error(`  - ${err}`));
  }

  if (warnings.length > 0) {
    console.warn('⚠️  AI_CONFIG validation warnings:');
    warnings.forEach((warn) => console.warn(`  - ${warn}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ AI_CONFIG validation passed');
  }
}

// Run validation on module load
validateConfig();
