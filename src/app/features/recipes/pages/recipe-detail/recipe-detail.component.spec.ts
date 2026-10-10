import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { RecipesModule } from '../../recipes.module';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { RecipeDetailComponent } from './recipe-detail.component';
import { Recipe } from '../../../../core/models/recipe.model';

describe('Recipe detail serving display', () => {
  it('scales ranges/fractions from stored originals without changing the recipe', async () => {
    const recipe: Recipe = {
      id: 'r',
      title: 'Eggs',
      description: null,
      sourceUrl: null,
      servings: 2,
      ingredients: [
        { name: 'Eggs', quantity: '3-4', unit: 'piece', note: null },
        { name: 'Oil', quantity: '1/3', unit: 'tbsp', note: null },
        { name: 'Legacy', quantity: 'broken', unit: 'g', note: null },
        { name: 'Salt', quantity: '', unit: 'toTaste', note: null },
      ],
      steps: ['Cook'],
      imageUrl: null,
      createdAtUtc: '',
      updatedAtUtc: '',
    };
    const original = structuredClone(recipe);
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [
        provideRouter([]),
        { provide: RecipeApiService, useValue: { get: vi.fn().mockResolvedValue(recipe) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const selector: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Servings to prepare"]',
    );
    selector.value = '4';
    selector.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('6-8');
    expect(fixture.nativeElement.textContent).toContain('2/3');
    expect(fixture.nativeElement.textContent).toContain('broken');
    expect(fixture.nativeElement.textContent).toContain('not scaled');
    expect(fixture.nativeElement.textContent).not.toContain('NaN');
    selector.value = '3';
    selector.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.scaledQuantity(recipe.ingredients[1]).text).toBe('1/2');
    selector.value = '2';
    selector.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.scaledQuantity(recipe.ingredients[0]).text).toBe('3-4');
    expect(recipe).toEqual(original);
  });
});
