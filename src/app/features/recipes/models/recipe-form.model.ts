import { FormArray, FormControl, FormGroup } from '@angular/forms';

export type IngredientForm = FormGroup<{
  name: FormControl<string>;
  quantity: FormControl<string>;
  unit: FormControl<string>;
  note: FormControl<string>;
}>;
export type IngredientForms = FormArray<IngredientForm>;
export type StepForms = FormArray<FormControl<string>>;
export interface StepMove {
  index: number;
  direction: number;
}
