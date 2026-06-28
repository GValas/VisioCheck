"""Pipeline d'inférence par session, partagé par les transports.

Encapsule détection → suivi → moteur d'événements → description VLM (throttlée,
non bloquante). Utilisé aussi bien par le flux gRPC `Analyze` (transport WebSocket)
que par le pair WebRTC (`webrtc.py`).

`process()` renvoie un dictionnaire neutre (sérialisable JSON pour WebRTC, et
converti en message protobuf côté gRPC).
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .config import settings
from .describer import Describer
from .detector import Detector
from .event_engine import EventEngine, SceneEvent


def _event_to_dict(ev: SceneEvent) -> dict[str, Any]:
    return {
        "type": ev.type.value,
        "trackId": ev.track_id,
        "label": ev.label,
        "box": {"x": ev.box.x, "y": ev.box.y, "w": ev.box.w, "h": ev.box.h},
        "atMs": ev.at_ms,
    }


class SessionPipeline:
    """État d'inférence d'une session (un flux caméra)."""

    def __init__(self, describer: Describer, executor: ThreadPoolExecutor) -> None:
        self.detector = Detector()
        self.engine = EventEngine()
        self._describer = describer
        self._executor = executor
        self._last_vlm_ms = 0
        self._last_ambient_ms = 0
        self._vlm_task: asyncio.Task | None = None

    async def process(
        self,
        image: Any,
        session_id: str,
        frame_id: int,
        now_ms: int,
        loop: asyncio.AbstractEventLoop,
    ) -> dict[str, Any]:
        """Traite une image PIL et renvoie l'analyse (détections, events, description)."""
        result = await loop.run_in_executor(self._executor, self.detector.detect_image, image)
        events = self.engine.update(result.detections, now_ms)

        self._maybe_describe(image, events, now_ms, loop)

        description = ""
        if self._vlm_task is not None and self._vlm_task.done():
            try:
                description = self._vlm_task.result() or ""
            except Exception:  # noqa: BLE001 — une description ratée ne casse pas le flux
                description = ""
            finally:
                self._vlm_task = None

        return {
            "sessionId": session_id,
            "frameId": frame_id,
            "processedAtMs": now_ms,
            "inferMs": result.infer_ms,
            "detections": [
                {
                    "trackId": d.track_id,
                    "label": d.label,
                    "confidence": d.confidence,
                    "box": {"x": d.box.x, "y": d.box.y, "w": d.box.w, "h": d.box.h},
                }
                for d in result.detections
            ],
            "events": [_event_to_dict(e) for e in events],
            "description": description,
        }

    def _maybe_describe(self, image, events, now_ms, loop) -> None:
        if self._vlm_task is not None and not self._vlm_task.done():
            return
        if now_ms - self._last_vlm_ms < settings.vlm_min_interval_ms:
            return

        triggered = len(events) > 0
        ambient_due = now_ms - self._last_ambient_ms >= settings.ambient_interval_ms
        if not (triggered or ambient_due):
            return

        if not triggered:
            self._last_ambient_ms = now_ms
        self._last_vlm_ms = now_ms

        label_counts = self.engine.label_counts()
        self._vlm_task = loop.run_in_executor(
            self._executor, self._describer.describe, image, events, label_counts
        )
