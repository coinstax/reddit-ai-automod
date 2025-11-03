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
 * Prompt Manager - AI Analysis Prompt Templates and Versioning
 *
 * This module provides prompt templates for AI content analysis and implements
 * A/B testing through prompt versioning. It includes:
 * - Main analysis prompt template with variable injection
 * - Prompt versioning system for A/B testing
 * - Consistent user-to-version assignment via hashing
 * - Content sanitization integration for PII removal
 * - Redis-based metrics tracking
 *
 * The PromptManager uses a singleton pattern and integrates with:
 * - ContentSanitizer for PII removal before AI processing
 * - Redis for storing prompt usage metrics
 * - Trust score system for appropriate moderation decisions
 *
 * @module ai/prompts
 *
 * @example
 * ```typescript
 * import { promptManager } from './prompts.js';
 *
 * // Select prompt version for a user (consistent across requests)
 * const version = promptManager.selectPromptVersion('user123');
 * console.log(version.version); // 'v1.0' or 'v1.1-dating-focus'
 *
 * // Build a complete prompt with user data
 * const prompt = await promptManager.buildPrompt({
 *   profile: userProfile,
 *   postHistory: userHistory,
 *   currentPost: {
 *     title: 'Looking for friends',
 *     body: 'Hey everyone!',
 *     subreddit: 'FriendsOver40'
 *   },
 *   subredditType: 'FriendsOver40'
 * });
 *
 * // Record usage after AI analysis
 * await promptManager.recordUsage('v1.0', 'correct', redis);
 * ```
 */

import { RedisClient } from '@devvit/public-api';
import {
  PromptVersion,
  AIQuestion,
  EnhancedAIQuestion,
  ConfidenceGuidance,
  AnalysisFramework,
  EvidenceRequired,
  NegationHandling,
} from '../types/ai.js';
import { UserProfile, UserPostHistory, PostHistoryItem } from '../types/profile.js';
import { contentSanitizer } from './sanitizer.js';
import crypto from 'crypto';

/**
 * Base analysis prompt template (v1.0)
 *
 * This is the foundational prompt used for detecting problematic behavior
 * in Reddit users. It focuses on:
 * - Dating intent detection in friendship subreddits
 * - Scammer pattern recognition
 * - Age estimation for age-restricted communities
 * - Spam detection
 *
 * Variables are injected at runtime using {variable} syntax.
 */
const ANALYSIS_PROMPT_V1 = `You are a content moderation AI analyzing a Reddit user's profile and posting history to detect problematic behavior.

USER PROFILE:
- Username: {username}
- Account age: {accountAge} days
- Total karma: {totalKarma}
- Email verified: {emailVerified}
- Is moderator: {isModerator}

POSTING HISTORY (up to 100 posts and 100 comments):
{postHistory}

CURRENT POST:
Subreddit: {subreddit}
Title: {title}
Body: {body}

SUBREDDIT CONTEXT:
This is being posted to r/{subreddit}, which is {subredditDescription}.

YOUR TASK:
Analyze this user and their current post for the following red flags:

1. DATING INTENT
   - Are they using a friendship subreddit to seek romantic/sexual relationships?
   - Look for: flirting, asking for DMs, relationship-seeking language, compliments focused on appearance
   - Confidence: 0-100 (how certain are you?)

2. SCAMMER PATTERNS
   - Common scam indicators: sob stories, financial requests, crypto mentions, external links, urgency
   - Grammar issues combined with suspicious behavior
   - Profile inconsistencies
   - Risk level: NONE / LOW / MEDIUM / HIGH
   - Confidence: 0-100

3. AGE ESTIMATION (for FriendsOver40/50 subreddits only)
   - Does their language, interests, or behavior suggest they might be underage?
   - Look for: teen slang, high school references, age-inappropriate interests
   - Only flag if confidence > 85%

4. SPAM INDICATORS
   - Repetitive posts, promotional content, external links, off-topic content
   - Confidence: 0-100

RESPOND WITH JSON:
{
  "datingIntent": {
    "detected": boolean,
    "confidence": number,
    "reasoning": "brief explanation"
  },
  "scammerRisk": {
    "level": "NONE" | "LOW" | "MEDIUM" | "HIGH",
    "confidence": number,
    "patterns": ["pattern1", "pattern2"],
    "reasoning": "brief explanation"
  },
  "ageEstimate": {
    "appearsUnderage": boolean,
    "confidence": number,
    "reasoning": "brief explanation",
    "estimatedAge": "under-18" | "18-25" | "25-40" | "40+"
  },
  "spamIndicators": {
    "detected": boolean,
    "confidence": number,
    "patterns": ["pattern1", "pattern2"]
  },
  "overallRisk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "recommendedAction": "APPROVE" | "FLAG" | "REMOVE"
}`;

/**
 * Enhanced dating-focused prompt (v1.1)
 *
 * Experimental version with enhanced dating intent detection.
 * Provides more detailed guidance for identifying subtle romantic/sexual
 * solicitation patterns that the base prompt might miss.
 */
const DATING_FOCUSED_PROMPT = `You are a content moderation AI specializing in detecting romantic/sexual intent in friendship communities.

USER PROFILE:
- Username: {username}
- Account age: {accountAge} days
- Total karma: {totalKarma}
- Email verified: {emailVerified}
- Is moderator: {isModerator}

POSTING HISTORY (up to 100 posts and 100 comments):
{postHistory}

CURRENT POST:
Subreddit: {subreddit}
Title: {title}
Body: {body}

SUBREDDIT CONTEXT:
This is being posted to r/{subreddit}, which is {subredditDescription}.

YOUR TASK:
Carefully analyze for dating/romantic intent with enhanced sensitivity:

1. DATING INTENT (ENHANCED DETECTION)
   - Direct indicators: "looking for", "seeking", "interested in", "open to", "single", "available"
   - Subtle indicators: excessive compliments, focus on physical appearance, "connection", "chemistry"
   - Behavioral patterns: asking for private communication (DMs, chat, off-platform contact)
   - Post history: repeated romantic/dating content in other subs
   - Language tone: flirtatious, suggestive, or overly personal for a friendship context
   - Age/gender focus: mentioning preference for specific demographics
   - Confidence: 0-100 (be sensitive but not overly aggressive - aim for 70+ confidence before flagging)

2. SCAMMER PATTERNS
   - Financial indicators: crypto mentions, investment opportunities, money requests
   - Urgency tactics: "limited time", "act now", "emergency"
   - External links to suspicious domains
   - Grammar/spelling issues combined with financial content
   - Profile inconsistencies (claimed location vs posting times, age mismatches)
   - Risk level: NONE / LOW / MEDIUM / HIGH
   - Confidence: 0-100

3. AGE ESTIMATION (for FriendsOver40/50 subreddits only)
   - Language patterns: slang, abbreviations, communication style
   - Interest indicators: high school, college, age-specific games/media
   - Life experience references: work history, marriage, children
   - Only flag if confidence > 85% (high bar to avoid false positives)

4. SPAM INDICATORS
   - Repetitive content across posts
   - Promotional language or commercial intent
   - Off-topic content for the subreddit
   - Confidence: 0-100

RESPOND WITH JSON:
{
  "datingIntent": {
    "detected": boolean,
    "confidence": number,
    "reasoning": "detailed explanation with specific examples",
    "indicators": ["specific phrases or patterns found"]
  },
  "scammerRisk": {
    "level": "NONE" | "LOW" | "MEDIUM" | "HIGH",
    "confidence": number,
    "patterns": ["pattern1", "pattern2"],
    "reasoning": "brief explanation"
  },
  "ageEstimate": {
    "appearsUnderage": boolean,
    "confidence": number,
    "reasoning": "brief explanation",
    "estimatedAge": "under-18" | "18-25" | "25-40" | "40+"
  },
  "spamIndicators": {
    "detected": boolean,
    "confidence": number,
    "patterns": ["pattern1", "pattern2"]
  },
  "overallRisk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "recommendedAction": "APPROVE" | "FLAG" | "REMOVE"
}`;

/**
 * Prompt version configurations for A/B testing
 *
 * Each version has:
 * - version: Unique identifier
 * - prompt: The actual prompt template
 * - enabled: Whether this version is active
 * - weight: Percentage of users assigned (0-100, must sum to 100)
 * - createdAt: Unix timestamp of creation
 * - metrics: Usage tracking (populated from Redis)
 */
const PROMPT_VERSIONS: Record<string, PromptVersion> = {
  'v1.0': {
    version: 'v1.0',
    prompt: ANALYSIS_PROMPT_V1,
    enabled: true,
    weight: 80, // 80% of users
    createdAt: Date.now(),
    metrics: {
      uses: 0,
      accuracy: undefined,
      falsePositiveRate: undefined,
    },
  },
  'v1.1-dating-focus': {
    version: 'v1.1-dating-focus',
    prompt: DATING_FOCUSED_PROMPT,
    enabled: true,
    weight: 20, // 20% of users (experimental)
    createdAt: Date.now(),
    metrics: {
      uses: 0,
      accuracy: undefined,
      falsePositiveRate: undefined,
    },
  },
};

/**
 * Subreddit descriptions for context injection
 * Provides the AI with information about what each subreddit is for
 */
const SUBREDDIT_DESCRIPTIONS: Record<string, string> = {
  FriendsOver40: 'a community for people aged 40+ to make platonic friendships',
  FriendsOver50: 'a community for people aged 50+ to make platonic friendships',
  bitcointaxes: 'a technical community for discussing cryptocurrency tax issues',
  other: 'a general community',
};

/**
 * Parameters for building a prompt
 */
export interface PromptBuildParams {
  /** User profile data */
  profile: UserProfile;
  /** User post history */
  postHistory: UserPostHistory;
  /** Current post being analyzed */
  currentPost: {
    title: string;
    body: string;
    subreddit: string;
  };
  /** Subreddit type for specialized analysis */
  subredditType: 'FriendsOver40' | 'FriendsOver50' | 'bitcointaxes' | 'other';
}

/**
 * Parameters for building a custom question-based prompt
 */
export interface QuestionPromptBuildParams {
  /** User profile data */
  profile: UserProfile;
  /** User post history */
  postHistory: UserPostHistory;
  /** Current post being analyzed */
  currentPost: {
    title: string;
    body: string;
    subreddit: string;
  };
  /** Array of custom questions to answer */
  questions: AIQuestion[];
}

/**
 * Parameters for building an enhanced question-based prompt
 * Supports both simple AIQuestion and EnhancedAIQuestion types
 */
export interface EnhancedQuestionPromptBuildParams {
  /** User profile data */
  profile: UserProfile;
  /** User post history */
  postHistory: UserPostHistory;
  /** Current post being analyzed */
  currentPost: {
    title: string;
    body: string;
    subreddit: string;
  };
  /** Array of enhanced questions to answer */
  questions: EnhancedAIQuestion[];
}

/**
 * Result of building a prompt
 */
export interface BuiltPrompt {
  /** The complete prompt ready to send to AI */
  prompt: string;
  /** Prompt version used */
  version: string;
  /** Number of PII items removed during sanitization */
  piiRemoved: number;
  /** Number of URLs removed during sanitization */
  urlsRemoved: number;
}

/**
 * Prompt metrics for a specific version
 */
export interface PromptMetrics {
  /** Prompt version identifier */
  version: string;
  /** Total number of uses */
  uses: number;
  /** Number of correct predictions (manually validated) */
  correct: number;
  /** Number of false positives (flagged incorrectly) */
  falsePositives: number;
  /** Number of false negatives (missed violations) */
  falseNegatives: number;
  /** Calculated accuracy (correct / total) */
  accuracy: number;
  /** Calculated false positive rate */
  falsePositiveRate: number;
}

/**
 * PromptManager class for managing AI analysis prompts
 *
 * Responsibilities:
 * - Select appropriate prompt version per user (A/B testing)
 * - Build complete prompts with user data and context
 * - Integrate content sanitization for PII removal
 * - Track prompt usage metrics in Redis
 * - Provide metrics for prompt performance analysis
 *
 * The manager uses consistent hashing to assign users to prompt versions,
 * ensuring the same user always gets the same version for consistency.
 */
export class PromptManager {
  /**
   * Hash a user ID to a consistent number (0-99)
   *
   * Uses SHA-256 hashing to deterministically map user IDs to a number.
   * This ensures the same user always gets the same prompt version.
   *
   * @param userId - Reddit user ID (format: t2_xxxxx)
   * @returns Hash value between 0-99
   *
   * @example
   * ```typescript
   * const hash1 = promptManager.hashUserId('t2_abc123');
   * const hash2 = promptManager.hashUserId('t2_abc123');
   * console.log(hash1 === hash2); // true - consistent
   *
   * const hash3 = promptManager.hashUserId('t2_xyz789');
   * console.log(hash1 !== hash3); // true - different users get different hashes
   * ```
   */
  private hashUserId(userId: string): number {
    // Create SHA-256 hash of userId
    const hash = crypto.createHash('sha256').update(userId).digest('hex');

    // Take first 8 characters and convert to number
    const hashNum = parseInt(hash.substring(0, 8), 16);

    // Map to 0-99 range
    return hashNum % 100;
  }

  /**
   * Select prompt version for a user based on A/B testing weights
   *
   * Uses consistent hashing to assign users to prompt versions. The same
   * user always gets the same version across requests. Version selection
   * is based on configured weights (e.g., 80% v1.0, 20% v1.1).
   *
   * Only enabled versions are considered. If all versions are disabled,
   * falls back to v1.0.
   *
   * @param userId - Reddit user ID for consistent assignment
   * @returns Selected prompt version configuration
   *
   * @example
   * ```typescript
   * // User with hash 0-79 gets v1.0 (80% weight)
   * const version1 = promptManager.selectPromptVersion('t2_user1');
   * console.log(version1.version); // 'v1.0'
   *
   * // User with hash 80-99 gets v1.1-dating-focus (20% weight)
   * const version2 = promptManager.selectPromptVersion('t2_user2');
   * console.log(version2.version); // 'v1.1-dating-focus'
   *
   * // Same user always gets same version
   * const version3 = promptManager.selectPromptVersion('t2_user1');
   * console.log(version1.version === version3.version); // true
   * ```
   */
  selectPromptVersion(userId: string): PromptVersion {
    const hash = this.hashUserId(userId); // 0-99
    let cumulative = 0;

    // Iterate through versions in order, accumulating weights
    for (const config of Object.values(PROMPT_VERSIONS)) {
      // Skip disabled versions
      if (!config.enabled) continue;

      cumulative += config.weight;

      // If hash falls within this version's range, select it
      if (hash < cumulative) {
        return config;
      }
    }

    // Fallback to v1.0 if no version matched (shouldn't happen if weights sum to 100)
    return PROMPT_VERSIONS['v1.0'];
  }

  /**
   * Build a complete prompt with user data and context
   *
   * This method:
   * 1. Selects appropriate prompt version for the user
   * 2. Sanitizes all content to remove PII
   * 3. Formats post history into readable text
   * 4. Injects all variables into the prompt template
   * 5. Returns the complete prompt ready for AI analysis
   *
   * @param params - Build parameters with user data
   * @returns Built prompt with version and sanitization metrics
   */
  async buildPrompt(params: PromptBuildParams): Promise<BuiltPrompt> {
    // Select prompt version for this user
    const version = this.selectPromptVersion(params.profile.userId);

    // Sanitize current post content
    const titleResult = contentSanitizer.sanitize(params.currentPost.title);
    const bodyResult = contentSanitizer.sanitize(params.currentPost.body);

    // Format and sanitize post history
    const postHistoryText = this.formatPostHistory(params.postHistory);
    const historyResult = contentSanitizer.sanitize(postHistoryText);

    // Get subreddit description
    const subredditDescription =
      SUBREDDIT_DESCRIPTIONS[params.subredditType] || SUBREDDIT_DESCRIPTIONS.other;

    // Build variable substitutions
    const variables: Record<string, string> = {
      username: params.profile.username,
      accountAge: params.profile.accountAgeInDays.toString(),
      totalKarma: params.profile.totalKarma.toString(),
      emailVerified: params.profile.emailVerified ? 'Yes' : 'No',
      isModerator: params.profile.isModerator ? 'Yes' : 'No',
      postHistory: historyResult.sanitizedContent,
      subreddit: params.currentPost.subreddit,
      title: titleResult.sanitizedContent,
      body: bodyResult.sanitizedContent,
      subredditDescription,
    };

    // Perform variable substitution
    let prompt = version.prompt;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    // Calculate total PII removed
    const totalPiiRemoved =
      titleResult.piiRemoved + bodyResult.piiRemoved + historyResult.piiRemoved;
    const totalUrlsRemoved =
      titleResult.urlsRemoved + bodyResult.urlsRemoved + historyResult.urlsRemoved;

    return {
      prompt,
      version: version.version,
      piiRemoved: totalPiiRemoved,
      urlsRemoved: totalUrlsRemoved,
    };
  }

  /**
   * Build prompt for custom question-based analysis
   *
   * Creates a prompt that asks the AI to answer multiple custom questions about
   * a user's profile and behavior. Supports batching multiple questions in one
   * AI call for cost efficiency.
   *
   * This method:
   * 1. Sanitizes all content to remove PII
   * 2. Formats post history into readable text
   * 3. Builds a structured prompt with all questions
   * 4. Returns prompt ready for AI analysis
   *
   * The AI response will be a JSON array of answers with:
   * - questionId: ID of the question being answered
   * - answer: 'YES' or 'NO'
   * - confidence: 0-100 score
   * - reasoning: Explanation for the answer
   *
   * @param params - Build parameters with user data and questions
   * @returns Built prompt with sanitization metrics
   *
   * @example
   * ```typescript
   * const prompt = await promptManager.buildQuestionPrompt({
   *   profile: userProfile,
   *   postHistory: userHistory,
   *   currentPost: {
   *     title: 'Looking for friends',
   *     body: 'Hey everyone!',
   *     subreddit: 'FriendsOver40'
   *   },
   *   questions: [
   *     {
   *       id: 'dating_intent',
   *       question: 'Is this user seeking romantic relationships?'
   *     },
   *     {
   *       id: 'age_appropriate',
   *       question: 'Does this user appear to be over 40 years old?'
   *     }
   *   ]
   * });
   * ```
   */
  async buildQuestionPrompt(params: QuestionPromptBuildParams): Promise<BuiltPrompt> {
    console.log('[PromptManager] Building question prompt:', {
      version: 'custom-questions',
      userId: params.profile.userId,
      questionCount: params.questions.length,
      profileData: {
        accountAge: params.profile.accountAgeInDays,
        karma: params.profile.totalKarma,
        verified: params.profile.emailVerified
      },
      historyData: {
        posts: params.postHistory.totalPosts,
        comments: params.postHistory.totalComments,
        itemsIncluded: params.postHistory.items.length
      }
    });

    // Sanitize current post content
    const titleResult = contentSanitizer.sanitize(params.currentPost.title);
    const bodyResult = contentSanitizer.sanitize(params.currentPost.body);

    // Format and sanitize post history
    const postHistoryText = this.formatPostHistory(params.postHistory);
    const historyResult = contentSanitizer.sanitize(postHistoryText);

    // Log the sanitized content lengths
    const sanitizedTitle = titleResult.sanitizedContent;
    const sanitizedBody = bodyResult.sanitizedContent;
    console.log('[PromptManager] Content sanitization:', {
      titleOriginal: params.currentPost.title.length,
      titleSanitized: sanitizedTitle.length,
      bodyOriginal: params.currentPost.body.length,
      bodySanitized: sanitizedBody.length,
      reductionPercent: params.currentPost.body.length > 0
        ? ((1 - sanitizedBody.length / params.currentPost.body.length) * 100).toFixed(1)
        : '0.0'
    });

    // Build user context section
    const userContext = `USER PROFILE:
- Username: ${params.profile.username}
- Account age: ${params.profile.accountAgeInDays} days
- Total karma: ${params.profile.totalKarma}
- Email verified: ${params.profile.emailVerified ? 'Yes' : 'No'}
- Is moderator: ${params.profile.isModerator ? 'Yes' : 'No'}

POSTING HISTORY (most recent posts/comments - up to 200 items):
${historyResult.sanitizedContent}

CURRENT POST:
Subreddit: ${params.currentPost.subreddit}
Title: ${titleResult.sanitizedContent}
Body: ${bodyResult.sanitizedContent}`;

    // Build questions section
    const questionsSection = params.questions
      .map((q, index) => {
        const contextLine = q.context ? `\n   Context: ${q.context}` : '';
        return `${index + 1}. Question ID: ${q.id}
   Question: ${q.question}${contextLine}`;
      })
      .join('\n\n');

    // Build example response format
    const exampleAnswers = params.questions
      .map(
        (q) => `    {
      "questionId": "${q.id}",
      "answer": "YES" or "NO",
      "confidence": 0-100,
      "reasoning": "brief explanation"
    }`
      )
      .join(',\n');

    // Build complete prompt
    const prompt = `You are a content moderation AI analyzing a Reddit user's profile and posting history to answer specific questions about their behavior.

${userContext}

YOUR TASK:
Answer the following questions about this user based on their profile, posting history, and current post. For each question:
- Provide a binary answer: YES or NO (answer YES if the evidence points toward yes, even if not 100% certain)
- Include a confidence score from 0-100 (how certain are you?)
- Provide brief reasoning explaining your answer

DECISION FRAMEWORK:
- Answer YES if the available evidence suggests the answer is more likely yes than no
- Answer NO if the available evidence suggests the answer is more likely no than yes
- Use confidence score to express your certainty (50-70 = somewhat confident, 70-85 = confident, 85+ = very confident)
- Don't require absolute proof - work with the evidence available
- Location inference: Active posting in location-specific subreddits (e.g., r/SeattleWA, r/nyc) is strong evidence of residence or connection
- Behavior patterns: Consistent patterns are more reliable than isolated incidents

QUESTIONS:
${questionsSection}

RESPOND WITH JSON:
{
  "answers": [
${exampleAnswers}
  ]
}

Important:
- Answer ALL questions in the array
- Each answer must have: questionId, answer (YES/NO), confidence (0-100), and reasoning
- Your answer (YES/NO) should reflect the preponderance of evidence - which direction does the evidence point?
- Your confidence score should reflect how strong that evidence is
- Be specific in your reasoning - cite what evidence led to your answer`;

    // Calculate total PII removed
    const totalPiiRemoved =
      titleResult.piiRemoved + bodyResult.piiRemoved + historyResult.piiRemoved;
    const totalUrlsRemoved =
      titleResult.urlsRemoved + bodyResult.urlsRemoved + historyResult.urlsRemoved;

    return {
      prompt,
      version: 'custom-questions', // Special version identifier for question-based prompts
      piiRemoved: totalPiiRemoved,
      urlsRemoved: totalUrlsRemoved,
    };
  }

  /**
   * Format post history into readable text for the prompt
   *
   * Combines posts and comments into a chronological list with metadata.
   * Limits to most recent 200 items (100 posts + 100 comments).
   *
   * @param postHistory - User's post and comment history
   * @returns Formatted text representation
   */
  private formatPostHistory(postHistory: UserPostHistory): string {
    // Take only the most recent 200 items (100 posts + 100 comments, already sorted by fetcher)
    const recentItems = postHistory.items.slice(0, 200);

    if (recentItems.length === 0) {
      return '(No post history available)';
    }

    // Format into text
    const formatted = recentItems.map((item: PostHistoryItem) => {
      const type = item.type.toUpperCase();
      return `[${type} in r/${item.subreddit}] ${item.content}`;
    });

    return formatted.join('\n\n');
  }

  /**
   * Record prompt usage and outcome for metrics tracking
   *
   * Stores metrics in Redis for later analysis. Tracks:
   * - Total uses of this version
   * - Correct predictions (true positives/negatives)
   * - False positives (flagged incorrectly)
   * - False negatives (missed violations)
   *
   * These metrics are manually validated by moderators and fed back
   * to measure prompt effectiveness.
   *
   * @param version - Prompt version identifier
   * @param outcome - Analysis outcome category
   * @param redis - Redis client for storage
   *
   * @example
   * ```typescript
   * // After AI analysis and moderator validation
   * await promptManager.recordUsage('v1.0', 'correct', redis);
   *
   * // If moderator finds false positive
   * await promptManager.recordUsage('v1.1-dating-focus', 'false_positive', redis);
   *
   * // If moderator finds missed violation
   * await promptManager.recordUsage('v1.0', 'false_negative', redis);
   * ```
   */
  async recordUsage(
    version: string,
    outcome: 'correct' | 'false_positive' | 'false_negative',
    redis: RedisClient
  ): Promise<void> {
    const metricsKey = `prompt:${version}:metrics`;

    // Increment total uses
    await redis.hIncrBy(metricsKey, 'uses', 1);

    // Increment specific outcome counter
    await redis.hIncrBy(metricsKey, outcome, 1);
  }

  /**
   * Get metrics for a specific prompt version
   *
   * Retrieves usage statistics from Redis and calculates derived metrics
   * like accuracy and false positive rate.
   *
   * @param version - Prompt version identifier
   * @param redis - Redis client for retrieval
   * @returns Metrics for the version, or null if no data exists
   */
  async getMetrics(version: string, redis: RedisClient): Promise<PromptMetrics | null> {
    const metricsKey = `prompt:${version}:metrics`;

    // Get all metrics for this version
    const data = await redis.hGetAll(metricsKey);

    // Return null if no data exists
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Parse metrics
    const uses = parseInt(data.uses || '0', 10);
    const correct = parseInt(data.correct || '0', 10);
    const falsePositives = parseInt(data.false_positive || '0', 10);
    const falseNegatives = parseInt(data.false_negative || '0', 10);

    // Calculate derived metrics
    const total = correct + falsePositives + falseNegatives;
    const accuracy = total > 0 ? correct / total : 0;
    const falsePositiveRate = total > 0 ? falsePositives / total : 0;

    return {
      version,
      uses,
      correct,
      falsePositives,
      falseNegatives,
      accuracy,
      falsePositiveRate,
    };
  }

  /**
   * Build confidence calibration section for enhanced prompts
   *
   * Creates a structured section that teaches the AI what different
   * confidence levels mean for a specific question. This is critical
   * for reducing false positives by helping the AI calibrate its scores.
   *
   * @param guidance - Confidence guidance configuration
   * @returns Formatted confidence calibration section
   *
   * @example
   * ```typescript
   * const section = promptManager.buildConfidenceCalibration({
   *   lowConfidence: "Discussing dating as a topic, not seeking dates",
   *   mediumConfidence: "Ambiguous language that could indicate interest",
   *   highConfidence: "Explicit solicitation with location and contact info"
   * });
   * // Returns:
   * // CONFIDENCE CALIBRATION:
   * //
   * // HIGH CONFIDENCE (70-100%): Explicit solicitation with location and contact info
   * // MEDIUM CONFIDENCE (30-69%): Ambiguous language that could indicate interest
   * // LOW CONFIDENCE (0-29%): Discussing dating as a topic, not seeking dates
   * ```
   */
  private buildConfidenceCalibration(guidance: ConfidenceGuidance): string {
    let content = 'CONFIDENCE CALIBRATION:\n\n';

    if (guidance.highConfidence) {
      content += `HIGH CONFIDENCE (70-100%): ${guidance.highConfidence}\n`;
    }

    if (guidance.mediumConfidence) {
      content += `MEDIUM CONFIDENCE (30-69%): ${guidance.mediumConfidence}\n`;
    }

    if (guidance.lowConfidence) {
      content += `LOW CONFIDENCE (0-29%): ${guidance.lowConfidence}\n`;
    }

    return content.trim();
  }

  /**
   * Build analysis framework section for enhanced prompts
   *
   * Creates a structured section that guides the AI on how to categorize
   * and weigh different types of evidence. This helps the AI understand
   * what constitutes strong vs weak evidence.
   *
   * @param framework - Analysis framework configuration
   * @returns Formatted analysis framework section
   *
   * @example
   * ```typescript
   * const section = promptManager.buildAnalysisFramework({
   *   evidenceTypes: ["DIRECT", "IMPLIED", "DISCUSSION"],
   *   falsePositiveFilters: ["quoting rules", "telling stories"]
   * });
   * ```
   */
  private buildAnalysisFramework(framework: AnalysisFramework): string {
    let content = 'ANALYSIS FRAMEWORK:\n\n';

    if (framework.evidenceTypes && framework.evidenceTypes.length > 0) {
      content += 'Categorize each piece of evidence as:\n';
      framework.evidenceTypes.forEach((type) => {
        content += `- ${type}\n`;
      });
      content += '\n';
    }

    if (framework.contextualFactors && framework.contextualFactors.length > 0) {
      content += 'Consider these contextual factors:\n';
      framework.contextualFactors.forEach((factor) => {
        content += `- ${factor}\n`;
      });
      content += '\n';
    }

    return content.trim();
  }

  /**
   * Build false positive filters section for enhanced prompts
   *
   * Creates a section that teaches the AI about common false positive
   * patterns to avoid. This is one of the most important sections for
   * reducing false positives.
   *
   * @param filters - Array of false positive patterns
   * @returns Formatted false positive filters section
   *
   * @example
   * ```typescript
   * const section = promptManager.buildFalsePositiveFilters([
   *   "quoting or referencing rules",
   *   "telling stories about past experiences",
   *   "giving advice to others"
   * ]);
   * ```
   */
  private buildFalsePositiveFilters(filters: string[]): string {
    let content = 'FALSE POSITIVE FILTERS:\n\n';
    content += 'Before flagging content, check for these common false positive patterns:\n';

    filters.forEach((filter, index) => {
      content += `${index + 1}. ${filter}\n`;
    });

    content +=
      '\nIf ANY of these patterns are present, significantly reduce confidence or answer NO.\n';

    return content.trim();
  }

  /**
   * Build negation detection section for enhanced prompts
   *
   * Creates a section that teaches the AI to detect "NOT doing X" statements.
   * Negation detection is critical for reducing false positives in cases where
   * users explicitly state they are NOT doing something.
   *
   * @param config - Negation handling configuration
   * @returns Formatted negation detection section
   *
   * @example
   * ```typescript
   * const section = promptManager.buildNegationDetection({
   *   enabled: true,
   *   patterns: ["not looking for {action}", "don't want {action}"]
   * });
   * ```
   */
  private buildNegationDetection(config: NegationHandling): string {
    let content = 'NEGATION DETECTION:\n\n';
    content += 'Check carefully for negated statements (e.g., "NOT looking for dates").\n';
    content += 'Negation typically reverses the answer from YES to NO.\n\n';

    if (config.patterns && config.patterns.length > 0) {
      content += 'Pay special attention to these negation patterns:\n';
      config.patterns.forEach((pattern) => {
        content += `- ${pattern}\n`;
      });
    }

    return content.trim();
  }

  /**
   * Build evidence requirements section for enhanced prompts
   *
   * Creates a section that enforces minimum evidence standards before
   * flagging content. This prevents the AI from flagging based on weak
   * or insufficient evidence.
   *
   * @param requirements - Evidence requirements configuration
   * @returns Formatted evidence requirements section
   *
   * @example
   * ```typescript
   * const section = promptManager.buildEvidenceRequirements({
   *   minPieces: 2,
   *   types: ["DIRECT", "IMPLIED"],
   *   includeQuotes: true
   * });
   * ```
   */
  private buildEvidenceRequirements(requirements: EvidenceRequired): string {
    let content = 'EVIDENCE REQUIREMENTS:\n\n';

    if (requirements.minPieces) {
      content += `You must find at least ${requirements.minPieces} pieces of evidence before answering YES.\n`;
    }

    if (requirements.types && requirements.types.length > 0) {
      content += `Required evidence types: ${requirements.types.join(', ')}\n`;
    }

    if (requirements.includeQuotes) {
      content += 'Include exact quotes from the content in your reasoning.\n';
    }

    if (requirements.includePermalinks) {
      content += 'Reference specific posts/comments that contain evidence.\n';
    }

    return content.trim();
  }

  /**
   * Build few-shot examples section for enhanced prompts
   *
   * Creates a section with example scenarios and correct answers to help
   * the AI learn what to look for and what to ignore. This is especially
   * useful for complex detection scenarios.
   *
   * @param examples - Array of few-shot examples
   * @returns Formatted few-shot examples section
   *
   * @example
   * ```typescript
   * const section = promptManager.buildFewShotExamples([
   *   {
   *     scenario: "User posts 'Why is dating banned here?'",
   *     expectedAnswer: "NO",
   *     confidence: 10,
   *     reasoning: "User is discussing the dating ban, not seeking dates"
   *   }
   * ]);
   * ```
   */
  private buildFewShotExamples(
    examples: Array<{
      scenario: string;
      expectedAnswer: 'YES' | 'NO';
      confidence: number;
      reasoning: string;
    }>
  ): string {
    let content = 'EXAMPLES OF CORRECT ANALYSIS:\n\n';

    examples.forEach((example, index) => {
      content += `Example ${index + 1}: ${example.scenario}\n`;
      content += `Expected Answer: ${example.expectedAnswer}\n`;
      content += `Expected Confidence: ${example.confidence}%\n`;
      content += `Reasoning: ${example.reasoning}\n\n`;
    });

    return content.trim();
  }

  /**
   * Build prompt for enhanced question-based analysis
   *
   * Creates a structured prompt for EnhancedAIQuestion objects with optional
   * confidence calibration, analysis frameworks, false positive filters, and
   * other advanced features designed to reduce false positives.
   *
   * This method builds prompts with the following sections (when configured):
   * 1. Role definition
   * 2. User context (profile, history, current post)
   * 3. Decision framework
   * 4. Analysis framework (if provided)
   * 5. False positive filters (if provided)
   * 6. Negation detection (if enabled)
   * 7. Confidence calibration (if provided) - KEY FEATURE
   * 8. Evidence requirements (if provided)
   * 9. Questions section
   * 10. Output format
   * 11. Few-shot examples (if provided)
   *
   * **Backward Compatibility**: If simple AIQuestion objects are provided
   * (without enhanced fields), the prompt will be built similarly to the
   * standard buildQuestionPrompt method.
   *
   * @param params - Build parameters with user data and enhanced questions
   * @returns Built prompt with sanitization metrics
   *
   * @example
   * ```typescript
   * const prompt = await promptManager.buildEnhancedQuestionPrompt({
   *   profile: userProfile,
   *   postHistory: userHistory,
   *   currentPost: {
   *     title: 'Looking for friends',
   *     body: 'Hey everyone!',
   *     subreddit: 'FriendsOver40'
   *   },
   *   questions: [
   *     {
   *       id: 'dating_intent',
   *       question: 'Is this user seeking romantic relationships?',
   *       confidenceGuidance: {
   *         lowConfidence: "Discussing dating as a topic, not seeking dates",
   *         mediumConfidence: "Ambiguous language that could indicate interest",
   *         highConfidence: "Explicit solicitation with location and contact info"
   *       },
   *       analysisFramework: {
   *         evidenceTypes: ["DIRECT", "IMPLIED", "DISCUSSION", "NEGATED"],
   *         falsePositiveFilters: [
   *           "quoting or referencing rules",
   *           "telling stories about past experiences"
   *         ]
   *       }
   *     }
   *   ]
   * });
   * ```
   */
  async buildEnhancedQuestionPrompt(
    params: EnhancedQuestionPromptBuildParams
  ): Promise<BuiltPrompt> {
    console.log('[PromptManager] Building enhanced question prompt:', {
      version: 'enhanced-questions',
      userId: params.profile.userId,
      questionCount: params.questions.length,
      profileData: {
        accountAge: params.profile.accountAgeInDays,
        karma: params.profile.totalKarma,
        verified: params.profile.emailVerified,
      },
      historyData: {
        posts: params.postHistory.totalPosts,
        comments: params.postHistory.totalComments,
        itemsIncluded: params.postHistory.items.length,
      },
    });

    // Sanitize current post content
    const titleResult = contentSanitizer.sanitize(params.currentPost.title);
    const bodyResult = contentSanitizer.sanitize(params.currentPost.body);

    // Format and sanitize post history
    const postHistoryText = this.formatPostHistory(params.postHistory);
    const historyResult = contentSanitizer.sanitize(postHistoryText);

    // Log the sanitized content lengths
    const sanitizedTitle = titleResult.sanitizedContent;
    const sanitizedBody = bodyResult.sanitizedContent;
    console.log('[PromptManager] Content sanitization:', {
      titleOriginal: params.currentPost.title.length,
      titleSanitized: sanitizedTitle.length,
      bodyOriginal: params.currentPost.body.length,
      bodySanitized: sanitizedBody.length,
      reductionPercent:
        params.currentPost.body.length > 0
          ? ((1 - sanitizedBody.length / params.currentPost.body.length) * 100).toFixed(1)
          : '0.0',
    });

    // Build sections array
    const sections: string[] = [];

    // 1. Role definition
    sections.push(
      'You are a high-precision content classifier with expertise in natural language understanding and intent detection. Your goal is to provide accurate, well-reasoned analysis while minimizing false positives.'
    );

    // 2. User context section
    const userContext = `USER PROFILE:
- Username: ${params.profile.username}
- Account age: ${params.profile.accountAgeInDays} days
- Total karma: ${params.profile.totalKarma}
- Email verified: ${params.profile.emailVerified ? 'Yes' : 'No'}
- Is moderator: ${params.profile.isModerator ? 'Yes' : 'No'}

POSTING HISTORY (most recent posts/comments - up to 200 items):
${historyResult.sanitizedContent}

CURRENT POST:
Subreddit: ${params.currentPost.subreddit}
Title: ${titleResult.sanitizedContent}
Body: ${bodyResult.sanitizedContent}`;

    sections.push(userContext);

    // 3. Decision framework
    const decisionFramework = `DECISION FRAMEWORK:

Answer YES if the available evidence suggests the answer is more likely YES than NO.
Answer NO if the available evidence suggests the answer is more likely NO than YES.

Your answer (YES/NO) represents the direction of the evidence.
Your confidence (0-100) represents the strength of that evidence.

Example:
- Finding weak evidence suggesting YES → Answer: YES, Confidence: 45%
- Finding strong evidence suggesting YES → Answer: YES, Confidence: 85%
- Finding weak evidence suggesting NO → Answer: NO, Confidence: 30%`;

    sections.push(decisionFramework);

    // 4-8. Add optional enhanced sections for each question
    // We'll collect these per-question and add them before the questions section
    const perQuestionSections: string[] = [];

    params.questions.forEach((question, index) => {
      const questionSections: string[] = [];

      questionSections.push(`\n--- QUESTION ${index + 1}: ${question.id} ---`);

      // Analysis framework (if provided)
      if (question.analysisFramework) {
        questionSections.push(this.buildAnalysisFramework(question.analysisFramework));
      }

      // False positive filters (if provided)
      if (
        question.analysisFramework?.falsePositiveFilters &&
        question.analysisFramework.falsePositiveFilters.length > 0
      ) {
        questionSections.push(
          this.buildFalsePositiveFilters(question.analysisFramework.falsePositiveFilters)
        );
      }

      // Negation detection (if enabled)
      if (question.negationHandling?.enabled) {
        questionSections.push(this.buildNegationDetection(question.negationHandling));
      }

      // Confidence calibration (if provided) - KEY FEATURE
      if (question.confidenceGuidance) {
        questionSections.push(this.buildConfidenceCalibration(question.confidenceGuidance));
      }

      // Evidence requirements (if provided)
      if (question.evidenceRequired) {
        questionSections.push(this.buildEvidenceRequirements(question.evidenceRequired));
      }

      // Few-shot examples (if provided)
      if (question.examples && question.examples.length > 0) {
        questionSections.push(this.buildFewShotExamples(question.examples));
      }

      perQuestionSections.push(questionSections.join('\n\n'));
    });

    // Add all per-question sections
    if (perQuestionSections.length > 0) {
      sections.push(perQuestionSections.join('\n\n'));
    }

    // 9. Questions section
    const questionsSection = params.questions
      .map((q, index) => {
        const contextLine = q.context ? `\n   Context: ${q.context}` : '';
        return `${index + 1}. Question ID: ${q.id}
   Question: ${q.question}${contextLine}`;
      })
      .join('\n\n');

    sections.push(`YOUR TASK:
Answer the following questions about this user based on their profile, posting history, and current post. For each question:
- Provide a binary answer: YES or NO (answer YES if the evidence points toward yes, even if not 100% certain)
- Include a confidence score from 0-100 (how certain are you?)
- Provide brief reasoning explaining your answer

QUESTIONS:
${questionsSection}`);

    // 10. Output format
    const exampleAnswers = params.questions
      .map(
        (q) => `    {
      "questionId": "${q.id}",
      "answer": "YES" or "NO",
      "confidence": 0-100,
      "reasoning": "brief explanation"
    }`
      )
      .join(',\n');

    const outputFormat = `RESPOND WITH JSON:
{
  "answers": [
${exampleAnswers}
  ]
}

Important:
- Answer ALL questions in the array
- Each answer must have: questionId, answer (YES/NO), confidence (0-100), and reasoning
- Your answer (YES/NO) should reflect the preponderance of evidence - which direction does the evidence point?
- Your confidence score should reflect how strong that evidence is
- Be specific in your reasoning - cite what evidence led to your answer`;

    sections.push(outputFormat);

    // Build complete prompt
    const prompt = sections.join('\n\n');

    // Calculate total PII removed
    const totalPiiRemoved =
      titleResult.piiRemoved + bodyResult.piiRemoved + historyResult.piiRemoved;
    const totalUrlsRemoved =
      titleResult.urlsRemoved + bodyResult.urlsRemoved + historyResult.urlsRemoved;

    return {
      prompt,
      version: 'enhanced-questions', // Special version identifier for enhanced question-based prompts
      piiRemoved: totalPiiRemoved,
      urlsRemoved: totalUrlsRemoved,
    };
  }

  /**
   * Get all prompt versions with their current metrics
   *
   * Useful for comparing prompt performance across versions.
   *
   * @param redis - Redis client for retrieval
   * @returns Array of all prompt versions with metrics
   */
  async getAllMetrics(redis: RedisClient): Promise<PromptMetrics[]> {
    const results: PromptMetrics[] = [];

    for (const versionId of Object.keys(PROMPT_VERSIONS)) {
      const metrics = await this.getMetrics(versionId, redis);
      if (metrics) {
        results.push(metrics);
      }
    }

    return results;
  }
}

/**
 * Singleton instance for easy reuse throughout the application
 *
 * @example
 * ```typescript
 * import { promptManager } from './prompts.js';
 *
 * // Select version
 * const version = promptManager.selectPromptVersion('t2_abc123');
 *
 * // Build prompt
 * const builtPrompt = await promptManager.buildPrompt({...});
 *
 * // Record usage
 * await promptManager.recordUsage('v1.0', 'correct', redis);
 * ```
 */
export const promptManager = new PromptManager();
