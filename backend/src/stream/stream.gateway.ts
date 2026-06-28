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

  constructor(private readonly ai: AiService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connecté: ${client.id}`);
    const stream = this.ai.openAnalyzeStream();
    this.streams.set(client.id, stream);

    stream.on('data', (analysis: Analysis) => {
      client.emit('analysis', analysis);
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
    const stream = this.streams.get(client.id);
    if (stream) {
      stream.end();
      this.streams.delete(client.id);
    }
  }

  @SubscribeMessage('frame')
  handleFrame(client: Socket, payload: IncomingFrame): void {
    const stream = this.streams.get(client.id);
    if (!stream) {
      return;
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
  }
}
