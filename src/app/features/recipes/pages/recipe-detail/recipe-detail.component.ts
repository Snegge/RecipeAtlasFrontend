import { CookbookContext } from '../../../../core/services/cookbook-context';
import { SessionState } from '../../../../core/services/session-state';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { errorMessage } from '../../../../core/utils/api-error';
import { Component, DestroyRef, inject, signal } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { MatDialog } from '@angular/material/dialog';

import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { Ingredient, Recipe } from '../../../../core/models/recipe.model';

import { scaleQuantity } from '../../../../core/utils/quantity';

import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-recipe-detail',
  standalone: false,
  templateUrl: './recipe-detail.component.html',
  styleUrl: './recipe-detail.component.scss',
})
export class RecipeDetailComponent {
  readonly cookbooks = inject(CookbookContext);
  private readonly session = inject(SessionState);
  readonly cookbookId = inject(ActivatedRoute).snapshot.paramMap.get('cookbookId')!;
  readonly recipeRoot = ['/cookbooks', this.cookbookId, 'recipes'];
  private readonly api = inject(RecipeApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly title = inject(Title);
  readonly recipe = signal<Recipe | null>(null);
  readonly selectedServings = signal(2);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deleting = signal(false);
  readonly imageFailed = signal(false);
  readonly checkedIngredients = signal(new Set<number>());
  private readonly destroy = inject(DestroyRef);
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.recipe.set(null);
      this.checkedIngredients.set(new Set());
    });
    void this.load();
  }
  async load() {
    const epoch = this.session.epoch();
    this.loading.set(true);
    this.error.set('');
    try {
      const recipe = await this.api.get(this.cookbookId, this.route.snapshot.paramMap.get('id')!);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.recipe.set(recipe);
      this.selectedServings.set(recipe.servings);
      this.title.setTitle(`${recipe.title} · Recipoke`);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  changeServings(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 1 && value <= 1000) this.selectedServings.set(value);
  }
  scaledQuantity(ingredient: Ingredient): { text: string; scaled: boolean } {
    return scaleQuantity(
      ingredient.quantity,
      this.selectedServings(),
      this.recipe()?.servings ?? 1,
    );
  }
  toggleIngredient(index: number) {
    this.checkedIngredients.update((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }
  async remove() {
    const recipe = this.recipe();
    if (!recipe || this.deleting() || !this.cookbooks.canWrite()) return;
    const epoch = this.session.epoch();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete this recipe?',
        message: `“${recipe.title}” and its photo will be permanently removed.`,
        action: 'Delete recipe',
      },
      maxWidth: '420px',
      width: 'calc(100% - 32px)',
    });
    const closeOnSession = this.session.changes.subscribe(() => ref.close());
    const onDestroy = this.destroy.onDestroy(() => ref.close());
    let confirmed: boolean | undefined;
    try {
      confirmed = await firstValueFrom(ref.afterClosed());
    } finally {
      closeOnSession.unsubscribe();
      onDestroy();
    }
    if (!confirmed || epoch !== this.session.epoch() || this.destroy.destroyed) return;
    this.deleting.set(true);
    try {
      await this.api.delete(this.cookbookId, recipe.id);
      if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
      this.snack.open('Recipe deleted', 'Close', { duration: 3000 });
      await this.router.navigate(this.recipeRoot);
    } catch (error) {
      this.snack.open(errorMessage(error), 'Close', { duration: 6000 });
    } finally {
      this.deleting.set(false);
    }
  }
}
