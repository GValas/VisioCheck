"""Serveur gRPC asynchrone du microservice d'inférence.

Deux transports partagent le même pipeline (`SessionPipeline`) :
  - `Analyze` : flux gRPC bidirectionnel alimenté par le WebSocket du navigateur
    (frames JPEG relayées par NestJS) ;
  - `Connect` : signalisation WebRTC (le navigateur établit un pair média direct
    avec aiortc ; les résultats repartent par un canal de données).

Lancement : `python -m visiocheck_ai.server`
"""

from __future__ import annotations

import asyncio
import io
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import grpc

from . import visiocheck_pb2 as pb
from . import visiocheck_pb2_grpc as pb_grpc
from .config import settings
from .describer import Describer
from .pipeline import SessionPipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("visiocheck.ai")

_EVENT_TYPE_MAP = {
    "OBJECT_ENTERED": pb.OBJECT_ENTERED,
    "OBJECT_LEFT": pb.OBJECT_LEFT,
    "COUNT_CHANGED": pb.COUNT_CHANGED,
}


def _analysis_from_dict(d: dict[str, Any]) -> "pb.Analysis":
    analysis = pb.Analysis(
        session_id=d["sessionId"],
        frame_id=d["frameId"],
        processed_at_ms=d["processedAtMs"],
        description=d["description"],
        infer_ms=d["inferMs"],
    )
    for det in d["detections"]:
        b = det["box"]
        analysis.detections.append(
            pb.Detection(
                track_id=det["trackId"],
                label=det["label"],
                confidence=det["confidence"],
                box=pb.Box(x=b["x"], y=b["y"], w=b["w"], h=b["h"]),
            )
        )
    for ev in d["events"]:
        b = ev["box"]
        analysis.events.append(
            pb.SceneEvent(
                type=_EVENT_TYPE_MAP.get(ev["type"], pb.EVENT_UNKNOWN),
                track_id=ev["trackId"],
                label=ev["label"],
                box=pb.Box(x=b["x"], y=b["y"], w=b["w"], h=b["h"]),
                at_ms=ev["atMs"],
            )
        )
    return analysis


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
        pipeline = SessionPipeline(self._describer, self._executor)
        loop = asyncio.get_running_loop()
        log.info("Nouvelle session Analyze (gRPC/WebSocket)")

        from PIL import Image

        async for frame in request_iterator:
            try:
                image = Image.open(io.BytesIO(frame.jpeg)).convert("RGB")
                result = await pipeline.process(
                    image, frame.session_id, frame.frame_id, frame.captured_at_ms, loop
                )
            except Exception as exc:  # noqa: BLE001
                log.exception("Échec traitement frame: %s", exc)
                await context.abort(grpc.StatusCode.INTERNAL, f"process failed: {exc}")
                return
            yield _analysis_from_dict(result)

        log.info("Session Analyze terminée")

    async def Connect(self, request, context):  # noqa: N802
        """Signalisation WebRTC : établit le pair média et renvoie la réponse SDP."""
        try:
            from .webrtc import handle_offer
        except ImportError as exc:
            await context.abort(
                grpc.StatusCode.UNIMPLEMENTED,
                f"WebRTC indisponible (aiortc non installé): {exc}",
            )
            return

        answer = await handle_offer(
            session_id=request.session_id,
            sdp=request.sdp,
            sdp_type=request.type,
            describer=self._describer,
            executor=self._executor,
        )
        return pb.WebrtcAnswer(sdp=answer["sdp"], type=answer["type"])


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
