import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSendCardFeishu, mockUpdateCardFeishu } = vi.hoisted(() => ({
  mockSendCardFeishu: vi.fn(),
  mockUpdateCardFeishu: vi.fn(),
}));

const { mockResolveAcpApprovalViaProvider, mockTrySteerSessionViaProvider } = vi.hoisted(() => ({
  mockResolveAcpApprovalViaProvider: vi.fn(),
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
  resolveAcpApprovalViaProvider: mockResolveAcpApprovalViaProvider,
  trySteerSessionViaProvider: mockTrySteerSessionViaProvider,
}));

import {
  handleAuthorizationConfirmationCardAction,
  sendAcpApprovalConfirmationCard,
  sendAuthorizationConfirmationCard,
} from '../src/messaging/inbound/authorization-confirmation-cards';

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
  const actionRow = card.body.elements.find((element: any) => element.tag === 'column_set');
  expect(actionRow).toBeDefined();
  return String(actionRow.columns[0].elements[0].value.operation_id);
}

function getButtonFromCard(choice: string) {
  const card = mockSendCardFeishu.mock.calls[0]?.[0]?.card;
  expect(card).toBeDefined();
  const actionRow = card.body.elements.find((element: any) => element.tag === 'column_set');
  expect(actionRow).toBeDefined();
  const columns = actionRow.columns;
  return columns
    .flatMap((column: any) => column.elements)
    .find((element: any) => element.value?.choice === choice);
}

function getSentCard() {
  const card = mockSendCardFeishu.mock.calls[0]?.[0]?.card;
  expect(card).toBeDefined();
  return card;
}

describe('authorization confirmation cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendCardFeishu.mockResolvedValue({ messageId: 'danger-msg-1', chatId: 'chat-1' });
    mockUpdateCardFeishu.mockResolvedValue(undefined);
    mockResolveAcpApprovalViaProvider.mockReturnValue(true);
    mockTrySteerSessionViaProvider.mockResolvedValue(true);
  });

  it('denies non-owner actions before any async work starts', async () => {
    const messageId = await sendAuthorizationConfirmationCard({
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

    const result = await handleAuthorizationConfirmationCardAction(
      {
        operator: { open_id: 'ou_other' },
        action: {
          value: {
            action: 'authorization_confirmation_card',
            operation_id: getOperationIdFromCard(),
            choice: 'auth:approve',
          },
        },
      },
      {} as any,
      'acct',
    );

    expect(result).toEqual({
      toast: { type: 'warning', content: '仅发起人可操作' },
    });
    expect(mockUpdateCardFeishu).not.toHaveBeenCalled();
    expect(mockTrySteerSessionViaProvider).not.toHaveBeenCalled();
  });

  it('updates the card and continues execution on approve', async () => {
    await sendAuthorizationConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '危险操作',
      body: '确认吗',
      approvePrompt: '/config',
      denyPrompt: '/cancel',
    });

    const result = await handleAuthorizationConfirmationCardAction(
      {
        operator: { open_id: 'ou_sender' },
        action: {
          value: {
            action: 'authorization_confirmation_card',
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

  it('resolves ACP approval directly on approve', async () => {
    await sendAuthorizationConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '授权确认',
      body: '确认执行命令',
      approvePrompt: '',
      denyPrompt: '',
      acpApprovalId: 'approval-1',
      acpAvailableDecisions: ['accept', 'acceptForSession', 'cancel'],
    });

    await handleAuthorizationConfirmationCardAction(
      {
        operator: { open_id: 'ou_sender' },
        action: {
          value: {
            action: 'authorization_confirmation_card',
            operation_id: getOperationIdFromCard(),
            choice: 'auth:approve',
          },
        },
      },
      {} as any,
      'acct',
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockResolveAcpApprovalViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      approvalId: 'approval-1',
      decision: 'approve-once',
    });
    expect(mockTrySteerSessionViaProvider).not.toHaveBeenCalled();
  });

  it('resolves ACP approval for the session when requested', async () => {
    await sendAuthorizationConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '授权确认',
      body: '确认执行命令',
      approvePrompt: '',
      denyPrompt: '',
      acpApprovalId: 'approval-1',
      acpAvailableDecisions: ['accept', 'acceptForSession', 'cancel'],
    });

    const sessionButton = getButtonFromCard('auth:approve_session');
    expect(sessionButton.text.content).toBe('会话');

    await handleAuthorizationConfirmationCardAction(
      {
        operator: { open_id: 'ou_sender' },
        action: {
          value: {
            action: 'authorization_confirmation_card',
            operation_id: sessionButton.value.operation_id,
            choice: 'auth:approve_session',
          },
        },
      },
      {} as any,
      'acct',
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockResolveAcpApprovalViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      approvalId: 'approval-1',
      decision: 'approve-session',
    });
    expect(mockTrySteerSessionViaProvider).not.toHaveBeenCalled();
  });

  it('labels file-change session approval as these files', async () => {
    await sendAuthorizationConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '授权确认',
      body: '确认修改文件',
      approvePrompt: '',
      denyPrompt: '',
      acpApprovalId: 'approval-1',
      acpApprovalKind: 'file_change',
      acpAvailableDecisions: ['accept', 'acceptForSession', 'cancel'],
    });

    const filesButton = getButtonFromCard('auth:approve_session');
    expect(filesButton.text.content).toBe('这些文件');

    await handleAuthorizationConfirmationCardAction(
      {
        operator: { open_id: 'ou_sender' },
        action: {
          value: {
            action: 'authorization_confirmation_card',
            operation_id: filesButton.value.operation_id,
            choice: 'auth:approve_session',
          },
        },
      },
      {} as any,
      'acct',
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockResolveAcpApprovalViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      approvalId: 'approval-1',
      decision: 'approve-session',
    });
    expect(mockUpdateCardFeishu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          body: expect.objectContaining({
            elements: [{ tag: 'markdown', content: '已允许这些文件，继续执行。' }],
          }),
        }),
      }),
    );
  });

  it('resolves ACP approval with exec policy amendment when requested', async () => {
    await sendAuthorizationConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      title: '授权确认',
      body: '确认执行命令',
      approvePrompt: '',
      denyPrompt: '',
      acpApprovalId: 'approval-1',
      acpApprovalKind: 'command',
      acpAvailableDecisions: ['accept', { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['touch'] } }, 'cancel'],
      acpProposedExecpolicyAmendment: ['touch'],
    });

    const prefixButton = getButtonFromCard('auth:approve_prefix');
    expect(prefixButton.text.content).toBe('前缀');

    await handleAuthorizationConfirmationCardAction(
      {
        operator: { open_id: 'ou_sender' },
        action: {
          value: {
            action: 'authorization_confirmation_card',
            operation_id: prefixButton.value.operation_id,
            choice: 'auth:approve_prefix',
          },
        },
      },
      {} as any,
      'acct',
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockResolveAcpApprovalViaProvider).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      approvalId: 'approval-1',
      decision: 'approve-prefix',
    });
    expect(mockTrySteerSessionViaProvider).not.toHaveBeenCalled();
  });

  it('renders ACP command approval with a short summary and collapsed full command', async () => {
    await sendAcpApprovalConfirmationCard({
      cfg: {} as any,
      accountId: 'acct',
      persona: 'luffy',
      ctx: createCtx(),
      event: {
        type: 'approval_requested',
        sessionKey: 'session-1',
        approvalId: 'approval-1',
        kind: 'command',
        method: 'command_execution/requestApproval',
        reason: '要在用户根目录创建一个测试文件 /Users/catframework/luffy-plan-card-test.txt 吗？',
        command: "printf 'luffy plan mode file write test\n' > /Users/catframework/luffy-plan-card-test.txt",
        cwd: '/Users/catframework/.openclaw/workspace/luffy',
        permissions: {
          file_system: {
            write: ['/Users/catframework/luffy-plan-card-test.txt'],
          },
        },
        availableDecisions: [
          'accept',
          { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['printf'] } },
          'cancel',
        ],
        proposedExecpolicyAmendment: ["printf 'luffy plan mode file write test"],
      },
    });

    const card = getSentCard();
    const markdown = card.body.elements.find((element: any) => element.tag === 'markdown')?.content;
    expect(markdown).toContain('权限规则：write `/Users/catframework/luffy-plan-card-test.txt`');
    expect(markdown).toContain('命令摘要：');
    expect(markdown).toContain('可记住前缀：');
    expect(markdown).toContain('执行位置：`/Users/catframework/.openclaw/workspace/luffy`');
    expect(markdown).not.toContain('命令前缀：');
    expect(markdown).not.toContain('目录：');
    expect(markdown.indexOf('命令摘要：')).toBeLessThan(markdown.indexOf('可记住前缀：'));

    const fullCommandPanel = card.body.elements.find((element: any) => element.tag === 'collapsible_panel');
    expect(fullCommandPanel).toBeDefined();
    expect(fullCommandPanel.expanded).toBe(false);
    expect(fullCommandPanel.header.title.content).toBe('完整命令');
    expect(fullCommandPanel.elements[0].content).toContain('```bash');
    expect(fullCommandPanel.elements[0].content).toContain("printf 'luffy plan mode file write test\n'");
    expect(fullCommandPanel.elements[0].content).toContain('> /Users/catframework/luffy-plan-card-test.txt');
  });
});
