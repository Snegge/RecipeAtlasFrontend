import { Component, Input } from '@angular/core';
import { RecipeCard } from '../../../../core/models/recipe.model';
@Component({
  selector: 'app-recipe-card',
  standalone: false,
  templateUrl: './recipe-card.component.html',
  styleUrl: './recipe-card.component.scss',
})
export class RecipeCardComponent {
  @Input({ required: true }) recipe!: RecipeCard;
  hideBrokenImage(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
