import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.module').then((m) => m.AuthModule),
  },
  {
    path: 'recipes',
    loadChildren: () => import('./features/recipes/recipes.module').then((m) => m.RecipesModule),
  },
  { path: '', pathMatch: 'full', redirectTo: 'recipes' },
  { path: '**', redirectTo: 'recipes' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
