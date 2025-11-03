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
 * Google Gemini Provider Implementation
 *
 * Google Gemini 1.5 Flash client for user profile analysis.
 * This provider is approved by Reddit Devvit policy for LLM usage.
 *
 * Key Features:
 * - Model: gemini-1.5-flash
 * - Structured output via JSON response parsing
 * - Token counting and cost tracking
 * - Health check with minimal token usage
 * - Cost: $0.075/MTok input, $0.30/MTok output (≤128k context)
 * - Context window: 1M tokens (using ≤128k for optimal pricing)
 *
 * Note: Uses direct HTTP fetch instead of SDK for maximum control
 * and compatibility with Devvit environment.
 *
 * @module ai/gemini
 *
 * @example
 * ```typescript
 * import { GeminiProvider } from './gemini.js';
 *
 * const provider = new GeminiProvider('gemini-api-key');
 * const result = await provider.analyze(request);
 * console.log('Scammer risk:', result.scammerRisk.level);
 * ```
 */

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
 * Gemini API request structure
 * @internal
 */
interface GeminiRequest {
  contents: Array<{
    parts: Array<{ text: string }>;
  }>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}

/**
 * Gemini API response structure
 * @internal
 */
interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Google Gemini 1.5 Flash Provider
 *
 * AI provider for user profile analysis using Google's Gemini 1.5 Flash model.
 * Approved by Reddit Devvit policy for production use.
 *
 * Uses direct HTTP fetch to the Gemini API endpoint:
 * - Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
 * - Authentication: API key in query parameter
 * - Response: JSON nested in text field
 */
export class GeminiProvider implements IAIProvider {
  readonly type: AIProviderType = 'gemini';
  readonly model = 'gemini-1.5-flash';

  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  private config = AI_CONFIG.providers.gemini;

  /**
   * Create Gemini provider instance
   *
   * @param apiKey - Google Gemini API key from Devvit Secrets Manager
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Analyze user profile using Gemini
   *
   * Sends user profile data to Gemini API and returns structured analysis.
   * Validates response using aiResponseValidator. Tracks token usage and cost.
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
    const systemInstruction = `You are a content moderation AI. Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;
    const fullPrompt = `${systemInstruction}\n\n${promptData.prompt}`;

    try {
      console.log('Gemini analysis attempt', {
        correlationId,
        userId: request.userId,
      });

      // Build Gemini API request
      const geminiRequest: GeminiRequest = {
        contents: [
          {
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      };

      // Call Gemini API
      const endpoint = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest),
      });

      // Check HTTP status
      if (!response.ok) {
        const errorText = await response.text();
        throw new AIError(
          response.status === 429 ? AIErrorType.RATE_LIMIT : AIErrorType.PROVIDER_ERROR,
          `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
          this.type,
          correlationId
        );
      }

      // Parse response
      const geminiResponse = (await response.json()) as GeminiResponse;

      // Check for API error in response
      if (geminiResponse.error) {
        throw new AIError(
          AIErrorType.PROVIDER_ERROR,
          `Gemini API error: ${geminiResponse.error.message}`,
          this.type,
          correlationId
        );
      }

      // Extract text from response
      const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          'Gemini response is empty or malformed',
          this.type,
          correlationId
        );
      }

      // Parse JSON from text
      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          `Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          this.type,
          correlationId
        );
      }

      // Validate response structure
      const validatedResult = aiResponseValidator.validate(parsedResponse);

      // Calculate actual token usage and cost
      const inputTokens = geminiResponse.usageMetadata?.promptTokenCount || 0;
      const outputTokens = geminiResponse.usageMetadata?.candidatesTokenCount || 0;
      const costUSD = this.calculateCost(inputTokens, outputTokens);
      const latencyMs = Date.now() - startTime;

      // Determine cache TTL based on trust score
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
        model: this.model,
        correlationId,
        promptVersion: request.context.promptVersion,
        cacheTTL,
        tokensUsed: inputTokens + outputTokens,
        costUSD,
        latencyMs,
      };

      console.log('Gemini analysis success', {
        correlationId,
        tokensUsed: result.tokensUsed,
        costUSD: result.costUSD,
        latencyMs,
      });

      return result;
    } catch (error) {
      // Classify error type
      const errorType = this.classifyError(error);

      console.error('Gemini analysis error', {
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
   * Flexible analysis method that allows moderators to define custom
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
    const systemInstruction = `You are a content moderation AI. Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;
    const fullPrompt = `${systemInstruction}\n\n${promptData.prompt}`;

    try {
      // Log request details before API call
      console.log('[Gemini] Sending question analysis request:', {
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
      console.log('[Gemini] Prompt preview:', fullPrompt.substring(0, 500) + '...');

      // Build Gemini API request
      const geminiRequest: GeminiRequest = {
        contents: [
          {
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      };

      // Call Gemini API
      const endpoint = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest),
      });

      // Check HTTP status
      if (!response.ok) {
        const errorText = await response.text();
        throw new AIError(
          response.status === 429 ? AIErrorType.RATE_LIMIT : AIErrorType.PROVIDER_ERROR,
          `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
          this.type,
          correlationId
        );
      }

      // Parse response
      const geminiResponse = (await response.json()) as GeminiResponse;

      // Check for API error in response
      if (geminiResponse.error) {
        throw new AIError(
          AIErrorType.PROVIDER_ERROR,
          `Gemini API error: ${geminiResponse.error.message}`,
          this.type,
          correlationId
        );
      }

      // Extract text from response
      const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          'Gemini response is empty or malformed',
          this.type,
          correlationId
        );
      }

      // Parse JSON from text
      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(content);
      } catch (parseError) {
        throw new AIError(
          AIErrorType.INVALID_RESPONSE,
          `Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          this.type,
          correlationId
        );
      }

      // Log raw response from API
      const inputTokens = geminiResponse.usageMetadata?.promptTokenCount || 0;
      const outputTokens = geminiResponse.usageMetadata?.candidatesTokenCount || 0;
      const cost = this.calculateCost(inputTokens, outputTokens);

      console.log('[Gemini] Received response:', {
        correlationId,
        model: this.model,
        promptTokens: inputTokens,
        candidatesTokens: outputTokens,
        totalTokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
        cost: cost.toFixed(4),
        finishReason: geminiResponse.candidates?.[0]?.finishReason,
        responsePreview: content.substring(0, 200)
      });

      // Validate response structure
      const validatedResult = aiResponseValidator.validateQuestionBatchResponse(parsedResponse);

      // Log parsed response
      console.log('[Gemini] Parsed response:', {
        correlationId,
        answersCount: validatedResult.answers?.length || 0,
        answers: validatedResult.answers?.map(a => ({
          questionId: a.questionId,
          answer: a.answer,
          confidence: a.confidence,
          reasoningLength: a.reasoning?.length || 0
        }))
      });

      // Calculate cost and latency
      const costUSD = this.calculateCost(inputTokens, outputTokens);
      const latencyMs = Date.now() - startTime;

      // Determine cache TTL based on trust score
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

      console.log('Gemini question analysis success', {
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

      console.error('Gemini question analysis error', {
        correlationId,
        errorType,
        message: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error to let analyzer handle fallback
      throw error;
    }
  }

  /**
   * Health check for Gemini API
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
      const geminiRequest: GeminiRequest = {
        contents: [
          {
            parts: [{ text: 'Say OK' }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 10,
        },
      };

      const endpoint = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const checkPromise = fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest),
      });

      // Race timeout vs API call
      const response = await Promise.race([checkPromise, timeoutPromise]);

      // Check if response is ok
      return response.ok;
    } catch (error) {
      console.warn('Gemini health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Calculate cost for token usage
   *
   * Gemini 1.5 Flash pricing (≤128k context):
   * - Input: $0.075 per 1M tokens
   * - Output: $0.30 per 1M tokens
   *
   * @param inputTokens - Input tokens used
   * @param outputTokens - Output tokens used
   * @returns Cost in USD
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 0.075;
    const outputCost = (outputTokens / 1_000_000) * 0.30;
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
      err.message?.includes('rate limit') ||
      err.message?.includes('429')
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
}
