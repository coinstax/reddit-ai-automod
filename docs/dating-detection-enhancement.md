# Dating/Affair Detection Enhancement Strategy

**Problem**: High false positive rate in dating/affair detection for r/FriendsOver40
**Author**: AI Automod Analysis Team
**Date**: 2025-11-03
**Status**: Analysis Complete

---

## Executive Summary

The current dating/affair detection system generates excessive false positives by flagging legitimate discussions about dating, rule quotes, past tense stories, advice-giving, and even calendar dates. This document presents a comprehensive solution combining prompt engineering best practices, linguistic pattern analysis, and multi-stage filtering to achieve **high precision** (minimize false positives) while maintaining reasonable recall.

---

## Table of Contents

1. [Research Findings](#1-research-findings)
2. [Enhanced Prompt Design](#2-enhanced-prompt-design)
3. [Prefilter Strategy](#3-prefilter-strategy)
4. [Threshold Recommendations](#4-threshold-recommendations)
5. [Implementation Plan](#5-implementation-plan)
6. [Testing Strategy](#6-testing-strategy)
7. [Monitoring Plan](#7-monitoring-plan)

---

## 1. Research Findings

### 1.1 Prompt Engineering Best Practices

#### Chain-of-Thought with Evidence Requirements
**Finding**: Requiring step-by-step reasoning with explicit evidence citation dramatically reduces false positives.

**Best Practice**:
- Force the AI to quote specific text that supports its conclusion
- Require distinguishing between direct evidence vs inference
- Use structured output with separate fields for evidence and reasoning

#### Few-Shot Learning vs Zero-Shot
**Finding**: Few-shot examples are critical for nuanced classification tasks like dating detection.

**Recommendation**: Use 3-5 carefully selected examples showing:
- Clear positives (actual dating solicitation)
- Clear negatives (discussion about dating)
- Edge cases (advice-giving, rule-quoting)

#### Confidence Calibration
**Finding**: LLMs tend to be overconfident. Explicit calibration instructions improve accuracy.

**Best Practice**:
```
Confidence Guidelines:
- 90-100%: Direct, unambiguous solicitation with multiple indicators
- 70-89%: Strong indicators but some ambiguity
- 50-69%: Mixed signals, unclear intent
- Below 50%: Likely false positive, do not flag
```

### 1.2 False Positive Reduction Strategies

#### Linguistic Pattern Analysis
**Key Discriminators**:

| Pattern | Active Solicitation | Discussion About |
|---------|-------------------|------------------|
| Person | First person ("I am looking") | Third person ("People who are looking") |
| Tense | Present/Future ("seeking", "want to") | Past ("I was dating", "tried dating apps") |
| Mood | Imperative/Desires ("DM me", "hoping to find") | Indicative/Descriptive ("dating is hard") |
| Context | Personal availability | General observations |

#### Negation and Conditional Handling
**Critical Finding**: Many false positives come from negated statements.

**Examples**:
- ❌ False Positive: "I'm NOT looking for dates"
- ❌ False Positive: "If you're looking for dating, this isn't the place"
- ✅ Correct: Detect and handle negation patterns

### 1.3 Reddit-Specific Considerations

#### Post Structure Patterns
**Solicitation Posts**:
- Title often contains "looking for", "seeking", age/gender markers
- Body focuses on personal attributes and preferences
- Often includes contact preferences (DM, chat, discord)
- May crosspost to multiple communities

**Discussion Posts**:
- Title asks questions or states opinions
- Body contains stories, advice requests, or observations
- References external content (articles, other posts)
- Engages with community rules or meta-discussions

#### Subreddit Context
**Critical**: r/FriendsOver40 explicitly prohibits dating, leading to:
- Users quoting rules ("No dating allowed here")
- Moderators explaining policies
- Meta-discussions about the dating ban
- Comparisons to dating subreddits

### 1.4 Multi-Item Aggregation Best Practices

#### Evidence Weighting Framework
```
Strong Evidence (Weight: 1.0):
- Direct solicitation in current post
- Multiple dating posts in history
- Profile explicitly mentions "single and looking"

Moderate Evidence (Weight: 0.5):
- Subtle romantic interest hints
- Single dating-related post in history
- Focus on opposite gender preferences

Weak Evidence (Weight: 0.2):
- Mentions being single (without solicitation)
- Posts in dating subs asking for advice
- Uses romantic language metaphorically

Negative Evidence (Weight: -0.5):
- Explicitly states not looking for dates
- Criticizes dating in the subreddit
- Identifies as happily married/partnered
```

---

## 2. Enhanced Prompt Design

### The Enhanced Prompt

```
You are a high-precision content classifier specializing in detecting ACTUAL dating/romantic/sexual solicitation in online communities.

CRITICAL CONTEXT:
You are analyzing posts in r/{subreddit}, a FRIENDSHIP community that explicitly prohibits dating/romantic content. Many users discuss dating as a topic or quote rules - this is NOT solicitation.

USER PROFILE:
- Username: {username}
- Account age: {accountAge} days
- Total karma: {totalKarma}
- Email verified: {emailVerified}

POST HISTORY ANALYSIS:
Review the last 100 posts/comments for patterns:
{postHistory}

CURRENT POST:
Title: {title}
Body: {body}

CLASSIFICATION FRAMEWORK:

STEP 1 - Evidence Collection:
Identify and quote exact phrases that could indicate dating intent. For each quote, categorize as:
- DIRECT: Explicit solicitation ("looking for a girlfriend", "seeking romance", "want to date")
- IMPLIED: Suggestive but ambiguous ("open to whatever happens", "see where it goes")
- CONTEXTUAL: Requires interpretation ("feeling lonely", "miss having someone")
- DISCUSSION: Talking ABOUT dating, not seeking it ("dating apps suck", "when I was dating")
- NEGATED: Explicitly NOT seeking ("not looking for dates", "just friends only")

STEP 2 - Intent Analysis:
For each piece of evidence, determine:
- PERSON: First person (I/me) vs Third person (they/people)
- TENSE: Present intent vs Past experience
- PURPOSE: Seeking connection vs Sharing experience/opinion
- AUDIENCE: Addressing potential matches vs General discussion

STEP 3 - False Positive Filters:
Check for these common false positive patterns:
□ Quoting or referencing subreddit rules about no dating
□ Telling stories about past dating experiences
□ Giving advice to others about dating
□ Complaining about dating on the subreddit
□ Discussing dating as a general topic
□ Using "date" to mean calendar date
□ Negated statements ("NOT looking for dates")
□ Conditional statements ("IF you want to date, go elsewhere")
□ Sarcasm or humor about dating
□ Mentions being happily married/partnered

STEP 4 - Confidence Calibration:
- 90-100%: Multiple DIRECT indicators, clear intent, no false positive patterns
- 70-89%: Mix of DIRECT and IMPLIED indicators, intent is likely
- 50-69%: Mostly IMPLIED/CONTEXTUAL, ambiguous intent
- 30-49%: Weak evidence, multiple false positive patterns present
- 0-29%: Clear false positive, discussing but not seeking

REQUIRED OUTPUT FORMAT:
{
  "classification": {
    "is_soliciting": boolean,
    "confidence": number (0-100),
    "primary_evidence": "exact quote that best supports decision",
    "evidence_type": "DIRECT|IMPLIED|CONTEXTUAL|DISCUSSION|NEGATED"
  },
  "evidence_analysis": {
    "direct_indicators": ["quote1", "quote2"],
    "implied_indicators": ["quote3"],
    "contextual_indicators": ["quote4"],
    "false_positive_patterns": ["pattern detected"],
    "negating_factors": ["factor1", "factor2"]
  },
  "linguistic_analysis": {
    "person": "first|third|mixed",
    "tense": "present|past|future|mixed",
    "purpose": "seeking|discussing|advising|complaining",
    "has_negation": boolean,
    "has_conditionals": boolean
  },
  "reasoning": "2-3 sentences explaining the classification decision",
  "action_recommendation": "APPROVE|MONITOR|FLAG|REMOVE"
}

ACTION GUIDELINES:
- APPROVE: Confidence < 50% OR clear false positive patterns
- MONITOR: Confidence 50-69%, ambiguous intent
- FLAG: Confidence 70-89%, likely solicitation for human review
- REMOVE: Confidence 90%+, clear solicitation with direct evidence
```

### Few-Shot Examples for the Prompt

```
EXAMPLE 1 - Clear Solicitation (REMOVE):
Title: "45M seeking female friends"
Body: "Single guy here, looking to connect with women 35-50. I'm romantic, love long walks, and deep conversations. DM me if interested!"

Classification: is_soliciting: true, confidence: 95
Evidence: "seeking female friends", "Single guy", "looking to connect with women 35-50", "DM me if interested"
Reasoning: Multiple direct indicators of romantic intent, gender preference stated, requesting private contact.

EXAMPLE 2 - Discussion About Dating (APPROVE):
Title: "Why is dating banned here?"
Body: "I keep seeing people trying to date in this sub. Don't they know the rules say 'no dating or romantic solicitation'? It's annoying when you just want platonic friends."

Classification: is_soliciting: false, confidence: 10
Evidence: Quotes rules, complains about others dating, explicitly wants "platonic friends"
Reasoning: User is discussing the dating ban and criticizing others who violate it, not seeking dates themselves.

EXAMPLE 3 - Past Experience Story (APPROVE):
Title: "Finally comfortable being single"
Body: "After my divorce 2 years ago, I tried dating apps but they were awful. Now I'm focused on friendships and hobbies. Much happier!"

Classification: is_soliciting: false, confidence: 20
Evidence: Past tense "tried dating apps", "Now I'm focused on friendships"
Reasoning: Sharing past experience and explicitly stating current focus is friendships, not romance.

EXAMPLE 4 - Subtle/Ambiguous (MONITOR):
Title: "New to town, looking to meet people"
Body: "Just moved here, don't know anyone. Open-minded person, love coffee and good conversation. Would enjoy getting to know locals!"

Classification: is_soliciting: false, confidence: 55
Evidence: No explicit romantic intent, but "open-minded" and individual meeting focus could be suggestive
Reasoning: Ambiguous language that could be platonic or romantic. Needs monitoring but not enough evidence to flag.

EXAMPLE 5 - Hidden Intent (FLAG):
Title: "Coffee buddy wanted"
Body: "Looking for someone to explore coffee shops with. I'm 42M, prefer female company as I connect better. Just two people enjoying good coffee and seeing where things go naturally."

Classification: is_soliciting: true, confidence: 75
Evidence: "prefer female company", "seeing where things go naturally"
Reasoning: Gender preference and open-ended intentions suggest romantic possibility despite surface-level platonic framing.
```

---

## 3. Prefilter Strategy

### Three-Stage Filtering Pipeline

#### Stage 1: Quick Regex Prefilter (Before AI)
```javascript
// High-precision patterns that warrant AI analysis
const DATING_SIGNALS = {
  // Strong signals (any match → check with AI)
  strong: [
    /\b(looking for|seeking|want to find).{0,20}(woman|women|lady|ladies|female|man|men|male|guy)/i,
    /\b(single|divorced|widowed|separated).{0,20}(looking|seeking|ready|available)/i,
    /\bDM me if.{0,30}interested\b/i,
    /\bopen to.{0,20}(romance|romantic|relationship|dating|love)/i,
    /\b(chemistry|spark|connection|vibe).{0,20}(between us|with someone)/i,
  ],

  // Moderate signals (need 2+ matches → check with AI)
  moderate: [
    /\b(prefer|looking for).{0,20}(female|male|women|men)/i,
    /\bsingle (m|f|male|female|man|woman)\b/i,
    /\b(attractive|handsome|beautiful|cute|sexy)\b/i,
    /\b(coffee|drinks?|dinner|lunch).{0,20}(together|with me|date)/i,
    /\bget to know.{0,20}(you|each other|someone)/i,
  ],

  // Exclusion patterns (skip AI if only these exist)
  exclude: [
    /\b(not|never|don't|doesn't|won't|no).{0,20}(looking for|seeking|want).{0,20}(dates?|romance|relationship)/i,
    /\brules?.{0,30}(say|state|prohibit|ban).{0,30}dating/i,
    /\b(husband|wife|partner|spouse|married).{0,20}(and I|loves|supports)/i,
    /\bplatonic.{0,20}(friends|friendship|only)/i,
  ]
};

function shouldAnalyzeForDating(text) {
  const combined = `${title} ${body}`.toLowerCase();

  // Check exclusions first
  if (DATING_SIGNALS.exclude.some(pattern => pattern.test(combined))) {
    return false; // Skip AI analysis
  }

  // Check strong signals
  if (DATING_SIGNALS.strong.some(pattern => pattern.test(combined))) {
    return true; // Analyze with AI
  }

  // Check moderate signals (need 2+)
  const moderateMatches = DATING_SIGNALS.moderate.filter(pattern =>
    pattern.test(combined)
  ).length;

  return moderateMatches >= 2;
}
```

#### Stage 2: Context Enhancement
```javascript
// Add metadata to help AI understand context
function enhanceContext(post, userHistory) {
  return {
    ...post,
    metadata: {
      hasDatingSubActivity: userHistory.datingSubreddits?.length > 0,
      accountAgeCategory: getAgeCategory(userProfile.accountAge),
      karmaCategory: getKarmaCategory(userProfile.karma),
      previousRemovalsForDating: userHistory.removals?.filter(r =>
        r.reason.includes('dating')
      ).length || 0,
      isReplyingToThread: post.parentId !== null,
      threadContext: post.parentId ? getParentContext(post.parentId) : null
    }
  };
}
```

#### Stage 3: Post-AI Validation
```javascript
// Final sanity check after AI classification
function validateAIDecision(aiResult, post) {
  // Override AI if clear false positive patterns
  const text = `${post.title} ${post.body}`.toLowerCase();

  // Strong negation should override AI
  if (aiResult.classification.is_soliciting &&
      /\bnot looking for.{0,10}(dates?|romance|relationship)/i.test(text)) {
    return {
      ...aiResult,
      classification: {
        ...aiResult.classification,
        is_soliciting: false,
        confidence: Math.min(30, aiResult.classification.confidence),
        override_reason: "Strong negation pattern detected"
      }
    };
  }

  // Mod/admin discussing rules should never be flagged
  if (post.authorIsMod && text.includes('dating') && text.includes('rule')) {
    return {
      ...aiResult,
      classification: {
        ...aiResult.classification,
        is_soliciting: false,
        confidence: 0,
        override_reason: "Moderator discussing rules"
      }
    };
  }

  return aiResult;
}
```

---

## 4. Threshold Recommendations

### Evidence-Based Threshold System

#### Primary Thresholds
```javascript
const THRESHOLDS = {
  // Action thresholds
  autoRemove: 90,      // Only the clearest cases
  autoFlag: 70,        // Likely violations for review
  monitor: 50,         // Ambiguous, track patterns
  approve: 0,          // Below 50% = approve

  // Evidence requirements
  minEvidencePieces: {
    autoRemove: 3,     // Need 3+ pieces of direct evidence
    autoFlag: 2,       // Need 2+ pieces of evidence (direct or implied)
    monitor: 1         // Need at least 1 piece of evidence
  },

  // Confidence adjustments based on user history
  historyAdjustments: {
    previousViolation: +10,    // Increase confidence if prior violations
    trustedUser: -20,          // Decrease confidence for established users
    modApproved: -30,          // Decrease confidence for approved users
    newAccount: +5             // Slight increase for brand new accounts
  }
};
```

#### Multi-Post Aggregation
```javascript
function aggregateMultipleAnalyses(analyses) {
  // Weight recent posts more heavily
  const weights = analyses.map((a, i) =>
    Math.exp(-i * 0.1) // Exponential decay
  );

  // Calculate weighted confidence
  const weightedConfidence = analyses.reduce((sum, analysis, i) =>
    sum + (analysis.confidence * weights[i]), 0
  ) / weights.reduce((a, b) => a + b, 0);

  // Count strong evidence across all posts
  const strongEvidenceCount = analyses.filter(a =>
    a.evidence_type === 'DIRECT'
  ).length;

  // Decision logic
  if (strongEvidenceCount >= 2 || weightedConfidence >= 85) {
    return 'FLAG';
  } else if (strongEvidenceCount >= 1 || weightedConfidence >= 60) {
    return 'MONITOR';
  } else {
    return 'APPROVE';
  }
}
```

### Recommended Settings by Subreddit Type

| Subreddit Type | Auto-Remove | Auto-Flag | Monitor | Note |
|---------------|-------------|-----------|---------|------|
| Strict Friendship (r/FriendsOver40) | 95% | 75% | 50% | High precision critical |
| General Community | 90% | 70% | 50% | Balanced approach |
| Mixed Purpose | 85% | 65% | 45% | More permissive |

---

## 5. Implementation Plan

### Phase 1: Prompt Enhancement (Week 1)
1. **Update AI Prompts**
   - Implement enhanced prompt with chain-of-thought
   - Add few-shot examples
   - Deploy confidence calibration

2. **Update Data Structures**
   - Extend AIAnalysisResult to include evidence arrays
   - Add linguistic analysis fields
   - Track evidence types

### Phase 2: Prefilter Implementation (Week 2)
1. **Create Prefilter Module**
   ```typescript
   // src/filters/datingPrefilter.ts
   export class DatingPrefilter {
     private strongPatterns: RegExp[];
     private moderatePatterns: RegExp[];
     private excludePatterns: RegExp[];

     shouldAnalyze(post: RedditPost): boolean;
     enhanceContext(post: RedditPost): EnhancedPost;
   }
   ```

2. **Integration Points**
   - Add to rule evaluation pipeline
   - Skip AI for excluded patterns
   - Enhance context for included patterns

### Phase 3: Threshold System (Week 3)
1. **Create Threshold Manager**
   ```typescript
   // src/moderation/thresholdManager.ts
   export class ThresholdManager {
     getThresholds(subreddit: string): ThresholdConfig;
     adjustForUserHistory(base: number, user: UserProfile): number;
     aggregateAnalyses(analyses: AIAnalysisResult[]): ModerationDecision;
   }
   ```

2. **Configuration UI**
   - Add threshold settings to mod tools
   - Per-subreddit customization
   - Visual threshold tester

### Phase 4: Validation Layer (Week 4)
1. **Post-Processing Validator**
   ```typescript
   // src/validators/aiDecisionValidator.ts
   export class AIDecisionValidator {
     validate(result: AIAnalysisResult, post: RedditPost): AIAnalysisResult;
     checkFalsePositivePatterns(text: string): FalsePositiveMatch[];
     applyOverrides(result: AIAnalysisResult, overrides: Override[]): AIAnalysisResult;
   }
   ```

2. **Override System**
   - Moderator overrides for specific patterns
   - Learning from corrections
   - Pattern library management

---

## 6. Testing Strategy

### A/B Testing Framework
```javascript
class ABTestManager {
  constructor() {
    this.variants = {
      control: { prompt: CURRENT_PROMPT, weight: 0.5 },
      enhanced: { prompt: ENHANCED_PROMPT, weight: 0.5 }
    };
  }

  assignVariant(userId) {
    // Consistent assignment based on user ID hash
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    const bucket = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
    return bucket < 0.5 ? 'control' : 'enhanced';
  }

  trackResult(variant, result, groundTruth) {
    // Record accuracy, false positive/negative rates
    this.metrics[variant].total++;
    if (result === groundTruth) {
      this.metrics[variant].correct++;
    } else if (result && !groundTruth) {
      this.metrics[variant].falsePositives++;
    } else if (!result && groundTruth) {
      this.metrics[variant].falseNegatives++;
    }
  }
}
```

### Test Dataset Creation
1. **Collect Samples** (100+ posts each category):
   - Clear dating solicitation
   - Subtle/ambiguous intent
   - Dating discussions (false positives)
   - Rule quotes (false positives)
   - Past tense stories (false positives)

2. **Manual Labeling**:
   - 3 moderators independently label
   - Resolve disagreements through discussion
   - Document edge cases

3. **Validation Metrics**:
   - Precision: TP / (TP + FP) - **Target: >90%**
   - Recall: TP / (TP + FN) - **Target: >70%**
   - F1 Score: 2 * (Precision * Recall) / (Precision + Recall)
   - False Positive Rate: FP / (FP + TN) - **Target: <10%**

### Integration Testing
```javascript
describe('Dating Detection System', () => {
  test('should not flag rule quotations', async () => {
    const post = {
      title: "Please read the rules",
      body: "The rules clearly state 'no dating or romantic solicitation allowed'"
    };
    const result = await analyzer.analyze(post);
    expect(result.classification.is_soliciting).toBe(false);
    expect(result.classification.confidence).toBeLessThan(30);
  });

  test('should detect subtle solicitation', async () => {
    const post = {
      title: "Coffee companion wanted",
      body: "42M looking for female coffee buddy, see where things go naturally"
    };
    const result = await analyzer.analyze(post);
    expect(result.classification.is_soliciting).toBe(true);
    expect(result.classification.confidence).toBeGreaterThan(70);
  });

  test('should handle negation correctly', async () => {
    const post = {
      title: "New member introduction",
      body: "Just to be clear, I'm NOT looking for dates or romance, purely platonic"
    };
    const result = await analyzer.analyze(post);
    expect(result.classification.is_soliciting).toBe(false);
  });
});
```

---

## 7. Monitoring Plan

### Key Metrics Dashboard

#### Real-Time Metrics
```javascript
class ModerationMetrics {
  track(decision) {
    // Core metrics
    this.metrics.totalAnalyzed++;
    this.metrics.byAction[decision.action]++;
    this.metrics.averageConfidence = updateMovingAverage(
      this.metrics.averageConfidence,
      decision.confidence
    );

    // False positive indicators
    if (decision.wasAppealed) {
      this.metrics.appeals.total++;
      if (decision.appealSuccess) {
        this.metrics.appeals.successful++;
        this.analyzeFalsePositive(decision);
      }
    }

    // Pattern tracking
    if (decision.evidence_type) {
      this.metrics.evidenceTypes[decision.evidence_type]++;
    }
  }

  getFalsePositiveRate() {
    return this.metrics.appeals.successful / this.metrics.totalAnalyzed;
  }

  getConfidenceDistribution() {
    return {
      high: this.metrics.byConfidence['90-100'] / this.metrics.totalAnalyzed,
      medium: this.metrics.byConfidence['70-89'] / this.metrics.totalAnalyzed,
      low: this.metrics.byConfidence['50-69'] / this.metrics.totalAnalyzed,
      veryLow: this.metrics.byConfidence['0-49'] / this.metrics.totalAnalyzed
    };
  }
}
```

#### Weekly Analysis Reports
1. **False Positive Analysis**
   - Most common false positive patterns
   - Phrases causing incorrect classification
   - User categories most affected

2. **Performance Metrics**
   - Classification accuracy trend
   - API costs per classification
   - Processing time distribution

3. **Moderator Feedback Loop**
   - Override patterns
   - Common correction types
   - Suggested prompt improvements

### Alerting Thresholds
```javascript
const ALERTS = {
  falsePositiveRate: {
    warning: 0.15,  // 15% FP rate
    critical: 0.25  // 25% FP rate
  },
  appealRate: {
    warning: 0.10,  // 10% of decisions appealed
    critical: 0.20  // 20% of decisions appealed
  },
  confidenceAnomaly: {
    // Alert if average confidence drops significantly
    threshold: 0.20 // 20% drop from baseline
  }
};
```

### Continuous Improvement Process
1. **Weekly Review**
   - Analyze false positive patterns
   - Update exclusion patterns
   - Refine few-shot examples

2. **Monthly Optimization**
   - Retrain thresholds based on data
   - A/B test prompt variations
   - Update evidence weights

3. **Quarterly Assessment**
   - Full accuracy audit
   - Moderator satisfaction survey
   - Cost-benefit analysis

---

## Implementation Code Structure

### File Organization
```
src/
├── ai/
│   ├── prompts/
│   │   ├── datingDetection.ts      # Enhanced prompt
│   │   └── examples.ts              # Few-shot examples
│   ├── validators/
│   │   ├── datingValidator.ts       # Post-AI validation
│   │   └── evidenceAnalyzer.ts      # Evidence extraction
├── filters/
│   ├── datingPrefilter.ts          # Regex prefilter
│   └── contextEnhancer.ts          # Context enhancement
├── moderation/
│   ├── thresholdManager.ts         # Threshold management
│   ├── aggregator.ts                # Multi-post aggregation
│   └── decisionMaker.ts            # Final decision logic
├── monitoring/
│   ├── metrics.ts                   # Metrics collection
│   ├── dashboard.ts                 # Real-time dashboard
│   └── reporting.ts                 # Report generation
└── tests/
    ├── datingDetection.test.ts     # Integration tests
    ├── fixtures/                    # Test data
    └── mocks/                       # Mock responses
```

---

## Conclusion

This enhanced dating detection system addresses the false positive problem through:

1. **Precision-focused prompt engineering** with chain-of-thought reasoning and evidence requirements
2. **Multi-stage filtering** that eliminates obvious false positives before expensive AI analysis
3. **Context-aware classification** that understands the difference between discussion and solicitation
4. **Intelligent thresholds** that adapt based on user history and evidence strength
5. **Comprehensive monitoring** to track performance and continuously improve

**Expected Outcomes**:
- **False positive rate**: Reduced from ~40% to <10%
- **True positive retention**: Maintained at >70%
- **Processing cost**: Reduced by 30% through prefiltering
- **Moderator satisfaction**: Increased through fewer incorrect flags

**Next Steps**:
1. Review and approve implementation plan
2. Begin Phase 1 (Prompt Enhancement) development
3. Set up A/B testing infrastructure
4. Create initial test dataset for validation

---

## Appendices

### Appendix A: Common False Positive Examples
[List of real examples that should NOT be flagged]

### Appendix B: True Positive Examples
[List of real examples that SHOULD be flagged]

### Appendix C: Edge Cases Requiring Human Review
[Ambiguous cases that need moderator judgment]

### Appendix D: Performance Benchmarks
[Target metrics and baseline measurements]