import { Controller, Get } from '@nestjs/common';

interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Fournit la configuration ICE (STUN/TURN) au runtime, afin de ne pas
 * embarquer les identifiants TURN dans le bundle frontend. Le navigateur
 * et le service IA (aiortc) relaient alors leur média via le même TURN.
 */
@Controller('webrtc')
export class WebrtcController {
  @Get('ice-config')
  iceConfig(): { iceServers: IceServer[] } {
    const servers: IceServer[] = [];
    const stun = process.env.STUN_URL ?? 'stun:stun.l.google.com:19302';
    if (stun) {
      servers.push({ urls: stun });
    }
    if (process.env.TURN_URL) {
      servers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_PASSWORD,
      });
    }
    return { iceServers: servers };
  }
}
