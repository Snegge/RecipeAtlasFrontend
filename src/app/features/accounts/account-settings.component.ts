import { Component, DestroyRef, ViewChild, HostListener, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, FormGroupDirective, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionState } from '../../core/services/session-state';
import { AuthService } from '../../core/services/auth.service';
import { PictureSelection } from '../../shared/forms/picture-selection';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-account-settings',
  standalone: false,
  templateUrl: './account-settings.component.html',
  styleUrl: './accounts.scss',
  providers: [PictureSelection],
})
export class AccountSettingsComponent {
  @ViewChild('securityForm') securityForm?: FormGroupDirective;
  readonly auth = inject(AuthService);
  readonly picture = inject(PictureSelection);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly busy = signal(false);
  readonly profileBusy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly profileError = signal('');
  readonly profileSuccess = signal('');
  readonly profile = this.fb.group({
    displayName: [
      this.auth.user()?.displayName ?? '',
      [Validators.required, Validators.maxLength(100)],
    ],
    email: [
      this.auth.user()?.email ?? '',
      [Validators.required, Validators.email, Validators.maxLength(254)],
    ],
  });
  readonly form = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(256)]],
  });
  constructor() {
    this.picture.load(this.auth.user()?.avatarUrl ?? null);
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.reset();
      this.profile.reset({ displayName: '', email: '' });
      this.error.set('');
      this.success.set('');
      this.profileError.set('');
      this.profileSuccess.set('');
    });
  }
  async saveProfile() {
    if (this.profile.invalid || this.navigationBlocked()) {
      this.profile.markAllAsTouched();
      return;
    }
    const epoch = this.session.epoch();
    this.profileBusy.set(true);
    this.profileError.set('');
    this.profileSuccess.set('');
    let saved = false;
    const wasDirty = this.profile.dirty;
    let successful = false;
    this.profile.disable();
    try {
      const value = this.profile.getRawValue();
      await this.auth.updateProfile(value.displayName, value.email);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      saved = true;
      if (this.picture.changed()) {
        if (this.picture.blob) await this.auth.uploadAvatar(this.picture.blob);
        else await this.auth.removeAvatar();
      }
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.profile.markAsPristine();
      this.picture.load(this.auth.user()?.avatarUrl ?? null);
      this.profileSuccess.set('Profile updated.');
      successful = true;
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.profileError.set(
          (saved ? 'Your profile was saved, but the picture update failed. Please retry. ' : '') +
            errorMessage(e),
        );
    } finally {
      this.profileBusy.set(false);
      if (!this.destroy.destroyed) {
        this.profile.enable();
        if (!successful && wasDirty && epoch === this.session.epoch()) this.profile.markAsDirty();
      }
    }
  }
  async save() {
    if (this.form.invalid || this.navigationBlocked()) {
      this.form.markAllAsTouched();
      return;
    }
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.form.disable();
    this.error.set('');
    this.success.set('');
    try {
      const v = this.form.getRawValue();
      await this.auth.changePassword(v.currentPassword, v.newPassword);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.form.reset();
      this.securityForm?.resetForm();
      this.success.set('Password changed. Other sessions have been signed out.');
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
      if (!this.destroy.destroyed) this.form.enable();
    }
  }
  hasUnsavedChanges() {
    return (
      this.profile.dirty ||
      this.picture.changed() ||
      Boolean(this.form.controls.currentPassword.value || this.form.controls.newPassword.value)
    );
  }
  navigationBlocked() {
    return this.busy() || this.profileBusy() || this.picture.preparing();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges() || this.navigationBlocked()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
