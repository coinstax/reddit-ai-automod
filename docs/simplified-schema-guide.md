# Simplified Rule Schema Guide

## Overview

The Reddit AI Automod rule system now supports a **simplified JSON schema** that makes it much easier for moderators to write rules. The schema validator automatically fills in missing fields with sensible defaults.

## What Changed

### Before (Old Schema)
Moderators had to specify many fields manually:

```json
{
  "version": "1.0",
  "subreddit": "MySubreddit",
  "dryRunMode": true,
  "updatedAt": 1234567890,
  "rules": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Low Karma Check",
      "type": "HARD",
      "enabled": true,
      "priority": 100,
      "contentType": "submission",
      "subreddit": null,
      "conditions": { ... },
      "action": "FLAG",
      "actionConfig": {
        "reason": "Low karma"
      }
    }
  ]
}
```

### After (New Schema)
Moderators only need to specify the essentials:

```json
{
  "rules": [
    {
      "conditions": {
        "field": "profile.totalKarma",
        "operator": "<",
        "value": 100
      },
      "action": "FLAG"
    }
  ]
}
```

## Simplified Schema Reference

### Top-Level RuleSet

**Required Fields:**
- `rules` (array) - Array of rule objects

**Optional Fields (Auto-Generated):**
- `version` - Defaults to `"1.0"`
- All other internal fields are added automatically

### Rule Object

**Required Fields:**
- `conditions` (object) - The condition tree to evaluate
- `action` (string) - One of: `"APPROVE"`, `"FLAG"`, `"REMOVE"`, `"COMMENT"`

**Optional Fields (Auto-Generated):**
- `id` - Auto-generated UUID if not provided
- `type` - Auto-deduced from presence of `ai` or `aiQuestion` field
  - Rules with `ai` or `aiQuestion` → `"AI"`
  - Rules without `ai` or `aiQuestion` → `"HARD"`
- `enabled` - Defaults to `true`
- `priority` - Defaults to array index × 10 (0, 10, 20, ...)
- `contentType` - Defaults to `"all"`
  - Accepts: `"post"`, `"comment"`, `"all"`
  - Internally mapped to: `"submission"`, `"comment"`, `"any"`
- `actionConfig` - Defaults to `{ reason: "Rule matched" }`

### AI Field (New Format)

**For AI-powered rules, use the simplified `ai` field:**
- `question` (string, required) - The natural language question to ask
- `id` (string, optional) - Question identifier, auto-generated from question if not provided
- `context` (string, optional) - Additional context for the AI

**Example:**
```json
{
  "ai": {
    "question": "Is this dating-related?"
  }
}
```

**Backward Compatibility:** The old `aiQuestion` field is still supported but deprecated. New rules should use `ai`.

## Field Access Patterns

### Accessing AI Analysis Results

**New Intuitive Syntax:**

For the **current rule's AI answer**:
- `ai.answer` - The YES/NO answer
- `ai.confidence` - Confidence score (0-100)
- `ai.reasoning` - AI's explanation

For **other rules' AI answers**:
- `ai.[question_id].answer` - Answer from another question
- `ai.[question_id].confidence` - Confidence from another question
- `ai.[question_id].reasoning` - Reasoning from another question

**Example:**
```json
{
  "ai": {
    "question": "Is this dating-related?"
  },
  "conditions": {
    "field": "ai.answer",
    "operator": "==",
    "value": "YES"
  },
  "action": "FLAG",
  "actionConfig": {
    "reason": "Dating content detected with {ai.confidence}% confidence: {ai.reasoning}"
  }
}
```

**Legacy Syntax (Still Supported):**
- `aiAnalysis.answers.[question_id].answer`
- `aiAnalysis.answers.[question_id].confidence`
- `aiAnalysis.answers.[question_id].reasoning`

The new `ai.*` syntax is shorter and more intuitive. Use it for new rules!

## Examples

### Example 1: Simple Karma Check

```json
{
  "rules": [
    {
      "conditions": {
        "field": "profile.totalKarma",
        "operator": "<",
        "value": 100
      },
      "action": "FLAG"
    }
  ]
}
```

**What Gets Generated:**
- `id`: Auto-generated UUID
- `name`: `"Rule 1"`
- `type`: `"HARD"` (no aiQuestion)
- `enabled`: `true`
- `priority`: `0` (first rule)
- `contentType`: `"any"` (applies to all content)
- `actionConfig`: `{ reason: "Rule matched" }`

### Example 2: AI-Powered Spam Detection

**New Syntax (Recommended):**
```json
{
  "rules": [
    {
      "ai": {
        "question": "Is this post spam?"
      },
      "conditions": {
        "field": "ai.answer",
        "operator": "==",
        "value": "YES"
      },
      "action": "REMOVE",
      "actionConfig": {
        "reason": "Detected as spam by AI with {ai.confidence}% confidence",
        "comment": "Your post was removed as it appears to be spam."
      }
    }
  ]
}
```

**What Gets Generated:**
- `id`: Auto-generated UUID
- `name`: `"Rule 1"`
- `type`: `"AI"` (has ai field)
- `enabled`: `true`
- `priority`: `0`
- `contentType`: `"any"`
- `ai.id`: Auto-generated from question (e.g., `"is_this_post_spam"`)

### Example 3: Multiple Rules with Priority

```json
{
  "rules": [
    {
      "priority": 100,
      "conditions": {
        "field": "profile.isModerator",
        "operator": "==",
        "value": true
      },
      "action": "APPROVE"
    },
    {
      "contentType": "post",
      "conditions": {
        "field": "currentPost.wordCount",
        "operator": "<",
        "value": 10
      },
      "action": "FLAG",
      "actionConfig": {
        "reason": "Post too short"
      }
    }
  ]
}
```

**What Gets Generated:**
- Rule 0:
  - `priority`: `100` (explicitly set, evaluated first)
  - `contentType`: `"any"`
- Rule 1:
  - `priority`: `10` (auto-assigned from array index)
  - `contentType`: `"submission"` (mapped from `"post"`)

### Example 4: Combining Multiple AI Checks

```json
{
  "rules": [
    {
      "ai": {
        "id": "dating_check",
        "question": "Is this dating-related?"
      },
      "conditions": {
        "field": "ai.answer",
        "operator": "==",
        "value": "YES"
      },
      "action": "FLAG",
      "actionConfig": {
        "reason": "Dating content detected"
      }
    },
    {
      "ai": {
        "id": "spam_check",
        "question": "Is this spam?"
      },
      "conditions": {
        "logicalOperator": "AND",
        "rules": [
          {
            "field": "ai.answer",
            "operator": "==",
            "value": "YES"
          },
          {
            "field": "ai.dating_check.answer",
            "operator": "==",
            "value": "NO"
          }
        ]
      },
      "action": "REMOVE",
      "actionConfig": {
        "reason": "Spam detected (not dating-related)"
      }
    }
  ]
}
```

**Note:** The second rule references the first rule's AI answer using `ai.dating_check.answer`.

### Example 5: Complex Condition Logic

```json
{
  "rules": [
    {
      "conditions": {
        "logicalOperator": "AND",
        "rules": [
          {
            "field": "profile.accountAgeInDays",
            "operator": "<",
            "value": 7
          },
          {
            "field": "profile.totalKarma",
            "operator": "<",
            "value": 50
          }
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

## Content Type Mapping

For backward compatibility, the validator maps new contentType values to internal values:

| JSON Value (New) | Internal Value (Old) | Meaning |
|-----------------|---------------------|---------|
| `"post"` | `"submission"` | Posts only |
| `"comment"` | `"comment"` | Comments only |
| `"all"` | `"any"` | Both posts and comments |

You can use either the new or old values in your JSON. The validator will normalize them.

## Validation Warnings

The validator may generate warnings (but still accept the rules) for:

- Invalid `type` value (will use auto-deduced type)
- Invalid `action` value
- Invalid `priority` type (must be number)
- Missing AI question fields
- Duplicate AI question IDs
- Malformed condition structures

Check the console logs for validation warnings when rules are loaded.

## Migration Guide

### From Old Schema to New Schema

1. **Remove all auto-generated fields:**
   - Remove `id`, `name`, `type`, `enabled`, `priority`
   - Keep them only if you want specific values

2. **Remove top-level metadata:**
   - Remove `version`, `subreddit`, `dryRunMode`, `updatedAt`
   - These are now managed internally

3. **Update contentType values (optional):**
   - `"submission"` → `"post"` (or keep as-is)
   - `"any"` → `"all"` (or keep as-is)

4. **Simplify actionConfig (optional):**
   - Can omit `actionConfig` entirely if you don't need custom reasons

### Example Migration

**Before:**
```json
{
  "version": "1.0",
  "subreddit": "test",
  "dryRunMode": true,
  "updatedAt": 1234567890,
  "rules": [
    {
      "id": "abc-123",
      "name": "Karma Check",
      "type": "HARD",
      "enabled": true,
      "priority": 100,
      "contentType": "submission",
      "subreddit": null,
      "conditions": {
        "field": "profile.totalKarma",
        "operator": "<",
        "value": 100
      },
      "action": "FLAG",
      "actionConfig": {
        "reason": "Low karma"
      }
    }
  ]
}
```

**After:**
```json
{
  "rules": [
    {
      "priority": 100,
      "conditions": {
        "field": "profile.totalKarma",
        "operator": "<",
        "value": 100
      },
      "action": "FLAG",
      "actionConfig": {
        "reason": "Low karma"
      }
    }
  ]
}
```

## Best Practices

1. **Let the system generate IDs** - Don't specify `id` unless you need to reference specific rules elsewhere

2. **Use auto-deduced types** - Don't specify `type` unless you need to override the automatic detection

3. **Use array order for priority** - Only specify `priority` if you need non-sequential ordering

4. **Use new contentType values** - Use `"post"`, `"comment"`, `"all"` for clarity

5. **Provide meaningful actionConfig** - While optional, custom reasons help moderators understand why actions were taken

6. **Test in dry-run mode** - New rules are loaded with dry-run mode enabled by default for safety

## Technical Details

### Internal Fields

While the JSON schema is simplified, the validator adds these internal fields for backward compatibility:

**RuleSet:**
- `subreddit`: Set to `"unknown"` if not specified
- `dryRunMode`: Defaults to `true` (safe mode)
- `updatedAt`: Set to current timestamp
- `version`: Defaults to `"1.0"`

**Rule:**
- `id`: Random UUID
- `name`: `"Rule N"` where N is the 1-based index
- `type`: `"HARD"` or `"AI"` based on `aiQuestion` presence
- `enabled`: `true`
- `priority`: Array index × 10
- `contentType`: `"any"` (mapped to internal format)
- `subreddit`: `null`
- `actionConfig`: `{ reason: "Rule matched" }` if not provided

These fields are added during validation so that all downstream code continues to work without modification.

## Troubleshooting

### "Rules must be an array" Error
Make sure your JSON has a `rules` field with an array:
```json
{
  "rules": []  // Must be an array
}
```

### "Missing 'conditions' field" Warning
Every rule must have a `conditions` object:
```json
{
  "rules": [
    {
      "conditions": { /* condition tree */ },
      "action": "FLAG"
    }
  ]
}
```

### "Missing 'action' field" Warning
Every rule must have an `action` field:
```json
{
  "rules": [
    {
      "conditions": { /* ... */ },
      "action": "FLAG"  // Required
    }
  ]
}
```

### "Duplicate AI question ID" Warning
Each AI question must have a unique ID:
```json
{
  "rules": [
    {
      "aiQuestion": { "id": "check1", "question": "..." },
      "conditions": { /* ... */ },
      "action": "FLAG"
    },
    {
      "aiQuestion": { "id": "check2", "question": "..." },  // Different ID
      "conditions": { /* ... */ },
      "action": "FLAG"
    }
  ]
}
```

## See Also

- [Layer 3 Custom Rules Documentation](./layer3-custom-rules.md)
- [Integration Guide](./INTEGRATION_GUIDE.md)
- [Project Status](./project-status.md)
