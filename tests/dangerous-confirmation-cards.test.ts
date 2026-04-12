import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSendCardFeishu, mockUpdateCardFeishu } = vi.hoisted(() => ({
  mockSendCardFeishu: vi.fn(),
  mockUpdateCardFeishu: vi.fn(),
}));

const { mockTrySteerSessionViaProvider } = vi.hoisted(() => ({
  mockTrySteerSessionViaProvider: vi.fn(),
}));

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../src/messaging/outbound/send', () => ({
  sendCardFeishu: mockSendCardFeishu,
  updateCardFeishu: mockUpdateCardFeishu,
}));

vi.mock('../src/channel/acp-session-provider', () => ({
  trySteerSessionViaProvider: mockTrySteerSessionViaProvider,
}));

import {
  handleDangerousConfirmationCardAction,
  sendDangerousConfirmationCard,
} from '../src/messaging/inbound/dangerous-confirmation-cards';

function createCtx() {
  return {
    chatType: 'p2p',
    senderId: 'ou_sender',
    chatId: 'chat-1',
    messageId: 'msg-1',
    sessionKey: 'session-1',
  } as const;
}

function getOperationIdFromCard() {
  const card = mockSendCardFeishu.mock.calls[0]?.[0]?.card;
  expect(card).toBeDefined();
  return String(card.body.elements[1].columns[0].elements[0].value.operation_id);
}

describe('dangerous confirmation cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCardFeishu.mockResolvedValue({ messageId: 'danger-msg-1', chatId: 'chat-1' });
    mockUpdateCardFeishu.mockResolvedValue(undefined);
    mockTrySteerSessionViaProvider.mockResolvedValue(true);
  });

  it('denies non-owner actions before any async work starts', async () => {
    const messageId = await sendDangerousConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '危险操作',
      body: '确认吗',
      approvePrompt: '/config',
      denyPrompt: '/cancel',
    });
    expect(messageId).toBe('danger-msg-1');

    const result = await handleDangerousConfirmationCardAction(
      {
        operator: { open_id: 'ou_other' },
        action: {
          value: {
            action: 'dangerous_confirmation_card',
            operation_id: getOperationIdFromCard(),
            choice: 'auth:approve',
          },
        },
      },
      {} as any,
      'acct',
    );

    expect(result).toEqual({
      toast: { type: 'warning', content: '只有发起人可以确认这项危险操作' },
    });
    expect(mockUpdateCardFeishu).not.toHaveBeenCalled();
    expect(mockTrySteerSessionViaProvider).not.toHaveBeenCalled();
  });

  it('updates the card and continues execution on approve', async () => {
    await sendDangerousConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '危险操作',
      body: '确认吗',
      approvePrompt: '/config',
      denyPrompt: '/cancel',
    });

    const result = await handleDangerousConfirmationCardAction(
      {
        operator: { open_id: 'ou_sender' },
        action: {
          value: {
            action: 'dangerous_confirmation_card',
            operation_id: getOperationIdFromCard(),
            choice: 'auth:approve',
          },
        },
      },
      {} as any,
      'acct',
    );

    expect(result).toEqual({
      toast: { type: 'success', content: '正在处理卡片操作…' },
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockUpdateCardFeishu).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          header: expect.objectContaining({ template: 'blue' }),
        }),
      }),
    );
    expect(mockTrySteerSessionViaProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: 'session-1',
        prompt: '/config',
        accountId: 'acct',
        messageId: 'danger-msg-1',
      }),
    );
  });
});
