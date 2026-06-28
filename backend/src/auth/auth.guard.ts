import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { tokenFromHeader, validateToken } from './token';

interface RequestLike {
  headers: { authorization?: string };
}

/** Garde REST : valide le token API (no-op si l'auth est désactivée). */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const token = tokenFromHeader(req.headers.authorization);
    if (!validateToken(token)) {
      throw new UnauthorizedException('Token API invalide ou manquant');
    }
    return true;
  }
}
