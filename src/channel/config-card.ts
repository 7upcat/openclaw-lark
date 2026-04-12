/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { randomUUID } from 'node:crypto';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import { larkLogger } from '../core/lark-logger';
import { sendCardFeishu, updateCardFeishu } from '../messaging/outbound/send';
import {
  compactSessionViaProvider,
  getSessionConfigViaProvider,
  resetSessionViaProvider,
  setSessionModelViaProvider,
} from './acp-session-provider';

const log = larkLogger('channel/config-card');
const CARD_TTL_MS = 30 * 60 * 1000;

type PendingConfigCard = {
  operationId: string;
  cfg: ClawdbotConfig;
  accountId: string;
  chatId: string;
  replyToMessageId?: string;
  sessionKey: string;
  messageId?: string;
  currentModel: string;
  availableModels: string[];
  createdAt: number;
};

const pendingConfigCards = new Map<string, PendingConfigCard>();

function formatModelLabel(model: string): string {
  const normalized = String(model || '').trim();
  return normalized || 'default';
}

function buildButton(text: string, operationId: string, choice: string, type = 'default') {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    value: {
      action: 'acp_config_card',
      operation_id: operationId,
      choice,
    },
  };
}

function buildActionColumns(operationId: string, buttons: Array<{ text: string; choice: string; type?: string }>) {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    horizontal_align: 'left',
    columns: buttons.map((button) => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [buildButton(button.text, operationId, button.choice, button.type)],
    })),
  };
}

function uniqueModelOptions(models: string[]): string[] {
  const result: string[] = [];
  for (const model of ['default', ...models]) {
    const normalized = String(model || '').trim();
    if (!normalized) continue;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function buildModelSelect(operationId: string, currentModel: string, models: string[]) {
  const normalizedCurrentModel = String(currentModel || '').trim() || 'default';
  const options = uniqueModelOptions(models);
  return {
    tag: 'select_static',
    placeholder: { tag: 'plain_text', content: formatModelLabel(normalizedCurrentModel) },
    initial_option: `model:${normalizedCurrentModel}`,
    options: options.map((option) => ({
      text: { tag: 'plain_text', content: formatModelLabel(option) },
      value: `model:${option}`,
    })),
    value: {
      action: 'acp_config_card',
      operation_id: operationId,
    },
  };
}

function buildCard(params: {
  operationId: string;
  currentModel: string;
  availableModels: string[];
  hasActiveTurn: boolean;
  queued: boolean;
  notice?: string;
}): Record<string, unknown> {
  const notice = String(params.notice || '').trim();
  return {
    schema: '2.0',
    config: { wide_screen_mode: false, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: 'ACP 配置' },
      template: notice ? 'red' : params.hasActiveTurn ? 'orange' : params.queued ? 'blue' : 'green',
    },
    body: {
      elements: [
        ...(notice ? [{ tag: 'markdown', content: notice }] : []),
        {
          tag: 'column_set',
          flex_mode: 'stretch',
          horizontal_align: 'left',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [buildModelSelect(params.operationId, params.currentModel, params.availableModels)],
            },
          ],
        },
        buildActionColumns(params.operationId, [
          { text: '压缩', choice: 'compact' },
          { text: '重置', choice: 'reset', type: 'danger' },
          { text: '关闭', choice: 'close' },
        ]),
      ],
    },
  };
}

function buildResultCard(title: string, text: string, template = 'green'): Record<string, unknown> {
  return {
    schema: '2.0',
    config: { wide_screen_mode: false, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: title },
      template,
    },
    body: {
      elements: [{ tag: 'markdown', content: text }],
    },
  };
}

function buildClosedCard(): Record<string, unknown> {
  return {
    schema: '2.0',
    config: { wide_screen_mode: false, update_multi: true, enable_forward: false },
    body: {
      elements: [{ tag: 'markdown', content: '\u200B' }],
    },
  };
}

export async function showAcpConfigCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  chatId: string;
  replyToMessageId?: string;
  sessionKey: string;
}): Promise<boolean> {
  const config = await getSessionConfigViaProvider(params.sessionKey);
  if (!config) return false;
  const operationId = randomUUID();
  const currentModel = config.currentModel || 'default';
  const availableModels = config.availableModels;
  const pending: PendingConfigCard = {
    operationId,
    cfg: params.cfg,
    accountId: params.accountId,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
    sessionKey: params.sessionKey,
    currentModel,
    availableModels,
    createdAt: Date.now(),
  };
  pendingConfigCards.set(operationId, pending);
  const sent = await sendCardFeishu({
    cfg: params.cfg,
    to: params.chatId,
    replyToMessageId: params.replyToMessageId,
    accountId: params.accountId,
    card: buildCard({
      operationId,
      currentModel,
      availableModels,
      hasActiveTurn: config.hasActiveTurn,
      queued: config.queued,
    }),
  });
  pending.messageId = sent.messageId;
  setTimeout(() => {
    const current = pendingConfigCards.get(operationId);
    if (current?.operationId === operationId) {
      pendingConfigCards.delete(operationId);
    }
  }, CARD_TTL_MS);
  return true;
}

export async function handleAcpConfigCardAction(data: unknown): Promise<unknown> {
  const event = data as {
    open_message_id?: string;
    action?: {
      option?: string;
      value?: {
        action?: string;
        operation_id?: string;
        choice?: string;
      };
    };
    context?: { open_message_id?: string };
  };
  let rawValue: { action?: string; operation_id?: string; choice?: string } | undefined;
  try {
    rawValue = event.action?.value
      ?? (() => {
        try {
          return event.action?.option ? JSON.parse(String(event.action.option)) : undefined;
        } catch {
          return undefined;
        }
      })();
  } catch {
    rawValue = undefined;
  }
  const actionName = String(rawValue?.action || '').trim();
  if (actionName !== 'acp_config_card') return undefined;
  const operationId = String(rawValue?.operation_id || '').trim();
  const fallbackChoice = String(rawValue?.choice || '').trim();
  const choice = String(fallbackChoice || event.action?.option || '').trim();
  const card = pendingConfigCards.get(operationId);
  if (!card) {
    return {
      toast: {
        type: 'error',
        content: '配置卡片已过期，请重新发送 /config。',
      },
    };
  }
  const messageId = String(event.open_message_id || event.context?.open_message_id || card.messageId || '').trim();
  if (!messageId) return null;
  log.info(`acp config card action operationId=${operationId} choice=${choice} messageId=${messageId}`);

  if (choice === 'close') {
    pendingConfigCards.delete(operationId);
    const closedCard = buildClosedCard();
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: closedCard,
    });
    log.info(`acp config card closed operationId=${operationId} messageId=${messageId}`);
    return {
      toast: { type: 'success', content: '已关闭' },
      card: { type: 'raw', data: closedCard },
    };
  }

  if (choice === 'compact') {
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: buildResultCard('ACP 配置', '正在压缩当前会话…', 'orange'),
    });
    let ok = false;
    try {
      ok = await compactSessionViaProvider(card.sessionKey);
    } catch (error) {
      log.warn(`compact action failed sessionKey=${card.sessionKey} error=${String(error)}`);
      ok = false;
    }
    if (!ok) {
      const config = await getSessionConfigViaProvider(card.sessionKey);
      if (config?.currentModel) card.currentModel = config.currentModel;
      if (config?.availableModels?.length) card.availableModels = config.availableModels;
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: buildCard({
          operationId,
          currentModel: card.currentModel,
          availableModels: card.availableModels,
          hasActiveTurn: Boolean(config?.hasActiveTurn),
          queued: Boolean(config?.queued),
          notice: '压缩触发失败，当前配置未变。',
        }),
      });
      return null;
    }
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: buildResultCard('ACP 配置', '已触发压缩。', 'green'),
    });
    pendingConfigCards.delete(operationId);
    return null;
  }

  if (choice === 'reset') {
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: buildResultCard('ACP 配置', '正在关闭当前会话…', 'orange'),
    });
    const ok = await resetSessionViaProvider(card.sessionKey);
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: buildResultCard('ACP 配置', ok ? '已关闭当前会话，下一条消息会新建会话。' : '关闭会话失败。', ok ? 'green' : 'red'),
    });
    pendingConfigCards.delete(operationId);
    return null;
  }

  if (choice.startsWith('model:')) {
    const model = choice.slice('model:'.length).trim() || 'default';
    const ok = await setSessionModelViaProvider({
      sessionKey: card.sessionKey,
      model,
    });
    if (!ok) {
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: buildResultCard('ACP 配置', '切换模型失败。', 'red'),
      });
      pendingConfigCards.delete(operationId);
      return null;
    }
    const config = await getSessionConfigViaProvider(card.sessionKey);
    const resolvedModel = String(config?.currentModel || model || 'default').trim();
    card.currentModel = resolvedModel;
    card.availableModels = config?.availableModels?.length ? config.availableModels : card.availableModels;
    log.info(
      `acp config model switched sessionKey=${card.sessionKey} requested=${model} resolved=${resolvedModel || '-'}`,
    );
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: buildCard({
        operationId,
        currentModel: card.currentModel,
        availableModels: card.availableModels,
        hasActiveTurn: Boolean(config?.hasActiveTurn),
        queued: Boolean(config?.queued),
      }),
    });
    return null;
  }

  log.warn(`unknown acp config card choice=${choice}`);
  return undefined;
}
