import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiInterceptor } from '../interceptors/api.interceptor';
import { SessionState } from './session-state';
import { AuthService } from './auth.service';
import { CookbookService } from './cookbook.service';
import { CookbookContext } from './cookbook-context';
import { RecipeDraftService } from './recipe-draft.service';
import { RecipeImportResult } from '../models/recipe-import.model';

const alice = {
  id: 'alice',
  username: 'alice',
  displayName: 'Alice',
  isAdministrator: false,
  email: null,
  avatarUrl: null,
};
const bob = { ...alice, id: 'bob', username: 'bob', displayName: 'Bob' };
const book = {
  id: 'book-a',
  name: 'Private cookbook',
  role: 'Owner',
  description: null,
  imageUrl: null,
  recipeCount: 0,
};
describe('Session boundaries', () => {
  let http: HttpTestingController;
  let session: SessionState;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionState);
    session.user.set(alice);
  });
  afterEach(() => http.verify());
  it('clears drafts and cookbook selection and cancels old requests on logout', () => {
    const drafts = TestBed.inject(RecipeDraftService);
    const id = drafts.put({ draft: { title: 'Private' } } as RecipeImportResult);
    const context = TestBed.inject(CookbookContext);
    context.current.set(book);
    let result: unknown;
    TestBed.inject(HttpClient)
      .get('/api/cookbooks/book-a/recipes')
      .subscribe((value) => (result = value));
    const request = http.expectOne('/api/cookbooks/book-a/recipes');
    session.clear('logout');
    expect(request.cancelled).toBe(true);
    expect(result).toBeUndefined();
    expect(drafts.get(id)).toBeNull();
    expect(context.current()).toBeNull();
    expect(session.user()).toBeNull();
  });
  it('ignores a completed /me response whose continuation runs after an account switch', async () => {
    const checking = TestBed.inject(AuthService).check();
    http.expectOne('/api/auth/me').flush(alice);
    session.clear('login');
    session.user.set(bob);
    expect(await checking).toBe(false);
    expect(session.user()).toEqual(bob);
  });
  it('cannot restore an old selected cookbook through a late Promise continuation', async () => {
    const books = TestBed.inject(CookbookService);
    const selecting = books.select(book.id);
    http.expectOne('/api/cookbooks/book-a').flush(book);
    session.clear('login');
    session.user.set(bob);
    await expect(selecting).rejects.toThrow('Session changed');
    expect(books.context.current()).toBeNull();
  });
  it('expires the current session on 401 without a stale 401 clearing a newer session', async () => {
    const client = TestBed.inject(HttpClient);
    client.get('/api/private').subscribe({ error: () => {} });
    http.expectOne('/api/private').flush({}, { status: 401, statusText: 'Unauthorized' });
    session.clear('login');
    session.user.set(bob);
    await Promise.resolve();
    expect(session.user()).toEqual(bob);
    client.get('/api/private').subscribe({ error: () => {} });
    http.expectOne('/api/private').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve();
    expect(session.user()).toBeNull();
  });
  it('retains the established non-safelisted write header for invitation submission', () => {
    TestBed.inject(HttpClient).post('/api/invitations/validate', { token: 'example' }).subscribe();
    const request = http.expectOne('/api/invitations/validate');
    expect(request.request.headers.get('X-RecipeAtlas')).toBe('1');
    request.flush({ status: 'Invalid' });
  });
  it('ignores an old profile response after switching accounts', async () => {
    const updating = TestBed.inject(AuthService).updateProfile(
      'Private name',
      'alice@example.test',
    );
    http.expectOne('/api/account/profile').flush({ ...alice, displayName: 'Private name' });
    session.clear('login');
    session.user.set(bob);
    await expect(updating).rejects.toThrow('Session changed');
    expect(session.user()).toEqual(bob);
  });

  it('clears cached state when /me reveals an account change from another browser tab', async () => {
    const context = TestBed.inject(CookbookContext);
    context.current.set(book);
    const epoch = session.epoch();
    const checking = TestBed.inject(AuthService).check();
    http.expectOne('/api/auth/me').flush(bob);
    expect(await checking).toBe(true);
    expect(session.user()).toEqual(bob);
    expect(session.epoch()).toBeGreaterThan(epoch);
    expect(context.current()).toBeNull();
  });
});
