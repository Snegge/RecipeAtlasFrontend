import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AccountAdminService } from '../../core/services/account-admin.service';
import { SessionState } from '../../core/services/session-state';
import { AccountResponse, InvitationResponse } from '../../core/models/account.model';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-account-admin',
  standalone: false,
  templateUrl: './account-admin.component.html',
  styleUrl: './accounts.scss',
})
export class AccountAdminComponent {
  private readonly api = inject(AccountAdminService);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  readonly accounts = signal<AccountResponse[]>([]);
  readonly invitations = signal<InvitationResponse[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly link = signal('');
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.accounts.set([]);
      this.invitations.set([]);
      this.link.set('');
    });
    void this.load();
  }
  async load() {
    const epoch = this.session.epoch();
    this.loading.set(true);
    this.error.set('');
    try {
      const [accounts, invitations] = await Promise.all([
        this.api.accounts(),
        this.api.invitations(),
      ]);
      if (epoch === this.session.epoch() && !this.destroy.destroyed) {
        this.accounts.set(accounts);
        this.invitations.set(invitations);
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
  async invite() {
    const epoch = this.session.epoch();
    await this.act(async () => {
      const result = await this.api.invite();
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.link.set(result.link);
      this.notice.set('Copy this link now. It cannot be retrieved later.');
    });
  }
  async revoke(id: string) {
    await this.act(() => this.api.revoke(id));
  }
  async status(account: AccountResponse) {
    await this.act(() => this.api.status(account.id, !account.isActive));
  }
  private async act(action: () => Promise<unknown>) {
    if (this.busy()) return;
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      if (epoch === this.session.epoch()) await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
  async copy() {
    try {
      await navigator.clipboard.writeText(this.link());
      this.notice.set('Invitation link copied. Share it privately.');
    } catch {
      this.notice.set('Select the link and copy it manually.');
    }
  }
}
