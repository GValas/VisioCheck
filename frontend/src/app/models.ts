// Types alignés sur le contrat proto (renvoyés par le backend en JSON).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  trackId: number;
  label: string;
  confidence: number;
  box: Box;
}

export type SceneEventType =
  | 'EVENT_UNKNOWN'
  | 'OBJECT_ENTERED'
  | 'OBJECT_LEFT'
  | 'COUNT_CHANGED';

export interface SceneEvent {
  type: SceneEventType;
  trackId: number;
  label: string;
  box: Box;
  atMs: number;
}

export interface Analysis {
  sessionId: string;
  frameId: number;
  processedAtMs: number;
  detections: Detection[];
  events: SceneEvent[];
  description: string;
  inferMs: number;
}

// Élément du fil d'événements affiché à l'utilisateur.
export interface FeedItem {
  id: number;
  kind: 'event' | 'description';
  label: string;
  text: string;
  atMs: number;
}
