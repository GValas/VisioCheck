import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';

const TOKEN_KEY = 'vc-jwt';

/**
 * Authentification frontend (JWT). Vérifie si le backend exige une auth,
 * effectue le login et conserve le token. En mode ouvert (backend sans
 * JWT_SECRET), `authRequired` reste faux et aucune connexion n'est demandée.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authRequired = signal(false);
  readonly user = signal<string | null>(null);

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY) || environment.apiToken || null;
  }

  async checkStatus(): Promise<void> {
    try {
      const res = await fetch(`${environment.backendUrl}/auth/status`);
      if (res.ok) {
        const json = (await res.json()) as { authRequired: boolean };
        this.authRequired.set(json.authRequired);
      }
    } catch {
      // Backend injoignable : on laissera le mode démo prendre le relais.
      this.authRequired.set(false);
    }
  }

  async login(username: string, password: string): Promise<void> {
    const res = await fetch(`${environment.backendUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      throw new Error('Identifiants invalides');
    }
    const json = (await res.json()) as { token: string; role: string };
    localStorage.setItem(TOKEN_KEY, json.token);
    this.user.set(username);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.user.set(null);
  }
}
