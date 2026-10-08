import { errorMessage } from '../../../../core/utils/api-error';
import { Component, inject, signal } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { MatDialog } from '@angular/material/dialog';

import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { Recipe } from '../../../../core/models/recipe.model';

import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-recipe-detail',
  standalone: false,
  templateUrl: './recipe-detail.component.html',
  styleUrl: './recipe-detail.component.scss',
})
export class RecipeDetailComponent {
  private readonly api = inject(RecipeApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly title = inject(Title);
  readonly recipe = signal<Recipe | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deleting = signal(false);
  readonly imageFailed = signal(false);
  readonly checkedIngredients = signal(new Set<number>());
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const recipe = await this.api.get(this.route.snapshot.paramMap.get('id')!);
      this.recipe.set(recipe);
      this.title.setTitle(`${recipe.title} · Recipe Atlas`);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
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
    if (!recipe || this.deleting()) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Delete this recipe?',
            message: `“${recipe.title}” and its photo will be permanently removed.`,
            action: 'Delete recipe',
          },
          maxWidth: '420px',
          width: 'calc(100% - 32px)',
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    this.deleting.set(true);
    try {
      await this.api.delete(recipe.id);
      this.snack.open('Recipe deleted', 'Close', { duration: 3000 });
      await this.router.navigateByUrl('/recipes');
    } catch (error) {
      this.snack.open(errorMessage(error), 'Close', { duration: 6000 });
    } finally {
      this.deleting.set(false);
    }
  }
}
