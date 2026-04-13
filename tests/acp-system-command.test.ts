import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSessionConfigViaProvider,
  mockInspectSessionViaProvider,
  mockResetSessionViaProvider,
  mockClearSessionViaProvider,
  mockCompactSessionViaProvider,
  mockResolvePermissionMode,
  mockSetSessionCollaborationModeViaProvider,
} = vi.hoisted(() => ({
  mockGetSessionConfigViaProvider: vi.fn(),
  mockInspectSessionViaProvider: vi.fn(),
  mockResetSessionViaProvider: vi.fn(),
  mockClearSessionViaProvider: vi.fn(),
  mockCompactSessionViaProvider: vi.fn(),
  mockResolvePermissionMode: vi.fn(),
  mockSetSessionCollaborationModeViaProvider: vi.fn(),
}));

const { mockSendMessageFeishu, mockShowAcpConfigCard } = vi.hoisted(() => ({
  mockSendMessageFeishu: vi.fn().mockResolvedValue({}),
  mockShowAcpConfigCard: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../src/messaging/outbound/send', () => ({
  sendMessageFeishu: mockSendMessageFeishu,
}));

vi.mock('../src/channel/config-card', () => ({
  showAcpConfigCard: mockShowAcpConfigCard,
}));

vi.mock('../src/channel/acp-session-provider', () => ({
  compactSessionViaProvider: mockCompactSessionViaProvider,
  clearSessionViaProvider: mockClearSessionViaProvider,
  getSessionConfigViaProvider: mockGetSessionConfigViaProvider,
  inspectSessionViaProvider: mockInspectSessionViaProvider,
  newSessionViaProvider: mockResetSessionViaProvider,
  resetSessionViaProvider: mockResetSessionViaProvider,
  resolvePermissionMode: mockResolvePermissionMode,
  setSessionCollaborationModeViaProvider: mockSetSessionCollaborationModeViaProvider,
}));

import { dispatchAcpSystemCommand } from '../src/channel/acp-system-command';

function createDispatchContext(): any {
  return {
    threadSessionKey: 'session-1',
    route: { sessionKey: 'session-1' },
    accountScopedCfg: {} as never,
    account: { accountId: 'acct' },
    ctx: {
      chatId: 'chat-1',
      messageId: 'msg-1',
    },
    isThread: false,
  };
}

describe('acp system command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInspectSessionViaProvider.mockReturnValue({
      sessionKey: 'session-1',
      exists: true,
      hasActiveTurn: false,
      queued: false,
      threadId: 'thread-1',
      turnId: 'turn-1',
      lastStatus: 'idle',
    });
    mockGetSessionConfigViaProvider.mockResolvedValue({
      sessionKey: 'session-1',
      exists: true,
      hasActiveTurn: false,
      queued: false,
      currentModel: 'gpt-5.4',
      currentApprovalPolicy: 'on-request',
      currentSandboxMode: 'workspace-write',
      availableModels: ['gpt-5.4', 'gpt-5.4-mini'],
    });
    mockResolvePermissionMode.mockReturnValue('default');
    mockCompactSessionViaProvider.mockResolvedValue(true);
    mockResetSessionViaProvider.mockResolvedValue(true);
    mockClearSessionViaProvider.mockResolvedValue(true);
    mockSetSessionCollaborationModeViaProvider.mockResolvedValue(true);
  });

  it('shows the current permission mode in /status', async () => {
    const handled = await dispatchAcpSystemCommand({
      dc: createDispatchContext(),
      verb: 'status',
    });

    expect(handled).toBe(true);
    expect(mockSendMessageFeishu).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('权限模式: 默认权限'),
      }),
    );
  });

});
