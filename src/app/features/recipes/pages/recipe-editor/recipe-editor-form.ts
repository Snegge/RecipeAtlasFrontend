import { Injectable, inject, signal } from '@angular/core';
import { Recipe, RecipeInput, Ingredient, Unit } from '../../../../core/models/recipe.model';
import {
  ImportedIngredient,
  RecipeImportResult,
} from '../../../../core/models/recipe-import.model';
import { IngredientForm } from '../../models/recipe-form.model';
import {
  FormArray,
  FormControl,
  NonNullableFormBuilder,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { parseQuantity } from '../../../../core/utils/quantity';

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

export type RecipeEditValues = Omit<RecipeInput, 'servings'> & { servings: number | null };

// One instance per editor. Owns form values, validation and import-review metadata.
@Injectable()
export class RecipeEditorForm {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly units = signal<Unit[]>([]);
  readonly importWarnings = signal<string[]>([]);
  readonly importedYield = signal<string | null>(null);
  readonly importedIngredients = new Map<IngredientForm, ImportedIngredient>();
  ingredientDraftPending = false;
  importDraftPending = false;
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

  applyImportedDraft(result: RecipeImportResult): void {
    const draft = result.draft;
    this.importDraftPending = true;
    const knownUnits = new Set(this.units().map((unit) => unit.code));

    this.importWarnings.set(result.warnings);
    this.importedYield.set(draft.originalYield);

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

  addIngredient(busy = false): void {
    if (busy) return;

    if (this.ingredients.length < 100) {
      this.ingredients.push(this.makeIngredient());
      this.form.markAsDirty();
    }
  }

  removeIngredient(index: number, busy = false): void {
    if (busy) return;

    if (this.ingredients.length > 1) {
      this.importedIngredients.delete(this.ingredients.at(index));
      this.ingredients.removeAt(index);
      this.form.markAsDirty();
    }
  }

  addStep(busy = false): void {
    if (busy) return;

    if (this.steps.length < 100) {
      this.steps.push(this.makeStep(''));
      this.form.markAsDirty();
    }
  }

  removeStep(index: number, busy = false): void {
    if (busy) return;

    if (this.steps.length > 1) {
      this.steps.removeAt(index);
      this.form.markAsDirty();
    }
  }

  moveStep(index: number, direction: number, busy = false): void {
    if (busy) return;

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

  confirmIngredientReview(row: IngredientForm, busy = false): void {
    if (busy || row.invalid) {
      row.markAllAsTouched();
      return;
    }
    const imported = this.importedIngredients.get(row);
    if (imported) {
      this.importedIngredients.set(row, { ...imported, requiresReview: false });
      this.form.markAsDirty();
    }
  }

  saveBlockReason(): string {
    if (this.ingredientDraftPending) return 'Add or clear Quick add.';
    if (!this.form.valid) return 'Check the highlighted fields.';
    if ([...this.importedIngredients.values()].some((item) => item.requiresReview)) {
      return 'Confirm ingredient reviews.';
    }
    return '';
  }

  clear(): void {
    this.form.reset();
    this.ingredients.clear();
    this.steps.clear();
    this.importedIngredients.clear();
    this.importWarnings.set([]);
    this.importedYield.set(null);
    this.units.set([]);
    this.ingredientDraftPending = false;
    this.importDraftPending = false;
  }
  snapshot(): RecipeEditValues {
    const raw = this.form.getRawValue();
    return {
      ...raw,
      sourceUrl: raw.sourceUrl,
      ingredients: raw.ingredients.map((row) => ({ ...row })),
    };
  }
  applyRecipe(recipe: RecipeEditValues): void {
    this.importedIngredients.clear();
    this.importWarnings.set([]);
    this.importedYield.set(null);
    this.ingredientDraftPending = false;
    this.importDraftPending = false;
    this.form.patchValue({
      title: recipe.title,
      description: recipe.description ?? '',
      sourceUrl: recipe.sourceUrl ?? '',
      servings: recipe.servings,
    });
    this.ingredients.clear();
    recipe.ingredients.forEach((item) => this.ingredients.push(this.makeIngredient(item)));
    this.steps.clear();
    recipe.steps.forEach((step) => this.steps.push(this.makeStep(step)));
  }
  hasUnsavedChanges(): boolean {
    return this.importDraftPending || this.ingredientDraftPending || this.form.dirty;
  }
  input(): RecipeInput {
    const raw = this.form.getRawValue();
    return {
      title: raw.title.trim(),
      description: raw.description.trim() || null,
      sourceUrl: raw.sourceUrl.trim() || null,
      servings: raw.servings!,
      ingredients: raw.ingredients.map((item) => ({
        ...item,
        name: item.name.trim(),
        note: item.note.trim() || null,
        quantity: item.unit === 'toTaste' ? '' : parseQuantity(item.quantity)!.canonical,
      })),
      steps: raw.steps.map((step) => step.trim()),
    };
  }
}
