import { unsavedGuard } from '../../core/guards/unsaved-changes.guard';
import { AppSettingsComponent } from './pages/app-settings/app-settings.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { authGuard } from '../../core/guards/auth.guard';
import { administratorGuard } from '../../core/guards/cookbook.guard';
import { InvitationPageComponent } from './pages/invitation-page/invitation-page.component';
import { AccountSettingsComponent } from './pages/account-settings/account-settings.component';
import { AccountAdminComponent } from './pages/account-admin/account-admin.component';
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
