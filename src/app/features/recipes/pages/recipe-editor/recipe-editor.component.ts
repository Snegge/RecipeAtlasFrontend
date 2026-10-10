import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import {
  FormArray,
  FormControl,
  NonNullableFormBuilder,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { Ingredient, RecipeInput, Unit } from '../../../../core/models/recipe.model';
import {
  ImportedIngredient,
  RecipeImportResult,
} from '../../../../core/models/recipe-import.model';
import { errorMessage } from '../../../../core/utils/api-error';
import { preparePhoto } from '../../../../core/utils/photo';
import { prepareImportedPhoto } from '../../../../core/utils/import-photo';
import { IngredientForm } from '../../models/recipe-form.model';
import { parseQuantity } from '../../../../core/utils/quantity';

import { EventEmitter, Output } from '@angular/core';
import { StepMove } from '../../models/recipe-form.model';

const textRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

const quantityValid: ValidatorFn = (control) =>
  parseQuantity(control.value) ? null : { quantity: true };

const integer: ValidatorFn = (control) =>
  Number.isInteger(control.value) ? null : { integer: true };

const sourceUrl: ValidatorFn = (control) => {
  if (!control.value?.trim()) return null;

  try {
    const url = new URL(control.value);

    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? null
      : { url: true };
  } catch {
    return { url: true };
  }
};

@Component({
  selector: 'app-recipe-editor',
  standalone: false,
  templateUrl: './recipe-editor.component.html',
  styleUrl: './recipe-editor.component.scss',
})
export class RecipeEditorComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(RecipeApiService);
  private readonly drafts = inject(RecipeDraftService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  private readonly importId = this.route.snapshot.queryParamMap.get('import');

  readonly savedId = signal<string | null>(this.route.snapshot.paramMap.get('id'));

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly preparingPhoto = signal(false);
  readonly photoError = signal('');
  readonly units = signal<Unit[]>([]);
  readonly preview = signal<string | null>(null);

  readonly importWarnings = signal<string[]>([]);
  readonly importedYield = signal<string | null>(null);
  readonly externalPhotoUrl = signal<string | null>(null);

  readonly importedIngredients = new Map<IngredientForm, ImportedIngredient>();

  private pendingPhoto: Blob | null = null;
  private photoRemoved = false;
  private originalPhoto: string | null = null;
  private objectUrl: string | null = null;

  ingredientDraftPending = false;
  private importDraftPending = false;

  readonly ingredients = new FormArray(
    [this.makeIngredient()],
    [Validators.minLength(1), Validators.maxLength(100)],
  );

  readonly steps = new FormArray(
    [this.makeStep('')],
    [Validators.minLength(1), Validators.maxLength(100)],
  );

  readonly form = this.fb.group({
    title: ['', [textRequired, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(4000)],
    sourceUrl: ['', [sourceUrl, Validators.maxLength(2048)]],
    servings: new FormControl<number | null>(2, [
      Validators.required,
      Validators.min(1),
      Validators.max(1000),
      integer,
    ]),
    ingredients: this.ingredients,
    steps: this.steps,
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.releasePreview());
    void this.load();
  }

  private makeIngredient(input?: Ingredient) {
    return this.fb.group({
      name: [input?.name ?? '', [textRequired, Validators.maxLength(200)]],
      quantity: new FormControl(input?.quantity ?? '', {
        nonNullable: true,
        validators: input?.unit === 'toTaste' ? [] : [quantityValid],
      }),
      unit: [input?.unit ?? 'g', Validators.required],
      note: [input?.note ?? '', Validators.maxLength(300)],
    });
  }

  private makeStep(value: string) {
    return new FormControl(value, {
      nonNullable: true,
      validators: [textRequired, Validators.maxLength(4000)],
    });
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

      this.units.set(units);

      if (recipe) {
        this.form.patchValue({
          title: recipe.title,
          description: recipe.description ?? '',
          sourceUrl: recipe.sourceUrl ?? '',
          servings: recipe.servings,
        });

        this.ingredients.clear();

        recipe.ingredients.forEach((item) => {
          this.ingredients.push(this.makeIngredient(item));
        });

        this.steps.clear();

        recipe.steps.forEach((step) => {
          this.steps.push(this.makeStep(step));
        });

        this.originalPhoto = recipe.imageUrl;
        this.preview.set(recipe.imageUrl);
      }

      this.form.markAsPristine();

      let imported: RecipeImportResult | null = null;

      if (!id && this.importId) {
        imported = this.drafts.get(this.importId);

        if (!imported) {
          throw new Error(
            'This imported draft is no longer available. ' +
              'Return to your recipes and import the link again.',
          );
        }

        this.applyImportedDraft(imported);
        this.drafts.remove(this.importId);
      }

      this.ingredients.controls.forEach((_row, index) => {
        this.setUnit(index, false);
      });

      // Show the form while the photo is being prepared.
      this.loading.set(false);

      const photoUrl = imported?.draft.externalImageUrl;

      if (photoUrl) {
        await this.importPhoto(photoUrl);
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

  private applyImportedDraft(result: RecipeImportResult): void {
    const draft = result.draft;
    this.importDraftPending = true;
    const knownUnits = new Set(this.units().map((unit) => unit.code));

    this.importWarnings.set(result.warnings);
    this.importedYield.set(draft.originalYield);
    this.externalPhotoUrl.set(draft.externalImageUrl);

    this.form.patchValue({
      title: draft.title,
      description: draft.description ?? '',
      sourceUrl: draft.sourceUrl,
      servings: draft.servings,
    });

    this.ingredients.clear();
    this.importedIngredients.clear();

    for (const ingredient of draft.ingredients) {
      const unit = ingredient.unit && knownUnits.has(ingredient.unit) ? ingredient.unit : '';

      const row = this.makeIngredient({
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit,
        note: ingredient.note,
      });

      this.ingredients.push(row);
      this.importedIngredients.set(row, ingredient);
    }

    if (this.ingredients.length === 0) {
      this.ingredients.push(this.makeIngredient());
    }

    this.steps.clear();

    for (const step of draft.steps) {
      this.steps.push(this.makeStep(step));
    }

    if (this.steps.length === 0) {
      this.steps.push(this.makeStep(''));
    }

    this.form.markAsDirty();
    this.form.markAllAsTouched();
  }

  private async importPhoto(url: string): Promise<void> {
    this.preparingPhoto.set(true);
    this.photoError.set('');

    try {
      const blob = await prepareImportedPhoto(url);

      if (this.destroyRef.destroyed) return;

      this.setPendingPhoto(blob);
      this.externalPhotoUrl.set(null);
    } catch {
      if (!this.destroyRef.destroyed) {
        this.photoError.set(
          'The recipe was imported, but its photo could not be copied. ' +
            'Open the website photo below, save it, and upload it here.',
        );
      }
    } finally {
      if (!this.destroyRef.destroyed) {
        this.preparingPhoto.set(false);
      }
    }
  }

  addIngredient(): void {
    if (this.busy()) return;

    if (this.ingredients.length < 100) {
      this.ingredients.push(this.makeIngredient());
      this.form.markAsDirty();
    }
  }

  removeIngredient(index: number): void {
    if (this.busy()) return;

    if (this.ingredients.length > 1) {
      this.importedIngredients.delete(this.ingredients.at(index));
      this.ingredients.removeAt(index);
      this.form.markAsDirty();
    }
  }

  addStep(): void {
    if (this.busy()) return;

    if (this.steps.length < 100) {
      this.steps.push(this.makeStep(''));
      this.form.markAsDirty();
    }
  }

  removeStep(index: number): void {
    if (this.busy()) return;

    if (this.steps.length > 1) {
      this.steps.removeAt(index);
      this.form.markAsDirty();
    }
  }

  moveStep(index: number, direction: number): void {
    if (this.busy()) return;

    const target = index + direction;

    if (target < 0 || target >= this.steps.length) return;

    const control = this.steps.at(index);

    this.steps.removeAt(index);
    this.steps.insert(target, control);
    this.form.markAsDirty();
  }

  setUnit(index: number, dirty = true): void {
    const row = this.ingredients.at(index);
    const quantity = row.controls.quantity;

    if (row.controls.unit.value === 'toTaste') {
      quantity.clearValidators();
      quantity.setValue('');
      quantity.disable();
    } else {
      quantity.setValidators([quantityValid]);

      quantity.enable();
    }

    quantity.updateValueAndValidity();

    if (dirty) this.form.markAsDirty();
  }

  recordIngredientDraft(event: { row: IngredientForm; ingredient: ImportedIngredient }): void {
    this.importedIngredients.set(event.row, event.ingredient);
    this.form.markAsDirty();
  }

  confirmIngredientReview(row: IngredientForm): void {
    if (this.busy() || row.invalid) {
      row.markAllAsTouched();
      return;
    }
    const imported = this.importedIngredients.get(row);
    if (imported) {
      this.importedIngredients.set(row, { ...imported, requiresReview: false });
      this.form.markAsDirty();
    }
  }

  async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file || this.busy() || this.preparingPhoto()) return;

    this.preparingPhoto.set(true);
    this.photoError.set('');

    try {
      const blob = await preparePhoto(file);

      if (this.destroyRef.destroyed) return;

      this.setPendingPhoto(blob);
      this.externalPhotoUrl.set(null);
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        this.photoError.set(errorMessage(error));
      }
    } finally {
      if (!this.destroyRef.destroyed) {
        this.preparingPhoto.set(false);
      }
    }
  }

  private setPendingPhoto(blob: Blob): void {
    this.releasePreview();
    this.pendingPhoto = blob;
    this.photoRemoved = false;
    this.objectUrl = URL.createObjectURL(blob);
    this.preview.set(this.objectUrl);
  }

  removePhoto(): void {
    if (this.busy() || this.preparingPhoto()) return;

    this.releasePreview();
    this.pendingPhoto = null;
    this.photoRemoved = !!this.originalPhoto;
    this.preview.set(null);
    this.externalPhotoUrl.set(null);
    this.photoError.set('');
  }

  private releasePreview(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  hasUnsavedChanges(): boolean {
    return (
      this.importDraftPending ||
      this.ingredientDraftPending ||
      this.form.dirty ||
      this.pendingPhoto !== null ||
      this.photoRemoved
    );
  }

  navigationBlocked(): boolean {
    return this.busy() || this.preparingPhoto();
  }

  saveBlockReason(): string {
    if (this.ingredientDraftPending) return 'Add or clear Quick add.';
    if (!this.form.valid) return 'Check the highlighted fields.';
    if ([...this.importedIngredients.values()].some((item) => item.requiresReview)) {
      return 'Confirm ingredient reviews.';
    }
    return '';
  }

  canSave(): boolean {
    return (
      !this.loading() && !this.loadError() && !this.navigationBlocked() && !this.saveBlockReason()
    );
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.navigationBlocked()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  async save(): Promise<void> {
    if (this.loading() || this.loadError() || this.navigationBlocked()) return;

    this.error.set('');

    const blockedReason = this.saveBlockReason();
    if (blockedReason) {
      this.form.markAllAsTouched();
      this.error.set(blockedReason);
      return;
    }

    const raw = this.form.getRawValue();

    if (raw.servings === null) {
      this.form.controls.servings.markAsTouched();
      this.error.set('Enter the number of servings before saving.');
      return;
    }

    const input: RecipeInput = {
      title: raw.title.trim(),
      description: raw.description.trim() || null,
      sourceUrl: raw.sourceUrl.trim() || null,
      servings: raw.servings,
      ingredients: raw.ingredients.map((item) => ({
        ...item,
        name: item.name.trim(),
        note: item.note.trim() || null,
        quantity: item.unit === 'toTaste' ? '' : parseQuantity(item.quantity)!.canonical,
      })),
      steps: raw.steps.map((step) => step.trim()),
    };

    this.busy.set(true);
    this.form.disable();

    let textSaved = false;

    try {
      const id = this.savedId();

      const saved = id ? await this.api.update(id, input) : await this.api.create(input);

      this.savedId.set(saved.id);
      textSaved = true;
      this.importDraftPending = false;
      this.form.markAsPristine();

      if (this.pendingPhoto) {
        await this.api.upload(saved.id, this.pendingPhoto);
      } else if (this.photoRemoved) {
        await this.api.removeImage(saved.id);
      }

      this.pendingPhoto = null;
      this.photoRemoved = false;
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
        this.form.enable();

        this.ingredients.controls.forEach((_row, index) => {
          this.setUnit(index, false);
        });
      }
    }
  }
}
