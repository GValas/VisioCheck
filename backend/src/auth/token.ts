/**
 * Authentification légère par token partagé.
 *
 * - Si `API_TOKEN` est défini → REST et WebSocket exigent ce token.
 * - Sinon → mode ouvert (développement). `authEnabled()` reflète l'état.
 *
 * Suffisant pour une base mono-tenant ; un vrai schéma multi-utilisateurs (JWT,
 * OAuth) viendra se brancher au même endroit.
 */
export function authEnabled(): boolean {
  return Boolean(process.env.API_TOKEN);
}

export function validateToken(token: string | undefined | null): boolean {
  if (!authEnabled()) {
    return true;
  }
  return typeof token === 'string' && token === process.env.API_TOKEN;
}

/** Extrait le token d'un en-tête `Authorization: Bearer <token>`. */
export function tokenFromHeader(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? value : undefined;
}
