/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import type { DispatchContext } from '../messaging/inbound/dispatch-context';
import { sendMessageFeishu } from '../messaging/outbound/send';
import { showAcpConfigCard } from './config-card';
import {
  compactSessionViaProvider,
  getSessionConfigViaProvider,
  inspectSessionViaProvider,
  resetSessionViaProvider,
} from './acp-session-provider';

export type AcpSystemCommandVerb = 'config' | 'status' | 'reset' | 'compact';

export function parseAcpSystemCommand(text: string | undefined): AcpSystemCommandVerb | undefined {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^\/config(?:\s+.*)?$/iu.test(normalized)) return 'config';
  if (/^\/status(?:\s+.*)?$/iu.test(normalized)) return 'status';
  if (/^\/(?:new|reset)(?:\s+.*)?$/iu.test(normalized)) return 'reset';
  if (/^\/compact(?:\s+.*)?$/iu.test(normalized)) return 'compact';
  return undefined;
}

function formatAcpStatusText(params: {
  exists: boolean;
  hasActiveTurn: boolean;
  queued: boolean;
  currentModel?: string;
  availableModels?: string[];
  threadId?: string;
  turnId?: string;
  lastStatus?: string;
}): string {
  const lines = ['ACP 状态'];
  lines.push(`会话: ${params.exists ? '已建立' : '未建立'}`);
  lines.push(`模型: ${String(params.currentModel || 'default').trim() || 'default'}`);
  lines.push(`活跃 Turn: ${params.hasActiveTurn ? '是' : '否'}`);
  lines.push(`排队: ${params.queued ? '是' : '否'}`);
  if (params.lastStatus) lines.push(`状态: ${params.lastStatus}`);
  if (params.threadId) lines.push(`Thread: ${params.threadId}`);
  if (params.turnId) lines.push(`Turn: ${params.turnId}`);
  if (params.availableModels?.length) {
    lines.push(`可用模型: ${params.availableModels.join(', ')}`);
  }
  return lines.join('\n');
}

export async function dispatchAcpSystemCommand(params: {
  dc: DispatchContext;
  verb?: AcpSystemCommandVerb;
  replyToMessageId?: string;
}): Promise<boolean> {
  const { dc, verb, replyToMessageId } = params;
  if (!verb) return false;
  const sessionKey = String(dc.threadSessionKey || dc.route.sessionKey || '').trim();
  if (!sessionKey) return false;
  const inspection = inspectSessionViaProvider(sessionKey);
  if (!inspection) return false;

  if (verb === 'config') {
    return await showAcpConfigCard({
      cfg: dc.accountScopedCfg,
      accountId: dc.account.accountId,
      chatId: dc.ctx.chatId,
      replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
      sessionKey,
    });
  }

  let text = '';
  if (verb === 'status') {
    const config = await getSessionConfigViaProvider(sessionKey);
    text = formatAcpStatusText({
      exists: inspection.exists,
      hasActiveTurn: inspection.hasActiveTurn,
      queued: inspection.queued,
      currentModel: config?.currentModel,
      availableModels: config?.availableModels,
      threadId: inspection.threadId,
      turnId: inspection.turnId,
      lastStatus: inspection.lastStatus,
    });
  } else if (verb === 'reset') {
    const accepted = await resetSessionViaProvider(sessionKey);
    text = accepted ? '已关闭当前 ACP 会话，下一条消息会新建会话。' : '关闭当前 ACP 会话失败。';
  } else if (verb === 'compact') {
    const accepted = await compactSessionViaProvider(sessionKey);
    text = accepted ? '已触发当前 ACP 会话压缩。' : '触发当前 ACP 会话压缩失败。';
  }

  if (!text.trim()) return false;
  await sendMessageFeishu({
    cfg: dc.accountScopedCfg,
    to: dc.ctx.chatId,
    text,
    replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
    accountId: dc.account.accountId,
    replyInThread: dc.isThread,
  });
  return true;
}
