import { ApplicationRef, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter, take } from 'rxjs';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}
@Injectable({ providedIn: 'root' })
export class PwaService {
  readonly offline = signal(!navigator.onLine);
  readonly connectionFailed = signal(false);
  readonly writes = signal(0);
  readonly update = signal<'ready' | 'broken' | null>(null);
  readonly installed = signal(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  readonly instructions = signal(false);
  private prompt: InstallPrompt | null = null;
  constructor() {
    const destroy = inject(DestroyRef);
    const listen = (name: string, fn: EventListener) => {
      window.addEventListener(name, fn);
      destroy.onDestroy(() => window.removeEventListener(name, fn));
    };
    listen('offline', () => this.offline.set(true));
    listen('online', () => this.offline.set(false));
    listen('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.prompt = event as InstallPrompt;
    });
    listen('appinstalled', () => {
      this.installed.set(true);
      this.prompt = null;
    });
    const sw = inject(SwUpdate, { optional: true });
    if (!sw?.isEnabled) return;
    sw.versionUpdates.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'VERSION_READY') this.update.set('ready');
    });
    sw.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.update.set('broken'));
    inject(ApplicationRef)
      .isStable.pipe(filter(Boolean), take(1), takeUntilDestroyed())
      .subscribe(() => {
        const check = () => {
          if (document.visibilityState === 'visible') void sw.checkForUpdate().catch(() => {});
        };
        check();
        const timer = setInterval(check, 6 * 60 * 60 * 1000);
        destroy.onDestroy(() => clearInterval(timer));
      });
  }
  async install() {
    if (!this.prompt) {
      this.instructions.set(!this.instructions());
      return;
    }
    const prompt = this.prompt;
    this.prompt = null;
    try {
      await prompt.prompt();
    } catch {
      this.instructions.set(true);
    }
  }
}
