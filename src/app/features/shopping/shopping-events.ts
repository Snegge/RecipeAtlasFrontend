import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
  LogLevel,
} from '@microsoft/signalr';
import { SessionState } from '../../core/services/session-state';

@Injectable()
export class ShoppingEvents {
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly epoch = this.session.epoch();
  // Browser WebSockets cannot carry the required write header; SignalR long polling can.
  private readonly connection = new HubConnectionBuilder()
    .withUrl('/api/shopping-events', {
      headers: { 'X-RecipeAtlas': '1' },
      transport: HttpTransportType.LongPolling,
      withCredentials: true,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.None)
    .build();
  private desired = new Set<string>();
  private watched = new Set<string>();
  private connecting = false;
  private syncing = false;
  private stopped = false;
  private changed = () => {};
  private lost = (_id: string) => {};
  constructor() {
    this.connection.on('Changed', (id: string) => {
      if (this.live() && this.desired.has(id)) this.changed();
    });
    this.connection.on('AccessLost', (id: string) => {
      if (!this.live()) return;
      this.desired.delete(id);
      this.watched.delete(id);
      this.lost(id);
    });
    this.connection.onreconnected(() => {
      if (!this.live()) return;
      this.watched = new Set();
      void this.sync();
      this.changed();
    });
    const restart = () => {
      if (document.visibilityState === 'visible' && this.live()) void this.connect();
    };
    const timer = setInterval(restart, 30000);
    window.addEventListener('focus', restart);
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => this.stop());
    this.destroy.onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('focus', restart);
      this.stop();
    });
  }
  start(changed: () => void, lost: (id: string) => void) {
    this.changed = changed;
    this.lost = lost;
    void this.connect();
  }
  watch(ids: string[]) {
    if (!this.live()) return;
    this.desired = new Set(ids);
    void this.sync();
  }
  private live() {
    return !this.stopped && !this.destroy.destroyed && this.epoch === this.session.epoch();
  }
  private stop() {
    this.stopped = true;
    this.desired.clear();
    this.watched.clear();
    void this.connection.stop().catch(() => {});
  }
  private async connect() {
    if (
      !this.live() ||
      this.connecting ||
      this.connection.state !== HubConnectionState.Disconnected
    )
      return;
    this.connecting = true;
    try {
      await this.connection.start();
      if (!this.live()) {
        await this.connection.stop();
        return;
      }
      this.watched = new Set();
      await this.sync();
      if (this.live()) this.changed();
    } catch {
      // The visible-page timer retries startup; authorized GETs continue independently.
    } finally {
      this.connecting = false;
    }
  }
  private async sync() {
    if (!this.live() || this.syncing || this.connection.state !== HubConnectionState.Connected)
      return;
    this.syncing = true;
    // A reconnect replaces the set; completions from the old connection cannot confirm new watches.
    const watched = this.watched;
    let failed = false;
    try {
      for (const id of this.watched) {
        if (this.desired.has(id)) continue;
        await this.connection.invoke('Unwatch', id);
        if (!this.live() || watched !== this.watched) return;
        this.watched.delete(id);
      }
      for (const id of this.desired) {
        if (this.watched.has(id)) continue;
        await this.connection.invoke('Watch', id);
        if (!this.live() || watched !== this.watched) return;
        this.watched.add(id);
      }
    } catch {
      failed = true;
    } finally {
      this.syncing = false;
      if (
        (!failed || watched !== this.watched) &&
        this.live() &&
        (this.desired.size !== this.watched.size ||
          [...this.desired].some((id) => !this.watched.has(id)))
      )
        void this.sync();
    }
  }
}
