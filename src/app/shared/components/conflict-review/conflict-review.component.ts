import { Component, inject } from '@angular/core';
import { FormControl, FormRecord, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type ConflictSource = 'local' | 'server';
export interface ConflictField {
  id: string;
  label: string;
  local: string;
  server: string;
  localImage?: string | null;
  serverImage?: string | null;
  canKeepLocal?: boolean;
}
export interface ConflictReviewData {
  title: string;
  explanation: string;
  fields: ConflictField[];
}

// Presentation only: callers own versions, fetching, authorization, and applying the selected values.
@Component({
  selector: 'app-conflict-review',
  standalone: false,
  templateUrl: './conflict-review.component.html',
  styleUrl: './conflict-review.component.scss',
})
export class ConflictReviewComponent {
  readonly data = inject<ConflictReviewData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialogRef<ConflictReviewComponent>);
  readonly choices = new FormRecord<FormControl<ConflictSource | null>>(
    Object.fromEntries(
      this.data.fields.map((field) => [
        field.id,
        new FormControl<ConflictSource | null>(
          field.canKeepLocal === false ? 'server' : null,
          Validators.required,
        ),
      ]),
    ),
  );
  apply() {
    if (this.choices.valid) this.dialog.close(this.choices.getRawValue());
  }
}
