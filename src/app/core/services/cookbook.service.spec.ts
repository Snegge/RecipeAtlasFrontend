import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CookbookService } from './cookbook.service';
import { SessionState } from './session-state';

describe('Cookbook invitation compatibility', () => {
  let books: CookbookService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    books = TestBed.inject(CookbookService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('explains a missing invitation API and does not silently return an empty inbox', async () => {
    const request = books.invitations();
    const result = expect(request).rejects.toThrow('Update, rebuild and restart the backend');
    http.expectOne('/api/cookbook-invitations').flush({}, { status: 404, statusText: 'Not Found' });
    await result;
  });

  it('never sends the old immediate-membership route to a backend without consent support', async () => {
    const request = books.add('book', 'reader', 'Viewer');
    const result = expect(request).rejects.toThrow('does not provide cookbook invitations');
    http.expectOne('/api/cookbook-invitations').flush({}, { status: 404, statusText: 'Not Found' });
    await result;
    http.expectNone('/api/cookbooks/book/members');
  });

  it('sends a member invitation only after the current backend confirms support', async () => {
    const request = books.add('book', 'reader', 'Viewer');
    http.expectOne('/api/cookbook-invitations').flush([]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const invite = http.expectOne('/api/cookbooks/book/members');
    expect(invite.request.method).toBe('POST');
    expect(invite.request.body).toEqual({ username: 'reader', role: 'Viewer' });
    invite.flush(null);
    await request;
  });

  it('also protects initial cookbook invitations from an older backend', async () => {
    const request = books.create('Shared', null, [{ username: 'reader', role: 'Viewer' }]);
    const result = expect(request).rejects.toThrow('does not provide cookbook invitations');
    http.expectOne('/api/cookbook-invitations').flush({}, { status: 404, statusText: 'Not Found' });
    await result;
    http.expectNone('/api/cookbooks');
  });

  it('does not send an invitation after the account changes during the support check', async () => {
    const request = books.add('book', 'reader', 'Viewer');
    const result = expect(request).rejects.toThrow('Session changed');
    http.expectOne('/api/cookbook-invitations').flush([]);
    TestBed.inject(SessionState).clear('login');
    await result;
    http.expectNone('/api/cookbooks/book/members');
  });
});
