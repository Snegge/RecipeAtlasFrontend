import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './core/services/auth.service';
import { errorMessage } from './core/utils/api-error';

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  readonly leaving = signal(false);
  isEditor() {
    return /\/recipes\/(new|[^/]+\/edit)(\?|$)/.test(this.router.url);
  }
  async logout() {
    this.leaving.set(true);
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch (error) {
      this.snack.open(errorMessage(error), 'Close', { duration: 6000 });
    } finally {
      this.leaving.set(false);
    }
  }
}
