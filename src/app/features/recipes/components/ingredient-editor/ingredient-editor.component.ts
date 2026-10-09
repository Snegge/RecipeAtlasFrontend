import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

import { Unit } from '../../../../core/models/recipe.model';
import { IngredientForms } from '../../models/recipe-form.model';
import { parseIngredient } from '../../utils/ingredient-parser';

@Component({
  selector: 'app-ingredient-editor',
  standalone: false,
  templateUrl: './ingredient-editor.component.html',
  styleUrl: './ingredient-editor.component.scss',
})
export class IngredientEditorComponent {
  @Input({ required: true })
  ingredients!: IngredientForms;

  @Input({ required: true })
  units: Unit[] = [];

  @Input()
  busy = false;

  @Output()
  readonly ingredientAdded = new EventEmitter<void>();

  @Output()
  readonly ingredientRemoved = new EventEmitter<number>();

  @Output()
  readonly unitChanged = new EventEmitter<number>();

  @Output()
  readonly draftPendingChange = new EventEmitter<boolean>();

  @ViewChild('quickInput')
  quickInput?: ElementRef<HTMLInputElement>;

  quickEntry = '';
  quickError = '';
  quickStatus = '';

  onQuickInput(event: Event): void {
    this.quickEntry = (event.target as HTMLInputElement).value;
    this.quickError = '';
    this.quickStatus = '';

    this.draftPendingChange.emit(
      this.quickEntry.trim().length > 0,
    );
  }

  onQuickEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();

    if (
      keyboardEvent.isComposing ||
      keyboardEvent.keyCode === 229 ||
      keyboardEvent.repeat
    ) {
      return;
    }

    this.addQuickIngredient();
  }

  clearQuickEntry(): void {
    if (this.busy) return;

    this.quickEntry = '';
    this.quickError = '';
    this.draftPendingChange.emit(false);

    this.quickInput?.nativeElement.focus();
  }

  addQuickIngredient(): void {
    if (this.busy) return;

    this.quickError = '';
    this.quickStatus = '';

    const result = parseIngredient(this.quickEntry);

    if (!result.success) {
      this.quickError = result.error;
      return;
    }

    const ingredient = result.ingredient;

    if (
      !this.units.some(
        (unit) => unit.code === ingredient.unit,
      )
    ) {
      this.quickError =
        'This unit is not available in your backend.';
      return;
    }

    // Reuse an untouched blank row without overwriting edits.
    let row = this.ingredients.controls.find(
      (candidate) =>
        candidate.pristine &&
        !candidate.controls.name.value.trim() &&
        candidate.controls.quantity.value === null &&
        !candidate.controls.note.value.trim(),
    );

    if (!row) {
      if (this.ingredients.length >= 100) {
        this.quickError =
          'A recipe can contain up to 100 ingredients.';
        return;
      }

      const previousLength = this.ingredients.length;

      this.ingredientAdded.emit();

      if (
        this.ingredients.length !== previousLength + 1
      ) {
        this.quickError =
          'Could not create an ingredient row.';
        return;
      }

      row = this.ingredients.at(previousLength);
    }

    row.patchValue({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      note: ingredient.note ?? '',
    });

    const index = this.ingredients.controls.indexOf(row);

    // The parent applies quantity validators for this unit.
    this.unitChanged.emit(index);

    row.markAsDirty();

    this.quickStatus = `Added ${ingredient.name}.`;
    this.clearQuickEntry();
  }

  addManually(): void {
    if (this.busy || this.ingredients.length >= 100) {
      return;
    }

    this.ingredientAdded.emit();
  }

  removeIngredient(index: number): void {
    if (
      this.busy ||
      this.ingredients.length <= 1 ||
      index < 0 ||
      index >= this.ingredients.length
    ) {
      return;
    }

    this.ingredientRemoved.emit(index);
  }

  unitLabel(code: string): string {
    switch (code) {
      case 'piece':
        return 'Piece / Stück';
      case 'pinch':
        return 'Pinch / Prise';
      case 'tsp':
        return 'tsp / TL';
      case 'tbsp':
        return 'tbsp / EL';
      case 'toTaste':
        return 'To taste / Nach Geschmack';
      default:
        return code;
    }
  }
}