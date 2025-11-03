# Changelog

All notable changes to Reddit AI Automod will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.107] - 2025-11-03

### Changed - Reddit LLM Compliance

**BREAKING CHANGES**: This release updates the app to comply with Reddit's Devvit LLM policy that only approves OpenAI and Google Gemini providers.

- **BREAKING**: Removed Claude (Anthropic) provider - not approved by Reddit for Devvit apps
- **BREAKING**: Removed OpenAI Compatible providers (Groq, Together AI, Z.ai, X.AI/Grok) - not approved by Reddit
- Added Google Gemini 1.5 Flash provider - newly approved by Reddit
- Changed default primary provider from Claude to OpenAI
- Changed default fallback provider from OpenAI to Gemini
- Updated HTTP allowlist to only include approved domains:
  - `api.openai.com` (OpenAI)
  - `generativelanguage.googleapis.com` (Google Gemini)
- Preserved deprecated provider code in codebase for potential future restoration if Reddit policies change
- Updated settings UI to only show approved providers (OpenAI, Gemini)

### Migration Guide for Existing Installations

**If you were using Claude (Anthropic)**:
1. Obtain an OpenAI API key: https://platform.openai.com/api-keys
2. OR obtain a Gemini API key: https://aistudio.google.com/apikey
3. Update your app settings with the new API key
4. Change primary provider to 'openai' or 'gemini'
5. Old Claude API key will be ignored (no errors, just unused)

**If you were using OpenAI Compatible providers (Groq, Together AI, Z.ai, Grok)**:
1. Switch to OpenAI or Gemini (see above)
2. Old OpenAI Compatible settings will be ignored (no errors, just unused)

**If you were using OpenAI**:
- No changes required, continue using your existing configuration

### Cost Impact

Switching to Gemini can significantly reduce AI costs:
- **Gemini pricing**: $0.075 per 1M input tokens, $0.30 per 1M output tokens
- **OpenAI pricing**: $0.15 per 1M input tokens, $0.60 per 1M output tokens
- **Gemini is 50% cheaper than OpenAI**
- **Gemini is 70% cheaper than Claude** (removed)

### Technical Details

See `docs/llm-compliance.md` for full compliance documentation including:
- Reddit's approved provider list
- Technical implementation details
- Provider comparison and cost analysis
- Future considerations

## [0.1.105] - 2025-10-30

### Added
- AI cost tracking in analysis history
- Displays exact USD cost for each AI analysis (Layer 3)
- Shows token usage in analysis form
- Cost information from all providers (Claude, OpenAI, OpenAI Compatible)

### Changed
- Analysis form now includes "💰 AI Cost" and "🔢 Tokens Used" fields
- AnalysisHistoryEntry interface includes aiCostUSD and aiTokensUsed fields
- Provides full transparency on AI spending per post

### Technical
- Verified all AI providers (Claude, OpenAI, OpenAI Compatible) return cost data
- Cost calculated accurately using provider-specific token pricing
- Layer 1 and Layer 2 remain free (no cost tracked)

## [0.1.104] - 2025-10-30

### Changed
- Analysis history now saved for APPROVE actions (posts that pass all layers)
- Moderators can now view analysis even for posts that were approved
- Provides visibility into "close calls" and system decisions for all evaluated content
- Only saves for posts that went through full pipeline evaluation
- Skips saving for whitelisted users, moderators, approved users, community-trusted (too much data)

### Fixed
- Moderators can now see AI analysis for posts that passed Layer 3 evaluation
- Previously only saved analysis for FLAG/REMOVE/COMMENT actions

## [0.1.103] - 2025-10-30

### Added
- Enhanced AI analysis form to show all three moderation layers
- Layer 1 (New Account Check) results with pass/fail status and reason
- Layer 2 (OpenAI Moderation) results with flagged categories and reason
- Layer 3 (Custom AI Rules) results with AI provider, model, and reasoning
- "Triggered By" field shows which layer caused the action
- Cost dashboard form with organized daily/monthly budget tracking
- Provider-specific cost breakdowns (Claude, OpenAI, OpenAI Compatible)
- Configuration section showing dry-run mode, primary/fallback AI providers

### Changed
- Replaced "View AI Costs" toast with proper Devvit form display
- Enhanced analysis history storage to track all pipeline layer results
- Updated postSubmit and commentSubmit handlers to pass pipeline info
- Form displays dynamically based on which layers were evaluated
- Only shows layer information if that layer was actually evaluated

### Removed
- Removed pointless "AI Automod Settings" menu item (just showed toast)

### Fixed
- Analysis history now properly captures Layer 1 and Layer 2 decisions
- Moderators can now see complete audit trail for all moderation layers

## [0.1.102] - 2025-10-30

### Fixed
- Removed `disabled` flag from form fields to fix light grey text color
- Form text now displays in normal/dark color for better readability
- Fields remain effectively read-only (no submit handler logic)

## [0.1.101] - 2025-10-30

### Changed
- Restructured AI analysis form with organized multi-field layout
- Replaced single cramped paragraph field with separate labeled fields
- Added field groups: "User Information" and "AI Analysis"
- Only reasoning uses paragraph field (where scrolling is appropriate)
- Much more readable and scannable interface

## [0.1.100] - 2025-10-30

### Changed
- Replaced toast notification with proper Devvit form for AI analysis display
- Form provides much more space for displaying complete analysis information
- Better user experience for viewing detailed AI decisions

## [0.1.99] - 2025-10-30

### Added
- Redis-based AI analysis history storage system
- Created `src/storage/analysisHistory.ts` for storing analysis data with 90-day retention
- Analysis data includes: action, rule, user trust metrics, AI provider/model, confidence, reasoning
- "View AI Analysis" menu action fetches and displays stored analysis data

### Removed
- Removed broken `modLog` integration (API not available in trigger contexts)
- Deleted obsolete `src/actions/modNotes.ts`
- Removed `modLog: true` from Devvit.configure() (not needed)
- Removed `enableModLog` setting

### Changed
- Updated executor to save analysis to Redis instead of trying to create mod log entries
- Updated `src/ui/postAnalysis.ts` to fetch from Redis storage

### Technical Note
- `context.modLog` API is only available in UI contexts (forms, menus), not trigger contexts (onPostSubmit, onCommentSubmit)
- `TriggerContext` and `JobContext` explicitly omit `modLog` from their type definitions
- Redis-based storage provides equivalent transparency for moderators

## [0.1.98] - 2025-10-30

### Changed
- Added `modLog: true` to `Devvit.configure()` (later discovered this alone wasn't sufficient)

## [0.1.97] - 2025-10-30

### Changed
- **BREAKING**: Attempted switch from mod notes to mod log entries
- Tried using `context.modLog.add()` (later discovered not available in triggers)
- Maps actions to mod log types: `removelink`/`removecomment`, `reportlink`/`reportcomment`
- Renamed setting from `enableModNotes` to `enableModLog`
- Renamed function from `addAutomodNote` to `addAutomodLogEntry`

### Note
- This implementation was later replaced in 0.1.99 due to API limitations

## [0.1.96] - 2025-10-30

### Added
- Automatic Reddit mod notes for AI Automod actions (FLAG, REMOVE, COMMENT)
- Mod notes include: rule name, trust score, account age, karma, AI provider/model, confidence, reasoning
- `enableModNotes` setting (default: ON) to control mod note creation
- AI provider and model tracking in analysis results
- `model` field added to `AIAnalysisResult` and `AIQuestionBatchResult` types
- Smart truncation to fit 250 character Reddit limit

### Changed
- Updated AI analyzer to track which provider and model performed each analysis
- Integrated mod note creation into action executor (after successful actions)
- Mod notes only created in non-dry-run mode

### Benefits
- Full transparency for mod teams on AI decisions
- Clear audit trail for user appeals
- Easy pattern recognition across users
- Shows which AI model made each decision

## [0.1.95] - 2025-10-30

### Added
- Comment template system for REMOVE and COMMENT actions
- Customizable templates via settings with professional defaults
- Template variable substitution: `{reason}`, `{subreddit}`, `{contentType}`, `{confidence}`

### Changed
- Renamed confusing `comment` field to `modlog` in actionConfig for clarity
- Made menu items (View AI Costs, AI Automod Settings) moderator-only
- Improved template wording ("someone will review" instead of "a human")
- Simplified COMMENT template to just reason + footer
- Standardized footer format across all templates

### Fixed
- COMMENT action trust tracking bug (was incorrectly treating as REMOVE)
- Modmail URL format (removed extra slash in `to=r/{subreddit}`)

## [0.1.85] - 2025-10-30

### Fixed
- AI prompt decision framework to use preponderance of evidence instead of requiring absolute certainty
- Location inference issue (SeattleWA posts now correctly indicate US residence)
- AI was treating YES/NO questions as requiring 100% certainty

### Changed
- Reframed prompt: "Answer YES if evidence points toward yes, even if not 100% certain"
- Added DECISION FRAMEWORK section with clear guidance on probabilistic reasoning
- Updated posting history description from "last 20" to "up to 200 items"
- Confidence score now reflects evidence strength, not answer certainty threshold

## [0.1.58] - 2025-10-29

### Added
- X.AI (Grok) domain support in HTTP fetch allowlist
- Added 'api.x.ai' to devvit.yaml allowList for Grok API access
- Verified Grok API functionality with grok-3 model

### Fixed
- Confirmed Grok API working as alternative OpenAI-compatible provider

## [0.1.57] - 2025-10-29

### Changed
- Enhanced error logging in OpenAI-compatible provider
- Now captures full API error responses including status codes, error codes, and messages
- Added detailed error extraction in analyze(), analyzeWithQuestions(), and healthCheck() methods
- Error logs now show complete error objects instead of just error.message

### Fixed
- Improved debugging capabilities for provider-specific API errors
- Better visibility into API failures with detailed error information

## [0.1.56] - 2025-10-29

### Fixed
- Critical bug: System now respects fallback='none' setting (was ignoring it and falling back to other providers)
- Provider fallback logic in getEnabledProviders() now only adds additional providers when fallback is not 'none'
- Z.ai endpoint connection issues resolved (confirmed working, insufficient balance error now properly logged)

### Added
- HTTP fetch allowlist in devvit.yaml for AI provider domains
- Added domains: api.anthropic.com, api.openai.com, api.z.ai, *.groq.com, *.together.ai
- Comprehensive provider selection logging to track enabled providers

### Changed
- Modified getEnabledProviders() in src/config/ai.ts (lines 346-369) to respect fallback preferences
- Added conditional check to prevent adding additional providers when fallback is disabled

## [0.1.55] - 2025-10-29

### Fixed
- Case sensitivity bug in configManager.ts: changed 'openaiCompatibleBaseUrl' to 'openaiCompatibleBaseURL' (lines 120, 124)

### Removed
- All deepseek references from codebase per updated requirements
- Removed deepseek provider from AI_CONFIG in config/ai.ts
- Removed deepseek merging logic from ConfigurationManager
- Removed deepseekApiKey from settingsService.ts
- Removed DeepSeekProvider import from selector.ts

### Changed
- Updated provider type annotations to only support: 'claude' | 'openai' | 'openai-compatible'
- Now only three supported AI providers: Claude, OpenAI, OpenAI-Compatible
- Cleaner codebase with simplified provider architecture

## [0.1.54] - 2025-10-29

### Fixed
- OpenAI-compatible provider (e.g., z.ai, Groq) now properly supported when selected as primary provider
- Fixed crash: "Cannot read properties of undefined (reading 'enabled')" when using openai-compatible provider
- Added null checks in `getEnabledProviders()` to prevent crashes when provider config is missing

### Added
- OpenAI-compatible provider creation in ConfigurationManager
- Provider is enabled when both API key and base URL are configured in settings
- Comprehensive debug logging for provider selection diagnostics
- Logs available providers, primary/fallback selections, and API key configuration status
- Priority 4 (last resort fallback) for openai-compatible provider
- Support for custom OpenAI API format endpoints (Groq, Z.AI, Together AI, self-hosted vLLM/Ollama)

### Changed
- `getEnabledProviders()` now includes detailed logging to trace provider selection
- Warnings logged when requested provider not found in configuration
- Better error diagnostics for provider configuration issues

## [0.1.53] - 2025-10-29

### Changed
- Enhanced "Reset Community Trust Scores" menu to clear ALL user caches
- Now deletes profile caches (`user:{userId}:profile`) in addition to trust scores
- Now deletes history caches (`user:{userId}:history`) in addition to tracking records
- Complete reset for testing: trust scores, tracking, profiles, and post histories
- Updated toast message shows all deletion counts (trust, tracking, profiles, histories)

## [0.1.52] - 2025-10-29

### Fixed
- Email verification now correctly reads `hasVerifiedEmail` field from Devvit User API instead of hardcoded `false`
- Post/comment fetching now uses separate API calls (`getPostsByUser()` and `getCommentsByUser()`) to prevent skewed results
- Ensures balanced data retrieval: up to 100 posts AND up to 100 comments (not 200 total that could be 24 posts + 176 comments)

### Changed
- Status badge changed from "Production Ready" to "Alpha" in README
- Better user profiling accuracy with guaranteed balanced post/comment history

## [0.1.47] - 2025-10-29

### Fixed
- Layer 3 REMOVE action now posts notification comment before removing post/comment (prevents comment from disappearing with content)

### Added
- Trust score delta logging in ModAction handler shows trust score changes when user actions are taken

## [0.1.46] - 2025-10-29

### Added
- Trust score delta display in ModAction event handler

## [0.1.45] - 2025-10-29

### Changed
- Improved notification format with trust score display
- Cleaner dry-run indicator in notifications (Phase 5.29)
- Better formatting for moderator notifications

## [0.1.44] - 2025-10-29

### Fixed
- Removed per-RuleSet dry-run field (Phase 5.28)
- Dry-run mode now configured globally at Layer 3 level only

## [0.1.43] - 2025-10-29

### Added
- Comprehensive AI debug logging across all providers (Claude, OpenAI, DeepSeek)
- Request/response tracing with correlation IDs
- Token usage and cost tracking in logs
- Sanitization metrics showing content reduction percentages
- Enhanced visibility for troubleshooting AI pipeline issues

## [0.1.42] - 2025-10-29

### Fixed
- Provider selection logic now respects settings UI configuration
- `getEnabledProviders()` now uses ConfigurationManager instead of hardcoded AI_CONFIG
- OpenAI provider now supports question-based analysis (implemented missing `analyzeWithQuestions()` method)
- All three providers (Claude, OpenAI, DeepSeek) now fully support custom questions

## [0.1.41] - 2025-10-29

### Changed
- Expanded post history to 200 items (100 posts + 100 comments, up from 20 total)
- Improved content sanitization reduces token usage by 40-60%
- Post bodies truncated to 500 characters
- Comment bodies truncated to 300 characters
- URLs replaced with [URL] placeholder
- Excessive whitespace and markdown formatting removed

## [0.1.40] - 2025-10-29

### Changed
- Layer 3 schema simplification with auto-generation of optional fields
- `id`, `name`, `type`, `enabled`, `priority`, and `version` now auto-generated when omitted
- Renamed `aiQuestion` → `ai` with simpler field access patterns
- Removed unnecessary fields: `subreddit`, `createdAt`, `updatedAt`
- Minimal rule format now just requires: `{conditions:[...], action:'...'}`
- Updated contentType mapping: "post"→"submission", "all"→"any"
- Backward compatibility maintained for legacy `aiQuestion` field

## [0.1.39] - 2025-10-29

### Added
- Enhanced OpenAI Moderation logging with individual category scores
- Better visibility into severity of content violations
- Threshold values included in logs for context

## [0.1.38] - 2025-10-29

### Added
- Separate OpenAI API key configuration for Layer 2 (Moderation API)
- Independent API key management allows different billing/quota tracking per layer
- Layer 2 checks Layer 2 key first, falls back to Layer 3 key if not configured

## [0.1.37] - 2025-10-29

### Changed
- Ultra-concise toast format for "View AI Analysis" menu item
- Single-line format: `{ACTION} {trustScore}/100. ${cost} {time}ms. {ruleId}.`
- Improved UX for viewing AI analysis results in toast display

## [0.1.34] - 2025-10-29

### Fixed
- Corrected ModAction event structure access (flat structure, not nested)
- Event property is `event.action` not `event.modAction.type`
- Approvals now correctly increase trust scores
- Removals properly detected for retroactive trust penalties

## [0.1.36] - 2025-10-29

### Changed
- Removed removal reason requirement for trust score penalties
- Any mod removal now affects trust score (removals indicate rule breaks/duplicates)
- Simplified logic by removing 40 lines of removal reason checking code

## [0.1.35] - 2025-10-29

### Fixed
- Modified ModAction handler to create tracking records for manual mod approvals
- 24-hour TTL on tracking records allows undo of any approval (bot or mod) if later removed
- Retroactive trust score adjustments now work for all approval types

## [0.1.29] - 2025-10-29

### Fixed
- Infinite loop prevention via comment ID tracking system
- Bot comments now tracked in Redis with 1-minute expiration
- CommentSubmit handler checks Redis for comment ID and skips if found
- Self-cleaning system (automatic expiration)
- Works regardless of account structure (no hardcoded usernames)

## [0.1.25] - 2025-10-29

### Fixed
- Redis API compatibility for reset menu functionality
- Implemented user tracking system using Redis sorted sets (`zAdd`, `zRange`)
- Reset menu now uses `zRange()` to iterate tracked users instead of unsupported `keys()` method
- Individual key deletion via `del()` instead of bulk operations

## [0.1.24] - 2025-10-29

### Changed
- Moved community trust reset from settings toggle to menu item
- "Reset Community Trust Scores" menu item added to subreddit menu (moderator-only)
- Provides immediate action with success toast showing deletion count
- Removed two-flag reset logic from event handlers (70 lines removed)

## [0.1.18] - 2025-10-29

### Added
- "Reset Community Trust Scores" menu item in subreddit menu
- Deletes all `trust:community:*` and `approved:tracking:*` keys
- Shows success toast with deletion count

## [0.1.17] - 2025-10-29

### Removed
- Community trust feature flag removed - community trust is now the ONLY behavior
- Removed feature flag setting from UI
- Removed all feature flag conditional logic from PostSubmit and CommentSubmit handlers
- Total: ~243 lines of legacy code removed

## [0.1.15] - 2025-10-28

### Changed
- Removed ALL hardcoded username checks for bot detection
- Now uses only `getCurrentUser()` API for dynamic bot detection
- Fully portable - works with any bot account name
- Cleaner, more maintainable code

## [0.1.13] - 2025-10-28

### Added
- User whitelist for moderation bypass
- `whitelistedUsernames` setting (comma-separated, case-insensitive)
- Whitelisted users skip ALL moderation layers (1, 2, 3)
- Use cases: moderators testing, trusted community members, bot accounts
- Bot account automatically whitelisted by default

## [0.1.12] - 2025-10-28

### Fixed
- Infinite loop fix with two-tier bot self-detection
- Primary: Hardcoded username checks (fast)
- Backup: `getCurrentUser()` API check
- Bot no longer processes its own comments

## [0.1.10] - 2025-10-28

### Fixed
- Pipeline action field mapping for COMMENT and REMOVE actions
- COMMENT actions now correctly map `pipelineResult.reason` to `comment` field
- REMOVE actions now correctly map `pipelineResult.reason` to `removalReason` field
- Resolved "COMMENT action missing comment text" errors

## [0.1.9] - 2025-10-28

### Removed
- All default Layer 3 custom rules removed for clean slate installation
- Emptied all 4 default rule sets (FriendsOver40, FriendsOver50, bitcointaxes, global)
- File reduced from 576 lines to 65 lines (88% reduction)
- Fresh installs now have no Layer 3 rules active by default
- Clear separation: Built-in rules (Layer 1) vs Custom rules (Layer 3)

## [0.1.7] - 2025-10-28

### Added
- Unified notification recipient configuration
- Single `notificationRecipient` setting replaces 4 separate recipient fields
- Budget alert notifications now sent to moderators (modmail or PM)
- `sendBudgetAlert()` function with full notification support
- Consolidated settings: 6 notification fields → 2 fields

### Changed
- Budget alerts now actually notify moderators instead of just console logging
- All notification types (daily digest, real-time, budget alerts) use same recipient configuration

## [0.1.6] - 2025-10-28

### Fixed
- Blank field handling in New Account Checks settings
- Supports zero, negative, and blank values (blank = ignore check)
- Changed field types from `number` to `string` for proper blank detection

## [0.1.5] - 2025-10-28

### Changed
- Simplified "Built-in Rules" to "New Account Checks"
- Replaced JSON configuration with 5 simple form fields
- Focus on age + karma checks only (removed external links complexity)

## [0.1.3] - 2025-10-28

### Changed
- Settings page reorganization with emoji prefixes for visual grouping (🔧🛡️🤖📧⚡)
- Logical execution sequence: Global → Layer 1 → Layer 2 → Layer 3 → Notifications
- Enhanced helpText with execution context and cost transparency

## [0.1.2] - 2025-10-28

### Added
- Three-layer moderation pipeline architecture
- **Layer 1**: Built-in rules (account age, karma checks) - instant, free
- **Layer 2**: OpenAI Moderation API - fast, free, catches violence/hate/sexual content
- **Layer 3**: Custom Rules with AI questions - flexible, paid
- Short-circuit evaluation for cost optimization (67-85% AI cost reduction)
- `src/moderation/openaiMod.ts` - OpenAI Moderation API client
- `src/moderation/builtInRules.ts` - Built-in rule evaluator
- `src/moderation/pipeline.ts` - Main pipeline orchestrator

### Changed
- Pipeline settings added: Built-in Rules, OpenAI Moderation categories/threshold/action
- Enhanced audit logging with pipeline metadata

## [0.1.1] - 2025-10-28

### Added
- MIT License added to project

### Changed
- README.md slimmed down for Reddit app directory (570 → 272 lines, 52% reduction)
- Removed developer-focused content (architecture, system flow, dev setup, roadmap)
- Moderator-focused language throughout
- Preserved all three rule examples (copy-ready)

### Fixed
- Real-time digest now correctly uses separate settings from daily digest
- Multi-username support: comma-separated lists (e.g., "user1, user2")
- Per-username error handling (continues on failure)

## [0.1.0] - 2025-10-28

### Added
- Complete Devvit Settings UI (13 fields, 4 sections)
- AI Provider Configuration: API key fields for Claude, OpenAI, DeepSeek
- Provider Selection: primaryProvider and fallbackProvider dropdowns
- Budget & Cost Controls: daily/monthly limits + alert thresholds
- Dry-Run Mode: safe testing toggle
- Rule Management: JSON editor for custom Layer 3 rules with schema validation
- Cost Dashboard: "View AI Costs" menu item with daily/monthly spending breakdown
- Default rules initialization on app install (subreddit-specific)
- Atomic lock system for initialization using Redis SET with NX option
- SettingsService with 60-second cache
- ConfigurationManager merges settings with hardcoded defaults
- RuleSchemaValidator with comprehensive validation and migration framework
- Cost dashboard cache with 5-minute TTL

### Changed
- Settings integration: RulesEngine now uses `loadRulesFromSettings()`
- AISelector now uses ConfigurationManager for provider configuration
- API keys from settings take precedence over defaults

### Security
- API keys use `scope: 'installation'` (per-subreddit billing)
- Settings never expose sensitive data in logs

## [0.0.2] - 2025-10-26

### Added
- Phase 2: Complete AI Integration (156 tests passing, 90%+ coverage)
- ContentSanitizer: PII removal (emails, phones, SSNs, credit cards, URLs) - 93 tests
- AIResponseValidator: Zod runtime schema validation - 42 tests
- RequestCoalescer: Redis-based request deduplication - 35 tests
- CircuitBreaker: Prevents cascading failures with self-healing
- CostTracker: Daily/monthly budget enforcement with alerts at 50%, 75%, 90%
- PromptManager: A/B testing support for prompt versions
- AI Provider Interface: Clean abstraction for interchangeable providers
- Claude Provider: Claude 3.5 Haiku with tool calling ($1/$5 per MTok)
- OpenAI Provider: GPT-4o Mini with JSON mode ($0.15/$0.60 per MTok)
- DeepSeek Provider: DeepSeek V3 via OpenAI-compatible API ($0.27/$1.10 per MTok)
- ProviderSelector: Intelligent multi-provider failover with circuit breaker integration
- AIAnalyzer: Main orchestrator with differential caching (12-48h TTL)

### Added
- Phase 1.2: User Profile Analysis
- Rate limiter with exponential backoff
- User profile fetcher with caching
- Post history analyzer (fetches full Reddit history across all subreddits)
- Trust score calculator (0-100 based on account age, karma, email verification)
- Split karma tracking (commentKarma, postKarma, totalKarma)
- User attributes: hasUserFlair, hasPremium, isVerified
- Post history metrics: totalPosts, totalComments, subreddits array

### Changed
- Updated PostSubmit handler to integrate user profiling system
- PostSubmit now fetches profile, analyzes history, calculates trust score

## [0.0.1] - 2025-10-25

### Added
- Initial Devvit project structure
- Node.js v20.19.5 and Devvit CLI v0.12.1 installed
- TypeScript configuration
- Redis storage layer implementation (`src/storage/redis.ts`, `src/storage/audit.ts`)
- PostSubmit and CommentSubmit event handlers
- Type definitions: `events.ts`, `storage.ts`, `config.ts`
- Deployed to playtest subreddit r/ai_automod_app_dev
- Test subreddit r/AiAutomod created
- Bot account u/aiautomodapp with mod permissions

### Fixed
- API compatibility issues with Devvit platform
- Tested with real Reddit events

## [0.0.0] - 2025-10-25

### Added
- Project initialization and planning (Phase 0)
- CLAUDE.md with comprehensive development workflow guide
- Complete architecture documentation
- 6-phase implementation plan
- Git repository initialization with main + develop branches
- README.md with project overview
- Configured .gitignore for security (excludes dev meta files)

### Changed
- Project architecture pivot from generic rule engine to user profiling system
- Target subreddits identified: r/FriendsOver40, r/FriendsOver50, r/bitcointaxes
- Focus on detecting: romance scammers, dating seekers, underage users, spammers

## Project Architecture Evolution

### 2025-10-25 - Major Architecture Pivot
**Original Plan**: Generic rule engine with 20 predetermined rules + custom rule builder

**New Direction**: User profiling & analysis system focused on specific moderation needs
- **Why**: Actual use case requires analyzing new posters for specific problematic behaviors
- **What**: Detect romance scammers, dating seekers, underage users in friendship communities
- **How**: User profiling → AI analysis → Trust scoring → Moderation actions

### 2025-10-27 - Rules Engine Architecture
**Decision**: Custom AI questions instead of hardcoded detection types
- **Why**: Maximum flexibility - moderators define their own detection criteria
- **What**: JSON-configurable rules with natural language AI questions
- **How**: Three-layer system (Built-in → OpenAI Mod → Custom+AI)
- **Impact**: Fully flexible, no hardcoded assumptions about moderation needs

### 2025-10-28 - Three-Layer Pipeline
**Decision**: Multi-layer moderation pipeline for cost optimization
- **Layer 1**: Built-in rules (instant, free) - account age, karma
- **Layer 2**: OpenAI Moderation API (fast, free) - violence, hate, sexual content
- **Layer 3**: Custom rules with AI questions (flexible, paid)
- **Impact**: 67-85% reduction in AI costs through short-circuit evaluation

### 2025-10-29 - Community Trust System
**Decision**: Community-specific trust scores instead of global trust
- **Why**: Global trust allowed high-karma veterans to bypass community-specific rules
- **What**: Separate trust tracking per subreddit based on approval/removal ratio
- **How**: Ratio-based scoring (70% approval minimum), decay system, ModAction tracking
- **Impact**: 29% monthly cost savings, better detection of problematic accounts with history

## Phases Summary

### Phase 0: Planning (2025-10-25)
Complete project setup, research, and architecture planning.

### Phase 1: Foundation & Setup (2025-10-25 to 2025-10-26)
Devvit project structure, Redis storage, event handlers, user profiling system.

### Phase 2: AI Integration (2025-10-26)
Complete AI pipeline with sanitization, validation, deduplication, circuit breaker, cost tracking, multi-provider support. Production-ready with 156 tests passing.

### Phase 3: Rules Engine (2025-10-27)
Custom AI questions system, condition evaluator, variable substitution, Redis storage, action executors (FLAG, REMOVE, COMMENT). 169 tests passing.

### Phase 4: Settings UI (2025-10-28)
Complete Devvit settings forms, cost dashboard, rule management with schema validation, default rules initialization.

### Phase 5: Refinement & Optimization (2025-10-28 to 2025-10-29)
Three-layer pipeline, community trust system, infinite loop fixes, notification improvements, schema simplification, debug logging, post history expansion.

[Unreleased]: https://github.com/cdmackie/redditmod/compare/v0.1.54...HEAD
[0.1.54]: https://github.com/cdmackie/redditmod/compare/v0.1.53...v0.1.54
[0.1.53]: https://github.com/cdmackie/redditmod/compare/v0.1.52...v0.1.53
[0.1.52]: https://github.com/cdmackie/redditmod/compare/v0.1.47...v0.1.52
[0.1.47]: https://github.com/cdmackie/redditmod/compare/v0.1.46...v0.1.47
[0.1.46]: https://github.com/cdmackie/redditmod/compare/v0.1.45...v0.1.46
[0.1.45]: https://github.com/cdmackie/redditmod/compare/v0.1.44...v0.1.45
[0.1.44]: https://github.com/cdmackie/redditmod/compare/v0.1.43...v0.1.44
[0.1.43]: https://github.com/cdmackie/redditmod/compare/v0.1.42...v0.1.43
[0.1.42]: https://github.com/cdmackie/redditmod/compare/v0.1.41...v0.1.42
[0.1.41]: https://github.com/cdmackie/redditmod/compare/v0.1.40...v0.1.41
[0.1.40]: https://github.com/cdmackie/redditmod/compare/v0.1.39...v0.1.40
[0.1.39]: https://github.com/cdmackie/redditmod/compare/v0.1.38...v0.1.39
[0.1.38]: https://github.com/cdmackie/redditmod/compare/v0.1.37...v0.1.38
[0.1.37]: https://github.com/cdmackie/redditmod/compare/v0.1.36...v0.1.37
[0.1.36]: https://github.com/cdmackie/redditmod/compare/v0.1.35...v0.1.36
[0.1.35]: https://github.com/cdmackie/redditmod/compare/v0.1.34...v0.1.35
[0.1.34]: https://github.com/cdmackie/redditmod/compare/v0.1.29...v0.1.34
[0.1.29]: https://github.com/cdmackie/redditmod/compare/v0.1.25...v0.1.29
[0.1.25]: https://github.com/cdmackie/redditmod/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/cdmackie/redditmod/compare/v0.1.18...v0.1.24
[0.1.18]: https://github.com/cdmackie/redditmod/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/cdmackie/redditmod/compare/v0.1.15...v0.1.17
[0.1.15]: https://github.com/cdmackie/redditmod/compare/v0.1.13...v0.1.15
[0.1.13]: https://github.com/cdmackie/redditmod/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/cdmackie/redditmod/compare/v0.1.10...v0.1.12
[0.1.10]: https://github.com/cdmackie/redditmod/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/cdmackie/redditmod/compare/v0.1.7...v0.1.9
[0.1.7]: https://github.com/cdmackie/redditmod/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/cdmackie/redditmod/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/cdmackie/redditmod/compare/v0.1.3...v0.1.5
[0.1.3]: https://github.com/cdmackie/redditmod/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/cdmackie/redditmod/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/cdmackie/redditmod/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/cdmackie/redditmod/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/cdmackie/redditmod/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/cdmackie/redditmod/compare/v0.0.0...v0.0.1
[0.0.0]: https://github.com/cdmackie/redditmod/releases/tag/v0.0.0
