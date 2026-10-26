import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ShoppingEvents } from './shopping-events';
import { SessionState } from '../../core/services/session-state';
const fake = vi.hoisted(() => {
  const handlers: Record<string, (...args: string[]) => void> = {};
  const connection = {
    state: 'Disconnected',
    start: vi.fn(),
    stop: vi.fn(),
    invoke: vi.fn(),
    on: (name: string, handler: (...args: string[]) => void) => {
      handlers[name] = handler;
    },
    onreconnected: (handler: () => void) => {
      handlers['reconnected'] = handler;
    },
  };
  const withUrl = vi.fn();
  return { handlers, connection, withUrl };
});
vi.mock('@microsoft/signalr', () => ({
  HttpTransportType: { LongPolling: 4 },
  LogLevel: { None: 6 },
  HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  HubConnectionBuilder: class {
    withUrl(...args: unknown[]) {
      fake.withUrl(...args);
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      return fake.connection;
    }
  },
}));
describe('Shopping invalidations', () => {
  beforeEach(() => {
    fake.connection.state = 'Disconnected';
    fake.connection.start.mockReset().mockImplementation(async () => {
      fake.connection.state = 'Connected';
    });
    fake.connection.stop.mockReset().mockResolvedValue(undefined);
    fake.connection.invoke.mockReset().mockResolvedValue(undefined);
    fake.withUrl.mockClear();
    TestBed.configureTestingModule({ providers: [ShoppingEvents] });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('uses authenticated same-origin header transport and resubscribes after reconnect', async () => {
    const events = TestBed.inject(ShoppingEvents),
      changed = vi.fn();
    events.start(changed, () => {});
    events.watch(['list']);
    await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Watch', 'list'));
    expect(fake.withUrl).toHaveBeenCalledWith(
      '/api/shopping-events',
      expect.objectContaining({
        headers: { 'X-RecipeAtlas': '1' },
        transport: 4,
        withCredentials: true,
      }),
    );
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    changed.mockClear();
    fake.handlers['Changed']('list');
    expect(changed).toHaveBeenCalledTimes(1);
    fake.handlers['reconnected']();
    await vi.waitFor(() =>
      expect(fake.connection.invoke.mock.calls.filter((c) => c[0] === 'Watch')).toHaveLength(2),
    );
    expect(changed).toHaveBeenCalledTimes(2);
  });
  it('unwatches removed lists and ignores notifications after account switch', async () => {
    const events = TestBed.inject(ShoppingEvents),
      changed = vi.fn(),
      lost = vi.fn();
    events.start(changed, lost);
    events.watch(['list']);
    await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Watch', 'list'));
    events.watch([]);
    await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Unwatch', 'list'));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    changed.mockClear();
    TestBed.inject(SessionState).clear('login');
    fake.handlers['Changed']('list');
    fake.handlers['AccessLost']('list');
    expect(changed).not.toHaveBeenCalled();
    expect(lost).not.toHaveBeenCalled();
    expect(fake.connection.stop).toHaveBeenCalled();
  });
});
