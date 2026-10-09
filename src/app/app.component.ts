import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './core/services/auth.service';
import { errorMessage } from './core/utils/api-error';
import { toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, filter, map, startWith } from 'rxjs';

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

  readonly showRecipesBack = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
      map((url) => {
        const path = url.split(/[?#]/)[0];
        return path.startsWith('/recipes/');
      }),
      distinctUntilChanged(),
    ),
    { initialValue: false },
  );
}
