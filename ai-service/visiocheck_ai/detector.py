"""Détection + suivi d'objets (YOLO + ByteTrack via Ultralytics).

Une instance `Detector` correspond à *une session* (un flux webcam) afin que
les identifiants de pistes ByteTrack restent isolés entre sessions. Le modèle
nano (~3 Mo de poids) rend ce choix peu coûteux ; un pool partagé est une
optimisation prévue pour la Phase 5.

Les dépendances lourdes (torch, ultralytics) sont importées paresseusement pour
que le module reste importable sur une machine sans GPU (santé, tests).
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass

from .config import settings
from .event_engine import Box, Detection


@dataclass
class DetectResult:
    detections: list[Detection]
    infer_ms: float


class Detector:
    def __init__(self) -> None:
        self._model = None  # chargé paresseusement
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Charge le modèle YOLO. Lève une exception explicite si indisponible."""
        if self._loaded:
            return
        from ultralytics import YOLO  # import paresseux

        self._model = YOLO(settings.detector_model)
        self._loaded = True

    def detect(self, jpeg: bytes) -> DetectResult:
        """Détecte + suit les objets sur une frame JPEG.

        Renvoie des boîtes normalisées [0,1] et des track_id stables.
        """
        if not self._loaded:
            self.load()

        from PIL import Image

        image = Image.open(io.BytesIO(jpeg)).convert("RGB")
        width, height = image.size

        start = time.perf_counter()
        # persist=True : ByteTrack conserve l'état entre les appels de cette session.
        results = self._model.track(
            source=image,
            persist=True,
            conf=settings.detector_conf,
            imgsz=settings.detector_imgsz,
            tracker=settings.tracker_cfg,
            verbose=False,
            device=settings.device,
        )
        infer_ms = (time.perf_counter() - start) * 1000.0

        detections: list[Detection] = []
        result = results[0]
        boxes = result.boxes
        if boxes is not None and boxes.id is not None:
            names = result.names
            xyxy = boxes.xyxy.cpu().tolist()
            ids = boxes.id.int().cpu().tolist()
            clss = boxes.cls.int().cpu().tolist()
            confs = boxes.conf.cpu().tolist()
            for (x1, y1, x2, y2), tid, cls, conf in zip(xyxy, ids, clss, confs):
                detections.append(
                    Detection(
                        track_id=int(tid),
                        label=str(names[int(cls)]),
                        confidence=float(conf),
                        box=Box(
                            x=x1 / width,
                            y=y1 / height,
                            w=(x2 - x1) / width,
                            h=(y2 - y1) / height,
                        ),
                    )
                )

        return DetectResult(detections=detections, infer_ms=infer_ms)
