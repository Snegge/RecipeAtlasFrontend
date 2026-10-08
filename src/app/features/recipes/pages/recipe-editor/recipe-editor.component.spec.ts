import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipesModule } from '../../recipes.module';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { Recipe } from '../../../../core/models/recipe.model';
import { RecipeEditorComponent } from './recipe-editor.component';

const saved: Recipe = {
  id: 'recipe-1',
  title: 'Pasta',
  description: null,
  sourceUrl: null,
  servings: 2,
  ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g', note: null }],
  steps: ['Boil the pasta.'],
  imageUrl: null,
  createdAtUtc: '',
  updatedAtUtc: '',
};

describe('Recipe editor component composition', () => {
  const api = {
    units: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upload: vi.fn(),
    removeImage: vi.fn(),
  };
  beforeEach(async () => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.units.mockResolvedValue([
      { code: 'g', label: 'gram' },
      { code: 'toTaste', label: 'to taste' },
    ]);
    api.create.mockResolvedValue(saved);
    api.update.mockResolvedValue(saved);
    api.upload.mockResolvedValue({});
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [provideRouter([]), { provide: RecipeApiService, useValue: api }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('binds child ingredient and step inputs to the parent form and saves them', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const type = (selector: string, value: string) => {
      const element: HTMLInputElement = fixture.nativeElement.querySelector(selector);
      expect(element).not.toBeNull();
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('input[formcontrolname="title"]', 'Pasta');
    type('app-ingredient-editor input[formcontrolname="name"]', 'Pasta');
    type('app-ingredient-editor input[formcontrolname="quantity"]', '200');
    type('app-step-editor textarea', 'Boil the pasta.');
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Pasta',
      description: null,
      sourceUrl: null,
      servings: 2,
      ingredients: saved.ingredients,
      steps: saved.steps,
    });
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('handles add/remove/reorder events from extracted children', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const click = (label: string) => {
      const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
      const button = buttons.find(
        (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
      );
      expect(button).toBeDefined();
      button!.click();
      fixture.detectChanges();
    };
    click('Add ingredient');
    expect(fixture.componentInstance.ingredients.length).toBe(2);
    click('Remove ingredient 2');
    expect(fixture.componentInstance.ingredients.length).toBe(1);
    click('Add step');
    fixture.componentInstance.steps.at(0).setValue('First');
    fixture.componentInstance.steps.at(1).setValue('Second');
    click('Move step 2 up');
    expect(fixture.componentInstance.steps.value).toEqual(['Second', 'First']);
    click('Remove step 2');
    expect(fixture.componentInstance.steps.value).toEqual(['Second']);
  });

  it('retains the created ID when the photo request fails and retries without creating a duplicate', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.form.patchValue({
      title: 'Pasta',
      ingredients: saved.ingredients.map((i) => ({ ...i, note: '' })),
      steps: saved.steps,
    });
    // Isolate upload orchestration from browser-only photo decoding.
    Object.assign(editor, { pendingPhoto: new Blob(['fixture'], { type: 'image/jpeg' }) });
    api.upload.mockRejectedValueOnce(new Error('Upload interrupted'));
    await editor.save();
    expect(editor.savedId()).toBe('recipe-1');
    expect(editor.error()).toContain('photo change failed');
    await editor.save();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(editor.hasUnsavedChanges()).toBe(false);
  });
});
