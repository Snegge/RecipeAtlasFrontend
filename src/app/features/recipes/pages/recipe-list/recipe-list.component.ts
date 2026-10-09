import {
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
} from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';

import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { RecipePage } from '../../../../core/models/recipe.model';
import { RecipeImportResult } from '../../../../core/models/recipe-import.model';
import { errorMessage } from '../../../../core/utils/api-error';
import { RecipeImportDialogComponent } from '../../components/recipe-import-dialog/recipe-import-dialog.component';

@Component({
  selector: 'app-recipe-list',
  standalone: false,
  templateUrl: './recipe-list.component.html',
  styleUrl: './recipe-list.component.scss',
})
export class RecipeListComponent {
  private readonly api = inject(RecipeApiService);
  private readonly drafts = inject(RecipeDraftService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly search = new FormControl('', { nonNullable: true });
  readonly query = signal('');
  readonly page = signal(1);
  readonly refresh = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly importError = signal('');
  readonly importDialogOpen = signal(false);

  readonly result = signal<RecipePage>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
  });

  constructor() {
    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
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

  async openImport(): Promise<void> {
    if (this.importDialogOpen()) return;

    this.importDialogOpen.set(true);
    this.importError.set('');

    let draftId: string | null = null;

    const ref = this.dialog.open<
      RecipeImportDialogComponent,
      undefined,
      RecipeImportResult
    >(RecipeImportDialogComponent, {
      panelClass: 'recipe-import-dialog',
      maxWidth: '100vw',
      autoFocus: 'dialog',
      restoreFocus: true,
      closeOnNavigation: true,
    });

    const unregisterDestroy = this.destroyRef.onDestroy(() => ref.close());

    try {
      const result = await firstValueFrom(ref.afterClosed());
      console.log('Import dialog result:', result);

      if (!result || this.destroyRef.destroyed) return;

      draftId = this.drafts.put(result);

      const navigated = await this.router.navigate(['/recipes/new'], {
        queryParams: { import: draftId },
      });

      if (!navigated) {
        this.drafts.remove(draftId);
        this.importError.set(
          'The editor could not be opened. Please import the recipe again.',
        );
      }
    } catch {
      if (draftId) this.drafts.remove(draftId);

      if (!this.destroyRef.destroyed) {
        this.importError.set(
          'The editor could not be opened. Please try again.',
        );
      }

      
    } finally {
      unregisterDestroy();

      if (!this.destroyRef.destroyed) {
        this.importDialogOpen.set(false);
      }
    }
  }

  retry(): void {
    this.refresh.update((value) => value + 1);
  }

  changePage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}