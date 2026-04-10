import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { hasActiveTaskMock } = vi.hoisted(() => ({
  hasActiveTaskMock: vi.fn<(key: string) => boolean>(),
}));

vi.mock('../src/channel/chat-queue', () => ({
  hasActiveTask: hasActiveTaskMock,
}));

import {
  _resetSessionPendingQueueState,
  enqueueSessionPendingMessage,
} from '../src/channel/session-pending-queue';

describe('session pending queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    _resetSessionPendingQueueState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches immediately when no active actor exists', async () => {
    hasActiveTaskMock.mockReturnValue(false);
    const dispatchNow = vi.fn();

    const { status } = enqueueSessionPendingMessage({
      sessionKey: 's1',
      dispatchNow,
    });

    expect(status).toBe('immediate');
    await vi.runAllTimersAsync();
    expect(dispatchNow).toHaveBeenCalledTimes(1);
  });

  it('removes the queue head when steer succeeds while actor is active', async () => {
    hasActiveTaskMock.mockReturnValue(true);
    const dispatchNow = vi.fn();
    const trySteer = vi.fn().mockResolvedValue(true);
    const onSteerSuccess = vi.fn().mockResolvedValue(undefined);

    const { status } = enqueueSessionPendingMessage({
      sessionKey: 's2',
      dispatchNow,
      trySteer,
      onSteerSuccess,
    });

    expect(status).toBe('queued');
    await vi.advanceTimersByTimeAsync(120);
    await Promise.resolve();

    expect(dispatchNow).not.toHaveBeenCalled();
    expect(trySteer).toHaveBeenCalledTimes(1);
    expect(onSteerSuccess).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying steer until the actor becomes idle, then dispatches a new turn', async () => {
    let active = true;
    hasActiveTaskMock.mockImplementation(() => active);
    const dispatchNow = vi.fn();
    const trySteer = vi.fn().mockResolvedValue(false);

    enqueueSessionPendingMessage({
      sessionKey: 's3',
      dispatchNow,
      trySteer,
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(trySteer.mock.calls.length).toBeGreaterThan(0);
    expect(dispatchNow).not.toHaveBeenCalled();

    active = false;
    await vi.advanceTimersByTimeAsync(300);

    expect(dispatchNow).toHaveBeenCalledTimes(1);
  });
});
