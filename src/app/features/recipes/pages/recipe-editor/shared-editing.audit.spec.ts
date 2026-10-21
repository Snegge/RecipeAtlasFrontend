import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Recipe } from '../../../../core/models/recipe.model';
import { CookbookContext } from '../../../../core/services/cookbook-context';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { SessionState } from '../../../../core/services/session-state';
import { RecipesModule } from '../../recipes.module';
import { RecipeEditorComponent } from './recipe-editor.component';

const recipe: Recipe = {
  id: 'audit-recipe', version: 'v1', title: 'Pasta', description: null,
  sourceUrl: null, servings: 2,
  ingredients: [{ name: 'Pasta', quantity: '200', unit: 'g', note: null }],
  steps: ['Boil.'], imageUrl: null, createdAtUtc: '', updatedAtUtc: '',
};

describe('Shared editing audit regressions', () => {
  const api = { units: vi.fn(), get: vi.fn(), update: vi.fn(), upload: vi.fn() };
  beforeEach(async () => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.units.mockResolvedValue([
      { code: 'g', label: 'gram', milliliters: null },
      { code: 'ml', label: 'milliliter', milliliters: 1 },
    ]);
    api.get.mockResolvedValue(recipe);
    api.update.mockResolvedValue(recipe);
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [provideRouter([]), { provide: RecipeApiService, useValue: api }],
    }).compileComponents();
    TestBed.inject(ActivatedRoute).snapshot.params = {
      cookbookId: 'audit-book', id: recipe.id,
    };
    TestBed.inject(CookbookContext).current.set({
      id: 'audit-book', name: 'Audit', role: 'Owner', version: 'book-v1',
      description: null, imageUrl: null, recipeCount: 1,
    });
    TestBed.inject(SessionState).user.set({
      id: 'audit-owner', username: 'audit-owner', displayName: 'Audit owner',
      email: null, avatarUrl: null, isAdministrator: false,
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('leaves the loading screen when the session expires during the initial recipe request', async () => {
    let finish!: (value: Recipe) => void;
    api.get.mockReturnValueOnce(new Promise<Recipe>((resolve) => (finish = resolve)));
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    expect(fixture.componentInstance.loading()).toBe(true);
    TestBed.inject(SessionState).clear('expired');
    finish(recipe);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.editor.baseline()).toBeNull();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.querySelector('[aria-label="Loading editor"]')).toBeNull();
  });

  it('keeps unfinished Quick add text blocking Save after keeping local ingredients in review', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    api.update.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 409, error: { code: 'concurrency_conflict' } }),
    );
    api.get.mockResolvedValue({ ...recipe, version: 'v2', title: 'Server pasta' });
    await page.save();
    fixture.detectChanges();
    const quick: HTMLInputElement = fixture.nativeElement.querySelector('.quick-input input');
    quick.value = '200 g cheese';
    quick.dispatchEvent(new Event('input', { bubbles: true }));
    expect(page.ingredientDraftPending).toBe(true);
    const review = vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
      afterClosed: () => of({
        title: 'local', description: 'local', servings: 'local', sourceUrl: 'local',
        ingredients: 'local', steps: 'local', photo: 'server',
      }),
      close: vi.fn(),
    } as never);
    try {
      await page.review();
    } finally {
      review.mockRestore();
    }
    fixture.detectChanges();
    expect(quick.value).toBe('200 g cheese');
    expect(page.editor.conflict()).toBe(false);
    expect(page.canSave()).toBe(false);
    expect(page.saveBlockReason()).toBe('Add or clear Quick add.');
  });

  it('retains required cup review when keeping local ingredients after a conflict', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    api.update.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 409, error: { code: 'concurrency_conflict' } }),
    );
    api.get.mockResolvedValue({ ...recipe, version: 'v2', title: 'Server pasta' });
    await page.save();
    fixture.detectChanges();
    const quick: HTMLInputElement = fixture.nativeElement.querySelector('.quick-input input');
    quick.value = '1 cup milk';
    quick.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.quick-add-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cup = page.ingredients.at(1);
    expect(cup.controls.quantity.value).toBe('236.588');
    expect(cup.controls.unit.value).toBe('ml');
    expect(page.importedIngredients.get(cup)?.requiresReview).toBe(true);
    expect(page.saveBlockReason()).toBe('Confirm ingredient reviews.');
    const review = vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
      afterClosed: () => of({
        title: 'local', description: 'local', servings: 'local', sourceUrl: 'local',
        ingredients: 'local', steps: 'local', photo: 'server',
      }),
      close: vi.fn(),
    } as never);
    try {
      await page.review();
    } finally {
      review.mockRestore();
    }
    fixture.detectChanges();
    const retainedCup = page.ingredients.at(1);
    expect(retainedCup).toBe(cup);
    expect(retainedCup.controls.quantity.value).toBe('236.588');
    expect(retainedCup.controls.unit.value).toBe('ml');
    expect(page.editor.conflict()).toBe(false);
    expect.soft(page.importedIngredients.get(retainedCup)?.requiresReview).toBe(true);
    expect.soft(page.saveBlockReason()).toBe('Confirm ingredient reviews.');
    expect.soft(page.canSave()).toBe(false);
  });

  it.each(['review', 'loadServer'] as const)(
    'clears the actual Quick add input when %s replaces local ingredients',
    async (action) => {
      const fixture = TestBed.createComponent(RecipeEditorComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const page = fixture.componentInstance;
      api.update.mockRejectedValueOnce(
        new HttpErrorResponse({ status: 409, error: { code: 'concurrency_conflict' } }),
      );
      const server = { ...recipe, version: 'v2', ingredients: [
        { name: 'Server rice', quantity: '100', unit: 'g', note: null },
      ] };
      api.get.mockResolvedValue(server);
      await page.save();
      fixture.detectChanges();
      const quick: HTMLInputElement = fixture.nativeElement.querySelector('.quick-input input');
      quick.value = '200 g cheese';
      quick.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      const dialog = vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
        afterClosed: () => of(action === 'loadServer' ? true : {
          title: 'server', description: 'server', servings: 'server', sourceUrl: 'server',
          ingredients: 'server', steps: 'server', photo: 'server',
        }),
        close: vi.fn(),
      } as never);
      try {
        await page[action]();
      } finally {
        dialog.mockRestore();
      }
      fixture.detectChanges();
      expect(page.ingredients.getRawValue()).toEqual([{ ...server.ingredients[0], note: '' }]);
      expect(quick.value).toBe('');
      expect(page.ingredientDraftPending).toBe(false);
      expect(page.importedIngredients.size).toBe(0);
      expect(page.editor.baseline()?.version).toBe('v2');
      expect(api.update).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['review', 'cancel'], ['loadServer', 'cancel'],
    ['review', 'expired'], ['loadServer', 'expired'],
  ] as const)('preserves pending Quick add when %s ends with %s', async (action, reason) => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    api.update.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 409, error: { code: 'concurrency_conflict' } }),
    );
    api.get.mockResolvedValue({ ...recipe, version: 'v2' });
    await page.save();
    fixture.detectChanges();
    const quick: HTMLInputElement = fixture.nativeElement.querySelector('.quick-input input');
    quick.value = '200 g cheese';
    quick.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const closed = new Subject<unknown>();
    const dialog = vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
      afterClosed: () => closed, close: vi.fn(),
    } as never);
    try {
      const pending = page[action]();
      if (reason === 'expired') TestBed.inject(SessionState).clear('expired');
      closed.next(reason === 'cancel' ? undefined : action === 'loadServer' ? true : {
        title: 'server', description: 'server', servings: 'server', sourceUrl: 'server',
        ingredients: 'server', steps: 'server', photo: 'server',
      });
      closed.complete();
      await pending;
    } finally {
      dialog.mockRestore();
    }
    fixture.detectChanges();
    expect(quick.value).toBe('200 g cheese');
    expect(page.ingredientDraftPending).toBe(true);
    expect(page.canSave()).toBe(false);
    expect(api.update).toHaveBeenCalledTimes(1);
  });
});
