import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

function contextWithAuth(header?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: header } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const guard = new AuthGuard();

  afterEach(() => {
    delete process.env.API_TOKEN;
  });

  it('laisse passer en mode ouvert (API_TOKEN non défini)', () => {
    expect(guard.canActivate(contextWithAuth())).toBe(true);
  });

  it('accepte un token Bearer valide', () => {
    process.env.API_TOKEN = 'secret';
    expect(guard.canActivate(contextWithAuth('Bearer secret'))).toBe(true);
  });

  it('rejette un token invalide', () => {
    process.env.API_TOKEN = 'secret';
    expect(() => guard.canActivate(contextWithAuth('Bearer wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejette une requête sans en-tête quand l’auth est active', () => {
    process.env.API_TOKEN = 'secret';
    expect(() => guard.canActivate(contextWithAuth())).toThrow(UnauthorizedException);
  });
});
