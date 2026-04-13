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
  newSessionViaProvider,
  clearSessionViaProvider,
  resolvePermissionMode,
  setSessionCollaborationModeViaProvider,
} from './acp-session-provider';

export type AcpSystemCommandVerb = 'config' | 'status' | 'new' | 'clear' | 'compact' | 'plan' | 'default';

export function parseAcpSystemCommand(text: string | undefined): AcpSystemCommandVerb | undefined {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^\/config(?:\s+.*)?$/iu.test(normalized)) return 'config';
  if (/^\/status(?:\s+.*)?$/iu.test(normalized)) return 'status';
  if (/^\/new(?:\s+.*)?$/iu.test(normalized)) return 'new';
  if (/^\/clear(?:\s+.*)?$/iu.test(normalized)) return 'clear';
  if (/^\/compact(?:\s+.*)?$/iu.test(normalized)) return 'compact';
  if (/^\/plan(?:\s+.*)?$/iu.test(normalized)) return 'plan';
  if (/^\/default(?:\s+.*)?$/iu.test(normalized)) return 'default';
  return undefined;
}

function formatAcpStatusText(params: {
  exists: boolean;
  hasActiveTurn: boolean;
  queued: boolean;
  currentModel?: string;
  currentRuntimeMode?: string;
  currentApprovalPolicy?: string;
  currentSandboxMode?: string;
  availableModels?: string[];
  threadId?: string;
  turnId?: string;
  lastStatus?: string;
}): string {
  const lines = ['ACP 状态'];
  lines.push(`会话: ${params.exists ? '已建立' : '未建立'}`);
  lines.push(`模型: ${String(params.currentModel || 'default').trim() || 'default'}`);
  lines.push(`模式: ${params.currentRuntimeMode === 'pure' ? '纯净' : '助手'}`);
  const permissionMode = resolvePermissionMode({
    currentApprovalPolicy: params.currentApprovalPolicy,
    currentSandboxMode: params.currentSandboxMode,
  });
  lines.push(`权限模式: ${permissionMode === 'default' ? '默认权限' : permissionMode === 'full-access' ? '完全访问' : '自定义'}`);
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
      currentRuntimeMode: config?.currentRuntimeMode,
      currentApprovalPolicy: config?.currentApprovalPolicy,
      currentSandboxMode: config?.currentSandboxMode,
      availableModels: config?.availableModels,
      threadId: inspection.threadId,
      turnId: inspection.turnId,
      lastStatus: inspection.lastStatus,
    });
  } else if (verb === 'new') {
    const accepted = await newSessionViaProvider(sessionKey);
    text = accepted ? '下一条消息会新建运行线程。' : '新建会话准备失败。';
  } else if (verb === 'clear') {
    const accepted = await clearSessionViaProvider(sessionKey);
    text = accepted ? '已清理当前运行上下文，下一条消息会开启空上下文。' : '清理运行上下文失败。';
  } else if (verb === 'compact') {
    const accepted = await compactSessionViaProvider(sessionKey);
    text = accepted ? '已触发当前 ACP 会话压缩。' : '触发当前 ACP 会话压缩失败。';
  } else if (verb === 'plan' || verb === 'default') {
    const accepted = await setSessionCollaborationModeViaProvider({
      sessionKey,
      mode: verb === 'plan' ? 'plan' : 'default',
    });
    text = accepted
      ? `协作模式已切换为${verb === 'plan' ? '计划' : '默认'}，后续 turn 生效。`
      : '切换协作模式失败。';
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
