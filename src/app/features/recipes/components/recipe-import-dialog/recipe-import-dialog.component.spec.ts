import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError, TimeoutError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeImportService } from '../../../../core/services/recipe-import.service';
import { RecipeImportResult } from '../../../../core/models/recipe-import.model';
import { RecipesModule } from '../../recipes.module';
import { RecipeImportDialogComponent } from './recipe-import-dialog.component';

describe('Recipe import dialog feedback', () => {
  const api = { importLink: vi.fn(), importText: vi.fn() };
  const closed = new Subject<void>();
  const close = vi.fn();
  const result: RecipeImportResult = {
    sourceType: 'text',
    warnings: ['Review AI extraction'],
    draft: {
      title: 'Eggs',
      description: null,
      servings: null,
      originalYield: null,
      sourceUrl: '',
      externalImageUrl: null,
      steps: [],
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

  beforeEach(async () => {
    api.importLink.mockReset();
    api.importText.mockReset();
    close.mockReset().mockImplementation(() => closed.next());
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [
        provideRouter([]),
        { provide: RecipeImportService, useValue: api },
        {
          provide: MatDialogRef,
          useValue: { close, beforeClosed: () => closed },
        },
      ],
    }).compileComponents();
  });

  it('enables standalone text import and hands the unchanged partial draft back', async () => {
    api.importText.mockReturnValue(of(result));
    const fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const textOption = fixture.nativeElement.querySelectorAll(
      '.source-option',
    )[1] as HTMLButtonElement;
    expect(textOption.disabled).toBe(false);
    textOption.click();
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    editor.text.setValue('   ');
    editor.submit();
    expect(api.importText).not.toHaveBeenCalled();
    editor.text.setValue('Eggs\n3–4 Eggs');
    fixture.detectChanges();
    expect(editor.url.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    editor.submit();
    expect(api.importText).toHaveBeenCalledExactlyOnceWith('Eggs\n3–4 Eggs', null);
    expect(close).toHaveBeenCalledExactlyOnceWith(result);
  });

  it('keeps a blocked social link open and preserves its URL when pasting a description', async () => {
    const url = 'https://www.tiktok.com/@cook/video/6748451240264420610';
    api.importLink.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 502,
            error: {
              title: 'Platform blocked retrieval. Paste its description.',
              code: 'social_retrieval_failed',
              canPasteText: true,
            },
          }),
      ),
    );
    api.importText.mockReturnValue(of({ ...result, draft: { ...result.draft, sourceUrl: url } }));
    const fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.chooseLink();
    editor.url.setValue(url);
    editor.submit();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Platform blocked retrieval');
    const fallback = fixture.nativeElement.querySelector('.paste-description') as HTMLButtonElement;
    expect(fallback).not.toBeNull();
    fallback.click();
    fixture.detectChanges();
    expect(editor.step()).toBe('text');
    expect(editor.textSourceUrl()).toBe(url);
    editor.text.setValue('Eggs\n3–4 Eggs');
    editor.submit();
    expect(api.importText).toHaveBeenCalledExactlyOnceWith('Eggs\n3–4 Eggs', url);
    expect(close.mock.calls[0][0].draft.sourceUrl).toBe(url);
  });

  it('prevents duplicate submissions and aborts the request on cancellation', async () => {
    const aborted = vi.fn();
    api.importLink.mockReturnValue(new Observable(() => aborted));
    const fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.chooseLink();
    editor.url.setValue('https://youtu.be/BaW_jenozKc');
    editor.submit();
    editor.submit();
    fixture.detectChanges();
    expect(api.importLink).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    editor.cancel();
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(editor.busy()).toBe(false);
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });

  it('offers pasted text on a client timeout and keeps text extraction errors actionable', async () => {
    api.importLink.mockReturnValue(throwError(() => new TimeoutError()));
    const fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    editor.chooseLink();
    editor.url.setValue('https://youtu.be/BaW_jenozKc');
    editor.submit();
    expect(editor.canPasteDescription()).toBe(true);
    expect(editor.error()).toContain('timed out');
    editor.chooseText(true);
    editor.text.setValue('Two separate recipes');
    api.importText.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { title: 'Paste the text of one recipe.', code: 'multiple_recipes' },
          }),
      ),
    );
    editor.submit();
    expect(editor.error()).toBe('Paste the text of one recipe.');
    expect(editor.step()).toBe('text');
    expect(close).not.toHaveBeenCalled();
    editor.back();
    editor.chooseText();
    expect(editor.textSourceUrl()).toBeNull();
  });

  it('floats the link label on the first visit and when returning to the link step', async () => {
    const fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
    const editor = fixture.componentInstance;
    for (let visit = 0; visit < 2; visit++) {
      editor.chooseLink();
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('.url-field .mdc-floating-label--float-above'),
      ).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.url-field input').placeholder).toBe(
        'https://...',
      );
      expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
      editor.back();
      fixture.detectChanges();
    }
  });

  it('keeps import failure feedback above the action buttons and allows a retry', async () => {
    api.importLink.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504 })));
    const fixture = TestBed.createComponent(RecipeImportDialogComponent);
    await fixture.whenStable();
    fixture.componentInstance.chooseLink();
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.url-field input');
    input.value = 'https://example.com/recipe';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const error: HTMLElement = fixture.nativeElement.querySelector(
      'mat-dialog-actions [role="alert"]',
    );
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(error.textContent).toContain('website took too long');
    expect(error.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.disabled).toBe(false);
    expect(api.importLink).toHaveBeenCalledExactlyOnceWith('https://example.com/recipe');
  });
});
