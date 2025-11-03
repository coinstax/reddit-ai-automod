/**
 * AI Automod - AI Automod for Reddit
 * Copyright (C) 2025 CoinsTax LLC
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Devvit } from '@devvit/public-api';
import { handlePostSubmit } from './handlers/postSubmit';
import { handleCommentSubmit } from './handlers/commentSubmit';
import { handleModAction } from './handlers/modAction';
import { renderCostDashboard } from './dashboard/costDashboardUI';
import { initializeDefaultRules } from './handlers/appInstall';
import { getPostAnalysis } from './ui/postAnalysis';
import { getAnalysisHistory } from './storage/analysisHistory.js';
import { sendDailyDigest } from './notifications/modmailDigest';

// Configure Devvit with required permissions
// Reddit Devvit Policy: Only OpenAI and Gemini LLMs are approved
// https://developers.reddit.com/docs/devvit_rules#only-use-approved-llms
Devvit.configure({
  redditAPI: true, // Access Reddit API
  redis: true,     // Use Redis storage
  http: {
    // HTTP enabled for AI API calls (Phase 2+)
    // Only Reddit-approved LLM providers
    fetch: {
      allowList: [
        'api.openai.com',                      // OpenAI (approved)
        'generativelanguage.googleapis.com',   // Google Gemini (approved)
      ],
      /* DEPRECATED - Not approved by Reddit Devvit policy (as of 2025-11-03)
      allowList: [
        'api.anthropic.com',  // Claude (not approved)
        'api.z.ai',          // Z.AI (not approved)
        'api.x.ai',          // X.AI/Grok (not approved)
        'api.groq.com',      // Groq (not approved)
      ],
      */
    },
  },
});

/**
 * Settings UI Configuration
 *
 * Moderators configure these settings at:
 * reddit.com/r/SUBREDDIT/about/apps/APP_NAME
 *
 * All settings are per-subreddit (installation-scoped).
 * Each subreddit moderator configures their own API keys and pays for their own AI usage.
 *
 * Note: API keys are NOT encrypted (Devvit limitation - only app-scoped settings can be secrets).
 * However, they're only visible to moderators with Settings access.
 *
 * Settings accessed via: const settings = await context.settings.getAll();
 * See SettingsService for type-safe access to these settings.
 */
Devvit.addSettings([
  // ===== Whitelist (Bypass All Moderation) =====
  {
    type: 'string',
    name: 'whitelistedUsernames',
    label: '✅ Whitelisted Usernames',
    helpText: 'Comma-separated usernames to skip ALL moderation checks (without u/ prefix). Example: mod1, mod2, trusteduser. The bot account is automatically whitelisted.',
    defaultValue: '',
    scope: 'installation',
  },

  // ===== Layer 1: New Account Checks (Free & Fast) =====
  {
    type: 'boolean',
    name: 'enableBuiltInRules',
    label: '🔧 Layer 1: New Account Checks',
    helpText: 'Fast checks for new/low-karma accounts. Catches spam from new accounts. (Executes first, free)',
    defaultValue: true,
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'builtInAccountAgeDays',
    label: '🔧 Account Age (days)',
    helpText: 'Flag accounts newer than this many days. Leave blank to ignore. Example: 7',
    defaultValue: '',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'builtInKarmaThreshold',
    label: '🔧 Karma Threshold',
    helpText: 'Flag accounts with less karma. Can be negative. Leave blank to ignore. Example: 50 or -10',
    defaultValue: '',
    scope: 'installation',
  },
  {
    type: 'select',
    name: 'builtInAction',
    label: '🔧 Action',
    helpText: 'What action to take when new account check matches',
    options: [
      { label: 'FLAG - Report to mod queue', value: 'FLAG' },
      { label: 'REMOVE - Remove post/comment', value: 'REMOVE' },
      { label: 'COMMENT - Warn user', value: 'COMMENT' },
    ],
    defaultValue: 'FLAG',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'builtInMessage',
    label: '🔧 Custom Message (optional)',
    helpText: 'Message to show user when content is removed or commented. Leave empty for default message.',
    defaultValue: 'Your post has been flagged for moderator review.',
    scope: 'installation',
  },

  // ===== Layer 2: OpenAI Moderation (Free) =====
  {
    type: 'boolean',
    name: 'enableOpenAIMod',
    label: '🛡️ Layer 2: Enable OpenAI Moderation',
    helpText: 'FREE content moderation for hate, harassment, violence, sexual content. Uses OpenAI Moderation API at no cost. (Executes second, free)',
    defaultValue: false,
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'openaiModApiKey',
    label: '🛡️ OpenAI Moderation API Key',
    helpText: 'Your OpenAI API key for the Moderation API (free to use, but requires authentication). Can be same as Layer 3 OpenAI key, or separate for different billing/quota tracking. Get one at platform.openai.com.',
    scope: 'installation',
  },
  {
    type: 'select',
    name: 'openaiModCategories',
    label: '🛡️ Moderation Categories',
    helpText: 'Which content categories to check. Multiple selections allowed. (Executes second, free)',
    options: [
      { label: 'Hate speech', value: 'hate' },
      { label: 'Hate speech (threatening)', value: 'hate/threatening' },
      { label: 'Harassment', value: 'harassment' },
      { label: 'Harassment (threatening)', value: 'harassment/threatening' },
      { label: 'Self-harm content', value: 'self-harm' },
      { label: 'Self-harm (intent)', value: 'self-harm/intent' },
      { label: 'Self-harm (instructions)', value: 'self-harm/instructions' },
      { label: 'Sexual content', value: 'sexual' },
      { label: 'Sexual content (minors)', value: 'sexual/minors' },
      { label: 'Violence', value: 'violence' },
      { label: 'Violence (graphic)', value: 'violence/graphic' },
    ],
    multiSelect: true,
    defaultValue: ['hate', 'harassment', 'sexual', 'violence'],
    scope: 'installation',
  },
  {
    type: 'number',
    name: 'openaiModThreshold',
    label: '🛡️ Moderation Threshold (0.0-1.0)',
    helpText: 'Confidence threshold to flag content. Lower = more strict. Recommended: 0.5 for balanced moderation, 0.3 for strict, 0.7 for lenient. (Executes second, free)',
    defaultValue: 0.5,
    scope: 'installation',
  },
  {
    type: 'select',
    name: 'openaiModAction',
    label: '🛡️ Action for Flagged Content',
    helpText: 'What to do when content is flagged. Note: sexual/minors is always REMOVE for safety. (Executes second, free)',
    options: [
      { label: 'FLAG - Report to mod queue', value: 'FLAG' },
      { label: 'REMOVE - Remove post/comment', value: 'REMOVE' },
      { label: 'COMMENT - Warn user', value: 'COMMENT' },
    ],
    defaultValue: 'FLAG',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'openaiModMessage',
    label: '🛡️ Custom Message (for REMOVE/COMMENT)',
    helpText: 'Message to show users when content is flagged. Leave empty for default message. (Executes second, free)',
    defaultValue: 'Your content was flagged by our automated moderation system for violating community guidelines.',
    scope: 'installation',
  },

  // ===== Layer 3: AI Rules (Custom) =====
  {
    type: 'boolean',
    name: 'enableCustomAIRules',
    label: '🤖 Layer 3: Enable Custom AI Rules',
    helpText: 'Enable custom rules with AI analysis (Executes last if Layers 1-2 don\'t match). Uses your AI API keys and budget.',
    defaultValue: true,
    scope: 'installation',
  },
  {
    type: 'paragraph',
    name: 'rulesJson',
    label: '🤖 Custom Rules Configuration (JSON)',
    helpText: 'Configure AI-powered moderation rules in JSON format. Starts empty - add your own custom rules here. See documentation for examples. (Executes last if Layers 1-2 don\'t match)',
    defaultValue: '',
    scope: 'installation',
  },
  {
    type: 'select',
    name: 'primaryProvider',
    label: '🔑 Primary AI Provider',
    helpText: 'Which AI provider to use first for Layer 3 custom rules (configure API key below). Reddit only approves OpenAI and Gemini.',
    options: [
      { label: 'GPT-4o Mini (OpenAI)', value: 'openai' },
      { label: 'Gemini 1.5 Flash (Google)', value: 'gemini' },
    ],
    defaultValue: 'openai',
    scope: 'installation',
  },
  {
    type: 'select',
    name: 'fallbackProvider',
    label: '🔑 Fallback AI Provider',
    helpText: 'Which provider to use if primary fails (or "None" to disable fallback). Reddit only approves OpenAI and Gemini.',
    options: [
      { label: 'Gemini 1.5 Flash (Google)', value: 'gemini' },
      { label: 'GPT-4o Mini (OpenAI)', value: 'openai' },
      { label: 'None (no fallback)', value: 'none' },
    ],
    defaultValue: 'gemini',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'openaiApiKey',
    label: '🔑 OpenAI API Key',
    helpText: 'Your OpenAI API key for GPT-4o Mini. Get one at platform.openai.com. Only needed if using Layer 3 custom AI rules.',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'geminiApiKey',
    label: '🔑 Gemini API Key (Google)',
    helpText: 'Your Google AI Studio API key for Gemini 1.5 Flash. Get one at aistudio.google.com/apikey. Only needed if using Layer 3 custom AI rules.',
    scope: 'installation',
  },

  /* DEPRECATED - Not approved by Reddit Devvit policy (as of 2025-11-03)
  {
    type: 'string',
    name: 'claudeApiKey',
    label: '🔑 Claude API Key (Anthropic)',
    helpText: 'Your Anthropic API key for Claude 3.5 Haiku. Get one at console.anthropic.com. Only needed if using Layer 3 custom AI rules.',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'openaiCompatibleApiKey',
    label: '🔌 OpenAI Compatible: API Key (Optional)',
    helpText: 'API key for custom OpenAI-compatible endpoint (Groq, Together AI, self-hosted vLLM/Ollama, etc.). Used as fallback when standard providers unavailable.',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'openaiCompatibleBaseURL',
    label: '🔌 OpenAI Compatible: Base URL (Optional)',
    helpText: 'Base URL for OpenAI-compatible endpoint. Examples: https://api.groq.com/openai/v1 (Groq), https://api.together.xyz/v1 (Together AI), http://localhost:8000/v1 (vLLM)',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'openaiCompatibleModel',
    label: '🔌 OpenAI Compatible: Model Name (Optional)',
    helpText: 'Model to use at the custom endpoint. Examples: llama-3.1-70b-versatile (Groq), meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo (Together AI), meta-llama/Llama-3.1-8B-Instruct (vLLM)',
    scope: 'installation',
  },
  */
  {
    type: 'number',
    name: 'dailyBudgetLimit',
    label: '💰 Daily Budget Limit (USD)',
    helpText: 'Maximum AI spend per day in USD. System will stop AI analysis when exceeded. Only applies to Layer 3 custom rules.',
    defaultValue: 5,
    scope: 'installation',
  },
  {
    type: 'number',
    name: 'monthlyBudgetLimit',
    label: '💰 Monthly Budget Limit (USD)',
    helpText: 'Maximum AI spend per month in USD. System will stop AI analysis when exceeded. Only applies to Layer 3 custom rules.',
    defaultValue: 150,
    scope: 'installation',
  },
  {
    type: 'boolean',
    name: 'budgetAlertsEnabled',
    label: '💰 Budget Alerts: Enable',
    helpText: 'Send notifications when AI spending reaches 50%, 75%, or 90% of daily budget. Only applies to Layer 3 custom rules. Recipients configured in \'Notification Recipients\' below.',
    defaultValue: true,
    scope: 'installation',
  },

  // ===== Comment Templates =====
  {
    type: 'paragraph',
    name: 'removeCommentTemplate',
    label: '💬 REMOVE Action Comment Template',
    helpText: 'Custom template for comments posted when content is removed. Leave blank to use default. Variables: {reason}, {subreddit}, {contentType}, {confidence}',
    defaultValue: '',
    scope: 'installation',
  },
  {
    type: 'paragraph',
    name: 'commentActionTemplate',
    label: '💬 COMMENT Action Template',
    helpText: 'Custom template for warning comments (no removal). Leave blank to use default. Variables: {reason}, {subreddit}, {contentType}, {confidence}',
    defaultValue: '',
    scope: 'installation',
  },

  // ===== Notification Recipients (Unified) =====
  {
    type: 'select',
    name: 'notificationRecipient',
    label: '📬 Send All Notifications To',
    helpText: 'Where to send all alerts and notifications (daily digest, real-time, budget alerts)',
    options: [
      { label: 'Mod Notifications (all moderators)', value: 'all' },
      { label: 'Specific moderator(s)', value: 'specific' },
    ],
    defaultValue: 'all',
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'notificationRecipientUsernames',
    label: '📬 Recipient Username(s)',
    helpText: 'Comma-separated usernames without u/ prefix (e.g., \'user1, user2\'). Only used if \'Specific moderator(s)\' selected above.',
    scope: 'installation',
  },

  // ===== Daily Digest Notifications =====
  {
    type: 'boolean',
    name: 'dailyDigestEnabled',
    label: '📧 Daily Digest: Enable',
    helpText: 'Send a daily summary of moderation actions. Recipients configured in \'Notification Recipients\' above.',
    defaultValue: false,
    scope: 'installation',
  },
  {
    type: 'string',
    name: 'dailyDigestTime',
    label: '📧 Time (UTC)',
    helpText: 'Time to send digest in HH:MM format (24-hour, UTC). Example: 09:00',
    defaultValue: '09:00',
    scope: 'installation',
  },

  // ===== Real-time Notifications =====
  {
    type: 'boolean',
    name: 'realtimeNotificationsEnabled',
    label: '⚡ Real-time: Enable Notifications',
    helpText: 'Send immediate notification after each moderation action (useful for debugging). Recipients configured in \'Notification Recipients\' above.',
    defaultValue: false,
    scope: 'installation',
  },

  // ===== Cache Version (Debug - Force Cache Invalidation) =====
  {
    type: 'string',
    name: 'cacheVersion',
    label: '🔄 Cache Version (Debug)',
    helpText: 'Increment this number (1→2→3...) to force complete cache invalidation for ALL users in this subreddit. Use when testing or after major configuration changes. All cache keys use format v1:{this}:user:... Current: Shows as first number after v1 in Redis keys.',
    defaultValue: '1',
    scope: 'installation',
  },

  // ===== Dry-Run Mode =====
  {
    type: 'boolean',
    name: 'dryRunMode',
    label: '🧪 Enable Dry-Run Mode (Global)',
    helpText: 'When enabled, all actions are logged but NOT executed. Recommended for initial testing.',
    defaultValue: true,
    scope: 'installation',
  },
  {
    type: 'boolean',
    name: 'dryRunLogDetails',
    label: '🧪 Log Detailed Dry-Run Actions',
    helpText: 'Log detailed information about what WOULD happen in dry-run mode',
    defaultValue: true,
    scope: 'installation',
  },
]);

// Register forms
console.log('[AI Automod] Registering forms...');

// AI Analysis Form - displays detailed analysis with separate fields for better readability
const aiAnalysisForm = Devvit.createForm(
  (data) => {
    const analysis = data.analysis as any;

    if (!analysis) {
      return {
        title: '🤖 AI Automod Analysis',
        description: 'No analysis data available',
        fields: [],
        acceptLabel: 'Close',
      };
    }

    const actionEmoji = {
      'REMOVE': '🚫',
      'FLAG': '🚩',
      'COMMENT': '💬',
      'APPROVE': '✅',
    }[analysis.action] || '❓';

    const date = new Date(analysis.timestamp);

    const fields: any[] = [
      {
        type: 'string',
        name: 'action',
        label: `${actionEmoji} Action Taken`,
        defaultValue: analysis.action,
      },
      {
        type: 'string',
        name: 'triggered',
        label: '⚡ Triggered By',
        defaultValue: analysis.layerTriggered ?
          (analysis.layerTriggered === 'builtin' ? 'Layer 1: New Account Check' :
           analysis.layerTriggered === 'moderation' ? 'Layer 2: OpenAI Moderation' :
           analysis.layerTriggered === 'custom' ? 'Layer 3: Custom AI Rules' :
           'Unknown') :
          'Layer 3: Custom AI Rules',
      },
      {
        type: 'group',
        label: '👤 User Information',
        fields: [
          {
            type: 'string',
            name: 'author',
            label: 'Author',
            defaultValue: `u/${analysis.authorName}`,
          },
          {
            type: 'string',
            name: 'trust',
            label: 'Trust Score',
            defaultValue: `${analysis.trustScore}/100`,
          },
          {
            type: 'string',
            name: 'age',
            label: 'Account Age',
            defaultValue: `${analysis.accountAgeInDays} days`,
          },
          {
            type: 'string',
            name: 'karma',
            label: 'Total Karma',
            defaultValue: analysis.totalKarma.toLocaleString(),
          },
        ],
      },
    ];

    // Layer 1: New Account Check
    if (analysis.layer1Passed !== undefined) {
      const layer1Status = analysis.layer1Passed ? '✅ Passed' : '❌ Failed';
      const layer1Fields: any[] = [
        {
          type: 'string',
          name: 'layer1_status',
          label: 'Status',
          defaultValue: layer1Status,
        },
      ];

      if (!analysis.layer1Passed && analysis.layer1Reason) {
        layer1Fields.push({
          type: 'paragraph',
          name: 'layer1_reason',
          label: 'Reason',
          defaultValue: analysis.layer1Reason,
        });
      }

      fields.push({
        type: 'group',
        label: '🔧 Layer 1: New Account Check',
        fields: layer1Fields,
      });
    }

    // Layer 2: OpenAI Moderation
    if (analysis.layer2Passed !== undefined) {
      const layer2Status = analysis.layer2Passed ? '✅ Passed' : '❌ Failed';
      const layer2Fields: any[] = [
        {
          type: 'string',
          name: 'layer2_status',
          label: 'Status',
          defaultValue: layer2Status,
        },
      ];

      if (!analysis.layer2Passed) {
        if (analysis.layer2Categories && analysis.layer2Categories.length > 0) {
          layer2Fields.push({
            type: 'string',
            name: 'layer2_categories',
            label: 'Flagged Categories',
            defaultValue: analysis.layer2Categories.join(', '),
          });
        }
        if (analysis.layer2Reason) {
          layer2Fields.push({
            type: 'paragraph',
            name: 'layer2_reason',
            label: 'Reason',
            defaultValue: analysis.layer2Reason,
          });
        }
      }

      fields.push({
        type: 'group',
        label: '🛡️ Layer 2: OpenAI Moderation',
        fields: layer2Fields,
      });
    }

    // Layer 3: Custom AI Rules
    if (analysis.layer3Passed !== undefined || analysis.aiProvider) {
      const layer3Status = analysis.layer3Passed === false ? '❌ Failed' :
                           analysis.layer3Passed === true ? '✅ Passed' :
                           'Evaluated';
      const layer3Fields: any[] = [];

      if (analysis.layer3Passed !== undefined) {
        layer3Fields.push({
          type: 'string',
          name: 'layer3_status',
          label: 'Status',
          defaultValue: layer3Status,
        });
      }

      if (analysis.aiProvider) {
        layer3Fields.push({
          type: 'string',
          name: 'provider',
          label: 'AI Provider',
          defaultValue: analysis.aiProvider,
        });
        layer3Fields.push({
          type: 'string',
          name: 'model',
          label: 'AI Model',
          defaultValue: analysis.aiModel || 'Unknown',
        });
      }

      if (analysis.confidence) {
        layer3Fields.push({
          type: 'string',
          name: 'confidence',
          label: 'Confidence',
          defaultValue: `${analysis.confidence}%`,
        });
      }

      if (analysis.ruleName) {
        layer3Fields.push({
          type: 'string',
          name: 'rule',
          label: 'Matched Rule',
          defaultValue: analysis.ruleName,
        });
      }

      if (analysis.aiCostUSD !== undefined) {
        layer3Fields.push({
          type: 'string',
          name: 'cost',
          label: '💰 AI Cost',
          defaultValue: `$${analysis.aiCostUSD.toFixed(4)} USD`,
        });
      }

      if (analysis.aiTokensUsed) {
        layer3Fields.push({
          type: 'string',
          name: 'tokens',
          label: '🔢 Tokens Used',
          defaultValue: analysis.aiTokensUsed.toLocaleString(),
        });
      }

      if (analysis.aiReasoning) {
        layer3Fields.push({
          type: 'paragraph',
          name: 'ai_reasoning',
          label: 'AI Reasoning',
          defaultValue: analysis.aiReasoning,
        });
      } else if (analysis.ruleReason) {
        layer3Fields.push({
          type: 'paragraph',
          name: 'rule_reason',
          label: 'Reason',
          defaultValue: analysis.ruleReason,
        });
      }

      if (layer3Fields.length > 0) {
        fields.push({
          type: 'group',
          label: '🤖 Layer 3: Custom AI Rules',
          fields: layer3Fields,
        });
      }
    }

    fields.push({
      type: 'string',
      name: 'timestamp',
      label: '🕐 Processed',
      defaultValue: date.toLocaleString(),
    });

    return {
      title: '🤖 AI Automod Analysis',
      description: `Analysis results for all moderation layers. Shows which layers were evaluated and why the action was taken.`,
      fields,
      acceptLabel: 'Close',
    };
  },
  async (event, context) => {
    // Form submission handler (just closes)
  }
);

console.log('[AI Automod] ✓ Registered: AI Analysis Form');

// Cost Dashboard Form - displays AI usage and budget information
const costDashboardForm = Devvit.createForm(
  (data) => {
    const dashboard = data.dashboard as any;

    if (!dashboard) {
      return {
        title: '💰 AI Cost Dashboard',
        description: 'No cost data available',
        fields: [],
        acceptLabel: 'Close',
      };
    }

    const dailyPercent = dashboard.settings.dailyLimit > 0
      ? ((dashboard.daily.total / dashboard.settings.dailyLimit) * 100).toFixed(1)
      : '0.0';

    const monthlyPercent = dashboard.settings.monthlyLimit > 0
      ? ((dashboard.monthly.total / dashboard.settings.monthlyLimit) * 100).toFixed(1)
      : '0.0';

    const dailyStatus = parseFloat(dailyPercent) >= 90 ? '🔴' : parseFloat(dailyPercent) >= 75 ? '⚠️' : parseFloat(dailyPercent) >= 50 ? '⚠️' : '✅';
    const monthlyStatus = parseFloat(monthlyPercent) >= 90 ? '🔴' : parseFloat(monthlyPercent) >= 75 ? '⚠️' : parseFloat(monthlyPercent) >= 50 ? '⚠️' : '✅';

    const lastUpdated = new Date(dashboard.lastUpdated).toLocaleString();

    const fields: any[] = [
      {
        type: 'group',
        label: '📅 Today',
        fields: [
          {
            type: 'string',
            name: 'daily_total',
            label: `${dailyStatus} Total Spent`,
            defaultValue: `$${dashboard.daily.total.toFixed(4)}`,
          },
          {
            type: 'string',
            name: 'daily_limit',
            label: '💵 Daily Budget',
            defaultValue: `$${dashboard.settings.dailyLimit.toFixed(2)}`,
          },
          {
            type: 'string',
            name: 'daily_percent',
            label: '📊 Usage',
            defaultValue: `${dailyPercent}%`,
          },
          ...(dashboard.daily.claude > 0 ? [{
            type: 'string' as const,
            name: 'daily_claude',
            label: '🤖 Claude',
            defaultValue: `$${dashboard.daily.claude.toFixed(4)}`,
          }] : []),
          ...(dashboard.daily.openai > 0 ? [{
            type: 'string' as const,
            name: 'daily_openai',
            label: '🤖 OpenAI',
            defaultValue: `$${dashboard.daily.openai.toFixed(4)}`,
          }] : []),
          ...(dashboard.daily['openai-compatible'] > 0 ? [{
            type: 'string' as const,
            name: 'daily_compat',
            label: '🔌 OpenAI Compatible',
            defaultValue: `$${dashboard.daily['openai-compatible'].toFixed(4)}`,
          }] : []),
        ],
      },
      {
        type: 'group',
        label: '📆 This Month',
        fields: [
          {
            type: 'string',
            name: 'monthly_total',
            label: `${monthlyStatus} Total Spent`,
            defaultValue: `$${dashboard.monthly.total.toFixed(4)}`,
          },
          {
            type: 'string',
            name: 'monthly_limit',
            label: '💵 Monthly Budget',
            defaultValue: `$${dashboard.settings.monthlyLimit.toFixed(2)}`,
          },
          {
            type: 'string',
            name: 'monthly_percent',
            label: '📊 Usage',
            defaultValue: `${monthlyPercent}%`,
          },
          ...(dashboard.monthly.claude > 0 ? [{
            type: 'string' as const,
            name: 'monthly_claude',
            label: '🤖 Claude',
            defaultValue: `$${dashboard.monthly.claude.toFixed(4)}`,
          }] : []),
          ...(dashboard.monthly.openai > 0 ? [{
            type: 'string' as const,
            name: 'monthly_openai',
            label: '🤖 OpenAI',
            defaultValue: `$${dashboard.monthly.openai.toFixed(4)}`,
          }] : []),
          ...(dashboard.monthly['openai-compatible'] > 0 ? [{
            type: 'string' as const,
            name: 'monthly_compat',
            label: '🔌 OpenAI Compatible',
            defaultValue: `$${dashboard.monthly['openai-compatible'].toFixed(4)}`,
          }] : []),
        ],
      },
      {
        type: 'group',
        label: '⚙️ Configuration',
        fields: [
          {
            type: 'string',
            name: 'mode',
            label: '🧪 Mode',
            defaultValue: dashboard.settings.dryRunMode ? 'DRY-RUN (testing)' : 'LIVE (active)',
          },
          {
            type: 'string',
            name: 'primary',
            label: '🔑 Primary AI',
            defaultValue: dashboard.settings.primaryProvider,
          },
          {
            type: 'string',
            name: 'fallback',
            label: '🔄 Fallback AI',
            defaultValue: dashboard.settings.fallbackProvider,
          },
        ],
      },
      {
        type: 'string',
        name: 'updated',
        label: '🕐 Last Updated',
        defaultValue: lastUpdated,
      },
    ];

    return {
      title: '💰 AI Cost Dashboard',
      description: 'Layer 3 (Custom AI Rules) usage only. Layer 1 & 2 are free.',
      fields,
      acceptLabel: 'Close',
    };
  },
  async (event, context) => {
    // Form submission handler (just closes)
  }
);

console.log('[AI Automod] ✓ Registered: Cost Dashboard Form');

// Register menu items
console.log('[AI Automod] Registering menu items...');

// Cost Dashboard Menu Item (Phase 4.4)
Devvit.addMenuItem({
  label: 'View AI Costs',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    try {
      const { CostDashboardCache } = await import('./dashboard/costDashboardCache.js');
      const dashboard = await CostDashboardCache.getDashboardData(context);

      // Show form with dashboard data
      context.ui.showForm(costDashboardForm, { dashboard });
    } catch (error) {
      console.error('[CostDashboard] Error loading dashboard:', error);
      context.ui.showToast({
        text: 'Error loading cost dashboard. Check logs for details.',
        appearance: 'neutral',
      });
    }
  },
});
console.log('[AI Automod] ✓ Registered: View AI Costs (subreddit)');

// Post Analysis Menu Item (Phase 5)
// NOTE: Post menu items don't appear during playtest mode (Devvit limitation)
// This will work after production upload with 'devvit upload'
Devvit.addMenuItem({
  label: 'View AI Analysis',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    console.log('[PostAnalysis] Menu item clicked!');
    const postId = event.targetId;
    console.log(`[PostAnalysis] Fetching analysis for post: ${postId}`);

    try {
      // Fetch analysis data from Redis
      const analysis = await getAnalysisHistory(context.redis, postId);

      if (!analysis) {
        context.ui.showToast({
          text: 'No AI analysis available for this post.',
          appearance: 'neutral',
        });
        return;
      }

      // Show form with the analysis data
      context.ui.showForm(aiAnalysisForm, {
        postId,
        analysis,
      });
    } catch (error) {
      console.error('[PostAnalysis] Error fetching analysis:', error);
      context.ui.showToast({
        text: 'Error loading analysis. Check logs.',
        appearance: 'neutral',
      });
    }
  },
});
console.log('[AI Automod] ✓ Registered: View AI Analysis (post)');

// Reset All Data Menu Item
Devvit.addMenuItem({
  label: 'Reset All Data',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    try {
      console.log('[ResetAllData] Starting complete data reset...');
      const { redis, subredditName } = context;

      // Get current cache version from settings
      const cacheVersion = (await context.settings.get('cacheVersion')) || '1';

      // Import cache invalidation functions
      const { clearSubredditCache } = await import('./storage/keyBuilder.js');

      // Clear all cached data for this subreddit
      const stats = await clearSubredditCache(redis, subredditName, cacheVersion, false);

      console.log(`[ResetAllData] Reset complete: ${stats.usersCleared} users cleared, ${stats.keysDeleted} keys deleted (cache version: ${cacheVersion}).`);

      context.ui.showToast({
        text: `✅ Reset complete! Cleared all data for ${stats.usersCleared} users (${stats.keysDeleted} cache entries) in r/${subredditName} (v1:${cacheVersion}). All users will start completely fresh.`,
        appearance: 'success',
      });
    } catch (error) {
      console.error('[ResetAllData] Error resetting data:', error);
      context.ui.showToast({
        text: '❌ Error resetting data. Check logs for details.',
        appearance: 'neutral',
      });
    }
  },
});
console.log('[AI Automod] ✓ Registered: Reset All Data (subreddit)');

// Clear User Cache Menu Item (on posts)
Devvit.addMenuItem({
  label: 'Clear User Cache',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    try {
      const post = await context.reddit.getPostById(event.targetId);
      const userId = `t2_${post.authorId}`;
      const username = post.authorName;

      // Get current cache version from settings
      const cacheVersion = (await context.settings.get('cacheVersion')) || '1';

      console.log(`[ClearUserCache] Clearing cache for user ${username} (${userId}) with version ${cacheVersion}`);

      // Import cache invalidation function
      const { clearUserCache } = await import('./storage/keyBuilder.js');

      // Clear all cached data for this user
      await clearUserCache(context.redis, userId, cacheVersion);

      console.log(`[ClearUserCache] Cache cleared for user ${username} (${userId})`);

      context.ui.showToast({
        text: `✅ Cleared all cached data for u/${username} (v1:${cacheVersion}). Their next post will be fully re-analyzed.`,
        appearance: 'success',
      });
    } catch (error) {
      console.error('[ClearUserCache] Error clearing user cache:', error);
      context.ui.showToast({
        text: '❌ Error clearing cache. Check logs for details.',
        appearance: 'neutral',
      });
    }
  },
});
console.log('[AI Automod] ✓ Registered: Clear User Cache (post)');

// Clear User Cache Menu Item (on comments)
Devvit.addMenuItem({
  label: 'Clear User Cache',
  location: 'comment',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    try {
      const comment = await context.reddit.getCommentById(event.targetId);
      const userId = `t2_${comment.authorId}`;
      const username = comment.authorName;

      // Get current cache version from settings
      const cacheVersion = (await context.settings.get('cacheVersion')) || '1';

      console.log(`[ClearUserCache] Clearing cache for user ${username} (${userId}) with version ${cacheVersion}`);

      // Import cache invalidation function
      const { clearUserCache } = await import('./storage/keyBuilder.js');

      // Clear all cached data for this user
      await clearUserCache(context.redis, userId, cacheVersion);

      console.log(`[ClearUserCache] Cache cleared for user ${username} (${userId})`);

      context.ui.showToast({
        text: `✅ Cleared all cached data for u/${username} (v1:${cacheVersion}). Their next post will be fully re-analyzed.`,
        appearance: 'success',
      });
    } catch (error) {
      console.error('[ClearUserCache] Error clearing user cache:', error);
      context.ui.showToast({
        text: '❌ Error clearing cache. Check logs for details.',
        appearance: 'neutral',
      });
    }
  },
});
console.log('[AI Automod] ✓ Registered: Clear User Cache (comment)');

console.log('[AI Automod] Menu items registration complete');

// Register event handlers
console.log('[AI Automod] Registering event handlers...');

// Handle new post submissions
Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: handlePostSubmit,
});

// Handle new comment submissions
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: handleCommentSubmit,
});

// Handle moderator actions (Phase 5.14 - Community Trust System)
Devvit.addTrigger({
  event: 'ModAction',
  onEvent: handleModAction,
});

// Handle app installation (initialize default rules)
Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (event, context) => {
    console.log('[AppInstall] App installed, initializing default rules...');
    try {
      await initializeDefaultRules(context);
    } catch (error) {
      console.error('[AppInstall] Failed to initialize default rules:', error);
      // Don't throw - let the app continue even if initialization fails
      // PostSubmit handler has fallback initialization as safety net
    }
  },
});

// Daily Digest Scheduler (Phase 5)
Devvit.addSchedulerJob({
  name: 'dailyDigest',
  cron: '0 9 * * *', // Run at 9:00 AM UTC daily (can be customized via settings)
  onRun: async (_event, context) => {
    console.log('[DailyDigest] Scheduler triggered');
    try {
      await sendDailyDigest(context);
    } catch (error) {
      console.error('[DailyDigest] Error in scheduled job:', error);
      // Don't throw - we don't want to crash the scheduler
    }
  },
});

console.log('[AI Automod] Event handlers registered successfully');
console.log('[AI Automod] Phase 1: Foundation & Setup');
console.log('[AI Automod] Monitoring: PostSubmit, CommentSubmit, ModAction, AppInstall, DailyDigest');

// Export the app
export default Devvit;
