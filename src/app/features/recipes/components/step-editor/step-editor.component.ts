import { Component, EventEmitter, Input, Output } from '@angular/core';
import { StepForms, StepMove } from '../../models/recipe-form.model';

@Component({
  selector: 'app-step-editor',
  standalone: false,
  templateUrl: './step-editor.component.html',
  styleUrl: './step-editor.component.scss',
})
export class StepEditorComponent {
  @Input({ required: true }) steps!: StepForms;
  @Input() busy = false;
  @Output() readonly stepAdded = new EventEmitter<void>();
  @Output() readonly stepRemoved = new EventEmitter<number>();
  @Output() readonly stepMoved = new EventEmitter<StepMove>();
}
