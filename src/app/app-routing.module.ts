import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.module').then((m) => m.AuthModule),
  },
  {
    path: 'cookbooks/:cookbookId/recipes',
    loadChildren: () => import('./features/recipes/recipes.module').then((m) => m.RecipesModule),
  },
  {
    path: 'cookbooks',
    loadChildren: () =>
      import('./features/cookbooks/cookbooks.module').then((m) => m.CookbooksModule),
  },
  { path: '', pathMatch: 'full', redirectTo: 'cookbooks' },
  {
    path: '',
    loadChildren: () => import('./features/accounts/accounts.module').then((m) => m.AccountsModule),
  },
  { path: '**', redirectTo: 'cookbooks' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
