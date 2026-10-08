import { errorMessage } from '../../../../core/utils/api-error';
import { Component, effect, inject, signal, untracked } from '@angular/core';

import { FormControl } from '@angular/forms';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { PageEvent } from '@angular/material/paginator';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { RecipePage } from '../../../../core/models/recipe.model';

@Component({
  selector: 'app-recipe-list',
  standalone: false,
  templateUrl: './recipe-list.component.html',
  styleUrl: './recipe-list.component.scss',
})
export class RecipeListComponent {
  private readonly api = inject(RecipeApiService);
  readonly search = new FormControl('', { nonNullable: true });
  readonly query = signal('');
  readonly page = signal(1);
  readonly refresh = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly result = signal<RecipePage>({ items: [], total: 0, page: 1, pageSize: 12 });
  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.query.set(value.trim());
        this.page.set(1);
      });
    effect((cleanup) => {
      this.refresh();
      const query = this.query();
      const page = this.page();
      this.loading.set(true);
      this.error.set('');
      const subscription = untracked(() =>
        this.api.list(query, page).subscribe({
          next: (result) => {
            this.result.set(result);
            this.loading.set(false);
          },
          error: (error) => {
            this.error.set(errorMessage(error));
            this.loading.set(false);
          },
        }),
      );
      cleanup(() => subscription.unsubscribe());
    });
  }
  retry() {
    this.refresh.update((value) => value + 1);
  }
  changePage(event: PageEvent) {
    this.page.set(event.pageIndex + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
