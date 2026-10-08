import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../../auth.module';
import { AuthService } from '../../../../core/services/auth.service';
import { LoginComponent } from './login.component';

describe('Login form submission', () => {
  const login = vi.fn();
  beforeEach(async () => {
    login.mockReset().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [AuthModule],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  it('submits the rendered form and calls the login service', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'a-test-password';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);
    expect(login).toHaveBeenCalledExactlyOnceWith('a-test-password');
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/recipes');
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('shows a rejected password and releases the loading state', async () => {
    login.mockRejectedValueOnce(new HttpErrorResponse({ status: 401 }));
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    fixture.componentInstance.password.setValue('wrong-password');
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'not correct',
    );
    expect(fixture.componentInstance.busy()).toBe(false);
  });
});
