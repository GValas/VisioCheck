export const environment = {
  production: false,
  // URL du backend NestJS (Socket.IO). Surchargée en production.
  backendUrl: 'http://localhost:3000',
  // Token API (vide = auth désactivée côté backend). À surcharger en prod.
  apiToken: '',
  // Cadence d'envoi des frames (images/seconde).
  targetFps: 10,
  // Largeur d'envoi (les frames sont redimensionnées avant compression JPEG).
  sendWidth: 640,
  jpegQuality: 0.6,
};
