# Custom Rule Configuration System

## Overview

The Custom Rule System allows moderators to create and configure moderation rules beyond the predetermined options. This document outlines the architecture and user interface for the custom rule builder.

## Rule Definition Structure

### Rule Schema

```typescript
interface CustomRule {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description: string;           // What this rule does
  enabled: boolean;              // Active/inactive
  priority: number;              // Execution order (1-100)

  // When to trigger
  triggers: RuleTrigger[];

  // What to check
  conditions: RuleCondition[];

  // AI analysis settings
  aiAnalysis?: AIAnalysisConfig;

  // What to do
  actions: RuleAction[];

  // Configuration
  config: RuleConfig;

  // Metadata
  createdAt: Date;
  updatedBy: string;
  lastModified: Date;
  stats: RuleStats;
}
```

---

## 1. Triggers

### Trigger Types

```typescript
type TriggerType =
  | 'post_submit'
  | 'comment_submit'
  | 'post_edit'
  | 'comment_edit'
  | 'post_report'
  | 'comment_report'
  | 'scheduled'
  | 'manual';

interface RuleTrigger {
  type: TriggerType;
  filters?: TriggerFilter;
}

interface TriggerFilter {
  // Content filters
  contentType?: 'text' | 'link' | 'image' | 'video' | 'poll';
  flair?: string[];              // Match specific flairs

  // User filters
  userKarma?: { min?: number; max?: number };
  accountAge?: { min?: number; max?: number }; // days
  isModerator?: boolean;
  isApprovedUser?: boolean;

  // Time filters
  timeOfDay?: { start: string; end: string }; // HH:MM
  daysOfWeek?: number[];         // 0-6 (Sunday-Saturday)

  // Context filters
  isEdited?: boolean;
  reportCount?: { min?: number; max?: number };
}
```

### Example Trigger Configurations

```typescript
// Trigger on new posts from low-karma users
{
  type: 'post_submit',
  filters: {
    userKarma: { max: 100 },
    accountAge: { max: 30 }
  }
}

// Trigger on weekend comments
{
  type: 'comment_submit',
  filters: {
    daysOfWeek: [0, 6] // Saturday and Sunday
  }
}

// Trigger on reported image posts
{
  type: 'post_report',
  filters: {
    contentType: 'image',
    reportCount: { min: 3 }
  }
}
```

---

## 2. Conditions

### Condition Types

```typescript
type ConditionType =
  | 'keyword_match'
  | 'regex_match'
  | 'length_check'
  | 'link_check'
  | 'user_history'
  | 'engagement_check'
  | 'similarity_check'
  | 'custom_expression';

interface RuleCondition {
  type: ConditionType;
  operator: 'AND' | 'OR' | 'NOT';
  config: ConditionConfig;
}
```

### Condition Configurations

#### Keyword Match
```typescript
interface KeywordMatchConfig {
  keywords: string[];
  caseSensitive: boolean;
  matchType: 'exact' | 'contains' | 'starts_with' | 'ends_with';
  scope: 'title' | 'body' | 'both';
}
```

#### Regex Match
```typescript
interface RegexMatchConfig {
  pattern: string;
  flags: string; // 'i', 'g', 'm', etc.
  scope: 'title' | 'body' | 'both';
}
```

#### Length Check
```typescript
interface LengthCheckConfig {
  minLength?: number;
  maxLength?: number;
  countType: 'characters' | 'words';
  scope: 'title' | 'body' | 'both';
}
```

#### Link Check
```typescript
interface LinkCheckConfig {
  linkCount?: { min?: number; max?: number };
  domainBlacklist?: string[];
  domainWhitelist?: string[];
  requireHttps?: boolean;
  blockShorteners?: boolean;
}
```

#### User History Check
```typescript
interface UserHistoryConfig {
  checkLast: number;             // Number of posts/comments
  violationThreshold: number;    // % that violate rules
  timeWindow: number;            // Days to look back
  checkType: 'posts' | 'comments' | 'both';
}
```

#### Engagement Check
```typescript
interface EngagementCheckConfig {
  upvoteRatio?: { min?: number; max?: number };
  commentCount?: { min?: number; max?: number };
  timeWindow: number;            // Minutes since submission
}
```

#### Similarity Check
```typescript
interface SimilarityCheckConfig {
  compareAgainst: 'recent_posts' | 'user_posts' | 'specific_content';
  similarityThreshold: number;   // 0-100%
  timeWindow: number;            // Days
  contentToCompare?: string;     // For specific_content
}
```

### Example Conditions

```typescript
// Check for spam keywords
{
  type: 'keyword_match',
  operator: 'OR',
  config: {
    keywords: ['buy now', 'click here', 'limited offer'],
    caseSensitive: false,
    matchType: 'contains',
    scope: 'both'
  }
}

// Check post length
{
  type: 'length_check',
  operator: 'AND',
  config: {
    minLength: 50,
    maxLength: 5000,
    countType: 'characters',
    scope: 'body'
  }
}

// Check for excessive links
{
  type: 'link_check',
  operator: 'AND',
  config: {
    linkCount: { max: 3 },
    blockShorteners: true,
    requireHttps: true
  }
}
```

---

## 3. AI Analysis Configuration

```typescript
interface AIAnalysisConfig {
  enabled: boolean;
  provider: 'openai' | 'gemini' | 'custom';
  model?: string;                // Specific model (e.g., 'gpt-4')

  // Analysis type
  analysisType:
    | 'toxicity'
    | 'sentiment'
    | 'topic_classification'
    | 'intent_detection'
    | 'custom_prompt';

  // Custom prompt (if analysisType is 'custom_prompt')
  customPrompt?: string;

  // Thresholds
  confidenceThreshold: number;   // 0-100

  // Output format
  outputFormat: 'boolean' | 'score' | 'classification' | 'json';

  // Caching
  enableCaching: boolean;
  cacheExpiry: number;           // Hours
}
```

### Pre-built Analysis Types

#### Toxicity Analysis
```typescript
{
  analysisType: 'toxicity',
  confidenceThreshold: 80,
  outputFormat: 'score'
}
// Returns: { toxic: boolean, score: 85, categories: ['harassment', 'profanity'] }
```

#### Sentiment Analysis
```typescript
{
  analysisType: 'sentiment',
  confidenceThreshold: 70,
  outputFormat: 'classification'
}
// Returns: { sentiment: 'negative', score: -0.7, confidence: 85 }
```

#### Topic Classification
```typescript
{
  analysisType: 'topic_classification',
  customPrompt: 'Classify this post into: tech, politics, sports, or other',
  outputFormat: 'classification'
}
// Returns: { topic: 'tech', confidence: 92 }
```

#### Custom Prompt Analysis
```typescript
{
  analysisType: 'custom_prompt',
  customPrompt: `
    Analyze if this Reddit post violates our rule: "No medical advice".

    Rules:
    - Diagnoses are not allowed
    - Treatment recommendations are not allowed
    - Sharing personal experiences is allowed

    Return JSON:
    {
      "violates_rule": boolean,
      "confidence": number (0-100),
      "reasoning": string
    }
  `,
  confidenceThreshold: 85,
  outputFormat: 'json'
}
// Returns: { violates_rule: true, confidence: 92, reasoning: "..." }
```

---

## 4. Actions

### Action Types

```typescript
type ActionType =
  | 'remove'
  | 'approve'
  | 'report'
  | 'flair'
  | 'lock'
  | 'sticky'
  | 'comment'
  | 'modmail'
  | 'ban'
  | 'mute'
  | 'warn'
  | 'custom';

interface RuleAction {
  type: ActionType;
  config: ActionConfig;
  condition?: ActionCondition; // Optional condition for action
}
```

### Action Configurations

#### Remove
```typescript
interface RemoveActionConfig {
  reason?: string;               // Removal reason
  replyToUser?: boolean;         // Send removal message
  replyTemplate?: string;        // Message template
  markAsSpam?: boolean;
}
```

#### Ban/Mute
```typescript
interface BanActionConfig {
  duration?: number;             // Days (permanent if not set)
  reason: string;
  message?: string;              // Message to user
  note?: string;                 // Mod note
}
```

#### Comment
```typescript
interface CommentActionConfig {
  template: string;              // Comment text
  sticky?: boolean;
  distinguish?: boolean;         // Mod distinguish
  lock?: boolean;                // Lock comment
}
```

#### Flair
```typescript
interface FlairActionConfig {
  flairText: string;
  flairCssClass?: string;
  flairTemplateId?: string;
}
```

#### Report
```typescript
interface ReportActionConfig {
  reason: string;
  sendToQueue: boolean;
}
```

### Conditional Actions

```typescript
interface ActionCondition {
  type: 'confidence_threshold' | 'user_attribute' | 'custom';
  config: any;
}

// Example: Only ban if AI is very confident
{
  type: 'ban',
  config: {
    duration: 7,
    reason: 'Hate speech detected'
  },
  condition: {
    type: 'confidence_threshold',
    config: { threshold: 95 }
  }
}

// Example: Different actions based on karma
{
  type: 'remove',
  config: { replyToUser: true },
  condition: {
    type: 'user_attribute',
    config: {
      attribute: 'karma',
      operator: '<',
      value: 50
    }
  }
}
```

---

## 5. Rule Configuration

```typescript
interface RuleConfig {
  // Execution
  stopOnMatch: boolean;          // Stop evaluating rules after match
  skipIfModApproved: boolean;    // Skip if mod already approved

  // Thresholds
  minConfidence: number;         // 0-100
  maxFalsePositiveRate: number;  // 0-100

  // Cooldowns
  cooldownPeriod?: number;       // Minutes
  maxActionsPerUser?: number;    // Per cooldown period

  // Testing
  testMode: boolean;             // Log only, don't act

  // Notifications
  notifyMods: boolean;
  notificationChannel?: 'modmail' | 'discord' | 'slack';

  // Exceptions
  exemptUsers?: string[];        // Usernames
  exemptFlairs?: string[];

  // Logging
  logLevel: 'none' | 'minimal' | 'detailed';
  logRetention: number;          // Days
}
```

---

## 6. Rule Statistics

```typescript
interface RuleStats {
  totalTriggers: number;
  totalActions: number;
  actionBreakdown: {
    [actionType: string]: number;
  };
  falsePositives: number;        // Mod overrides
  truePositives: number;         // Mod confirmations
  accuracy: number;              // %
  avgConfidence: number;
  lastTriggered?: Date;
}
```

---

## Rule Builder UI Design

### Step 1: Basic Information
```
┌─────────────────────────────────────────────┐
│ Create New Rule                             │
├─────────────────────────────────────────────┤
│                                             │
│ Rule Name: [________________________]       │
│                                             │
│ Description:                                │
│ [______________________________________]    │
│ [______________________________________]    │
│                                             │
│ Priority: [5] (1=highest, 100=lowest)       │
│                                             │
│ Enabled: [✓] Active                         │
│                                             │
│ [Cancel]           [Next: Configure →]      │
└─────────────────────────────────────────────┘
```

### Step 2: Triggers
```
┌─────────────────────────────────────────────┐
│ When should this rule trigger?              │
├─────────────────────────────────────────────┤
│                                             │
│ ◉ Post Submission                           │
│ ○ Comment Submission                        │
│ ○ Post Edit                                 │
│ ○ Comment Report                            │
│ ○ Scheduled (cron)                          │
│                                             │
│ Filter by:                                  │
│ ☐ Content Type: [All ▼]                    │
│ ☐ User Karma: Min [___] Max [___]          │
│ ☐ Account Age: Min [___] days              │
│ ☐ Flair: [Add flair...]                    │
│ ☐ Time of Day: [__:__] to [__:__]          │
│                                             │
│ [← Back]  [Next: Add Conditions →]          │
└─────────────────────────────────────────────┘
```

### Step 3: Conditions
```
┌─────────────────────────────────────────────┐
│ What conditions must be met?                │
├─────────────────────────────────────────────┤
│                                             │
│ Condition 1:                                │
│ Type: [Keyword Match ▼]                     │
│ Keywords: [spam, scam, buy now]             │
│ Match: [Contains ▼]  Scope: [Both ▼]        │
│ [Remove]                                    │
│                                             │
│ [AND ▼]  (chain next condition)             │
│                                             │
│ Condition 2:                                │
│ Type: [Link Check ▼]                        │
│ Max Links: [3]                              │
│ Block Shorteners: [✓]                       │
│ [Remove]                                    │
│                                             │
│ [+ Add Condition]                           │
│                                             │
│ [← Back]  [Next: AI Analysis →]             │
└─────────────────────────────────────────────┘
```

### Step 4: AI Analysis (Optional)
```
┌─────────────────────────────────────────────┐
│ AI Analysis (Optional)                      │
├─────────────────────────────────────────────┤
│                                             │
│ Enable AI: [✓]                              │
│                                             │
│ Provider: ◉ OpenAI  ○ Gemini               │
│                                             │
│ Analysis Type:                              │
│ ◉ Toxicity Detection                        │
│ ○ Sentiment Analysis                        │
│ ○ Topic Classification                      │
│ ○ Custom Prompt                             │
│                                             │
│ Confidence Threshold: [85]%                 │
│                                             │
│ Cache Results: [✓] for [24] hours          │
│                                             │
│ [Test with Sample Content...]               │
│                                             │
│ [← Back]  [Next: Define Actions →]          │
└─────────────────────────────────────────────┘
```

### Step 5: Actions
```
┌─────────────────────────────────────────────┐
│ What actions should be taken?               │
├─────────────────────────────────────────────┤
│                                             │
│ Action 1:                                   │
│ Type: [Remove ▼]                            │
│ Reason: [Spam content detected]             │
│ Reply to user: [✓]                          │
│ Message: [Your post was removed because...] │
│ Only if confidence > [90]%                  │
│ [Remove Action]                             │
│                                             │
│ Action 2:                                   │
│ Type: [Report to Mod Queue ▼]               │
│ Reason: [Possible spam - review needed]     │
│ Only if confidence: [70-89]%                │
│ [Remove Action]                             │
│                                             │
│ [+ Add Action]                              │
│                                             │
│ [← Back]  [Next: Advanced Settings →]       │
└─────────────────────────────────────────────┘
```

### Step 6: Advanced Settings
```
┌─────────────────────────────────────────────┐
│ Advanced Configuration                      │
├─────────────────────────────────────────────┤
│                                             │
│ Execution:                                  │
│ ☐ Stop processing rules after match        │
│ ☐ Skip if moderator already approved       │
│                                             │
│ Rate Limiting:                              │
│ Cooldown: [60] minutes                      │
│ Max actions per user: [3] per cooldown      │
│                                             │
│ Testing:                                    │
│ ☑ Test Mode (log only, no actions)         │
│                                             │
│ Notifications:                              │
│ ☑ Notify moderators when rule triggers     │
│ Channel: [Modmail ▼]                        │
│                                             │
│ Exceptions:                                 │
│ Exempt users: [AutoModerator, ...]          │
│ Exempt flairs: [Mod Post, ...]              │
│                                             │
│ [← Back]  [Save & Test Rule]                │
└─────────────────────────────────────────────┘
```

---

## Rule Templates

Pre-built templates for common scenarios:

### Template: Anti-Spam
```typescript
{
  name: "Basic Spam Filter",
  triggers: [{ type: 'post_submit' }],
  conditions: [
    { type: 'keyword_match', config: { keywords: ['buy now', 'click here'] } },
    { type: 'link_check', config: { blockShorteners: true, linkCount: { max: 2 } } }
  ],
  aiAnalysis: {
    enabled: true,
    analysisType: 'toxicity',
    confidenceThreshold: 80
  },
  actions: [
    { type: 'remove', config: { replyToUser: true } },
    { type: 'report', config: { reason: 'Suspected spam' } }
  ]
}
```

### Template: New User Protection
```typescript
{
  name: "New Account Filter",
  triggers: [{
    type: 'post_submit',
    filters: {
      accountAge: { max: 7 },
      userKarma: { max: 10 }
    }
  }],
  actions: [
    { type: 'report', config: { reason: 'New account - review needed' } },
    { type: 'comment', config: {
      template: 'Your account is new. A moderator will review your post shortly.',
      sticky: true
    }}
  ]
}
```

### Template: Civility Enforcement
```typescript
{
  name: "Civility Check",
  triggers: [{ type: 'comment_submit' }],
  aiAnalysis: {
    enabled: true,
    analysisType: 'toxicity',
    confidenceThreshold: 75
  },
  actions: [
    {
      type: 'warn',
      config: { message: 'Please keep comments civil.' },
      condition: { type: 'confidence_threshold', config: { threshold: 75, max: 89 } }
    },
    {
      type: 'remove',
      config: { reason: 'Uncivil comment' },
      condition: { type: 'confidence_threshold', config: { threshold: 90 } }
    }
  ]
}
```

---

## Storage Schema

### Redis Storage Structure

```
# Rule definitions
rules:{subreddit}:{ruleId} -> Rule JSON

# Rule list for subreddit
rules:{subreddit}:list -> Sorted Set (by priority)

# Rule statistics
rules:{subreddit}:{ruleId}:stats -> Stats JSON

# Rule trigger history (for cooldowns)
rules:{subreddit}:{ruleId}:triggers:{userId} -> Timestamp list

# Cache for AI analysis results
ai:cache:{hash} -> Analysis result JSON (with expiry)
```

---

## API Endpoints (for UI)

```typescript
// List all rules
GET /api/rules

// Get specific rule
GET /api/rules/:ruleId

// Create rule
POST /api/rules

// Update rule
PUT /api/rules/:ruleId

// Delete rule
DELETE /api/rules/:ruleId

// Test rule with sample content
POST /api/rules/:ruleId/test

// Get rule statistics
GET /api/rules/:ruleId/stats

// Export rules
GET /api/rules/export

// Import rules
POST /api/rules/import
```

---

## Rule Testing Interface

```
┌─────────────────────────────────────────────┐
│ Test Rule: "Basic Spam Filter"             │
├─────────────────────────────────────────────┤
│                                             │
│ Sample Content:                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Title: [Amazing deal! Click here!]     │ │
│ │                                         │ │
│ │ Body:                                   │ │
│ │ Check out this link: bit.ly/xyz123     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ User Properties (optional):                 │
│ Karma: [5]  Account Age: [3] days          │
│                                             │
│ [Run Test]                                  │
│                                             │
│ Results:                                    │
│ ✓ Triggered successfully                    │
│ ✓ Keyword match: "click here" (100%)        │
│ ✓ Link check: short URL detected           │
│ ✓ AI Analysis: 87% spam confidence          │
│                                             │
│ Actions that would be taken:                │
│ • Remove post                               │
│ • Send removal message to user              │
│ • Report to mod queue                       │
│                                             │
│ [Save Test Case] [Run Another Test]         │
└─────────────────────────────────────────────┘
```

---

## Implementation Notes

1. **Priority System**: Rules execute in priority order (1-100). Lower numbers = higher priority.

2. **Short-Circuit Evaluation**: If `stopOnMatch` is true, rule processing stops after first match.

3. **Caching**: AI analysis results are cached by content hash to reduce API costs.

4. **Rate Limiting**: Per-user cooldowns prevent spam of actions on single users.

5. **Test Mode**: All rules can run in test mode (log only) before going live.

6. **Audit Trail**: All rule executions are logged for review and appeals.

7. **Templates**: Common rule patterns available as templates for quick setup.

8. **Import/Export**: Rules can be exported as JSON and shared between subreddits.

9. **Version Control**: Rule changes are versioned for rollback capability.

10. **A/B Testing**: Multiple versions of a rule can run simultaneously for comparison.
