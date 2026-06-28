import { Injectable } from '@nestjs/common';

export interface CameraSession {
  sessionId: string; // identifiant du socket
  cameraId: string; // identifiant logique de caméra (stable côté client)
  label: string; // nom lisible
  connectedAt: number;
}

/**
 * Registre des caméras actives (multi-flux).
 *
 * Une connexion WebSocket = une caméra. Le client fournit `cameraId` et `label`
 * à la poignée de main ; le registre permet de lister les flux en cours via
 * l'API REST et de les corréler aux métriques.
 */
@Injectable()
export class SessionRegistry {
  private readonly sessions = new Map<string, CameraSession>();

  register(sessionId: string, cameraId: string, label: string): CameraSession {
    const session: CameraSession = {
      sessionId,
      cameraId: cameraId || sessionId,
      label: label || 'Caméra sans nom',
      connectedAt: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  list(): CameraSession[] {
    return [...this.sessions.values()].sort((a, b) => a.connectedAt - b.connectedAt);
  }

  get(sessionId: string): CameraSession | undefined {
    return this.sessions.get(sessionId);
  }

  count(): number {
    return this.sessions.size;
  }
}
