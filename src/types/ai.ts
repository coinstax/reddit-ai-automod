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
 * Type definitions for AI analysis system
 *
 * This module defines all interfaces and types used in the AI provider system
 * for analyzing user profiles, detecting problematic behavior, managing costs,
 * and coordinating multiple AI providers (Claude, OpenAI, DeepSeek).
 *
 * @module types/ai
 */

import { UserProfile, UserPostHistory } from './profile.js';

/**
 * Supported AI provider types (Reddit Devvit Approved Only)
 *
 * Reddit Policy: https://developers.reddit.com/docs/devvit_rules#only-use-approved-llms
 * Only OpenAI and Gemini are approved for use in Devvit apps.
 *
 * - openai: OpenAI GPT-4o Mini
 * - gemini: Google Gemini 1.5 Flash
 */
export type AIProviderType = 'openai' | 'gemini';

/**
 * DEPRECATED - Not approved by Reddit Devvit policy (as of 2025-11-03)
 * Preserved for potential future restoration if policy changes
 *
 * - claude: Anthropic Claude 3.5 Haiku
 * - openai-compatible: Custom OpenAI-compatible endpoints (Groq, Together AI, vLLM, Ollama, etc.)
 *
 * export type AIProviderType = 'claude' | 'openai' | 'openai-compatible' | 'gemini';
 */

/**
 * Classification of AI errors for specific handling strategies
 * Each error type has different retry and fallback behavior
 */
export enum AIErrorType {
  /** API rate limit exceeded - retry with backoff */
  RATE_LIMIT = 'RATE_LIMIT',
  /** AI returned malformed or incomplete response - retry or fallback */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** Request timed out - retry with longer timeout */
  TIMEOUT = 'TIMEOUT',
  /** Daily/monthly budget limit reached - do not retry */
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  /** Provider-specific error (5xx, network) - try next provider */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Response failed schema validation - retry or fallback */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Circuit breaker is open - try next provider immediately */
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
}

/**
 * System degradation levels for graceful handling of AI failures
 * Allows the system to continue operating with reduced AI features
 */
export enum DegradationLevel {
  /** All AI features enabled - normal operation */
  FULL = 'FULL',
  /** Skip expensive checks - use faster models or simpler prompts */
  REDUCED = 'REDUCED',
  /** Trust scores only - minimal AI analysis */
  MINIMAL = 'MINIMAL',
  /** Manual review only - no AI calls at all */
  EMERGENCY = 'EMERGENCY',
}

/**
 * Configuration for a single AI provider
 * Defines model, priority, and enable/disable status
 * Note: API keys are stored separately in Devvit Settings (added at runtime)
 */
export interface AIProviderConfig {
  /** Provider type identifier */
  type: AIProviderType;
  /** Model name/ID to use for this provider */
  model: string;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Provider priority (1 = primary, 2 = fallback, etc.) */
  priority: number;
  /** Cost per million input tokens in USD */
  costPerMTokenInput: number;
  /** Cost per million output tokens in USD */
  costPerMTokenOutput: number;
  /** API key (optional - added at runtime from settings) */
  apiKey?: string;
}

/**
 * Circuit breaker state for a single AI provider
 * Implements the Circuit Breaker pattern to prevent cascading failures
 */
export interface CircuitBreakerState {
  /** Provider this circuit breaker protects */
  provider: AIProviderType;
  /** Current circuit state */
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  /** Number of consecutive failures */
  failureCount: number;
  /** Timestamp of last failure (milliseconds since epoch) */
  lastFailureTime: number;
  /** Timestamp when circuit can transition to HALF_OPEN (optional) */
  openUntil?: number;
  /** Number of consecutive successes in HALF_OPEN state */
  successCount: number;
}

/**
 * Context for tracking a single AI analysis request
 * Used for logging, monitoring, and debugging
 */
export interface AIAnalysisContext {
  /** Unique ID for tracking this request across components */
  correlationId: string;
  /** Reddit user ID being analyzed */
  userId: string;
  /** Subreddit where analysis was triggered */
  subreddit: string;
  /** AI provider being used for this request */
  provider: AIProviderType;
  /** Retry attempt number (1 = first attempt) */
  attempt: number;
  /** Timestamp when request started (milliseconds since epoch) */
  startTime: number;
}

/**
 * Input data for AI analysis request
 * Contains all information needed for the AI to analyze a user
 */
export interface AIAnalysisRequest {
  /** Reddit user ID (format: t2_xxxxx) */
  userId: string;
  /** Reddit username */
  username: string;
  /** User profile data from Phase 1 profiling system */
  profile: UserProfile;
  /** User post history from Phase 1 profiling system */
  postHistory: UserPostHistory;
  /** Current post that triggered the analysis */
  currentPost: {
    /** Post title */
    title: string;
    /** Post body text */
    body: string;
    /** Subreddit where post was submitted */
    subreddit: string;
  };
  /** Additional context for the analysis */
  context: {
    /** Name of the subreddit */
    subredditName: string;
    /** Type of subreddit for specialized analysis */
    subredditType: 'FriendsOver40' | 'FriendsOver50' | 'bitcointaxes' | 'other';
    /** Correlation ID for tracking this request */
    correlationId: string;
    /** Prompt version identifier for A/B testing */
    promptVersion: string;
  };
}

/**
 * Structured output from AI analysis
 * Contains detection results, confidence scores, and metadata
 */
export interface AIAnalysisResult {
  /** User ID that was analyzed */
  userId: string;
  /** Timestamp of analysis (milliseconds since epoch) */
  timestamp: number;
  /** AI provider that performed the analysis */
  provider: AIProviderType;
  /** AI model used for this analysis */
  model: string;
  /** Correlation ID for tracking */
  correlationId: string;
  /** Prompt version used for this analysis */
  promptVersion: string;
  /** Cache TTL for this result (seconds) - based on trust score */
  cacheTTL: number;

  /**
   * Dating intent detection
   * Identifies users seeking romantic/sexual relationships in friendship subreddits
   */
  datingIntent: {
    /** Whether dating intent was detected */
    detected: boolean;
    /** Confidence score (0-100) */
    confidence: number;
    /** Explanation of the detection */
    reasoning: string;
  };

  /**
   * Scammer risk assessment
   * Detects common scam patterns (sob stories, financial requests, crypto)
   */
  scammerRisk: {
    /** Risk level assessment */
    level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    /** Confidence score (0-100) */
    confidence: number;
    /** List of detected scam patterns */
    patterns: string[];
    /** Explanation of the assessment */
    reasoning: string;
  };

  /**
   * Age estimation (for FriendsOver40/50 subreddits)
   * Optional - only included for age-restricted subreddits
   */
  ageEstimate?: {
    /** Whether user appears to be underage */
    appearsUnderage: boolean;
    /** Confidence score (0-100) */
    confidence: number;
    /** Explanation of the estimation */
    reasoning: string;
    /** Estimated age range */
    estimatedAge?: 'under-18' | '18-25' | '25-40' | '40+';
  };

  /**
   * Spam detection
   * Identifies repetitive posts, promotional content, off-topic posts
   */
  spamIndicators: {
    /** Whether spam was detected */
    detected: boolean;
    /** Confidence score (0-100) */
    confidence: number;
    /** List of detected spam patterns */
    patterns: string[];
  };

  /**
   * Overall risk assessment combining all detection results
   */
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /**
   * AI's recommended moderation action
   * Final decision is made by the moderation logic, not AI alone
   */
  recommendedAction: 'APPROVE' | 'FLAG' | 'REMOVE';

  /**
   * API usage metadata
   */
  /** Number of tokens used by this request */
  tokensUsed: number;
  /** Cost of this request in USD */
  costUSD: number;
  /** Request latency in milliseconds */
  latencyMs: number;
}

/**
 * Record of a single AI API call for cost tracking
 * Stored in Redis for auditing and budget reporting
 */
export interface CostRecord {
  /** Unique ID for this cost record */
  id: string;
  /** Timestamp of API call (milliseconds since epoch) */
  timestamp: number;
  /** Provider used */
  provider: AIProviderType;
  /** User ID that was analyzed */
  userId: string;
  /** Number of tokens used */
  tokensUsed: number;
  /** Cost in USD */
  costUSD: number;
  /** Whether result was served from cache (true = no actual API call) */
  cached: boolean;
}

/**
 * Current budget status and spending summary
 * Returned by cost tracker to check budget availability
 */
export interface BudgetStatus {
  /** Daily budget limit in USD */
  dailyLimit: number;
  /** Amount spent today in USD */
  dailySpent: number;
  /** Amount remaining today in USD */
  dailyRemaining: number;
  /** Amount spent this month in USD */
  monthlySpent: number;
  /** Spending breakdown by provider */
  perProviderSpent: Record<AIProviderType, number>;
  /** Alert level based on percentage of budget used */
  alertLevel: 'NONE' | 'WARNING_50' | 'WARNING_75' | 'WARNING_90' | 'EXCEEDED';
}

/**
 * Prompt version for A/B testing different analysis prompts
 * Allows tracking which prompts perform best
 */
export interface PromptVersion {
  /** Version identifier (e.g., "v1.0", "v1.1-dating-focus") */
  version: string;
  /** The actual prompt text */
  prompt: string;
  /** Whether this version is currently enabled */
  enabled: boolean;
  /** Weight for A/B testing (0-100, must sum to 100 across all enabled versions) */
  weight: number;
  /** Timestamp when this version was created */
  createdAt: number;
  /** Performance metrics for this prompt version */
  metrics?: {
    /** Number of times this prompt was used */
    uses: number;
    /** Accuracy percentage (if manually validated) */
    accuracy?: number;
    /** False positive rate (if manually validated) */
    falsePositiveRate?: number;
  };
}

/**
 * In-flight request tracker for request deduplication
 * Prevents duplicate AI calls for the same user
 */
export interface InFlightRequest {
  /** User ID being analyzed */
  userId: string;
  /** Correlation ID of the request */
  correlationId: string;
  /** Timestamp when request started */
  startTime: number;
  /** Timestamp when this lock expires (auto-cleanup) */
  expiresAt: number;
}

/**
 * Configuration for differential caching based on trust scores
 * Higher trust users get longer cache TTLs
 */
export interface CacheTTLConfig {
  /** Cache TTL for high trust users (60-69 score) in seconds */
  highTrust: number;
  /** Cache TTL for medium trust users (40-59 score) in seconds */
  mediumTrust: number;
  /** Cache TTL for low trust users (<40 score) in seconds */
  lowTrust: number;
  /** Cache TTL for known bad actors in seconds */
  knownBad: number;
}

/**
 * Result of content sanitization before sending to AI
 * Tracks what PII was removed for auditing
 */
export interface SanitizationResult {
  /** Length of original content in characters */
  originalLength: number;
  /** Length of sanitized content in characters */
  sanitizedLength: number;
  /** Number of PII items removed (emails, phones, SSNs) */
  piiRemoved: number;
  /** Number of URLs removed */
  urlsRemoved: number;
  /** The sanitized content safe to send to AI */
  sanitizedContent: string;
}

/**
 * Custom error class for AI-related errors
 * Includes error type for specific handling strategies
 */
export class AIError extends Error {
  constructor(
    public type: AIErrorType,
    message: string,
    public provider?: AIProviderType,
    public correlationId?: string
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Configuration for circuit breaker behavior
 * Controls when circuits open/close and timeout values
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Wait time in ms before testing recovery (OPEN → HALF_OPEN) */
  halfOpenRetryDelay: number;
  /** Number of consecutive successes to close circuit */
  successThreshold: number;
  /** Request timeout in ms before considering it failed */
  timeout: number;
}

/**
 * Configuration for retry behavior
 * Used by provider clients for exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in ms before first retry */
  initialDelayMs: number;
  /** Maximum delay in ms between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (delay *= multiplier each retry) */
  backoffMultiplier: number;
}

/**
 * Complete AI system configuration
 * Combines all configuration options for the AI analysis system
 */
export interface AIConfig {
  /** Provider-specific configurations */
  providers: Record<AIProviderType, AIProviderConfig>;
  /** Budget limits and alert thresholds */
  budget: {
    /** Daily spending limit in USD */
    dailyLimitUSD: number;
    /** Monthly spending limit in USD */
    monthlyLimitUSD: number;
    /** Alert thresholds as fractions (e.g., [0.5, 0.75, 0.9]) */
    alertThresholds: number[];
  };
  /** Caching configuration */
  caching: {
    /** Default analysis cache TTL in seconds */
    analysisTTL: number;
    /** Health check cache TTL in seconds */
    healthCheckTTL: number;
    /** Differential TTL config for trust-based caching */
    differential: CacheTTLConfig;
  };
  /** Retry configuration for API calls */
  retry: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  /** System degradation level */
  degradationLevel: DegradationLevel;
}

/**
 * Health status for a single AI provider
 * Used by provider selector to choose healthy providers
 */
export interface ProviderHealthStatus {
  /** Provider identifier */
  provider: AIProviderType;
  /** Whether provider is currently healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastCheckTime: number;
  /** Circuit breaker state */
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  /** Number of recent failures */
  recentFailures: number;
  /** Average response time in ms (for healthy provider) */
  avgResponseTimeMs?: number;
}

/**
 * Spending report for budget monitoring
 * Used by cost tracker to generate reports
 */
export interface SpendingReport {
  /** Report start date (YYYY-MM-DD) */
  startDate: string;
  /** Report end date (YYYY-MM-DD) */
  endDate: string;
  /** Total spending in USD */
  totalSpent: number;
  /** Daily breakdown */
  dailySpending: Array<{
    date: string;
    totalUSD: number;
    perProvider: Record<AIProviderType, number>;
    requestCount: number;
  }>;
  /** Provider breakdown */
  providerBreakdown: Array<{
    provider: AIProviderType;
    totalUSD: number;
    requestCount: number;
    avgCostPerRequest: number;
  }>;
}

/**
 * Custom question for flexible AI analysis
 * Allows moderators to define their own detection criteria in natural language
 *
 * @example
 * ```typescript
 * const question: AIQuestion = {
 *   id: 'dating_intent_check',
 *   question: 'Is this user seeking romantic relationships in a friendship subreddit?',
 *   context: 'This is a platonic friendship community for people aged 40+.'
 * };
 * ```
 */
export interface AIQuestion {
  /**
   * Unique question identifier
   *
   * **Format Rules**:
   * - Use lowercase snake_case (e.g., "dating_intent_check")
   * - Alphanumeric characters and underscores only (no spaces, commas, or special characters)
   * - Must be unique within a question batch
   * - Max length: 50 characters recommended
   * - Valid examples: "dating_intent", "age_appropriate", "spam_check"
   * - Invalid examples: "dating-intent" (hyphen), "age, check" (comma), "Test Question" (spaces)
   *
   * @example "dating_intent"
   * @example "age_appropriate_for_sub"
   * @example "spam_content_check"
   */
  id: string;
  /** Natural language question to ask the AI (no length limit) */
  question: string;
  /** Optional additional context specific to this question */
  context?: string;
}

/**
 * AI answer to a custom question
 * Contains YES/NO answer with confidence score and reasoning
 */
export interface AIAnswer {
  /** Question ID this answer corresponds to */
  questionId: string;
  /** Binary answer: YES or NO */
  answer: 'YES' | 'NO';
  /** Confidence score (0-100) */
  confidence: number;
  /** Explanation for the answer */
  reasoning: string;
}

/**
 * Input data for custom question-based AI analysis request
 * Contains user data and array of custom questions to answer
 */
export interface AIQuestionRequest {
  /** Reddit user ID (format: t2_xxxxx) */
  userId: string;
  /** Reddit username */
  username: string;
  /** User profile data from Phase 1 profiling system */
  profile: UserProfile;
  /** User post history from Phase 1 profiling system */
  postHistory: UserPostHistory;
  /** Current post that triggered the analysis */
  currentPost: {
    /** Post title */
    title: string;
    /** Post body text */
    body: string;
    /** Subreddit where post was submitted */
    subreddit: string;
  };
  /** Array of custom questions to answer */
  questions: AIQuestion[];
  /** Additional context for the analysis */
  context: {
    /** Name of the subreddit */
    subredditName: string;
    /** Type of subreddit for specialized analysis */
    subredditType: 'FriendsOver40' | 'FriendsOver50' | 'bitcointaxes' | 'other';
    /** Correlation ID for tracking this request */
    correlationId: string;
  };
}

/**
 * Result from custom question-based AI analysis
 * Contains array of answers to all questions plus metadata
 */
export interface AIQuestionBatchResult {
  /** User ID that was analyzed */
  userId: string;
  /** Timestamp of analysis (milliseconds since epoch) */
  timestamp: number;
  /** AI provider that performed the analysis */
  provider: AIProviderType;
  /** AI model used for this analysis */
  model: string;
  /** Correlation ID for tracking */
  correlationId: string;
  /** Cache TTL for this result (seconds) - based on trust score */
  cacheTTL: number;
  /** Array of answers to all questions */
  answers: AIAnswer[];
  /** Number of tokens used by this request */
  tokensUsed: number;
  /** Cost of this request in USD */
  costUSD: number;
  /** Request latency in milliseconds */
  latencyMs: number;
}
