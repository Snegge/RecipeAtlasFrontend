import { errorMessage } from '../../../../core/utils/api-error';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly username = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(32)],
  });
  readonly password = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly form = new FormGroup({ username: this.username, password: this.password });
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  async login() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username.value, this.password.value);
      const target = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(
        target && /^\/(cookbooks|account|admin)(?:\/|[?#]|$)/.test(target) && !target.includes('\\')
          ? target
          : '/cookbooks',
      );
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'The username or password is not correct. Please try again.'
          : errorMessage(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
