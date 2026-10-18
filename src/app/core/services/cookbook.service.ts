import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CookbookResponse,
  MemberResponse,
  CookbookInvitationResponse,
  CookbookMemberInput,
} from '../models/account.model';
import { CookbookContext } from './cookbook-context';
import { SessionState } from './session-state';
@Injectable({ providedIn: 'root' })
export class CookbookService {
  private readonly http = inject(HttpClient);
  readonly context = inject(CookbookContext);
  private readonly session = inject(SessionState);
  list() {
    return this.http.get<CookbookResponse[]>('/api/cookbooks');
  }
  async select(id: string) {
    const epoch = this.session.epoch();
    const book = await firstValueFrom(this.http.get<CookbookResponse>(`/api/cookbooks/${id}`));
    if (epoch !== this.session.epoch())
      throw new Error('Session changed. Choose a cookbook again.');
    this.context.current.set(book);
    return book;
  }
  create(name: string, description: string | null = null, members: CookbookMemberInput[] = []) {
    return firstValueFrom(
      this.http.post<CookbookResponse>('/api/cookbooks', { name, description, members }),
    );
  }
  rename(id: string, name: string, description: string | null = null) {
    return firstValueFrom(this.http.put<void>(`/api/cookbooks/${id}`, { name, description }));
  }
  members(id: string) {
    return firstValueFrom(this.http.get<MemberResponse[]>(`/api/cookbooks/${id}/members`));
  }
  add(id: string, username: string, role: string) {
    return firstValueFrom(this.http.post<void>(`/api/cookbooks/${id}/members`, { username, role }));
  }
  role(id: string, userId: string, role: string) {
    return firstValueFrom(this.http.put<void>(`/api/cookbooks/${id}/members/${userId}`, { role }));
  }
  remove(id: string, userId: string) {
    return firstValueFrom(this.http.delete<void>(`/api/cookbooks/${id}/members/${userId}`));
  }
  leave(id: string) {
    return firstValueFrom(this.http.post<void>(`/api/cookbooks/${id}/leave`, {}));
  }
  upload(id: string, picture: Blob) {
    return firstValueFrom(
      this.http.put<CookbookResponse>(`/api/cookbooks/${id}/image`, picture, {
        headers: { 'Content-Type': picture.type },
      }),
    );
  }
  removeImage(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/cookbooks/${id}/image`));
  }
  delete(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/cookbooks/${id}`));
  }
  invitations() {
    return firstValueFrom(this.http.get<CookbookInvitationResponse[]>('/api/cookbook-invitations'));
  }
  respond(id: string, accept: boolean) {
    return firstValueFrom(this.http.post<void>(`/api/cookbook-invitations/${id}`, { accept }));
  }
  cancelInvitation(id: string, userId: string) {
    return firstValueFrom(this.http.delete<void>(`/api/cookbooks/${id}/invitations/${userId}`));
  }
}
