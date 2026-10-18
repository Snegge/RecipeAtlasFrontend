import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RecipeImportDialogComponent } from '../../components/recipe-import-dialog/recipe-import-dialog.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { HttpErrorResponse } from '@angular/common/http';
import { CookbookContext } from '../../../../core/services/cookbook-context';
import { SessionState } from '../../../../core/services/session-state';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Injectable, inject, signal, DestroyRef, Type } from '@angular/core';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import {
  ImportedIngredient,
  RecipeImportResult,
} from '../../../../core/models/recipe-import.model';
import { errorMessage } from '../../../../core/utils/api-error';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { Recipe } from '../../../../core/models/recipe.model';
import { isConcurrencyConflict } from '../../../../core/utils/concurrency';
import {
  ConflictReviewComponent,
  ConflictSource,
} from '../../../../shared/components/conflict-review/conflict-review.component';
import { recipeConflictFields, mergeRecipeChoices } from './recipe-conflict-review';
import { RecipeEditorForm } from './recipe-editor-form';
import { RecipeEditorPhoto } from './recipe-editor-photo';

// Component-scoped orchestration. Form and photo state have separate, single owners.
@Injectable()
export class RecipeEditorCoordinator {
  readonly cookbooks = inject(CookbookContext);
  private readonly session = inject(SessionState);
  readonly cookbookId = inject(ActivatedRoute).snapshot.paramMap.get('cookbookId')!;
  readonly recipeRoot = ['/cookbooks', this.cookbookId, 'recipes'];
  private readonly dialog = inject(MatDialog);
  readonly importing = signal(false);
  readonly permissionLost = signal(false);
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
  // Baseline belongs to the displayed form. A fetched conflict revision stays separate until review.
  readonly baseline = signal<Recipe | null>(null);
  readonly latest = signal<Recipe | null>(null);
  readonly conflict = signal(false);
  readonly refreshing = signal(false);
  readonly partialSaved = signal(false);
  private readGeneration = 0;
  private current(epoch: number): boolean {
    return !this.destroyRef.destroyed && epoch === this.session.epoch();
  }
  copyableDraft(): string {
    return JSON.stringify(this.forms.snapshot(), null, 2);
  }

  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe((reason) => {
      const partiallySaved = this.partialSaved();
      ++this.readGeneration;
      this.busy.set(false);
      this.refreshing.set(false);
      this.importing.set(false);
      this.forms.form.enable();
      this.baseline.set(null);
      this.latest.set(null);
      this.conflict.set(false);
      this.partialSaved.set(false);
      if (reason === 'expired') {
        this.permissionLost.set(true);
        this.photos.preparingPhoto.set(false);
        this.error.set(
          (partiallySaved ? 'Recipe fields were saved. The picture change remains pending. ' : '') +
            'Your session ended. Your unsaved edits are still here.',
        );
        return;
      }
      this.forms.clear();
      this.photos.clear();
      this.permissionLost.set(false);
      this.savedId.set(null);
      this.loadError.set('Session changed. Choose a cookbook again.');
    });
    void this.load();
  }
  async load(): Promise<void> {
    const epoch = this.session.epoch();
    this.loading.set(true);
    this.loadError.set('');

    try {
      const id = this.savedId();

      const [units, recipe] = await Promise.all([
        this.api.units(),
        id ? this.api.get(this.cookbookId, id) : Promise.resolve(null),
      ]);

      if (this.destroyRef.destroyed || epoch !== this.session.epoch()) return;

      this.forms.units.set(units);

      if (recipe) {
        this.baseline.set(recipe);
        this.forms.applyRecipe(recipe);
        this.photos.load(recipe.imageUrl, recipe.version);
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
      if (this.current(epoch)) {
        this.loadError.set(errorMessage(error));
      }
    } finally {
      if (this.current(epoch)) {
        this.loading.set(false);
      }
    }
  }

  async openImport(): Promise<boolean> {
    if (
      this.savedId() ||
      this.importing() ||
      this.navigationBlocked() ||
      this.loading() ||
      this.loadError() ||
      !this.cookbooks.canWrite()
    )
      return false;
    const epoch = this.session.epoch();
    if (this.hasUnsavedChanges()) {
      const confirm = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Replace your draft?',
          message: 'Importing a recipe will replace your unsaved recipe fields and picture.',
          action: 'Import recipe',
        },
        maxWidth: '420px',
        width: 'calc(100% - 32px)',
      });
      const close = this.session.changes.subscribe(() => confirm.close());
      const stop = this.destroyRef.onDestroy(() => confirm.close());
      let accepted;
      try {
        accepted = await firstValueFrom(confirm.afterClosed());
      } finally {
        close.unsubscribe();
        stop();
      }
      if (!accepted || epoch !== this.session.epoch() || this.destroyRef.destroyed) return false;
    }
    this.importing.set(true);
    this.error.set('');
    const ref = this.dialog.open<RecipeImportDialogComponent, undefined, RecipeImportResult>(
      RecipeImportDialogComponent,
      {
        panelClass: 'recipe-import-dialog',
        maxWidth: '100vw',
        autoFocus: 'dialog',
        restoreFocus: true,
        closeOnNavigation: true,
      },
    );
    const close = this.session.changes.subscribe(() => ref.close());
    const stop = this.destroyRef.onDestroy(() => ref.close());
    try {
      const result = await firstValueFrom(ref.afterClosed());
      if (!result || epoch !== this.session.epoch() || this.destroyRef.destroyed) return false;
      this.photos.clear();
      this.forms.applyImportedDraft(result);
      this.forms.ingredientDraftPending = false;
      this.forms.ingredients.controls.forEach((_row, index) => this.forms.setUnit(index, false));
      this.photos.externalPhotoUrl.set(result.draft.externalImageUrl);
      if (result.draft.externalImageUrl)
        await this.photos.importPhoto(result.draft.externalImageUrl);
      return epoch === this.session.epoch() && !this.destroyRef.destroyed;
    } catch (e) {
      if (epoch === this.session.epoch() && !this.destroyRef.destroyed)
        this.error.set(errorMessage(e));
      return false;
    } finally {
      close.unsubscribe();
      stop();
      this.importing.set(false);
    }
  }
  hasUnsavedChanges(): boolean {
    return (
      this.conflict() ||
      this.permissionLost() ||
      this.forms.hasUnsavedChanges() ||
      this.photos.hasUnsavedChanges()
    );
  }
  navigationBlocked(): boolean {
    return this.busy() || this.refreshing() || this.photos.preparingPhoto() || this.importing();
  }
  saveBlockReason(): string {
    return this.forms.saveBlockReason();
  }
  canSave(): boolean {
    return (
      this.cookbooks.canWrite() &&
      !this.permissionLost() &&
      !this.conflict() &&
      !this.loading() &&
      !this.loadError() &&
      !this.navigationBlocked() &&
      !this.saveBlockReason()
    );
  }
  async save(): Promise<void> {
    const epoch = this.session.epoch();
    if (
      this.loading() ||
      this.loadError() ||
      this.navigationBlocked() ||
      !this.cookbooks.canWrite() ||
      this.permissionLost() ||
      this.conflict()
    )
      return;

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

    let textSaved = this.partialSaved();

    try {
      const id = this.savedId();

      // A retry after photo failure does not repeat text that already committed.
      let saved = this.baseline();
      if (!id || !saved || !this.partialSaved() || this.forms.form.dirty) {
        saved = id
          ? await this.api.update(this.cookbookId, id, input, saved!.version)
          : await this.api.create(this.cookbookId, input);
        if (!this.current(epoch)) return;
        this.baseline.set(saved);
        this.savedId.set(saved.id);
        textSaved = true;
        this.forms.importDraftPending = false;
        this.forms.form.markAsPristine();
      }
      if (!saved) return;
      this.partialSaved.set(this.photos.hasUnsavedChanges());
      const image = await this.photos.persist(this.cookbookId, saved.id, saved.version);
      if (!this.current(epoch)) return;
      if (image) this.baseline.set({ ...saved, ...image });
      this.photos.committed();
      this.partialSaved.set(false);
      this.busy.set(false);

      this.snack.open('Recipe saved', 'Close', { duration: 3000 });

      await this.router.navigate([...this.recipeRoot, saved.id]);
    } catch (error) {
      if (!this.current(epoch)) return;
      if (isConcurrencyConflict(error)) {
        this.conflict.set(true);
        this.error.set(
          textSaved && this.partialSaved()
            ? 'Recipe fields were saved. The picture is still pending because another change was made. Review the current revision.'
            : 'Another person changed this recipe. Your edits are still here. Review the current revision before saving.',
        );
        await this.refreshConflict();
        return;
      }
      if (error instanceof HttpErrorResponse && [403, 404].includes(error.status)) {
        this.permissionLost.set(true);
        this.error.set(
          (textSaved && this.partialSaved()
            ? 'Recipe fields were saved. The picture change remains pending. '
            : '') +
            'Your cookbook access changed. Your unsaved edits are still here; copy them before leaving.',
        );
        return;
      }
      this.error.set(
        textSaved
          ? 'Your recipe was saved, but the photo change failed. ' +
              'Press Save again to retry. ' +
              errorMessage(error)
          : errorMessage(error),
      );
    } finally {
      if (this.current(epoch)) {
        this.busy.set(false);
        const dirty = this.forms.form.dirty;
        this.forms.form.enable();

        this.forms.ingredients.controls.forEach((_row, index) => {
          this.forms.setUnit(index, false);
        });
      }
    }
  }
  async refreshConflict(): Promise<void> {
    const id = this.savedId();
    if (!id || !this.conflict() || this.refreshing() || this.permissionLost()) return;
    const epoch = this.session.epoch(),
      generation = ++this.readGeneration;
    this.refreshing.set(true);
    this.latest.set(null);
    try {
      const recipe = await this.api.get(this.cookbookId, id);
      if (this.current(epoch) && generation === this.readGeneration) this.latest.set(recipe);
    } catch (error) {
      if (!this.current(epoch) || generation !== this.readGeneration) return;
      if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)) {
        this.permissionLost.set(true);
        this.error.set(
          'The original recipe is unavailable or your access changed. Copy your local work before leaving.',
        );
      } else
        this.error.set(
          'Could not load the current recipe. Your edits are safe here. Try loading the current revision again.',
        );
    } finally {
      if (this.current(epoch) && generation === this.readGeneration) this.refreshing.set(false);
    }
  }
  private async decision<T>(component: Type<unknown>, data: unknown): Promise<T | undefined> {
    const ref = this.dialog.open(component, {
      data,
      width: 'calc(100% - 24px)',
      maxWidth: '900px',
      maxHeight: '95dvh',
      autoFocus: 'dialog',
      restoreFocus: true,
    });
    const close = this.session.changes.subscribe(() => ref.close());
    const stop = this.destroyRef.onDestroy(() => ref.close());
    try {
      return await firstValueFrom(ref.afterClosed());
    } finally {
      close.unsubscribe();
      stop();
    }
  }
  async loadServer(): Promise<void> {
    const server = this.latest(),
      epoch = this.session.epoch();
    if (!server || this.navigationBlocked() || this.permissionLost()) return;
    const accepted = await this.decision<boolean>(ConfirmDialogComponent, {
      title: 'Discard local changes?',
      message: 'Load the current recipe and discard your local fields and pending picture?',
      action: 'Load server version',
    });
    if (!accepted || !this.current(epoch) || this.latest() !== server) return;
    this.forms.applyRecipe(server);
    this.photos.clear();
    this.photos.load(server.imageUrl, server.version);
    this.acceptBaseline(server);
    this.forms.form.markAsPristine();
  }
  async review(): Promise<void> {
    const server = this.latest(),
      epoch = this.session.epoch();
    if (!server || this.navigationBlocked() || this.permissionLost()) return;
    const local = this.forms.snapshot();
    const choices = await this.decision<Record<string, ConflictSource>>(ConflictReviewComponent, {
      title: 'Review recipe changes',
      explanation:
        'Choose local or server values. Ingredients and steps are selected as whole ordered sections. Applying creates an unsaved draft; it does not save.',
      fields: recipeConflictFields(local, server, this.photos),
    });
    if (!choices || !this.current(epoch) || this.latest() !== server) return;
    this.forms.applyRecipe(mergeRecipeChoices(local, server, choices));
    if (choices['photo'] === 'server') {
      this.photos.clear();
      this.photos.load(server.imageUrl, server.version);
    } else this.photos.rebase(server.imageUrl, server.version);
    this.acceptBaseline(server);
    this.forms.ingredients.controls.forEach((_, index) => this.forms.setUnit(index, false));
    this.forms.form.markAsDirty();
  }
  private acceptBaseline(server: Recipe): void {
    this.baseline.set(server);
    this.latest.set(null);
    this.conflict.set(false);
    this.partialSaved.set(false);
    this.error.set('');
  }
}
