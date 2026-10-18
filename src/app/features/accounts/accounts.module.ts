import { unsavedGuard } from '../../core/guards/unsaved-changes.guard';
import { AppSettingsComponent } from './app-settings.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { authGuard } from '../../core/guards/auth.guard';
import { administratorGuard } from '../../core/guards/cookbook.guard';
import { InvitationPageComponent } from './invitation-page.component';
import { AccountSettingsComponent } from './account-settings.component';
import { AccountAdminComponent } from './account-admin.component';
const routes: Routes = [
  {
    path: 'settings',
    component: AppSettingsComponent,
    canActivate: [authGuard],
    title: 'Settings · Recipoke',
  },
  { path: 'invite', component: InvitationPageComponent, title: 'Invitation · Recipoke' },
  {
    path: 'account',
    component: AccountSettingsComponent,
    canDeactivate: [unsavedGuard],
    canActivate: [authGuard],
    title: 'Your account · Recipoke',
  },
  {
    path: 'admin',
    component: AccountAdminComponent,
    canActivate: [administratorGuard],
    title: 'Accounts Manager · Recipoke',
  },
];
@NgModule({
  declarations: [
    InvitationPageComponent,
    AccountSettingsComponent,
    AccountAdminComponent,
    AppSettingsComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class AccountsModule {}
