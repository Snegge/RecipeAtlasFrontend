import { NgModule } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { authGuard } from '../../core/guards/auth.guard';
import { unsavedGuard } from '../../core/guards/unsaved-changes.guard';
import { ShoppingOverviewComponent } from './pages/shopping-overview/shopping-overview.component';
import { ShoppingDetailComponent } from './pages/shopping-detail/shopping-detail.component';
import { ShoppingSettingsComponent } from './pages/shopping-settings/shopping-settings.component';
@NgModule({
  declarations: [ShoppingOverviewComponent, ShoppingDetailComponent, ShoppingSettingsComponent],
  imports: [
    SharedModule,
    MatTabsModule,
    RouterModule.forChild([
      {
        path: '',
        component: ShoppingOverviewComponent,
        canActivate: [authGuard],
        canDeactivate: [unsavedGuard],
        title: 'Shopping lists · Recipoke',
      },
      {
        path: ':listId',
        component: ShoppingDetailComponent,
        canActivate: [authGuard],
        canDeactivate: [unsavedGuard],
        title: 'Shopping list · Recipoke',
      },
    ]),
  ],
})
export class ShoppingModule {}
