import { Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { AccountAdminService } from '../../core/services/account-admin.service';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-invitation-page',
  standalone: false,
  templateUrl: './invitation-page.component.html',
  styleUrl: './accounts.scss',
})
export class InvitationPageComponent {
  private readonly api = inject(AccountAdminService);
  private readonly route = inject(ActivatedRoute);
  private token = new URLSearchParams(this.route.snapshot.fragment ?? '').get('token') ?? '';
  readonly status = signal('Loading');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/)]],
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(256)]],
  });
  constructor() {
    inject(Location).replaceState('/invite');
    void this.validate();
  }
  async validate() {
    if (!this.token) {
      this.status.set('Invalid');
      return;
    }
    try {
      this.status.set((await this.api.validate(this.token)).status);
    } catch (error) {
      this.status.set('Invalid');
      this.error.set(errorMessage(error));
    }
  }
  async accept() {
    if (this.form.invalid || this.busy() || this.status() !== 'Pending') {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const value = this.form.getRawValue();
      await this.api.redeem(this.token, value.username, value.displayName, value.password);
      this.token = '';
      this.form.reset();
      this.status.set('Created');
    } catch (error) {
      this.error.set(errorMessage(error));
      await this.validate();
    } finally {
      this.busy.set(false);
    }
  }
}
