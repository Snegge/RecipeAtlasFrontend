import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookService } from '../../../../core/services/cookbook.service';
import { SessionState } from '../../../../core/services/session-state';
import { CookbookResponse } from '../../../../core/models/account.model';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { isConcurrencyConflict } from '../../../../core/utils/concurrency';
import { errorMessage } from '../../../../core/utils/api-error';
@Component({
  selector: 'app-cookbook-overview',
  standalone: false,
  templateUrl: './cookbook-overview.component.html',
  styleUrl: './cookbook-overview.component.scss',
})
export class CookbookOverviewComponent {
  private readonly books = inject(CookbookService);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly cookbooks = signal<CookbookResponse[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly failedCovers = signal(new Set<string>());
  constructor() {
    const message = inject(ActivatedRoute).snapshot.queryParamMap.get('message');
    if (message) this.snack.open(message, 'Close', { duration: 6000 });
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cookbooks.set([]);
      this.snack.dismiss();
      this.failedCovers.set(new Set());
    });
    void this.load();
  }
  async load() {
    const epoch = this.session.epoch();
    this.loading.set(true);
    this.error.set('');
    try {
      const books = await firstValueFrom(this.books.list());
      if (epoch === this.session.epoch() && !this.destroy.destroyed) this.cookbooks.set(books);
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
  coverFailed(id: string) {
    this.failedCovers.update((items) => new Set([...items, id]));
  }
  async leave(book: CookbookResponse) {
    await this.confirm(book, false);
  }
  async delete(book: CookbookResponse) {
    await this.confirm(book, true);
  }
  private async confirm(book: CookbookResponse, remove: boolean) {
    if (this.busy()) return;
    const epoch = this.session.epoch();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: remove ? 'Delete “' + book.name + '”?' : 'Leave “' + book.name + '”?',
        message: remove
          ? 'This permanently deletes the cookbook, all ' +
            book.recipeCount +
            ' recipes, their ingredients, steps and images, and pending invitations. This cannot be undone.'
          : 'You will lose access to this cookbook. Its owner can invite you again.',
        action: remove ? 'Delete cookbook' : 'Leave cookbook',
      },
      maxWidth: '440px',
      width: 'calc(100% - 32px)',
    });
    const cancel = this.session.changes.subscribe(() => ref.close());
    const destroy = this.destroy.onDestroy(() => ref.close());
    let confirmed;
    try {
      confirmed = await firstValueFrom(ref.afterClosed());
    } finally {
      cancel.unsubscribe();
      destroy();
    }
    if (!confirmed || epoch !== this.session.epoch() || this.destroy.destroyed) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (remove) await this.books.delete(book.id, book.version);
      else await this.books.leave(book.id, book.version);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      if (this.books.context.current()?.id === book.id) this.books.context.current.set(null);
      this.snack.open(remove ? 'Cookbook deleted.' : 'You left the cookbook.', 'Close', {
        duration: 4000,
      });
      await this.load();
    } catch (e) {
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      if (isConcurrencyConflict(e)) {
        await this.load();
        if (epoch === this.session.epoch() && !this.destroy.destroyed)
          this.error.set(
            'This cookbook changed. Review the refreshed cookbook, then choose the action and confirm again.',
          );
      } else this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
