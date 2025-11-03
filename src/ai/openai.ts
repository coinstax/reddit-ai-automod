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
 * OpenAI Provider Implementation
 *
 * OpenAI GPT-4o Mini client for user profile analysis.
 * This is the fallback AI provider with lower cost and good quality.
 *
 * Key Features:
 * - Model: gpt-4o-mini
 * - Structured output via JSON mode
 * - Retry logic with exponential backoff (3 attempts)
 * - Token counting and cost tracking
 * - Health check with minimal token usage
 * - Cost: $0.15/MTok input, $0.60/MTok output
 *
 * @module ai/openai
 *
 * @example
 * ```typescript
 * import { OpenAIProvider } from './openai.js';
 *
 * const provider = new OpenAIProvider('sk-...');
 * const result = await provider.analyze(request);
 * console.log('Scammer risk:', result.scammerRisk.level);
 * ```
 */

import OpenAI from 'openai';
import { IAIProvider } from './provider.js';
import {
  AIAnalysisRequest,
  AIAnalysisResult,
  AIErrorType,
  AIError,
  AIProviderType,
  AIQuestionRequest,
  AIQuestionBatchResult,
} from '../types/ai.js';
import { aiResponseValidator } from './validator.js';
import { AI_CONFIG } from '../config/ai.js';
import { promptManager } from './prompts.js';
import { getCacheTTLForTrustScore } from '../config/ai.js';

/**
 * OpenAI GPT-4o Mini Provider
 *
 * Fallback AI provider for user profile analysis. Uses OpenAI's Chat Completions API
 * with JSON mode for structured output.
 */
export class OpenAIProvider implements IAIProvider {
  readonly type: AIProviderType = 'openai';
  readonly model = 'gpt-4o-mini';

  private client: OpenAI;
  private config = AI_CONFIG.providers.openai;

  /**
   * Create OpenAI provider instance
   *
   * @param apiKey - OpenAI API key from Devvit Secrets Manager
   */
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Analyze user profile using OpenAI
   *
   * Implements retry logic with exponential backoff. Validates response
   * using aiResponseValidator. Tracks token usage and cost.
   *
   * @param request - User profile and context for analysis
   * @returns Structured analysis result
   * @throws {AIError} On provider errors, validation failures, or timeouts
   */
  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    const correlationId = request.context.correlationId;

    // Build prompt using prompt manager
    const promptData = await promptManager.buildPrompt({
      profile: request.profile,
      postHistory: request.postHistory,
      currentPost: request.currentPost,
      subredditType: request.context.subredditType,
    });

    // Add JSON format instruction to prompt
    const systemPrompt = `You are a content moderation AI. Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;

    try {
      console.log('OpenAI analysis attempt', {
        correlationId,
        userId: request.userId,
      });

      // Call OpenAI API with JSON mode
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptData.prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1500,
      });

      // Extract JSON response
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          'OpenAI response is empty',
          this.type,
          correlationId
        );
      }

      // Parse JSON
      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          `Failed to parse OpenAI JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          this.type,
          correlationId
        );
      }

      // Validate response structure
      const validatedResult = aiResponseValidator.validate(parsedResponse);

      // Calculate actual token usage and cost
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const costUSD = this.calculateCost(inputTokens, outputTokens);
      const latencyMs = Date.now() - startTime;

      // Determine cache TTL based on trust score
      // TODO: Get trust score from ProfileAnalysisResult when integrated
      const trustScore = 50; // Default medium trust
      const cacheTTL = getCacheTTLForTrustScore(
        trustScore,
        validatedResult.overallRisk === 'CRITICAL'
      );

      // Return complete result
      const result: AIAnalysisResult = {
        ...validatedResult,
        userId: request.userId,
        timestamp: Date.now(),
        provider: this.type,
        correlationId,
        promptVersion: request.context.promptVersion,
        cacheTTL,
        tokensUsed: inputTokens + outputTokens,
        costUSD,
        latencyMs,
      };

      console.log('OpenAI analysis success', {
        correlationId,
        tokensUsed: result.tokensUsed,
        costUSD: result.costUSD,
        latencyMs,
      });

      return result;
    } catch (error) {
      // Classify error type
      const errorType = this.classifyError(error);

      console.error('OpenAI analysis error', {
        correlationId,
        errorType,
        message: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error to let analyzer handle fallback
      throw error;
    }
  }

  /**
   * Analyze user with custom questions
   *
   * New flexible analysis method that allows moderators to define custom
   * questions in natural language. Answers each question with YES/NO,
   * confidence score, and reasoning.
   *
   * @param request - User profile data and array of custom questions
   * @returns Batch result with answers to all questions
   * @throws {AIError} On provider errors, validation failures, or timeouts
   */
  async analyzeWithQuestions(request: AIQuestionRequest): Promise<AIQuestionBatchResult> {
    const startTime = Date.now();
    const correlationId = request.context.correlationId;

    // Build question prompt using prompt manager
    const promptData = await promptManager.buildQuestionPrompt({
      profile: request.profile,
      postHistory: request.postHistory,
      currentPost: request.currentPost,
      questions: request.questions,
    });

    // Add JSON format instruction to prompt
    const systemPrompt = `You are a content moderation AI. Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;

    try {
      // Log request details before API call
      console.log('[OpenAI] Sending question analysis request:', {
        correlationId,
        userId: request.userId,
        username: request.username,
        questionCount: request.questions.length,
        questions: request.questions.map(q => ({
          id: q.id,
          question: q.question,
          hasContext: !!q.context
        })),
        profileSummary: {
          accountAgeMonths: Math.floor(request.profile.accountAgeInDays / 30),
          totalKarma: request.profile.totalKarma,
          isVerified: request.profile.emailVerified
        },
        postHistorySummary: {
          totalPosts: request.postHistory.totalPosts,
          totalComments: request.postHistory.totalComments,
          itemsFetched: request.postHistory.items.length
        },
        currentPostSummary: {
          title: request.currentPost.title.substring(0, 100),
          bodyLength: request.currentPost.body.length,
          type: request.currentPost.body.length > 0 ? 'post' : 'title-only'
        }
      });

      // Log the actual prompt being sent (first 500 chars)
      console.log('[OpenAI] Prompt preview:', promptData.prompt.substring(0, 500) + '...');

      // Call OpenAI API with JSON mode
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptData.prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1500,
      });

      // Extract JSON response
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          'OpenAI response is empty',
          this.type,
          correlationId
        );
      }

      // Parse JSON
      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          `Failed to parse OpenAI JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          this.type,
          correlationId
        );
      }

      // Log raw response from API
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const cost = this.calculateCost(usage.prompt_tokens, usage.completion_tokens);

      console.log('[OpenAI] Received response:', {
        correlationId,
        model: this.model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        cost: cost.toFixed(4),
        finishReason: response.choices[0].finish_reason,
        responsePreview: content.substring(0, 200)
      });

      // Validate response structure
      const validatedResult = aiResponseValidator.validateQuestionBatchResponse(parsedResponse);

      // Log parsed response
      console.log('[OpenAI] Parsed response:', {
        correlationId,
        answersCount: validatedResult.answers?.length || 0,
        answers: validatedResult.answers?.map(a => ({
          questionId: a.questionId,
          answer: a.answer,
          confidence: a.confidence,
          reasoningLength: a.reasoning?.length || 0
        }))
      });

      // Calculate actual token usage and cost
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const costUSD = this.calculateCost(inputTokens, outputTokens);
      const latencyMs = Date.now() - startTime;

      // Determine cache TTL based on trust score
      // TODO: Get trust score from ProfileAnalysisResult when integrated
      const trustScore = 50; // Default medium trust
      const cacheTTL = getCacheTTLForTrustScore(trustScore, false);

      // Return complete result
      const result: AIQuestionBatchResult = {
        userId: request.userId,
        timestamp: Date.now(),
        provider: this.type,
        model: this.model,
        correlationId,
        cacheTTL,
        tokensUsed: inputTokens + outputTokens,
        costUSD,
        latencyMs,
        answers: validatedResult.answers,
      };

      console.log('OpenAI question analysis success', {
        correlationId,
        questionCount: result.answers.length,
        tokensUsed: result.tokensUsed,
        costUSD: result.costUSD,
        latencyMs,
      });

      return result;
    } catch (error) {
      // Classify error type
      const errorType = this.classifyError(error);

      console.error('OpenAI question analysis error', {
        correlationId,
        errorType,
        message: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error to let analyzer handle fallback
      throw error;
    }
  }

  /**
   * Health check for OpenAI API
   *
   * Sends minimal request to verify API is responding.
   * Timeout after 5 seconds.
   *
   * @returns true if healthy, false if unhealthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Create timeout promise (5 seconds)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );

      // Minimal API call
      const checkPromise = this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 10,
      });

      // Race timeout vs API call
      await Promise.race([checkPromise, timeoutPromise]);

      return true;
    } catch (error) {
      console.warn('OpenAI health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Calculate cost for token usage
   *
   * @param inputTokens - Input tokens used
   * @param outputTokens - Output tokens used
   * @returns Cost in USD
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.config.costPerMTokenInput;
    const outputCost = (outputTokens / 1_000_000) * this.config.costPerMTokenOutput;
    return inputCost + outputCost;
  }

  /**
   * Classify error type for retry logic
   *
   * @param error - Error from API call
   * @returns Classified error type
   * @private
   */
  private classifyError(error: unknown): AIErrorType {
    if (error instanceof AIError) {
      return error.type;
    }

    const err = error as Error & { status?: number; code?: string };

    // Rate limit errors
    if (
      err.status === 429 ||
      err.code === 'rate_limit_exceeded' ||
      err.message?.includes('rate limit')
    ) {
      return AIErrorType.RATE_LIMIT;
    }

    // Timeout errors
    if (
      err.code === 'ETIMEDOUT' ||
      err.message?.includes('timeout') ||
      err.message?.includes('ETIMEDOUT')
    ) {
      return AIErrorType.TIMEOUT;
    }

    // Default to provider error
    return AIErrorType.PROVIDER_ERROR;
  }

  // Note: calculateBackoff and sleep methods removed as they're no longer used
  // Retry logic is now handled by analyzer.ts
}
