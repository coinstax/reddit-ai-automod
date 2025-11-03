# Enhanced AI Questions - Migration Guide

**Version**: 1.0
**Last Updated**: 2025-11-03
**Audience**: Developers and moderators upgrading existing rules

## Table of Contents

1. [Overview](#overview)
2. [Backward Compatibility](#backward-compatibility)
3. [Migration Strategy](#migration-strategy)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Testing Migration](#testing-migration)
6. [Rollback Plan](#rollback-plan)

## Overview

### What's Changing?

The Enhanced AI Question system extends the existing `AIQuestion` interface with optional fields that provide AI with better guidance. This reduces false positives from ~40% to <10%.

**Key Changes**:
- ✅ **Backward Compatible**: Existing simple questions work unchanged
- ✅ **Optional Enhancement**: Add new features incrementally
- ✅ **No Breaking Changes**: Old rules continue to work
- ✅ **Gradual Migration**: Migrate rules one at a time

### Should You Migrate?

**Migrate if**:
- You're experiencing >20% false positive rate
- Users complain about incorrect flagging
- You want more control over AI decisions
- You need to explain AI reasoning to users

**Don't migrate if**:
- Current rules work well (<10% false positives)
- You haven't deployed rules yet (use enhanced from start)
- You don't have time to test and iterate

## Backward Compatibility

### Existing Simple Questions Still Work

**Old Format** (still valid):
```json
{
  "id": "dating_check",
  "question": "Is this user looking to date?"
}
```

**What Happens**:
1. PromptBuilder detects it's a simple question
2. Applies reasonable default enhancements automatically
3. Generates a prompt with basic false positive protection
4. Returns results in the same format

**No code changes required** - existing rules continue working.

### Automatic Defaults for Simple Questions

Simple questions automatically get:

```typescript
// Automatically applied defaults
{
  analysisFramework: {
    evidenceTypes: ["DIRECT", "IMPLIED", "DISCUSSION"],
    falsePositiveFilters: [
      "discussing the topic rather than engaging in it",
      "quoting rules or guidelines",
      "sharing past experiences in past tense",
      "giving advice to others in third person"
    ],
    contextualFactors: [
      "subreddit rules and community norms",
      "user's post history and patterns",
      "tone and intent of language"
    ]
  },

  confidenceGuidance: {
    highConfidence: "Multiple direct indicators with clear intent",
    mediumConfidence: "Some indicators present but ambiguous",
    lowConfidence: "Weak or contradictory evidence"
  },

  negationHandling: {
    enabled: true,
    patterns: ["not {action}", "don't {action}", "never {action}"]
  }
}
```

## Migration Strategy

### Recommended Approach: Incremental Migration

**Phase 1: Identify High-Priority Rules**
- Rules with highest false positive rates
- Rules that generate most user complaints
- Rules used most frequently

**Phase 2: Migrate One Rule at a Time**
- Convert one rule to enhanced format
- Test thoroughly (100+ posts)
- Compare old vs new performance
- Iterate based on results

**Phase 3: Gradual Rollout**
- Deploy enhanced rule in dry-run mode
- Monitor for 1 week
- Compare metrics to old rule
- Switch to production if improved

**Phase 4: Full Migration**
- Migrate remaining rules
- Retire old simple format rules
- Document lessons learned

### Alternative Approach: A/B Testing

Run both versions simultaneously:

```json
{
  "rules": [
    {
      "id": "dating_check_v1",
      "question": "Is this user looking to date?",
      "weight": 0.5
    },
    {
      "id": "dating_check_v2",
      "question": "Is this user seeking romantic relationships?",
      "analysisFramework": { /* enhanced config */ },
      "weight": 0.5
    }
  ]
}
```

After 1 week, compare:
- False positive rates
- True positive rates
- Moderator satisfaction
- User feedback

Keep the better performer.

## Step-by-Step Migration

### Step 1: Audit Current Rule

Before migrating, document current performance:

```markdown
Rule: dating_check
Current Question: "Is this user looking to date?"

Performance Metrics (last 30 days):
- Total analyzed: 450 posts
- Flagged as violations: 87 posts
- True positives: 52 posts (60%)
- False positives: 35 posts (40%)
- Missed violations: ~8 posts

Common False Positives:
1. Users discussing dating in past tense (12 cases)
2. Users quoting "no dating" rule (8 cases)
3. Users giving dating advice (7 cases)
4. Humor/sarcasm about dating (5 cases)
5. Mentions being married (3 cases)

Common Missed Violations:
1. Subtle gender preferences (3 cases)
2. "Open to anything" language (2 cases)
3. Request for DMs without explicit romance (3 cases)
```

### Step 2: Identify Needed Enhancements

Based on audit, determine which enhancements address your issues:

**For High False Positives** → Add:
- False positive filters
- Evidence requirements (min 2 pieces)
- Negation handling
- Few-shot examples

**For Missed Violations** → Add:
- More evidence types
- Contextual factors
- Multi-signal aggregation

### Step 3: Create Enhanced Version

**Old Rule**:
```json
{
  "id": "dating_check",
  "question": "Is this user looking to date?"
}
```

**Enhanced Version**:
```json
{
  "id": "dating_check_v2",
  "question": "Is this user seeking romantic or sexual relationships?",
  "context": "This is a platonic friendship community. Distinguish between discussing dating and seeking dates.",

  "analysisFramework": {
    "evidenceTypes": [
      "DIRECT: Explicit solicitation",
      "IMPLIED: Suggestive language",
      "DISCUSSION: Talking about dating (NOT seeking)",
      "NEGATED: Explicitly NOT seeking"
    ],

    "falsePositiveFilters": [
      "discussing dating in past tense",
      "quoting 'no dating' rule",
      "giving dating advice to others",
      "humor or sarcasm about dating",
      "mentions being married or partnered"
    ],

    "contextualFactors": [
      "subreddit culture (platonic)",
      "first person present vs past tense",
      "gender preferences (red flag if specified)",
      "request for private contact"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "Multiple DIRECT indicators (gender preference + solicitation + DM request), no false positive patterns",
    "mediumConfidence": "IMPLIED indicators (suggestive language) but could be platonic",
    "lowConfidence": "DISCUSSION or NEGATED category, clear false positive patterns"
  },

  "evidenceRequired": {
    "minPieces": 2,
    "types": ["DIRECT", "IMPLIED"],
    "includeQuotes": true
  },

  "negationHandling": {
    "enabled": true,
    "patterns": [
      "not looking for dates",
      "don't want romance",
      "just friends only",
      "platonic only"
    ]
  },

  "examples": [
    {
      "scenario": "User posts 'Tried dating apps in the past but they're awful. Now just looking for platonic friends!'",
      "expectedAnswer": "NO",
      "confidence": 15,
      "reasoning": "Past tense + explicit 'platonic' statement. DISCUSSION + NEGATED. False positive pattern: past tense dating experience."
    },
    {
      "scenario": "User posts '45M seeking female friends for coffee and deep conversations. Open to seeing where things naturally go.'",
      "expectedAnswer": "YES",
      "confidence": 80,
      "reasoning": "Gender preference + 'where things go' suggests romantic possibility. IMPLIED evidence despite 'friends' label."
    }
  ]
}
```

### Step 4: Validate Configuration

Run the enhanced question through the validator:

```typescript
import { EnhancedAIQuestionValidator } from './validator.js';

const validator = new EnhancedAIQuestionValidator();
const result = validator.validate(enhancedQuestion);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
  // Fix errors before proceeding
}

if (result.warnings.length > 0) {
  console.warn('Validation warnings:', result.warnings);
  // Review warnings, address if needed
}
```

### Step 5: Test on Historical Data

Test enhanced question on last 100 posts:

```typescript
// Test script
const testCases = await loadHistoricalPosts(100);
const results = {
  truePositives: 0,
  falsePositives: 0,
  trueNegatives: 0,
  falseNegatives: 0
};

for (const testCase of testCases) {
  const aiResult = await analyzeWithEnhancedQuestion(
    enhancedQuestion,
    testCase.userProfile,
    testCase.postHistory,
    testCase.currentPost
  );

  // Compare AI result to actual outcome
  const actualViolation = testCase.wasActualViolation;
  const aiSaidViolation = aiResult.answer === 'YES' && aiResult.confidence >= 70;

  if (actualViolation && aiSaidViolation) {
    results.truePositives++;
  } else if (!actualViolation && aiSaidViolation) {
    results.falsePositives++;
  } else if (!actualViolation && !aiSaidViolation) {
    results.trueNegatives++;
  } else {
    results.falseNegatives++;
  }
}

// Calculate metrics
const precision = results.truePositives / (results.truePositives + results.falsePositives);
const recall = results.truePositives / (results.truePositives + results.falseNegatives);
const falsePositiveRate = results.falsePositives / (results.falsePositives + results.trueNegatives);

console.log({
  precision: `${(precision * 100).toFixed(1)}%`,
  recall: `${(recall * 100).toFixed(1)}%`,
  falsePositiveRate: `${(falsePositiveRate * 100).toFixed(1)}%`
});

// Target metrics:
// - Precision: >90%
// - Recall: >85%
// - False Positive Rate: <10%
```

### Step 6: Deploy in Dry-Run Mode

Deploy enhanced rule with `dryRun: true`:

```json
{
  "rule": {
    "id": "dating_check_v2",
    "aiQuestion": { /* enhanced question */ },
    "action": "FLAG",
    "dryRun": true  // Log actions but don't execute
  }
}
```

Monitor for 1 week:
- Review all flagged posts
- Check if any violations were missed
- Gather moderator feedback

### Step 7: Compare Performance

After 1 week, compare old vs new:

| Metric | Old Rule | Enhanced Rule | Change |
|--------|----------|---------------|--------|
| False Positive Rate | 40% | 8% | -80% ✅ |
| True Positive Rate | 92% | 94% | +2% ✅ |
| Mod Confidence | 65% | 88% | +23% ✅ |
| User Complaints | 12/week | 2/week | -83% ✅ |

### Step 8: Production Deployment

If metrics improved:

1. **Switch enhanced rule to production**
   ```json
   {
     "rule": {
       "id": "dating_check_v2",
       "dryRun": false  // Execute actions
     }
   }
   ```

2. **Disable old rule**
   ```json
   {
     "rule": {
       "id": "dating_check",
       "enabled": false  // Deprecated
     }
   }
   ```

3. **Monitor closely for 48 hours**
   - Watch for unexpected issues
   - Be ready to rollback if needed

4. **Archive old rule**
   - Keep for reference
   - Document why it was replaced

## Testing Migration

### Test Suite for Enhanced Questions

Create comprehensive test suite before migration:

```typescript
describe('Enhanced Dating Detection Rule', () => {
  const enhancedQuestion = loadEnhancedQuestion('dating_check_v2');

  describe('False Positive Prevention', () => {
    test('should NOT flag user discussing past dating', async () => {
      const result = await testRule(enhancedQuestion, {
        post: {
          title: "Dating apps in my 20s were terrible",
          body: "I tried online dating when I was younger but it never worked out. Now I'm happily married and just looking for platonic friendships here!"
        }
      });

      expect(result.answer).toBe('NO');
      expect(result.confidence).toBeLessThan(30);
    });

    test('should NOT flag user quoting rules', async () => {
      const result = await testRule(enhancedQuestion, {
        post: {
          title: "Reminder about Rule 3",
          body: "Please remember Rule 3: No dating or romantic solicitation. This is a platonic friendship community."
        }
      });

      expect(result.answer).toBe('NO');
      expect(result.confidence).toBeLessThan(20);
    });

    test('should NOT flag user giving dating advice', async () => {
      const result = await testRule(enhancedQuestion, {
        post: {
          title: "Dating advice for those who asked",
          body: "For those asking about dating over 40 - try hobby groups, volunteer work, or community events. Not here though, this is for friendships!"
        }
      });

      expect(result.answer).toBe('NO');
      expect(result.confidence).toBeLessThan(25);
    });
  });

  describe('True Positive Detection', () => {
    test('should flag explicit dating solicitation', async () => {
      const result = await testRule(enhancedQuestion, {
        post: {
          title: "45M seeking female companion",
          body: "Single guy looking for a woman 35-50 for coffee, walks, and seeing where things naturally lead. DM me if interested!"
        }
      });

      expect(result.answer).toBe('YES');
      expect(result.confidence).toBeGreaterThan(85);
      expect(result.evidencePieces).toHaveLength(3);
    });

    test('should flag subtle dating language', async () => {
      const result = await testRule(enhancedQuestion, {
        post: {
          title: "Looking for friends",
          body: "New to town, prefer female company as I connect better. Open-minded, enjoy deep conversations and chemistry."
        }
      });

      expect(result.answer).toBe('YES');
      expect(result.confidence).toBeGreaterThan(70);
    });
  });

  describe('Edge Cases', () => {
    test('should handle ambiguous language appropriately', async () => {
      const result = await testRule(enhancedQuestion, {
        post: {
          title: "New here, looking to connect",
          body: "Just moved to the area, hoping to make some friends. Open to all types of connections and experiences!"
        }
      });

      // Should be uncertain - not enough evidence either way
      expect(result.confidence).toBeGreaterThan(40);
      expect(result.confidence).toBeLessThan(70);
    });
  });
});
```

### Metrics to Track

**Before Migration**:
- False positive rate
- True positive rate
- Average confidence score
- Moderator time spent reviewing
- User complaint rate

**After Migration**:
- Same metrics for comparison
- A/B test results if applicable
- Moderator satisfaction survey
- User feedback sentiment

### Success Criteria

Migration is successful if:
- ✅ False positive rate reduced by >50%
- ✅ True positive rate maintained (>85%)
- ✅ Moderator confidence increased
- ✅ User complaints decreased
- ✅ No unexpected bugs or issues

## Rollback Plan

### When to Rollback

Rollback if:
- False positive rate increases
- Too many violations are missed
- AI gives nonsensical results
- Moderators lose confidence
- Critical bugs discovered

### How to Rollback

**Option 1: Quick Rollback** (production issue)

```bash
# Immediately disable enhanced rule
redis-cli HSET rules:dating_check_v2:enabled false

# Re-enable old rule
redis-cli HSET rules:dating_check:enabled true
```

**Option 2: Graceful Rollback** (performance issues)

1. Switch enhanced rule to dry-run mode
2. Re-enable old rule for production
3. Investigate issues with enhanced rule
4. Fix and redeploy when ready

**Option 3: A/B Rollback** (if A/B testing)

```json
{
  "rules": [
    {
      "id": "dating_check",
      "weight": 1.0  // Increase old rule weight to 100%
    },
    {
      "id": "dating_check_v2",
      "weight": 0.0  // Decrease enhanced rule weight to 0%
    }
  ]
}
```

### Post-Rollback

After rolling back:
1. Document what went wrong
2. Analyze why enhanced rule underperformed
3. Fix issues in test environment
4. Re-test thoroughly before attempting migration again

## Migration Checklist

### Pre-Migration
- [ ] Audit current rule performance
- [ ] Identify specific issues to fix
- [ ] Create enhanced version
- [ ] Validate configuration
- [ ] Write test suite
- [ ] Test on historical data (100+ posts)
- [ ] Achieve success criteria in tests

### During Migration
- [ ] Deploy in dry-run mode
- [ ] Monitor for 1 week
- [ ] Gather moderator feedback
- [ ] Compare metrics to old rule
- [ ] Fix any issues discovered

### Production Deployment
- [ ] Switch to production mode
- [ ] Disable old rule
- [ ] Monitor closely for 48 hours
- [ ] Document any issues
- [ ] Rollback if needed

### Post-Migration
- [ ] Archive old rule
- [ ] Update documentation
- [ ] Share results with team
- [ ] Plan next rule migration

## Common Migration Issues

### Issue: Enhanced Rule Has HIGHER False Positives

**Cause**: Usually overly broad evidence types or insufficient false positive filters

**Fix**:
```json
{
  "analysisFramework": {
    "falsePositiveFilters": [
      // Add more filters based on what's being flagged incorrectly
      "pattern 1",
      "pattern 2"
    ]
  },
  "evidenceRequired": {
    "minPieces": 2  // Require more evidence before flagging
  }
}
```

### Issue: Enhanced Rule Misses Violations

**Cause**: Too restrictive evidence requirements or overly aggressive false positive filters

**Fix**:
```json
{
  "evidenceRequired": {
    "minPieces": 1,  // Lower requirement
    "types": ["DIRECT", "IMPLIED", "CONTEXTUAL"]  // Expand types
  }
}
```

### Issue: Confidence Scores Too Low/High

**Cause**: Poor confidence calibration

**Fix**:
```json
{
  "confidenceGuidance": {
    "highConfidence": "Be more specific about what constitutes high confidence",
    "mediumConfidence": "Be more specific about what constitutes medium confidence",
    "lowConfidence": "Be more specific about what constitutes low confidence"
  },
  "examples": [
    // Add examples with target confidence scores
  ]
}
```

### Issue: AI Reasoning Doesn't Match Decision

**Cause**: Question or evidence types are confusing the AI

**Fix**:
- Simplify evidence type descriptions
- Add few-shot examples showing correct reasoning
- Clarify question wording

## Next Steps

After successfully migrating one rule:

1. **Document lessons learned**
   - What worked well?
   - What was challenging?
   - What would you do differently?

2. **Share with team**
   - Success metrics
   - Migration process
   - Best practices discovered

3. **Migrate next rule**
   - Apply lessons learned
   - Use same process
   - Continue incremental approach

4. **Build template library**
   - Save successful configurations
   - Create reusable patterns
   - Share with community

---

**Remember**: Migration is incremental and reversible. Test thoroughly, monitor closely, and don't hesitate to rollback if needed. Success is measured by improved performance, not speed of migration.
