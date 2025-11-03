# Dating Detection Testing & Monitoring Strategy

## Testing Strategy Overview

### Goals
- **Primary**: Reduce false positive rate to <10%
- **Secondary**: Maintain true positive rate >70%
- **Tertiary**: Optimize processing costs by 30%

### Testing Phases

#### Phase 1: Unit Testing (Week 1)
Test individual components in isolation

#### Phase 2: Integration Testing (Week 2)
Test complete pipeline with real data

#### Phase 3: A/B Testing (Weeks 3-4)
Compare enhanced prompt vs current system

#### Phase 4: Production Monitoring (Ongoing)
Track performance metrics and iterate

---

## Test Dataset Specification

### Dataset Composition

| Category | Count | Description | Priority |
|----------|-------|-------------|----------|
| Clear Solicitation | 100 | Obvious dating/romantic intent | High |
| Subtle Solicitation | 100 | Ambiguous or hidden intent | High |
| Rule Discussions | 100 | Quoting or discussing dating rules | Critical |
| Past Experiences | 100 | Stories about past dating | Critical |
| Advice Giving | 50 | Giving dating advice to others | High |
| Calendar Dates | 50 | Using "date" as calendar reference | Medium |
| Negated Intent | 50 | "NOT looking for dates" | Critical |
| Sarcasm/Humor | 50 | Joking about dating | Medium |
| Married/Partnered | 50 | Mentioning existing relationships | High |
| Edge Cases | 100 | Ambiguous, require human judgment | Medium |

**Total**: 750 labeled examples

### Labeling Process

1. **Initial Collection**
   - Extract from r/FriendsOver40 historical data
   - Include removed posts (likely true positives)
   - Include approved posts (likely true negatives)

2. **Manual Annotation**
   ```
   For each post:
   - 3 moderators independently label
   - Labels: SOLICITING / NOT_SOLICITING / UNSURE
   - Confidence: 0-100
   - Evidence: Quote specific phrases
   ```

3. **Consensus Building**
   - Agreement = 2/3 moderators same label
   - Disagreement = team discussion
   - Document edge cases for guidelines

---

## Test Implementation

### Unit Tests

```typescript
// src/tests/datingDetection.test.ts

describe('Dating Detection Prefilter', () => {
  describe('shouldAnalyzeForDating', () => {
    test('should skip analysis for strong negation', () => {
      const result = shouldAnalyzeForDating(
        "Friendship only",
        "I'm NOT looking for dates or romance, strictly platonic"
      );
      expect(result).toBe(false);
    });

    test('should trigger analysis for strong signals', () => {
      const result = shouldAnalyzeForDating(
        "45M seeking female friends",
        "Single and looking to connect"
      );
      expect(result).toBe(true);
    });

    test('should require multiple moderate signals', () => {
      const single = shouldAnalyzeForDating("Coffee?", "Let's meet");
      expect(single).toBe(false);

      const multiple = shouldAnalyzeForDating(
        "Coffee buddy wanted",
        "42M prefer female company"
      );
      expect(multiple).toBe(true);
    });
  });
});

describe('AI Decision Validation', () => {
  test('should override false positive for moderator', () => {
    const aiResult = {
      classification: {
        is_soliciting: true,
        confidence: 75
      }
    };

    const validated = validateDatingDetection(
      aiResult,
      "Dating Rule Reminder",
      "Remember: no dating allowed per subreddit rules",
      true // isModerator
    );

    expect(validated.classification.is_soliciting).toBe(false);
    expect(validated.classification.override_reason).toContain("Moderator");
  });
});

describe('Evidence Aggregation', () => {
  test('should weight recent posts more heavily', () => {
    const analyses = [
      { classification: { confidence: 90 }, timestamp: Date.now() },
      { classification: { confidence: 50 }, timestamp: Date.now() - 86400000 },
      { classification: { confidence: 30 }, timestamp: Date.now() - 172800000 }
    ];

    const decision = aggregateDatingAnalyses(analyses);
    expect(decision).toBe('FLAG'); // Recent high confidence dominates
  });
});
```

### Integration Tests

```typescript
// src/tests/integration/datingPipeline.test.ts

describe('Complete Dating Detection Pipeline', () => {
  let pipeline: DatingDetectionPipeline;

  beforeEach(() => {
    pipeline = new DatingDetectionPipeline({
      prefilterEnabled: true,
      validationEnabled: true,
      aiProvider: 'openai'
    });
  });

  test('Full pipeline: Clear solicitation', async () => {
    const post = {
      title: "45M looking for female companionship",
      body: "Recently divorced, ready to date again. DM if interested!",
      author: { isMod: false, karma: 100 }
    };

    const result = await pipeline.analyze(post);

    expect(result.shouldAnalyze).toBe(true);
    expect(result.classification.is_soliciting).toBe(true);
    expect(result.classification.confidence).toBeGreaterThan(85);
    expect(result.action).toBe('FLAG');
  });

  test('Full pipeline: Rule discussion', async () => {
    const post = {
      title: "Reminder about subreddit rules",
      body: "Please note that 'no dating or romantic solicitation' is rule #3",
      author: { isMod: true, karma: 10000 }
    };

    const result = await pipeline.analyze(post);

    expect(result.shouldAnalyze).toBe(false); // Prefiltered
    expect(result.action).toBe('APPROVE');
  });

  test('Full pipeline: Past experience', async () => {
    const post = {
      title: "My dating disaster story",
      body: "Last year I tried online dating and it was terrible. Never again!",
      author: { isMod: false, karma: 500 }
    };

    const result = await pipeline.analyze(post);

    expect(result.classification.is_soliciting).toBe(false);
    expect(result.classification.confidence).toBeLessThan(30);
    expect(result.action).toBe('APPROVE');
  });
});
```

---

## A/B Testing Framework

### Test Configuration

```typescript
interface ABTestConfig {
  name: 'dating_detection_enhancement';
  startDate: Date;
  endDate: Date;
  variants: {
    control: {
      name: 'current_prompt';
      weight: 0.5;
      prompt: CURRENT_DATING_PROMPT;
    };
    treatment: {
      name: 'enhanced_prompt';
      weight: 0.5;
      prompt: DATING_DETECTION_ENHANCED_PROMPT;
    };
  };
  metrics: ['false_positive_rate', 'true_positive_rate', 'confidence_accuracy'];
  minimumSampleSize: 1000;
}
```

### Metrics Collection

```typescript
class ABTestMetrics {
  private results: Map<string, TestResult[]> = new Map();

  recordResult(variant: string, prediction: boolean, actual: boolean, confidence: number) {
    const result: TestResult = {
      timestamp: Date.now(),
      variant,
      predicted: prediction,
      actual,
      confidence,
      isCorrect: prediction === actual,
      isFalsePositive: prediction && !actual,
      isFalseNegative: !prediction && actual
    };

    this.results.get(variant)?.push(result) ||
    this.results.set(variant, [result]);
  }

  getMetrics(variant: string): VariantMetrics {
    const results = this.results.get(variant) || [];
    const total = results.length;

    if (total === 0) return null;

    const tp = results.filter(r => r.predicted && r.actual).length;
    const fp = results.filter(r => r.predicted && !r.actual).length;
    const tn = results.filter(r => !r.predicted && !r.actual).length;
    const fn = results.filter(r => !r.predicted && r.actual).length;

    return {
      precision: tp / (tp + fp),
      recall: tp / (tp + fn),
      accuracy: (tp + tn) / total,
      f1Score: 2 * (precision * recall) / (precision + recall),
      falsePositiveRate: fp / (fp + tn),
      falseNegativeRate: fn / (fn + tp),
      averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / total,
      confidenceAccuracy: this.calculateConfidenceAccuracy(results),
      sampleSize: total
    };
  }

  private calculateConfidenceAccuracy(results: TestResult[]): number {
    // Measures how well confidence aligns with actual accuracy
    const buckets = this.bucketByConfidence(results);
    let totalError = 0;

    for (const [range, bucket] of Object.entries(buckets)) {
      const expectedAccuracy = (range.min + range.max) / 2 / 100;
      const actualAccuracy = bucket.correct / bucket.total;
      totalError += Math.abs(expectedAccuracy - actualAccuracy);
    }

    return 1 - (totalError / Object.keys(buckets).length);
  }
}
```

### Statistical Significance Testing

```typescript
function calculateStatisticalSignificance(
  control: VariantMetrics,
  treatment: VariantMetrics
): SignificanceResult {
  // Use Chi-square test for categorical outcomes
  const chiSquare = calculateChiSquare(
    control.truePositives,
    control.falsePositives,
    treatment.truePositives,
    treatment.falsePositives
  );

  const pValue = chiSquareToPValue(chiSquare, 1);

  return {
    significant: pValue < 0.05,
    pValue,
    confidenceInterval: calculateConfidenceInterval(control, treatment),
    effectSize: calculateCohenD(control, treatment)
  };
}
```

---

## Production Monitoring

### Real-Time Dashboard

```typescript
interface DashboardMetrics {
  // Core Metrics
  totalAnalyzed: number;
  falsePositiveRate: number;
  truePositiveRate: number;
  averageConfidence: number;

  // Action Distribution
  actionsDistribution: {
    APPROVE: number;
    MONITOR: number;
    FLAG: number;
    REMOVE: number;
  };

  // Performance Metrics
  averageLatency: number;
  prefilterSkipRate: number;
  aiCostPerAnalysis: number;

  // Quality Indicators
  appealRate: number;
  overrideRate: number;
  moderatorAgreement: number;
}

class MonitoringService {
  private metrics: DashboardMetrics;
  private alerts: Alert[] = [];

  updateMetrics(analysis: AnalysisResult) {
    this.metrics.totalAnalyzed++;

    // Update rolling averages
    this.metrics.averageConfidence = this.updateRollingAverage(
      this.metrics.averageConfidence,
      analysis.confidence,
      this.metrics.totalAnalyzed
    );

    // Track actions
    this.metrics.actionsDistribution[analysis.action]++;

    // Check for anomalies
    this.checkAnomalies(analysis);
  }

  private checkAnomalies(analysis: AnalysisResult) {
    // Alert on confidence drops
    if (this.metrics.averageConfidence < 50) {
      this.createAlert('LOW_CONFIDENCE', 'Average confidence below 50%');
    }

    // Alert on high false positive rate
    if (this.metrics.falsePositiveRate > 0.15) {
      this.createAlert('HIGH_FP_RATE', 'False positive rate exceeds 15%');
    }

    // Alert on unusual patterns
    if (this.detectUnusualPattern(analysis)) {
      this.createAlert('UNUSUAL_PATTERN', 'Detected unusual classification pattern');
    }
  }
}
```

### Weekly Reports

```typescript
interface WeeklyReport {
  period: { start: Date; end: Date };

  summary: {
    totalPosts: number;
    flaggedPosts: number;
    falsePositives: number;
    truePositives: number;
    accuracy: number;
  };

  topFalsePositivePatterns: Array<{
    pattern: string;
    count: number;
    examples: string[];
  }>;

  performanceTrends: {
    accuracyTrend: 'improving' | 'stable' | 'declining';
    costTrend: 'increasing' | 'stable' | 'decreasing';
    latencyTrend: 'improving' | 'stable' | 'degrading';
  };

  recommendations: string[];
}

async function generateWeeklyReport(): Promise<WeeklyReport> {
  const data = await collectWeeklyData();

  return {
    period: getWeekPeriod(),
    summary: calculateSummaryStats(data),
    topFalsePositivePatterns: analyzeFalsePositives(data),
    performanceTrends: analyzePerformanceTrends(data),
    recommendations: generateRecommendations(data)
  };
}
```

---

## Continuous Improvement Process

### Feedback Loop Implementation

```typescript
class FeedbackLoop {
  async processModeatorFeedback(
    postId: string,
    originalDecision: string,
    moderatorDecision: string,
    moderatorNotes: string
  ) {
    // Log the correction
    await this.logCorrection({
      postId,
      original: originalDecision,
      corrected: moderatorDecision,
      notes: moderatorNotes,
      timestamp: Date.now()
    });

    // Analyze if this is a pattern
    const pattern = await this.detectPattern(postId, moderatorNotes);

    if (pattern) {
      // Update rules or thresholds
      await this.updateSystem(pattern);

      // Notify team
      await this.notifyTeam(pattern);
    }

    // Retrain if needed
    if (this.shouldRetrain()) {
      await this.triggerRetraining();
    }
  }

  private async detectPattern(postId: string, notes: string): Promise<Pattern | null> {
    // Check if similar corrections have been made
    const similar = await this.findSimilarCorrections(notes);

    if (similar.length >= 3) {
      return {
        type: 'recurring_false_positive',
        description: this.extractPatternDescription(similar),
        count: similar.length,
        action: 'update_prefilter'
      };
    }

    return null;
  }
}
```

### Threshold Optimization

```typescript
class ThresholdOptimizer {
  async optimizeThresholds(historicalData: AnalysisResult[]) {
    const results = [];

    // Test different threshold combinations
    for (let flagThreshold = 65; flagThreshold <= 80; flagThreshold += 5) {
      for (let removeThreshold = 85; removeThreshold <= 95; removeThreshold += 5) {
        const metrics = this.evaluateThresholds(
          historicalData,
          flagThreshold,
          removeThreshold
        );

        results.push({
          flagThreshold,
          removeThreshold,
          precision: metrics.precision,
          recall: metrics.recall,
          f1Score: metrics.f1Score
        });
      }
    }

    // Find optimal balance
    const optimal = results.reduce((best, current) =>
      current.f1Score > best.f1Score ? current : best
    );

    return {
      recommended: optimal,
      all: results
    };
  }
}
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| False Positive Rate | ~40% | <10% | (FP / (FP + TN)) × 100 |
| True Positive Rate | ~60% | >70% | (TP / (TP + FN)) × 100 |
| Precision | ~60% | >90% | TP / (TP + FP) |
| Processing Cost | $X/1000 | $0.7X/1000 | Total AI cost / analyses |
| Average Latency | 3s | <2s | Mean processing time |
| Moderator Override Rate | Unknown | <5% | Overrides / total decisions |
| User Appeal Success | Unknown | <10% | Successful appeals / total |

### Monitoring Alerts

```typescript
const ALERT_THRESHOLDS = {
  critical: {
    falsePositiveRate: 0.25,    // >25% FP
    truePositiveRate: 0.50,     // <50% TP
    latency: 5000,              // >5 seconds
    errorRate: 0.10             // >10% errors
  },
  warning: {
    falsePositiveRate: 0.15,    // >15% FP
    truePositiveRate: 0.65,     // <65% TP
    latency: 3000,              // >3 seconds
    errorRate: 0.05             // >5% errors
  }
};
```

---

## Implementation Timeline

### Week 1: Testing Infrastructure
- Set up test dataset collection
- Implement unit tests
- Create A/B testing framework

### Week 2: Integration & Validation
- Complete integration tests
- Manual validation of test dataset
- Deploy to staging environment

### Week 3-4: A/B Testing
- Launch A/B test with 50/50 split
- Monitor metrics daily
- Collect moderator feedback

### Week 5: Analysis & Optimization
- Analyze A/B test results
- Optimize thresholds
- Update documentation

### Week 6: Production Rollout
- Gradual rollout (10% → 50% → 100%)
- Monitor production metrics
- Set up alerting

### Ongoing: Continuous Improvement
- Weekly report reviews
- Monthly threshold optimization
- Quarterly prompt updates