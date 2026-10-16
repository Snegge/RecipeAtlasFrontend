import { Component, HostListener, inject } from '@angular/core';
import { IngredientForm } from '../../models/recipe-form.model';
import { ImportedIngredient } from '../../../../core/models/recipe-import.model';
import { RecipeEditorCoordinator } from './recipe-editor-coordinator';
import { RecipeEditorForm } from './recipe-editor-form';
import { RecipeEditorPhoto } from './recipe-editor-photo';

@Component({
  selector: 'app-recipe-editor',
  standalone: false,
  templateUrl: './recipe-editor.component.html',
  styleUrl: './recipe-editor.component.scss',
  providers: [RecipeEditorCoordinator, RecipeEditorForm, RecipeEditorPhoto],
})
export class RecipeEditorComponent {
  readonly editor = inject(RecipeEditorCoordinator);
  readonly cookbookId = this.editor.cookbookId;
  readonly recipeRoot = this.editor.recipeRoot;
  readonly photos = this.editor.photos;
  readonly savedId = this.editor.savedId;
  readonly loading = this.editor.loading;
  readonly loadError = this.editor.loadError;
  readonly error = this.editor.error;
  readonly busy = this.editor.busy;
  readonly form = this.editor.forms.form;
  readonly ingredients = this.editor.forms.ingredients;
  readonly steps = this.editor.forms.steps;
  readonly units = this.editor.forms.units;
  readonly importedIngredients = this.editor.forms.importedIngredients;
  readonly importWarnings = this.editor.forms.importWarnings;
  readonly importedYield = this.editor.forms.importedYield;
  readonly preparingPhoto = this.photos.preparingPhoto;
  readonly photoError = this.photos.photoError;
  readonly preview = this.photos.preview;
  readonly externalPhotoUrl = this.photos.externalPhotoUrl;
  get ingredientDraftPending(): boolean {
    return this.editor.forms.ingredientDraftPending;
  }
  set ingredientDraftPending(value: boolean) {
    this.editor.forms.ingredientDraftPending = value;
  }
  load() {
    return this.editor.load();
  }
  save() {
    return this.editor.save();
  }
  hasUnsavedChanges() {
    return this.editor.hasUnsavedChanges();
  }
  navigationBlocked() {
    return this.editor.navigationBlocked();
  }
  saveBlockReason() {
    return this.editor.saveBlockReason();
  }
  canSave() {
    return this.editor.canSave();
  }
  addIngredient() {
    this.editor.forms.addIngredient(this.busy());
  }
  removeIngredient(index: number) {
    this.editor.forms.removeIngredient(index, this.busy());
  }
  addStep() {
    this.editor.forms.addStep(this.busy());
  }
  removeStep(index: number) {
    this.editor.forms.removeStep(index, this.busy());
  }
  moveStep(index: number, direction: number) {
    this.editor.forms.moveStep(index, direction, this.busy());
  }
  setUnit(index: number, dirty = true) {
    this.editor.forms.setUnit(index, dirty);
  }
  recordIngredientDraft(event: { row: IngredientForm; ingredient: ImportedIngredient }) {
    this.editor.forms.recordIngredientDraft(event);
  }
  confirmIngredientReview(row: IngredientForm) {
    this.editor.forms.confirmIngredientReview(row, this.busy());
  }
  async choosePhoto(event: Event): Promise<void> {
    await this.photos.choosePhoto(event, this.busy());
  }
  removePhoto() {
    if (!this.busy()) this.photos.removePhoto();
  }
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.navigationBlocked()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
