import { CookbookContext } from '../../../../core/services/cookbook-context';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RecipesModule } from '../../recipes.module';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { RecipeListComponent } from './recipe-list.component';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { RecipeImportResult } from '../../../../core/models/recipe-import.model';
import { RecipeEditorComponent } from '../recipe-editor/recipe-editor.component';

describe('Recipe list loading', () => {
  it('settles after a response without refetching due to incidental service signal reads', async () => {
    const incidental = signal(0);
    const list = vi.fn(() => {
      incidental();
      return of({ items: [], total: 0, page: 1, pageSize: 12 });
    });
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [provideRouter([]), { provide: RecipeApiService, useValue: { list } }],
    }).compileComponents();
    TestBed.inject(ActivatedRoute).snapshot.params = { cookbookId: 'cookbook-1' };
    TestBed.inject(CookbookContext).current.set({
      description: null,
      imageUrl: null,
      version: 'displayed-v1',
      recipeCount: 0,
      id: 'cookbook-1',
      name: 'Test',
      role: 'Owner',
    });
    const fixture = TestBed.createComponent(RecipeListComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
    incidental.set(1);
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Your next favorite starts here');
  });

  it('imports a partial social result inside the new-recipe editor without inventing missing fields', async () => {
    const result: RecipeImportResult = {
      sourceType: 'youtube',
      warnings: ['Instructions and servings are missing.'],
      draft: {
        title: 'Eggs',
        description: null,
        sourceUrl: 'https://youtu.be/BaW_jenozKc',
        servings: null,
        originalYield: null,
        steps: [],
        externalImageUrl: null,
        ingredients: [
          {
            name: 'Eggs',
            quantity: '3-4',
            unit: 'piece',
            note: null,
            originalText: '3–4 Eggs',
            requiresReview: true,
          },
        ],
      },
    };
    const open = vi.fn(() => ({ afterClosed: () => of(result), close: vi.fn() }));
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [
        provideRouter([]),
        { provide: MatDialog, useValue: { open } },
        {
          provide: RecipeApiService,
          useValue: {
            list: () => of({ items: [], total: 0, page: 1, pageSize: 12 }),
            units: async () => [{ code: 'piece', label: 'piece' }],
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(ActivatedRoute).snapshot.params = { cookbookId: 'cookbook-1' };
    TestBed.inject(CookbookContext).current.set({
      description: null,
      imageUrl: null,
      version: 'displayed-v1',
      recipeCount: 0,
      id: 'cookbook-1',
      name: 'Test',
      role: 'Owner',
    });
    const editorFixture = TestBed.createComponent(RecipeEditorComponent);
    await editorFixture.whenStable();
    await editorFixture.componentInstance.openImport();
    editorFixture.detectChanges();
    const editor = editorFixture.componentInstance;
    expect(editor.form.controls.sourceUrl.value).toBe(result.draft.sourceUrl);
    expect(editor.ingredients.at(0).controls.quantity.value).toBe('3-4');
    expect(editor.importedIngredients.get(editor.ingredients.at(0))?.originalText).toBe('3–4 Eggs');
    expect(editor.form.controls.servings.value).toBeNull();
    expect(editor.steps.value).toEqual(['']);
    expect(editorFixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(editor.hasUnsavedChanges()).toBe(true);
  });
  it('hides recipe creation and import from viewers', async () => {
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [
        provideRouter([]),
        {
          provide: RecipeApiService,
          useValue: { list: () => of({ items: [], total: 0, page: 1, pageSize: 12 }) },
        },
      ],
    }).compileComponents();
    TestBed.inject(CookbookContext).current.set({
      description: null,
      imageUrl: null,
      version: 'displayed-v1',
      recipeCount: 0,
      id: 'read-only',
      name: 'Shared',
      role: 'Viewer',
    });
    const fixture = TestBed.createComponent(RecipeListComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.add-recipe')).toBeNull();
    expect(fixture.nativeElement.querySelector('.import-recipe')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Add your first recipe');
  });
});
