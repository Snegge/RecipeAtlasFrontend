import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, takeUntil } from 'rxjs';

import { RecipeImportService } from '../../../../core/services/recipe-import.service';
import { RecipeImportResult } from '../../../../core/models/recipe-import.model';

const httpsUrl: ValidatorFn = (control) => {
  try {
    const url = new URL(String(control.value).trim());

    return (
      url.protocol === 'https:' &&
      (!url.port || url.port === '443') &&
      !url.username &&
      !url.password
    )
      ? null
      : { url: true };
  } catch {
    return { url: true };
  }
};

@Component({
  selector: 'app-recipe-import-dialog',
  standalone: false,
  templateUrl: './recipe-import-dialog.component.html',
  styleUrl: './recipe-import-dialog.component.scss',
})
export class RecipeImportDialogComponent {
  private readonly api = inject(RecipeImportService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly dialogRef =
    inject<MatDialogRef<RecipeImportDialogComponent, RecipeImportResult>>(
      MatDialogRef,
    );

  readonly step = signal<'source' | 'link'>('source');
  readonly busy = signal(false);
  readonly error = signal('');

  readonly url = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.maxLength(2048),
      httpsUrl,
    ],
  });
  readonly form = new FormGroup({
    url: this.url,
  });

  @ViewChild('linkInput')
  set linkInput(input: ElementRef<HTMLInputElement> | undefined) {
    input?.nativeElement.focus();
  }

  chooseLink(): void {
    this.error.set('');
    this.step.set('link');
  }

  back(): void {
    if (this.busy()) return;

    this.error.set('');
    this.step.set('source');
  }

  cancel(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.step() !== 'link' || this.busy()) return;

    this.error.set('');

    if (this.url.invalid) {
      this.url.markAsTouched();
      return;
    }

    this.busy.set(true);

    this.api.importLink(this.url.value.trim())
      .pipe(
        takeUntil(this.dialogRef.beforeClosed()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => this.dialogRef.close(result),
        error: (error: unknown) => {
          this.error.set(this.failureMessage(error));
        },
      });
  }

  private failureMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      switch (error.status) {
        case 0:
          return 'Cannot reach RecipeAtlas. Check your connection and try again.';
        case 401:
          return 'Your session has ended. Close this dialog and sign in again.';
        case 429:
          return 'Too many imports. Wait a minute and try again.';
        case 504:
          return 'The website took too long to respond. Please try again.';
      }

      const title = error.error?.title;

      if (typeof title === 'string') {
        if (title.includes('HTTP 403')) {
          return 'This website blocked automatic import. Try another link or add the recipe manually.';
        }

        return title;
      }
    }

    return 'The recipe could not be imported. Please try again.';
  }
}