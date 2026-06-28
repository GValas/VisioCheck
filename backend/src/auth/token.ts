/** Extrait le token d'un en-tête `Authorization: Bearer <token>`. */
export function tokenFromHeader(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? value : undefined;
}
