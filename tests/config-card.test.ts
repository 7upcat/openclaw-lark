import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSendCardFeishu, mockUpdateCardFeishu } = vi.hoisted(() => ({
  mockSendCardFeishu: vi.fn(),
  mockUpdateCardFeishu: vi.fn(),
}));

const {
  mockCompactSessionViaProvider,
  mockGetSessionConfigViaProvider,
  mockResetSessionViaProvider,
  mockSetSessionModelViaProvider,
} = vi.hoisted(() => ({
  mockCompactSessionViaProvider: vi.fn(),
  mockGetSessionConfigViaProvider: vi.fn(),
  mockResetSessionViaProvider: vi.fn(),
  mockSetSessionModelViaProvider: vi.fn(),
}));

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../src/messaging/outbound/send', () => ({
  sendCardFeishu: mockSendCardFeishu,
  updateCardFeishu: mockUpdateCardFeishu,
}));

vi.mock('../src/channel/acp-session-provider', () => ({
  compactSessionViaProvider: mockCompactSessionViaProvider,
  getSessionConfigViaProvider: mockGetSessionConfigViaProvider,
  resetSessionViaProvider: mockResetSessionViaProvider,
  setSessionModelViaProvider: mockSetSessionModelViaProvider,
}));

import { handleAcpConfigCardAction, showAcpConfigCard } from '../src/channel/config-card';

function createCfg(): any {
  return {} as any;
}

function readOperationIdFromSentCard(): string {
  const card = mockSendCardFeishu.mock.calls[0]?.[0]?.card;
  expect(card).toBeDefined();
  const select = card.body.elements[1].columns[0].elements[0];
  return String(select.value?.operation_id || '');
}

describe('config card actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionConfigViaProvider.mockResolvedValue({
      sessionKey: 'session-1',
      exists: true,
      hasActiveTurn: true,
      queued: false,
      currentModel: 'gpt-5.4',
      availableModels: ['gpt-5.4', 'gpt-5.4-mini'],
    });
    mockSendCardFeishu.mockResolvedValue({ messageId: 'msg-1', chatId: 'chat-1' });
    mockCompactSessionViaProvider.mockResolvedValue(true);
    mockResetSessionViaProvider.mockResolvedValue(true);
    mockSetSessionModelViaProvider.mockResolvedValue(true);
    mockUpdateCardFeishu.mockResolvedValue(undefined);
  });

  it('shows a config card and closes it on close action', async () => {
    const shown = await showAcpConfigCard({
      cfg: createCfg(),
      accountId: 'acct',
      chatId: 'chat-1',
      replyToMessageId: 'reply-1',
      sessionKey: 'session-1',
    });

    expect(shown).toBe(true);
    const operationId = readOperationIdFromSentCard();

    const result = await handleAcpConfigCardAction({
      open_message_id: 'msg-1',
      action: {
        value: {
          action: 'acp_config_card',
          operation_id: operationId,
          choice: 'close',
        },
      },
    });

    expect(result).toEqual({
      toast: { type: 'success', content: '已关闭' },
      card: {
        type: 'raw',
        data: expect.objectContaining({
          body: { elements: [{ tag: 'markdown', content: '\u200B' }] },
        }),
      },
    });
    expect(mockUpdateCardFeishu).toHaveBeenCalledTimes(1);
  });

  it('re-renders the config card when model switch fails', async () => {
    mockSetSessionModelViaProvider.mockResolvedValue(false);

    await showAcpConfigCard({
      cfg: createCfg(),
      accountId: 'acct',
      chatId: 'chat-1',
      replyToMessageId: 'reply-1',
      sessionKey: 'session-1',
    });

    const operationId = readOperationIdFromSentCard();
    const result = await handleAcpConfigCardAction({
      open_message_id: 'msg-1',
      action: {
        value: {
          action: 'acp_config_card',
          operation_id: operationId,
          choice: 'model:gpt-5.4-mini',
        },
      },
    });

    expect(result).toBeNull();
    expect(mockSetSessionModelViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      model: 'gpt-5.4-mini',
    });
    expect(mockUpdateCardFeishu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          header: expect.objectContaining({ title: expect.objectContaining({ content: 'ACP 配置' }) }),
        }),
      }),
    );
  });
});
