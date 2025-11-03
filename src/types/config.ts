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
 * Type definitions for application configuration
 */

/**
 * Application configuration settings
 */
export interface AppConfig {
  /** Subreddit name (without r/ prefix) */
  subredditName: string;

  /** Enable audit logging of all actions */
  enableAuditLogging: boolean;

  /** Enable verbose logging for debugging */
  enableDebugLogging: boolean;

  /** Minimum confidence threshold for AI decisions (0-100) */
  aiConfidenceThreshold: number;

  /** Enable AI analysis (if false, only use rule-based moderation) */
  enableAI: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfig = {
  subredditName: 'AiAutomod',
  enableAuditLogging: true,
  enableDebugLogging: true,
  aiConfidenceThreshold: 70,
  enableAI: false, // Disabled by default until Phase 3
};

/**
 * Environment-specific settings (not stored in Redis)
 */
export interface EnvConfig {
  /** OpenAI API key */
  openaiApiKey?: string;

  /** Google Gemini API key */
  geminiApiKey?: string;
}

/**
 * AI Provider Configuration from Settings
 * Contains API keys and provider selection configured via Devvit Settings UI
 *
 * Reddit Policy: https://developers.reddit.com/docs/devvit_rules#only-use-approved-llms
 * Only OpenAI and Gemini providers are approved.
 */
export interface AIProviderConfig {
  /** OpenAI API key (optional - from settings) */
  openaiApiKey?: string;
  /** Google Gemini API key (optional - from settings) */
  geminiApiKey?: string;
  /** Primary AI provider to use */
  primaryProvider: 'openai' | 'gemini';
  /** Fallback provider if primary fails */
  fallbackProvider: 'openai' | 'gemini' | 'none';

  /**
   * DEPRECATED - Not approved by Reddit Devvit policy (as of 2025-11-03)
   * Preserved for potential future restoration if policy changes
   *
   * claudeApiKey?: string;
   * openaiCompatibleApiKey?: string;
   * openaiCompatibleBaseURL?: string;
   * openaiCompatibleModel?: string;
   * primaryProvider: 'claude' | 'openai' | 'openai-compatible' | 'gemini';
   * fallbackProvider: 'claude' | 'openai' | 'openai-compatible' | 'gemini' | 'none';
   */
}

/**
 * Budget Configuration from Settings
 * Controls daily/monthly spending limits and alert thresholds
 */
export interface BudgetConfig {
  /** Daily spending limit in USD */
  dailyLimitUSD: number;
  /** Monthly spending limit in USD */
  monthlyLimitUSD: number;
  /** Alert threshold configuration */
  alertThresholds: {
    /** Alert at 50% of daily budget */
    threshold50: boolean;
    /** Alert at 75% of daily budget */
    threshold75: boolean;
    /** Alert at 90% of daily budget */
    threshold90: boolean;
  };
}

/**
 * Dry Run Configuration from Settings
 * Controls whether the bot actually takes actions or just logs them
 */
export interface DryRunConfig {
  /** Whether dry-run mode is enabled (no actual moderation actions) */
  dryRunMode: boolean;
  /** Whether to log detailed information during dry-run */
  dryRunLogDetails: boolean;
}
