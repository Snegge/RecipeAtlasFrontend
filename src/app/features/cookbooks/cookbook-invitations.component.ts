import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookService } from '../../core/services/cookbook.service';
import { SessionState } from '../../core/services/session-state';
import { CookbookInvitationResponse } from '../../core/models/account.model';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-cookbook-invitations',
  standalone: false,
  templateUrl: './cookbook-invitations.component.html',
  styleUrl: './cookbooks.scss',
})
export class CookbookInvitationsComponent {
  private readonly books = inject(CookbookService);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  readonly invitations = signal<CookbookInvitationResponse[]>([]);
  readonly busy = signal<string | null>(null);
  readonly error = signal('');
  readonly changed = output<void>();
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.invitations.set([]);
      this.error.set('');
    });
    void this.load();
  }
  async load() {
    const epoch = this.session.epoch();
    try {
      const invitations = await this.books.invitations();
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.invitations.set(invitations.slice(0, 5));
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.error.set(errorMessage(e));
    }
  }
  async respond(invitation: CookbookInvitationResponse, accept: boolean) {
    if (this.busy()) return;
    const epoch = this.session.epoch();
    this.busy.set(invitation.id);
    this.error.set('');
    try {
      await this.books.respond(invitation.id, accept);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.invitations.update((items) => items.filter((x) => x.id !== invitation.id));
      this.changed.emit();
      await this.load();
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed) {
        this.error.set(errorMessage(e));
        await this.load();
      }
    } finally {
      this.busy.set(null);
    }
  }
}
