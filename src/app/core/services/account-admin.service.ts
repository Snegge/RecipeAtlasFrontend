import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AccountResponse,
  InvitationResponse,
  CreatedInvitation,
  InvitationValidity,
} from '../models/account.model';
@Injectable({ providedIn: 'root' })
export class AccountAdminService {
  private readonly http = inject(HttpClient);
  accounts() {
    return firstValueFrom(this.http.get<AccountResponse[]>('/api/admin/accounts'));
  }
  invitations() {
    return firstValueFrom(this.http.get<InvitationResponse[]>('/api/admin/invitations'));
  }
  invite() {
    return firstValueFrom(this.http.post<CreatedInvitation>('/api/admin/invitations', {}));
  }
  revoke(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/admin/invitations/${id}`));
  }
  status(id: string, isActive: boolean) {
    return firstValueFrom(this.http.put<void>(`/api/admin/accounts/${id}/status`, { isActive }));
  }
  validate(token: string) {
    return firstValueFrom(
      this.http.post<InvitationValidity>('/api/invitations/validate', { token }),
    );
  }
  redeem(token: string, username: string, displayName: string, password: string) {
    return firstValueFrom(
      this.http.post<void>('/api/invitations/redeem', { token, username, displayName, password }),
    );
  }
}
