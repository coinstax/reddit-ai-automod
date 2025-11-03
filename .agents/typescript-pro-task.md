# TypeScript Implementation Task: Enhanced Rule Schema Validation

## Context

You are implementing enhanced rule schema validation for the Reddit AI Automod project's Enhanced AI Questions system. The validator needs to support new optional fields while maintaining 100% backward compatibility with existing simple questions.

## Current Implementation

File: `src/rules/schemaValidator.ts`

The current validator (lines 404-425) only validates basic AI question fields:
- `ai.id` - required
- `ai.question` - required

## Enhanced Fields to Validate (All Optional)

From `src/types/ai.ts`, the `EnhancedAIQuestion` interface includes these optional enhancement fields:

1. **confidenceGuidance** - Calibration guidance for AI confidence scores
2. **analysisFramework** - Evidence types and false positive filters
3. **evidenceRequired** - Minimum evidence standards
4. **negationHandling** - Negation detection configuration
5. **examples** - Few-shot learning examples

## Requirements

### 1. Add Enhanced Field Validation Method

Add a new private static method `validateEnhancedAIFields` that validates all enhanced fields when present.

**Location**: After existing `validateSchema` method

**Signature**:
```typescript
/**
 * Validate enhanced AI question fields
 *
 * Checks optional enhanced fields when present. All enhanced fields
 * are optional for backward compatibility.
 *
 * @param rule - Rule to validate
 * @param rulePrefix - Prefix for warning messages
 * @param warnings - Array to append warnings to
 * @private
 */
private static validateEnhancedAIFields(
  rule: any,
  rulePrefix: string,
  warnings: string[]
): void
```

**Implementation Requirements**:

1. **Only validate if `rule.ai` exists** - skip if no AI field
2. **All fields are optional** - no warnings if fields are missing
3. **Validate structure when present** - only warn on clear errors
4. **Use helper methods** - delegate to specific validators for each field type

### 2. Add Field-Specific Validator Methods

Create private static helper methods for each enhanced field type:

```typescript
private static validateConfidenceGuidance(
  cg: any,
  rulePrefix: string,
  warnings: string[]
): void {
  // Validate that at least one confidence level is defined
  if (!cg.lowConfidence && !cg.mediumConfidence && !cg.highConfidence) {
    warnings.push(
      `${rulePrefix}: confidenceGuidance provided but no confidence levels defined`
    );
  }
}

private static validateAnalysisFramework(
  af: any,
  rulePrefix: string,
  warnings: string[]
): void {
  // Validate evidenceTypes is array if provided
  if (af.evidenceTypes && !Array.isArray(af.evidenceTypes)) {
    warnings.push(
      `${rulePrefix}: analysisFramework.evidenceTypes must be an array`
    );
  }

  // Validate falsePositiveFilters is array if provided
  if (af.falsePositiveFilters && !Array.isArray(af.falsePositiveFilters)) {
    warnings.push(
      `${rulePrefix}: analysisFramework.falsePositiveFilters must be an array`
    );
  }
}

private static validateEvidenceRequired(
  er: any,
  rulePrefix: string,
  warnings: string[]
): void {
  // Validate minPieces is positive if provided
  if (er.minPieces !== undefined && er.minPieces < 1) {
    warnings.push(
      `${rulePrefix}: evidenceRequired.minPieces must be at least 1`
    );
  }

  // Validate types is array if provided
  if (er.types && !Array.isArray(er.types)) {
    warnings.push(
      `${rulePrefix}: evidenceRequired.types must be an array`
    );
  }
}

private static validateNegationHandling(
  nh: any,
  rulePrefix: string,
  warnings: string[]
): void {
  // Validate enabled is boolean
  if (typeof nh.enabled !== 'boolean') {
    warnings.push(
      `${rulePrefix}: negationHandling.enabled must be a boolean`
    );
  }

  // Validate patterns is array if provided
  if (nh.patterns && !Array.isArray(nh.patterns)) {
    warnings.push(
      `${rulePrefix}: negationHandling.patterns must be an array`
    );
  }
}

private static validateFewShotExamples(
  examples: any,
  rulePrefix: string,
  warnings: string[]
): void {
  // Validate examples is array
  if (!Array.isArray(examples)) {
    warnings.push(
      `${rulePrefix}: examples must be an array`
    );
    return;
  }

  // Validate each example has required fields
  examples.forEach((ex, i) => {
    if (!ex.scenario) {
      warnings.push(
        `${rulePrefix}: examples[${i}] missing 'scenario' field`
      );
    }
    if (!ex.expectedAnswer) {
      warnings.push(
        `${rulePrefix}: examples[${i}] missing 'expectedAnswer' field`
      );
    }
    if (ex.confidence !== undefined && (ex.confidence < 0 || ex.confidence > 100)) {
      warnings.push(
        `${rulePrefix}: examples[${i}] confidence must be between 0-100`
      );
    }
  });
}
```

### 3. Integrate into validateSchema Method

Add a call to `validateEnhancedAIFields` in the `validateSchema` method after the existing AI validation (after line 424):

```typescript
// Validate enhanced AI question fields (optional)
this.validateEnhancedAIFields(rule, rulePrefix, warnings);
```

## Validation Principles

1. **Backward Compatible**: Simple questions without enhanced fields MUST pass validation with no warnings
2. **Permissive**: Only warn on clear structural errors (wrong types, invalid ranges)
3. **Helpful**: Warning messages should include field path and what's wrong
4. **Optional**: All enhanced fields are optional - no warnings if omitted
5. **Type-Safe**: Use proper TypeScript types (no `any` in function signatures visible to callers)

## Success Criteria

1. **Simple questions work unchanged**:
   ```json
   {
     "type": "AI",
     "ai": {
       "id": "dating_check",
       "question": "Is this user seeking romantic relationships?"
     }
   }
   ```
   Result: No warnings

2. **Valid enhanced questions pass**:
   ```json
   {
     "type": "AI",
     "ai": {
       "id": "dating_check",
       "question": "Is this user seeking romantic relationships?",
       "confidenceGuidance": {
         "highConfidence": "Explicit solicitation with contact info"
       },
       "evidenceRequired": {
         "minPieces": 2
       }
     }
   }
   ```
   Result: No warnings

3. **Invalid enhanced fields produce helpful warnings**:
   ```json
   {
     "type": "AI",
     "ai": {
       "id": "dating_check",
       "question": "Is this user seeking romantic relationships?",
       "evidenceRequired": {
         "minPieces": 0
       }
     }
   }
   ```
   Result: Warning "evidenceRequired.minPieces must be at least 1"

## Code Style Requirements

- Follow existing code style in `schemaValidator.ts`
- Add comprehensive JSDoc comments for all new methods
- Use descriptive variable names
- Keep methods focused and single-purpose
- Maintain alphabetical ordering of methods where possible

## Files to Modify

- `src/rules/schemaValidator.ts` - Add validation methods and integrate

## Files to Reference

- `src/types/ai.ts` - Type definitions for EnhancedAIQuestion
- `docs/enhanced-ai-questions-design.md` - Full design specification

## Implementation Steps

1. Add the main `validateEnhancedAIFields` method
2. Add all five field-specific validator methods
3. Integrate the call into `validateSchema` method
4. Add comprehensive JSDoc comments
5. Ensure TypeScript compiles with no errors
6. Follow existing patterns in the file

## Important Notes

- DO NOT modify existing validation logic for basic AI fields
- DO NOT add validation that would break existing simple questions
- All enhanced fields are OPTIONAL - never require them
- Warning messages should be clear and actionable
- Use the existing `warnings` array pattern consistently

Please implement this now.
