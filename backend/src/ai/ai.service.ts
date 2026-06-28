import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { Analysis, FrameMessage } from './types';

// Le contrat proto est résolu depuis plusieurs emplacements (dev vs conteneur).
function resolveProtoPath(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', 'proto', 'visiocheck.proto'), // dev (monorepo)
    join(__dirname, '..', '..', 'proto', 'visiocheck.proto'), // dist/proto (asset)
    '/proto/visiocheck.proto', // conteneur
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `visiocheck.proto introuvable (cherché: ${candidates.join(', ')})`,
    );
  }
  return found;
}

export type AnalyzeStream = grpc.ClientDuplexStream<FrameMessage, Analysis>;

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private client!: grpc.Client & Record<string, any>;

  onModuleInit(): void {
    const target = process.env.AI_GRPC_TARGET ?? 'localhost:50051';
    const packageDef = protoLoader.loadSync(resolveProtoPath(), {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    this.client = new proto.visiocheck.Vision(
      target,
      grpc.credentials.createInsecure(),
      {
        // Frames JPEG : autorise des messages confortables.
        'grpc.max_receive_message_length': 8 * 1024 * 1024,
        'grpc.max_send_message_length': 8 * 1024 * 1024,
      },
    );
    this.logger.log(`Client gRPC IA configuré vers ${target}`);
  }

  onModuleDestroy(): void {
    this.client?.close();
  }

  /** Ouvre un flux bidirectionnel d'analyse (une session = un flux). */
  openAnalyzeStream(): AnalyzeStream {
    return this.client.Analyze() as AnalyzeStream;
  }

  /** Relaie une offre WebRTC au service IA et renvoie la réponse SDP. */
  connectWebrtc(
    sessionId: string,
    sdp: string,
    type: string,
  ): Promise<{ sdp: string; type: string }> {
    return new Promise((resolve, reject) => {
      this.client.Connect(
        { sessionId, sdp, type },
        (err: grpc.ServiceError | null, reply: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({ sdp: reply.sdp, type: reply.type });
        },
      );
    });
  }

  /** Vérifie que le service d'inférence est prêt. */
  health(): Promise<{ ready: boolean; vlmLoaded: boolean; detail: string }> {
    return new Promise((resolve, reject) => {
      this.client.Health({}, (err: grpc.ServiceError | null, reply: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          ready: reply.ready,
          vlmLoaded: reply.vlmLoaded,
          detail: reply.detail,
        });
      });
    });
  }
}
