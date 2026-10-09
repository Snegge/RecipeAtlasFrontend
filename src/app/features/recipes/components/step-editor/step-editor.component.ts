import {
  afterNextRender,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Injector,
  Input,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';

import { StepForms } from '../../models/recipe-form.model';

@Component({
  selector: 'app-step-editor',
  standalone: false,
  templateUrl: './step-editor.component.html',
  styleUrl: './step-editor.component.scss',
})
export class StepEditorComponent {
  private readonly injector = inject(Injector);

  @Input({ required: true })
  steps!: StepForms;

  @Input()
  busy = false;

  @Output()
  readonly stepAdded = new EventEmitter<void>();

  @Output()
  readonly stepRemoved = new EventEmitter<number>();

  @ViewChildren('stepInput')
  private stepInputs!: QueryList<
    ElementRef<HTMLTextAreaElement>
  >;

  addStep(): void {
    if (this.busy || this.steps.length >= 100) {
      return;
    }

    const previousLength = this.steps.length;

    this.stepAdded.emit();

    if (this.steps.length !== previousLength + 1) {
      return;
    }

    afterNextRender(
      () => {
        this.stepInputs.last?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  removeStep(index: number): void {
    if (
      this.busy ||
      this.steps.length <= 1 ||
      index < 0 ||
      index >= this.steps.length
    ) {
      return;
    }

    const previousLength = this.steps.length;

    this.stepRemoved.emit(index);

    if (this.steps.length !== previousLength - 1) {
      return;
    }

    // Keep keyboard focus in the list after removal.
    afterNextRender(
      () => {
        const nextIndex = Math.min(
          index,
          this.stepInputs.length - 1,
        );

        this.stepInputs
          .get(nextIndex)
          ?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}