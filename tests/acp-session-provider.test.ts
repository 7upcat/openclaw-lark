import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const providerSymbol = Symbol.for('openclaw.acp.session-provider');

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  bindAcpSessionViaSessionStore,
  detectAcpBindingViaSessionStore,
  setSessionPermissionModeViaProvider,
  unbindAcpSessionViaSessionStore,
} from '../src/channel/acp-session-provider';

describe('acp session provider permission mode', () => {
  beforeEach(() => {
    delete (globalThis as typeof globalThis & { [providerSymbol]?: unknown })[providerSymbol];
    vi.clearAllMocks();
  });

  it('rolls back approvalPolicy when sandbox update fails', async () => {
    const setConfigOption = vi
      .fn()
      .mockResolvedValueOnce({ accepted: true })
      .mockResolvedValueOnce({ accepted: false })
      .mockResolvedValueOnce({ accepted: true });
    (globalThis as typeof globalThis & { [providerSymbol]?: unknown })[providerSymbol] = {
      getSessionConfig: vi.fn().mockResolvedValue({
        currentApprovalPolicy: 'on-request',
        currentSandboxMode: 'workspace-write',
      }),
      setConfigOption,
    };

    const result = await setSessionPermissionModeViaProvider({
      sessionKey: 'session-1',
      mode: 'full-access',
    });

    expect(result).toBe(false);
    expect(setConfigOption).toHaveBeenNthCalledWith(1, {
      sessionKey: 'session-1',
      key: 'approvalPolicy',
      value: 'never',
    });
    expect(setConfigOption).toHaveBeenNthCalledWith(2, {
      sessionKey: 'session-1',
      key: 'sandboxMode',
      value: 'danger-full-access',
    });
    expect(setConfigOption).toHaveBeenNthCalledWith(3, {
      sessionKey: 'session-1',
      key: 'approvalPolicy',
      value: 'on-request',
    });
  });

  it('returns false immediately when approvalPolicy update fails', async () => {
    const setConfigOption = vi.fn().mockResolvedValue({ accepted: false });
    (globalThis as typeof globalThis & { [providerSymbol]?: unknown })[providerSymbol] = {
      getSessionConfig: vi.fn().mockResolvedValue({
        currentApprovalPolicy: 'on-request',
        currentSandboxMode: 'workspace-write',
      }),
      setConfigOption,
    };

    const result = await setSessionPermissionModeViaProvider({
      sessionKey: 'session-1',
      mode: 'full-access',
    });

    expect(result).toBe(false);
    expect(setConfigOption).toHaveBeenCalledTimes(1);
    expect(setConfigOption).toHaveBeenCalledWith({
      sessionKey: 'session-1',
      key: 'approvalPolicy',
      value: 'never',
    });
  });

  it('returns true when both updates succeed without rollback', async () => {
    const setConfigOption = vi.fn().mockResolvedValue({ accepted: true });
    const getSessionConfig = vi
      .fn()
      .mockResolvedValueOnce({
        currentApprovalPolicy: 'on-request',
        currentSandboxMode: 'workspace-write',
      })
      .mockResolvedValueOnce({
        currentApprovalPolicy: 'never',
        currentSandboxMode: 'danger-full-access',
      });
    (globalThis as typeof globalThis & { [providerSymbol]?: unknown })[providerSymbol] = {
      getSessionConfig,
      setConfigOption,
    };

    const result = await setSessionPermissionModeViaProvider({
      sessionKey: 'session-1',
      mode: 'full-access',
    });

    expect(result).toBe(true);
    expect(setConfigOption).toHaveBeenCalledTimes(2);
    expect(getSessionConfig).toHaveBeenCalledTimes(2);
  });
});

describe('acp session provider binding store controls', () => {
  it('unbinds and restores ACP binding without using runtimeMode=native', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openclaw-lark-acp-binding-'));
    const storePath = join(root, 'agents', 'luffy', 'sessions', 'sessions.json');
    mkdirSync(join(root, 'agents', 'luffy', 'sessions'), { recursive: true });
    const sessionKey = 'agent:luffy:feishu:direct:user-1';
    writeFileSync(storePath, `${JSON.stringify({
      [sessionKey]: {
        acp: {
          backend: 'codex-acp',
          runtimeMode: 'pure',
          runtimeOptions: { runtimeMode: 'pure' },
        },
        updatedAt: 1,
      },
    }, null, 2)}\n`, 'utf8');

    const cfg = {
      sessions: { store: join(root, 'agents', '{agentId}', 'sessions', 'sessions.json') },
    } as any;

    await expect(detectAcpBindingViaSessionStore({ cfg, sessionKey })).resolves.toEqual({
      mode: 'pure',
      hasAcpBinding: true,
      hasBackup: false,
    });
    await expect(unbindAcpSessionViaSessionStore({ cfg, sessionKey })).resolves.toBe(true);
    const unbound = JSON.parse(readFileSync(storePath, 'utf8'));
    expect(unbound[sessionKey].acp).toBeUndefined();
    expect(unbound[sessionKey].larkAcpBindingBackup).toEqual(
      expect.objectContaining({ runtimeMode: 'pure' }),
    );
    await expect(detectAcpBindingViaSessionStore({ cfg, sessionKey })).resolves.toEqual({
      mode: 'native',
      hasAcpBinding: false,
      hasBackup: true,
    });

    await expect(bindAcpSessionViaSessionStore({ cfg, sessionKey })).resolves.toBe(true);
    const rebound = JSON.parse(readFileSync(storePath, 'utf8'));
    expect(rebound[sessionKey].acp).toEqual(expect.objectContaining({ runtimeMode: 'pure' }));
    expect(rebound[sessionKey].larkAcpBindingBackup).toBeUndefined();
  });
});
