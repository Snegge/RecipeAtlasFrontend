import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookService } from '../../core/services/cookbook.service';
import { SessionState } from '../../core/services/session-state';
import { CookbookResponse } from '../../core/models/account.model';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-cookbook-overview',
  standalone: false,
  templateUrl: './cookbook-overview.component.html',
  styleUrl: './cookbooks.scss',
})
export class CookbookOverviewComponent {
  private readonly books = inject(CookbookService);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  readonly cookbooks = signal<CookbookResponse[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly failedCovers = signal(new Set<string>());
  readonly message = inject(ActivatedRoute).snapshot.queryParamMap.get('message') ?? '';
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cookbooks.set([]);
      this.notice.set('');
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
      if (remove) await this.books.delete(book.id);
      else await this.books.leave(book.id);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      if (this.books.context.current()?.id === book.id) this.books.context.current.set(null);
      this.notice.set(remove ? 'Cookbook deleted.' : 'You left the cookbook.');
      await this.load();
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
