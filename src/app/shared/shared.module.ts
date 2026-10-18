import { AvatarComponent } from './components/avatar/avatar.component';
import { MaterialIcons } from './icons/material-icons.service';
import { NgModule, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MaterialModule } from './material.module';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';

@NgModule({
  declarations: [ConfirmDialogComponent, AvatarComponent],
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MaterialModule],
  exports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MaterialModule,
    ConfirmDialogComponent,
    AvatarComponent,
  ],
})
export class SharedModule {
  private readonly icons = inject(MaterialIcons);
}
