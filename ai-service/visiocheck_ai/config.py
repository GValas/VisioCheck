"""Configuration du microservice IA, pilotée par variables d'environnement."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    grpc_port: int = int(os.getenv("VC_GRPC_PORT", "50051"))

    # Détection
    detector_model: str = os.getenv("VC_DETECTOR_MODEL", "yolo11n.pt")
    detector_conf: float = float(os.getenv("VC_DETECTOR_CONF", "0.35"))
    detector_imgsz: int = int(os.getenv("VC_DETECTOR_IMGSZ", "640"))
    tracker_cfg: str = os.getenv("VC_TRACKER_CFG", "bytetrack.yaml")

    # VLM (description de scène)
    vlm_enabled: bool = _env_bool("VC_VLM_ENABLED", True)
    vlm_model: str = os.getenv("VC_VLM_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct-AWQ")
    # Caption d'ambiance throttlé : intervalle minimal entre deux descriptions
    # non déclenchées par un événement.
    ambient_interval_ms: int = int(os.getenv("VC_AMBIENT_INTERVAL_MS", "5000"))
    # Intervalle minimal entre deux appels VLM (anti-saturation GPU).
    vlm_min_interval_ms: int = int(os.getenv("VC_VLM_MIN_INTERVAL_MS", "700"))

    device: str = os.getenv("VC_DEVICE", "cuda")

    # WebRTC (transport alternatif). Serveurs STUN séparés par des virgules.
    webrtc_enabled: bool = _env_bool("VC_WEBRTC_ENABLED", True)
    ice_servers: str = os.getenv("VC_ICE_SERVERS", "stun:stun.l.google.com:19302")
    # TURN (optionnel) : aiortc relaie son média via TURN si renseigné.
    turn_url: str = os.getenv("VC_TURN_URL", "")
    turn_user: str = os.getenv("VC_TURN_USERNAME", "")
    turn_password: str = os.getenv("VC_TURN_PASSWORD", "")


settings = Settings()
