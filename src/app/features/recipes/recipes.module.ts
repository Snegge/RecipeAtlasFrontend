import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { RecipesRoutingModule } from './recipes-routing.module';
import { RecipeListComponent } from './pages/recipe-list/recipe-list.component';
import { RecipeDetailComponent } from './pages/recipe-detail/recipe-detail.component';
import { RecipeEditorComponent } from './pages/recipe-editor/recipe-editor.component';
import { RecipeCardComponent } from './components/recipe-card/recipe-card.component';
import { IngredientEditorComponent } from './components/ingredient-editor/ingredient-editor.component';
import { StepEditorComponent } from './components/step-editor/step-editor.component';
import { PhotoPickerComponent } from './components/photo-picker/photo-picker.component';

@NgModule({
  declarations: [
    RecipeListComponent,
    RecipeDetailComponent,
    RecipeEditorComponent,
    RecipeCardComponent,
    IngredientEditorComponent,
    StepEditorComponent,
    PhotoPickerComponent,
  ],
  imports: [SharedModule, RecipesRoutingModule],
})
export class RecipesModule {}
