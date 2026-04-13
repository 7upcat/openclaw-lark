/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import type { AcpToolCallbackEvent } from '../card/reply-dispatcher-types';
import { larkLogger } from '../core/lark-logger';

const ACP_SESSION_LISTENER_SYMBOL = Symbol.for('openclaw.acp.session-listener');
const ACP_TOOL_CALLBACK_TTL_MS = 10 * 60 * 1000;

const log = larkLogger('channel/acp-tool-callback');
let callbackSeq = 0;

type AcpSessionEvent =
  | AcpToolCallbackEvent
  | AcpApprovalRequestedCallbackEvent
  | AcpTurnCompletedCallbackEvent
  | { type: string; sessionKey?: string };
export interface AcpApprovalRequestedCallbackEvent {
  type: 'approval_requested';
  sessionKey: string;
  approvalId: string;
  kind: 'command' | 'file_change' | 'permissions' | 'mcp_tool_call';
  method: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  reason?: string;
  command?: string;
  cwd?: string;
  grantRoot?: string;
  permissions?: Record<string, unknown>;
  availableDecisions?: unknown[];
  proposedExecpolicyAmendment?: string[];
  mcpServerName?: string;
  mcpMessage?: string;
  mcpToolTitle?: string;
  mcpToolDescription?: string;
  mcpToolParams?: Record<string, unknown>;
}
export interface AcpUserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: Array<{ label: string; description?: string }> | null;
}
export interface AcpUserInputRequestedCallbackEvent {
  type: 'user_input_requested';
  sessionKey: string;
  requestId: string;
  method: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  questions: AcpUserInputQuestion[];
}
export interface AcpTurnCompletedCallbackEvent {
  type: 'turn_completed';
  sessionKey: string;
  threadId?: string;
  turnId?: string;
  status?: string;
  durationMs?: number;
}
export type AcpSessionCallbackEvent =
  | AcpToolCallbackEvent
  | AcpApprovalRequestedCallbackEvent
  | AcpUserInputRequestedCallbackEvent
  | AcpTurnCompletedCallbackEvent;

type AcpSessionListenerRegistrar = (
  sessionKey: string,
  listener: (event: AcpSessionEvent) => void | Promise<void>,
) => () => void;

function isAcpSessionCallbackEvent(event: AcpSessionEvent): event is AcpSessionCallbackEvent {
  return event.type === 'tool_call' ||
    event.type === 'approval_requested' ||
    event.type === 'user_input_requested' ||
    event.type === 'turn_completed';
}

function getEventTurnId(event: AcpSessionEvent): string | undefined {
  const turnId = (event as { turnId?: unknown }).turnId;
  return typeof turnId === 'string' && turnId.trim() ? turnId : undefined;
}

function readAcpSessionListenerRegistrar(): AcpSessionListenerRegistrar | undefined {
  const host = globalThis as typeof globalThis & {
    [ACP_SESSION_LISTENER_SYMBOL]?: AcpSessionListenerRegistrar;
  };
  return host[ACP_SESSION_LISTENER_SYMBOL];
}

export function registerAcpSessionCallback(
  sessionKey: string,
  listener: (event: AcpSessionCallbackEvent) => void | Promise<void>,
): (() => void) | undefined {
  const registrar = readAcpSessionListenerRegistrar();
  if (!registrar) return undefined;

  let disposed = false;
  let observedTurnId: string | undefined;
  const callbackId = `${Date.now().toString(36)}-${(callbackSeq += 1).toString(36)}`;
  // Keep mutable handles on a shared object so dispose() always sees the latest
  // registrar unsubscribe function and TTL timer even if it runs before assignment.
  const state: { unregister?: () => void; ttl?: ReturnType<typeof setTimeout> } = {};

  const dispose = (reason = 'manual') => {
    if (disposed) return;
    disposed = true;
    if (state.ttl) clearTimeout(state.ttl);
    log.debug('acp session callback disposed', { sessionKey, callbackId, observedTurnId, reason });
    state.unregister?.();
  };

  state.ttl = setTimeout(() => dispose('ttl'), ACP_TOOL_CALLBACK_TTL_MS);

  state.unregister = registrar(sessionKey, async (event) => {
    const eventTurnId = getEventTurnId(event);
    if (event.type === 'done' || event.type === 'error') {
      if (!observedTurnId && eventTurnId) {
          log.debug('acp terminal event ignored before callback turn binding', {
          sessionKey,
          callbackId,
          eventType: event.type,
          eventTurnId,
        });
        return;
      }
      if (observedTurnId && eventTurnId && eventTurnId !== observedTurnId) {
        log.debug('acp terminal event ignored for different turn', {
          sessionKey,
          callbackId,
          eventType: event.type,
          observedTurnId,
          eventTurnId,
        });
        return;
      }
      dispose(event.type);
      return;
    }
    if (isAcpSessionCallbackEvent(event)) {
      if (eventTurnId) {
        if (observedTurnId && eventTurnId !== observedTurnId) {
          log.debug('acp callback event ignored for different turn', {
            sessionKey,
            callbackId,
            eventType: event.type,
            observedTurnId,
            eventTurnId,
          });
          return;
        }
        observedTurnId = eventTurnId;
      }
      await listener(event);
    }
  });

  log.debug('acp session callback registered', { sessionKey, callbackId });
  return () => dispose('manual');
}
