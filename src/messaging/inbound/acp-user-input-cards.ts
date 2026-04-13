import { randomUUID } from 'node:crypto';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { AcpUserInputQuestion } from '../../channel/acp-tool-callback';
import { resolveAcpUserInputViaProvider } from '../../channel/acp-session-provider';
import { larkLogger } from '../../core/lark-logger';
import { sendCardFeishu } from '../outbound/send';

const log = larkLogger('inbound/acp-user-input-cards');
const CARD_ACTION = 'acp_user_input_card';
const SUBMIT_BUTTON_PREFIX = 'acp_user_input_submit_';
const CARD_TTL_MS = 30 * 60 * 1000;

type AcpUserInputCardActionEvent = {
  operator?: { open_id?: string; operator_id?: { open_id?: string } };
  open_chat_id?: string;
  context?: { open_chat_id?: string };
  action?: {
    tag?: string;
    name?: string;
    form_value?: Record<string, unknown>;
    value?: {
      action?: string;
      operation_id?: string;
      choice?: string;
    };
  };
};

type PendingAcpUserInputCard = {
  operationId: string;
  requestId: string;
  sessionKey: string;
  messageId?: string;
  senderOpenId?: string;
  questions: AcpUserInputQuestion[];
};

const pendingCards = new Map<string, PendingAcpUserInputCard>();

function readOperatorOpenId(event: AcpUserInputCardActionEvent): string {
  return String(event.operator?.open_id || event.operator?.operator_id?.open_id || '').trim();
}

function readFormTextField(formValue: Record<string, unknown>, name: string): string | undefined {
  const raw = formValue[name];
  if (typeof raw === 'string') return raw.trim() || undefined;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const value = (raw as { value?: unknown }).value;
    return typeof value === 'string' ? value.trim() || undefined : undefined;
  }
  return undefined;
}

function getFieldName(questionId: string): string {
  return `acp_user_input_${questionId}`;
}

function getOtherFieldName(questionId: string): string {
  return `acp_user_input_other_${questionId}`;
}

function buildQuestionElement(question: AcpUserInputQuestion): Record<string, unknown> {
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length > 0) {
    return {
      tag: 'select_static',
      name: getFieldName(question.id),
      placeholder: { tag: 'plain_text', content: '请选择...' },
      options: options.map((option) => ({
        text: { tag: 'plain_text', content: option.label },
        value: option.label,
      })),
    };
  }
  return {
    tag: question.isSecret ? 'input_password' : 'input',
    name: getFieldName(question.id),
    placeholder: { tag: 'plain_text', content: '请输入...' },
  };
}

function buildQuestionElements(question: AcpUserInputQuestion): Record<string, unknown>[] {
  const elements: Record<string, unknown>[] = [
    {
      tag: 'markdown',
      content: `**${question.header || question.id}**\n${question.question}`,
    },
    buildQuestionElement(question),
  ];
  if (Array.isArray(question.options) && question.options.length > 0) {
    elements.push({
      tag: question.isSecret ? 'input_password' : 'input',
      name: getOtherFieldName(question.id),
      placeholder: { tag: 'plain_text', content: '其他（可选，填写后优先）' },
    });
  }
  return elements;
}

function buildUserInputCard(card: PendingAcpUserInputCard): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [];
  card.questions.forEach((question, index) => {
    if (index > 0) elements.push({ tag: 'hr' });
    elements.push(...buildQuestionElements(question));
  });
  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'column_set',
    flex_mode: 'none',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [
          {
            tag: 'button',
            name: `${SUBMIT_BUTTON_PREFIX}${card.operationId}`,
            text: { tag: 'plain_text', content: '提交' },
            type: 'primary',
            form_action_type: 'submit',
          },
        ],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '取消' },
            type: 'danger',
            value: { action: CARD_ACTION, operation_id: card.operationId, choice: 'cancel' },
          },
        ],
      },
    ],
  });
  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: '需要输入' },
      subtitle: { tag: 'plain_text', content: `共 ${card.questions.length} 个问题` },
      template: 'blue',
    },
    body: {
      elements: [
        {
          tag: 'form',
          name: 'acp_user_input_form',
          elements,
        },
      ],
    },
  };
}

function buildResultCard(title: string, text: string, template = 'green') {
  return {
    schema: '2.0',
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: title }, template },
    body: { elements: [{ tag: 'markdown', content: text }] },
  };
}

function registerPendingCard(card: PendingAcpUserInputCard): void {
  pendingCards.set(card.operationId, card);
  setTimeout(() => {
    pendingCards.delete(card.operationId);
  }, CARD_TTL_MS);
}

export async function sendAcpUserInputCard(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  chatId: string;
  replyToMessageId: string;
  sessionKey: string;
  requestId: string;
  senderOpenId?: string;
  questions: AcpUserInputQuestion[];
}): Promise<string> {
  const card: PendingAcpUserInputCard = {
    operationId: randomUUID(),
    requestId: params.requestId,
    sessionKey: params.sessionKey,
    senderOpenId: String(params.senderOpenId || '').trim() || undefined,
    questions: params.questions,
  };
  registerPendingCard(card);
  const sent = await sendCardFeishu({
    cfg: params.cfg,
    accountId: params.accountId,
    to: params.chatId,
    replyToMessageId: params.replyToMessageId,
    card: buildUserInputCard(card),
  });
  card.messageId = sent.messageId;
  log.info(`acp user input card sent operationId=${card.operationId} requestId=${params.requestId}`);
  return sent.messageId;
}

export function handleAcpUserInputCardAction(data: unknown): unknown | undefined {
  let operationId: string | undefined;
  let choice: string | undefined;
  let formValue: Record<string, unknown> | undefined;
  let operatorOpenId: string | undefined;
  try {
    const event = data as AcpUserInputCardActionEvent;
    const actionName = event.action?.name;
    operatorOpenId = readOperatorOpenId(event);
    formValue = event.action?.form_value;
    const value = event.action?.value;
    if (value?.action === CARD_ACTION) {
      operationId = value.operation_id;
      choice = value.choice;
    }
    if (!operationId && actionName?.startsWith(SUBMIT_BUTTON_PREFIX)) {
      operationId = actionName.slice(SUBMIT_BUTTON_PREFIX.length);
      choice = 'submit';
    }
  } catch {
    return undefined;
  }
  if (!operationId || (choice !== 'submit' && choice !== 'cancel')) return undefined;
  const card = pendingCards.get(operationId);
  if (!card) return { toast: { type: 'info', content: '输入请求已过期或已处理' } };
  if (operatorOpenId && card.senderOpenId && operatorOpenId !== card.senderOpenId) {
    return { toast: { type: 'warning', content: '仅发起人可操作' } };
  }
  if (choice === 'cancel') {
    const accepted = resolveAcpUserInputViaProvider({
      sessionKey: card.sessionKey,
      requestId: card.requestId,
      answers: {},
    });
    pendingCards.delete(operationId);
    return {
      toast: { type: accepted ? 'success' : 'error', content: accepted ? '已取消输入请求' : '取消失败：请求不存在或已过期' },
      card: { type: 'raw' as const, data: buildResultCard('需要输入', accepted ? '已取消输入请求。' : '取消失败：请求不存在或已过期。', accepted ? 'grey' : 'red') },
    };
  }
  if (!formValue) return { toast: { type: 'error', content: '表单数据丢失，请重试' } };
  const answers: Record<string, string[]> = {};
  const missing: string[] = [];
  for (const question of card.questions) {
    const answer = readFormTextField(formValue, getOtherFieldName(question.id)) ||
      readFormTextField(formValue, getFieldName(question.id));
    if (!answer) {
      missing.push(question.header || question.id);
      continue;
    }
    answers[question.id] = [answer];
  }
  if (missing.length > 0) {
    return { toast: { type: 'warning', content: `请先完成: ${missing.join(', ')}` } };
  }
  const accepted = resolveAcpUserInputViaProvider({
    sessionKey: card.sessionKey,
    requestId: card.requestId,
    answers,
  });
  if (accepted) pendingCards.delete(operationId);
  return {
    toast: { type: accepted ? 'success' : 'error', content: accepted ? '已提交' : '提交失败：请求不存在或已过期' },
    card: { type: 'raw' as const, data: buildResultCard('已提交输入', accepted ? '已提交，继续执行。' : '提交失败：请求不存在或已过期。', accepted ? 'green' : 'red') },
  };
}
