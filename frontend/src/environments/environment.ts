export const environment = {
  production: false,
  // URL du backend NestJS (Socket.IO). Surchargée en production.
  backendUrl: 'http://localhost:3000',
  // Token API (vide = auth désactivée côté backend). À surcharger en prod.
  apiToken: '',
  // Mode démo : données simulées, sans backend (utile en WebContainer StackBlitz).
  // Le frontend bascule aussi automatiquement en démo si le backend est injoignable.
  demoMode: false,
  // Transport montant : 'ws' (frames JPEG via WebSocket) ou 'webrtc' (flux média
  // direct vers le service IA, résultats via canal de données).
  transport: 'ws' as 'ws' | 'webrtc',
  // Config ICE de secours ; en pratique récupérée au runtime via /webrtc/ice-config.
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] as RTCIceServer[],
  // Cadence d'envoi des frames (images/seconde).
  targetFps: 10,
  // Largeur d'envoi (les frames sont redimensionnées avant compression JPEG).
  sendWidth: 640,
  jpegQuality: 0.6,
};
