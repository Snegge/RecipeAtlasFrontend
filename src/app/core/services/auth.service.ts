import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CurrentUserResponse } from '../models/account.model';
import { SessionState } from './session-state';
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly session = inject(SessionState);
  readonly user = this.session.user;
  readonly signedIn = this.session.signedIn;
  async check(): Promise<boolean> {
    const epoch = this.session.epoch();
    try {
      const user = await firstValueFrom(this.http.get<CurrentUserResponse>('/api/auth/me'));
      if (epoch !== this.session.epoch()) return false;
      this.user.set(user);
      return true;
    } catch {
      if (epoch === this.session.epoch()) this.session.clear('expired');
      return false;
    }
  }
  async login(username: string, password: string): Promise<void> {
    if (this.signedIn()) await this.logout();
    this.session.clear('login');
    const epoch = this.session.epoch();
    await firstValueFrom(
      this.http.post('/api/auth/login', { username: username.trim(), password }),
    );
    if (epoch !== this.session.epoch() || !(await this.check()))
      throw new Error('Sign-in was interrupted. Please try again.');
  }
  async logout(): Promise<void> {
    this.session.clear('logout');
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401)) throw error;
    }
  }
  changePassword(currentPassword: string, newPassword: string) {
    return firstValueFrom(
      this.http.post<void>('/api/auth/password', { currentPassword, newPassword }),
    );
  }
}
