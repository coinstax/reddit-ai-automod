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
 * AI Response Validator
 *
 * Validates AI provider responses using Zod runtime schema validation to ensure
 * they match the expected AIAnalysisResult structure. Provides strict validation,
 * partial validation for recovery, and quick validity checks.
 *
 * @module ai/validator
 *
 * @example
 * ```typescript
 * // Strict validation (throws on error)
 * try {
 *   const result = aiResponseValidator.validate(apiResponse);
 *   console.log('Valid result:', result);
 * } catch (error) {
 *   if (error instanceof AIError && error.type === AIErrorType.VALIDATION_ERROR) {
 *     console.error('Validation failed:', error.message);
 *   }
 * }
 *
 * // Partial validation (salvage what we can)
 * const { result, warnings } = aiResponseValidator.validatePartial(apiResponse);
 * if (warnings.length > 0) {
 *   console.warn('Validation warnings:', warnings);
 * }
 * // Use partial result even if some fields are invalid
 * if (result.datingIntent) {
 *   console.log('Dating intent:', result.datingIntent);
 * }
 *
 * // Quick validity check
 * if (aiResponseValidator.isValid(apiResponse)) {
 *   // Proceed with valid response
 *   const result = apiResponse as AIAnalysisResult;
 * }
 * ```
 */

import { z } from 'zod';
import { AIAnalysisResult, AIErrorType, AIError } from '../types/ai.js';

/**
 * Zod schema for validating AI analysis results
 * Ensures all fields match expected types and constraints
 */
const AIAnalysisResultSchema = z.object({
  // Dating intent detection
  datingIntent: z.object({
    detected: z.boolean(),
    confidence: z.number().min(0).max(100),
    reasoning: z.string(),
  }),

  // Scammer risk assessment
  scammerRisk: z.object({
    level: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
    confidence: z.number().min(0).max(100),
    patterns: z.array(z.string()),
    reasoning: z.string(),
  }),

  // Age estimation (optional field)
  ageEstimate: z
    .object({
      appearsUnderage: z.boolean(),
      confidence: z.number().min(0).max(100),
      reasoning: z.string(),
      estimatedAge: z.enum(['under-18', '18-25', '25-40', '40+']).optional(),
    })
    .optional(),

  // Spam detection
  spamIndicators: z.object({
    detected: z.boolean(),
    confidence: z.number().min(0).max(100),
    patterns: z.array(z.string()),
  }),

  // Overall risk and action recommendation
  overallRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  recommendedAction: z.enum(['APPROVE', 'FLAG', 'REMOVE']),
});

/**
 * Partial Zod schemas for individual validation in recovery scenarios
 */
const DatingIntentSchema = z.object({
  detected: z.boolean(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
});

const ScammerRiskSchema = z.object({
  level: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
  confidence: z.number().min(0).max(100),
  patterns: z.array(z.string()),
  reasoning: z.string(),
});

const AgeEstimateSchema = z.object({
  appearsUnderage: z.boolean(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  estimatedAge: z.enum(['under-18', '18-25', '25-40', '40+']).optional(),
});

const SpamIndicatorsSchema = z.object({
  detected: z.boolean(),
  confidence: z.number().min(0).max(100),
  patterns: z.array(z.string()),
});

const OverallRiskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const RecommendedActionSchema = z.enum(['APPROVE', 'FLAG', 'REMOVE']);

/**
 * Zod schema for validating evidence pieces extracted from user content
 * Each piece includes type, quote, and source location
 */
const EvidencePieceSchema = z.object({
  type: z.string(),
  quote: z.string(),
  source: z.string(),
});

/**
 * Zod schema for validating custom question-based AI analysis results
 * Ensures answer format matches expected structure
 *
 * Enhanced with optional evidence extraction fields for transparency:
 * - evidencePieces: Array of evidence supporting the answer
 * - falsePositivePatternsDetected: Array of false positive patterns found
 * - negationDetected: Whether negation language was detected
 *
 * All evidence fields are optional for backward compatibility with simple questions.
 */
const AIAnswerSchema = z.object({
  questionId: z.string(),
  answer: z.enum(['YES', 'NO']),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  // Optional evidence extraction fields
  evidencePieces: z.array(EvidencePieceSchema).optional(),
  falsePositivePatternsDetected: z.array(z.string()).optional(),
  negationDetected: z.boolean().optional(),
});

const AIQuestionBatchResultSchema = z.object({
  answers: z.array(AIAnswerSchema),
});

/**
 * AI Response Validator
 *
 * Provides runtime validation of AI provider responses using Zod schemas.
 * Supports strict validation (throws on error), partial validation (salvages
 * valid fields), and quick validity checks.
 */
export class AIResponseValidator {
  /**
   * Validate AI response with strict enforcement
   *
   * Parses the raw response against the AIAnalysisResult schema. If validation
   * fails, logs detailed error information and throws an AIError with type
   * VALIDATION_ERROR.
   *
   * @param rawResponse - Raw response from AI provider (unknown type)
   * @returns Fully validated AIAnalysisResult
   * @throws {AIError} If validation fails (type: VALIDATION_ERROR)
   *
   * @example
   * ```typescript
   * try {
   *   const result = validator.validate(apiResponse);
   *   // result is guaranteed to match AIAnalysisResult structure
   *   console.log('Dating intent detected:', result.datingIntent.detected);
   * } catch (error) {
   *   if (error instanceof AIError) {
   *     console.error('Validation failed:', error.message);
   *     // Try fallback provider or partial validation
   *   }
   * }
   * ```
   */
  validate(rawResponse: unknown): AIAnalysisResult {
    try {
      // Parse response using Zod schema
      const parsed = AIAnalysisResultSchema.parse(rawResponse);
      return parsed as AIAnalysisResult;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Extract correlation ID if present in response for logging
        const correlationId =
          typeof rawResponse === 'object' &&
          rawResponse !== null &&
          'correlationId' in rawResponse
            ? String(rawResponse.correlationId)
            : undefined;

        // Format Zod errors into readable message
        const errorMessage = this.formatZodError(error);

        // Log detailed validation failure for debugging
        console.error('AI response validation failed', {
          errors: error.issues,
          rawResponse: JSON.stringify(rawResponse, null, 2),
          correlationId,
        });

        // Throw AIError with validation error type
        throw new AIError(
          AIErrorType.VALIDATION_ERROR,
          `AI response validation failed: ${errorMessage}`,
          undefined,
          correlationId
        );
      }
      // Re-throw non-Zod errors
      throw error;
    }
  }

  /**
   * Validate AI response with best-effort recovery
   *
   * Attempts to salvage as many valid fields as possible from a malformed
   * response. Returns a partial result with whatever fields pass validation,
   * along with an array of warning messages for fields that failed.
   *
   * Useful for recovery scenarios where you want to use partial data rather
   * than completely failing.
   *
   * @param rawResponse - Raw response from AI provider (unknown type)
   * @returns Object with partial result and array of warning messages
   *
   * @example
   * ```typescript
   * const { result, warnings } = validator.validatePartial(apiResponse);
   *
   * if (warnings.length > 0) {
   *   console.warn('Validation warnings:', warnings);
   * }
   *
   * // Use whatever fields are available
   * if (result.datingIntent) {
   *   console.log('Dating intent:', result.datingIntent);
   * }
   * if (result.overallRisk) {
   *   console.log('Overall risk:', result.overallRisk);
   * }
   * ```
   */
  validatePartial(rawResponse: unknown): {
    result: Partial<AIAnalysisResult>;
    warnings: string[];
  } {
    const result: Partial<AIAnalysisResult> = {};
    const warnings: string[] = [];

    // Ensure rawResponse is an object
    if (typeof rawResponse !== 'object' || rawResponse === null) {
      warnings.push('Response is not an object');
      return { result, warnings };
    }

    const response = rawResponse as Record<string, unknown>;

    // Validate datingIntent
    if ('datingIntent' in response) {
      const parsed = DatingIntentSchema.safeParse(response.datingIntent);
      if (parsed.success) {
        result.datingIntent = parsed.data;
      } else {
        warnings.push(
          `datingIntent validation failed: ${this.formatZodError(parsed.error)}`
        );
      }
    } else {
      warnings.push('Missing required field: datingIntent');
    }

    // Validate scammerRisk
    if ('scammerRisk' in response) {
      const parsed = ScammerRiskSchema.safeParse(response.scammerRisk);
      if (parsed.success) {
        result.scammerRisk = parsed.data;
      } else {
        warnings.push(
          `scammerRisk validation failed: ${this.formatZodError(parsed.error)}`
        );
      }
    } else {
      warnings.push('Missing required field: scammerRisk');
    }

    // Validate ageEstimate (optional)
    if ('ageEstimate' in response && response.ageEstimate !== null && response.ageEstimate !== undefined) {
      const parsed = AgeEstimateSchema.safeParse(response.ageEstimate);
      if (parsed.success) {
        result.ageEstimate = parsed.data;
      } else {
        warnings.push(
          `ageEstimate validation failed: ${this.formatZodError(parsed.error)}`
        );
      }
    }

    // Validate spamIndicators
    if ('spamIndicators' in response) {
      const parsed = SpamIndicatorsSchema.safeParse(response.spamIndicators);
      if (parsed.success) {
        result.spamIndicators = parsed.data;
      } else {
        warnings.push(
          `spamIndicators validation failed: ${this.formatZodError(parsed.error)}`
        );
      }
    } else {
      warnings.push('Missing required field: spamIndicators');
    }

    // Validate overallRisk
    if ('overallRisk' in response) {
      const parsed = OverallRiskSchema.safeParse(response.overallRisk);
      if (parsed.success) {
        result.overallRisk = parsed.data;
      } else {
        warnings.push(
          `overallRisk validation failed: ${this.formatZodError(parsed.error)}`
        );
      }
    } else {
      warnings.push('Missing required field: overallRisk');
    }

    // Validate recommendedAction
    if ('recommendedAction' in response) {
      const parsed = RecommendedActionSchema.safeParse(response.recommendedAction);
      if (parsed.success) {
        result.recommendedAction = parsed.data;
      } else {
        warnings.push(
          `recommendedAction validation failed: ${this.formatZodError(parsed.error)}`
        );
      }
    } else {
      warnings.push('Missing required field: recommendedAction');
    }

    return { result, warnings };
  }

  /**
   * Quick validation check without throwing
   *
   * Performs a lightweight validity check using Zod's safeParse. Returns
   * true if the response is valid, false otherwise. Does not throw errors
   * or log anything.
   *
   * Useful for quick checks before attempting full validation.
   *
   * @param rawResponse - Raw response from AI provider (unknown type)
   * @returns true if response is valid, false otherwise
   *
   * @example
   * ```typescript
   * if (validator.isValid(apiResponse)) {
   *   // Response is valid, safe to use
   *   const result = apiResponse as AIAnalysisResult;
   *   processResult(result);
   * } else {
   *   // Response is invalid, try fallback
   *   console.warn('Invalid response, trying fallback provider');
   * }
   * ```
   */
  isValid(rawResponse: unknown): boolean {
    const result = AIAnalysisResultSchema.safeParse(rawResponse);
    return result.success;
  }

  /**
   * Validate AI question batch response with strict enforcement
   *
   * Parses the raw response against the AIQuestionBatchResult schema. If
   * validation fails, logs detailed error information and throws an AIError
   * with type VALIDATION_ERROR.
   *
   * This validates that:
   * - Response contains an "answers" array
   * - Each answer has questionId, answer (YES/NO), confidence (0-100), and reasoning
   * - All required fields are present and correctly typed
   *
   * @param rawResponse - Raw response from AI provider (unknown type)
   * @returns Validated question batch result (just the answers array)
   * @throws {AIError} If validation fails (type: VALIDATION_ERROR)
   *
   * @example
   * ```typescript
   * try {
   *   const result = validator.validateQuestionBatchResponse(apiResponse);
   *   // result.answers is guaranteed to be a valid array of AIAnswer objects
   *   for (const answer of result.answers) {
   *     console.log(`${answer.questionId}: ${answer.answer} (${answer.confidence}%)`);
   *   }
   * } catch (error) {
   *   if (error instanceof AIError) {
   *     console.error('Validation failed:', error.message);
   *   }
   * }
   * ```
   */
  validateQuestionBatchResponse(rawResponse: unknown): { answers: Array<{
    questionId: string;
    answer: 'YES' | 'NO';
    confidence: number;
    reasoning: string;
  }> } {
    console.log('[Validator] Validating question batch response:', {
      hasAnswersArray: typeof rawResponse === 'object' && rawResponse !== null && 'answers' in rawResponse && Array.isArray((rawResponse as any).answers),
      answersCount: typeof rawResponse === 'object' && rawResponse !== null && 'answers' in rawResponse && Array.isArray((rawResponse as any).answers) ? (rawResponse as any).answers.length : 0
    });

    try {
      // Parse response using Zod schema
      const parsed = AIQuestionBatchResultSchema.parse(rawResponse);

      // After validation
      console.log('[Validator] Validation passed:', {
        answersValidated: parsed.answers.length,
        allAnswersValid: parsed.answers.every(a =>
          ['YES', 'NO'].includes(a.answer) &&
          a.confidence >= 0 &&
          a.confidence <= 100
        )
      });

      return parsed;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Extract correlation ID if present in response for logging
        const correlationId =
          typeof rawResponse === 'object' &&
          rawResponse !== null &&
          'correlationId' in rawResponse
            ? String(rawResponse.correlationId)
            : undefined;

        // Format Zod errors into readable message
        const errorMessage = this.formatZodError(error);

        // Log detailed validation failure for debugging
        console.error('[Validator] Validation failed:', {
          error: errorMessage,
          responsePreview: JSON.stringify(rawResponse).substring(0, 200)
        });

        console.error('AI question batch response validation failed', {
          errors: error.issues,
          rawResponse: JSON.stringify(rawResponse, null, 2),
          correlationId,
        });

        // Throw AIError with validation error type
        throw new AIError(
          AIErrorType.VALIDATION_ERROR,
          `AI question batch response validation failed: ${errorMessage}`,
          undefined,
          correlationId
        );
      }
      // Re-throw non-Zod errors
      throw error;
    }
  }

  /**
   * Format Zod validation errors into readable message
   *
   * Converts Zod error structure into a human-readable string showing
   * field paths and expected types.
   *
   * @param error - Zod validation error
   * @returns Formatted error message
   * @private
   */
  private formatZodError(error: z.ZodError): string {
    return error.issues
      .map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      })
      .join('; ');
  }
}

/**
 * Singleton instance of AIResponseValidator
 *
 * Use this instance throughout the application for consistent validation behavior.
 *
 * @example
 * ```typescript
 * import { aiResponseValidator } from './ai/validator.js';
 *
 * const result = aiResponseValidator.validate(response);
 * ```
 */
export const aiResponseValidator = new AIResponseValidator();
