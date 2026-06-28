import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { AiService, AnalyzeStream } from '../ai/ai.service';
import type { Analysis } from '../ai/types';
import { EventStore } from '../persistence/event-store.service';
import type { StoredEvent } from '../persistence/scene-event.entity';
import { MetricsService } from '../observability/metrics.service';
import { SessionRegistry } from '../sessions/session-registry.service';
import { validateToken } from '../auth/token';

interface IncomingFrame {
  frameId: number;
  capturedAtMs: number;
  width: number;
  height: number;
  jpeg: ArrayBuffer | Buffer | Uint8Array;
}

/**
 * Passerelle temps réel navigateur ↔ service IA.
 *
 * Une connexion Socket.IO = une session = un flux gRPC bidirectionnel.
 * Le navigateur pousse des frames (`frame`) ; on relaie les analyses (`analysis`).
 */
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200' },
  // Frames binaires : laisse de la marge au buffer Socket.IO.
  maxHttpBufferSize: 8 * 1024 * 1024,
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(StreamGateway.name);
  private readonly streams = new Map<string, AnalyzeStream>();

  constructor(
    private readonly ai: AiService,
    private readonly store: EventStore,
    private readonly metrics: MetricsService,
    private readonly registry: SessionRegistry,
  ) {}

  handleConnection(client: Socket): void {
    // Authentification à la poignée de main (no-op si API_TOKEN non défini).
    const auth = (client.handshake.auth ?? {}) as {
      token?: string;
      cameraId?: string;
      label?: string;
    };
    if (!validateToken(auth.token)) {
      this.logger.warn(`Connexion refusée (token invalide): ${client.id}`);
      client.emit('stream-error', { message: 'Authentification requise' });
      client.disconnect(true);
      return;
    }

    const session = this.registry.register(
      client.id,
      auth.cameraId ?? '',
      auth.label ?? '',
    );
    this.logger.log(`Caméra connectée: ${session.label} (${client.id})`);
    this.metrics.open(client.id);
    const stream = this.ai.openAnalyzeStream();
    this.streams.set(client.id, stream);

    stream.on('data', (analysis: Analysis) => {
      client.emit('analysis', analysis);
      this.persist(client.id, analysis);
    });
    stream.on('error', (err: Error) => {
      this.logger.warn(`Flux IA en erreur (${client.id}): ${err.message}`);
      client.emit('stream-error', { message: err.message });
    });
    stream.on('end', () => {
      this.logger.log(`Flux IA terminé (${client.id})`);
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client déconnecté: ${client.id}`);
    this.registry.unregister(client.id);
    this.metrics.close(client.id);
    const stream = this.streams.get(client.id);
    if (stream) {
      stream.end();
      this.streams.delete(client.id);
    }
  }

  /** Journalise les événements et la description, et met à jour les métriques. */
  private persist(sessionId: string, analysis: Analysis): void {
    this.metrics.record(sessionId, {
      inferMs: analysis.inferMs ?? 0,
      events: analysis.events?.length ?? 0,
      hasDescription: Boolean(analysis.description),
    });

    const rows: StoredEvent[] = [];
    for (const ev of analysis.events ?? []) {
      rows.push({
        sessionId,
        kind: 'event',
        type: ev.type,
        label: ev.label,
        trackId: ev.trackId,
        text: null,
        atMs: ev.atMs,
      });
    }
    if (analysis.description) {
      rows.push({
        sessionId,
        kind: 'description',
        type: null,
        label: null,
        trackId: null,
        text: analysis.description,
        atMs: analysis.processedAtMs,
      });
    }
    if (rows.length > 0) {
      this.store.save(rows).catch((err) =>
        this.logger.warn(`Persistance échouée: ${(err as Error).message}`),
      );
    }
  }

  @SubscribeMessage('frame')
  handleFrame(client: Socket, payload: IncomingFrame): { accepted: boolean; frameId: number } {
    const stream = this.streams.get(client.id);
    if (!stream) {
      return { accepted: false, frameId: payload.frameId };
    }
    const jpeg = Buffer.isBuffer(payload.jpeg)
      ? payload.jpeg
      : Buffer.from(payload.jpeg as ArrayBuffer);

    stream.write({
      sessionId: client.id,
      frameId: payload.frameId,
      capturedAtMs: payload.capturedAtMs,
      jpeg,
      width: payload.width,
      height: payload.height,
    });
    // L'accusé de réception permet au client d'appliquer du backpressure.
    return { accepted: true, frameId: payload.frameId };
  }
}
