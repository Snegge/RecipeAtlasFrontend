import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import {
  ImportedIngredient,
  RecipeImportResult,
} from '../../../../core/models/recipe-import.model';
import { errorMessage } from '../../../../core/utils/api-error';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { RecipeEditorForm } from './recipe-editor-form';
import { RecipeEditorPhoto } from './recipe-editor-photo';

// Component-scoped orchestration. Form and photo state have separate, single owners.
@Injectable()
export class RecipeEditorCoordinator {
  readonly forms = inject(RecipeEditorForm);
  readonly photos = inject(RecipeEditorPhoto);
  private readonly api = inject(RecipeApiService);
  private readonly drafts = inject(RecipeDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly importId = this.route.snapshot.queryParamMap.get('import');
  readonly savedId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      const id = this.savedId();

      const [units, recipe] = await Promise.all([
        this.api.units(),
        id ? this.api.get(id) : Promise.resolve(null),
      ]);

      if (this.destroyRef.destroyed) return;

      this.forms.units.set(units);

      if (recipe) {
        this.forms.applyRecipe(recipe);
        this.photos.load(recipe.imageUrl);
      }

      this.forms.form.markAsPristine();

      let imported: RecipeImportResult | null = null;

      if (!id && this.importId) {
        imported = this.drafts.get(this.importId);

        if (!imported) {
          throw new Error(
            'This imported draft is no longer available. ' +
              'Return to your recipes and import the link again.',
          );
        }

        this.forms.applyImportedDraft(imported);
        this.photos.externalPhotoUrl.set(imported.draft.externalImageUrl);
        this.drafts.remove(this.importId);
      }

      this.forms.ingredients.controls.forEach((_row, index) => {
        this.forms.setUnit(index, false);
      });

      // Show the form while the photo is being prepared.
      this.loading.set(false);

      const photoUrl = imported?.draft.externalImageUrl;

      if (photoUrl) {
        await this.photos.importPhoto(photoUrl);
      }
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        this.loadError.set(errorMessage(error));
      }
    } finally {
      if (!this.destroyRef.destroyed) {
        this.loading.set(false);
      }
    }
  }

  hasUnsavedChanges(): boolean {
    return this.forms.hasUnsavedChanges() || this.photos.hasUnsavedChanges();
  }
  navigationBlocked(): boolean {
    return this.busy() || this.photos.preparingPhoto();
  }
  saveBlockReason(): string {
    return this.forms.saveBlockReason();
  }
  canSave(): boolean {
    return (
      !this.loading() && !this.loadError() && !this.navigationBlocked() && !this.saveBlockReason()
    );
  }
  async save(): Promise<void> {
    if (this.loading() || this.loadError() || this.navigationBlocked()) return;

    this.error.set('');

    const blockedReason = this.saveBlockReason();
    if (blockedReason) {
      this.forms.form.markAllAsTouched();
      this.error.set(blockedReason);
      return;
    }

    const raw = this.forms.form.getRawValue();

    if (raw.servings === null) {
      this.forms.form.controls.servings.markAsTouched();
      this.error.set('Enter the number of servings before saving.');
      return;
    }

    const input = this.forms.input();

    this.busy.set(true);
    this.forms.form.disable();

    let textSaved = false;

    try {
      const id = this.savedId();

      const saved = id ? await this.api.update(id, input) : await this.api.create(input);

      if (this.destroyRef.destroyed) return;
      this.savedId.set(saved.id);
      textSaved = true;
      this.forms.importDraftPending = false;
      this.forms.form.markAsPristine();

      await this.photos.persist(saved.id);
      if (this.destroyRef.destroyed) return;
      this.photos.committed();
      this.busy.set(false);

      this.snack.open('Recipe saved', 'Close', { duration: 3000 });

      await this.router.navigate(['/recipes', saved.id]);
    } catch (error) {
      this.error.set(
        textSaved
          ? 'Your recipe was saved, but the photo change failed. ' +
              'Press Save again to retry. ' +
              errorMessage(error)
          : errorMessage(error),
      );
    } finally {
      if (!this.destroyRef.destroyed) {
        this.busy.set(false);
        this.forms.form.enable();

        this.forms.ingredients.controls.forEach((_row, index) => {
          this.forms.setUnit(index, false);
        });
      }
    }
  }
}
