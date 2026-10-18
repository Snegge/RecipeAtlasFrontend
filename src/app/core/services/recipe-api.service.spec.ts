import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecipeApiService } from './recipe-api.service';
import { RecipeInput } from '../models/recipe.model';

describe('Explicit recipe version transport', () => {
  let api: RecipeApiService, http: HttpTestingController;
  const path = '/api/cookbooks/book/recipes/recipe';
  const input: RecipeInput = {
    title: 'Title',
    description: null,
    sourceUrl: null,
    servings: 2,
    ingredients: [{ name: 'Egg', quantity: '1/2-1 1/2', unit: 'piece', note: null }],
    steps: ['Cook'],
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(RecipeApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('sends the caller baseline without fetching or modifying its quantity contract', async () => {
    const pending = api.update('book', 'recipe', input, 'opaque-displayed-version');
    const request = http.expectOne(path);
    expect(request.request.body).toEqual({ ...input, expectedVersion: 'opaque-displayed-version' });
    request.flush({ ...input, id: 'recipe', version: 'returned-version' });
    expect((await pending).version).toBe('returned-version');
  });
  it('quotes the displayed version for recipe deletion', async () => {
    const pending = api.delete('book', 'recipe', 'opaque-displayed-version');
    const request = http.expectOne(path);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('If-Match')).toBe('"opaque-displayed-version"');
    expect(request.request.body).toBeNull();
    request.flush(null);
    await pending;
  });
  it('passes a new text version into a binary photo request and returns the next version', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' });
    const pending = api.upload('book', 'recipe', blob, 'after-text');
    const request = http.expectOne(path + '/image');
    expect(request.request.body).toBe(blob);
    expect(request.request.headers.get('If-Match')).toBe('"after-text"');
    request.flush({ imageUrl: path + '/image', version: 'after-photo', updatedAtUtc: 'now' });
    expect((await pending).version).toBe('after-photo');
  });
  it('uses the displayed version for image removal', async () => {
    const pending = api.removeImage('book', 'recipe', 'before-removal');
    const request = http.expectOne(path + '/image');
    expect(request.request.headers.get('If-Match')).toBe('"before-removal"');
    request.flush({ imageUrl: null, version: 'after-removal', updatedAtUtc: 'now' });
    expect((await pending).imageUrl).toBeNull();
  });
});
