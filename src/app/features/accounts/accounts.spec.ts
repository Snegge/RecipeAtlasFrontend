import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsModule } from './accounts.module';
import { InvitationPageComponent } from './pages/invitation-page/invitation-page.component';
import { AccountAdminComponent } from './pages/account-admin/account-admin.component';
import { AccountAdminService } from '../../core/services/account-admin.service';
import { SessionState } from '../../core/services/session-state';

describe('Invitation acceptance and administration', () => {
  const validate = vi.fn(),
    redeem = vi.fn(),
    invite = vi.fn();
  beforeEach(async () => {
    validate.mockReset().mockResolvedValue({ status: 'Pending', expiresAtUtc: null });
    redeem.mockReset().mockResolvedValue(undefined);
    invite.mockReset();
    await TestBed.configureTestingModule({
      imports: [AccountsModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { fragment: 'token=private-test-token' } },
        },
        {
          provide: AccountAdminService,
          useValue: {
            validate,
            redeem,
            invite,
            accounts: vi.fn().mockResolvedValue([]),
            invitations: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compileComponents();
  });
  it('removes the fragment, previews without consuming, then submits and clears the secret', async () => {
    const replace = vi.spyOn(TestBed.inject(Location), 'replaceState');
    const fixture = TestBed.createComponent(InvitationPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(replace).toHaveBeenCalledWith('/invite');
    expect(validate).toHaveBeenCalledWith('private-test-token');
    expect(redeem).not.toHaveBeenCalled();
    fixture.componentInstance.form.setValue({
      email: 'recipient@example.test',
      username: 'invited-user',
      displayName: 'Invited User',
      password: 'a-private-test-password',
    });
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(redeem).toHaveBeenCalledWith(
      'private-test-token',
      'invited-user',
      'Invited User',
      'a-private-test-password',
      'recipient@example.test',
    );
    expect(fixture.nativeElement.textContent).toContain('personal cookbook are ready');
    expect(fixture.componentInstance.form.controls.password.value).toBe('');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it.each(['Invalid', 'Expired', 'Revoked', 'Consumed'])(
    'shows the %s state without a registration form',
    async (status) => {
      validate.mockResolvedValue({ status, expiresAtUtc: null });
      const fixture = TestBed.createComponent(InvitationPageComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        status === 'Consumed' ? 'already used' : status.toLowerCase(),
      );
      expect(redeem).not.toHaveBeenCalled();
    },
  );
  it('keeps fields and the pending invitation after a duplicate username', async () => {
    redeem.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { errors: { username: ['Username is already taken.'] } },
      }),
    );
    const fixture = TestBed.createComponent(InvitationPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({
      email: 'recipient@example.test',
      username: 'duplicate',
      displayName: 'Recipient',
      password: 'a-private-test-password',
    });
    await fixture.componentInstance.accept();
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('Pending');
    expect(fixture.componentInstance.form.controls.displayName.value).toBe('Recipient');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'already taken',
    );
  });
  it('does not restore a newly issued invitation link after the administrator signs out', async () => {
    let finish!: (value: unknown) => void;
    invite.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const fixture = TestBed.createComponent(AccountAdminComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const issuing = fixture.componentInstance.invite();
    TestBed.inject(SessionState).clear('logout');
    finish({ invitation: {}, link: 'https://example.test/invite#token=must-not-return' });
    await issuing;
    expect(fixture.componentInstance.link()).toBe('');
    expect(fixture.componentInstance.accounts()).toEqual([]);
  });
});
