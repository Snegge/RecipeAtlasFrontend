import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { map } from 'rxjs';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

export interface DirtyPage {
  hasUnsavedChanges(): boolean;
  navigationBlocked?(): boolean;
}
export const unsavedGuard: CanDeactivateFn<DirtyPage> = (component) => {
  if (component.navigationBlocked?.()) return false;
  if (!component.hasUnsavedChanges()) return true;
  return inject(MatDialog)
    .open(ConfirmDialogComponent, {
      data: {
        title: 'Discard your changes?',
        message: 'Your unsaved changes will be lost.',
        action: 'Discard changes',
      },
      maxWidth: '420px',
      width: 'calc(100% - 32px)',
    })
    .afterClosed()
    .pipe(map(Boolean));
};
