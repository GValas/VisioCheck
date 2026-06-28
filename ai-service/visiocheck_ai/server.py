"""Serveur gRPC asynchrone du microservice d'inférence.

Par session :
  - détection + suivi (Detector, isolé par session) ;
  - moteur d'événements (EventEngine) ;
  - description VLM partagée, throttlée et **non bloquante** (exécutée dans un
    thread pool ; le résultat est rattaché à une frame ultérieure pour ne jamais
    ralentir la cadence de détection).

Lancement : `python -m visiocheck_ai.server`
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

import grpc

from . import visiocheck_pb2 as pb
from . import visiocheck_pb2_grpc as pb_grpc
from .config import settings
from .describer import Describer
from .detector import Detector
from .event_engine import EventEngine, SceneEvent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("visiocheck.ai")

_EVENT_TYPE_MAP = {
    "OBJECT_ENTERED": pb.OBJECT_ENTERED,
    "OBJECT_LEFT": pb.OBJECT_LEFT,
    "COUNT_CHANGED": pb.COUNT_CHANGED,
}


class _Session:
    def __init__(self) -> None:
        self.detector = Detector()
        self.engine = EventEngine()
        self.last_vlm_ms: int = 0
        self.last_ambient_ms: int = 0
        self.vlm_task: asyncio.Task | None = None
        self.pending_description: str | None = None


class VisionServicer(pb_grpc.VisionServicer):
    def __init__(self, describer: Describer, executor: ThreadPoolExecutor) -> None:
        self._describer = describer
        self._executor = executor

    async def Health(self, request, context):  # noqa: N802 (gRPC naming)
        return pb.HealthReply(
            ready=True,
            detector_loaded=True,  # chargé paresseusement à la 1re frame
            vlm_loaded=self._describer.loaded,
            detail=f"vlm_enabled={settings.vlm_enabled}",
        )

    async def Analyze(self, request_iterator, context):  # noqa: N802
        session = _Session()
        loop = asyncio.get_running_loop()
        log.info("Nouvelle session d'analyse")

        async for frame in request_iterator:
            now_ms = frame.captured_at_ms

            # Détection (bloquante) déportée dans le thread pool.
            try:
                result = await loop.run_in_executor(
                    self._executor, session.detector.detect, frame.jpeg
                )
            except Exception as exc:  # noqa: BLE001
                log.exception("Échec détection: %s", exc)
                await context.abort(grpc.StatusCode.INTERNAL, f"detect failed: {exc}")
                return

            events = session.engine.update(result.detections, now_ms)

            # Décide s'il faut (re)générer une description.
            self._maybe_describe(session, frame, events, now_ms, loop)

            # Récupère une description prête (calculée pour une frame précédente).
            description = ""
            if session.vlm_task is not None and session.vlm_task.done():
                try:
                    description = session.vlm_task.result() or ""
                except Exception as exc:  # noqa: BLE001
                    log.warning("Échec VLM: %s", exc)
                finally:
                    session.vlm_task = None

            yield self._build_analysis(frame, result, events, description, now_ms)

        log.info("Session terminée")

    def _maybe_describe(self, session, frame, events, now_ms, loop) -> None:
        # Pas de second appel tant que le précédent n'est pas terminé.
        if session.vlm_task is not None and not session.vlm_task.done():
            return
        if now_ms - session.last_vlm_ms < settings.vlm_min_interval_ms:
            return

        triggered_by_event = len(events) > 0
        ambient_due = now_ms - session.last_ambient_ms >= settings.ambient_interval_ms
        if not (triggered_by_event or ambient_due):
            return

        if not triggered_by_event:
            session.last_ambient_ms = now_ms
        session.last_vlm_ms = now_ms

        label_counts = session.engine.label_counts()
        jpeg = frame.jpeg
        session.vlm_task = loop.run_in_executor(
            self._executor, self._describer.describe, jpeg, events, label_counts
        )

    def _build_analysis(self, frame, result, events: list[SceneEvent], description, now_ms):
        analysis = pb.Analysis(
            session_id=frame.session_id,
            frame_id=frame.frame_id,
            processed_at_ms=now_ms,
            description=description,
            infer_ms=result.infer_ms,
        )
        for det in result.detections:
            analysis.detections.append(
                pb.Detection(
                    track_id=det.track_id,
                    label=det.label,
                    confidence=det.confidence,
                    box=pb.Box(x=det.box.x, y=det.box.y, w=det.box.w, h=det.box.h),
                )
            )
        for ev in events:
            analysis.events.append(
                pb.SceneEvent(
                    type=_EVENT_TYPE_MAP.get(ev.type.value, pb.EVENT_UNKNOWN),
                    track_id=ev.track_id,
                    label=ev.label,
                    box=pb.Box(x=ev.box.x, y=ev.box.y, w=ev.box.w, h=ev.box.h),
                    at_ms=ev.at_ms,
                )
            )
        return analysis


async def serve() -> None:
    describer = Describer()
    executor = ThreadPoolExecutor(max_workers=4)
    server = grpc.aio.server()
    pb_grpc.add_VisionServicer_to_server(VisionServicer(describer, executor), server)
    addr = f"[::]:{settings.grpc_port}"
    server.add_insecure_port(addr)
    await server.start()
    log.info("Service IA gRPC à l'écoute sur %s (vlm_enabled=%s)", addr, settings.vlm_enabled)
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())
