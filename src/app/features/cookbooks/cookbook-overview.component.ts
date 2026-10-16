import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookService } from '../../core/services/cookbook.service';
import { SessionState } from '../../core/services/session-state';
import { CookbookResponse } from '../../core/models/account.model';
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
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly cookbooks = signal<CookbookResponse[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = inject(ActivatedRoute).snapshot.queryParamMap.get('message') ?? '';
  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cookbooks.set([]);
      this.form.reset();
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
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
  async create() {
    if (this.form.invalid || this.busy()) return;
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.error.set('');
    try {
      const book = await this.books.create(this.form.controls.name.value);
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        await this.router.navigate(['/cookbooks', book.id, 'recipes']);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
  async leave(book: CookbookResponse) {
    if (this.busy()) return;
    const epoch = this.session.epoch();
    this.busy.set(true);
    try {
      await this.books.leave(book.id);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      if (this.books.context.current()?.id === book.id) this.books.context.current.set(null);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
