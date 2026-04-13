import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSendCardFeishu, mockUpdateCardFeishu } = vi.hoisted(() => ({
  mockSendCardFeishu: vi.fn(),
  mockUpdateCardFeishu: vi.fn(),
}));

const {
  mockCompactSessionViaProvider,
  mockBindAcpSessionViaSessionStore,
  mockClearSessionViaProvider,
  mockDetectAcpBindingViaSessionStore,
  mockGetSessionConfigViaProvider,
  mockInspectSessionViaProvider,
  mockResetSessionViaProvider,
  mockSetSessionCollaborationModeViaProvider,
  mockSetSessionRuntimeModeViaProvider,
  mockSetSessionPermissionModeViaProvider,
  mockSetSessionModelViaProvider,
  mockSetSessionReasoningEffortViaProvider,
  mockUnbindAcpSessionViaSessionStore,
} = vi.hoisted(() => ({
  mockCompactSessionViaProvider: vi.fn(),
  mockBindAcpSessionViaSessionStore: vi.fn(),
  mockClearSessionViaProvider: vi.fn(),
  mockDetectAcpBindingViaSessionStore: vi.fn(),
  mockGetSessionConfigViaProvider: vi.fn(),
  mockInspectSessionViaProvider: vi.fn(),
  mockResetSessionViaProvider: vi.fn(),
  mockSetSessionCollaborationModeViaProvider: vi.fn(),
  mockSetSessionRuntimeModeViaProvider: vi.fn(),
  mockSetSessionPermissionModeViaProvider: vi.fn(),
  mockSetSessionModelViaProvider: vi.fn(),
  mockSetSessionReasoningEffortViaProvider: vi.fn(),
  mockUnbindAcpSessionViaSessionStore: vi.fn(),
}));

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../src/messaging/outbound/send', () => ({
  sendCardFeishu: mockSendCardFeishu,
  updateCardFeishu: mockUpdateCardFeishu,
}));

vi.mock('../src/channel/acp-session-provider', () => ({
  bindAcpSessionViaSessionStore: mockBindAcpSessionViaSessionStore,
  clearSessionViaProvider: mockClearSessionViaProvider,
  compactSessionViaProvider: mockCompactSessionViaProvider,
  detectAcpBindingViaSessionStore: mockDetectAcpBindingViaSessionStore,
  getSessionConfigViaProvider: mockGetSessionConfigViaProvider,
  inspectSessionViaProvider: mockInspectSessionViaProvider,
  resolvePermissionMode: vi.fn((config?: { currentApprovalPolicy?: string; currentSandboxMode?: string }) => {
    if (config?.currentApprovalPolicy === 'never' && config?.currentSandboxMode === 'danger-full-access') {
      return 'full-access';
    }
    if (config?.currentApprovalPolicy === 'on-request' && config?.currentSandboxMode === 'workspace-write') {
      return 'default';
    }
    return 'custom';
  }),
  resetSessionViaProvider: mockResetSessionViaProvider,
  setSessionCollaborationModeViaProvider: mockSetSessionCollaborationModeViaProvider,
  setSessionRuntimeModeViaProvider: mockSetSessionRuntimeModeViaProvider,
  setSessionPermissionModeViaProvider: mockSetSessionPermissionModeViaProvider,
  setSessionModelViaProvider: mockSetSessionModelViaProvider,
  setSessionReasoningEffortViaProvider: mockSetSessionReasoningEffortViaProvider,
  unbindAcpSessionViaSessionStore: mockUnbindAcpSessionViaSessionStore,
}));

import { handleAcpConfigCardAction, showAcpConfigCard } from '../src/channel/config-card';

function createCfg(): any {
  return {} as any;
}

function readOperationIdFromSentCard(): string {
  const card = mockSendCardFeishu.mock.calls[0]?.[0]?.card;
  expect(card).toBeDefined();
  const operationId = findOperationId(card);
  expect(operationId).toBeTruthy();
  return operationId ?? '';
}

function findOperationId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const nestedValue = record.value;
  if (nestedValue && typeof nestedValue === 'object') {
    const operationId = (nestedValue as Record<string, unknown>).operation_id;
    if (typeof operationId === 'string' && operationId) return operationId;
  }
  if (typeof record.operation_id === 'string' && record.operation_id) return record.operation_id;

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findOperationId(item);
        if (found) return found;
      }
      continue;
    }
    const found = findOperationId(child);
    if (found) return found;
  }
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
      currentApprovalPolicy: 'on-request',
      currentSandboxMode: 'workspace-write',
      availableModels: ['gpt-5.4', 'gpt-5.4-mini'],
    });
    mockSendCardFeishu.mockResolvedValue({ messageId: 'msg-1', chatId: 'chat-1' });
    mockCompactSessionViaProvider.mockResolvedValue(true);
    mockClearSessionViaProvider.mockResolvedValue(true);
    mockInspectSessionViaProvider.mockReturnValue({
      sessionKey: 'session-1',
      exists: true,
      hasActiveTurn: false,
      queued: false,
      threadId: 'thread-1',
    });
    mockResetSessionViaProvider.mockResolvedValue(true);
    mockBindAcpSessionViaSessionStore.mockResolvedValue(true);
    mockDetectAcpBindingViaSessionStore.mockResolvedValue({
      mode: 'persona',
      hasAcpBinding: true,
      hasBackup: false,
    });
    mockSetSessionRuntimeModeViaProvider.mockResolvedValue(true);
    mockSetSessionPermissionModeViaProvider.mockResolvedValue(true);
    mockSetSessionModelViaProvider.mockResolvedValue(true);
    mockSetSessionCollaborationModeViaProvider.mockResolvedValue(true);
    mockSetSessionReasoningEffortViaProvider.mockResolvedValue(true);
    mockUnbindAcpSessionViaSessionStore.mockResolvedValue(true);
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

  it('returns a failure result card when model switch fails', async () => {
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

    expect(result).toEqual(
      expect.objectContaining({
        card: expect.objectContaining({
          type: 'raw',
          data: expect.objectContaining({
            body: expect.objectContaining({
              elements: [expect.objectContaining({ content: expect.stringContaining('切换模型失败。') })],
            }),
          }),
        }),
      }),
    );
    expect(mockSetSessionModelViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      model: 'gpt-5.4-mini',
    });
    expect(mockUpdateCardFeishu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          body: expect.objectContaining({
            elements: [expect.objectContaining({ content: expect.stringContaining('切换模型失败。') })],
          }),
        }),
      }),
    );
  });

  it('shows a success result card after switching permission mode', async () => {
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
          choice: 'permission:full-access',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        card: expect.objectContaining({
          type: 'raw',
          data: expect.objectContaining({
            body: expect.objectContaining({
              elements: [expect.objectContaining({ content: expect.stringContaining('权限模式已切换为 完全访问，后续 turn 生效。') })],
            }),
          }),
        }),
      }),
    );
    expect(mockSetSessionPermissionModeViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      mode: 'full-access',
    });
    expect(mockUpdateCardFeishu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          body: expect.objectContaining({
            elements: [expect.objectContaining({ content: expect.stringContaining('权限模式已切换为 完全访问，后续 turn 生效。') })],
          }),
        }),
      }),
    );
  });

  it('returns a clear failure card when compact has no thread', async () => {
    mockInspectSessionViaProvider.mockReturnValue({
      sessionKey: 'session-1',
      exists: true,
      hasActiveTurn: false,
      queued: false,
    });

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
          choice: 'compact',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        card: expect.objectContaining({
          type: 'raw',
          data: expect.objectContaining({
            body: expect.objectContaining({
              elements: [expect.objectContaining({ content: expect.stringContaining('当前没有可压缩的运行会话') })],
            }),
          }),
        }),
      }),
    );
    expect(mockCompactSessionViaProvider).not.toHaveBeenCalled();
  });

  it('unbinds ACP binding when switching to native mode', async () => {
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
          choice: 'runtime:native',
        },
      },
    });

    expect(mockUnbindAcpSessionViaSessionStore).toHaveBeenCalledWith({
      cfg: createCfg(),
      sessionKey: 'session-1',
    });
    expect(mockSetSessionRuntimeModeViaProvider).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        card: expect.objectContaining({
          type: 'raw',
          data: expect.objectContaining({
            body: expect.objectContaining({
              elements: [expect.objectContaining({ content: expect.stringContaining('模式已切换为 原生') })],
            }),
          }),
        }),
      }),
    );
  });

});
