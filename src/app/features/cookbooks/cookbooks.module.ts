import { MatMenuModule } from '@angular/material/menu';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { authGuard } from '../../core/guards/auth.guard';
import { cookbookGuard } from '../../core/guards/cookbook.guard';
import { CookbookOverviewComponent } from './pages/cookbook-overview/cookbook-overview.component';
import { CookbookEditorComponent } from './pages/cookbook-editor/cookbook-editor.component';
import { CookbookInvitationsComponent } from './components/cookbook-invitations/cookbook-invitations.component';
import { unsavedGuard } from '../../core/guards/unsaved-changes.guard';
@NgModule({
  declarations: [CookbookOverviewComponent, CookbookEditorComponent, CookbookInvitationsComponent],
  imports: [
    SharedModule,
    MatMenuModule,
    RouterModule.forChild([
      {
        path: 'new',
        component: CookbookEditorComponent,
        canActivate: [authGuard],
        canDeactivate: [unsavedGuard],
        data: { create: true },
        title: 'Create cookbook · Recipoke',
      },
      {
        path: '',
        component: CookbookOverviewComponent,
        canActivate: [authGuard],
        title: 'Cookbooks · Recipoke',
      },
      {
        path: ':cookbookId/settings',
        component: CookbookEditorComponent,
        canDeactivate: [unsavedGuard],
        canActivate: [cookbookGuard],
        data: { manage: true },
        title: 'Cookbook settings · Recipoke',
      },
    ]),
  ],
})
export class CookbooksModule {}
