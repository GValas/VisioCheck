// Types alignés sur proto/visiocheck.proto (vue côté backend).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameMessage {
  sessionId: string;
  frameId: number;
  capturedAtMs: number;
  jpeg: Buffer;
  width: number;
  height: number;
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
