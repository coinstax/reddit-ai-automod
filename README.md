# AI Automod for Reddit

> **Intelligent User Profiling & Moderation for Reddit Communities**

A Reddit Devvit app that uses AI to analyze new posters and detect problematic users before they cause harm. Built for moderators who want to protect their communities from undesirable users or scammers.

[![Version](https://img.shields.io/badge/version-0.1.108-blue)]()
[![Status](https://img.shields.io/badge/status-Production%20Ready-green)]()
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## What It Does

Instead of waiting for bad actors to post harmful content, this app **proactively analyzes new users** when they make their first post or comment. It examines:

- **User Profile**: Account age, karma, email verification status
- **Post History**: Up to 200 posts/comments (100 posts + 100 comments) from ALL subreddits
- **AI Analysis**: Custom questions you define (e.g., "Does this user appear to be promoting a service?")

Based on configurable rules, the app can:
- **FLAG**: Report to mod queue for human review
- **REMOVE**: Remove post and leave an explanatory comment
- **COMMENT**: Warn user without removing post
- **APPROVE**: Allow post (default for trusted users)

---

## Key Features

**User Profiling & Trust Scoring**
- Analyzes account age, karma, email verification status
- Fetches up to 200 posts/comments (100 posts + 100 comments) from ALL subreddits (not just yours)
- Content sanitization reduces AI token usage by 40-60% (removes URLs, markdown, excessive whitespace)
- Calculates trust score (0-100) to bypass expensive AI analysis for returning good users
- Caching system reduces API calls and costs (24-48h TTL)

**AI-Powered Analysis** (Reddit-Approved Providers Only)
- Works with OpenAI GPT-4o-mini or Google Gemini 1.5 Flash (automatic failover)
- Enhanced AI Questions system reduces false positives from 40% to <10%
- You ask custom questions in plain English (e.g., "Is this user promoting a service?")
- AI provides YES/NO answers with confidence scores and structured evidence
- Confidence calibration, evidence extraction, and negation detection built-in
- Set your own confidence thresholds for actions

**Flexible Rules System**
- **HardRules**: Fast, deterministic checks (account age, karma, links, keywords)
- **AIRules**: Custom AI questions with confidence thresholds
- Content type filtering (apply rules to posts, comments, or both)
- Priority-based execution
- Dry-run mode for safe testing

**Cost Control**
- Daily and monthly budget limits with real-time tracking
- Trust score system reduces costs by ~50% (skips AI for trusted users)
- Gemini 1.5 Flash is 50% cheaper than OpenAI GPT-4o-mini
- AI analysis history with cost tracking per decision

**Security & Privacy**
- Only analyzes public Reddit data (no private messages)
- PII sanitization before AI analysis (removes emails, phones, credit cards)
- Prevents injection attacks and malicious regex patterns
- Complete audit logging for every action taken

---

## Layer 3: Custom Rules + AI

Write custom moderation rules in JSON. Configure via Settings → Layer 3 - Custom Rules.

### Minimal Rule Format

Every rule needs just two things:
- `conditions` - What to check
- `action` - What to do (APPROVE, FLAG, REMOVE, COMMENT)

```json
{
  "rules": [
    {
      "conditions": { "field": "profile.totalKarma", "operator": "<", "value": 100 },
      "action": "FLAG"
    }
  ]
}
```

### Complete Schema Reference

#### Top-Level Structure
```json
{
  "version": "1.0",           // Optional, defaults to "1.0"
  "rules": [ ... ]            // Required, array of rules
}
```

#### Rule Fields
| Field | Required? | Default | Description |
|-------|-----------|---------|-------------|
| `conditions` | ✅ Yes | - | What to check (see Conditions below) |
| `action` | ✅ Yes | - | What to do: APPROVE, FLAG, REMOVE, COMMENT |
| `id` | Optional | Auto-generated | Unique identifier (auto-generated from question if omitted) |
| `enabled` | Optional | `true` | Enable/disable this rule |
| `priority` | Optional | Array order × 10 | Lower number = higher priority |
| `contentType` | Optional | `"all"` | Apply to: "post", "comment", or "all" |
| `actionConfig` | Optional | - | Customize action behavior (see ActionConfig below) |
| `ai` | Optional | - | Ask AI a question (see AI Questions below) |

#### Conditions

**Simple Condition:**
```json
{
  "field": "profile.totalKarma",
  "operator": "<",
  "value": 100
}
```

**Nested Conditions (AND/OR):**
```json
{
  "logicalOperator": "AND",
  "rules": [
    { "field": "profile.accountAgeMonths", "operator": "<", "value": 6 },
    { "field": "profile.totalKarma", "operator": "<", "value": 100 }
  ]
}
```

**Available Operators:**
| Operator | Description | Example |
|----------|-------------|---------|
| `<`, `>`, `<=`, `>=` | Numeric comparison | `"operator": "<", "value": 100` |
| `==`, `!=` | Equality | `"operator": "==", "value": "YES"` |
| `contains`, `contains_i` | Text contains (case-sensitive/insensitive) | `"operator": "contains", "value": "dating"` |
| `regex`, `regex_i` | Regex match (case-sensitive/insensitive) | `"operator": "regex", "value": "\\bspam\\b"` |
| `in` | Value in array | `"operator": "in", "value": ["NSFW", "Trading"]` |

**Available Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `profile.accountAgeMonths` | number | Account age in months |
| `profile.totalKarma` | number | Total karma (post + comment) |
| `profile.commentKarma` | number | Comment karma only |
| `profile.postKarma` | number | Post karma only |
| `profile.isVerified` | boolean | Email verified? |
| `postHistory.totalPosts` | number | Total posts across Reddit |
| `postHistory.totalComments` | number | Total comments across Reddit |
| `postHistory.subreddits` | array | List of subreddits posted in |
| `currentPost.title` | string | Post title |
| `currentPost.body` | string | Post body text |
| `currentPost.type` | string | "text", "link", "image", "video" |
| `currentPost.wordCount` | number | Word count in post |
| `currentPost.domains` | array | Domains linked in post |
| `ai.answer` | string | Current rule's AI answer (YES/NO/UNKNOWN) |
| `ai.confidence` | number | Current rule's AI confidence (0-100) |
| `ai.reasoning` | string | Current rule's AI reasoning |
| `ai.[question_id].answer` | string | Another rule's AI answer |
| `ai.[question_id].confidence` | number | Another rule's AI confidence |

#### ActionConfig

Customize the action's behavior:

```json
{
  "actionConfig": {
    "reason": "This is not a dating site",
    "modlog": "Dating intent detected with 85% confidence"
  }
}
```

| Field | Used By | Description |
|-------|---------|-------------|
| `reason` | FLAG, REMOVE, COMMENT | User-facing reason shown in removal/warning comments (inserted into template) |
| `modlog` | REMOVE, COMMENT | Optional: Detailed information for mod logs only (not shown to users) |

**Note:** The `reason` field is inserted into comment templates. Templates can be customized in settings or use professional defaults.

**Variable Substitution:** Use `{field.path}` to insert values:
- `{profile.totalKarma}` → User's karma
- `{ai.confidence}` → AI confidence score
- `{ai.reasoning}` → AI reasoning text
- `{currentPost.title}` → Post title

#### AI Questions

Ask AI to analyze the user and their content:

```json
{
  "ai": {
    "question": "Is this user posting dating/romance content?",
    "id": "dating_check",        // Optional, auto-generated from question
    "context": "This is FriendsOver40, platonic friendships only"  // Optional
  },
  "conditions": {
    "field": "ai.answer",
    "operator": "==",
    "value": "YES"
  },
  "action": "REMOVE"
}
```

**AI Field Access:**
- `ai.answer` → Current rule's AI answer (YES/NO/UNKNOWN)
- `ai.confidence` → Current rule's confidence (0-100)
- `ai.reasoning` → Current rule's reasoning text
- `ai.[other_id].answer` → Reference another rule's answer
- `ai.[other_id].confidence` → Reference another rule's confidence

**Combining Multiple AI Checks:**
```json
{
  "rules": [
    {
      "ai": { "question": "Is this dating content?" },
      "conditions": { "field": "ai.answer", "operator": "==", "value": "YES" },
      "action": "FLAG"
    },
    {
      "ai": { "question": "Does the user appear underage?" },
      "conditions": {
        "logicalOperator": "AND",
        "rules": [
          { "field": "ai.dating_content.answer", "operator": "==", "value": "YES" },
          { "field": "ai.answer", "operator": "==", "value": "YES" }
        ]
      },
      "action": "REMOVE"
    }
  ]
}
```

### Example Rules

**Example 1: Flag Low-Karma New Accounts**
```json
{
  "rules": [
    {
      "conditions": {
        "logicalOperator": "AND",
        "rules": [
          { "field": "profile.accountAgeMonths", "operator": "<", "value": 3 },
          { "field": "profile.totalKarma", "operator": "<", "value": 50 }
        ]
      },
      "action": "FLAG",
      "actionConfig": {
        "reason": "New account with low karma"
      }
    }
  ]
}
```

**Example 2: Remove Dating Posts with AI**
```json
{
  "rules": [
    {
      "ai": {
        "question": "Is this user seeking dating or romance?",
        "context": "This is a platonic friendship subreddit for people over 40"
      },
      "conditions": {
        "logicalOperator": "AND",
        "rules": [
          { "field": "ai.answer", "operator": "==", "value": "YES" },
          { "field": "ai.confidence", "operator": ">", "value": 75 }
        ]
      },
      "action": "REMOVE",
      "actionConfig": {
        "reason": "This is not a dating site",
        "modlog": "Dating/romance content detected with {ai.confidence}% confidence"
      }
    }
  ]
}
```

**Example 3: Comment-Only Spam Detection**
```json
{
  "rules": [
    {
      "contentType": "comment",
      "conditions": {
        "field": "currentPost.body",
        "operator": "regex_i",
        "value": "\\b(buy now|click here|limited offer)\\b"
      },
      "action": "REMOVE",
      "actionConfig": {
        "reason": "Spam detected in comment"
      }
    }
  ]
}
```

---

## Security & Privacy

**What We Access**
- User account age, karma, and email verification (public data only)
- Up to 200 posts/comments (100 posts + 100 comments) from all subreddits (public data only)
- Post/comment content text

**What We Don't Access**
- Private messages
- Restricted or quarantined subreddit content
- Any non-public data

**How We Protect You**
- PII is removed before AI analysis (emails, phones, credit cards, URLs)
- API keys encrypted in settings
- Complete audit logs for all actions
- No data shared with third parties except for AI analysis
- Compliance with Reddit API Terms of Service

---

## Data Access & Privacy

### What We Can Access

**Public User Data:**
- Account age, karma, and email verification status
- **Public** post and comment history across Reddit (up to 200 items)
- Only publicly visible content that any Reddit user can see

**Site-Wide vs Subreddit-Scoped:**
- ✅ Accesses user's public activity from ALL subreddits (site-wide)
- Not limited to the subreddit where the app is installed
- This enables detecting behavior patterns across Reddit

### What We Cannot Access

**Limitations:**
- ❌ Private or hidden user profiles
- ❌ Deleted content
- ❌ Private messages or chats
- ❌ Restricted subreddit content (quarantined, private subs)
- ❌ Content the user has hidden from their profile

### Private Profile Handling

If a user has made their profile private:
- We **cannot** access their post/comment history
- We fall back to basic account metrics only (age, karma)
- The moderation decision uses limited data
- No AI analysis is performed (insufficient context)

**Privacy Note**: This app only accesses data that is already publicly visible on Reddit. We do not access any private information that wouldn't be visible to a regular Reddit user viewing the profile.

---

## Fetch Domains

The following domains are requested for this app:

- `api.anthropic.com` - Used for Claude 3.5 Haiku AI analysis of user profiles and post history to detect scammers, dating seekers, and problematic users (Devvit does not provide AI capabilities natively)
- `api.openai.com` - Used for OpenAI GPT-4o Mini AI analysis as fallback provider and for free content moderation via OpenAI Moderation API (Devvit does not provide AI capabilities natively)
- `api.x.ai` - Used for X.AI Grok AI analysis as OpenAI-compatible alternative provider (Devvit does not provide AI capabilities natively)
- `api.z.ai` - Used for Z.AI ChatGLM AI analysis as OpenAI-compatible alternative provider (Devvit does not provide AI capabilities natively)
- `api.groq.com` - Used for Groq AI analysis with Llama models as OpenAI-compatible alternative provider (Devvit does not provide AI capabilities natively)
- `api.deepseek.com` - Used for DeepSeek AI analysis as OpenAI-compatible alternative provider (Devvit does not provide AI capabilities natively)

---

## Configuration Notes

### Domain Approval Process

This app uses `devvit.json` (NOT `devvit.yaml`) for configuration. This is critical for domain approval:

- **✅ REQUIRED**: `devvit.json` with `permissions.http.domains` array
- **❌ DEPRECATED**: `devvit.yaml` with `http.fetch.allowList` does NOT trigger domain approval

When you upload the app with `devvit upload`, domains listed in `devvit.json` are automatically submitted to Reddit admins for review and will appear in the Developer Settings > Domain Exceptions section.

---

## Development

### Uploading New Versions

Use the automated upload script that handles version synchronization:

```bash
# Patch version bump (0.1.85 → 0.1.86) - default
npm run upload

# Or specify bump type
npm run upload:patch    # 0.1.85 → 0.1.86
npm run upload:minor    # 0.1.85 → 0.2.0
npm run upload:major    # 0.1.85 → 1.0.0
```

**What the script does:**
1. Uploads to Reddit with version bump (`devvit upload --bump patch`)
2. Extracts the new version number from upload response
3. Updates `README.md` version badge automatically
4. Updates `package.json` version automatically
5. Commits the version changes
6. Pushes to remote repository

**After upload, manually update:**
- `docs/project-status.md` - Current Version field
- `docs/resume-prompt.md` - Current Version field

### Other Commands

```bash
# Development & Testing
npm run dev              # Start playtest mode
npm run playtest         # Alias for dev
npm run typecheck        # Type check without building
npm run test             # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report

# Logs
npm run logs             # View app logs
devvit logs AiAutomod    # Direct devvit logs command
```

---

## License

AI Automod is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- ✅ You can use, modify, and distribute this software
- ✅ You must share your modifications under AGPL-3.0
- ✅ If you run a modified version as a service (including as a Devvit app), you MUST make your source code available to users
- ✅ You must preserve copyright and license notices

**Why AGPL?** We chose AGPL to ensure that any improvements to AI Automod benefit the entire Reddit moderation community. If you build on our work, we ask that you share your improvements back.

For commercial licensing inquiries, contact aiautomod at coins.tax

---

## Acknowledgments

- **Reddit Devvit Team** - For the platform and developer tools
- **Anthropic** - For Claude 3.5 Haiku API
- **OpenAI** - For GPT-4o Mini API
- **DeepSeek** - For DeepSeek V3 API
