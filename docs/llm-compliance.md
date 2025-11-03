# LLM Compliance - Reddit Devvit Rules

## Policy Reference
**Reddit Devvit LLM Policy:** https://developers.reddit.com/docs/devvit_rules#only-use-approved-llms

**Last Updated:** 2025-11-03

---

## Approved LLMs (as of 2025-11-03)

### ✅ OpenAI
- **Models:** GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Current Usage:** GPT-4o-mini (primary/fallback option)
- **API Endpoint:** `api.openai.com`
- **Documentation:** https://platform.openai.com/docs

### ✅ Google Gemini
- **Models:** Gemini 1.5 Flash, Gemini 1.5 Pro
- **Current Usage:** Gemini 1.5 Flash (primary/fallback option)
- **API Endpoint:** `generativelanguage.googleapis.com`
- **Documentation:** https://ai.google.dev/docs

---

## Removed LLMs (Not Approved)

### ❌ Anthropic Claude
- **Reason:** Not approved by Reddit Devvit policy
- **Models Previously Used:** Claude 3.5 Haiku
- **Status:** Code commented out, preserved for potential future restoration
- **File:** `src/ai/claude.ts`

### ❌ OpenAI Compatible Providers
- **Reason:** Custom/third-party LLM endpoints not approved by Reddit
- **Providers Previously Supported:**
  - Groq (llama-3.1-70b-versatile)
  - Together AI (Meta-Llama-3.1-70B-Instruct-Turbo)
  - X.AI Grok
  - Z.AI
  - Self-hosted (vLLM, Ollama)
- **Status:** Code commented out, preserved for potential future restoration
- **File:** `src/ai/openaiCompatible.ts`

---

## Code Preservation Strategy

### Why Preserve Instead of Delete?
Reddit's LLM policy may evolve over time. Preserving deprecated provider code:
- ✅ Allows quick restoration if policy changes
- ✅ Provides reference implementation for new providers
- ✅ Maintains git history and context
- ✅ Reduces risk of reintroducing bugs if providers are re-added

### What Was Preserved?

**Provider Implementations:**
- `src/ai/claude.ts` - Fully commented with deprecation notice
- `src/ai/openaiCompatible.ts` - Fully commented with deprecation notice

**Settings Fields:**
- Claude API Key field - Commented in `src/main.tsx`
- OpenAI Compatible fields (API Key, Base URL, Model) - Commented in `src/main.tsx`

**Type Definitions:**
- `AIProviderType` old values - Commented in `src/types/ai.ts`
- `AIProviderConfig` old fields - Commented in `src/types/config.ts`

**Configuration:**
- HTTP allowlist entries - Removed from `devvit.json` and `src/main.tsx`

---

## Migration Impact

### For Existing Installations

**Claude Users (Primary/Fallback):**
- ⚠️ **Action Required:** Reconfigure to use OpenAI or Gemini
- 📝 **Impact:** Must obtain new API key and update settings
- 💰 **Cost:** Gemini is cheaper than Claude ($0.075 vs $0.25 per 1M input tokens)
- 🔧 **Steps:**
  1. Get Gemini API key: https://aistudio.google.com/apikey
  2. OR get OpenAI API key: https://platform.openai.com/api-keys
  3. Update AI Automod settings in subreddit
  4. Test with a new post to verify working

**OpenAI Compatible Users:**
- ⚠️ **Action Required:** Switch to OpenAI or Gemini
- 📝 **Impact:** Must use official approved providers
- 💰 **Cost:** Official providers may be more expensive than some alternatives
- 🔧 **Steps:** Same as Claude users above

**OpenAI Users:**
- ✅ **No Action Required:** Continue using existing configuration
- 📝 **Optional:** Consider Gemini as fallback for redundancy

---

## Provider Comparison

| Provider | Model | Input Cost (per 1M tokens) | Output Cost (per 1M tokens) | Context Window |
|----------|-------|---------------------------|----------------------------|----------------|
| **OpenAI** | GPT-4o-mini | $0.15 | $0.60 | 128K |
| **Gemini** | 1.5 Flash | $0.075 | $0.30 | 1M |
| ~~Claude~~ | ~~3.5 Haiku~~ | ~~$0.25~~ | ~~$1.25~~ | ~~200K~~ |

**Cost Comparison:**
- Gemini is **50% cheaper** than OpenAI
- Gemini is **70% cheaper** than Claude (removed)
- Gemini has **8x larger context** than OpenAI/Claude

**Recommendation:** Use **Gemini 1.5 Flash** as primary for cost savings, **OpenAI GPT-4o-mini** as fallback for reliability.

---

## Settings Changes

### New Default Configuration

**Before (v0.1.106 and earlier):**
```json
{
  "primaryProvider": "claude",
  "fallbackProvider": "openai"
}
```

**After (v0.1.107+):**
```json
{
  "primaryProvider": "openai",
  "fallbackProvider": "gemini"
}
```

### Settings UI Changes

**Removed from UI:**
- ❌ Claude 3.5 Haiku (Anthropic) - Primary provider option
- ❌ Claude 3.5 Haiku (Anthropic) - Fallback provider option
- ❌ OpenAI Compatible (Custom) - Primary provider option
- ❌ OpenAI Compatible (Custom) - Fallback provider option
- ❌ Claude API Key field
- ❌ OpenAI Compatible API Key field
- ❌ OpenAI Compatible Base URL field
- ❌ OpenAI Compatible Model field

**Added to UI:**
- ✅ Gemini 1.5 Flash (Google) - Primary provider option
- ✅ Gemini 1.5 Flash (Google) - Fallback provider option
- ✅ Gemini API Key field

---

## HTTP Allowlist Changes

### Before (v0.1.106 and earlier)
```javascript
allowList: [
  'api.anthropic.com',      // Claude
  'api.openai.com',         // OpenAI
  'api.z.ai',              // Z.AI (OpenAI Compatible)
  'api.x.ai',              // X.AI/Grok (OpenAI Compatible)
  'api.groq.com',          // Groq (OpenAI Compatible)
]
```

### After (v0.1.107+)
```javascript
allowList: [
  'api.openai.com',                      // OpenAI
  'generativelanguage.googleapis.com',   // Google Gemini
]
```

---

## Testing Requirements

### Pre-Deployment Testing

**Required Test Cases:**
1. ✅ OpenAI as primary, Gemini as fallback
2. ✅ Gemini as primary, OpenAI as fallback
3. ✅ OpenAI only (fallback: none)
4. ✅ Gemini only (fallback: none)
5. ✅ Primary fails → Fallback succeeds
6. ✅ Both providers fail → Returns null, flags for review
7. ✅ Cost tracking accurate for OpenAI
8. ✅ Cost tracking accurate for Gemini
9. ✅ Settings UI shows only approved options
10. ✅ Question-based analysis works with both providers

### Manual Testing Checklist
- [ ] Configure OpenAI key only → Submit test post
- [ ] Configure Gemini key only → Submit test post
- [ ] Configure both keys → Test fallback by using invalid primary key
- [ ] Test with invalid keys → Verify error handling
- [ ] Check cost dashboard → Verify provider breakdown correct
- [ ] Check analysis history → Verify provider/model recorded correctly
- [ ] Verify settings UI doesn't show deprecated options
- [ ] Test in private subreddit before production

---

## Rollback Plan

### If Issues Arise After Deployment

**Scenario 1: Gemini provider has bugs**
- Use OpenAI only (set fallback to "none")
- Fix Gemini provider in next version
- No rollback needed - OpenAI remains stable

**Scenario 2: Both providers failing**
- Check API keys are valid
- Check HTTP allowlist includes correct domains
- Check Reddit API status
- As last resort: Disable Layer 3 AI rules temporarily

**Scenario 3: Reddit policy changes (allows Claude again)**
- Uncomment Claude provider code
- Add `api.anthropic.com` back to HTTP allowlist
- Uncomment Claude settings fields
- Update type definitions
- Deploy as minor version update

---

## Frequently Asked Questions

### Q: Can I still use Claude if I really want to?
**A:** No. Reddit Devvit explicitly prohibits non-approved LLMs. Attempting to use Claude will result in app rejection during review.

### Q: What about open-source models via OpenAI Compatible API?
**A:** Not approved by Reddit. Only official OpenAI and Gemini endpoints are allowed.

### Q: Will Reddit add more approved LLMs in the future?
**A:** Possibly. We've preserved deprecated code to make restoration easier if policy changes.

### Q: Which provider should I use?
**A:** **Gemini** is recommended as primary (cheaper, larger context). Use **OpenAI** as fallback for reliability.

### Q: Do I need both API keys?
**A:** No, but recommended. Having both provides redundancy if one provider has issues.

### Q: How do I get API keys?
**A:**
- OpenAI: https://platform.openai.com/api-keys
- Gemini: https://aistudio.google.com/apikey

### Q: Will my old Claude API key cause errors?
**A:** No. Old API keys in settings are simply ignored. They don't cause errors but also don't work.

---

## Compliance Verification

### How to Verify Your Installation is Compliant

**Check 1: Settings UI**
```
✅ Only shows OpenAI and Gemini options
✅ No Claude option visible
✅ No OpenAI Compatible option visible
```

**Check 2: devvit.json**
```json
{
  "permissions": {
    "http": {
      "domains": [
        "api.openai.com",
        "generativelanguage.googleapis.com"
      ]
    }
  }
}
```

**Check 3: Analysis Logs**
```
[AIAnalyzer] Trying primary provider: openai  ✅
[AIAnalyzer] Trying fallback provider: gemini ✅

// These should NEVER appear:
[AIAnalyzer] Trying primary provider: claude  ❌
[AIAnalyzer] Trying primary provider: openai-compatible ❌
```

---

## Related Documentation

- **Reddit Devvit Rules:** https://developers.reddit.com/docs/devvit_rules
- **Implementation Plan:** See commit message for v0.1.107
- **Provider Comparison:** `docs/ai-provider-comparison.md`
- **Gemini Provider Docs:** `src/ai/gemini.ts`

---

## Change History

| Date | Version | Change | Reason |
|------|---------|--------|--------|
| 2025-11-03 | v0.1.107 | Removed Claude, OpenAI Compatible; Added Gemini | Reddit policy compliance |

---

**Document Version:** 1.0
**Last Updated:** 2025-11-03
**Maintainer:** AI Automod Team
