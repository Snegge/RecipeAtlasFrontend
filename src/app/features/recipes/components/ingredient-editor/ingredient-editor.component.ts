import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Unit } from '../../../../core/models/recipe.model';
import { IngredientForms } from '../../models/recipe-form.model';

@Component({
  selector: 'app-ingredient-editor',
  standalone: false,
  templateUrl: './ingredient-editor.component.html',
  styleUrl: './ingredient-editor.component.scss',
})
export class IngredientEditorComponent {
  @Input({ required: true }) ingredients!: IngredientForms;
  @Input({ required: true }) units: Unit[] = [];
  @Input() busy = false;
  @Output() readonly ingredientAdded = new EventEmitter<void>();
  @Output() readonly ingredientRemoved = new EventEmitter<number>();
  @Output() readonly unitChanged = new EventEmitter<number>();
}
