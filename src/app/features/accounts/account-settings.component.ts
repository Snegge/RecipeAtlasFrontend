import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionState } from '../../core/services/session-state';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-account-settings',
  standalone: false,
  templateUrl: './account-settings.component.html',
  styleUrl: './accounts.scss',
})
export class AccountSettingsComponent {
  readonly auth = inject(AuthService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(256)]],
  });
  constructor() {
    inject(SessionState)
      .changes.pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.form.reset();
        this.error.set('');
        this.success.set('');
      });
  }
  async save() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const v = this.form.getRawValue();
      await this.auth.changePassword(v.currentPassword, v.newPassword);
      this.form.reset();
      this.success.set('Password changed. Other sessions have been signed out.');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
