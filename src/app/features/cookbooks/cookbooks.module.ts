import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { authGuard } from '../../core/guards/auth.guard';
import { cookbookGuard } from '../../core/guards/cookbook.guard';
import { CookbookOverviewComponent } from './cookbook-overview.component';
import { CookbookSettingsComponent } from './cookbook-settings.component';
@NgModule({
  declarations: [CookbookOverviewComponent, CookbookSettingsComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {
        path: '',
        component: CookbookOverviewComponent,
        canActivate: [authGuard],
        title: 'Cookbooks · Recipoke',
      },
      {
        path: ':cookbookId/settings',
        component: CookbookSettingsComponent,
        canActivate: [cookbookGuard],
        data: { manage: true },
        title: 'Cookbook settings · Recipoke',
      },
    ]),
  ],
})
export class CookbooksModule {}
