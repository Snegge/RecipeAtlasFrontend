import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ShoppingCommand,
  ShoppingMutationResponse,
  ShoppingListResponse,
  ShoppingListSummary,
  ShoppingInvitationResponse,
  ShoppingReservationResponse,
} from '../models/shopping.model';
import { ifMatch } from '../utils/concurrency';

@Injectable({ providedIn: 'root' })
export class ShoppingService {
  private readonly http = inject(HttpClient);
  list() {
    return firstValueFrom(this.http.get<ShoppingListSummary[]>('/api/shopping-lists'));
  }
  get(listId: string) {
    return firstValueFrom(this.http.get<ShoppingListResponse>(`/api/shopping-lists/${listId}`));
  }
  invitations() {
    return firstValueFrom(
      this.http.get<ShoppingInvitationResponse[]>('/api/shopping-list-invitations'),
    );
  }
  reserve(listId: string, id: string, token: string, expectedVersion: string) {
    return firstValueFrom(
      this.http.post<ShoppingReservationResponse>(
        `/api/shopping-lists/${listId}/items/${id}/reservation`,
        { token, expectedVersion },
      ),
    );
  }
  release(listId: string, id: string, token: string) {
    return firstValueFrom(
      this.http.delete<void>(`/api/shopping-lists/${listId}/items/${id}/reservation`, {
        body: { token },
      }),
    );
  }
  execute(c: ShoppingCommand): Promise<ShoppingMutationResponse | null> {
    const base = `/api/shopping-lists/${c.listId}`;
    const operationId = c.operationId;
    const post = (path: string, body: object) =>
      firstValueFrom(this.http.post<ShoppingMutationResponse>(path, { ...body, operationId }));
    const put = (path: string, body: object) =>
      firstValueFrom(this.http.put<ShoppingMutationResponse>(path, { ...body, operationId }));
    const remove = (path: string, version: string) =>
      firstValueFrom(
        this.http.delete<ShoppingMutationResponse | null>(path, {
          headers: { ...ifMatch(version), 'X-Operation-Id': operationId },
        }),
      );
    switch (c.kind) {
      case 'create':
        return post('/api/shopping-lists', { listId: c.listId, name: c.name });
      case 'rename':
        return put(base, { name: c.name, expectedVersion: c.expectedVersion });
      case 'delete':
        return remove(base, c.expectedVersion);
      case 'invite':
        return post(`${base}/invitations`, {
          username: c.username,
          expectedVersion: c.expectedVersion,
        });
      case 'cancel-invitation':
        return remove(`${base}/invitations/${c.invitationId}`, c.expectedVersion);
      case 'respond':
        return post(`${base}/invitations/${c.invitationId}/respond`, {
          accept: c.accept,
          expectedVersion: c.expectedVersion,
        });
      case 'remove-member':
        return remove(`${base}/members/${c.userId}`, c.expectedVersion);
      case 'leave':
        return post(`${base}/leave`, { expectedVersion: c.expectedVersion });
      case 'transfer':
        return post(`${base}/transfer`, {
          newOwnerUserId: c.newOwnerUserId,
          expectedVersion: c.expectedVersion,
        });
      case 'add':
        return post(`${base}/items`, { id: c.id, text: c.text });
      case 'edit':
        return put(`${base}/items/${c.id}`, {
          text: c.text,
          expectedVersion: c.expectedVersion,
          token: c.token,
        });
      case 'purchase':
        return put(`${base}/items/${c.id}/purchased`, {
          purchased: c.purchased,
          expectedVersion: c.expectedVersion,
        });
      case 'remove':
        return remove(`${base}/items/${c.id}`, c.expectedVersion);
      case 'restore':
        return post(`${base}/items/${c.id}/restore`, {
          deletionOperationId: c.deletionOperationId,
        });
    }
  }
}
