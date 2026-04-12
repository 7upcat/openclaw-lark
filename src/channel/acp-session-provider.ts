/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { larkLogger } from '../core/lark-logger';

const ACP_SESSION_PROVIDER_SYMBOL = Symbol.for('openclaw.acp.session-continuation-provider');
const log = larkLogger('channel/acp-session-provider');

export type AcpSessionInspection = {
  sessionKey: string;
  exists: boolean;
  hasActiveTurn: boolean;
  queued: boolean;
  threadId?: string;
  turnId?: string;
  lastStatus?: string;
};

export type AcpSessionConfigState = {
  sessionKey: string;
  exists: boolean;
  hasActiveTurn: boolean;
  queued: boolean;
  currentModel?: string;
  availableModels: string[];
};

type AcpSessionProvider = {
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
  setSessionModel?(params: { sessionKey: string; model: string }): Promise<{ accepted: boolean; model: string }>;
};

function readAcpSessionProvider(): AcpSessionProvider | undefined {
  const host = globalThis as typeof globalThis & {
    [ACP_SESSION_PROVIDER_SYMBOL]?: AcpSessionProvider;
  };
  return host[ACP_SESSION_PROVIDER_SYMBOL];
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
