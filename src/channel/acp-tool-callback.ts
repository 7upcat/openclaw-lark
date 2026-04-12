/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import type { AcpToolCallbackEvent } from '../card/reply-dispatcher-types';
import { larkLogger } from '../core/lark-logger';

const ACP_SESSION_LISTENER_SYMBOL = Symbol.for('openclaw.acp.session-listener');
const ACP_TOOL_CALLBACK_TTL_MS = 10 * 60 * 1000;

const log = larkLogger('channel/acp-tool-callback');
const activeCallbacks = new Map<string, (reason?: string) => void>();

type AcpSessionEvent = AcpToolCallbackEvent | { type: string; sessionKey?: string };

type AcpSessionListenerRegistrar = (
  sessionKey: string,
  listener: (event: AcpSessionEvent) => void | Promise<void>,
) => () => void;

function isAcpToolCallbackEvent(event: AcpSessionEvent): event is AcpToolCallbackEvent {
  return event.type === 'tool_call';
}

function readAcpSessionListenerRegistrar(): AcpSessionListenerRegistrar | undefined {
  const host = globalThis as typeof globalThis & {
    [ACP_SESSION_LISTENER_SYMBOL]?: AcpSessionListenerRegistrar;
  };
  return host[ACP_SESSION_LISTENER_SYMBOL];
}

export function registerCodexAcpToolCallback(
  sessionKey: string,
  listener: (event: AcpToolCallbackEvent) => void | Promise<void>,
): (() => void) | undefined {
  const registrar = readAcpSessionListenerRegistrar();
  if (!registrar) return undefined;

  activeCallbacks.get(sessionKey)?.();

  let disposed = false;
  // Keep mutable handles on a shared object so dispose() always sees the latest
  // registrar unsubscribe function and TTL timer even if it runs before assignment.
  const state: { unregister?: () => void; ttl?: ReturnType<typeof setTimeout> } = {};

  const dispose = (reason = 'manual') => {
    if (disposed) return;
    disposed = true;
    if (state.ttl) clearTimeout(state.ttl);
    log.debug('codex acp tool callback disposed', { sessionKey, reason });
    state.unregister?.();
    if (activeCallbacks.get(sessionKey) === dispose) {
      activeCallbacks.delete(sessionKey);
    }
  };

  state.ttl = setTimeout(() => dispose('ttl'), ACP_TOOL_CALLBACK_TTL_MS);

  state.unregister = registrar(sessionKey, async (event) => {
    if (event.type === 'done' || event.type === 'error') {
      dispose(event.type);
      return;
    }
    if (!isAcpToolCallbackEvent(event)) return;
    await listener(event);
  });

  log.debug('codex acp tool callback registered', { sessionKey });
  activeCallbacks.set(sessionKey, dispose);
  return () => dispose('manual');
}
