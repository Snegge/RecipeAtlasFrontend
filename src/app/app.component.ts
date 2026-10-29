import {
  Component,
  ViewChild,
  DestroyRef,
  computed,
  inject,
  signal,
  HostListener,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PwaService } from './core/services/pwa.service';
import { AuthService } from './core/services/auth.service';
import { SessionState } from './core/services/session-state';
import { DirtyPage } from './core/guards/unsaved-changes.guard';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { errorMessage } from './core/utils/api-error';
@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly pwa = inject(PwaService);
  reloadForUpdate() {
    const page = this.outlet?.isActivated ? (this.outlet.component as Partial<DirtyPage>) : null;
    if (
      this.pwa.writes() ||
      this.leaving() ||
      this.dialog.openDialogs.length ||
      page?.navigationBlocked?.() ||
      page?.hasUnsavedChanges?.()
    ) {
      this.snack.open(
        'Finish or save your work before reloading. Resolve pending shopping actions first.',
        'Close',
      );
      return;
    }
    window.location.reload();
  }
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  @ViewChild(RouterOutlet) outlet?: RouterOutlet;
  readonly menuOpen = signal(false);
  readonly leaving = signal(false);
  readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split(/[?#]/)[0]),
      startWith(this.router.url.split(/[?#]/)[0]),
    ),
    { initialValue: '/cookbooks' },
  );
  readonly links = computed(() => [
    { path: '/cookbooks', label: 'Cookbooks', icon: 'book' },
    { path: '/shopping-lists', label: 'Shopping lists', icon: 'check' },
    { path: '/account', label: 'Account', icon: 'person' },
    ...(this.auth.user()?.isAdministrator
      ? [{ path: '/admin', label: 'Accounts Manager', icon: 'people' }]
      : []),
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ]);
  readonly title = computed(() => {
    const path = this.path();
    if (path === '/cookbooks') return 'Cookbooks';
    if (path === '/shopping-lists') return 'Shopping lists';
    if (path.startsWith('/shopping-lists/')) return 'Shopping list';
    if (path === '/cookbooks/new') return 'New cookbook';
    if (path.endsWith('/settings') && path.startsWith('/cookbooks/')) return 'Cookbook settings';
    if (path.endsWith('/recipes/new')) return 'New recipe';
    if (path.endsWith('/edit')) return 'Edit recipe';
    if (/\/recipes\/[^/]+$/.test(path)) return 'Recipe';
    if (path.endsWith('/recipes')) return 'Recipes';
    return (
      (
        {
          '/account': 'Account',
          '/admin': 'Accounts Manager',
          '/settings': 'Settings',
          '/login': 'Sign in',
          '/invite': 'Join Recipoke',
        } as Record<string, string>
      )[path] ?? 'Cookbooks'
    );
  });
  readonly backTarget = computed(() => {
    const path = this.path();
    if (path === '/cookbooks' || path === '/shopping-lists') return null;
    if (path.startsWith('/shopping-lists/')) return '/shopping-lists';
    if (path.endsWith('/edit')) return path.slice(0, -5);
    if (/\/recipes\/[^/]+$/.test(path)) return path.substring(0, path.lastIndexOf('/'));
    if (/^\/cookbooks\/[^/]+\/settings$/.test(path)) return path.replace(/\/settings$/, '/recipes');
    if (path === '/invite' && !this.auth.signedIn()) return '/login';
    return '/cookbooks';
  });
  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => this.menuOpen.set(false));
  }
  @HostListener('window:resize') resize() {
    if (window.innerWidth >= 900) this.menuOpen.set(false);
  }
  async logout() {
    if (this.leaving()) return;
    const epoch = this.session.epoch();
    const page = this.outlet?.isActivated ? (this.outlet.component as Partial<DirtyPage>) : null;
    if (page?.navigationBlocked?.()) {
      this.snack.open('Please wait for the current action to finish.', 'Close', { duration: 4000 });
      return;
    }
    if (page?.hasUnsavedChanges?.()) {
      const ref = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Discard changes and sign out?',
          message: 'Your unsaved changes will be lost.',
          action: 'Sign out',
        },
        width: 'calc(100% - 32px)',
        maxWidth: '420px',
      });
      const close = this.session.changes.subscribe(() => ref.close());
      const stop = this.destroy.onDestroy(() => ref.close());
      let confirmed;
      try {
        confirmed = await firstValueFrom(ref.afterClosed());
      } finally {
        close.unsubscribe();
        stop();
      }
      if (!confirmed || epoch !== this.session.epoch() || this.destroy.destroyed) return;
    }
    this.leaving.set(true);
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch (e) {
      this.snack.open(errorMessage(e), 'Close', { duration: 6000 });
    } finally {
      this.leaving.set(false);
    }
  }
}
