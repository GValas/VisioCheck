"""Description de scène en langage naturel (VLM auto-hébergé).

Le VLM (Qwen2.5-VL servi par vLLM) est *coûteux* : on ne l'appelle jamais à
chaque frame, mais uniquement :
  - quand un événement de scène survient (objet entré/sorti), ou
  - périodiquement pour un caption d'ambiance (intervalle throttlé).

Si `VC_VLM_ENABLED=false` (ou si vLLM est indisponible), on retombe sur un
résumé textuel déterministe construit à partir des événements et du comptage —
ce qui permet de faire tourner toute la chaîne sans GPU lourd.
"""

from __future__ import annotations

from .config import settings
from .event_engine import SceneEvent, EventType

# Traductions FR des classes COCO les plus courantes pour le mode dégradé.
_FR_LABELS = {
    "person": "une personne",
    "dog": "un chien",
    "cat": "un chat",
    "car": "une voiture",
    "bicycle": "un vélo",
    "motorcycle": "une moto",
    "bus": "un bus",
    "truck": "un camion",
    "backpack": "un sac à dos",
    "bottle": "une bouteille",
    "cup": "une tasse",
    "cell phone": "un téléphone",
    "laptop": "un ordinateur portable",
    "chair": "une chaise",
    "book": "un livre",
}


def _fr(label: str) -> str:
    return _FR_LABELS.get(label, f"un objet ({label})")


def deterministic_summary(events: list[SceneEvent], label_counts: dict[str, int]) -> str:
    """Résumé déterministe (mode dégradé, sans VLM). Testable unitairement."""
    parts: list[str] = []
    for ev in events:
        if ev.type == EventType.OBJECT_ENTERED:
            parts.append(f"{_fr(ev.label).capitalize()} est apparue dans le champ.")
        elif ev.type == EventType.OBJECT_LEFT:
            parts.append(f"{_fr(ev.label).capitalize()} a quitté le champ.")

    if label_counts:
        inv = ", ".join(
            f"{n} {label}" if n > 1 else f"1 {label}" for label, n in sorted(label_counts.items())
        )
        parts.append(f"Scène actuelle : {inv}.")
    elif not parts:
        parts.append("Aucun objet détecté dans le champ.")

    return " ".join(parts)


def build_prompt(events: list[SceneEvent], label_counts: dict[str, int]) -> str:
    """Construit l'instruction texte envoyée au VLM avec l'image courante."""
    context_lines = []
    if events:
        ev_desc = "; ".join(f"{e.type.value} {e.label}" for e in events)
        context_lines.append(f"Événements détecteur : {ev_desc}.")
    if label_counts:
        inv = ", ".join(f"{n}x {label}" for label, n in sorted(label_counts.items()))
        context_lines.append(f"Objets suivis : {inv}.")
    context = " ".join(context_lines) if context_lines else "Aucun objet suivi."
    return (
        "Tu es un système de vidéosurveillance. Décris la scène en une phrase "
        "concise et factuelle en français, en mettant l'accent sur ce qui vient "
        f"de changer. Contexte du détecteur : {context}"
    )


class Describer:
    def __init__(self) -> None:
        self._engine = None
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded or not settings.vlm_enabled

    def load(self) -> None:
        if self._loaded or not settings.vlm_enabled:
            return
        from vllm import LLM  # import paresseux

        # AWQ/int4 pour tenir sur un GPU 12-16 Go. limit_mm_per_prompt : 1 image.
        self._engine = LLM(
            model=settings.vlm_model,
            limit_mm_per_prompt={"image": 1},
            quantization="awq" if "AWQ" in settings.vlm_model else None,
            gpu_memory_utilization=0.45,  # laisse de la place au détecteur
        )
        self._loaded = True

    def describe(
        self,
        image: "object",
        events: list[SceneEvent],
        label_counts: dict[str, int],
    ) -> str:
        """Génère une description à partir d'une image PIL (RGB).

        Bascule en résumé déterministe si le VLM est désactivé/absent.
        """
        if not settings.vlm_enabled:
            return deterministic_summary(events, label_counts)

        if not self._loaded:
            self.load()

        from vllm import SamplingParams

        prompt = build_prompt(events, label_counts)
        # Format de chat multimodal Qwen2.5-VL.
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        outputs = self._engine.chat(
            messages,
            sampling_params=SamplingParams(max_tokens=80, temperature=0.2),
            multi_modal_data={"image": image},
        )
        return outputs[0].outputs[0].text.strip()
