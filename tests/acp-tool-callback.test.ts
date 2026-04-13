import { beforeEach, describe, expect, it, vi } from 'vitest';

const listenerSymbol = Symbol.for('openclaw.acp.session-listener');

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { registerAcpSessionCallback } from '../src/channel/acp-tool-callback';

type TestEvent = {
  type: string;
  sessionKey: string;
  turnId?: string;
  text?: string;
};

describe('ACP session callback registration', () => {
  beforeEach(() => {
    delete (globalThis as typeof globalThis & { [listenerSymbol]?: unknown })[listenerSymbol];
    vi.clearAllMocks();
  });

  it('keeps same-session callbacks independent across overlapping turns', async () => {
    const listeners: Array<(event: TestEvent) => void | Promise<void>> = [];
    (globalThis as typeof globalThis & { [listenerSymbol]?: unknown })[listenerSymbol] = (
      _sessionKey: string,
      listener: (event: TestEvent) => void | Promise<void>,
    ) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    };

    const first = vi.fn();
    const second = vi.fn();

    const disposeFirst = registerAcpSessionCallback('session-1', first);
    expect(disposeFirst).toBeDefined();
    expect(listeners).toHaveLength(1);

    await listeners[0]?.({ type: 'tool_call', sessionKey: 'session-1', turnId: 'turn-a', text: 'read' });
    expect(first).toHaveBeenCalledTimes(1);

    const disposeSecond = registerAcpSessionCallback('session-1', second);
    expect(disposeSecond).toBeDefined();
    expect(listeners).toHaveLength(2);

    await listeners[1]?.({ type: 'done', sessionKey: 'session-1', turnId: 'turn-a' });
    expect(listeners).toHaveLength(2);

    await listeners[1]?.({ type: 'tool_call', sessionKey: 'session-1', turnId: 'turn-b', text: 'grep' });
    expect(second).toHaveBeenCalledTimes(1);

    disposeFirst?.();
    disposeSecond?.();
    expect(listeners).toHaveLength(0);
  });

  it('disposes only the callback bound to the completed turn', async () => {
    const listeners: Array<(event: TestEvent) => void | Promise<void>> = [];
    (globalThis as typeof globalThis & { [listenerSymbol]?: unknown })[listenerSymbol] = (
      _sessionKey: string,
      listener: (event: TestEvent) => void | Promise<void>,
    ) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    };

    registerAcpSessionCallback('session-1', vi.fn());
    registerAcpSessionCallback('session-1', vi.fn());
    expect(listeners).toHaveLength(2);

    await listeners[0]?.({ type: 'tool_call', sessionKey: 'session-1', turnId: 'turn-a', text: 'read' });
    await listeners[1]?.({ type: 'tool_call', sessionKey: 'session-1', turnId: 'turn-b', text: 'grep' });
    await listeners[0]?.({ type: 'done', sessionKey: 'session-1', turnId: 'turn-a' });

    expect(listeners).toHaveLength(1);
  });
});
