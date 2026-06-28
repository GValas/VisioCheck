import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { tokenFromHeader } from './token';

interface RequestLike {
  headers: { authorization?: string };
  user?: unknown;
}

/** Garde REST : valide le JWT (no-op si l'auth est désactivée). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const payload = this.auth.verify(tokenFromHeader(req.headers.authorization));
    if (!payload) {
      throw new UnauthorizedException('JWT invalide ou manquant');
    }
    req.user = payload;
    return true;
  }
}
