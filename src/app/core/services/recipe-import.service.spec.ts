import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecipeImportService } from './recipe-import.service';

describe('Recipe import API contract', () => {
  let http: HttpTestingController;
  let service: RecipeImportService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RecipeImportService);
  });
  afterEach(() => http.verify());

  it('uses the existing endpoint for links without selecting a platform in Angular', () => {
    service.importLink('https://youtu.be/BaW_jenozKc').subscribe();
    const request = http.expectOne('/api/recipes/import');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ url: 'https://youtu.be/BaW_jenozKc' });
    request.flush({});
  });
  it('preserves pasted line breaks and optional social attribution', () => {
    const text = '3–4 Eier\n1/2 cup milk\nMix.';
    service.importText(text, 'https://youtu.be/BaW_jenozKc').subscribe();
    const request = http.expectOne('/api/recipes/import');
    expect(request.request.body).toEqual({ text, url: 'https://youtu.be/BaW_jenozKc' });
    request.flush({});
    service.importText(text).subscribe();
    const standalone = http.expectOne('/api/recipes/import');
    expect(standalone.request.body).toEqual({ text });
    standalone.flush({});
  });
  it('cancels the HTTP request when the dialog unsubscribes', () => {
    const subscription = service.importText('3-4 Eggs').subscribe();
    const request = http.expectOne('/api/recipes/import');
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
  });
});
