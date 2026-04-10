/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { hasActiveTask } from './chat-queue';

type QueueStatus = 'queued' | 'immediate';

type PendingSessionEntry = {
  dispatchNow: () => void;
  trySteer?: () => Promise<boolean>;
  onSteerSuccess?: () => Promise<void>;
  steerRetryDelayMs: number;
};

const pendingBySession = new Map<string, PendingSessionEntry[]>();
const activeDrains = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForActorLock(sessionKey: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!hasActiveTask(sessionKey)) {
      return true;
    }
    await sleep(20);
  }
  return !hasActiveTask(sessionKey);
}

async function drainSessionQueue(sessionKey: string): Promise<void> {
  if (activeDrains.has(sessionKey)) return;
  activeDrains.add(sessionKey);
  try {
    for (;;) {
      const queue = pendingBySession.get(sessionKey);
      const head = queue?.[0];
      if (!head) {
        pendingBySession.delete(sessionKey);
        return;
      }

      const acquired = await waitForActorLock(sessionKey, 100);
      if (acquired) {
        queue!.shift();
        if (!queue!.length) {
          pendingBySession.delete(sessionKey);
        }
        head.dispatchNow();
        continue;
      }

      if (head.trySteer) {
        try {
          const steered = await head.trySteer();
          if (steered) {
            queue!.shift();
            if (!queue!.length) {
              pendingBySession.delete(sessionKey);
            }
            await head.onSteerSuccess?.();
            continue;
          }
        } catch {
          // steer failures are intentionally ignored; the queue head stays put
        }
      }

      await sleep(head.steerRetryDelayMs);
    }
  } finally {
    activeDrains.delete(sessionKey);
    if ((pendingBySession.get(sessionKey)?.length || 0) > 0) {
      void drainSessionQueue(sessionKey);
    }
  }
}

export function enqueueSessionPendingMessage(params: {
  sessionKey: string;
  dispatchNow: () => void;
  trySteer?: () => Promise<boolean>;
  onSteerSuccess?: () => Promise<void>;
  steerRetryDelayMs?: number;
}): { status: QueueStatus } {
  const { sessionKey, dispatchNow, trySteer, onSteerSuccess } = params;
  const steerRetryDelayMs = Math.max(1, params.steerRetryDelayMs ?? 500);
  const queue = pendingBySession.get(sessionKey) ?? [];
  const status: QueueStatus = !queue.length && !hasActiveTask(sessionKey) ? 'immediate' : 'queued';
  queue.push({ dispatchNow, trySteer, onSteerSuccess, steerRetryDelayMs });
  pendingBySession.set(sessionKey, queue);
  void drainSessionQueue(sessionKey);
  return { status };
}

export function _resetSessionPendingQueueState(): void {
  pendingBySession.clear();
  activeDrains.clear();
}
