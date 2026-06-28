import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environments/environment';
import type { Analysis, Detection, FeedItem, SceneEvent } from './models';

const EVENT_LABELS: Record<string, string> = {
  OBJECT_ENTERED: 'Entrée',
  OBJECT_LEFT: 'Sortie',
  COUNT_CHANGED: 'Changement',
  EVENT_UNKNOWN: 'Événement',
};

/**
 * Service de liaison temps réel avec le backend.
 * Émet les frames et expose les analyses via des signaux Angular.
 */
@Injectable({ providedIn: 'root' })
export class VisionService {
  readonly connected = signal(false);
  readonly detections = signal<Detection[]>([]);
  readonly feed = signal<FeedItem[]>([]);
  readonly lastInferMs = signal(0);
  readonly dropped = signal(0);

  private socket?: Socket;
  private feedSeq = 0;

  // Backpressure : nombre de frames envoyées mais pas encore acquittées.
  private inFlight = 0;
  private static readonly MAX_IN_FLIGHT = 3;

  connect(): void {
    if (this.socket) {
      return;
    }
    // reconnection: true par défaut → résilience aux coupures réseau.
    this.socket = io(environment.backendUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.inFlight = 0;
      void this.loadHistory();
    });
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('analysis', (a: Analysis) => this.onAnalysis(a));
    this.socket.on('stream-error', (e: { message: string }) =>
      this.pushFeed('description', 'Erreur', e.message, Date.now()),
    );
  }

  /** Charge l'historique récent (REST) pour amorcer le fil à la connexion. */
  private async loadHistory(): Promise<void> {
    try {
      const res = await fetch(`${environment.backendUrl}/events/recent?limit=30`);
      if (!res.ok) {
        return;
      }
      const rows: Array<{
        kind: 'event' | 'description';
        type: string | null;
        label: string | null;
        trackId: number | null;
        text: string | null;
        atMs: number;
      }> = await res.json();
      const items: FeedItem[] = rows.map((r) => ({
        id: ++this.feedSeq,
        kind: r.kind,
        label:
          r.kind === 'description'
            ? 'Scène'
            : (EVENT_LABELS[r.type ?? ''] ?? 'Événement'),
        text:
          r.kind === 'description'
            ? (r.text ?? '')
            : `${r.label} (#${r.trackId})`,
        atMs: r.atMs,
      }));
      // Conserve le fil temps réel déjà reçu en tête.
      this.feed.update((live) => [...live, ...items].slice(0, 50));
    } catch {
      // Historique indisponible : non bloquant.
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
    this.connected.set(false);
    this.detections.set([]);
  }

  sendFrame(jpeg: ArrayBuffer, meta: {
    frameId: number;
    width: number;
    height: number;
  }): void {
    if (!this.socket?.connected) {
      return;
    }
    // Backpressure : si trop de frames sont en attente d'acquittement,
    // on abandonne celle-ci pour rester en temps réel (mieux vaut sauter
    // une frame que d'accumuler du retard).
    if (this.inFlight >= VisionService.MAX_IN_FLIGHT) {
      this.dropped.update((n) => n + 1);
      return;
    }
    this.inFlight += 1;
    this.socket.emit(
      'frame',
      {
        frameId: meta.frameId,
        capturedAtMs: Date.now(),
        width: meta.width,
        height: meta.height,
        jpeg,
      },
      () => {
        // Accusé de réception du backend → libère un crédit.
        this.inFlight = Math.max(0, this.inFlight - 1);
      },
    );
  }

  private onAnalysis(a: Analysis): void {
    this.detections.set(a.detections ?? []);
    this.lastInferMs.set(a.inferMs ?? 0);

    for (const ev of a.events ?? []) {
      this.pushFeed('event', EVENT_LABELS[ev.type] ?? ev.type, this.describeEvent(ev), ev.atMs);
    }
    if (a.description) {
      this.pushFeed('description', 'Scène', a.description, a.processedAtMs);
    }
  }

  private describeEvent(ev: SceneEvent): string {
    const verb = ev.type === 'OBJECT_ENTERED' ? 'est entré' : ev.type === 'OBJECT_LEFT' ? 'a quitté le champ' : 'a changé';
    return `${ev.label} (#${ev.trackId}) ${verb}`;
  }

  private pushFeed(kind: FeedItem['kind'], label: string, text: string, atMs: number): void {
    const item: FeedItem = { id: ++this.feedSeq, kind, label, text, atMs };
    // Garde les 50 entrées les plus récentes en tête de liste.
    this.feed.update((items) => [item, ...items].slice(0, 50));
  }
}
