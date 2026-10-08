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
  readonly password = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly form = new FormGroup({ password: this.password });
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  async login() {
    if (this.password.invalid || this.busy()) {
      this.password.markAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.password.value);
      const target = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(target?.startsWith('/recipes') ? target : '/recipes');
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'That password is not correct. Please try again.'
          : errorMessage(error),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
