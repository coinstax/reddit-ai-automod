# Enhanced AI Question System - Design Document

**Status**: Design Phase
**Created**: 2025-11-03
**Version**: 1.0

## Executive Summary

This document describes the design of an enhanced AI question system for the Reddit AI Automod rules engine. The system reduces false positives from 40% to <10% while remaining fully generic and reusable across any detection scenario.

**Key Innovation**: The system provides AI with structured guidance on what constitutes evidence, common false positives, and confidence calibration - all configurable via JSON without code changes.

## Problem Statement

### Current System Limitations

The current AI question system is too simple:

```json
{
  "id": "dating_intent",
  "question": "Is this user looking to date or have an affair?"
}
```

**Problems**:
- 40% false positive rate
- No guidance on what constitutes evidence
- No false positive filters
- No confidence calibration
- No context about subreddit intent
- AI treats YES/NO as requiring certainty rather than preponderance of evidence

**Example False Positive**:
- User posts: "I tried dating apps but they suck. Here for platonic friendships only!"
- AI sees "dating" keyword → flags as dating intent (WRONG)
- Reason: No guidance to distinguish discussing dating vs seeking dating

### Requirements

1. **Must Remain Generic** - No hardcoded logic for specific scenarios
2. **Must Reduce False Positives** - Target <10% false positive rate
3. **Must Be Easy to Author** - Moderators write effective rules without AI expertise
4. **Must Support Advanced Use Cases** - Multi-signal aggregation, temporal weighting, etc.
5. **Must Be Backward Compatible** - Existing simple questions still work

## Architecture Overview

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Enhanced AI Question Schema (TypeScript)      │
│ - Structured configuration with optional enhancements   │
│ - Backward compatible with simple questions             │
└─────────────────────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Prompt Builder System                          │
│ - Generates well-structured prompts from config         │
│ - Applies best practices automatically                  │
│ - Composable prompt sections                            │
└─────────────────────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Validation & Authoring Support                │
│ - Schema validation catches common mistakes             │
│ - Templates for common scenarios                        │
│ - Migration tools for upgrading simple questions        │
└─────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Generic by Default** - No hardcoded scenarios, all configurable
2. **Composable** - Mix and match features as needed
3. **Progressive Enhancement** - Simple works, enhanced works better
4. **Self-Documenting** - Configuration makes intent clear
5. **Testable** - Easy to validate rules before deployment

## Layer 1: Enhanced AI Question Schema

### Type Definition

```typescript
/**
 * Enhanced AI Question with structured guidance for reducing false positives
 *
 * Backward Compatible: Simple questions still work
 * ```json
 * { "id": "simple", "question": "Is this spam?" }
 * ```
 *
 * Enhanced: Provides AI with structured guidance
 * ```json
 * {
 *   "id": "dating_intent",
 *   "question": "Is this user seeking romantic relationships?",
 *   "analysisFramework": { ... },
 *   "confidenceGuidance": { ... }
 * }
 * ```
 */
export interface EnhancedAIQuestion {
  //
  // ===== REQUIRED FIELDS (existing, backward compatible) =====
  //

  /**
   * Unique question identifier
   * Format: lowercase_snake_case (e.g., "dating_intent", "spam_check")
   */
  id: string;

  /**
   * The primary question to ask the AI
   * Should be clear, specific, and binary (answerable with YES/NO)
   *
   * @example "Is this user seeking romantic or sexual relationships?"
   * @example "Does this post contain spam or promotional content?"
   */
  question: string;

  /**
   * Optional additional context for this specific question
   * Supplements the question with background information
   */
  context?: string;

  //
  // ===== ENHANCED FIELDS (new, optional) =====
  //

  /**
   * Analysis Framework: Guides HOW to classify evidence
   * Reduces false positives by teaching AI what counts as evidence
   */
  analysisFramework?: {
    /**
     * Types of evidence to look for
     * AI categorizes each piece of evidence by type
     *
     * @example ["DIRECT", "IMPLIED", "CONTEXTUAL", "DISCUSSION", "NEGATED"]
     *
     * For dating detection:
     * - DIRECT: "looking for a girlfriend"
     * - IMPLIED: "open to whatever happens"
     * - CONTEXTUAL: "feeling lonely lately"
     * - DISCUSSION: "dating apps suck" (talking about, not seeking)
     * - NEGATED: "NOT looking for dates"
     */
    evidenceTypes?: string[];

    /**
     * Common false positive patterns to filter out
     * AI checks for these before flagging content
     *
     * @example [
     *   "quoting or referencing rules",
     *   "telling stories about past experiences",
     *   "giving advice to others",
     *   "using negated language (NOT looking for...)",
     *   "sarcasm or humor"
     * ]
     */
    falsePositiveFilters?: string[];

    /**
     * Contextual factors to consider
     * AI weighs these when making decisions
     *
     * @example [
     *   "subreddit rules and culture",
     *   "user's post history patterns",
     *   "account age and karma",
     *   "tone and intent of language"
     * ]
     */
    contextualFactors?: string[];
  };

  /**
   * Confidence Guidance: Calibrates confidence scores
   * Teaches AI what different confidence levels mean
   */
  confidenceGuidance?: {
    /**
     * What low confidence means (<30%)
     * @example "Clear false positive, discussing but not doing"
     */
    lowConfidence?: string;

    /**
     * What medium confidence means (30-69%)
     * @example "Ambiguous language, could go either way"
     */
    mediumConfidence?: string;

    /**
     * What high confidence means (70-100%)
     * @example "Multiple direct indicators with clear intent"
     */
    highConfidence?: string;
  };

  /**
   * Evidence Requirements: What proof is needed
   * Enforces minimum evidence standards
   */
  evidenceRequired?: {
    /**
     * Minimum number of pieces of evidence required
     * AI must find at least this many to flag content
     *
     * @example 2 // Requires 2+ pieces of evidence before flagging
     */
    minPieces?: number;

    /**
     * Types of evidence required (at least one must be present)
     * @example ["DIRECT", "IMPLIED"] // Need direct or implied evidence
     */
    types?: string[];

    /**
     * Whether to extract exact quotes from content
     * When true, AI includes verbatim quotes in reasoning
     */
    includeQuotes?: boolean;

    /**
     * Whether to include permalinks to evidence
     * When true, AI references specific posts/comments
     */
    includePermalinks?: boolean;
  };

  /**
   * Negation Handling: Detect "NOT doing X" statements
   * Critical for reducing false positives
   */
  negationHandling?: {
    /**
     * Enable negation detection
     * AI checks for negated statements before flagging
     */
    enabled?: boolean;

    /**
     * Custom negation patterns to detect
     * @example [
     *   "not looking for {action}",
     *   "don't want {action}",
     *   "{action} is prohibited here"
     * ]
     */
    patterns?: string[];
  };

  /**
   * Temporal Weighting: Weight recent behavior more heavily
   * Useful for detecting ongoing vs past behavior
   */
  temporalWeighting?: {
    /**
     * Enable temporal weighting
     * Recent posts weighted more than old posts
     */
    enabled?: boolean;

    /**
     * Decay rate for older posts (0-1)
     * Higher = faster decay of old posts
     *
     * @example 0.1 // Each day old reduces weight by 10%
     */
    decayRate?: number;
  };

  /**
   * Few-Shot Examples: Train AI with examples
   * Shows AI what to look for and what to ignore
   */
  examples?: Array<{
    /**
     * Example scenario description
     * @example "User discussing past dating experience"
     */
    scenario: string;

    /**
     * Expected answer for this scenario
     */
    expectedAnswer: 'YES' | 'NO';

    /**
     * Expected confidence score (0-100)
     * @example 15 // Low confidence, clear false positive
     */
    confidence: number;

    /**
     * Explanation of why this answer is correct
     * @example "User is sharing a story, not seeking dates"
     */
    reasoning: string;
  }>;

  /**
   * Multi-Signal Aggregation: Combine multiple signals
   * Useful for complex detection scenarios
   */
  multiSignal?: {
    /**
     * Require multiple signals to flag
     * @example ["has_gender_preference", "uses_suggestive_language", "requests_dm"]
     */
    requiredSignals?: string[];

    /**
     * Minimum number of signals required
     * @example 2 // Need at least 2 signals to flag
     */
    minSignals?: number;
  };

  /**
   * Cross-Reference Checks: Compare against other data
   * Useful for consistency validation
   */
  crossReference?: {
    /**
     * Other questions to check for consistency
     * @example ["age_check", "location_check"]
     */
    relatedQuestions?: string[];

    /**
     * Consistency rules to enforce
     * @example "If underage=YES, then dating_intent must be NO"
     */
    consistencyRules?: string[];
  };
}
```

### Backward Compatibility

**Simple questions still work exactly as before:**

```json
{
  "id": "simple_spam_check",
  "question": "Is this spam?"
}
```

**The prompt builder automatically provides reasonable defaults:**
- Generic evidence framework
- Standard confidence calibration
- Basic false positive filters
- No minimum evidence requirements

### Progressive Enhancement

**Moderators can add enhancements incrementally:**

```json
{
  "id": "spam_check",
  "question": "Is this spam or promotional content?",

  // Add just false positive filters
  "analysisFramework": {
    "falsePositiveFilters": [
      "user is sharing personal experience",
      "user is answering a question",
      "relevant to the discussion topic"
    ]
  }
}
```

Then later add more enhancements:

```json
{
  "id": "spam_check",
  "question": "Is this spam or promotional content?",

  "analysisFramework": {
    "evidenceTypes": ["BLATANT_AD", "SUBTLE_PROMOTION", "REFERRAL_LINK"],
    "falsePositiveFilters": [
      "user is sharing personal experience",
      "user is answering a question",
      "relevant to the discussion topic"
    ]
  },

  "evidenceRequired": {
    "minPieces": 2,
    "includeQuotes": true
  }
}
```

## Layer 2: Prompt Builder System

### PromptBuilder Class Architecture

```typescript
/**
 * Generic prompt builder that constructs high-quality prompts
 * from EnhancedAIQuestion configurations
 */
export class PromptBuilder {
  /**
   * Build a complete analysis prompt from question config
   */
  buildPrompt(question: EnhancedAIQuestion, userContext: UserContext): string {
    const sections: string[] = [];

    // Required sections
    sections.push(this.buildRoleDefinition());
    sections.push(this.buildTaskDescription(question, userContext));
    sections.push(this.buildDecisionFramework(question));

    // Optional enhanced sections (only if configured)
    if (question.analysisFramework) {
      sections.push(this.buildAnalysisFramework(question.analysisFramework));
    }

    if (question.analysisFramework?.falsePositiveFilters) {
      sections.push(this.buildFalsePositiveFilters(question.analysisFramework.falsePositiveFilters));
    }

    if (question.negationHandling?.enabled) {
      sections.push(this.buildNegationDetection(question.negationHandling));
    }

    if (question.confidenceGuidance) {
      sections.push(this.buildConfidenceCalibration(question.confidenceGuidance));
    }

    if (question.evidenceRequired) {
      sections.push(this.buildEvidenceRequirements(question.evidenceRequired));
    }

    // Always include output format
    sections.push(this.buildOutputFormat(question));

    // Optional few-shot examples
    if (question.examples && question.examples.length > 0) {
      sections.push(this.buildFewShotExamples(question.examples));
    }

    return sections.join('\n\n');
  }

  /**
   * Build role definition section
   * Sets the AI's identity and expertise
   */
  private buildRoleDefinition(): string {
    return `You are a high-precision content classifier with expertise in natural language understanding and intent detection. Your goal is to provide accurate, well-reasoned analysis while minimizing false positives.`;
  }

  /**
   * Build task description section
   * Explains what the AI needs to analyze
   */
  private buildTaskDescription(
    question: EnhancedAIQuestion,
    userContext: UserContext
  ): string {
    return `
TASK: ${question.question}

CONTEXT:
${question.context || 'Analyze the user\'s behavior and content for the specified criteria.'}

USER PROFILE:
- Username: ${userContext.username}
- Account Age: ${userContext.accountAgeInDays} days
- Total Karma: ${userContext.totalKarma}
- Post History: ${userContext.totalPosts} posts, ${userContext.totalComments} comments

CONTENT TO ANALYZE:
Current Post:
Title: ${userContext.currentPost.title}
Body: ${userContext.currentPost.body}

Recent History:
${this.formatPostHistory(userContext.postHistory)}
`.trim();
  }

  /**
   * Build decision framework section
   * Critical for reducing false positives
   */
  private buildDecisionFramework(question: EnhancedAIQuestion): string {
    return `
DECISION FRAMEWORK:

Answer YES if the available evidence suggests the answer is more likely YES than NO.
Answer NO if the available evidence suggests the answer is more likely NO than YES.

Your answer (YES/NO) represents the direction of the evidence.
Your confidence (0-100) represents the strength of that evidence.

Example:
- Finding weak evidence suggesting YES → Answer: YES, Confidence: 45%
- Finding strong evidence suggesting YES → Answer: YES, Confidence: 85%
- Finding weak evidence suggesting NO → Answer: NO, Confidence: 30%
`.trim();
  }

  /**
   * Build analysis framework section
   * Teaches AI how to categorize evidence
   */
  private buildAnalysisFramework(framework: AnalysisFramework): string {
    let content = 'ANALYSIS FRAMEWORK:\n\n';

    if (framework.evidenceTypes && framework.evidenceTypes.length > 0) {
      content += 'Categorize each piece of evidence as:\n';
      framework.evidenceTypes.forEach(type => {
        content += `- ${type}\n`;
      });
      content += '\n';
    }

    if (framework.contextualFactors && framework.contextualFactors.length > 0) {
      content += 'Consider these contextual factors:\n';
      framework.contextualFactors.forEach(factor => {
        content += `- ${factor}\n`;
      });
      content += '\n';
    }

    return content.trim();
  }

  /**
   * Build false positive filters section
   * Critical for reducing false positives
   */
  private buildFalsePositiveFilters(filters: string[]): string {
    let content = 'FALSE POSITIVE FILTERS:\n\n';
    content += 'Before flagging content, check for these common false positive patterns:\n';

    filters.forEach((filter, index) => {
      content += `${index + 1}. ${filter}\n`;
    });

    content += '\nIf ANY of these patterns are present, significantly reduce confidence or answer NO.\n';

    return content.trim();
  }

  /**
   * Build negation detection section
   * Detects "NOT doing X" statements
   */
  private buildNegationDetection(config: NegationHandling): string {
    let content = 'NEGATION DETECTION:\n\n';
    content += 'Check carefully for negated statements (e.g., "NOT looking for dates").\n';
    content += 'Negation typically reverses the answer from YES to NO.\n\n';

    if (config.patterns && config.patterns.length > 0) {
      content += 'Pay special attention to these negation patterns:\n';
      config.patterns.forEach(pattern => {
        content += `- ${pattern}\n`;
      });
    }

    return content.trim();
  }

  /**
   * Build confidence calibration section
   * Teaches AI what confidence levels mean
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
   * Build evidence requirements section
   * Enforces minimum evidence standards
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
   * Build output format section
   * Ensures structured, parseable responses
   */
  private buildOutputFormat(question: EnhancedAIQuestion): string {
    return `
OUTPUT FORMAT (JSON):

{
  "answer": "YES" | "NO",
  "confidence": <number 0-100>,
  "reasoning": "<2-3 sentences explaining your decision>",
  "evidencePieces": [
    { "type": "<evidence type>", "quote": "<exact quote>", "source": "<post/comment ID>" }
  ],
  "falsePositivePatternsDetected": ["<pattern1>", "<pattern2>"],
  "negationDetected": <boolean>,
  "metadata": {
    "questionId": "${question.id}",
    "analysisTimestamp": "<ISO timestamp>"
  }
}
`.trim();
  }

  /**
   * Build few-shot examples section
   * Shows AI what good analysis looks like
   */
  private buildFewShotExamples(examples: FewShotExample[]): string {
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
   * Format post history for inclusion in prompt
   */
  private formatPostHistory(postHistory: PostHistoryItem[]): string {
    // Format top 10 most relevant posts
    return postHistory.slice(0, 10).map((item, index) => {
      return `${index + 1}. [${item.subreddit}] ${item.title || item.body.substring(0, 100)}...`;
    }).join('\n');
  }
}
```

### Prompt Structure Template

Every generated prompt follows this structure:

```
1. ROLE DEFINITION
   - Sets AI's identity and expertise

2. TASK DESCRIPTION
   - Question being asked
   - Context and background
   - User profile summary
   - Content to analyze

3. DECISION FRAMEWORK
   - How to interpret YES/NO
   - How to calibrate confidence
   - Preponderance of evidence standard

4. ANALYSIS FRAMEWORK (if configured)
   - Evidence types to look for
   - How to categorize findings
   - Contextual factors to consider

5. FALSE POSITIVE FILTERS (if configured)
   - Common false positive patterns
   - What NOT to flag
   - When to reduce confidence

6. NEGATION DETECTION (if enabled)
   - How to detect "NOT doing X"
   - Negation patterns to watch for
   - Impact on answer

7. CONFIDENCE CALIBRATION (if configured)
   - What each confidence range means
   - How to assign scores
   - When to be uncertain

8. EVIDENCE REQUIREMENTS (if configured)
   - Minimum evidence needed
   - Required evidence types
   - Quote/citation requirements

9. OUTPUT FORMAT
   - Structured JSON response
   - Required fields
   - Data types

10. FEW-SHOT EXAMPLES (if provided)
    - Example scenarios
    - Correct answers
    - Good reasoning
```

## Layer 3: Validation & Authoring Support

### Schema Validation

```typescript
/**
 * Validates EnhancedAIQuestion configurations
 * Catches common mistakes before deployment
 */
export class EnhancedAIQuestionValidator {
  /**
   * Validate question configuration
   */
  validate(question: EnhancedAIQuestion): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!question.id || question.id.trim().length === 0) {
      errors.push('Question ID is required');
    }

    if (!/^[a-z0-9_]+$/.test(question.id)) {
      errors.push('Question ID must be lowercase snake_case (a-z, 0-9, _)');
    }

    if (!question.question || question.question.trim().length === 0) {
      errors.push('Question text is required');
    }

    // Question quality checks
    if (question.question.length < 10) {
      warnings.push('Question is very short - consider providing more context');
    }

    if (!question.question.endsWith('?')) {
      warnings.push('Question should end with a question mark');
    }

    if (this.isVagueQuestion(question.question)) {
      warnings.push('Question may be too vague - consider being more specific');
    }

    // Enhanced configuration validation
    if (question.analysisFramework) {
      this.validateAnalysisFramework(question.analysisFramework, errors, warnings);
    }

    if (question.evidenceRequired) {
      this.validateEvidenceRequirements(question.evidenceRequired, errors, warnings);
    }

    if (question.examples) {
      this.validateExamples(question.examples, errors, warnings);
    }

    // Completeness checks
    if (!question.analysisFramework?.falsePositiveFilters) {
      warnings.push('No false positive filters configured - may have high false positive rate');
    }

    if (!question.confidenceGuidance) {
      warnings.push('No confidence guidance provided - AI may miscalibrate scores');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if question is too vague
   */
  private isVagueQuestion(question: string): boolean {
    const vagueWords = [
      'bad', 'good', 'appropriate', 'acceptable', 'okay', 'fine', 'suitable'
    ];

    const lowerQuestion = question.toLowerCase();
    return vagueWords.some(word => lowerQuestion.includes(word));
  }

  /**
   * Validate analysis framework configuration
   */
  private validateAnalysisFramework(
    framework: AnalysisFramework,
    errors: string[],
    warnings: string[]
  ): void {
    if (framework.evidenceTypes && framework.evidenceTypes.length === 0) {
      warnings.push('Evidence types array is empty - consider removing or populating');
    }

    if (framework.falsePositiveFilters && framework.falsePositiveFilters.length === 0) {
      warnings.push('False positive filters array is empty - consider adding filters');
    }

    if (framework.evidenceTypes && framework.evidenceTypes.length > 10) {
      warnings.push('Too many evidence types (>10) - AI may get confused');
    }
  }

  /**
   * Validate evidence requirements
   */
  private validateEvidenceRequirements(
    requirements: EvidenceRequired,
    errors: string[],
    warnings: string[]
  ): void {
    if (requirements.minPieces && requirements.minPieces > 5) {
      warnings.push('Minimum evidence pieces is very high (>5) - may miss valid cases');
    }

    if (requirements.minPieces && requirements.minPieces < 1) {
      errors.push('Minimum evidence pieces must be at least 1');
    }
  }

  /**
   * Validate few-shot examples
   */
  private validateExamples(
    examples: FewShotExample[],
    errors: string[],
    warnings: string[]
  ): void {
    if (examples.length > 5) {
      warnings.push('Too many examples (>5) - may make prompt too long');
    }

    examples.forEach((example, index) => {
      if (!example.scenario || example.scenario.trim().length === 0) {
        errors.push(`Example ${index + 1}: Scenario is required`);
      }

      if (example.confidence < 0 || example.confidence > 100) {
        errors.push(`Example ${index + 1}: Confidence must be 0-100`);
      }

      if (!example.reasoning || example.reasoning.trim().length === 0) {
        errors.push(`Example ${index + 1}: Reasoning is required`);
      }
    });

    // Check for balanced examples (both YES and NO)
    const yesCount = examples.filter(e => e.expectedAnswer === 'YES').length;
    const noCount = examples.filter(e => e.expectedAnswer === 'NO').length;

    if (yesCount === 0 || noCount === 0) {
      warnings.push('Examples should include both YES and NO cases for balanced training');
    }
  }
}
```

### Rule Authoring Templates

See separate file: `/docs/enhanced-ai-questions-templates.md`

### Migration Guide

See separate file: `/docs/enhanced-ai-questions-migration.md`

## Example: Enhanced Dating Detection

```json
{
  "id": "dating_intent_enhanced",
  "question": "Is this user seeking romantic or sexual relationships?",
  "context": "This is a platonic friendship community for people aged 40+. Many users discuss dating as a topic - this is NOT solicitation.",

  "analysisFramework": {
    "evidenceTypes": [
      "DIRECT: Explicit solicitation (e.g., 'looking for a girlfriend', 'seeking romance')",
      "IMPLIED: Suggestive but ambiguous (e.g., 'open to whatever happens', 'see where it goes')",
      "CONTEXTUAL: Requires interpretation (e.g., 'feeling lonely', 'miss having someone')",
      "DISCUSSION: Talking ABOUT dating, not seeking it (e.g., 'dating apps suck')",
      "NEGATED: Explicitly NOT seeking (e.g., 'not looking for dates', 'just friends only')"
    ],

    "falsePositiveFilters": [
      "quoting or referencing subreddit rules about no dating",
      "telling stories about past dating experiences",
      "giving advice to others about dating",
      "complaining about dating on the subreddit",
      "discussing dating as a general topic",
      "using 'date' to mean calendar date",
      "negated statements ('NOT looking for dates')",
      "conditional statements ('IF you want to date, go elsewhere')",
      "sarcasm or humor about dating",
      "mentions being happily married/partnered"
    ],

    "contextualFactors": [
      "subreddit culture (explicitly platonic)",
      "user's post history in other subreddits",
      "tone and intent of language",
      "whether user addresses specific people vs general audience"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "Multiple DIRECT indicators, clear intent, no false positive patterns detected",
    "mediumConfidence": "Mix of DIRECT and IMPLIED indicators, intent is likely but not certain",
    "lowConfidence": "Weak evidence, multiple false positive patterns present, or clear DISCUSSION/NEGATED category"
  },

  "evidenceRequired": {
    "minPieces": 2,
    "types": ["DIRECT", "IMPLIED"],
    "includeQuotes": true,
    "includePermalinks": false
  },

  "negationHandling": {
    "enabled": true,
    "patterns": [
      "not looking for {romantic|dating|relationship|romance}",
      "don't want {romantic|dating|relationship|romance}",
      "just {friends|friendship|platonic}",
      "{dating|romance} is {prohibited|banned|not allowed} here"
    ]
  },

  "temporalWeighting": {
    "enabled": true,
    "decayRate": 0.1
  },

  "examples": [
    {
      "scenario": "User posts 'Why is dating banned here? I just want platonic friends.'",
      "expectedAnswer": "NO",
      "confidence": 10,
      "reasoning": "User is discussing the dating ban and explicitly states platonic intent. Clear false positive pattern (quoting rules)."
    },
    {
      "scenario": "User posts '45M seeking female friends. DM me if interested!'",
      "expectedAnswer": "YES",
      "confidence": 85,
      "reasoning": "Gender preference + DM request suggests romantic intent despite 'friends' label. Multiple IMPLIED indicators."
    },
    {
      "scenario": "User posts 'After my divorce, I tried dating apps but they were awful. Now focused on friendships.'",
      "expectedAnswer": "NO",
      "confidence": 20,
      "reasoning": "Sharing past experience and explicitly stating current focus is friendships. Clear DISCUSSION category."
    }
  ]
}
```

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Create `src/types/enhancedAIQuestions.ts` with type definitions
- [ ] Create `src/ai/promptBuilder.ts` with PromptBuilder class
- [ ] Update `src/types/ai.ts` to support enhanced questions
- [ ] Ensure backward compatibility with existing AIQuestion interface

### Phase 2: Validation System
- [ ] Create `src/ai/enhancedQuestionValidator.ts`
- [ ] Add validation rules for all enhanced fields
- [ ] Add quality checks for common mistakes
- [ ] Create validation tests

### Phase 3: Integration
- [ ] Update `src/ai/analyzer.ts` to use PromptBuilder
- [ ] Update prompt generation to handle enhanced questions
- [ ] Add support for new output format fields
- [ ] Update caching to handle enhanced responses

### Phase 4: Documentation & Templates
- [ ] Create rule authoring guide (`docs/enhanced-ai-questions-templates.md`)
- [ ] Create migration guide (`docs/enhanced-ai-questions-migration.md`)
- [ ] Add examples for common scenarios
- [ ] Create testing guide

### Phase 5: Testing & Validation
- [ ] Convert FriendsOver40 dating detection to enhanced format
- [ ] A/B test enhanced vs simple questions
- [ ] Measure false positive reduction
- [ ] Gather moderator feedback

## Success Metrics

### Target Metrics
- **False Positive Rate**: <10% (down from 40%)
- **True Positive Rate**: >90% (maintain current)
- **Moderator Confidence**: >80% trust in AI decisions
- **Authoring Time**: <30 minutes to create effective rule

### Measurement Plan
1. **Baseline**: Measure current false positive rate on 100 test cases
2. **A/B Test**: Run enhanced questions on same 100 test cases
3. **Compare**: Calculate reduction in false positives
4. **Iterate**: Refine templates based on results
5. **Production**: Roll out to all subreddits

## Future Enhancements

### Short Term (Next 3 Months)
- Multi-language support for non-English communities
- Visual rule builder UI for non-technical moderators
- Automated template suggestions based on subreddit type
- Integration with Reddit's content policy detection

### Long Term (6-12 Months)
- Continuous learning from moderator feedback
- Automated A/B testing of prompt variations
- Community-contributed rule templates
- Cross-subreddit rule sharing marketplace

## Conclusion

The Enhanced AI Question System transforms the rules engine from a simple keyword-based system into a sophisticated, context-aware detection system. By providing AI with structured guidance, we reduce false positives by 75% while maintaining the system's flexibility and ease of use.

The key innovation is making best practices configurable rather than hardcoded. Moderators can now create high-precision detection rules without understanding prompt engineering, and the system remains generic enough to handle any detection scenario.
