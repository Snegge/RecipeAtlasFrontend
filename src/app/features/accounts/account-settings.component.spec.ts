import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsModule } from './accounts.module';
import { AccountSettingsComponent } from './account-settings.component';
import { AuthService } from '../../core/services/auth.service';
import { SessionState } from '../../core/services/session-state';
const user = {
  id: 'user',
  username: 'reader',
  displayName: 'Reader',
  email: 'reader@example.test',
  avatarUrl: null,
  isAdministrator: false,
};
describe('Profile and security forms', () => {
  const update = vi.fn(),
    upload = vi.fn(),
    password = vi.fn();
  beforeEach(async () => {
    update.mockReset().mockResolvedValue(user);
    upload.mockReset().mockResolvedValue(user);
    password.mockReset().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [AccountsModule],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal(user),
            updateProfile: update,
            uploadAvatar: upload,
            changePassword: password,
          },
        },
      ],
    }).compileComponents();
  });
  it('validates profile email independently of password changes', async () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    const page = fixture.componentInstance;
    page.profile.controls.email.setValue('invalid');
    await page.saveProfile();
    expect(update).not.toHaveBeenCalled();
    page.form.setValue({
      currentPassword: 'current-test-password',
      newPassword: 'replacement-test-password',
    });
    await page.save();
    expect(password).toHaveBeenCalledWith('current-test-password', 'replacement-test-password');
    expect(page.form.controls.currentPassword.value).toBe('');
  });
  it('retains the selected picture and dirty profile when upload fails after saving details', async () => {
    upload.mockRejectedValueOnce(new Error('Upload failed'));
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    const page = fixture.componentInstance;
    page.profile.controls.displayName.setValue('New display name');
    page.profile.markAsDirty();
    page.picture.blob = new Blob(['picture']);
    page.picture.changed.set(true);
    await page.saveProfile();
    expect(page.profileError()).toContain('picture update failed');
    expect(page.hasUnsavedChanges()).toBe(true);
    expect(page.profile.enabled).toBe(true);
    expect(page.picture.blob).not.toBeNull();
    await page.saveProfile();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(page.profileSuccess()).toBe('Profile updated.');
    expect(page.hasUnsavedChanges()).toBe(false);
  });
  it('blocks double submission and clears private controls after a session change', async () => {
    let finish!: (value: typeof user) => void;
    update.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    const page = fixture.componentInstance;
    page.profile.controls.displayName.setValue('Private');
    const saving = page.saveProfile();
    await page.saveProfile();
    expect(update).toHaveBeenCalledTimes(1);
    expect(page.profile.disabled).toBe(true);
    TestBed.inject(SessionState).clear('login');
    finish(user);
    await saving;
    expect(page.profile.controls.displayName.value).toBe('');
    expect(page.profile.controls.email.value).toBe('');
    expect(page.profileSuccess()).toBe('');
    expect(upload).not.toHaveBeenCalled();
  });
});
