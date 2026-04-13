import { randomUUID } from 'node:crypto';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import { larkLogger } from '../../core/lark-logger';
import type { AcpApprovalRequestedCallbackEvent } from '../../channel/acp-tool-callback';
import type { AcpApprovalDecision } from '../../channel/acp-session-provider';
import { resolveAcpApprovalViaProvider, trySteerSessionViaProvider } from '../../channel/acp-session-provider';
import { sendCardFeishu, updateCardFeishu } from '../outbound/send';

const log = larkLogger('inbound/authorization-confirmation-cards');
const CARD_TTL_MS = 30 * 60 * 1000;
const CARD_ACTION = 'authorization_confirmation_card';
const LEGACY_CARD_ACTION = 'dangerous_confirmation_card';

interface AuthorizationCardActionEvent {
  operator?: {
    open_id?: string;
    operator_id?: {
      open_id?: string;
    };
  };
  action?: {
    value?: {
      action?: string;
      operation_id?: string;
      choice?: string;
    };
  };
}

interface AuthorizationConfirmationContext {
  chatType?: string;
  senderId?: string;
  chatId: string;
  messageId: string;
  sessionKey?: string;
  threadSessionKey?: string;
}

type AcpApprovalKind = 'command' | 'file_change' | 'permissions' | 'mcp_tool_call';

interface AuthorizationConfirmationCard {
  operationId: string;
  persona: string;
  accountId: string;
  channel: string;
  peerKind: string;
  peerId: string;
  chatId: string;
  replyToMessageId: string;
  createdAt: number;
  senderOpenId?: string;
  sessionKey?: string;
  messageId?: string;
  title?: string;
  body?: string;
  bodyElements?: Array<Record<string, unknown>>;
  approvePrompt?: string;
  denyPrompt?: string;
  acpApprovalId?: string;
  acpApprovalKind?: AcpApprovalKind;
  acpAvailableDecisions?: unknown[];
  acpProposedExecpolicyAmendment?: string[];
}

const pendingAuthorizationCards = new Map<string, AuthorizationConfirmationCard>();

function buildButton(text: string, type: string, operationId: string, choice: string) {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    value: {
      action: CARD_ACTION,
      operation_id: operationId,
      choice,
    },
  };
}

function buildAuthorizationConfirmationCard(card: AuthorizationConfirmationCard) {
  const hasAcpSessionDecision = card.acpAvailableDecisions?.includes('acceptForSession') ?? false;
  const hasAcpPrefixDecision = card.acpApprovalKind === 'command' && Boolean(card.acpProposedExecpolicyAmendment?.length);
  const sessionLabel = card.acpApprovalKind === 'file_change' ? '这些文件' : '会话';
  const buttons = [
    buildButton(card.acpApprovalId ? '一次' : '确认', 'primary', card.operationId, 'auth:approve'),
    ...(card.acpApprovalId && hasAcpSessionDecision
      ? [buildButton(sessionLabel, 'default', card.operationId, 'auth:approve_session')]
      : []),
    ...(card.acpApprovalId && hasAcpPrefixDecision
      ? [buildButton('前缀', 'default', card.operationId, 'auth:approve_prefix')]
      : []),
    buildButton('取消', 'danger', card.operationId, 'auth:deny'),
  ];
  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: card.title || '危险操作确认' },
      template: 'red',
    },
    body: {
      elements: [
        ...(card.bodyElements?.length
          ? card.bodyElements
          : [{ tag: 'markdown', content: card.body || '该操作存在较高风险，请确认是否继续。' }]),
        {
          tag: 'column_set',
          flex_mode: 'none',
          horizontal_align: 'left',
          columns: buttons.map((button) => ({
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [button],
          })),
        },
      ],
    },
  };
}

function buildResultCard(title: string, text: string, template = 'green') {
  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: title },
      template,
    },
    body: {
      elements: [{ tag: 'markdown', content: text }],
    },
  };
}

function buildProgressCard(title: string, text: string) {
  return buildResultCard(title, text, 'blue');
}

function stripShellWrapper(command: string): string {
  const trimmed = command.trim();
  const match = trimmed.match(/^(?:\/(?:usr\/)?bin\/)?(?:ba|z)?sh\s+-lc\s+([\s\S]+)$/);
  if (!match) return trimmed;
  const script = match[1]?.trim() ?? '';
  const quoted = script.match(/^(['"])([\s\S]*)\1$/);
  return (quoted?.[2] ?? script).trim();
}

function summarizeApprovalCommand(command: string): string {
  const stripped = stripShellWrapper(command);
  const normalized = stripped.replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function buildCodeBlock(value: string): string {
  return `\`\`\`bash\n${value.replace(/```/g, '`\\`\\`')}\n\`\`\``;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizePathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function formatAcpPermissionRule(permissions: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const network = asRecord(permissions.network);
  if (network?.enabled === true) parts.push('network');
  const fileSystem = asRecord(permissions.file_system) ?? asRecord(permissions.fileSystem);
  const readPaths = normalizePathList(fileSystem?.read);
  const writePaths = normalizePathList(fileSystem?.write);
  if (readPaths.length) parts.push(`read ${readPaths.map((path) => `\`${path}\``).join(', ')}`);
  if (writePaths.length) parts.push(`write ${writePaths.map((path) => `\`${path}\``).join(', ')}`);
  return parts.length ? parts.join('; ') : undefined;
}

function buildAcpApprovalCardBodyElements(event: AcpApprovalRequestedCallbackEvent): Array<Record<string, unknown>> {
  const lines = [
    String(event.reason || 'Codex 请求执行需要授权的操作。').trim(),
  ];
  if (event.kind === 'mcp_tool_call') {
    if (event.mcpMessage) lines[0] = event.mcpMessage;
    if (event.mcpServerName) lines.push(`服务：\`${event.mcpServerName}\``);
    if (event.mcpToolTitle) lines.push(`工具：\`${event.mcpToolTitle}\``);
    if (event.mcpToolDescription) lines.push(event.mcpToolDescription);
    if (event.mcpToolParams && Object.keys(event.mcpToolParams).length > 0) {
      lines.push(`参数：\n\`\`\`json\n${JSON.stringify(event.mcpToolParams, null, 2)}\n\`\`\``);
    }
  }
  if (event.permissions) {
    const permissionRule = formatAcpPermissionRule(event.permissions);
    if (permissionRule) lines.push(`权限规则：${permissionRule}`);
  }
  if (event.command) {
    lines.push(`命令摘要：\n${buildCodeBlock(summarizeApprovalCommand(event.command))}`);
  }
  if (event.grantRoot) lines.push(`授权范围：\`${event.grantRoot}\``);
  const elements: Array<Record<string, unknown>> = [
    { tag: 'markdown', content: lines.join('\n\n') },
  ];
  if (event.command) {
    elements.push({
      tag: 'collapsible_panel',
      expanded: false,
      header: {
        title: { tag: 'plain_text', content: '完整命令' },
        vertical_align: 'center',
        icon: {
          tag: 'standard_icon',
          token: 'down-small-ccm_outlined',
          color: 'grey',
          size: '16px 16px',
        },
        icon_position: 'right',
        icon_expanded_angle: -180,
      },
      border: { color: 'grey', corner_radius: '5px' },
      vertical_spacing: '4px',
      padding: '8px 8px 8px 8px',
      elements: [{ tag: 'markdown', content: buildCodeBlock(stripShellWrapper(event.command)) }],
    });
  }
  return elements;
}

function formatCardTitle(card: AuthorizationConfirmationCard, fallback = '危险操作确认'): string {
  return card.acpApprovalId ? '授权确认' : fallback;
}

function registerPendingCard(card: AuthorizationConfirmationCard): void {
  pendingAuthorizationCards.set(card.operationId, card);
  setTimeout(() => {
    if (!pendingAuthorizationCards.has(card.operationId)) return;
    pendingAuthorizationCards.delete(card.operationId);
  }, CARD_TTL_MS);
}

function readOperatorOpenId(event: AuthorizationCardActionEvent): string {
  return String(event?.operator?.open_id || event?.operator?.operator_id?.open_id || '').trim();
}

async function runPersonaControl(
  card: AuthorizationConfirmationCard,
  accountId: string,
  messageId: string,
  approvalDecision: AcpApprovalDecision = 'approve-once',
): Promise<string> {
  if (card.acpApprovalId) {
    const accepted = resolveAcpApprovalViaProvider({
      sessionKey: card.sessionKey,
      approvalId: card.acpApprovalId,
      decision: approvalDecision,
    });
    if (!accepted) return '批准失败：授权请求不存在或已过期。';
    if (approvalDecision === 'approve-prefix') return '已允许前缀，继续执行。';
    if (approvalDecision === 'approve-session') {
      return card.acpApprovalKind === 'file_change' ? '已允许这些文件，继续执行。' : '已允许会话，继续执行。';
    }
    return card.acpApprovalKind === 'mcp_tool_call' ? '已允许 MCP 工具一次，继续执行。' : '已允许一次，继续执行。';
  }

  const prompt = String(card.approvePrompt || '').trim();
  if (!prompt) return '已批准当前操作。';
  if (!card.sessionKey) return '已批准当前操作，但未找到可继续的会话。';

  const accepted = await trySteerSessionViaProvider({
    sessionKey: card.sessionKey,
    prompt,
    accountId,
    messageId,
    timeoutMs: 2000,
  });
  return accepted ? '已批准当前操作，正在继续执行。' : '已批准当前操作，但继续指令未被当前会话接收。';
}

export async function handleAuthorizationConfirmationCardAction(data: unknown, cfg: ClawdbotConfig, accountId: string): Promise<unknown> {
  let action;
  let operationId;
  let choice;
  let operatorOpenId: string;
  try {
    const event = data as AuthorizationCardActionEvent;
    operatorOpenId = readOperatorOpenId(event);
    action = event.action?.value?.action;
    operationId = event.action?.value?.operation_id;
    choice = event.action?.value?.choice;
  } catch {
    return;
  }
  if ((action !== CARD_ACTION && action !== LEGACY_CARD_ACTION) || !operationId || !choice) return;
  log.info(
    `authorization confirmation card action account=${accountId} operationId=${String(operationId)} choice=${String(choice)}`,
  );
  const card = pendingAuthorizationCards.get(operationId);
  if (!card || !card.messageId) {
    return { toast: { type: 'error', content: '卡片状态不存在或已过期' } };
  }
  if (operatorOpenId && card.senderOpenId && operatorOpenId !== card.senderOpenId) {
    return { toast: { type: 'warning', content: '仅发起人可操作' } };
  }
  const messageId = card.messageId;
  setImmediate(async () => {
    try {
      const approvalDecision: AcpApprovalDecision =
        choice === 'auth:approve_session' ? 'approve-session' :
          choice === 'auth:approve_prefix' ? 'approve-prefix' :
            'approve-once';
      const approved = choice === 'auth:approve' || choice === 'auth:approve_session' || choice === 'auth:approve_prefix';
      if (!approved) {
        if (card.acpApprovalId) {
          resolveAcpApprovalViaProvider({
            sessionKey: card.sessionKey,
            approvalId: card.acpApprovalId,
            decision: 'deny',
          });
        }
        await updateCardFeishu({
          cfg,
          accountId,
          messageId,
          card: buildResultCard(formatCardTitle(card), card.acpApprovalId ? '已取消当前授权请求。' : '已取消当前危险操作。', 'red'),
        });
        pendingAuthorizationCards.delete(operationId);
        return;
      }
      await updateCardFeishu({
        cfg,
        accountId,
        messageId,
        card: buildProgressCard(formatCardTitle(card), '已收到确认，正在继续执行…'),
      });
      const result = await runPersonaControl(card, accountId, messageId, approvalDecision);
      await updateCardFeishu({
        cfg,
        accountId,
        messageId,
        card: buildResultCard(formatCardTitle(card), result || '已批准当前操作。', 'green'),
      });
      pendingAuthorizationCards.delete(operationId);
    } catch (err) {
      log.warn(`authorization confirmation card action failed: ${String(err)}`);
      try {
        await updateCardFeishu({
          cfg,
          accountId,
          messageId,
          card: buildResultCard(card.acpApprovalId ? '授权确认失败' : '危险操作确认失败', String(err), 'red'),
        });
      } catch (updateErr) {
        log.error(`authorization confirmation failure card update failed: ${String(updateErr)}`);
      }
      pendingAuthorizationCards.delete(operationId);
    }
  });
  return { toast: { type: 'success', content: '正在处理卡片操作…' } };
}

export async function updateAuthorizationConfirmationCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  persona: string;
  ctx: AuthorizationConfirmationContext;
  messageId: string;
  title?: string;
  body?: string;
  bodyElements?: Array<Record<string, unknown>>;
  approvePrompt: string;
  denyPrompt: string;
  acpApprovalId?: string;
  acpApprovalKind?: AcpApprovalKind;
  acpAvailableDecisions?: unknown[];
  acpProposedExecpolicyAmendment?: string[];
}): Promise<void> {
  const {
    cfg,
    accountId,
    persona,
    ctx,
    messageId,
    title,
    body,
    bodyElements,
    approvePrompt,
    denyPrompt,
    acpApprovalId,
    acpApprovalKind,
    acpAvailableDecisions,
    acpProposedExecpolicyAmendment,
  } = params;
  const operationId = randomUUID();
  const card: AuthorizationConfirmationCard = {
    operationId,
    persona,
    accountId,
    channel: 'feishu',
    peerKind: ctx.chatType === 'p2p' ? 'direct' : 'group',
    peerId: ctx.chatType === 'p2p' ? String(ctx.senderId || ctx.chatId || '') : String(ctx.chatId || ctx.senderId || ''),
    chatId: ctx.chatId,
    replyToMessageId: ctx.messageId,
    messageId,
    createdAt: Date.now(),
    senderOpenId: String(ctx.senderId || '').trim() || undefined,
    sessionKey: String(ctx.sessionKey || ctx.threadSessionKey || '').trim() || undefined,
    title,
    body,
    bodyElements,
    approvePrompt,
    denyPrompt,
    acpApprovalId,
    acpApprovalKind,
    acpAvailableDecisions,
    acpProposedExecpolicyAmendment,
  };
  registerPendingCard(card);
  await updateCardFeishu({
    cfg,
    accountId,
    messageId,
    card: buildAuthorizationConfirmationCard(card),
  });
  log.info(`authorization confirmation card updated operationId=${operationId} messageId=${messageId}`);
}

export async function sendAuthorizationConfirmationCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  persona: string;
  ctx: AuthorizationConfirmationContext;
  title?: string;
  body?: string;
  bodyElements?: Array<Record<string, unknown>>;
  approvePrompt: string;
  denyPrompt: string;
  acpApprovalId?: string;
  acpApprovalKind?: AcpApprovalKind;
  acpAvailableDecisions?: unknown[];
  acpProposedExecpolicyAmendment?: string[];
}): Promise<string> {
  const {
    cfg,
    accountId,
    persona,
    ctx,
    title,
    body,
    bodyElements,
    approvePrompt,
    denyPrompt,
    acpApprovalId,
    acpApprovalKind,
    acpAvailableDecisions,
    acpProposedExecpolicyAmendment,
  } = params;
  const operationId = randomUUID();
  const card: AuthorizationConfirmationCard = {
    operationId,
    persona,
    accountId,
    channel: 'feishu',
    peerKind: ctx.chatType === 'p2p' ? 'direct' : 'group',
    peerId: ctx.chatType === 'p2p' ? String(ctx.senderId || ctx.chatId || '') : String(ctx.chatId || ctx.senderId || ''),
    chatId: ctx.chatId,
    replyToMessageId: ctx.messageId,
    createdAt: Date.now(),
    senderOpenId: String(ctx.senderId || '').trim() || undefined,
    sessionKey: String(ctx.sessionKey || ctx.threadSessionKey || '').trim() || undefined,
    title,
    body,
    bodyElements,
    approvePrompt,
    denyPrompt,
    acpApprovalId,
    acpApprovalKind,
    acpAvailableDecisions,
    acpProposedExecpolicyAmendment,
  };
  registerPendingCard(card);
  const sent = await sendCardFeishu({
    cfg,
    accountId,
    to: card.chatId,
    replyToMessageId: card.replyToMessageId,
    card: buildAuthorizationConfirmationCard(card),
  });
  card.messageId = sent.messageId;
  log.info(`authorization confirmation card sent operationId=${operationId} messageId=${sent.messageId}`);
  return sent.messageId;
}

export async function sendAcpApprovalConfirmationCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  persona: string;
  ctx: AuthorizationConfirmationContext;
  event: AcpApprovalRequestedCallbackEvent;
}): Promise<string> {
  return await sendAuthorizationConfirmationCard({
    cfg: params.cfg,
    accountId: params.accountId,
    persona: params.persona,
    ctx: params.ctx,
    title: '授权确认',
    bodyElements: buildAcpApprovalCardBodyElements(params.event),
    approvePrompt: '',
    denyPrompt: '',
    acpApprovalId: params.event.approvalId,
    acpApprovalKind: params.event.kind,
    acpAvailableDecisions: params.event.availableDecisions,
    acpProposedExecpolicyAmendment: params.event.proposedExecpolicyAmendment,
  });
}
