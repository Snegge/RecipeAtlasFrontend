import { CookbookContext } from '../../../../core/services/cookbook-context';
import { Component, Input, inject } from '@angular/core';
import { RecipeCard } from '../../../../core/models/recipe.model';
@Component({
  selector: 'app-recipe-card',
  standalone: false,
  templateUrl: './recipe-card.component.html',
  styleUrl: './recipe-card.component.scss',
})
export class RecipeCardComponent {
  readonly cookbooks = inject(CookbookContext);
  @Input({ required: true }) recipe!: RecipeCard;
  hideBrokenImage(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
