import { errorMessage } from '../../../../core/utils/api-error';
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
import { Ingredient, RecipeInput, Unit } from '../../../../core/models/recipe.model';
import { preparePhoto } from '../../../../core/utils/photo';

const textRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };
const threeDecimals: ValidatorFn = (control) =>
  control.value === null ||
  Math.abs(control.value * 1000 - Math.round(control.value * 1000)) < 0.00001
    ? null
    : { precision: true };
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  readonly savedId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly preparingPhoto = signal(false);
  readonly photoError = signal('');
  readonly units = signal<Unit[]>([]);
  readonly preview = signal<string | null>(null);
  private pendingPhoto: Blob | null = null;
  private photoRemoved = false;
  private originalPhoto: string | null = null;
  private objectUrl: string | null = null;
  readonly ingredients = new FormArray([this.makeIngredient()]);
  readonly steps = new FormArray([this.makeStep('')]);
  readonly form = this.fb.group({
    title: ['', [textRequired, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(4000)],
    sourceUrl: ['', [sourceUrl, Validators.maxLength(2048)]],
    servings: [2, [Validators.required, Validators.min(1), Validators.max(1000), integer]],
    ingredients: this.ingredients,
    steps: this.steps,
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => this.releasePreview());
    void this.load();
  }
  private makeIngredient(input?: Ingredient) {
    return this.fb.group({
      name: [input?.name ?? '', [textRequired, Validators.maxLength(200)]],
      quantity: new FormControl<number | null>(
        input?.quantity ?? null,
        input?.unit === 'toTaste'
          ? []
          : [Validators.required, Validators.min(0.001), Validators.max(100000), threeDecimals],
      ),
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
  async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const id = this.savedId();
      const [units, recipe] = await Promise.all([
        this.api.units(),
        id ? this.api.get(id) : Promise.resolve(null),
      ]);
      this.units.set(units);
      if (recipe) {
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
        this.originalPhoto = recipe.imageUrl;
        this.preview.set(recipe.imageUrl);
      }
      this.ingredients.controls.forEach((_row, index) => this.setUnit(index, false));
      this.form.markAsPristine();
    } catch (error) {
      this.loadError.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  addIngredient() {
    if (this.ingredients.length < 100) {
      this.ingredients.push(this.makeIngredient());
      this.form.markAsDirty();
    }
  }
  removeIngredient(index: number) {
    if (this.ingredients.length > 1) {
      this.ingredients.removeAt(index);
      this.form.markAsDirty();
    }
  }
  addStep() {
    if (this.steps.length < 100) {
      this.steps.push(this.makeStep(''));
      this.form.markAsDirty();
    }
  }
  removeStep(index: number) {
    if (this.steps.length > 1) {
      this.steps.removeAt(index);
      this.form.markAsDirty();
    }
  }
  moveStep(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= this.steps.length) return;
    const control = this.steps.at(index);
    this.steps.removeAt(index);
    this.steps.insert(target, control);
    this.form.markAsDirty();
  }
  setUnit(index: number, dirty = true) {
    const row = this.ingredients.at(index);
    const quantity = row.controls.quantity;
    if (row.controls.unit.value === 'toTaste') {
      quantity.clearValidators();
      quantity.setValue(null);
      quantity.disable();
    } else {
      quantity.setValidators([
        Validators.required,
        Validators.min(0.001),
        Validators.max(100000),
        threeDecimals,
      ]);
      quantity.enable();
    }
    quantity.updateValueAndValidity();
    if (dirty) this.form.markAsDirty();
  }
  async choosePhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy() || this.preparingPhoto()) return;
    this.preparingPhoto.set(true);
    this.photoError.set('');
    try {
      const blob = await preparePhoto(file);
      this.releasePreview();
      this.pendingPhoto = blob;
      this.photoRemoved = false;
      this.objectUrl = URL.createObjectURL(blob);
      this.preview.set(this.objectUrl);
    } catch (error) {
      this.photoError.set(errorMessage(error));
    } finally {
      this.preparingPhoto.set(false);
    }
  }
  removePhoto() {
    this.releasePreview();
    this.pendingPhoto = null;
    this.photoRemoved = !!this.originalPhoto;
    this.preview.set(null);
    this.photoError.set('');
  }
  private releasePreview() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
  hasUnsavedChanges() {
    return this.form.dirty || this.pendingPhoto !== null || this.photoRemoved;
  }
  navigationBlocked() {
    return this.busy() || this.preparingPhoto();
  }
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges() || this.navigationBlocked()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  async save() {
    if (this.busy() || this.preparingPhoto()) return;
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted fields before saving.');
      return;
    }
    const raw = this.form.getRawValue();
    const input: RecipeInput = {
      title: raw.title.trim(),
      description: raw.description.trim() || null,
      sourceUrl: raw.sourceUrl.trim() || null,
      servings: raw.servings,
      ingredients: raw.ingredients.map((item) => ({
        ...item,
        name: item.name.trim(),
        note: item.note.trim() || null,
        quantity: item.unit === 'toTaste' ? null : item.quantity,
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
      this.form.markAsPristine();
      if (this.pendingPhoto) await this.api.upload(saved.id, this.pendingPhoto);
      else if (this.photoRemoved) await this.api.removeImage(saved.id);
      this.pendingPhoto = null;
      this.photoRemoved = false;
      this.busy.set(false);
      this.snack.open('Recipe saved', 'Close', { duration: 3000 });
      await this.router.navigate(['/recipes', saved.id]);
    } catch (error) {
      this.error.set(
        textSaved
          ? 'Your recipe was saved, but the photo change failed. Press Save again to retry. ' +
              errorMessage(error)
          : errorMessage(error),
      );
    } finally {
      this.busy.set(false);
      this.form.enable();
      this.ingredients.controls.forEach((_row, index) => this.setUnit(index, false));
    }
  }
}
