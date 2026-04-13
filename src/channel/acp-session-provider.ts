/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import { loadSessionStore, resolveSessionStoreEntry, resolveStorePath, updateSessionStore } from 'openclaw/plugin-sdk/config-runtime';
import { larkLogger } from '../core/lark-logger';

const ACP_SESSION_PROVIDER_SYMBOL = Symbol.for('openclaw.acp.session-provider');
const CODEX_ACP_APPROVAL_PROVIDER_SYMBOL = Symbol.for('openclaw.codex-acp.approval-provider');
const log = larkLogger('channel/acp-session-provider');
const LARK_ACP_BINDING_BACKUP_KEY = 'larkAcpBindingBackup';

export interface AcpSessionInspection {
  sessionKey: string;
  exists: boolean;
  hasActiveTurn: boolean;
  queued: boolean;
  threadId?: string;
  turnId?: string;
  lastStatus?: string;
}

export interface AcpSessionConfigState {
  sessionKey: string;
  exists: boolean;
  hasActiveTurn: boolean;
  queued: boolean;
  currentModel?: string;
  currentRuntimeMode?: AcpRuntimeMode;
  currentCollaborationMode?: AcpCollaborationMode;
  currentReasoningEffort?: AcpReasoningEffort;
  currentApprovalPolicy?: string;
  currentSandboxMode?: string;
  availableModels: string[];
}

export type AcpPermissionMode = 'default' | 'full-access' | 'custom';
export type AcpRuntimeMode = 'persona' | 'pure' | 'native';
export type AcpCollaborationMode = 'default' | 'plan';
export type AcpReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
type CodexAcpRuntimeMode = Exclude<AcpRuntimeMode, 'native'>;

interface AcpSessionProvider {
  inspectSession?(sessionKey: string): AcpSessionInspection;
  trySteerSession?(params: {
    sessionKey: string;
    prompt: string;
    accountId?: string;
    messageId?: string;
  }): Promise<{ accepted: boolean; threadId?: string; turnId?: string }>;
  getSessionConfig?(params: { sessionKey: string }): Promise<AcpSessionConfigState>;
  interruptSession?(params: { sessionKey: string; reason?: string }): Promise<{ accepted: boolean }>;
  compactSession?(params: { sessionKey: string }): Promise<{ accepted: boolean }>;
  resetSession?(params: { sessionKey: string }): Promise<{ accepted: boolean }>;
  clearSession?(params: { sessionKey: string }): Promise<{ accepted: boolean }>;
  setSessionModel?(params: { sessionKey: string; model: string }): Promise<{ accepted: boolean; model: string }>;
  setConfigOption?(params: { sessionKey: string; key: string; value: string }): Promise<{ accepted: boolean }>;
}

export type AcpApprovalDecision = 'approve-once' | 'approve-session' | 'approve-prefix' | 'deny';

interface AcpApprovalProvider {
  resolveApproval?(params: {
    sessionKey?: string;
    approvalId: string;
    decision: AcpApprovalDecision;
  }): { accepted: boolean; reason?: string };
  resolveUserInput?(params: {
    sessionKey?: string;
    requestId: string;
    answers: Record<string, string[]>;
  }): { accepted: boolean; reason?: string };
}

function readAcpSessionProvider(): AcpSessionProvider | undefined {
  const host = globalThis as typeof globalThis & {
    [ACP_SESSION_PROVIDER_SYMBOL]?: AcpSessionProvider;
  };
  return host[ACP_SESSION_PROVIDER_SYMBOL];
}

function readAcpApprovalProvider(): AcpApprovalProvider | undefined {
  const host = globalThis as typeof globalThis & {
    [CODEX_ACP_APPROVAL_PROVIDER_SYMBOL]?: AcpApprovalProvider;
  };
  return host[CODEX_ACP_APPROVAL_PROVIDER_SYMBOL];
}

async function raceAcceptedResult<T extends { accepted?: boolean }>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<boolean> {
  const timeoutPromise = new Promise<{ accepted: false }>((resolve) => {
    setTimeout(() => resolve({ accepted: false }), Math.max(1, timeoutMs));
  });

  try {
    const result: T | { accepted: false } = await Promise.race([
      task,
      timeoutPromise,
    ]);
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export function inspectSessionViaProvider(sessionKey?: string): AcpSessionInspection | undefined {
  const normalized = String(sessionKey || '').trim();
  if (!normalized) return undefined;
  const provider = readAcpSessionProvider();
  return provider?.inspectSession?.(normalized);
}

function extractAgentIdFromSessionKey(sessionKey: string): string | undefined {
  const match = /^agent:([^:]+):/i.exec(sessionKey.trim());
  return match?.[1]?.trim() || undefined;
}

function resolveSessionStorePathForSession(cfg: ClawdbotConfig, sessionKey: string): string | undefined {
  const agentId = extractAgentIdFromSessionKey(sessionKey);
  if (!agentId) return undefined;
  const cfgWithSession = cfg as { session?: { store?: string }; sessions?: { store?: string } };
  return resolveStorePath(cfgWithSession.session?.store ?? cfgWithSession.sessions?.store, { agentId });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePersistedRuntimeMode(value: unknown): CodexAcpRuntimeMode {
  return String(value || '').trim() === 'pure' ? 'pure' : 'persona';
}

export async function detectAcpBindingViaSessionStore(params: {
  cfg: ClawdbotConfig;
  sessionKey?: string;
}): Promise<{ mode: AcpRuntimeMode; hasAcpBinding: boolean; hasBackup: boolean } | undefined> {
  const sessionKey = String(params.sessionKey || '').trim();
  if (!sessionKey) return undefined;
  const storePath = resolveSessionStorePathForSession(params.cfg, sessionKey);
  if (!storePath) return undefined;
  try {
    const store = loadSessionStore(storePath);
    const resolved = resolveSessionStoreEntry({ store, sessionKey });
    const entry = resolved.existing as Record<string, unknown> | undefined;
    const acp = isRecord(entry?.acp) ? entry.acp : undefined;
    const backup = isRecord(entry?.[LARK_ACP_BINDING_BACKUP_KEY]) ? entry?.[LARK_ACP_BINDING_BACKUP_KEY] : undefined;
    if (!entry || (!acp && !backup)) return undefined;
    return {
      mode: acp
        ? normalizePersistedRuntimeMode(
          acp.runtimeMode ?? (isRecord(acp.runtimeOptions) ? acp.runtimeOptions.runtimeMode : undefined),
        )
        : 'native',
      hasAcpBinding: Boolean(acp),
      hasBackup: Boolean(backup),
    };
  } catch (error) {
    log.warn(`detect acp binding failed sessionKey=${sessionKey} error=${String(error)}`);
    return undefined;
  }
}

export async function unbindAcpSessionViaSessionStore(params: {
  cfg: ClawdbotConfig;
  sessionKey?: string;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  if (!sessionKey) return false;
  const storePath = resolveSessionStorePathForSession(params.cfg, sessionKey);
  if (!storePath) return false;
  let accepted = false;
  let normalizedKey = sessionKey;
  try {
    await updateSessionStore(
      storePath,
      (store) => {
        const resolved = resolveSessionStoreEntry({ store, sessionKey });
        normalizedKey = resolved.normalizedKey;
        const entry = resolved.existing && typeof resolved.existing === 'object'
          ? { ...(resolved.existing as Record<string, unknown>) }
          : {};
        if (!isRecord(entry.acp)) {
          accepted = isRecord(entry[LARK_ACP_BINDING_BACKUP_KEY]);
          if (accepted) {
            store[normalizedKey] = entry as never;
          }
          return;
        }
        entry[LARK_ACP_BINDING_BACKUP_KEY] = entry.acp;
        delete entry.acp;
        entry.updatedAt = Date.now();
        store[normalizedKey] = entry as never;
        accepted = true;
      },
      {
        skipMaintenance: true,
        allowDropAcpMetaSessionKeys: [sessionKey, sessionKey.toLowerCase()],
      },
    );
    log.info(`acp binding unbound sessionKey=${sessionKey} accepted=${accepted}`);
    return accepted;
  } catch (error) {
    log.warn(`unbind acp binding failed sessionKey=${sessionKey} error=${String(error)}`);
    return false;
  }
}

export async function bindAcpSessionViaSessionStore(params: {
  cfg: ClawdbotConfig;
  sessionKey?: string;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  if (!sessionKey) return false;
  const storePath = resolveSessionStorePathForSession(params.cfg, sessionKey);
  if (!storePath) return false;
  let accepted = false;
  try {
    await updateSessionStore(storePath, (store) => {
      const resolved = resolveSessionStoreEntry({ store, sessionKey });
      const entry = resolved.existing && typeof resolved.existing === 'object'
        ? { ...(resolved.existing as Record<string, unknown>) }
        : {};
      if (isRecord(entry.acp)) {
        accepted = true;
        store[resolved.normalizedKey] = entry as never;
        return;
      }
      const backup = entry[LARK_ACP_BINDING_BACKUP_KEY];
      if (!isRecord(backup)) return;
      entry.acp = backup;
      delete entry[LARK_ACP_BINDING_BACKUP_KEY];
      entry.updatedAt = Date.now();
      store[resolved.normalizedKey] = entry as never;
      accepted = true;
    }, { skipMaintenance: true });
    log.info(`acp binding rebound sessionKey=${sessionKey} accepted=${accepted}`);
    return accepted;
  } catch (error) {
    log.warn(`bind acp binding failed sessionKey=${sessionKey} error=${String(error)}`);
    return false;
  }
}

export async function trySteerSessionViaProvider(params: {
  sessionKey?: string;
  prompt?: string;
  accountId?: string;
  messageId?: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  const prompt = String(params.prompt || '').trim();
  if (!sessionKey || !prompt) return false;

  const provider = readAcpSessionProvider();
  if (!provider?.trySteerSession) return false;
  return await raceAcceptedResult(
    provider.trySteerSession({
      sessionKey,
      prompt,
      accountId: params.accountId,
      messageId: params.messageId,
    }),
    params.timeoutMs ?? 1000,
  );
}

export async function getSessionConfigViaProvider(sessionKey?: string): Promise<AcpSessionConfigState | undefined> {
  const normalized = String(sessionKey || '').trim();
  if (!normalized) return undefined;
  const provider = readAcpSessionProvider();
  if (!provider?.getSessionConfig) return undefined;
  return await provider.getSessionConfig({ sessionKey: normalized });
}

export async function interruptSessionViaProvider(params: {
  sessionKey?: string;
  reason?: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  if (!sessionKey) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.interruptSession) return false;
  return await raceAcceptedResult(
    provider.interruptSession({
      sessionKey,
      reason: String(params.reason || '').trim() || undefined,
    }),
    params.timeoutMs ?? 1000,
  );
}

export async function compactSessionViaProvider(sessionKey?: string): Promise<boolean> {
  const normalized = String(sessionKey || '').trim();
  if (!normalized) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.compactSession) {
    log.warn(`compact provider missing sessionKey=${normalized}`);
    return false;
  }
  try {
    const result = await provider.compactSession({ sessionKey: normalized });
    log.info(`compact provider result sessionKey=${normalized} accepted=${Boolean(result?.accepted)}`);
    return Boolean(result?.accepted);
  } catch (error) {
    log.warn(`compact provider failed sessionKey=${normalized} error=${String(error)}`);
    return false;
  }
}

export async function resetSessionViaProvider(sessionKey?: string): Promise<boolean> {
  const normalized = String(sessionKey || '').trim();
  if (!normalized) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.resetSession) return false;
  try {
    const result = await provider.resetSession({ sessionKey: normalized });
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export const newSessionViaProvider = resetSessionViaProvider;

export async function clearSessionViaProvider(sessionKey?: string): Promise<boolean> {
  const normalized = String(sessionKey || '').trim();
  if (!normalized) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.clearSession) return false;
  try {
    const result = await provider.clearSession({ sessionKey: normalized });
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export async function setSessionModelViaProvider(params: { sessionKey?: string; model?: string }): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  const model = String(params.model || '').trim();
  if (!sessionKey || !model) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.setSessionModel) return false;
  try {
    const result = await provider.setSessionModel({ sessionKey, model });
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export async function setSessionRuntimeModeViaProvider(params: {
  sessionKey?: string;
  mode?: AcpRuntimeMode;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  const mode = params.mode;
  if (!sessionKey || !mode) return false;
  if (mode === 'native') return false;
  const provider = readAcpSessionProvider();
  if (!provider?.setConfigOption) return false;
  try {
    const result = await provider.setConfigOption({
      sessionKey,
      key: 'runtimeMode',
      value: mode,
    });
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export async function setSessionCollaborationModeViaProvider(params: {
  sessionKey?: string;
  mode?: AcpCollaborationMode;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  const mode = params.mode;
  if (!sessionKey || !mode) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.setConfigOption) return false;
  try {
    const result = await provider.setConfigOption({
      sessionKey,
      key: 'collaborationMode',
      value: mode,
    });
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export async function setSessionReasoningEffortViaProvider(params: {
  sessionKey?: string;
  effort?: AcpReasoningEffort;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  const effort = params.effort;
  if (!sessionKey || !effort) return false;
  const provider = readAcpSessionProvider();
  if (!provider?.setConfigOption) return false;
  try {
    const result = await provider.setConfigOption({
      sessionKey,
      key: 'reasoningEffort',
      value: effort,
    });
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}

export function resolvePermissionMode(config?: Pick<AcpSessionConfigState, 'currentApprovalPolicy' | 'currentSandboxMode'>): AcpPermissionMode {
  const approvalPolicy = String(config?.currentApprovalPolicy || '').trim();
  const sandboxMode = String(config?.currentSandboxMode || '').trim();
  if (approvalPolicy === 'on-request' && sandboxMode === 'workspace-write') {
    return 'default';
  }
  if (approvalPolicy === 'never' && sandboxMode === 'danger-full-access') {
    return 'full-access';
  }
  return 'custom';
}

function permissionModeToSettings(mode: AcpPermissionMode): { approvalPolicy: string; sandboxMode: string } | undefined {
  if (mode === 'default') {
    return {
      approvalPolicy: 'on-request',
      sandboxMode: 'workspace-write',
    };
  }
  if (mode === 'full-access') {
    return {
      approvalPolicy: 'never',
      sandboxMode: 'danger-full-access',
    };
  }
  return undefined;
}

export async function setSessionPermissionModeViaProvider(params: {
  sessionKey?: string;
  mode?: AcpPermissionMode;
}): Promise<boolean> {
  const sessionKey = String(params.sessionKey || '').trim();
  const mode = params.mode;
  if (!sessionKey || !mode || mode === 'custom') return false;
  const provider = readAcpSessionProvider();
  if (!provider?.setConfigOption || !provider.getSessionConfig) return false;
  const settings = permissionModeToSettings(mode);
  if (!settings) return false;
  try {
    const currentConfig = await provider.getSessionConfig({ sessionKey });
    const previousApprovalPolicy = String(currentConfig?.currentApprovalPolicy || '').trim();
    const previousSandboxMode = String(currentConfig?.currentSandboxMode || '').trim();
    if (!previousApprovalPolicy || !previousSandboxMode) return false;
    const approvalPolicyResult = await provider.setConfigOption({
      sessionKey,
      key: 'approvalPolicy',
      value: settings.approvalPolicy,
    });
    if (!approvalPolicyResult?.accepted) return false;
    const sandboxModeResult = await provider.setConfigOption({
      sessionKey,
      key: 'sandboxMode',
      value: settings.sandboxMode,
    });
    if (sandboxModeResult?.accepted) {
      const nextConfig = await provider.getSessionConfig({ sessionKey });
      const nextApprovalPolicy = String(nextConfig?.currentApprovalPolicy || '').trim();
      const nextSandboxMode = String(nextConfig?.currentSandboxMode || '').trim();
      return nextApprovalPolicy === settings.approvalPolicy && nextSandboxMode === settings.sandboxMode;
    }
    try {
      await provider.setConfigOption({
        sessionKey,
        key: 'approvalPolicy',
        value: previousApprovalPolicy,
      });
    } catch {
      log.warn(`permission mode rollback failed sessionKey=${sessionKey} mode=${mode}`);
    }
    return false;
  } catch {
    return false;
  }
}

export function resolveAcpApprovalViaProvider(params: {
  sessionKey?: string;
  approvalId?: string;
  decision: AcpApprovalDecision;
}): boolean {
  const approvalId = String(params.approvalId || '').trim();
  if (!approvalId) return false;
  const provider = readAcpApprovalProvider();
  if (!provider?.resolveApproval) return false;
  try {
    const result = provider.resolveApproval({
      sessionKey: String(params.sessionKey || '').trim() || undefined,
      approvalId,
      decision: params.decision,
    });
    return Boolean(result?.accepted);
  } catch (error) {
    log.warn(`approval resolve failed approvalId=${approvalId} decision=${params.decision} error=${String(error)}`);
    return false;
  }
}

export function resolveAcpUserInputViaProvider(params: {
  sessionKey?: string;
  requestId?: string;
  answers: Record<string, string[]>;
}): boolean {
  const requestId = String(params.requestId || '').trim();
  if (!requestId) return false;
  const provider = readAcpApprovalProvider();
  if (!provider?.resolveUserInput) return false;
  try {
    const result = provider.resolveUserInput({
      sessionKey: String(params.sessionKey || '').trim() || undefined,
      requestId,
      answers: params.answers,
    });
    return Boolean(result?.accepted);
  } catch (error) {
    log.warn(`user input resolve failed requestId=${requestId} error=${String(error)}`);
    return false;
  }
}
