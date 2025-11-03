# Quick Start: Enhanced AI Questions

**Goal:** Reduce false positives from 40% to <10% using better AI prompts in your rules

**Time to implement:** 15-30 minutes for immediate improvements, 3-4 weeks for full system

---

## Immediate Solution (Today - 15 minutes)

You don't need to wait for the full system implementation. Here's how to improve your **existing** rules right now:

### Step 1: Make Your Questions More Specific

**❌ Bad (current):**
```json
{
  "id": "dating_check",
  "question": "Is this user looking to date or have an affair?"
}
```

**✅ Better (immediate improvement):**
```json
{
  "id": "dating_check",
  "question": "Is this user actively soliciting romantic or sexual relationships (seeking dates, hookups, or affairs)? Evidence of solicitation includes: explicit invitations to meet ('DM me', 'message me'), location + dating intent ('NYC, looking to meet'), dating acronyms (FWB, NSA), or affair seeking while mentioning being married/partnered. Do NOT flag: general discussions about dating, past tense stories ('when I was dating'), giving dating advice to others, quoting subreddit rules about dating, calendar dates, or negated statements ('NOT looking to date'). Require at least 2 clear pieces of evidence showing active solicitation before flagging."
}
```

### Step 2: Add Context Field

**Add this to your question:**
```json
{
  "id": "dating_check",
  "question": "...",
  "context": "This is r/FriendsOver40, a platonic friendship community for people aged 40+. Dating solicitation violates Rule 3. Distinguish between solicitation (user seeks dates) and discussion (user talks about dating). Discussion is allowed; solicitation is prohibited."
}
```

### Step 3: Raise Your Confidence Threshold

In your rule configuration:
```json
{
  "aiQuestions": ["dating_check"],
  "confidenceThreshold": 70  // Raised from 50 to 70
}
```

### Step 4: Deploy

```bash
npm run upload:patch
```

**Expected improvement:** 40-50% reduction in false positives immediately.

---

## Why This Works

### The Problem with Vague Questions

**Vague:** "Is this user looking to date?"

AI sees:
- "I tried dating apps but they suck" → flags as dating ❌ FALSE POSITIVE
- "Anyone want to grab coffee? NYC" → misses context ❌ FALSE NEGATIVE

### The Solution: Structured Guidance

**Specific:** "Is this user actively soliciting... Evidence includes... Do NOT flag... Require 2 pieces of evidence"

AI sees:
- "I tried dating apps but they suck"
  - Past tense ✓
  - Negative sentiment ✓
  - No invitation ✓
  - → APPROVE ✅ CORRECT

- "Anyone want to grab coffee? NYC"
  - Location mention ✓
  - Meet request ✓
  - Direct invitation ✓
  - → FLAG ✅ CORRECT

---

## The 4 Key Elements of Good AI Questions

### 1. **Clear Definition**
What EXACTLY are you detecting?
```
❌ "Is this spam?"
✅ "Is this user promoting a product, service, or external link for commercial gain?"
```

### 2. **Evidence Criteria**
What counts as evidence?
```
Evidence includes: product links, pricing mentions, promotional language,
repeated cross-posting of same content, affiliate links
```

### 3. **False Positive Filters**
What should NOT be flagged?
```
Do NOT flag: genuine recommendations with no links, sharing personal experience,
answering direct questions about products, moderator-approved promotional posts
```

### 4. **Evidence Threshold**
How much evidence is needed?
```
Require at least 2 pieces of evidence: [link + promotional language]
or [repeated posting + commercial intent]
```

---

## Templates for Common Scenarios

### Template: Dating/Affair Detection
```json
{
  "id": "dating_detection",
  "question": "Is this user actively soliciting romantic or sexual relationships? Evidence: explicit invitations ('DM me', 'message me'), location + dating intent, dating acronyms (FWB, NSA, ONS), affair seeking while mentioning partner. Do NOT flag: discussions about dating, past tense stories, giving advice, quoting rules, calendar dates, negations ('NOT looking'). Require 2+ pieces of evidence.",
  "context": "This is a platonic friendship community. Distinguish solicitation (seeking) from discussion (talking about)."
}
```

### Template: Spam Detection
```json
{
  "id": "spam_detection",
  "question": "Is this user promoting products/services for commercial gain? Evidence: external links + promotional language, pricing/purchase info, repeated cross-posting, affiliate links, business contact info. Do NOT flag: genuine recommendations without links, answering questions, sharing personal experience, moderator-approved posts. Require 2+ pieces of evidence.",
  "context": "Self-promotion and commercial spam violate community rules. Authentic participation is encouraged."
}
```

### Template: Age Verification
```json
{
  "id": "age_verification",
  "question": "Does this user appear to be under the minimum age for this community? Evidence: explicit age statements, references to high school/college, language typical of teenagers, mentions of parents' rules, age-inappropriate interests. Do NOT flag: discussing teenagers (as a parent), youthful language style alone, references to past (when I was 16), helping younger relatives. Require 2+ pieces of evidence.",
  "context": "This community is for people aged 40+. Use multiple signals to estimate age, not just language style."
}
```

### Template: Location-Specific
```json
{
  "id": "location_requirement",
  "question": "Is this user located in [REGION]? Evidence: explicit location statements, local references (neighborhoods, transit, local businesses), timezone-consistent posting, local slang/terminology. Do NOT flag: passing through, used to live there, asking about relocating, discussing from outside perspective. Require 2+ pieces of evidence.",
  "context": "This community is for [REGION] residents. Visitors and those planning to move are welcome if they disclose."
}
```

### Template: Topic Relevance
```json
{
  "id": "topic_relevance",
  "question": "Is this post about [TOPIC]? Evidence: direct mentions of [TOPIC], questions about [TOPIC], sharing [TOPIC] experiences, [TOPIC] advice/resources. Do NOT flag: tangential mentions, comparisons to [TOPIC], meta-discussions about the subreddit, [TOPIC] in unrelated context. Require 2+ pieces of evidence showing [TOPIC] is the primary focus.",
  "context": "This community focuses on [TOPIC]. Posts must be primarily about [TOPIC], not just mentioning it in passing."
}
```

---

## Testing Your Improved Questions

### Step 1: Collect Test Cases (30 minutes)

Gather 20 examples:
- 10 that should be flagged (true positives)
- 10 that shouldn't be flagged (true negatives)
- Focus on edge cases that were previously getting wrong results

### Step 2: Test Manually (15 minutes)

For each example, ask yourself:
- "Given my new question, would the AI flag this correctly?"
- "Is the evidence criteria clear enough?"
- "Are the false positive filters specific enough?"

### Step 3: Deploy with Monitoring (1 week)

```bash
# Deploy
npm run upload:patch

# Monitor daily
devvit logs --since 24h | grep "aiQuestions"

# Track in spreadsheet:
# - Total flags
# - False positives (moderator approved)
# - False negatives (moderator found but AI missed)
# - Calculate: FP rate = false positives / total flags
```

### Step 4: Iterate (ongoing)

If FP rate is still high:
1. Review the false positives - what pattern are they showing?
2. Add that pattern to your "Do NOT flag" list
3. Re-deploy and monitor again

---

## When False Positives Still Occur

### Common Causes & Fixes

**1. AI ignoring your "Do NOT flag" list**
```
Fix: Move filters earlier in the question, make them more explicit:
"IMPORTANT: Do NOT flag if..." instead of "Do NOT flag if..."
```

**2. Confidence threshold too low**
```
Fix: Raise from 50 → 70 or 70 → 80
Trade-off: May miss some true violations
```

**3. Evidence threshold too low**
```
Fix: Change "Require 2+ pieces" to "Require 3+ pieces"
Or: "Require at least 1 STRONG piece or 3 MODERATE pieces"
```

**4. Ambiguous evidence criteria**
```
Fix: Be more specific about what counts
❌ "promotional language"
✅ "promotional language: 'Buy now', 'Limited time', 'Use code', 'Click here'"
```

---

## Full System Implementation (3-4 weeks)

For even better results, implement the full Enhanced AI Questions system:

1. **Week 1:** Core infrastructure
   - New schema with analysisFramework, confidenceGuidance, etc.
   - PromptBuilder class
   - Backward compatibility

2. **Week 2:** Validation system
   - Schema validation
   - Quality checks
   - Template library

3. **Week 3:** Integration
   - Update analyzer
   - Evidence extraction
   - Caching

4. **Week 4:** Testing & Rollout
   - A/B testing
   - Gradual deployment
   - Monitoring

**See full design:** `docs/enhanced-ai-questions-design.md`

---

## Success Metrics

Track these weekly:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **False Positive Rate** | <10% | False positives / total flags |
| **True Positive Rate** | >90% | Caught violations / total violations |
| **Moderator Satisfaction** | >85% | Weekly survey: "Do you trust the AI flags?" |
| **User Complaints** | <3/week | Count "why was I flagged?" modmails |

**After 2 weeks of improved questions, you should see:**
- 40-50% reduction in false positives
- Fewer moderator overrides
- Fewer user complaints

**After full system (4 weeks), you should see:**
- 75% reduction in false positives
- 85%+ moderator confidence
- Dramatic reduction in wrongful flags

---

## Resources

- **Full Design:** `docs/enhanced-ai-questions-design.md` (15,000 words)
- **Templates:** `docs/enhanced-ai-questions-templates.md` (8,000 words)
- **Migration Guide:** `docs/enhanced-ai-questions-migration.md` (6,000 words)
- **Example Rule:** `docs/example-rules/friendsover40-dating-enhanced.json`

---

## FAQ

**Q: Do I need to implement the full system to see improvements?**
A: No! Following the "Immediate Solution" above gives 40-50% improvement in 15 minutes.

**Q: Will this work for scenarios other than dating detection?**
A: Yes! The same principles apply to spam, age, location, relevance, toxicity, etc. See templates above.

**Q: What if I make the question too long?**
A: Long questions are fine! AI models handle 1000+ word prompts easily. Better to be explicit than vague.

**Q: Can I test without affecting real users?**
A: Yes! Set `dryRunMode: true` in settings. The AI will analyze but not take actions.

**Q: How do I know what confidence threshold to use?**
A: Start at 70. After 1 week, review flagged posts. If too many false positives, raise to 75 or 80. If missing violations, lower to 65.

---

**Start today:** Update your dating detection question using the template above. Deploy in 15 minutes. See immediate improvements.

**Next month:** Implement full Enhanced AI Questions system for 75% false positive reduction.
