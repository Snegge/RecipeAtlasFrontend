import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly signedIn = signal(false);
  async check(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get('/api/auth/me'));
      this.signedIn.set(true);
      return true;
    } catch {
      this.signedIn.set(false);
      return false;
    }
  }
  async login(password: string) {
    await firstValueFrom(this.http.post('/api/auth/login', { password }));
    this.signedIn.set(true);
  }
  async logout() {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.signedIn.set(false);
  }
}
