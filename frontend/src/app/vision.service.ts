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
  readonly demo = signal(false);
  readonly detections = signal<Detection[]>([]);
  readonly feed = signal<FeedItem[]>([]);
  readonly lastInferMs = signal(0);
  readonly dropped = signal(0);

  private socket?: Socket;
  private feedSeq = 0;

  // Backpressure : nombre de frames envoyées mais pas encore acquittées.
  private inFlight = 0;
  private static readonly MAX_IN_FLIGHT = 3;

  connect(camera: { cameraId: string; label: string }): void {
    if (this.socket || this.demo()) {
      return;
    }
    // Mode démo explicite (ex. WebContainer StackBlitz, sans backend).
    if (environment.demoMode) {
      this.enableDemo('Mode démonstration : données simulées (aucun backend).');
      return;
    }

    // reconnection: true par défaut → résilience aux coupures réseau.
    // L'auth et l'identité de caméra voyagent dans la poignée de main.
    this.socket = io(environment.backendUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      timeout: 4000,
      auth: {
        token: environment.apiToken || undefined,
        cameraId: camera.cameraId,
        label: camera.label,
      },
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
    // Repli automatique en démo si le backend est injoignable.
    this.socket.on('connect_error', () => {
      if (!this.connected() && !this.demo()) {
        this.enableDemo('Backend injoignable → bascule en mode démonstration.');
      }
    });
  }

  // --- Mode démonstration (données simulées) ---------------------------------

  private demoTimer?: number;
  private demoTick = 0;
  private demoNextId = 100;
  private demoObjects: Array<{ trackId: number; label: string; x: number; vx: number }> = [];
  private static readonly DEMO_LABELS = ['person', 'dog', 'cup', 'laptop', 'bottle'];

  private enableDemo(message: string): void {
    if (this.demo()) {
      return;
    }
    this.socket?.disconnect();
    this.socket = undefined;
    this.demo.set(true);
    this.pushFeed('description', 'Démo', message, Date.now());
    this.demoTimer = window.setInterval(() => this.stepDemo(), 700);
  }

  private stepDemo(): void {
    this.demoTick += 1;

    // Apparition d'un objet (max 4).
    if (this.demoObjects.length < 4 && (this.demoTick % 4 === 0 || this.demoObjects.length === 0)) {
      const label =
        VisionService.DEMO_LABELS[
          Math.floor(Math.random() * VisionService.DEMO_LABELS.length)
        ];
      const obj = { trackId: ++this.demoNextId, label, x: 0.05, vx: 0.04 + Math.random() * 0.03 };
      this.demoObjects.push(obj);
      this.pushFeed('event', 'Entrée', `${label} (#${obj.trackId}) est entré`, Date.now());
    }

    // Déplacement + sortie quand l'objet traverse le cadre.
    const leaving: number[] = [];
    for (const o of this.demoObjects) {
      o.x += o.vx;
      if (o.x > 0.9) {
        leaving.push(o.trackId);
      }
    }
    for (const id of leaving) {
      const o = this.demoObjects.find((x) => x.trackId === id)!;
      this.pushFeed('event', 'Sortie', `${o.label} (#${id}) a quitté le champ`, Date.now());
    }
    this.demoObjects = this.demoObjects.filter((o) => !leaving.includes(o.trackId));

    // Détections synthétiques pour l'overlay.
    this.detections.set(
      this.demoObjects.map((o) => ({
        trackId: o.trackId,
        label: o.label,
        confidence: 0.9,
        box: { x: o.x, y: 0.3, w: 0.18, h: 0.4 },
      })),
    );
    this.lastInferMs.set(8 + Math.random() * 4);

    // Description d'ambiance périodique.
    if (this.demoTick % 7 === 0) {
      const counts = this.demoObjects.reduce<Record<string, number>>((acc, o) => {
        acc[o.label] = (acc[o.label] ?? 0) + 1;
        return acc;
      }, {});
      const inv = Object.entries(counts)
        .map(([l, n]) => `${n} ${l}`)
        .join(', ');
      this.pushFeed(
        'description',
        'Scène',
        inv ? `Scène actuelle : ${inv}.` : 'Aucun objet dans le champ.',
        Date.now(),
      );
    }
  }

  /** Charge l'historique récent (REST) pour amorcer le fil à la connexion. */
  private async loadHistory(): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (environment.apiToken) {
        headers['Authorization'] = `Bearer ${environment.apiToken}`;
      }
      const res = await fetch(`${environment.backendUrl}/events/recent?limit=30`, {
        headers,
      });
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
    this.stopWebrtc();
    this.socket?.disconnect();
    this.socket = undefined;
    this.connected.set(false);
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = undefined;
    }
    this.demo.set(false);
    this.detections.set([]);
  }

  get transport(): 'ws' | 'webrtc' {
    return environment.transport;
  }

  // --- Transport WebRTC ------------------------------------------------------

  private pc?: RTCPeerConnection;

  /** Démarre un pair WebRTC : flux média montant + canal de données descendant. */
  async startWebrtc(stream: MediaStream): Promise<void> {
    if (this.demo() || !this.socket) {
      return;
    }
    const pc = new RTCPeerConnection({
      iceServers: environment.iceServers.map((urls) => ({ urls })),
    });
    this.pc = pc;
    stream.getVideoTracks().forEach((t) => pc.addTrack(t, stream));

    const channel = pc.createDataChannel('results');
    channel.onmessage = (e) => {
      try {
        this.onAnalysis(JSON.parse(e.data) as Analysis);
      } catch {
        /* message non-JSON ignoré */
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.iceGatheringComplete(pc);

    this.socket.emit(
      'webrtc-offer',
      { sdp: pc.localDescription!.sdp, type: pc.localDescription!.type },
      (answer: { sdp: string; type: string } | { error: string }) => {
        if ('error' in answer) {
          this.pushFeed('description', 'Erreur', `WebRTC: ${answer.error}`, Date.now());
          return;
        }
        void pc.setRemoteDescription(
          new RTCSessionDescription({ sdp: answer.sdp, type: answer.type as RTCSdpType }),
        );
      },
    );
  }

  stopWebrtc(): void {
    this.pc?.close();
    this.pc = undefined;
  }

  private iceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const check = (): void => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
    });
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
