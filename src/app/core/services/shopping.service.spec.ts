import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShoppingService } from './shopping.service';
import { apiInterceptor } from '../interceptors/api.interceptor';

describe('Shopping transport', () => {
  let service: ShoppingService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ShoppingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends the reviewed strong version, operation id and browser write header on DELETE', async () => {
    const pending = service.execute({
      kind: 'remove',
      listId: 'list',
      id: 'item',
      expectedVersion: 'item-v4',
      operationId: 'delete-op',
    });
    const request = http.expectOne('/api/shopping-lists/list/items/item');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('If-Match')).toBe('"item-v4"');
    expect(request.request.headers.get('X-Operation-Id')).toBe('delete-op');
    expect(request.request.headers.get('X-RecipeAtlas')).toBe('1');
    request.flush({
      listId: 'list',
      version: null,
      item: null,
      undoUntilUtc: '2026-10-21T12:00:05Z',
    });
    expect((await pending)?.undoUntilUtc).toBe('2026-10-21T12:00:05Z');
  });

  it('replays the identical text command without generating another operation id', async () => {
    const command = Object.freeze({
      kind: 'edit' as const,
      listId: 'list',
      id: 'item',
      text: 'Milk',
      expectedVersion: 'v1',
      token: 'edit-session',
      operationId: 'save-op',
    });
    for (let index = 0; index < 2; index++) {
      const pending = service.execute(command);
      const request = http.expectOne('/api/shopping-lists/list/items/item');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        text: 'Milk',
        expectedVersion: 'v1',
        token: 'edit-session',
        operationId: 'save-op',
      });
      request.flush({ listId: 'list', version: null, item: null, undoUntilUtc: null });
      await pending;
    }
  });

  it('responds using the invitation list and version, and ties Undo to its deletion', async () => {
    let pending = service.execute({
      kind: 'respond',
      listId: 'list',
      invitationId: 'invite',
      accept: true,
      expectedVersion: 'list-v2',
      operationId: 'accept-op',
    });
    let request = http.expectOne('/api/shopping-lists/list/invitations/invite/respond');
    expect(request.request.body).toEqual({
      accept: true,
      expectedVersion: 'list-v2',
      operationId: 'accept-op',
    });
    request.flush(null);
    await pending;
    pending = service.execute({
      kind: 'restore',
      listId: 'list',
      id: 'item',
      deletionOperationId: 'original-delete',
      operationId: 'undo-op',
    });
    request = http.expectOne('/api/shopping-lists/list/items/item/restore');
    expect(request.request.body).toEqual({
      deletionOperationId: 'original-delete',
      operationId: 'undo-op',
    });
    request.flush(null);
    await pending;
  });
});
