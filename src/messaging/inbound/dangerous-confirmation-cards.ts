import { randomUUID } from 'node:crypto';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import { larkLogger } from '../../core/lark-logger';
import { trySteerSessionViaProvider } from '../../channel/acp-session-provider';
import { sendCardFeishu, updateCardFeishu } from '../outbound/send';

const log = larkLogger('inbound/dangerous-confirmation-cards');
const CARD_TTL_MS = 30 * 60 * 1000;

type DangerousCardActionEvent = {
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
};

type DangerousConfirmationContext = {
  chatType?: string;
  senderId?: string;
  chatId: string;
  messageId: string;
  sessionKey?: string;
  threadSessionKey?: string;
};

interface DangerousConfirmationCard {
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
  approvePrompt?: string;
  denyPrompt?: string;
}

const pendingDangerousCards = new Map<string, DangerousConfirmationCard>();

function buildButton(text: string, type: string, operationId: string, choice: string) {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    value: {
      action: 'dangerous_confirmation_card',
      operation_id: operationId,
      choice,
    },
  };
}

function buildDangerousConfirmationCard(card: DangerousConfirmationCard) {
  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: card.title || '危险操作确认' },
      template: 'red',
    },
    body: {
      elements: [
        { tag: 'markdown', content: card.body || '该操作存在较高风险，请确认是否继续。' },
        {
          tag: 'column_set',
          flex_mode: 'none',
          horizontal_align: 'left',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [buildButton('确认执行', 'primary', card.operationId, 'auth:approve')],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [buildButton('取消', 'danger', card.operationId, 'auth:deny')],
            },
          ],
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

function registerPendingCard(card: DangerousConfirmationCard): void {
  pendingDangerousCards.set(card.operationId, card);
  setTimeout(() => {
    if (!pendingDangerousCards.has(card.operationId)) return;
    pendingDangerousCards.delete(card.operationId);
  }, CARD_TTL_MS);
}

function readOperatorOpenId(event: DangerousCardActionEvent): string {
  return String(event?.operator?.open_id || event?.operator?.operator_id?.open_id || '').trim();
}

async function runPersonaControl(card: DangerousConfirmationCard, accountId: string, messageId: string): Promise<string> {
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

export async function handleDangerousConfirmationCardAction(data: unknown, cfg: ClawdbotConfig, accountId: string): Promise<unknown> {
  let action;
  let operationId;
  let choice;
  let operatorOpenId: string;
  try {
    const event = data as DangerousCardActionEvent;
    operatorOpenId = readOperatorOpenId(event);
    action = event.action?.value?.action;
    operationId = event.action?.value?.operation_id;
    choice = event.action?.value?.choice;
  } catch {
    return;
  }
  if (action !== 'dangerous_confirmation_card' || !operationId || !choice) return;
  log.info(
    `dangerous confirmation card action account=${accountId} operationId=${String(operationId)} choice=${String(choice)}`,
  );
  const card = pendingDangerousCards.get(operationId);
  if (!card || !card.messageId) {
    return { toast: { type: 'error', content: '卡片状态不存在或已过期' } };
  }
  if (operatorOpenId && card.senderOpenId && operatorOpenId !== card.senderOpenId) {
    return { toast: { type: 'warning', content: '只有发起人可以确认这项危险操作' } };
  }
  const messageId = card.messageId;
  setImmediate(async () => {
    try {
      const approved = choice === 'auth:approve';
      if (!approved) {
        await updateCardFeishu({
          cfg,
          accountId,
          messageId,
          card: buildResultCard('危险操作确认', '已取消当前危险操作。', 'red'),
        });
        pendingDangerousCards.delete(operationId);
        return;
      }
      await updateCardFeishu({
        cfg,
        accountId,
        messageId,
        card: buildProgressCard('危险操作确认', '已收到确认，正在继续执行…'),
      });
      const result = await runPersonaControl(card, accountId, messageId);
      await updateCardFeishu({
        cfg,
        accountId,
        messageId,
        card: buildResultCard('危险操作确认', result || '已批准当前操作。', 'green'),
      });
      pendingDangerousCards.delete(operationId);
    } catch (err) {
      log.warn(`dangerous confirmation card action failed: ${String(err)}`);
      try {
        await updateCardFeishu({
          cfg,
          accountId,
          messageId,
          card: buildResultCard('危险操作确认失败', String(err), 'red'),
        });
      } catch (updateErr) {
        log.error(`dangerous confirmation failure card update failed: ${String(updateErr)}`);
      }
      pendingDangerousCards.delete(operationId);
    }
  });
  return { toast: { type: 'success', content: '正在处理卡片操作…' } };
}

export async function updateDangerousConfirmationCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  persona: string;
  ctx: DangerousConfirmationContext;
  messageId: string;
  title?: string;
  body?: string;
  approvePrompt: string;
  denyPrompt: string;
}): Promise<void> {
  const { cfg, accountId, persona, ctx, messageId, title, body, approvePrompt, denyPrompt } = params;
  const operationId = randomUUID();
  const card: DangerousConfirmationCard = {
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
    approvePrompt,
    denyPrompt,
  };
  registerPendingCard(card);
  await updateCardFeishu({
    cfg,
    accountId,
    messageId,
    card: buildDangerousConfirmationCard(card),
  });
  log.info(`dangerous confirmation card updated operationId=${operationId} messageId=${messageId}`);
}

export async function sendDangerousConfirmationCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  persona: string;
  ctx: DangerousConfirmationContext;
  title?: string;
  body?: string;
  approvePrompt: string;
  denyPrompt: string;
}): Promise<string> {
  const { cfg, accountId, persona, ctx, title, body, approvePrompt, denyPrompt } = params;
  const operationId = randomUUID();
  const card: DangerousConfirmationCard = {
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
    approvePrompt,
    denyPrompt,
  };
  registerPendingCard(card);
  const sent = await sendCardFeishu({
    cfg,
    accountId,
    to: card.chatId,
    replyToMessageId: card.replyToMessageId,
    card: buildDangerousConfirmationCard(card),
  });
  card.messageId = sent.messageId;
  log.info(`dangerous confirmation card sent operationId=${operationId} messageId=${sent.messageId}`);
  return sent.messageId;
}
