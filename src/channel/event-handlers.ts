/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Event handlers for the Feishu WebSocket monitor.
 *
 * Extracted from monitor.ts to improve testability and reduce
 * function size. Each handler receives a MonitorContext with all
 * dependencies needed to process the event.
 */

import type { FeishuBotAddedEvent, FeishuMessageEvent, FeishuReactionCreatedEvent } from '../messaging/types';
import { handleFeishuMessage } from '../messaging/inbound/handler';
import { handleFeishuReaction, resolveReactionContext } from '../messaging/inbound/reaction-handler';
import { handleFeishuCommentEvent } from '../messaging/inbound/comment-handler';
import { parseFeishuDriveCommentNoticeEventPayload } from '../messaging/inbound/comment-context';
import { isMessageExpired } from '../messaging/inbound/dedup';
import { withTicket } from '../core/lark-ticket';
import { larkLogger } from '../core/lark-logger';
import { handleCardAction } from '../tools/auto-auth';
import { handleAskUserAction } from '../tools/ask-user-question';
import { LarkClient } from '../core/lark-client';
import { handleDangerousConfirmationCardAction } from '../messaging/inbound/dangerous-confirmation-cards';
import { addReactionFeishu } from '../messaging/outbound/reactions';
import { buildQueueKey, enqueueFeishuChatTask, getActiveDispatcher, hasActiveTask } from './chat-queue';
import {
  extractRawTextFromEvent,
  isLikelyAbortText,
} from './abort-detect';
import { enqueueSessionPendingMessage } from './session-pending-queue';
import { interruptSessionViaProvider, trySteerSessionViaProvider } from './acp-session-provider';
import { handleAcpConfigCardAction, showAcpConfigCard } from './config-card';
import type { MonitorContext } from './types';
import { dispatchFeishuPluginInteractiveHandler } from './interactive-dispatch';

const elog = larkLogger('channel/event-handlers');

// ---------------------------------------------------------------------------
// Event ownership validation
// ---------------------------------------------------------------------------

/**
 * Verify that the event's app_id matches the current account.
 *
 * Lark SDK EventDispatcher flattens the v2 envelope header (which
 * contains `app_id`) into the handler `data` object, so `app_id` is
 * available directly on `data`.
 *
 * Returns `false` (discard event) when the app_id does not match.
 */
function isEventOwnershipValid(ctx: MonitorContext, data: unknown): boolean {
  const expectedAppId = ctx.lark.account.appId;
  if (!expectedAppId) return true; // appId not configured — skip check

  const eventAppId = (data as Record<string, unknown>).app_id;
  if (eventAppId == null) return true; // SDK did not provide app_id — defensive skip

  if (eventAppId !== expectedAppId) {
    elog.warn('event app_id mismatch, discarding', {
      accountId: ctx.accountId,
      expected: expectedAppId,
      received: String(eventAppId),
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

export async function handleMessageEvent(ctx: MonitorContext, data: unknown): Promise<void> {
  if (!isEventOwnershipValid(ctx, data)) return;
  const { accountId, log, error } = ctx;
  try {
    const event = data as FeishuMessageEvent;
    const feishuCfg = ctx.cfg.channels?.feishu ?? {};
    const steerTimeoutMs = Math.max(1, feishuCfg.steerTimeoutMs ?? 1000);
    const steerRetryDelayMs = Math.max(1, feishuCfg.steerRetryDelayMs ?? 500);
    const msgId = event.message?.message_id ?? 'unknown';
    const chatId = event.message?.chat_id ?? '';
    // In topic groups, reply events carry root_id but not thread_id.
    // Use root_id as fallback so different topics get separate queue keys
    // and can be processed in parallel.
    const threadId = event.message?.thread_id || event.message?.root_id || undefined;

    // Dedup — skip duplicate messages (e.g. from WebSocket reconnects).
    if (!ctx.messageDedup.tryRecord(msgId, accountId)) {
      log(`feishu[${accountId}]: duplicate message ${msgId}, skipping`);
      return;
    }

    // Expiry — discard stale messages from reconnect replay.
    if (isMessageExpired(event.message?.create_time)) {
      log(`feishu[${accountId}]: message ${msgId} expired, discarding`);
      return;
    }

    const queueKey = buildQueueKey(accountId, chatId, threadId);
    const promptText = extractRawTextFromEvent(event);
    const active = getActiveDispatcher(queueKey);
    const route = LarkClient.runtime.channel.routing.resolveAgentRoute({
      cfg: ctx.cfg,
      channel: 'feishu',
      accountId,
      peer: {
        kind: event.message?.chat_type === 'group' ? 'group' : 'direct',
        id: event.message?.chat_type === 'group'
          ? chatId
          : (event.sender?.sender_id?.open_id || chatId),
      },
    });
    const routedSessionKey = String(route.sessionKey || '').trim() || active?.sessionKey;

    if (promptText && isLikelyAbortText(promptText)) {
      if (routedSessionKey) {
        const interrupted = await interruptSessionViaProvider({
          sessionKey: routedSessionKey,
          reason: 'feishu-interrupt',
          timeoutMs: steerTimeoutMs,
        });
        if (interrupted) {
          log(`feishu[${accountId}]: ACP abort trigger interrupted session for chat ${chatId}`);
          active?.abortController?.abort();
          active?.abortCard().catch((err) => {
            error(`feishu[${accountId}]: interrupt fast-path abortCard failed: ${String(err)}`);
          });
          try {
            await addReactionFeishu({
              cfg: ctx.cfg,
              messageId: msgId,
              emojiType: 'CheckMark',
              accountId,
            });
          } catch (err) {
            error(`feishu[${accountId}]: failed to add interrupt reaction on ${msgId}: ${String(err)}`);
          }
          return;
        }
      }

      if (hasActiveTask(queueKey)) {
        const activeDispatcher = getActiveDispatcher(queueKey);
        if (activeDispatcher) {
          log(`feishu[${accountId}]: abort fast-path triggered for chat ${chatId} (text="${promptText}")`);
          activeDispatcher.abortController?.abort();
          activeDispatcher.abortCard().catch((err) => {
            error(`feishu[${accountId}]: abort fast-path abortCard failed: ${String(err)}`);
          });
        }
      }
      return;
    }

    const configCommand = Boolean(promptText && /^\/config$/iu.test(promptText.trim()));
    const standaloneBotMention = Boolean(
      ctx.lark.botOpenId
        && event.message?.message_type === 'text'
        && (event.message?.mentions?.some((mention) => mention.id?.open_id === ctx.lark.botOpenId) ?? false)
        && !extractRawTextFromEvent(event),
    );

    if (configCommand || standaloneBotMention) {
      const sessionKey = routedSessionKey;
      if (sessionKey) {
        const shown = await showAcpConfigCard({
          cfg: ctx.cfg,
          accountId,
          chatId,
          replyToMessageId: msgId,
          sessionKey,
        });
        if (shown) {
          log(`feishu[${accountId}]: ACP config card shown for chat ${chatId}`);
          return;
        }
      }
    }

    const dispatchNow = (): void => {
      void enqueueFeishuChatTask({
        accountId,
        chatId,
        threadId,
        task: async () => {
          try {
            await withTicket(
              {
                messageId: msgId,
                chatId,
                accountId,
                startTime: Date.now(),
                senderOpenId: event.sender?.sender_id?.open_id || '',
                chatType: (event.message?.chat_type as 'p2p' | 'group') || undefined,
                threadId,
              },
              () =>
                handleFeishuMessage({
                  cfg: ctx.cfg,
                  event,
                  botOpenId: ctx.lark.botOpenId,
                  runtime: ctx.runtime,
                  chatHistories: ctx.chatHistories,
                  accountId,
                }),
            );
          } catch (err) {
            error(`feishu[${accountId}]: error handling message: ${String(err)}`);
          }
        },
      });
    };

    const { status } = enqueueSessionPendingMessage({
      sessionKey: queueKey,
      dispatchNow,
      trySteer: promptText
        ? async () => {
            const active = getActiveDispatcher(queueKey);
            return await trySteerSessionViaProvider({
              sessionKey: active?.sessionKey,
              prompt: promptText,
              accountId,
              messageId: msgId,
              timeoutMs: steerTimeoutMs,
            });
          }
        : undefined,
      onSteerSuccess: promptText
        ? async () => {
            try {
              await addReactionFeishu({
                cfg: ctx.cfg,
                messageId: msgId,
                emojiType: 'JIAYI',
                accountId,
              });
            } catch (err) {
              error(`feishu[${accountId}]: failed to add steer reaction on ${msgId}: ${String(err)}`);
            }
          }
        : undefined,
      steerRetryDelayMs,
    });
    log(`feishu[${accountId}]: message ${msgId} in chat ${chatId}${threadId ? ` thread ${threadId}` : ''} — ${status}`);
  } catch (err) {
    error(`feishu[${accountId}]: error handling message: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Reaction handler
// ---------------------------------------------------------------------------

export async function handleReactionEvent(ctx: MonitorContext, data: unknown): Promise<void> {
  if (!isEventOwnershipValid(ctx, data)) return;
  const { accountId, log, error } = ctx;
  try {
    const event = data as FeishuReactionCreatedEvent;
    const msgId = event.message_id ?? 'unknown';

    log(`feishu[${accountId}]: reaction event on message ${msgId}`);

    // ---- Dedup: deterministic key based on message + emoji + operator ----
    const emojiType = event.reaction_type?.emoji_type ?? '';
    const operatorOpenId = event.user_id?.open_id ?? '';
    const dedupKey = `${msgId}:reaction:${emojiType}:${operatorOpenId}`;
    if (!ctx.messageDedup.tryRecord(dedupKey, accountId)) {
      log(`feishu[${accountId}]: duplicate reaction ${dedupKey}, skipping`);
      return;
    }

    // ---- Expiry: discard stale reaction events ----
    if (isMessageExpired(event.action_time)) {
      log(`feishu[${accountId}]: reaction on ${msgId} expired, discarding`);
      return;
    }

    // ---- Pre-resolve real chatId before enqueuing ----
    // The API call (3s timeout) runs outside the queue so it doesn't
    // block the serial chain, and is read-only so ordering is irrelevant.
    const preResolved = await resolveReactionContext({
      cfg: ctx.cfg,
      event,
      botOpenId: ctx.lark.botOpenId,
      runtime: ctx.runtime,
      accountId,
    });
    if (!preResolved) return;

    // ---- Enqueue with the real chatId (matches normal message queue key) ----
    const { status } = enqueueFeishuChatTask({
      accountId,
      chatId: preResolved.chatId,
      threadId: preResolved.threadId,
      task: async () => {
        try {
          await withTicket(
            {
              messageId: msgId,
              chatId: preResolved.chatId,
              accountId,
              startTime: Date.now(),
              senderOpenId: operatorOpenId,
              chatType: preResolved.chatType,
              threadId: preResolved.threadId,
            },
            () =>
              handleFeishuReaction({
                cfg: ctx.cfg,
                event,
                botOpenId: ctx.lark.botOpenId,
                runtime: ctx.runtime,
                chatHistories: ctx.chatHistories,
                accountId,
                preResolved,
              }),
          );
        } catch (err) {
          error(`feishu[${accountId}]: error handling reaction: ${String(err)}`);
        }
      },
    });
    log(`feishu[${accountId}]: reaction on ${msgId} (chatId=${preResolved.chatId}) — ${status}`);
  } catch (err) {
    error(`feishu[${accountId}]: error handling reaction event: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Bot membership handler
// ---------------------------------------------------------------------------

export async function handleBotMembershipEvent(
  ctx: MonitorContext,
  data: unknown,
  action: 'added' | 'removed',
): Promise<void> {
  if (!isEventOwnershipValid(ctx, data)) return;
  const { accountId, log, error } = ctx;
  try {
    const event = data as FeishuBotAddedEvent;
    log(`feishu[${accountId}]: bot ${action} ${action === 'removed' ? 'from' : 'to'} chat ${event.chat_id}`);
  } catch (err) {
    error(`feishu[${accountId}]: error handling bot ${action} event: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Drive comment handler
// ---------------------------------------------------------------------------

export async function handleCommentEvent(ctx: MonitorContext, data: unknown): Promise<void> {
  if (!isEventOwnershipValid(ctx, data)) return;
  const { accountId, log, error } = ctx;
  try {
    const parsed = parseFeishuDriveCommentNoticeEventPayload(data);
    if (!parsed) {
      log(`feishu[${accountId}]: invalid comment event payload, skipping`);
      return;
    }

    const commentId = parsed.comment_id ?? '';
    const replyId = parsed.reply_id ?? '';
    // Parser has normalized notice_meta fields into canonical top-level fields
    const _senderOpenId = parsed.user_id?.open_id ?? '';
    const isMentioned = parsed.is_mention ?? false;
    const eventTimestamp = parsed.action_time;

    log(
      `feishu[${accountId}]: drive comment event: ` +
        `type=${parsed.file_type}, comment=${commentId}` +
        `${replyId ? `, reply=${replyId}` : ''}` +
        `${isMentioned ? ', @bot' : ''}`,
    );

    // Dedup: build a deterministic key from the comment/reply IDs
    const dedupKey = replyId ? `comment:${commentId}:reply:${replyId}` : `comment:${commentId}`;
    if (!ctx.messageDedup.tryRecord(dedupKey, accountId)) {
      log(`feishu[${accountId}]: duplicate comment event ${dedupKey}, skipping`);
      return;
    }

    // Expiry check
    if (isMessageExpired(eventTimestamp)) {
      log(`feishu[${accountId}]: comment event expired, discarding`);
      return;
    }

    // Dispatch the comment event (no queue serialization needed for comment threads)
    await handleFeishuCommentEvent({
      cfg: ctx.cfg,
      event: parsed,
      botOpenId: ctx.lark.botOpenId,
      runtime: ctx.runtime,
      chatHistories: ctx.chatHistories,
      accountId,
    });
  } catch (err) {
    error(`feishu[${accountId}]: error handling comment event: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Card action handler
// ---------------------------------------------------------------------------

export async function handleCardActionEvent(ctx: MonitorContext, data: unknown): Promise<unknown> {
  try {
    const acpConfigResult = await handleAcpConfigCardAction(data);
    if (acpConfigResult !== undefined) return acpConfigResult;

    // AskUserQuestion：表单卡片交互（宿主内建能力优先）
    const askResult = handleAskUserAction(data, ctx.cfg, ctx.accountId);
    if (askResult !== undefined) return askResult;

    // 全局危险操作确认卡片。
    const dangerousResult = await handleDangerousConfirmationCardAction(data, ctx.cfg, ctx.accountId);
    if (dangerousResult !== undefined) return dangerousResult;

    // auto-auth：授权/权限引导相关卡片交互（宿主内建能力优先）
    const authResult = await handleCardAction(data, ctx.cfg, ctx.accountId);
    if (authResult !== undefined) return authResult;

    // 业务自定义卡片交互：使用 SDK 标准 interactive dispatch 管道转发给业务插件。
    return await dispatchFeishuPluginInteractiveHandler({ cfg: ctx.cfg, accountId: ctx.accountId, data });
  } catch (err) {
    elog.warn(`card.action.trigger handler error: ${err}`);
  }
}
