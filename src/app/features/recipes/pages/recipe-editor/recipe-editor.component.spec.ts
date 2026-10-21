import { CookbookContext } from '../../../../core/services/cookbook-context';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionState } from '../../../../core/services/session-state';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivatedRoute } from '@angular/router';
import { RecipeDraftService } from '../../../../core/services/recipe-draft.service';
import { RecipeImportResult } from '../../../../core/models/recipe-import.model';
import { RecipesModule } from '../../recipes.module';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { Recipe } from '../../../../core/models/recipe.model';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { RecipeEditorComponent } from './recipe-editor.component';

const saved: Recipe = {
  version: 'recipe-v1',
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
    api.upload.mockResolvedValue({ imageUrl: '/picture', version: 'photo-v2', updatedAtUtc: '' });
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [provideRouter([]), { provide: RecipeApiService, useValue: api }],
    }).compileComponents();
    TestBed.inject(ActivatedRoute).snapshot.params = { cookbookId: 'cookbook-1' };
    TestBed.inject(CookbookContext).current.set({
      description: null,
      imageUrl: null,
      version: 'displayed-v1',
      recipeCount: 0,
      id: 'cookbook-1',
      name: 'Test cookbook',
      role: 'Owner',
    });
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
    expect(api.create).toHaveBeenCalledExactlyOnceWith('cookbook-1', {
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
    Object.assign(editor.photos, { pendingPhoto: new Blob(['fixture'], { type: 'image/jpeg' }) });
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
    expect(api.update).not.toHaveBeenCalled();
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
    expect(api.create.mock.calls[0][1].ingredients[0].quantity).toBe('3-4');
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
      api.create.mock.calls[0][1].ingredients.map((item: { quantity: string }) => item.quantity),
    ).toEqual(['3-4', '0.5']);
    expect(editor.importedIngredients.get(row)?.originalText).toBe('Fett für das Blech');
  });

  it('loads and edits an existing range without coercing it to a number', async () => {
    TestBed.inject(ActivatedRoute).snapshot.params = { id: 'recipe-1', cookbookId: 'cookbook-1' };
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
    expect(api.update.mock.calls[0][2].ingredients[0].quantity).toBe('3-4');
  });
  it('isolates form, review and photo state between editor instances', async () => {
    const first = TestBed.createComponent(RecipeEditorComponent);
    const second = TestBed.createComponent(RecipeEditorComponent);
    await Promise.all([first.whenStable(), second.whenStable()]);
    first.componentInstance.form.controls.title.setValue('Only first');
    first.componentInstance.ingredientDraftPending = true;
    first.componentInstance.photoError.set('First photo failed');
    expect(second.componentInstance.form.controls.title.value).toBe('');
    expect(second.componentInstance.ingredientDraftPending).toBe(false);
    expect(second.componentInstance.photoError()).toBe('');
    expect(first.componentInstance.editor).not.toBe(second.componentInstance.editor);
    first.destroy();
    expect(second.componentInstance.form.controls.title.value).toBe('');
  });

  it('prevents duplicate saves and navigation after the editor is destroyed', async () => {
    let complete!: (recipe: Recipe) => void;
    api.create.mockReturnValue(new Promise<Recipe>((resolve) => (complete = resolve)));
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.form.patchValue({
      title: 'Pasta',
      ingredients: saved.ingredients.map((i) => ({ ...i, note: '' })),
      steps: saved.steps,
    });
    const saving = editor.save();
    await editor.save();
    expect(api.create).toHaveBeenCalledTimes(1);
    fixture.destroy();
    complete(saved);
    await saving;
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
  it('clears the file input while ignoring photo selection during a save', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.busy.set(true);
    const input = { value: 'selected-photo', files: [new File(['fixture'], 'photo.png')] };
    await editor.choosePhoto({ target: input } as unknown as Event);
    expect(input.value).toBe('');
    expect(editor.preparingPhoto()).toBe(false);
    expect(editor.preview()).toBeNull();
  });

  for (const status of [403, 404])
    it(`retains unsaved contents after access is revoked (${status})`, async () => {
      const fixture = TestBed.createComponent(RecipeEditorComponent);
      await fixture.whenStable();
      const editor = fixture.componentInstance;
      editor.form.patchValue({
        title: 'Keep my draft',
        ingredients: saved.ingredients.map((i) => ({ ...i, note: '' })),
        steps: saved.steps,
      });
      editor.form.markAsDirty();
      api.create.mockRejectedValueOnce(new HttpErrorResponse({ status }));
      await editor.save();
      expect(editor.form.controls.title.value).toBe('Keep my draft');
      expect(editor.hasUnsavedChanges()).toBe(true);
      expect(editor.error()).toContain('unsaved edits are still here');
      expect(editor.canSave()).toBe(false);
      expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    });
  it('keeps expired-session work available, then clears it on explicit account change', async () => {
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.form.controls.title.setValue('Private draft');
    editor.form.markAsDirty();
    const session = TestBed.inject(SessionState);
    session.user.set({
      id: 'u',
      username: 'user',
      displayName: 'User',
      isAdministrator: false,
      email: null,
      avatarUrl: null,
    });
    session.clear('expired');
    expect(editor.form.controls.title.value).toBe('Private draft');
    expect(editor.canSave()).toBe(false);
    session.clear('login');
    expect(editor.form.controls.title.value).toBe('');
    expect(editor.preview()).toBeNull();
  });
  async function existingEditor() {
    TestBed.inject(ActivatedRoute).snapshot.params = { id: saved.id, cookbookId: 'cookbook-1' };
    api.get.mockResolvedValue(saved);
    const fixture = TestBed.createComponent(RecipeEditorComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const conflictError = (status = 409) =>
    new HttpErrorResponse({ status, error: { code: 'concurrency_conflict' } });
  it('keeps exact local controls, ordering and pending blob after a conflict without retry or navigation', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    const row = page.ingredients.at(0),
      step = page.steps.at(0);
    page.form.controls.title.setValue('Local title');
    row.controls.quantity.setValue('1/2-1 1/2');
    page.form.markAsDirty();
    const blob = new Blob(['local']);
    Object.assign(page.photos, { pendingPhoto: blob });
    api.update.mockRejectedValueOnce(conflictError());
    api.get.mockResolvedValue({ ...saved, title: 'Someone else', version: 'server-v2' });
    await page.save();
    expect(page.ingredients.at(0)).toBe(row);
    expect(page.steps.at(0)).toBe(step);
    expect(row.controls.quantity.value).toBe('1/2-1 1/2');
    expect(page.form.controls.title.value).toBe('Local title');
    expect(page.editor.baseline()?.version).toBe('recipe-v1');
    expect(page.editor.latest()?.version).toBe('server-v2');
    expect(page.photos.hasUnsavedChanges()).toBe(true);
    expect(page.canSave()).toBe(false);
    await page.save();
    expect(api.update).toHaveBeenCalledExactlyOnceWith(
      'cookbook-1',
      saved.id,
      expect.anything(),
      'recipe-v1',
    );
    expect(api.upload).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
  it('applies explicit scalar and whole-list choices as a dirty draft, then detects another conflict', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    page.form.controls.title.setValue('Local');
    page.form.markAsDirty();
    api.update.mockRejectedValueOnce(conflictError());
    const server = {
      ...saved,
      title: 'Server',
      version: 'reviewed-v2',
      steps: ['Server ordered steps'],
    };
    api.get.mockResolvedValue(server);
    await page.save();
    const review = vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
      afterClosed: () =>
        of({
          title: 'local',
          description: 'server',
          servings: 'server',
          sourceUrl: 'server',
          ingredients: 'server',
          steps: 'server',
          photo: 'server',
        }),
      close: vi.fn(),
    } as never);
    await page.editor.review();
    review.mockRestore();
    expect(page.editor.baseline()).toBe(server);
    expect(page.form.controls.title.value).toBe('Local');
    expect(page.steps.getRawValue()).toEqual(server.steps);
    fixture.detectChanges();
    expect(
      [...fixture.nativeElement.querySelectorAll('app-step-editor textarea')].map(
        (item: any) => item.value,
      ),
    ).toEqual(server.steps);
    expect(page.form.dirty).toBe(true);
    expect(page.editor.conflict()).toBe(false);
    expect(api.update).toHaveBeenCalledTimes(1); // Applying review is not a save.
    api.update.mockRejectedValueOnce(conflictError());
    api.get.mockResolvedValue({ ...server, version: 'server-v3' });
    await page.save();
    expect(api.update.mock.calls[1][3]).toBe('reviewed-v2');
    expect(page.editor.conflict()).toBe(true);
    expect(page.editor.baseline()?.version).toBe('reviewed-v2');
  });
  it('confirms before loading server and preserves local work when discard is cancelled', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    page.form.controls.title.setValue('Keep local');
    page.form.markAsDirty();
    api.update.mockRejectedValueOnce(conflictError());
    api.get.mockResolvedValue({ ...saved, title: 'Server', version: 'server-v2' });
    await page.save();
    const confirm = vi
      .spyOn(MatDialog.prototype, 'open')
      .mockReturnValue({ afterClosed: () => of(false), close: vi.fn() } as never);
    await page.editor.loadServer();
    expect(page.form.controls.title.value).toBe('Keep local');
    expect(page.editor.conflict()).toBe(true);
    confirm.mockReturnValue({ afterClosed: () => of(true), close: vi.fn() } as never);
    await page.editor.loadServer();
    confirm.mockRestore();
    expect(page.form.controls.title.value).toBe('Server');
    expect(page.form.pristine).toBe(true);
    expect(page.editor.baseline()?.version).toBe('server-v2');
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it('treats a failed current-revision fetch as unresolved and allows a fetch retry only', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    page.form.controls.title.setValue('Local');
    page.form.markAsDirty();
    api.update.mockRejectedValueOnce(conflictError());
    api.get.mockRejectedValueOnce(new Error('Offline'));
    await page.save();
    expect(page.editor.conflict()).toBe(true);
    expect(page.editor.latest()).toBeNull();
    expect(page.form.controls.title.value).toBe('Local');
    expect(page.canSave()).toBe(false);
    api.get.mockResolvedValue({ ...saved, version: 'server-v2' });
    await page.editor.refreshConflict();
    expect(page.editor.latest()?.version).toBe('server-v2');
    expect(page.editor.baseline()?.version).toBe('recipe-v1');
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it('preserves copyable local contents when a conflict refresh discovers deletion or revoked access', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    page.form.controls.title.setValue('Copy this');
    page.form.markAsDirty();
    api.update.mockRejectedValueOnce(conflictError());
    api.get.mockRejectedValueOnce(new HttpErrorResponse({ status: 404 }));
    await page.save();
    expect(page.editor.permissionLost()).toBe(true);
    expect(page.editor.copyableDraft()).toContain('Copy this');
    expect(page.canSave()).toBe(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea[readonly]').value).toContain('Copy this');
  });
  it('passes the committed text version to photo writes and retries just the pending photo', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    page.form.controls.title.setValue('Saved text');
    page.form.markAsDirty();
    const blob = new Blob(['picture']);
    Object.assign(page.photos, { pendingPhoto: blob });
    api.update.mockResolvedValue({ ...saved, title: 'Saved text', version: 'text-v2' });
    api.upload.mockRejectedValueOnce(new Error('Network interruption'));
    await page.save();
    expect(api.upload).toHaveBeenLastCalledWith('cookbook-1', saved.id, blob, 'text-v2');
    expect(page.editor.partialSaved()).toBe(true);
    expect(page.photos.hasUnsavedChanges()).toBe(true);
    await page.save();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(page.editor.baseline()?.version).toBe('photo-v2');
  });
  it('keeps partial success visible and pending picture intact on a photo precondition failure', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    Object.assign(page.photos, { pendingPhoto: new Blob(['pending']) });
    api.update.mockResolvedValue({ ...saved, version: 'text-v2' });
    api.upload.mockRejectedValueOnce(conflictError(412));
    api.get.mockResolvedValue({ ...saved, title: 'Concurrent server text', version: 'server-v3' });
    await page.save();
    expect(page.error()).toContain('Recipe fields were saved');
    expect(page.editor.partialSaved()).toBe(true);
    expect(page.photos.hasUnsavedChanges()).toBe(true);
    expect(page.editor.conflict()).toBe(true);
    expect(page.editor.baseline()?.version).toBe('text-v2');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
  it('ignores a conflict read completing after a session change', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    let finish!: (value: Recipe) => void;
    api.update.mockRejectedValueOnce(conflictError());
    api.get.mockReturnValueOnce(new Promise<Recipe>((resolve) => (finish = resolve)));
    const saving = page.save();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.inject(SessionState).clear('login');
    finish({ ...saved, version: 'private-other-session' });
    await saving;
    expect(page.editor.latest()).toBeNull();
    expect(page.editor.baseline()).toBeNull();
    expect(page.form.controls.title.value).toBe('');
  });
  it('reports already saved fields when photo saving loses access', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    Object.assign(page.photos, { pendingPhoto: new Blob(['pending']) });
    api.update.mockResolvedValue({ ...saved, version: 'text-v2' });
    api.upload.mockRejectedValueOnce(new HttpErrorResponse({ status: 403 }));
    await page.save();
    expect(page.error()).toContain('Recipe fields were saved');
    expect(page.error()).toContain('picture change remains pending');
    expect(page.photos.hasUnsavedChanges()).toBe(true);
    expect(page.canSave()).toBe(false);
    expect(page.editor.baseline()?.version).toBe('text-v2');
  });
  it('keeps partial success visible and releases busy state after session expiry during photo saving', async () => {
    const fixture = await existingEditor(),
      page = fixture.componentInstance;
    Object.assign(page.photos, { pendingPhoto: new Blob(['pending']) });
    api.update.mockResolvedValue({ ...saved, version: 'text-v2' });
    let fail!: (error: unknown) => void;
    api.upload.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const saving = page.save();
    await Promise.resolve();
    await Promise.resolve();
    const session = TestBed.inject(SessionState);
    session.user.set({
      id: 'u',
      username: 'owner',
      displayName: 'Owner',
      isAdministrator: false,
      email: null,
      avatarUrl: null,
    });
    session.clear('expired');
    fail(new HttpErrorResponse({ status: 401 }));
    await saving;
    expect(page.error()).toContain('Recipe fields were saved');
    expect(page.photos.hasUnsavedChanges()).toBe(true);
    expect(page.busy()).toBe(false);
    expect(page.canSave()).toBe(false);
    expect(page.editor.baseline()).toBeNull();
  });
});
