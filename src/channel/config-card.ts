/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { randomUUID } from 'node:crypto';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import { larkLogger } from '../core/lark-logger';
import { sendCardFeishu, updateCardFeishu } from '../messaging/outbound/send';
import {
  type AcpCollaborationMode,
  type AcpPermissionMode,
  type AcpReasoningEffort,
  type AcpRuntimeMode,
  bindAcpSessionViaSessionStore,
  clearSessionViaProvider,
  compactSessionViaProvider,
  detectAcpBindingViaSessionStore,
  getSessionConfigViaProvider,
  inspectSessionViaProvider,
  resetSessionViaProvider,
  resolvePermissionMode,
  setSessionCollaborationModeViaProvider,
  setSessionModelViaProvider,
  setSessionPermissionModeViaProvider,
  setSessionReasoningEffortViaProvider,
  setSessionRuntimeModeViaProvider,
  unbindAcpSessionViaSessionStore,
} from './acp-session-provider';

const log = larkLogger('channel/config-card');
const CARD_TTL_MS = 30 * 60 * 1000;

interface PendingConfigCard {
  operationId: string;
  cfg: ClawdbotConfig;
  accountId: string;
  chatId: string;
  replyToMessageId?: string;
  sessionKey: string;
  messageId?: string;
  currentModel: string;
  availableModels: string[];
  runtimeMode: AcpRuntimeMode;
  collaborationMode: AcpCollaborationMode;
  reasoningEffort: AcpReasoningEffort;
  permissionMode: AcpPermissionMode;
  createdAt: number;
}

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
    flex_mode: 'bisect',
    horizontal_align: 'left',
    columns: buttons.map((button) => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [buildButton(button.text, operationId, button.choice, button.type)],
    })),
  };
}

function buildLabeledSelect(label: string, select: Record<string, unknown>) {
  return {
    tag: 'column_set',
    flex_mode: 'stretch',
    horizontal_align: 'left',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [{ tag: 'markdown', content: `**${label}**` }],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 3,
        elements: [select],
      },
    ],
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

function formatPermissionModeLabel(mode: AcpPermissionMode): string {
  if (mode === 'default') return '默认权限';
  if (mode === 'full-access') return '完全访问';
  return '自定义';
}

function buildPermissionModeSelect(operationId: string, mode: AcpPermissionMode) {
  const options: AcpPermissionMode[] = ['default', 'full-access'];
  const normalizedMode = mode === 'custom' ? 'default' : mode;
  return {
    tag: 'select_static',
    placeholder: { tag: 'plain_text', content: formatPermissionModeLabel(mode) },
    initial_option: `permission:${normalizedMode}`,
    options: options.map((option) => ({
      text: { tag: 'plain_text', content: formatPermissionModeLabel(option) },
      value: `permission:${option}`,
    })),
    value: {
      action: 'acp_config_card',
      operation_id: operationId,
    },
  };
}

function formatRuntimeModeLabel(mode: AcpRuntimeMode): string {
  if (mode === 'native') return '原生';
  if (mode === 'pure') return '纯净';
  return '助手';
}

function buildRuntimeModeSelect(operationId: string, mode: AcpRuntimeMode) {
  const options: AcpRuntimeMode[] = ['persona', 'pure', 'native'];
  return {
    tag: 'select_static',
    placeholder: { tag: 'plain_text', content: formatRuntimeModeLabel(mode) },
    initial_option: `runtime:${mode}`,
    options: options.map((option) => ({
      text: { tag: 'plain_text', content: formatRuntimeModeLabel(option) },
      value: `runtime:${option}`,
    })),
    value: {
      action: 'acp_config_card',
      operation_id: operationId,
    },
  };
}

function formatCollaborationModeLabel(mode: AcpCollaborationMode): string {
  if (mode === 'plan') return '计划';
  return '执行';
}

function buildCollaborationModeSelect(operationId: string, mode: AcpCollaborationMode) {
  const options: AcpCollaborationMode[] = ['default', 'plan'];
  return {
    tag: 'select_static',
    placeholder: { tag: 'plain_text', content: formatCollaborationModeLabel(mode) },
    initial_option: `collaboration:${mode}`,
    options: options.map((option) => ({
      text: { tag: 'plain_text', content: formatCollaborationModeLabel(option) },
      value: `collaboration:${option}`,
    })),
    value: {
      action: 'acp_config_card',
      operation_id: operationId,
    },
  };
}

function formatReasoningEffortLabel(effort: AcpReasoningEffort): string {
  if (effort === 'none') return '无';
  if (effort === 'low') return '低';
  if (effort === 'high') return '高';
  if (effort === 'xhigh') return '极高';
  return '中';
}

function buildReasoningEffortSelect(operationId: string, effort: AcpReasoningEffort) {
  const options: AcpReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];
  return {
    tag: 'select_static',
    placeholder: { tag: 'plain_text', content: formatReasoningEffortLabel(effort) },
    initial_option: `reasoning:${effort}`,
    options: options.map((option) => ({
      text: { tag: 'plain_text', content: formatReasoningEffortLabel(option) },
      value: `reasoning:${option}`,
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
  runtimeMode: AcpRuntimeMode;
  collaborationMode: AcpCollaborationMode;
  reasoningEffort: AcpReasoningEffort;
  permissionMode: AcpPermissionMode;
  notice?: string;
}): Record<string, unknown> {
  const notice = String(params.notice || '').trim();
  return {
    schema: '2.0',
    config: { wide_screen_mode: false, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: 'ACP 配置' },
      template: notice ? 'red' : 'green',
    },
    body: {
      elements: [
        ...(notice ? [{ tag: 'markdown', content: notice }] : []),
        buildLabeledSelect('模型', buildModelSelect(params.operationId, params.currentModel, params.availableModels)),
        buildLabeledSelect('推理强度', buildReasoningEffortSelect(params.operationId, params.reasoningEffort)),
        buildLabeledSelect('运行环境', buildRuntimeModeSelect(params.operationId, params.runtimeMode)),
        buildLabeledSelect('协作模式', buildCollaborationModeSelect(params.operationId, params.collaborationMode)),
        buildLabeledSelect('权限模式', buildPermissionModeSelect(params.operationId, params.permissionMode)),
        buildActionColumns(params.operationId, [
          { text: '清理', choice: 'clear' },
          { text: '压缩', choice: 'compact' },
          { text: '重置', choice: 'new' },
          { text: '关闭', choice: 'close' },
        ]),
      ],
    },
  };
}

function formatResultStatus(template: string): string {
  if (template === 'red') return '失败';
  if (template === 'orange') return '处理中';
  return '成功';
}

function buildResultCard(title: string, text: string, template = 'green'): Record<string, unknown> {
  const status = formatResultStatus(template);
  return {
    schema: '2.0',
    config: { wide_screen_mode: false, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: title },
      template,
    },
    body: {
      elements: [{ tag: 'markdown', content: `**状态：${status}**\n\n${text}` }],
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

function buildActionResult(card: Record<string, unknown>, toast?: { type: string; content: string }) {
  return {
    ...(toast ? { toast } : {}),
    card: { type: 'raw', data: card },
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
  const binding = await detectAcpBindingViaSessionStore({
    cfg: params.cfg,
    sessionKey: params.sessionKey,
  });
  if (!config && binding?.mode !== 'native') return false;
  const operationId = randomUUID();
  const currentModel = config?.currentModel || 'default';
  const availableModels = config?.availableModels || [];
  const runtimeMode: AcpRuntimeMode = binding?.mode === 'native'
    ? 'native'
    : config?.currentRuntimeMode === 'pure'
      ? 'pure'
      : 'persona';
  const collaborationMode: AcpCollaborationMode = config?.currentCollaborationMode === 'plan' ? 'plan' : 'default';
  const reasoningEffort: AcpReasoningEffort =
    config?.currentReasoningEffort === 'none' ||
    config?.currentReasoningEffort === 'low' ||
    config?.currentReasoningEffort === 'high' ||
    config?.currentReasoningEffort === 'xhigh'
      ? config.currentReasoningEffort
      : 'medium';
  const permissionMode = resolvePermissionMode(config);
  const pending: PendingConfigCard = {
    operationId,
    cfg: params.cfg,
    accountId: params.accountId,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
    sessionKey: params.sessionKey,
    currentModel,
    availableModels,
    runtimeMode,
    collaborationMode,
    reasoningEffort,
    permissionMode,
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
      runtimeMode,
      collaborationMode,
      reasoningEffort,
      permissionMode,
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

export async function handleAcpConfigCardAction(
  data: unknown,
): Promise<unknown> {
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
    const inspection = inspectSessionViaProvider(card.sessionKey);
    if (!inspection?.threadId) {
      const failedCard = buildResultCard(
        'ACP 配置',
        '当前没有可压缩的运行会话。通常是刚切换模型或重置会话后，旧线程已关闭；发送下一条消息新建会话后再压缩。',
        'red',
      );
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const progressCard = buildResultCard('ACP 配置', '正在压缩当前会话…', 'orange');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: progressCard,
    });
    const ok = await (async () => {
      try {
        return await compactSessionViaProvider(card.sessionKey);
      } catch (error) {
        log.warn(`compact action failed sessionKey=${card.sessionKey} error=${String(error)}`);
        return false;
      }
    })();
    if (!ok) {
      const failedCard = buildResultCard('ACP 配置', '压缩触发失败，当前配置未变。', 'red');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const successCard = buildResultCard('ACP 配置', '压缩已触发。', 'green');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: successCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(successCard);
  }

  if (choice === 'clear') {
    const ok = await clearSessionViaProvider(card.sessionKey);
    const resultCard = buildResultCard(
      'ACP 配置',
      ok ? '已清理当前运行上下文，下一条消息会开启空上下文。' : '清理运行上下文失败。',
      ok ? 'green' : 'red',
    );
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  if (choice === 'new') {
    const progressCard = buildResultCard('ACP 配置', '正在准备新会话…', 'orange');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: progressCard,
    });
    const ok = await resetSessionViaProvider(card.sessionKey);
    const resultCard = buildResultCard('ACP 配置', ok ? '下一条消息会新建运行线程。' : '新建会话准备失败。', ok ? 'green' : 'red');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  if (choice.startsWith('model:')) {
    const model = choice.slice('model:'.length).trim() || 'default';
    const ok = await setSessionModelViaProvider({
      sessionKey: card.sessionKey,
      model,
    });
    if (!ok) {
      const failedCard = buildResultCard('ACP 配置', '切换模型失败。', 'red');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const config = await getSessionConfigViaProvider(card.sessionKey);
    const resolvedModel = String(config?.currentModel || model || 'default').trim();
    log.info(
      `acp config model switched sessionKey=${card.sessionKey} requested=${model} resolved=${resolvedModel || '-'}`,
    );
    const resultCard = buildResultCard('ACP 配置', `模型已切换为 ${formatModelLabel(resolvedModel)}。`, 'green');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  if (choice.startsWith('runtime:')) {
    const mode = choice.slice('runtime:'.length).trim() as AcpRuntimeMode;
    const normalizedMode: AcpRuntimeMode = mode === 'native' ? 'native' : mode === 'pure' ? 'pure' : 'persona';
    if (normalizedMode === 'native') {
      const ok = await unbindAcpSessionViaSessionStore({
        cfg: card.cfg,
        sessionKey: card.sessionKey,
      });
      if (!ok) {
        const failedCard = buildResultCard('ACP 配置', '切换到原生失败，当前会话没有可解绑的 ACP binding。', 'red');
        await updateCardFeishu({
          cfg: card.cfg,
          accountId: card.accountId,
          messageId,
          card: failedCard,
        });
        pendingConfigCards.delete(operationId);
        return buildActionResult(failedCard);
      }
      log.info(`acp binding unbound from config card sessionKey=${card.sessionKey}`);
      const resultCard = buildResultCard('ACP 配置', '模式已切换为 原生，下一条消息将走 OpenClaw。', 'green');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: resultCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(resultCard);
    }
    if (card.runtimeMode === 'native') {
      const rebound = await bindAcpSessionViaSessionStore({
        cfg: card.cfg,
        sessionKey: card.sessionKey,
      });
      if (!rebound) {
        const failedCard = buildResultCard('ACP 配置', '恢复 ACP binding 失败。', 'red');
        await updateCardFeishu({
          cfg: card.cfg,
          accountId: card.accountId,
          messageId,
          card: failedCard,
        });
        pendingConfigCards.delete(operationId);
        return buildActionResult(failedCard);
      }
    }
    const ok = await setSessionRuntimeModeViaProvider({
      sessionKey: card.sessionKey,
      mode: normalizedMode,
    });
    if (!ok) {
      const failedCard = buildResultCard('ACP 配置', '切换模式失败。', 'red');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const modeLabel = formatRuntimeModeLabel(normalizedMode);
    log.info(`acp config runtime mode switched sessionKey=${card.sessionKey} mode=${normalizedMode}`);
    const resultCard = buildResultCard('ACP 配置', `模式已切换为 ${modeLabel}，下一条消息生效。`, 'green');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  if (choice.startsWith('collaboration:')) {
    const mode = choice.slice('collaboration:'.length).trim() === 'plan' ? 'plan' : 'default';
    const ok = await setSessionCollaborationModeViaProvider({
      sessionKey: card.sessionKey,
      mode,
    });
    if (!ok) {
      const failedCard = buildResultCard('ACP 配置', '切换协作模式失败。', 'red');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const modeLabel = formatCollaborationModeLabel(mode);
    log.info(`acp config collaboration mode switched sessionKey=${card.sessionKey} mode=${mode}`);
    const resultCard = buildResultCard('ACP 配置', `协作模式已切换为 ${modeLabel}，后续 turn 生效。`, 'green');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  if (choice.startsWith('reasoning:')) {
    const effort = choice.slice('reasoning:'.length).trim() as AcpReasoningEffort;
    const normalizedEffort: AcpReasoningEffort =
      effort === 'none' || effort === 'low' || effort === 'high' || effort === 'xhigh'
        ? effort
        : 'medium';
    const ok = await setSessionReasoningEffortViaProvider({
      sessionKey: card.sessionKey,
      effort: normalizedEffort,
    });
    if (!ok) {
      const failedCard = buildResultCard('ACP 配置', '切换推理强度失败。', 'red');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const resultCard = buildResultCard('ACP 配置', `推理强度已切换为 ${formatReasoningEffortLabel(normalizedEffort)}，后续 turn 生效。`, 'green');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  if (choice.startsWith('permission:')) {
    const mode = choice.slice('permission:'.length).trim() as AcpPermissionMode;
    const ok = await setSessionPermissionModeViaProvider({
      sessionKey: card.sessionKey,
      mode,
    });
    if (!ok) {
      const failedCard = buildResultCard('ACP 配置', '切换权限模式失败。', 'red');
      await updateCardFeishu({
        cfg: card.cfg,
        accountId: card.accountId,
        messageId,
        card: failedCard,
      });
      pendingConfigCards.delete(operationId);
      return buildActionResult(failedCard);
    }
    const modeLabel = formatPermissionModeLabel(mode);
    log.info(`acp config permission mode switched sessionKey=${card.sessionKey} mode=${mode}`);
    const resultCard = buildResultCard('ACP 配置', `权限模式已切换为 ${modeLabel}，后续 turn 生效。`, 'green');
    await updateCardFeishu({
      cfg: card.cfg,
      accountId: card.accountId,
      messageId,
      card: resultCard,
    });
    pendingConfigCards.delete(operationId);
    return buildActionResult(resultCard);
  }

  log.warn(`unknown acp config card choice=${choice}`);
  return undefined;
}
