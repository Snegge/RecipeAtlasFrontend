import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeImportService } from '../../../../core/services/recipe-import.service';
import { RecipesModule } from '../../recipes.module';
import { RecipeImportDialogComponent } from './recipe-import-dialog.component';

describe('Recipe import dialog feedback', () => {
  const api = { importLink: vi.fn() };

  beforeEach(async () => {
    api.importLink.mockReset();
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [
        provideRouter([]),
        { provide: RecipeImportService, useValue: api },
        {
          provide: MatDialogRef,
          useValue: { close: vi.fn(), beforeClosed: () => new Subject<void>() },
        },
      ],
    }).compileComponents();
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
