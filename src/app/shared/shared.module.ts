import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MaterialModule } from './material.module';
import { IconComponent } from './components/icon/icon.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';

@NgModule({
  declarations: [IconComponent, ConfirmDialogComponent],
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MaterialModule],
  exports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MaterialModule,
    IconComponent,
    ConfirmDialogComponent,
  ],
})
export class SharedModule {}
