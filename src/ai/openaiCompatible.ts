/**
 * ⚠️ DEPRECATED - Provider not approved by Reddit Devvit policy (as of 2025-11-03)
 *
 * Reddit LLM Policy: https://developers.reddit.com/docs/devvit_rules#only-use-approved-llms
 * Approved LLMs: OpenAI and Gemini ONLY
 *
 * This provider has been deprecated to comply with Reddit's requirements.
 * Code is preserved for potential future restoration if policy changes.
 *
 * DO NOT REMOVE THIS FILE - It may be reinstated if Reddit approves additional providers.
 *
 * To restore this provider if policy changes:
 * 1. Uncomment all code below
 * 2. Add provider type back to AIProviderType in src/types/ai.ts
 * 3. Add API domain back to HTTP allowlist in devvit.json
 * 4. Add settings fields back in src/main.tsx
 * 5. Update analyzer.ts getProvider() method
 */

// /**
//  * AI Automod - AI Automod for Reddit
//  * Copyright (C) 2025 CoinsTax LLC
//  *
//  * This program is free software: you can redistribute it and/or modify
//  * it under the terms of the GNU Affero General Public License as published
//  * by the Free Software Foundation, either version 3 of the License, or
//  * (at your option) any later version.
//  *
//  * This program is distributed in the hope that it will be useful,
//  * but WITHOUT ANY WARRANTY; without even the implied warranty of
//  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//  * GNU Affero General Public License for more details.
//  *
//  * You should have received a copy of the GNU Affero General Public License
//  * along with this program. If not, see <https://www.gnu.org/licenses/>.
//  */
// 
// /**
//  * OpenAI Compatible Provider Implementation
//  *
//  * Generic OpenAI-compatible client for custom endpoints including:
//  * - Groq (fast inference with Llama models)
//  * - Together AI (wide model selection)
//  * - Z.AI (custom endpoints)
//  * - Self-hosted vLLM, Ollama, LocalAI, etc.
//  *
//  * Key Features:
//  * - Configurable base URL and model name
//  * - Uses standard OpenAI SDK with custom endpoint
//  * - Structured output via JSON mode
//  * - Retry logic with exponential backoff (3 attempts)
//  * - Token counting and cost tracking
//  * - Health check with minimal token usage
//  * - Generic pricing (configurable)
//  *
//  * @module ai/openaiCompatible
//  *
//  * @example
//  * ```typescript
//  * import { OpenAICompatibleProvider } from './openaiCompatible.js';
//  *
//  * // Groq example
//  * const provider = new OpenAICompatibleProvider({
//  *   apiKey: 'gsk_...',
//  *   baseURL: 'https://api.groq.com/openai/v1',
//  *   model: 'llama-3.1-70b-versatile'
//  * });
//  * const result = await provider.analyze(request);
//  * console.log('Scammer risk:', result.scammerRisk.level);
//  * ```
//  */
// 
// import OpenAI from 'openai';
// import { IAIProvider } from './provider.js';
// import {
//   AIAnalysisRequest,
//   AIAnalysisResult,
//   AIErrorType,
//   AIError,
//   AIProviderType,
//   AIQuestionRequest,
//   AIQuestionBatchResult,
// } from '../types/ai.js';
// import { aiResponseValidator } from './validator.js';
// import { AI_CONFIG } from '../config/ai.js';
// import { promptManager } from './prompts.js';
// import { getCacheTTLForTrustScore } from '../config/ai.js';
// 
// /**
//  * Configuration for OpenAI Compatible provider
//  */
// export interface OpenAICompatibleConfig {
//   /** API key for the custom endpoint */
//   apiKey: string;
//   /** Base URL for the OpenAI-compatible endpoint */
//   baseURL: string;
//   /** Model name to use (provider-specific) */
//   model: string;
//   /** Cost per million input tokens (optional, defaults to generic estimate) */
//   costPerMTokenInput?: number;
//   /** Cost per million output tokens (optional, defaults to generic estimate) */
//   costPerMTokenOutput?: number;
// }
// 
// /**
//  * OpenAI Compatible Provider
//  *
//  * Generic provider for OpenAI-compatible endpoints. Uses the OpenAI SDK
//  * with custom baseURL configuration to support alternative providers.
//  *
//  * Supports any endpoint that implements the OpenAI Chat Completions API:
//  * - Groq: https://api.groq.com/openai/v1
//  * - Together AI: https://api.together.xyz/v1
//  * - Self-hosted vLLM: http://localhost:8000/v1
//  * - Self-hosted Ollama: http://localhost:11434/v1
//  * - LocalAI: http://localhost:8080/v1
//  */
// export class OpenAICompatibleProvider implements IAIProvider {
//   readonly type: AIProviderType = 'openai'; // Use 'openai' type for compatibility
//   readonly model: string;
// 
//   private client: OpenAI;
//   private config: OpenAICompatibleConfig;
//   private retryConfig = AI_CONFIG.retry;
// 
//   // Default pricing if not specified (generic estimate based on typical pricing)
//   private defaultCostPerMTokenInput = 0.15;
//   private defaultCostPerMTokenOutput = 0.60;
// 
//   /**
//    * Create OpenAI Compatible provider instance
//    *
//    * @param config - Provider configuration with API key, base URL, and model
//    */
//   constructor(config: OpenAICompatibleConfig) {
//     this.config = config;
//     this.model = config.model;
// 
//     // Create OpenAI client with custom base URL
//     this.client = new OpenAI({
//       apiKey: config.apiKey,
//       baseURL: config.baseURL,
//     });
//   }
// 
//   /**
//    * Analyze user profile using custom endpoint
//    *
//    * Implements retry logic with exponential backoff. Validates response
//    * using aiResponseValidator. Tracks token usage and cost.
//    *
//    * @param request - User profile and context for analysis
//    * @returns Structured analysis result
//    * @throws {AIError} On provider errors, validation failures, or timeouts
//    */
//   async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResult> {
//     const startTime = Date.now();
//     const correlationId = request.context.correlationId;
// 
//     // Build prompt using prompt manager
//     const promptData = await promptManager.buildPrompt({
//       profile: request.profile,
//       postHistory: request.postHistory,
//       currentPost: request.currentPost,
//       subredditType: request.context.subredditType,
//     });
// 
//     // Add JSON format instruction to prompt
//     const systemPrompt = `You are a content moderation AI. Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;
// 
//     try {
//       console.log('[OpenAICompatible] Analysis attempt', {
//         correlationId,
//         userId: request.userId,
//         baseURL: this.config.baseURL,
//         model: this.model,
//       });
// 
//       // Call OpenAI-compatible API with JSON mode
//       const response = await this.client.chat.completions.create({
//         model: this.model,
//         messages: [
//           { role: 'system', content: systemPrompt },
//           { role: 'user', content: promptData.prompt },
//         ],
//         response_format: { type: 'json_object' },
//         temperature: 0.3,
//         max_tokens: 1500,
//       });
// 
//       // Extract JSON response
//       const content = response.choices[0]?.message?.content;
//       if (!content) {
//         throw new AIError(
//           AIErrorType.INVALID_RESPONSE,
//           'OpenAI Compatible response is empty',
//           this.type,
//           correlationId
//         );
//       }
// 
//       // Parse JSON
//       let parsedResponse: unknown;
//       try {
//         parsedResponse = JSON.parse(content);
//       } catch (parseError) {
//         throw new AIError(
//           AIErrorType.INVALID_RESPONSE,
//           `Failed to parse OpenAI Compatible JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
//           this.type,
//           correlationId
//         );
//       }
// 
//       // Validate response structure
//       const validatedResult = aiResponseValidator.validate(parsedResponse);
// 
//       // Calculate actual token usage and cost
//       const inputTokens = response.usage?.prompt_tokens || 0;
//       const outputTokens = response.usage?.completion_tokens || 0;
//       const costUSD = this.calculateCost(inputTokens, outputTokens);
//       const latencyMs = Date.now() - startTime;
// 
//       // Determine cache TTL based on trust score
//       // TODO: Get trust score from ProfileAnalysisResult when integrated
//       const trustScore = 50; // Default medium trust
//       const cacheTTL = getCacheTTLForTrustScore(
//         trustScore,
//         validatedResult.overallRisk === 'CRITICAL'
//       );
// 
//       // Return complete result
//       const result: AIAnalysisResult = {
//         ...validatedResult,
//         userId: request.userId,
//         timestamp: Date.now(),
//         provider: this.type,
//         correlationId,
//         promptVersion: request.context.promptVersion,
//         cacheTTL,
//         tokensUsed: inputTokens + outputTokens,
//         costUSD,
//         latencyMs,
//       };
// 
//       console.log('[OpenAICompatible] Analysis success', {
//         correlationId,
//         tokensUsed: result.tokensUsed,
//         costUSD: result.costUSD,
//         latencyMs,
//         baseURL: this.config.baseURL,
//         model: this.model,
//       });
// 
//       return result;
//     } catch (error) {
//       // Classify error type
//       const errorType = this.classifyError(error);
// 
//       // Extract detailed error information
//       const errorDetails: any = {
//         correlationId,
//         errorType,
//         message: error instanceof Error ? error.message : String(error),
//         baseURL: this.config.baseURL,
//         model: this.model,
//       };
// 
//       // Add detailed error info from API response if available
//       if (error && typeof error === 'object') {
//         const apiError = error as any;
//         if (apiError.status) errorDetails.status = apiError.status;
//         if (apiError.code) errorDetails.code = apiError.code;
//         if (apiError.response) errorDetails.response = apiError.response;
//         if (apiError.error) errorDetails.apiError = apiError.error;
//         // OpenAI SDK may nest the actual error
//         if (apiError.message) errorDetails.fullMessage = apiError.message;
//       }
// 
//       console.error('[OpenAICompatible] Analysis error', errorDetails);
// 
//       // Re-throw the error to let analyzer handle fallback
//       throw error;
//     }
//   }
// 
//   /**
//    * Analyze user with custom questions
//    *
//    * New flexible analysis method that allows moderators to define custom
//    * questions in natural language. Answers each question with YES/NO,
//    * confidence score, and reasoning.
//    *
//    * @param request - User profile data and array of custom questions
//    * @returns Batch result with answers to all questions
//    * @throws {AIError} On provider errors, validation failures, or timeouts
//    */
//   async analyzeWithQuestions(request: AIQuestionRequest): Promise<AIQuestionBatchResult> {
//     const startTime = Date.now();
//     const correlationId = request.context.correlationId;
// 
//     // Build question prompt using prompt manager
//     const promptData = await promptManager.buildQuestionPrompt({
//       profile: request.profile,
//       postHistory: request.postHistory,
//       currentPost: request.currentPost,
//       questions: request.questions,
//     });
// 
//     // Add JSON format instruction to prompt
//     const systemPrompt = `You are a content moderation AI. Respond ONLY with valid JSON matching the specified schema. Do not include any text outside the JSON object.`;
// 
//     try {
//       // Log request details before API call
//       console.log('[OpenAICompatible] Sending question analysis request:', {
//         correlationId,
//         userId: request.userId,
//         username: request.username,
//         questionCount: request.questions.length,
//         baseURL: this.config.baseURL,
//         model: this.model,
//         questions: request.questions.map(q => ({
//           id: q.id,
//           question: q.question,
//           hasContext: !!q.context
//         })),
//       });
// 
//       // Call OpenAI-compatible API with JSON mode
//       const response = await this.client.chat.completions.create({
//         model: this.model,
//         messages: [
//           { role: 'system', content: systemPrompt },
//           { role: 'user', content: promptData.prompt },
//         ],
//         response_format: { type: 'json_object' },
//         temperature: 0.3,
//         max_tokens: 1500,
//       });
// 
//       // Extract JSON response
//       const content = response.choices[0]?.message?.content;
//       if (!content) {
//         throw new AIError(
//           AIErrorType.INVALID_RESPONSE,
//           'OpenAI Compatible response is empty',
//           this.type,
//           correlationId
//         );
//       }
// 
//       // Parse JSON
//       let parsedResponse: unknown;
//       try {
//         parsedResponse = JSON.parse(content);
//       } catch (parseError) {
//         throw new AIError(
//           AIErrorType.INVALID_RESPONSE,
//           `Failed to parse OpenAI Compatible JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
//           this.type,
//           correlationId
//         );
//       }
// 
//       // Log raw response from API
//       const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
//       const cost = this.calculateCost(usage.prompt_tokens, usage.completion_tokens);
// 
//       console.log('[OpenAICompatible] Received response:', {
//         correlationId,
//         model: this.model,
//         promptTokens: usage.prompt_tokens,
//         completionTokens: usage.completion_tokens,
//         totalTokens: usage.total_tokens,
//         cost: cost.toFixed(4),
//         finishReason: response.choices[0].finish_reason,
//         baseURL: this.config.baseURL,
//       });
// 
//       // Validate response structure
//       const validatedResult = aiResponseValidator.validateQuestionBatchResponse(parsedResponse);
// 
//       // Log parsed response
//       console.log('[OpenAICompatible] Parsed response:', {
//         correlationId,
//         answersCount: validatedResult.answers?.length || 0,
//         answers: validatedResult.answers?.map(a => ({
//           questionId: a.questionId,
//           answer: a.answer,
//           confidence: a.confidence,
//         }))
//       });
// 
//       // Calculate actual token usage and cost
//       const inputTokens = response.usage?.prompt_tokens || 0;
//       const outputTokens = response.usage?.completion_tokens || 0;
//       const costUSD = this.calculateCost(inputTokens, outputTokens);
//       const latencyMs = Date.now() - startTime;
// 
//       // Determine cache TTL based on trust score
//       // TODO: Get trust score from ProfileAnalysisResult when integrated
//       const trustScore = 50; // Default medium trust
//       const cacheTTL = getCacheTTLForTrustScore(trustScore, false);
// 
//       // Return complete result
//       const result: AIQuestionBatchResult = {
//         userId: request.userId,
//         timestamp: Date.now(),
//         provider: this.type,
//         correlationId,
//         cacheTTL,
//         tokensUsed: inputTokens + outputTokens,
//         costUSD,
//         latencyMs,
//         answers: validatedResult.answers,
//       };
// 
//       console.log('[OpenAICompatible] Question analysis success', {
//         correlationId,
//         questionCount: result.answers.length,
//         tokensUsed: result.tokensUsed,
//         costUSD: result.costUSD,
//         latencyMs,
//         baseURL: this.config.baseURL,
//       });
// 
//       return result;
//     } catch (error) {
//       // Classify error type
//       const errorType = this.classifyError(error);
// 
//       // Extract detailed error information
//       const errorDetails: any = {
//         correlationId,
//         errorType,
//         message: error instanceof Error ? error.message : String(error),
//         baseURL: this.config.baseURL,
//         model: this.model,
//       };
// 
//       // Add detailed error info from API response if available
//       if (error && typeof error === 'object') {
//         const apiError = error as any;
//         if (apiError.status) errorDetails.status = apiError.status;
//         if (apiError.code) errorDetails.code = apiError.code;
//         if (apiError.response) errorDetails.response = apiError.response;
//         if (apiError.error) errorDetails.apiError = apiError.error;
//         // OpenAI SDK may nest the actual error
//         if (apiError.message) errorDetails.fullMessage = apiError.message;
//       }
// 
//       console.error('[OpenAICompatible] Question analysis error', errorDetails);
// 
//       // Re-throw the error to let analyzer handle fallback
//       throw error;
//     }
//   }
// 
//   /**
//    * Health check for OpenAI Compatible API
//    *
//    * Sends minimal request to verify API is responding.
//    * Timeout after 5 seconds.
//    *
//    * @returns true if healthy, false if unhealthy
//    */
//   async healthCheck(): Promise<boolean> {
//     try {
//       // Create timeout promise (5 seconds)
//       const timeoutPromise = new Promise<never>((_, reject) =>
//         setTimeout(() => reject(new Error('Health check timeout')), 5000)
//       );
// 
//       // Minimal API call
//       const checkPromise = this.client.chat.completions.create({
//         model: this.model,
//         messages: [{ role: 'user', content: 'Say OK' }],
//         max_tokens: 10,
//       });
// 
//       // Race timeout vs API call
//       await Promise.race([checkPromise, timeoutPromise]);
// 
//       console.log('[OpenAICompatible] Health check passed', {
//         baseURL: this.config.baseURL,
//         model: this.model,
//       });
// 
//       return true;
//     } catch (error) {
//       // Extract detailed error information for health check
//       const errorDetails: any = {
//         baseURL: this.config.baseURL,
//         model: this.model,
//       };
// 
//       // Add detailed error info from API response if available
//       if (error && typeof error === 'object') {
//         const apiError = error as any;
//         errorDetails.error = apiError.message || String(error);
//         if (apiError.status) errorDetails.status = apiError.status;
//         if (apiError.code) errorDetails.code = apiError.code;
//         if (apiError.error) errorDetails.apiError = apiError.error;
//       } else {
//         errorDetails.error = String(error);
//       }
// 
//       console.warn('[OpenAICompatible] Health check failed', errorDetails);
//       return false;
//     }
//   }
// 
//   /**
//    * Calculate cost for token usage
//    *
//    * Uses configured pricing or defaults to generic estimates.
//    *
//    * @param inputTokens - Input tokens used
//    * @param outputTokens - Output tokens used
//    * @returns Cost in USD
//    */
//   calculateCost(inputTokens: number, outputTokens: number): number {
//     const inputCostPerMToken = this.config.costPerMTokenInput ?? this.defaultCostPerMTokenInput;
//     const outputCostPerMToken = this.config.costPerMTokenOutput ?? this.defaultCostPerMTokenOutput;
// 
//     const inputCost = (inputTokens / 1_000_000) * inputCostPerMToken;
//     const outputCost = (outputTokens / 1_000_000) * outputCostPerMToken;
//     return inputCost + outputCost;
//   }
// 
//   /**
//    * Classify error type for retry logic
//    *
//    * @param error - Error from API call
//    * @returns Classified error type
//    * @private
//    */
//   private classifyError(error: unknown): AIErrorType {
//     if (error instanceof AIError) {
//       return error.type;
//     }
// 
//     const err = error as Error & { status?: number; code?: string };
// 
//     // Rate limit errors
//     if (
//       err.status === 429 ||
//       err.code === 'rate_limit_exceeded' ||
//       err.message?.includes('rate limit')
//     ) {
//       return AIErrorType.RATE_LIMIT;
//     }
// 
//     // Timeout errors
//     if (
//       err.code === 'ETIMEDOUT' ||
//       err.message?.includes('timeout') ||
//       err.message?.includes('ETIMEDOUT')
//     ) {
//       return AIErrorType.TIMEOUT;
//     }
// 
//     // Default to provider error
//     return AIErrorType.PROVIDER_ERROR;
//   }
// 
//   /**
//    * Calculate exponential backoff delay
//    *
//    * @param attempt - Current attempt number (1-indexed)
//    * @returns Delay in milliseconds
//    * @private
//    */
//   private calculateBackoff(attempt: number): number {
//     const delay =
//       this.retryConfig.initialDelayMs *
//       Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
//     return Math.min(delay, this.retryConfig.maxDelayMs);
//   }
// 
//   /**
//    * Sleep for specified milliseconds
//    *
//    * @param ms - Milliseconds to sleep
//    * @private
//    */
//   private sleep(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }
// }
