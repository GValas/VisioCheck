"""Moteur d'événements de scène — cœur de VisioCheck.

Logique *pure* (aucune dépendance GPU/réseau) qui transforme une suite d'états
de détection en événements discrets : un objet *entre* ou *sort* du champ.

Robustesse face au bruit du tracker (changements d'ID, occlusions, scintillement) :
  - une piste doit être vue pendant `min_frames` ET `min_duration_ms` avant de
    confirmer un `OBJECT_ENTERED` (anti-faux positif) ;
  - une piste confirmée doit être absente pendant `leave_grace_ms` avant de
    déclencher `OBJECT_LEFT` (anti-occlusion brève).

Entièrement déterministe → couvert par des tests unitaires.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Iterable


class EventType(str, Enum):
    OBJECT_ENTERED = "OBJECT_ENTERED"
    OBJECT_LEFT = "OBJECT_LEFT"
    COUNT_CHANGED = "COUNT_CHANGED"


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float


@dataclass(frozen=True)
class Detection:
    track_id: int
    label: str
    confidence: float
    box: Box


@dataclass(frozen=True)
class SceneEvent:
    type: EventType
    track_id: int
    label: str
    box: Box
    at_ms: int


@dataclass
class _Track:
    track_id: int
    label: str
    box: Box
    confidence: float
    first_seen_ms: int
    last_seen_ms: int
    frames_seen: int = 1
    confirmed: bool = False  # a déjà émis OBJECT_ENTERED


@dataclass
class EngineConfig:
    """Paramètres de debounce. Les valeurs par défaut conviennent à ~10 fps."""

    min_frames: int = 3            # frames minimales avant de confirmer une entrée
    min_duration_ms: int = 250     # durée minimale de présence avant confirmation
    leave_grace_ms: int = 600      # tolérance d'absence avant de déclarer une sortie
    min_confidence: float = 0.35   # détections sous ce seuil ignorées


class EventEngine:
    """Maintient l'état de scène et émet les événements frame par frame.

    Usage :
        engine = EventEngine()
        events = engine.update(detections, now_ms)
        active = engine.active_tracks()
    """

    def __init__(self, config: EngineConfig | None = None) -> None:
        self.config = config or EngineConfig()
        self._tracks: dict[int, _Track] = {}
        self._confirmed_count: int = 0

    def update(self, detections: Iterable[Detection], now_ms: int) -> list[SceneEvent]:
        """Intègre les détections d'une frame et renvoie les événements émis."""
        cfg = self.config
        events: list[SceneEvent] = []

        seen_ids: set[int] = set()
        for det in detections:
            if det.confidence < cfg.min_confidence:
                continue
            seen_ids.add(det.track_id)
            track = self._tracks.get(det.track_id)
            if track is None:
                self._tracks[det.track_id] = _Track(
                    track_id=det.track_id,
                    label=det.label,
                    box=det.box,
                    confidence=det.confidence,
                    first_seen_ms=now_ms,
                    last_seen_ms=now_ms,
                )
            else:
                track.box = det.box
                track.confidence = det.confidence
                track.last_seen_ms = now_ms
                track.frames_seen += 1
                # Un label peut changer si le détecteur se ravise ; on garde le
                # plus récent (la confiance fait foi au niveau du détecteur).
                track.label = det.label

        # Confirmation des entrées (debounce durée + frames).
        for track in self._tracks.values():
            if track.confirmed or track.track_id not in seen_ids:
                continue
            present_ms = now_ms - track.first_seen_ms
            if track.frames_seen >= cfg.min_frames and present_ms >= cfg.min_duration_ms:
                track.confirmed = True
                self._confirmed_count += 1
                events.append(
                    SceneEvent(EventType.OBJECT_ENTERED, track.track_id, track.label, track.box, now_ms)
                )

        # Sorties : pistes absentes au-delà de la tolérance.
        expired: list[int] = []
        for track in self._tracks.values():
            if track.track_id in seen_ids:
                continue
            if now_ms - track.last_seen_ms >= cfg.leave_grace_ms:
                expired.append(track.track_id)

        for track_id in expired:
            track = self._tracks.pop(track_id)
            if track.confirmed:
                self._confirmed_count -= 1
                events.append(
                    SceneEvent(EventType.OBJECT_LEFT, track.track_id, track.label, track.box, now_ms)
                )

        return events

    def active_tracks(self) -> list[Detection]:
        """Détections confirmées et actuellement présentes (pour l'overlay)."""
        return [
            Detection(t.track_id, t.label, t.confidence, t.box)
            for t in self._tracks.values()
            if t.confirmed
        ]

    @property
    def confirmed_count(self) -> int:
        return self._confirmed_count

    def label_counts(self) -> dict[str, int]:
        """Comptage par classe des pistes confirmées (utile pour la narration)."""
        counts: dict[str, int] = {}
        for t in self._tracks.values():
            if t.confirmed:
                counts[t.label] = counts.get(t.label, 0) + 1
        return counts
