"""Pair WebRTC (aiortc) — transport média alternatif.

Le navigateur ouvre un `RTCPeerConnection` avec une piste vidéo (webcam) et un
canal de données `results`. Ce module reçoit la piste, fait tourner le pipeline
d'inférence sur chaque frame, et renvoie les analyses (JSON) par le canal de données.

aiortc est importé au niveau module : si absent, `server.Connect` renvoie
UNIMPLEMENTED et le transport WebSocket reste disponible.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from aiortc import (
    RTCConfiguration,
    RTCIceServer,
    RTCPeerConnection,
    RTCSessionDescription,
)
from aiortc.mediastreams import MediaStreamError

from .config import settings
from .describer import Describer
from .pipeline import SessionPipeline

log = logging.getLogger("visiocheck.ai.webrtc")

# Conserve les pairs actifs (évite leur ramassage par le GC).
_peers: set[RTCPeerConnection] = set()


def _ice_config() -> RTCConfiguration:
    servers = [
        RTCIceServer(urls=url.strip())
        for url in settings.ice_servers.split(",")
        if url.strip()
    ]
    return RTCConfiguration(iceServers=servers)


async def handle_offer(
    session_id: str,
    sdp: str,
    sdp_type: str,
    describer: Describer,
    executor: ThreadPoolExecutor,
) -> dict[str, str]:
    """Établit le pair média et renvoie la réponse SDP (non-trickle ICE)."""
    pc = RTCPeerConnection(_ice_config())
    _peers.add(pc)
    pipeline = SessionPipeline(describer, executor)
    loop = asyncio.get_running_loop()
    channel_holder: dict[str, Any] = {"channel": None}

    @pc.on("datachannel")
    def on_datachannel(channel) -> None:  # noqa: ANN001
        channel_holder["channel"] = channel

    @pc.on("connectionstatechange")
    async def on_state_change() -> None:
        log.info("WebRTC %s: %s", session_id, pc.connectionState)
        if pc.connectionState in {"failed", "closed", "disconnected"}:
            await pc.close()
            _peers.discard(pc)

    @pc.on("track")
    def on_track(track) -> None:  # noqa: ANN001
        if track.kind != "video":
            return
        asyncio.ensure_future(_consume(track, pipeline, session_id, channel_holder, loop))

    await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type=sdp_type))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}


async def _consume(
    track,  # noqa: ANN001
    pipeline: SessionPipeline,
    session_id: str,
    channel_holder: dict[str, Any],
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Lit les frames média, infère, et renvoie les analyses par le canal de données."""
    frame_id = 0
    while True:
        try:
            frame = await track.recv()
        except MediaStreamError:
            break

        frame_id += 1
        image = frame.to_image()  # PIL.Image (RGB)
        now_ms = int(time.monotonic() * 1000)
        try:
            result = await pipeline.process(image, session_id, frame_id, now_ms, loop)
        except Exception as exc:  # noqa: BLE001
            log.warning("WebRTC inference error: %s", exc)
            continue

        channel = channel_holder["channel"]
        if channel is not None and channel.readyState == "open":
            channel.send(json.dumps(result))

    log.info("WebRTC %s: piste terminée", session_id)
