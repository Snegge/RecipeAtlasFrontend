import { Injectable, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookResponse } from '../models/account.model';
import { SessionState } from './session-state';
@Injectable({ providedIn: 'root' })
export class CookbookContext {
  readonly current = signal<CookbookResponse | null>(null);
  readonly canWrite = computed(() => ['Owner', 'Editor'].includes(this.current()?.role ?? ''));
  readonly isOwner = computed(() => this.current()?.role === 'Owner');
  constructor() {
    inject(SessionState)
      .changes.pipe(takeUntilDestroyed())
      .subscribe(() => this.current.set(null));
  }
}
