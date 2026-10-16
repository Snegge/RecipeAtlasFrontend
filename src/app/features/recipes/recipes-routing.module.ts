import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { unsavedGuard } from '../../core/guards/unsaved-changes.guard';
import { RecipeListComponent } from './pages/recipe-list/recipe-list.component';
import { RecipeDetailComponent } from './pages/recipe-detail/recipe-detail.component';
import { RecipeEditorComponent } from './pages/recipe-editor/recipe-editor.component';

const routes: Routes = [
  {
    path: '',
    component: RecipeListComponent,
    canActivate: [authGuard],
    title: 'Your recipes · Recipoke',
  },
  {
    path: 'new',
    component: RecipeEditorComponent,
    canActivate: [authGuard],
    canDeactivate: [unsavedGuard],
    title: 'Add recipe · Recipoke',
  },
  {
    path: ':id/edit',
    component: RecipeEditorComponent,
    canActivate: [authGuard],
    canDeactivate: [unsavedGuard],
    title: 'Edit recipe · Recipoke',
  },
  {
    path: ':id',
    component: RecipeDetailComponent,
    canActivate: [authGuard],
    title: 'Recipe · Recipoke',
  },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class RecipesRoutingModule {}
