import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { ShoppingEvents } from './shopping-events';
import { SessionState } from '../../core/services/session-state';
const fake = vi.hoisted(() => {
  // Angular shares module caches between specs; bind ShoppingEvents to this spec's SignalR mock.
  vi.resetModules();
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
      fake.connection.state = 'Connecting';
      await Promise.resolve();
      fake.connection.state = 'Connected';
    });
    fake.connection.stop.mockReset().mockImplementation(async () => {
      fake.connection.state = 'Disconnected';
    });
    fake.connection.invoke.mockReset().mockResolvedValue(undefined);
    fake.withUrl.mockClear();
    TestBed.configureTestingModule({ providers: [ShoppingEvents] });
  });
  afterEach(() => TestBed.resetTestingModule());
  afterAll(() => vi.resetModules());
  it('subscribes to the latest desired lists once delayed startup completes', async () => {
    let connected!: () => void;
    fake.connection.start.mockImplementationOnce(async () => {
      fake.connection.state = 'Connecting';
      await new Promise<void>((resolve) => (connected = resolve));
      fake.connection.state = 'Connected';
    });
    const events = TestBed.inject(ShoppingEvents),
      changed = vi.fn();
    events.watch(['old']);
    events.start(changed, () => {});
    events.start(changed, () => {});
    events.watch(['list']);
    expect(fake.connection.start).toHaveBeenCalledTimes(1);
    expect(fake.connection.invoke).not.toHaveBeenCalled();
    connected();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    events.watch(['list']);
    expect(fake.connection.invoke.mock.calls).toEqual([['Watch', 'list']]);
  });
  it.each(['account switch', 'destruction'])(
    'ignores startup completing after %s',
    async (reason) => {
      let connected!: () => void;
      fake.connection.start.mockImplementationOnce(async () => {
        fake.connection.state = 'Connecting';
        await new Promise<void>((resolve) => (connected = resolve));
        fake.connection.state = 'Connected';
      });
      const events = TestBed.inject(ShoppingEvents),
        changed = vi.fn(),
        lost = vi.fn();
      events.start(changed, lost);
      events.watch(['list']);
      if (reason === 'account switch') TestBed.inject(SessionState).clear('login');
      else TestBed.resetTestingModule();
      connected();
      await vi.waitFor(() => expect(fake.connection.stop).toHaveBeenCalledTimes(2));
      fake.handlers['Changed']('list');
      fake.handlers['AccessLost']('list');
      fake.handlers['reconnected']();
      events.watch(['list']);
      events.start(changed, lost);
      expect(fake.connection.invoke).not.toHaveBeenCalled();
      expect(fake.connection.start).toHaveBeenCalledTimes(1);
      expect(changed).not.toHaveBeenCalled();
      expect(lost).not.toHaveBeenCalled();
    },
  );
  it.each(['account switch', 'destruction'])(
    'ignores a pending Watch completing after %s',
    async (reason) => {
      let subscribed!: () => void;
      const pending = new Promise<void>((resolve) => (subscribed = resolve));
      fake.connection.invoke.mockReturnValueOnce(pending);
      const events = TestBed.inject(ShoppingEvents),
        changed = vi.fn();
      events.start(changed, () => {});
      events.watch(['list', 'other']);
      await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Watch', 'list'));
      if (reason === 'account switch') TestBed.inject(SessionState).clear('login');
      else TestBed.resetTestingModule();
      subscribed();
      await pending;
      // Let sync() and its connect() caller finish their continuations.
      await Promise.resolve();
      await Promise.resolve();
      expect(fake.connection.invoke.mock.calls).toEqual([['Watch', 'list']]);
      expect(changed).not.toHaveBeenCalled();
    },
  );
  it.each(['resolve', 'reject'])(
    'restores subscriptions when reconnect overlaps a pending Watch (%s)',
    async (outcome) => {
      let subscribed!: () => void;
      fake.connection.invoke.mockImplementationOnce(
        () =>
          new Promise<void>(
            (resolve, reject) =>
              (subscribed =
                outcome === 'resolve' ? resolve : () => reject(new Error('Disconnected'))),
          ),
      );
      const events = TestBed.inject(ShoppingEvents);
      events.start(
        () => {},
        () => {},
      );
      events.watch(['list']);
      await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Watch', 'list'));
      fake.connection.state = 'Reconnecting';
      events.watch(['list', 'other']);
      fake.connection.state = 'Connected';
      fake.handlers['reconnected']();
      subscribed();
      await vi.waitFor(() =>
        expect(fake.connection.invoke.mock.calls).toEqual([
          ['Watch', 'list'],
          ['Watch', 'list'],
          ['Watch', 'other'],
        ]),
      );
    },
  );
  it('reconciles desired lists changed while Watch and Unwatch are pending', async () => {
    let subscribed!: () => void, unwatched!: () => void;
    const pendingWatch = new Promise<void>((resolve) => (subscribed = resolve));
    const pendingUnwatch = new Promise<void>((resolve) => (unwatched = resolve));
    fake.connection.invoke.mockReturnValueOnce(pendingWatch).mockReturnValueOnce(pendingUnwatch);
    const events = TestBed.inject(ShoppingEvents);
    events.start(
      () => {},
      () => {},
    );
    events.watch(['old']);
    await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Watch', 'old'));
    events.watch(['intermediate']);
    subscribed();
    await vi.waitFor(() => expect(fake.connection.invoke).toHaveBeenCalledWith('Unwatch', 'old'));
    events.watch(['list']);
    unwatched();
    await vi.waitFor(() =>
      expect(fake.connection.invoke.mock.calls).toEqual([
        ['Watch', 'old'],
        ['Unwatch', 'old'],
        ['Watch', 'list'],
      ]),
    );
  });
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
