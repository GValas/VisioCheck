"""Tests unitaires du moteur d'événements (logique pure, sans GPU)."""

from visiocheck_ai.event_engine import (
    Box,
    Detection,
    EngineConfig,
    EventEngine,
    EventType,
)


def _det(track_id: int, label: str = "person", conf: float = 0.9) -> Detection:
    return Detection(track_id, label, conf, Box(0.1, 0.1, 0.2, 0.3))


def _fast_config() -> EngineConfig:
    # min_frames=2, durée courte : confirmation rapide pour les tests.
    return EngineConfig(min_frames=2, min_duration_ms=100, leave_grace_ms=300, min_confidence=0.35)


def test_entry_is_debounced_then_confirmed():
    engine = EventEngine(_fast_config())

    # Frame 1 (t=0) : vue 1 fois, pas encore confirmée.
    assert engine.update([_det(1)], now_ms=0) == []
    # Frame 2 (t=120) : 2 frames + durée >= 100ms => ENTERED.
    events = engine.update([_det(1)], now_ms=120)
    assert len(events) == 1
    assert events[0].type == EventType.OBJECT_ENTERED
    assert events[0].track_id == 1
    assert engine.confirmed_count == 1


def test_brief_blip_never_confirms():
    engine = EventEngine(_fast_config())
    # Vue une seule frame puis disparaît avant d'atteindre min_frames.
    assert engine.update([_det(1)], now_ms=0) == []
    assert engine.update([], now_ms=120) == []      # absente (sous grace)
    events = engine.update([], now_ms=500)          # absente au-delà de grace
    # Jamais confirmée => aucun OBJECT_LEFT émis.
    assert events == []
    assert engine.confirmed_count == 0


def test_leave_is_emitted_after_grace():
    engine = EventEngine(_fast_config())
    engine.update([_det(1)], now_ms=0)
    engine.update([_det(1)], now_ms=120)  # confirmée
    # Occlusion brève sous le seuil de grâce : pas de sortie.
    assert engine.update([], now_ms=300) == []
    # Absence prolongée : OBJECT_LEFT.
    events = engine.update([], now_ms=600)
    assert len(events) == 1
    assert events[0].type == EventType.OBJECT_LEFT
    assert events[0].track_id == 1
    assert engine.confirmed_count == 0


def test_low_confidence_ignored():
    engine = EventEngine(_fast_config())
    engine.update([_det(1, conf=0.1)], now_ms=0)
    engine.update([_det(1, conf=0.1)], now_ms=120)
    assert engine.confirmed_count == 0
    assert engine.active_tracks() == []


def test_multiple_objects_and_counts():
    engine = EventEngine(_fast_config())
    engine.update([_det(1, "person"), _det(2, "dog")], now_ms=0)
    events = engine.update([_det(1, "person"), _det(2, "dog")], now_ms=120)
    types = {e.type for e in events}
    assert types == {EventType.OBJECT_ENTERED}
    assert len(events) == 2
    assert engine.label_counts() == {"person": 1, "dog": 1}
    assert len(engine.active_tracks()) == 2


def test_occlusion_does_not_drop_track():
    engine = EventEngine(_fast_config())
    engine.update([_det(1)], now_ms=0)
    engine.update([_det(1)], now_ms=120)  # confirmée
    engine.update([], now_ms=250)         # disparue brièvement
    # Réapparaît avant l'expiration : reste confirmée, aucun nouvel ENTERED.
    events = engine.update([_det(1)], now_ms=350)
    assert events == []
    assert engine.confirmed_count == 1
