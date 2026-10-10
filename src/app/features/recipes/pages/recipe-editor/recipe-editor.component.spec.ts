import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivatedRoute } from '@angular/router';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { RecipeImportResult } from '../../../../core/models/recipe-import.model';
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
  ingredients: [{ name: 'Pasta', quantity: '200', unit: 'g', note: null }],
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
    get: vi.fn(),
    upload: vi.fn(),
    removeImage: vi.fn(),
  };
  beforeEach(async () => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.units.mockResolvedValue([
      { code: 'g', label: 'gram' },
      { code: 'ml', label: 'milliliter' },
      { code: 'piece', label: 'piece' },
      { code: 'can', label: 'can' },
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

  it('enables Save only for valid fields and no unfinished quick entry or photo work', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    const saveButton = () => {
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    };
    expect(saveButton().disabled).toBe(true);
    editor.form.patchValue({
      title: 'Pasta',
      ingredients: saved.ingredients.map((item) => ({ ...item, note: '' })),
      steps: saved.steps,
    });
    expect(saveButton().disabled).toBe(false);

    editor.ingredients.at(0).controls.quantity.setValue('1/0');
    expect(saveButton().disabled).toBe(true);
    editor.ingredients.at(0).controls.quantity.setValue('1/2-1 1/2');
    editor.form.controls.servings.setValue(2.5);
    expect(saveButton().disabled).toBe(true);
    editor.form.controls.servings.setValue(2);
    expect(saveButton().disabled).toBe(false);

    const quickInput: HTMLInputElement = fixture.nativeElement.querySelector('.quick-input input');
    quickInput.value = '1 cup milk';
    quickInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(saveButton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.save-actions').textContent).toContain(
      'Add or clear Quick add.',
    );
    (fixture.nativeElement.querySelector('.quick-clear-button') as HTMLButtonElement).click();
    expect(saveButton().disabled).toBe(false);

    editor.preparingPhoto.set(true);
    expect(saveButton().disabled).toBe(true);
    editor.preparingPhoto.set(false);
    editor.busy.set(true);
    expect(saveButton().disabled).toBe(true);
    editor.busy.set(false);
    expect(saveButton().disabled).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('handles current add/remove controls and parent step ordering', async () => {
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
    click('Add manually');
    expect(fixture.componentInstance.ingredients.length).toBe(2);
    click('Remove ingredient 2');
    expect(fixture.componentInstance.ingredients.length).toBe(1);
    click('Add step');
    fixture.componentInstance.steps.at(0).setValue('First');
    fixture.componentInstance.steps.at(1).setValue('Second');
    fixture.componentInstance.moveStep(1, -1);
    fixture.detectChanges();
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
    fixture.detectChanges();
    const error: HTMLElement = fixture.nativeElement.querySelector('.save-bar [role="alert"]');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(error.textContent).toContain('photo change failed');
    expect(error.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.disabled).toBe(false);
    await editor.save();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(editor.hasUnsavedChanges()).toBe(false);
  });
  it('accepts manual string ranges and rejects malformed amounts before saving', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.form.patchValue({
      title: 'Eggs',
      ingredients: [{ name: 'Eggs', quantity: '3 bis 4', unit: 'piece', note: '' }],
      steps: ['Cook.'],
    });
    await editor.save();
    expect(api.create.mock.calls[0][0].ingredients[0].quantity).toBe('3-4');
    api.create.mockClear();
    editor.ingredients.at(0).controls.quantity.setValue('1/0');
    await editor.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(editor.ingredients.at(0).controls.quantity.invalid).toBe(true);
  });

  it('clears/disables toTaste quantity and restores validation for another unit', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance,
      row = editor.ingredients.at(0);
    row.controls.quantity.setValue('1/2');
    row.controls.unit.setValue('toTaste');
    editor.setUnit(0);
    expect(row.controls.quantity.value).toBe('');
    expect(row.controls.quantity.disabled).toBe(true);
    row.controls.unit.setValue('piece');
    editor.setUnit(0);
    expect(row.controls.quantity.enabled).toBe(true);
    expect(row.controls.quantity.invalid).toBe(true);
    row.controls.quantity.setValue('1/3');
    expect(row.controls.quantity.valid).toBe(true);
  });

  it('quick-adds converted ranges and preserves review metadata for cups and unresolved units', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    const quick = (text: string) => {
      const input: HTMLInputElement = fixture.nativeElement.querySelector(
        'input[aria-describedby="ingredient-quick-help ingredient-quick-error"]',
      );
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.quick-add-button') as HTMLButtonElement).click();
      fixture.detectChanges();
    };
    quick('1-2 lb beef');
    expect(editor.ingredients.at(0).controls.quantity.value).toBe('453.592-907.185');
    expect(editor.ingredients.at(0).controls.unit.value).toBe('g');
    expect(editor.hasUnsavedChanges()).toBe(true);
    quick('1 cup milk');
    const cup = editor.ingredients.at(1);
    expect(cup.controls.quantity.value).toBe('236.588');
    expect(cup.controls.unit.value).toBe('ml');
    expect(editor.importedIngredients.get(cup)?.requiresReview).toBe(true);
    quick('1 Glas Milch');
    const unknown = editor.ingredients.at(2);
    expect(unknown.controls.unit.value).toBe('');
    expect(unknown.invalid).toBe(true);
    expect(editor.importedIngredients.get(unknown)?.originalText).toBe('1 Glas Milch');
  });

  it('maps imported draft strings, keeps source review, and saves after resolving missing amounts', async () => {
    const result: RecipeImportResult = {
      sourceType: 'website',
      warnings: ['Review source'],
      draft: {
        title: 'Imported',
        description: null,
        sourceUrl: 'https://example.com/recipe',
        servings: 2,
        originalYield: '2 servings',
        steps: ['Cook'],
        externalImageUrl: null,
        ingredients: [
          {
            name: 'Eggs',
            quantity: '3-4',
            unit: 'piece',
            note: null,
            originalText: '3–4 Eier',
            requiresReview: false,
          },
          {
            name: 'Fett für das Blech',
            quantity: '',
            unit: null,
            note: null,
            originalText: 'Fett für das Blech',
            requiresReview: true,
          },
        ],
      },
    };
    const id = TestBed.inject(RecipeDraftService).put(result);
    TestBed.inject(ActivatedRoute).snapshot.queryParams = { import: id };
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const editor = fixture.componentInstance,
      row = editor.ingredients.at(1);
    expect(editor.ingredients.at(0).controls.quantity.value).toBe('3-4');
    expect(fixture.nativeElement.textContent).toContain('Fett für das Blech');
    expect(editor.hasUnsavedChanges()).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.confirm-review-button').disabled).toBe(true);
    await editor.save();
    expect(api.create).not.toHaveBeenCalled();
    row.controls.unit.setValue('g');
    editor.setUnit(1);
    row.controls.quantity.setValue('0,5');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.confirm-review-button').disabled).toBe(false);
    await editor.save();
    expect(api.create).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('.confirm-review-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.confirm-review-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    await editor.save();
    expect(
      api.create.mock.calls[0][0].ingredients.map((item: { quantity: string }) => item.quantity),
    ).toEqual(['3-4', '0.5']);
    expect(editor.importedIngredients.get(row)?.originalText).toBe('Fett für das Blech');
  });

  it('loads and edits an existing range without coercing it to a number', async () => {
    TestBed.inject(ActivatedRoute).snapshot.params = { id: 'recipe-1' };
    api.get.mockResolvedValue({
      ...saved,
      ingredients: [{ name: 'Eggs', quantity: '3-4', unit: 'piece', note: null }],
    });
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[formcontrolname="quantity"]',
    );
    expect(input.type).toBe('text');
    expect(input.value).toBe('3-4');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    await fixture.componentInstance.save();
    expect(api.update.mock.calls[0][1].ingredients[0].quantity).toBe('3-4');
  });
});
