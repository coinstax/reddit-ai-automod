# Enhanced AI Questions - Rule Authoring Templates

**Version**: 1.0
**Last Updated**: 2025-11-03
**Audience**: Moderators creating AI detection rules

## Table of Contents

1. [Getting Started](#getting-started)
2. [Common Scenarios](#common-scenarios)
3. [Template Library](#template-library)
4. [Best Practices](#best-practices)
5. [Testing Your Rules](#testing-your-rules)
6. [Troubleshooting](#troubleshooting)

## Getting Started

### What is an Enhanced AI Question?

An Enhanced AI Question is a structured configuration that tells the AI:
- **What** to detect (the question)
- **How** to classify evidence (analysis framework)
- **What NOT** to flag (false positive filters)
- **How confident** to be (confidence guidance)

### Simple vs Enhanced Questions

**Simple Question** (40% false positives):
```json
{
  "id": "dating_check",
  "question": "Is this user looking to date?"
}
```

**Enhanced Question** (<10% false positives):
```json
{
  "id": "dating_check",
  "question": "Is this user seeking romantic or sexual relationships?",
  "analysisFramework": {
    "evidenceTypes": ["DIRECT", "IMPLIED", "DISCUSSION", "NEGATED"],
    "falsePositiveFilters": [
      "discussing dating as a topic",
      "sharing past dating experiences",
      "explicitly stating 'just friends'"
    ]
  },
  "evidenceRequired": {
    "minPieces": 2,
    "types": ["DIRECT", "IMPLIED"]
  }
}
```

## Common Scenarios

### Template Categories

1. **Relationship/Dating Detection** - Detecting romantic solicitation
2. **Spam/Promotion Detection** - Detecting promotional content
3. **Age Verification** - Estimating user age
4. **Location Detection** - Determining user location
5. **Topic Relevance** - Checking if content is on-topic
6. **Toxicity Detection** - Identifying harmful behavior
7. **Account Assessment** - Evaluating account authenticity

## Template Library

### 1. Dating/Romantic Solicitation Detection

**Use Case**: Friendship communities that prohibit dating

**Template**:
```json
{
  "id": "dating_solicitation",
  "question": "Is this user seeking romantic or sexual relationships in this community?",
  "context": "This is a platonic friendship community. Many users discuss dating as a topic - this is NOT solicitation.",

  "analysisFramework": {
    "evidenceTypes": [
      "DIRECT: Explicit solicitation ('looking for girlfriend/boyfriend', 'seeking romance', 'want to date')",
      "IMPLIED: Suggestive language ('open to anything', 'see where it goes', 'chemistry', 'connection')",
      "CONTEXTUAL: Indirect signals ('lonely', 'miss companionship', 'recently single')",
      "DISCUSSION: Talking about dating, not seeking it ('dating apps suck', 'when I was dating')",
      "NEGATED: Explicitly NOT seeking ('not looking for dates', 'platonic only', 'just friends')"
    ],

    "falsePositiveFilters": [
      "quoting subreddit rules about no dating",
      "telling stories about past dating experiences (past tense)",
      "giving dating advice to others (third person)",
      "complaining about dating attempts in the community",
      "discussing dating culture or trends generally",
      "using 'date' to mean calendar date or appointment",
      "negated statements with 'not', 'never', 'don't want'",
      "conditional statements ('if you want to date, go to r/dating')",
      "sarcasm or jokes about dating",
      "mentions being married, partnered, or happily single"
    ],

    "contextualFactors": [
      "subreddit culture and rules (explicitly platonic)",
      "user's post history in dating vs friendship subreddits",
      "tone: seeking specific connection vs general friendship",
      "gender preference (strong signal if specified)",
      "request for private contact (DM me, message me)",
      "first person present tense vs third person or past tense"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "Multiple DIRECT indicators (e.g., 'looking for girlfriend' + gender preference + DM request), clear solicitation intent, no negation or false positive patterns",
    "mediumConfidence": "Mix of IMPLIED and CONTEXTUAL indicators (e.g., 'open-minded' + 'see where things go'), could be platonic or romantic",
    "lowConfidence": "Only DISCUSSION or CONTEXTUAL evidence, clear false positive patterns present, or explicit NEGATED statements"
  },

  "evidenceRequired": {
    "minPieces": 2,
    "types": ["DIRECT", "IMPLIED"],
    "includeQuotes": true
  },

  "negationHandling": {
    "enabled": true,
    "patterns": [
      "not looking for {dates|dating|romance|relationship}",
      "don't want {dates|dating|romance|relationship}",
      "no {dating|romance|romantic} {stuff|things|intentions}",
      "just {friends|friendship|platonic}",
      "strictly {platonic|friends}",
      "{dating|romance} is {banned|prohibited|not allowed}"
    ]
  },

  "examples": [
    {
      "scenario": "User posts 'Looking for a female friend to get coffee with. I'm 45M, enjoy deep conversations and seeing where things naturally go.'",
      "expectedAnswer": "YES",
      "confidence": 85,
      "reasoning": "Gender specification + 'seeing where things go' suggests romantic openness despite 'friend' label. IMPLIED evidence + CONTEXTUAL evidence."
    },
    {
      "scenario": "User posts 'Why do people keep trying to date here? The rules clearly say no romantic posts. I'm here for PLATONIC friendships only.'",
      "expectedAnswer": "NO",
      "confidence": 10,
      "reasoning": "User is criticizing dating attempts and explicitly stating platonic intent. DISCUSSION + NEGATED categories. False positive pattern: quoting rules."
    },
    {
      "scenario": "User posts 'New to town, looking to meet people and make friends. Open to all types of connections!'",
      "expectedAnswer": "NO",
      "confidence": 45,
      "reasoning": "Ambiguous language that could be platonic. 'Open to all types' could mean anything. Need monitoring but insufficient evidence for YES."
    }
  ]
}
```

**Action Thresholds**:
- Confidence >90% → Auto-remove (only clearest cases)
- Confidence 70-89% → Flag for review
- Confidence 50-69% → Monitor/track
- Confidence <50% → Approve

---

### 2. Spam/Promotional Content Detection

**Use Case**: Any community wanting to filter spam and self-promotion

**Template**:
```json
{
  "id": "spam_promotion",
  "question": "Is this user posting spam or promotional content?",
  "context": "Spam includes: excessive self-promotion, affiliate links, repetitive posts, off-topic commercial content.",

  "analysisFramework": {
    "evidenceTypes": [
      "BLATANT_AD: Obvious advertisement ('Buy now!', 'Click here', discount codes)",
      "SUBTLE_PROMOTION: Soft promotion ('check out my blog', 'I wrote about this')",
      "AFFILIATE_LINK: Referral or affiliate URLs with tracking codes",
      "REPETITIVE: Same content posted multiple times",
      "OFF_TOPIC_COMMERCIAL: Selling unrelated products/services",
      "GENUINE_CONTRIBUTION: Relevant personal experience sharing",
      "ANSWERING_QUESTION: Helpful response to someone's query"
    ],

    "falsePositiveFilters": [
      "user is answering a direct question from another user",
      "user is sharing personal experience relevant to discussion",
      "one-time mention of their work when contextually relevant",
      "no commercial language (buy, sale, discount, limited time)",
      "no call-to-action (click here, DM me, check out)",
      "link to educational resource with no monetization",
      "active community member who occasionally shares their content"
    ],

    "contextualFactors": [
      "user's history: active participant vs drive-by poster",
      "karma and account age (new account with only promotional posts = red flag)",
      "engagement ratio (only posts own content vs engages with others)",
      "relevance to current discussion or community topic",
      "frequency of self-promotion (occasional vs constant)"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "BLATANT_AD or multiple REPETITIVE posts with commercial language and no community engagement",
    "mediumConfidence": "SUBTLE_PROMOTION with some community participation, relevance to discussion unclear",
    "lowConfidence": "GENUINE_CONTRIBUTION or ANSWERING_QUESTION with incidental mention of their work"
  },

  "evidenceRequired": {
    "minPieces": 2,
    "types": ["BLATANT_AD", "SUBTLE_PROMOTION", "REPETITIVE"],
    "includeQuotes": true
  },

  "examples": [
    {
      "scenario": "User posts 'Check out my new cryptocurrency trading bot! 50% off this week only! DM for discount code.'",
      "expectedAnswer": "YES",
      "confidence": 95,
      "reasoning": "BLATANT_AD with commercial language, discount code, call-to-action. Clear spam."
    },
    {
      "scenario": "User comments 'I had the same issue. I wrote about my solution on my blog if anyone's interested: [link]'",
      "expectedAnswer": "NO",
      "confidence": 35,
      "reasoning": "ANSWERING_QUESTION + SUBTLE_PROMOTION. Relevant to discussion, not pushy. Could be genuine help."
    }
  ]
}
```

---

### 3. Age Verification

**Use Case**: Age-restricted communities (e.g., FriendsOver40)

**Template**:
```json
{
  "id": "age_verification",
  "question": "Does this user appear to be under the minimum age for this community?",
  "context": "This is a 40+ community. Look for age indicators in post history, language, cultural references.",

  "analysisFramework": {
    "evidenceTypes": [
      "EXPLICIT_AGE: User states their age directly",
      "LIFE_STAGE: References to college, living with parents, first job",
      "CULTURAL_REFERENCES: Music, TV shows, events from specific eras",
      "LANGUAGE_PATTERNS: Slang, emoji usage, communication style",
      "POST_HISTORY: Active in age-specific communities"
    ],

    "falsePositiveFilters": [
      "user discussing their children's experiences",
      "user reminiscing about their own youth",
      "user asking questions about younger generations",
      "references to young people in third person",
      "age mentions in past tense ('when I was 20...')"
    ],

    "contextualFactors": [
      "consistency of age indicators across multiple posts",
      "time frame of posts (recent vs old)",
      "context of age mentions (present vs past)",
      "subreddit demographics where user is active"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "Multiple EXPLICIT_AGE statements or strong LIFE_STAGE indicators consistent across recent posts",
    "mediumConfidence": "Some CULTURAL_REFERENCES or LANGUAGE_PATTERNS but ambiguous",
    "lowConfidence": "Only indirect signals or false positive patterns present"
  },

  "evidenceRequired": {
    "minPieces": 2,
    "types": ["EXPLICIT_AGE", "LIFE_STAGE"],
    "includeQuotes": true
  }
}
```

---

### 4. Topic Relevance Check

**Use Case**: Keeping discussions on-topic in specialized communities

**Template**:
```json
{
  "id": "topic_relevance",
  "question": "Is this post relevant to {TOPIC_NAME}?",
  "context": "This community focuses on {TOPIC_DESCRIPTION}. Posts must be directly related.",

  "analysisFramework": {
    "evidenceTypes": [
      "DIRECTLY_RELEVANT: Core topic, explicitly discusses {TOPIC_NAME}",
      "TANGENTIALLY_RELEVANT: Related but not central to {TOPIC_NAME}",
      "LOOSELY_CONNECTED: Mentioned in passing but not the focus",
      "OFF_TOPIC: No clear connection to {TOPIC_NAME}",
      "SPAM: Completely unrelated, promotional"
    ],

    "falsePositiveFilters": [
      "user is asking a genuine question about {TOPIC_NAME}",
      "new user introducing themselves to the community",
      "meta-discussion about the community itself",
      "related topic that may not fit exactly but is valuable"
    ],

    "contextualFactors": [
      "community rules about topic boundaries",
      "whether user has engaged with the topic before",
      "quality of the post (effort, detail, value to community)",
      "whether other users find it valuable (engagement)"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "DIRECTLY_RELEVANT or clearly OFF_TOPIC/SPAM",
    "mediumConfidence": "TANGENTIALLY_RELEVANT, could go either way",
    "lowConfidence": "LOOSELY_CONNECTED or meta-discussion, judgment call"
  },

  "evidenceRequired": {
    "minPieces": 1,
    "types": ["DIRECTLY_RELEVANT", "OFF_TOPIC", "SPAM"]
  }
}
```

**Customization**: Replace `{TOPIC_NAME}` and `{TOPIC_DESCRIPTION}` with your community's focus.

---

### 5. Account Authenticity Assessment

**Use Case**: Detecting bot accounts, sock puppets, or bad actors

**Template**:
```json
{
  "id": "account_authenticity",
  "question": "Is this account likely a bot, sock puppet, or inauthentic user?",

  "analysisFramework": {
    "evidenceTypes": [
      "BOT_PATTERN: Repetitive posts, scheduled timing, templated responses",
      "SOCK_PUPPET: Brand new account with specific agenda, no organic engagement",
      "KARMA_FARMING: Reposting popular content, generic comments for upvotes",
      "GENUINE_USER: Varied posts, organic conversations, personality evident",
      "NEW_BUT_AUTHENTIC: New account but shows human behavior"
    ],

    "falsePositiveFilters": [
      "new user learning how Reddit works",
      "user with specific interest posting about that interest frequently",
      "user who happens to be online at consistent times (work schedule)",
      "shy user who reads more than they post"
    ],

    "contextualFactors": [
      "account age and karma",
      "posting frequency and timing patterns",
      "variety of topics and subreddits",
      "quality and depth of comments",
      "response to direct questions (do they engage?)"
    ]
  },

  "confidenceGuidance": {
    "highConfidence": "Clear BOT_PATTERN or obvious SOCK_PUPPET with single agenda",
    "mediumConfidence": "Some suspicious patterns but could be legitimate",
    "lowConfidence": "GENUINE_USER or NEW_BUT_AUTHENTIC with reasonable explanation"
  },

  "evidenceRequired": {
    "minPieces": 3,
    "types": ["BOT_PATTERN", "SOCK_PUPPET", "KARMA_FARMING"]
  }
}
```

---

## Best Practices

### 1. Start Simple, Enhance Iteratively

**Step 1**: Start with basic question
```json
{
  "id": "my_rule",
  "question": "Is this spam?"
}
```

**Step 2**: Add false positive filters
```json
{
  "id": "my_rule",
  "question": "Is this spam?",
  "analysisFramework": {
    "falsePositiveFilters": [
      "user answering a question",
      "relevant to discussion"
    ]
  }
}
```

**Step 3**: Add evidence requirements
```json
{
  "id": "my_rule",
  "question": "Is this spam?",
  "analysisFramework": { /* ... */ },
  "evidenceRequired": {
    "minPieces": 2
  }
}
```

### 2. Use Clear, Specific Language

**Bad**: "Is this inappropriate?"
**Good**: "Is this user seeking romantic relationships in violation of Rule 3?"

**Bad**: "Is this okay?"
**Good**: "Does this post contain spam or promotional content?"

### 3. Provide False Positive Filters

Always include at least 3-5 common false positive patterns. Think about:
- What innocent behavior looks similar?
- What discussions might trigger false positives?
- What context makes the behavior acceptable?

### 4. Calibrate Confidence Guidance

Tell the AI what each confidence range means for YOUR use case:

```json
"confidenceGuidance": {
  "highConfidence": "User explicitly states romantic intent with gender preference",
  "mediumConfidence": "Ambiguous language that could be platonic or romantic",
  "lowConfidence": "Clearly discussing topic, not engaging in prohibited behavior"
}
```

### 5. Test with Real Examples

Create 5-10 test cases:
- 2-3 clear violations (should be YES with high confidence)
- 2-3 clear false positives (should be NO with low confidence)
- 2-3 ambiguous cases (could go either way)

### 6. Enable Negation Detection When Relevant

If people might explicitly say "NOT doing X", enable negation handling:

```json
"negationHandling": {
  "enabled": true,
  "patterns": [
    "not {prohibited_action}",
    "don't want {prohibited_action}",
    "just {allowed_action}"
  ]
}
```

### 7. Require Multiple Pieces of Evidence

Reduce false positives by requiring 2+ pieces of evidence:

```json
"evidenceRequired": {
  "minPieces": 2,
  "types": ["DIRECT", "IMPLIED"]
}
```

## Testing Your Rules

### Phase 1: Dry Run Testing

1. **Enable dry-run mode** in settings
2. **Deploy your rule** to a test subreddit
3. **Monitor results** for 24-48 hours
4. **Review flagged posts** - are they actually violations?
5. **Review missed posts** - are you missing real violations?

### Phase 2: Calculate Accuracy

After 100 posts analyzed:
- **False Positive Rate** = (False Positives / Total Flagged) × 100%
- **True Positive Rate** = (True Positives / Total Violations) × 100%

**Target Metrics**:
- False Positive Rate: <10%
- True Positive Rate: >85%

### Phase 3: Iterate and Refine

Based on test results:
- **High false positives?** → Add more false positive filters
- **Missing violations?** → Expand evidence types, lower confidence threshold
- **AI confused?** → Add few-shot examples showing correct analysis

### Testing Checklist

- [ ] Question is clear and specific
- [ ] At least 3 false positive filters provided
- [ ] Confidence guidance calibrated
- [ ] Evidence requirements set (if applicable)
- [ ] Tested on 10+ real examples
- [ ] False positive rate <10%
- [ ] True positive rate >85%
- [ ] Moderators trust the results

## Troubleshooting

### Problem: High False Positive Rate (>20%)

**Symptoms**: AI flags innocent posts frequently

**Solutions**:
1. Add more false positive filters
2. Increase minimum evidence pieces (e.g., from 1 to 2)
3. Add few-shot examples showing false positives
4. Enable negation handling
5. Clarify confidence guidance for low scores

### Problem: Missing Real Violations

**Symptoms**: AI doesn't catch obvious violations

**Solutions**:
1. Expand evidence types to be more inclusive
2. Add few-shot examples showing violations
3. Lower evidence requirements (e.g., from 2 to 1)
4. Clarify what constitutes DIRECT vs IMPLIED evidence

### Problem: AI Confidence Scores Seem Random

**Symptoms**: Similar posts get wildly different confidence scores

**Solutions**:
1. Add explicit confidence guidance
2. Provide more few-shot examples with target confidence levels
3. Clarify evidence types and their relative strength
4. Consider if question is too vague or subjective

### Problem: AI Gives Long, Rambling Reasoning

**Symptoms**: Reasoning is hard to understand or too verbose

**Solutions**:
1. Add output format requirements (e.g., "2-3 sentences max")
2. Provide few-shot examples with concise reasoning
3. Request structured reasoning (bullet points)

### Problem: Rule Works in Tests But Not Production

**Symptoms**: Rule performs well on test cases but poorly on real posts

**Solutions**:
1. Test cases may not represent real distribution
2. Add more diverse test cases
3. Monitor production for a week and add real examples to test suite
4. May need to adjust confidence thresholds based on real data

## Getting Help

### Resources

- **Design Document**: `/docs/enhanced-ai-questions-design.md`
- **Migration Guide**: `/docs/enhanced-ai-questions-migration.md`
- **Example Rules**: `/docs/example-rules/`

### Community

- **r/AIAutomod**: Share rules and get feedback
- **Discord**: Real-time help from other moderators
- **GitHub Issues**: Report bugs or request features

### Support Checklist

When asking for help, provide:
- [ ] Your full question configuration (JSON)
- [ ] 3-5 example posts that aren't working correctly
- [ ] Expected vs actual results
- [ ] What you've already tried

---

**Next Steps**:
1. Choose a template that matches your use case
2. Customize it for your community
3. Test on 10+ examples
4. Deploy in dry-run mode
5. Monitor and iterate

**Remember**: Start simple, test thoroughly, iterate based on real results. You can always add enhancements later!
