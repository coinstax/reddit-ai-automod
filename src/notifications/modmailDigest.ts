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

/**
 * Modmail Digest Module
 *
 * Sends daily digest of AI moderation actions to moderators via modmail.
 * Supports sending to all moderators (Mod Notifications) or a specific moderator.
 *
 * @module notifications/modmailDigest
 */

import { Context } from '@devvit/public-api';
import { AuditLog } from '../types/storage.js';

/**
 * Send daily digest of AI moderation actions via modmail
 *
 * NOTE: This function is a stub placeholder. Full implementation requires
 * adding getLogsInRange() method to AuditLogger and implementing key tracking
 * in Redis storage layer.
 *
 * @param context - Devvit context with redis and reddit API access
 *
 * @example
 * ```typescript
 * // Called by scheduled job
 * await sendDailyDigest(context);
 * ```
 */
export async function sendDailyDigest(context: Context): Promise<void> {
  try {
    console.log('[ModmailDigest] Daily digest called (not yet fully implemented)');

    // Get settings
    const settings = await context.settings.getAll();
    const dailyDigestEnabled = settings.dailyDigestEnabled as boolean;
    // Note: notificationRecipient and notificationRecipientUsernames will be used
    // when the full daily digest implementation is complete (see TODO below)

    // Check if daily digest is enabled
    if (!dailyDigestEnabled) {
      console.log('[ModmailDigest] Daily digest is disabled, skipping');
      return;
    }

    console.log('[ModmailDigest] Daily digest not yet fully implemented - requires getLogsInRange() on AuditLogger');
    // TODO: Implement full daily digest when AuditLogger.getLogsInRange() is available
    // When implemented:
    // - If notificationRecipient is 'all', send to modmail
    // - If notificationRecipient is 'specific', split notificationRecipientUsernames by comma, trim, and send PM to each
  } catch (error) {
    console.error('[ModmailDigest] Error in daily digest:', error);
    // Don't throw - we don't want to crash the scheduler
  }
}

/**
 * Send real-time digest for a single moderation action
 *
 * Sends immediate notification via modmail for each action taken.
 * Useful for testing and real-time monitoring.
 *
 * @param context - Devvit context
 * @param auditLog - Single audit log entry for the action just taken
 */
export async function sendRealtimeDigest(context: Context, auditLog: AuditLog): Promise<void> {
  try {
    const settings = await context.settings.getAll();
    const realtimeNotificationsEnabled = settings.realtimeNotificationsEnabled as boolean;
    const notificationRecipient = (settings.notificationRecipient as string[])?.[0] || 'all';
    const notificationRecipientUsernames = settings.notificationRecipientUsernames as string;

    console.log('[ModmailDigest] Real-time notification settings:', {
      realtimeNotificationsEnabled,
      notificationRecipient,
      notificationRecipientUsernames,
    });

    // Check if real-time notifications are enabled
    if (!realtimeNotificationsEnabled) {
      console.log('[ModmailDigest] Skipping - real-time notifications disabled');
      return;
    }

    // Format the single action message
    const message = formatRealtimeMessage(auditLog, settings);
    const subject = `AI Automod - ${auditLog.action} Action`;

    // Send via PM if specific user(s), modmail if all mods
    if (notificationRecipient === 'specific' && notificationRecipientUsernames) {
      // Parse comma-separated usernames
      const usernames = notificationRecipientUsernames
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);

      if (usernames.length === 0) {
        console.log('[ModmailDigest] No valid usernames found, skipping');
        return;
      }

      console.log(`[ModmailDigest] Sending PMs to ${usernames.length} specific user(s): ${usernames.join(', ')}`);

      // Send individual PM to each username
      for (const username of usernames) {
        try {
          await context.reddit.sendPrivateMessage({
            to: username,
            subject: subject,
            text: message,
          });
          console.log(`[ModmailDigest] ✓ PM sent to u/${username}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);

          // Check for common PM failures
          if (errorMsg.includes('NOT_WHITELISTED_BY_USER_MESSAGE') ||
              errorMsg.includes("can't send a message to that user")) {
            console.error(`[ModmailDigest] ❌ Cannot PM u/${username} - User has restricted PMs to trusted users only.`);
            console.error(`[ModmailDigest] Solution: Ask u/${username} to either:`);
            console.error(`[ModmailDigest]   1. Add the bot to their trusted users list, OR`);
            console.error(`[ModmailDigest]   2. Change notification recipient to "all" to use modmail instead`);
          } else if (errorMsg.includes('USER_DOESNT_EXIST')) {
            console.error(`[ModmailDigest] ❌ Cannot PM u/${username} - User doesn't exist`);
          } else {
            console.error(`[ModmailDigest] ❌ Error sending PM to u/${username}:`, error);
          }
          // Continue with other usernames even if one fails
        }
      }
    } else {
      // Send as modmail to all mods
      console.log('[ModmailDigest] Sending modmail to Mod Notifications (all mods)');

      await context.reddit.modMail.createModInboxConversation({
        subredditId: context.subredditId,
        subject: subject,
        bodyMarkdown: message,
      });

      console.log('[ModmailDigest] ✓ Modmail sent to all mods');
    }

    console.log(`[ModmailDigest] ✓ Realtime notification sent for ${auditLog.action} action on ${auditLog.contentId}`);
  } catch (error) {
    console.error('[ModmailDigest] Error sending realtime digest:', error);
    // Don't throw - we don't want to crash the handler
  }
}

/**
 * Format a single audit log entry into a real-time notification message
 *
 * @param log - Single audit log entry
 * @param settings - App settings
 * @returns Formatted markdown string
 */
function formatRealtimeMessage(log: AuditLog, settings: any): string {
  const dryRunMode = settings.dryRunMode as boolean;
  const metadata = log.metadata as any || {};

  // Determine content type from contentId (t3_ = post, t1_ = comment)
  const contentType = log.contentId.startsWith('t3_') ? 'Post' :
                      log.contentId.startsWith('t1_') ? 'Comment' :
                      'Content';

  let message = `## AI Automod - ${log.action} Action\n\n`;

  if (dryRunMode) {
    message += `**⚠️ DRY-RUN MODE** - Action was logged but not executed.\n\n`;
  }

  message += `**Action:** ${log.action}\n`;
  message += `**Target:** ${contentType} ${log.contentId}\n`;
  message += `**User:** u/${log.userId}\n`;
  message += `**Reason:** ${log.reason}\n`;

  if (log.confidence !== undefined) {
    message += `**Confidence:** ${log.confidence}%\n`;
  }

  if (metadata.trustScore !== undefined) {
    message += `**Trust Score:** ${metadata.trustScore}%\n`;
  }

  if (metadata.aiCost) {
    message += `**AI Cost:** $${metadata.aiCost.toFixed(4)}\n`;
  }

  if (log.ruleId) {
    message += `**Matched Rule:** ${log.ruleId}\n`;
  }

  if (metadata.dryRun === true) {
    message += `**Dry-Run:** Yes\n`;
  }

  if (metadata.executionTime !== undefined) {
    message += `**Execution Time:** ${metadata.executionTime}ms\n`;
  }

  // Add post/comment details if available
  if (metadata.postTitle) {
    message += `\n**Post Title:** ${metadata.postTitle}\n`;
  }

  if (metadata.bodyPreview) {
    message += `**Content Preview:** ${metadata.bodyPreview}\n`;
  }

  message += `\n**Timestamp:** ${new Date(log.timestamp).toISOString()}\n`;

  message += `\n---\n`;
  message += `*View full details in mod log or subreddit menu*`;

  return message;
}

/**
 * Send budget alert notification when spending thresholds are reached
 *
 * @param context - Devvit context
 * @param alertLevel - Budget alert level ('WARNING_50' | 'WARNING_75' | 'WARNING_90' | 'EXCEEDED')
 * @param budgetStatus - Current budget status with spending details
 */
export async function sendBudgetAlert(
  context: Context,
  alertLevel: string,
  budgetStatus: {
    dailySpent: number;
    dailyLimit: number;
    dailyRemaining: number;
    perProviderSpent: Record<string, number>;
  }
): Promise<void> {
  try {
    const settings = await context.settings.getAll();
    const budgetAlertsEnabled = settings.budgetAlertsEnabled as boolean;
    const notificationRecipient = (settings.notificationRecipient as string[])?.[0] || 'all';
    const notificationRecipientUsernames = settings.notificationRecipientUsernames as string;

    // Check if budget alerts are enabled
    if (!budgetAlertsEnabled) {
      console.log('[ModmailDigest] Budget alerts disabled, skipping notification');
      return;
    }

    // Format the alert message
    const message = formatBudgetAlertMessage(alertLevel, budgetStatus);
    const subject = `AI Automod - Budget Alert: ${alertLevel}`;

    // Send via PM if specific user(s), modmail if all mods
    if (notificationRecipient === 'specific' && notificationRecipientUsernames) {
      // Parse comma-separated usernames
      const usernames = notificationRecipientUsernames
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);

      if (usernames.length === 0) {
        console.log('[ModmailDigest] No valid usernames for budget alert, skipping');
        return;
      }

      console.log(`[ModmailDigest] Sending budget alert PMs to ${usernames.length} user(s)`);

      // Send individual PM to each username
      for (const username of usernames) {
        try {
          await context.reddit.sendPrivateMessage({
            to: username,
            subject: subject,
            text: message,
          });
          console.log(`[ModmailDigest] ✓ Budget alert PM sent to u/${username}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);

          // Check for common PM failures
          if (errorMsg.includes('NOT_WHITELISTED_BY_USER_MESSAGE') ||
              errorMsg.includes("can't send a message to that user")) {
            console.error(`[ModmailDigest] ❌ Cannot PM u/${username} - User has restricted PMs to trusted users only.`);
            console.error(`[ModmailDigest] Solution: Ask u/${username} to either:`);
            console.error(`[ModmailDigest]   1. Add the bot to their trusted users list, OR`);
            console.error(`[ModmailDigest]   2. Change notification recipient to "all" to use modmail instead`);
          } else if (errorMsg.includes('USER_DOESNT_EXIST')) {
            console.error(`[ModmailDigest] ❌ Cannot PM u/${username} - User doesn't exist`);
          } else {
            console.error(`[ModmailDigest] ❌ Error sending budget alert to u/${username}:`, error);
          }
        }
      }
    } else {
      // Send as modmail to all mods
      console.log('[ModmailDigest] Sending budget alert to Mod Notifications (all mods)');

      await context.reddit.modMail.createModInboxConversation({
        subredditId: context.subredditId,
        subject: subject,
        bodyMarkdown: message,
      });

      console.log('[ModmailDigest] ✓ Budget alert modmail sent');
    }

    console.log(`[ModmailDigest] ✓ Budget alert sent for ${alertLevel}`);
  } catch (error) {
    console.error('[ModmailDigest] Error sending budget alert:', error);
    // Don't throw - we don't want to crash budget tracking
  }
}

/**
 * Format budget alert message
 */
function formatBudgetAlertMessage(alertLevel: string, budgetStatus: any): string {
  const percentUsed = ((budgetStatus.dailySpent / budgetStatus.dailyLimit) * 100).toFixed(1);

  let message = `## AI Automod - Budget Alert\n\n`;

  if (alertLevel === 'EXCEEDED') {
    message += `**🔴 BUDGET EXCEEDED** - AI analysis has been disabled until tomorrow.\n\n`;
  } else if (alertLevel === 'WARNING_90') {
    message += `**⚠️ CRITICAL WARNING** - 90% of daily AI budget used.\n\n`;
  } else if (alertLevel === 'WARNING_75') {
    message += `**⚠️ WARNING** - 75% of daily AI budget used.\n\n`;
  } else if (alertLevel === 'WARNING_50') {
    message += `**ℹ️ NOTICE** - 50% of daily AI budget used.\n\n`;
  }

  message += `**Daily Spent:** $${budgetStatus.dailySpent.toFixed(4)}\n`;
  message += `**Daily Limit:** $${budgetStatus.dailyLimit.toFixed(2)}\n`;
  message += `**Remaining:** $${budgetStatus.dailyRemaining.toFixed(4)}\n`;
  message += `**Percent Used:** ${percentUsed}%\n\n`;

  message += `**Per-Provider Breakdown:**\n`;
  for (const [provider, spent] of Object.entries(budgetStatus.perProviderSpent)) {
    message += `- ${provider}: $${(spent as number).toFixed(4)}\n`;
  }

  message += `\n---\n`;
  message += `*Budget resets daily at midnight UTC. View full cost details in subreddit menu.*`;

  return message;
}

