/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

const SESSION_CONTINUATION_PROVIDER_SYMBOL = Symbol.for('openclaw.acp.session-continuation-provider');

type SessionContinuationProvider = {
  trySteerSession?(params: {
    sessionKey: string;
    prompt: string;
    accountId?: string;
    messageId?: string;
  }): Promise<{ accepted: boolean; threadId?: string; turnId?: string }>;
};

function readSessionContinuationProvider(): SessionContinuationProvider | undefined {
  const host = globalThis as typeof globalThis & {
    [SESSION_CONTINUATION_PROVIDER_SYMBOL]?: SessionContinuationProvider;
  };
  return host[SESSION_CONTINUATION_PROVIDER_SYMBOL];
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

  const provider = readSessionContinuationProvider();
  if (!provider?.trySteerSession) return false;

  const timeoutMs = Math.max(1, params.timeoutMs ?? 1000);
  const timeoutPromise = new Promise<{ accepted: false }>((resolve) => {
    setTimeout(() => resolve({ accepted: false }), timeoutMs);
  });

  try {
    const result = await Promise.race([
      provider.trySteerSession({
        sessionKey,
        prompt,
        accountId: params.accountId,
        messageId: params.messageId,
      }),
      timeoutPromise,
    ]);
    return Boolean(result?.accepted);
  } catch {
    return false;
  }
}
