import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { cookbookGuard } from '../../core/guards/cookbook.guard';
import { unsavedGuard } from '../../core/guards/unsaved-changes.guard';
import { RecipeListComponent } from './pages/recipe-list/recipe-list.component';
import { RecipeDetailComponent } from './pages/recipe-detail/recipe-detail.component';
import { RecipeEditorComponent } from './pages/recipe-editor/recipe-editor.component';

const routes: Routes = [
  {
    path: '',
    component: RecipeListComponent,
    canActivate: [cookbookGuard],
    title: 'Your recipes · Recipoke',
  },
  {
    path: 'new',
    data: { write: true },
    component: RecipeEditorComponent,
    canActivate: [cookbookGuard],
    canDeactivate: [unsavedGuard],
    title: 'Add recipe · Recipoke',
  },
  {
    path: ':id/edit',
    data: { write: true },
    component: RecipeEditorComponent,
    canActivate: [cookbookGuard],
    canDeactivate: [unsavedGuard],
    title: 'Edit recipe · Recipoke',
  },
  {
    path: ':id',
    component: RecipeDetailComponent,
    canActivate: [cookbookGuard],
    title: 'Recipe · Recipoke',
  },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class RecipesRoutingModule {}
