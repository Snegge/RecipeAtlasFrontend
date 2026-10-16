import { Injectable, inject, signal, computed } from '@angular/core';
import { Subject } from 'rxjs';
import { CurrentUserResponse } from '../models/account.model';
import { RecipeDraftService } from './recipe-draft.service';
export type SessionChange = 'login' | 'logout' | 'expired';

// The sole owner of current-user state and request generation. No browser token storage.
@Injectable({ providedIn: 'root' })
export class SessionState {
  readonly user = signal<CurrentUserResponse | null>(null);
  readonly signedIn = computed(() => this.user() !== null);
  readonly epoch = signal(0);
  readonly changes = new Subject<SessionChange>();
  private readonly drafts = inject(RecipeDraftService);
  clear(reason: SessionChange): void {
    if (reason === 'expired' && !this.user()) return;
    this.user.set(null);
    this.epoch.update((value) => value + 1);
    this.drafts.clear();
    this.changes.next(reason);
  }
}
