"""Tests du mode dégradé de description (déterministe, sans VLM)."""

from visiocheck_ai.describer import build_prompt, deterministic_summary
from visiocheck_ai.event_engine import Box, EventType, SceneEvent


def _ev(t: EventType, label: str) -> SceneEvent:
    return SceneEvent(t, 1, label, Box(0, 0, 0.1, 0.1), 0)


def test_summary_entered():
    text = deterministic_summary([_ev(EventType.OBJECT_ENTERED, "person")], {"person": 1})
    assert "apparue" in text
    assert "1 person" in text


def test_summary_left():
    text = deterministic_summary([_ev(EventType.OBJECT_LEFT, "dog")], {})
    assert "quitté" in text


def test_summary_empty_scene():
    assert "Aucun objet" in deterministic_summary([], {})


def test_prompt_mentions_events_and_counts():
    prompt = build_prompt([_ev(EventType.OBJECT_ENTERED, "cat")], {"cat": 2})
    assert "OBJECT_ENTERED cat" in prompt
    assert "2x cat" in prompt
    assert "français" in prompt
