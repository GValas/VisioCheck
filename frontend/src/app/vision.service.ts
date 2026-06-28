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

  private socket?: Socket;
  private feedSeq = 0;

  connect(): void {
    if (this.socket) {
      return;
    }
    this.socket = io(environment.backendUrl, { transports: ['websocket'] });

    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('analysis', (a: Analysis) => this.onAnalysis(a));
    this.socket.on('stream-error', (e: { message: string }) =>
      this.pushFeed('description', 'Erreur', e.message, Date.now()),
    );
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
    this.socket?.emit('frame', {
      frameId: meta.frameId,
      capturedAtMs: Date.now(),
      width: meta.width,
      height: meta.height,
      jpeg,
    });
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
