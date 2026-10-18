import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionState } from '../../core/services/session-state';
import { preparePhoto } from '../../core/utils/photo';
import { errorMessage } from '../../core/utils/api-error';
// Component-scoped local picture selection. No HTTP calls or shared editor state.
@Injectable()
export class PictureSelection {
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private objectUrl: string | null = null;
  readonly preview = signal<string | null>(null);
  readonly preparing = signal(false);
  readonly error = signal('');
  readonly changed = signal(false);
  blob: Blob | null = null;
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => this.clear());
    this.destroy.onDestroy(() => this.clear());
  }
  load(url: string | null) {
    this.clear();
    this.preview.set(url);
  }
  async choose(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.preparing()) return;
    const epoch = this.session.epoch();
    this.preparing.set(true);
    this.error.set('');
    try {
      const blob = await preparePhoto(file);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.release();
      this.blob = blob;
      this.objectUrl = URL.createObjectURL(blob);
      this.preview.set(this.objectUrl);
      this.changed.set(true);
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.error.set(errorMessage(e));
    } finally {
      if (epoch === this.session.epoch() && !this.destroy.destroyed) this.preparing.set(false);
    }
  }
  remove() {
    if (this.preparing()) return;
    this.release();
    this.blob = null;
    this.preview.set(null);
    this.changed.set(true);
    this.error.set('');
  }
  committed() {
    this.blob = null;
    this.changed.set(false);
  }
  private release() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
  clear() {
    this.release();
    this.blob = null;
    this.preview.set(null);
    this.preparing.set(false);
    this.error.set('');
    this.changed.set(false);
  }
}
