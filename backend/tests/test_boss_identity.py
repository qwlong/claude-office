"""Tests for Boss identity fields used in multi-boss merged view."""

from datetime import datetime

from app.models.agents import Boss, BossState, OfficeState
from app.models.sessions import GameState


def test_boss_has_identity_fields():
    boss = Boss(
        state=BossState.WORKING,
        session_id="abc123",
        project_key="my-project",
        project_color="#3B82F6",
    )
    assert boss.session_id == "abc123"
    assert boss.project_key == "my-project"
    assert boss.project_color == "#3B82F6"


def test_boss_identity_fields_default_none():
    boss = Boss(state=BossState.IDLE)
    assert boss.session_id is None
    assert boss.project_key is None
    assert boss.project_color is None


def test_boss_serializes_identity_fields():
    boss = Boss(
        state=BossState.IDLE,
        session_id="sess1",
        project_key="proj",
        project_color="#FF0000",
    )
    data = boss.model_dump(by_alias=True)
    assert data["sessionId"] == "sess1"
    assert data["projectKey"] == "proj"
    assert data["projectColor"] == "#FF0000"


def test_gamestate_has_bosses_list():
    boss = Boss(state=BossState.IDLE)
    gs = GameState(
        session_id="test",
        boss=boss,
        agents=[],
        office=OfficeState(),
        last_updated=datetime.now(),
    )
    assert gs.bosses == []


def test_gamestate_bosses_populated():
    b1 = Boss(state=BossState.WORKING, session_id="s1", project_key="p1")
    b2 = Boss(state=BossState.IDLE, session_id="s2", project_key="p2")
    gs = GameState(
        session_id="__all__",
        boss=b1,
        bosses=[b1, b2],
        agents=[],
        office=OfficeState(),
        last_updated=datetime.now(),
    )
    assert len(gs.bosses) == 2
    assert gs.bosses[0].session_id == "s1"


def test_gamestate_bosses_serialized():
    b1 = Boss(state=BossState.IDLE, session_id="s1")
    gs = GameState(
        session_id="__all__",
        boss=b1,
        bosses=[b1],
        agents=[],
        office=OfficeState(),
        last_updated=datetime.now(),
    )
    data = gs.model_dump(by_alias=True)
    assert "bosses" in data
    assert data["bosses"][0]["sessionId"] == "s1"
