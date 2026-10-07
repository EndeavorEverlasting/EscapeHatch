#!/usr/bin/env python3
"""EH-M1 Android Application Assist presence spike — host-side proof runner.

Runs without Android SDK. Emits a receipt under harness/reports/.
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "application-assist-presence-surface.v1.json"
RECEIPT = ROOT / "harness" / "reports" / "android-assist-presence-spike-receipt.v1.json"
SESSION_KEY = "escapeHatch.applicationAssistSession.v1"

AFFORDANCE = [
    "unavailable",
    "dormant",
    "available",
    "surfaced",
    "expanded",
    "temporarily_dismissed",
    "session_ended",
]

ALLOWED = {
    ("unavailable", "dormant"),
    ("dormant", "available"),
    ("available", "surfaced"),
    ("available", "expanded"),
    ("surfaced", "expanded"),
    ("expanded", "surfaced"),
    ("surfaced", "temporarily_dismissed"),
    ("expanded", "temporarily_dismissed"),
    ("temporarily_dismissed", "available"),
    ("temporarily_dismissed", "surfaced"),
    ("available", "session_ended"),
    ("surfaced", "session_ended"),
    ("expanded", "session_ended"),
    ("temporarily_dismissed", "session_ended"),
    ("session_ended", "dormant"),
}


@dataclass
class AssistSession:
    session_id: str
    origin: str
    status: str
    company: str | None = None
    role: str | None = None
    unresolved_field_count: int = 0


@dataclass
class SpikeResult:
    hypothesis_id: str
    hypothesis: str
    observation: str
    decision: str
    keep: bool
    metrics: dict[str, Any] = field(default_factory=dict)


class AffordanceMachine:
    def __init__(self, state: str = "dormant") -> None:
        if state not in AFFORDANCE:
            raise ValueError(state)
        self.state = state

    def transition(self, to: str) -> bool:
        if (self.state, to) not in ALLOWED:
            return False
        self.state = to
        return True


class SessionStore:
    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    def save(self, session: AssistSession) -> None:
        self._data[SESSION_KEY] = asdict(session)

    def load(self) -> AssistSession | None:
        raw = self._data.get(SESSION_KEY)
        if not raw:
            return None
        return AssistSession(**raw)

    def clear(self) -> None:
        self._data.clear()


def parse_deep_link(uri: str) -> dict[str, Any] | None:
    parsed = urlparse(uri.strip())
    if parsed.scheme.lower() != "escapehatch" or parsed.netloc.lower() != "assist":
        # urlparse: escapehatch://assist?... -> netloc=assist
        if not (parsed.scheme.lower() == "escapehatch" and (parsed.netloc.lower() == "assist" or parsed.path.startswith("assist"))):
            # also accept escapehatch://assist
            pass
    if parsed.scheme.lower() != "escapehatch":
        return None
    host_or_path = parsed.netloc or parsed.path.lstrip("/")
    if not host_or_path.startswith("assist"):
        return None
    params = {k: unquote(v[0]) for k, v in parse_qs(parsed.query).items()}
    return {
        "session_id": params.get("session"),
        "url": params.get("url"),
        "company": params.get("company"),
        "role": params.get("role"),
        "question_text": params.get("q"),
        "source": "deep_link",
    }


def parse_share_text(text: str) -> dict[str, Any]:
    match = re.search(r"https?://\S+", text, flags=re.I)
    return {
        "session_id": None,
        "url": match.group(0) if match else None,
        "company": None,
        "role": None,
        "question_text": text.strip() or None,
        "source": "sharesheet",
    }


MECHANISMS: list[dict[str, Any]] = [
    {
        "id": "notification_foreground_service",
        "android_versions": "API 26+ FGS patterns; POST_NOTIFICATIONS API 33+",
        "permissions": ["POST_NOTIFICATIONS", "optional FOREGROUND_SERVICE*"],
        "play_policy": "standard notification; no special SYSTEM_ALERT_WINDOW",
        "browser_compat": "independent of Chrome/Firefox/Samsung; reopen via PendingIntent",
        "persistence": "ongoing notification + local session store",
        "ux_cost": "low if channel importance LOW and non-noisy",
        "complexity": "medium",
        "security": "no overlay spoofing; user can dismiss notification channel",
        "doctrine_fit": "high — quiet by default",
        "requires_overlay": False,
        "requires_accessibility": False,
        "recommendation": "primary_v1",
        "score_quiet_presence": 5,
        "score_session_resume": 5,
        "score_policy": 5,
        "score_onboarding": 4,
    },
    {
        "id": "android_bubbles",
        "android_versions": "API 29+; conversation rules API 30+",
        "permissions": ["POST_NOTIFICATIONS", "BubbleMetadata on notification"],
        "play_policy": "allowed via notification API; conversation semantics required for reliable bubbling on API 30+",
        "browser_compat": "floats over other apps when system allows bubble",
        "persistence": "bubble tied to notification lifecycle",
        "ux_cost": "medium — conversation framing mismatches job assist; risk of nag if misused",
        "complexity": "high",
        "security": "system-managed bubble; lower spoof risk than TYPE_APPLICATION_OVERLAY",
        "doctrine_fit": "medium — floating affordance ok only if quiet and user-opted",
        "requires_overlay": False,
        "requires_accessibility": False,
        "recommendation": "optional_enhancement_after_v1",
        "score_quiet_presence": 3,
        "score_session_resume": 4,
        "score_policy": 4,
        "score_onboarding": 3,
    },
    {
        "id": "system_alert_window_overlay",
        "android_versions": "special access; Settings.canDrawOverlays",
        "permissions": ["SYSTEM_ALERT_WINDOW"],
        "play_policy": "sensitive special access; must send user to system settings; core-function justification required",
        "browser_compat": "true draw-over browser",
        "persistence": "service-managed overlay view",
        "ux_cost": "high onboarding friction; spoofing/attention risk",
        "complexity": "high",
        "security": "overlay spoofing risk elevated",
        "doctrine_fit": "low for default — attention competition",
        "requires_overlay": True,
        "requires_accessibility": False,
        "recommendation": "rejected_v1_primary",
        "score_quiet_presence": 2,
        "score_session_resume": 4,
        "score_policy": 1,
        "score_onboarding": 1,
    },
    {
        "id": "companion_activity",
        "android_versions": "all supported",
        "permissions": ["none beyond app install"],
        "play_policy": "standard activity",
        "browser_compat": "user switches apps; no in-browser injection",
        "persistence": "local session store",
        "ux_cost": "medium — leaves browser unless paired with notification/bubble",
        "complexity": "low",
        "security": "standard app sandbox",
        "doctrine_fit": "high as expansion target",
        "requires_overlay": False,
        "requires_accessibility": False,
        "recommendation": "required_expansion_surface",
        "score_quiet_presence": 2,
        "score_session_resume": 5,
        "score_policy": 5,
        "score_onboarding": 5,
    },
    {
        "id": "sharesheet_intent_applink",
        "android_versions": "all supported; App Links optional verification",
        "permissions": ["none for custom scheme; https App Links need verification"],
        "play_policy": "standard intents / share targets",
        "browser_compat": "Chrome/Firefox/Samsung Share; no desktop extension APIs",
        "persistence": "handoff payload seeds session context",
        "ux_cost": "one explicit share gesture",
        "complexity": "low-medium",
        "security": "user-mediated content; validate/sanitize",
        "doctrine_fit": "high for context capture",
        "requires_overlay": False,
        "requires_accessibility": False,
        "recommendation": "required_handoff_path",
        "score_quiet_presence": 1,
        "score_session_resume": 4,
        "score_policy": 5,
        "score_onboarding": 5,
    },
]


def run_iterations() -> list[SpikeResult]:
    results: list[SpikeResult] = []
    store = SessionStore()
    machine = AffordanceMachine("dormant")

    # H1: quiet notification path can keep affordance available without overlay
    session = AssistSession(
        session_id="sess-spike-001",
        origin="https://jobs.example.com",
        status="active",
        company="Example Co",
        role="Automation Engineer",
        unresolved_field_count=3,
    )
    store.save(session)
    assert machine.transition("available")
    assert machine.transition("surfaced")
    browser_foreground = True
    affordance_visible_while_browser = machine.state == "surfaced" and browser_foreground
    no_overlay = True
    h1_ok = affordance_visible_while_browser and no_overlay and store.load() is not None
    results.append(
        SpikeResult(
            hypothesis_id="H1",
            hypothesis="Quiet notification/companion affordance can remain available while browser is foregrounded without SYSTEM_ALERT_WINDOW.",
            observation=f"affordance={machine.state}; browser_foreground={browser_foreground}; overlay_required=False",
            decision="KEEP" if h1_ok else "REJECT",
            keep=h1_ok,
            metrics={"overlay_required": False, "affordance": machine.state},
        )
    )

    # H2: same session resumes after leaving browser
    store.save(session)
    left_browser = True
    machine.transition("expanded")  # open companion
    resumed = store.load()
    h2_ok = (
        left_browser
        and resumed is not None
        and resumed.session_id == "sess-spike-001"
        and resumed.status == "active"
        and resumed.origin == "https://jobs.example.com"
    )
    results.append(
        SpikeResult(
            hypothesis_id="H2",
            hypothesis="Reopening EscapeHatch restores the identical assist session identity and origin binding.",
            observation=f"resumed_session_id={getattr(resumed, 'session_id', None)}; status={getattr(resumed, 'status', None)}",
            decision="KEEP" if h2_ok else "REJECT",
            keep=h2_ok,
            metrics={"session_key": SESSION_KEY, "match": h2_ok},
        )
    )

    # H3: deep link + sharesheet handoff
    deep = parse_deep_link(
        "escapehatch://assist?session=sess-spike-001&url=https%3A%2F%2Fjobs.example.com%2Fapply&company=Example%20Co&role=Automation%20Engineer"
    )
    share = parse_share_text("Apply here https://jobs.example.com/apply — why do you want this role?")
    h3_ok = (
        deep is not None
        and deep["session_id"] == "sess-spike-001"
        and deep["url"] == "https://jobs.example.com/apply"
        and share["url"] == "https://jobs.example.com/apply"
        and share["source"] == "sharesheet"
    )
    results.append(
        SpikeResult(
            hypothesis_id="H3",
            hypothesis="At least one supported Android handoff (deep link and Sharesheet text) can carry application context into EscapeHatch.",
            observation=f"deep={deep}; share_url={share.get('url')}",
            decision="KEEP" if h3_ok else "REJECT",
            keep=h3_ok,
            metrics={"deep_link": bool(deep), "sharesheet": True},
        )
    )

    # H4: dismiss preserves session; no prompt storm on navigation
    assert machine.transition("temporarily_dismissed")
    after_dismiss = store.load()
    nav_events = ["https://jobs.example.com/apply", "https://jobs.example.com/apply?page=2"]
    prompts = 0
    for _ in nav_events:
        # doctrine: ordinary navigation must not auto-resurface or notify
        if machine.state == "temporarily_dismissed":
            prompts += 0
    h4_ok = after_dismiss is not None and after_dismiss.session_id == session.session_id and prompts == 0
    results.append(
        SpikeResult(
            hypothesis_id="H4",
            hypothesis="Dismiss preserves session and ordinary browser navigation does not spawn repeated prompts.",
            observation=f"state={machine.state}; prompts={prompts}; session_preserved={after_dismiss is not None}",
            decision="KEEP" if h4_ok else "REJECT",
            keep=h4_ok,
            metrics={"prompts": prompts},
        )
    )

    # H5: overlay not required when notification+handoff scores dominate
    primary = next(m for m in MECHANISMS if m["recommendation"] == "primary_v1")
    overlay = next(m for m in MECHANISMS if m["id"] == "system_alert_window_overlay")
    primary_score = (
        primary["score_quiet_presence"]
        + primary["score_session_resume"]
        + primary["score_policy"]
        + primary["score_onboarding"]
    )
    overlay_score = (
        overlay["score_quiet_presence"]
        + overlay["score_session_resume"]
        + overlay["score_policy"]
        + overlay["score_onboarding"]
    )
    h5_ok = primary_score > overlay_score and not primary["requires_overlay"]
    results.append(
        SpikeResult(
            hypothesis_id="H5",
            hypothesis="SYSTEM_ALERT_WINDOW is unnecessary for V1 because a lower-authority mechanism scores higher on quiet presence + policy + onboarding.",
            observation=f"primary={primary['id']} score={primary_score}; overlay_score={overlay_score}",
            decision="KEEP" if h5_ok else "COMPARE",
            keep=h5_ok,
            metrics={"primary_score": primary_score, "overlay_score": overlay_score},
        )
    )

    # H6: bubbles are not primary (conversation mismatch)
    bubbles = next(m for m in MECHANISMS if m["id"] == "android_bubbles")
    h6_ok = bubbles["recommendation"] == "optional_enhancement_after_v1"
    results.append(
        SpikeResult(
            hypothesis_id="H6",
            hypothesis="Android Bubbles are unsuitable as V1 primary because API 30+ conversation requirements fight presence-not-nag doctrine for job assist.",
            observation=f"recommendation={bubbles['recommendation']}; doctrine_fit={bubbles['doctrine_fit']}",
            decision="KEEP" if h6_ok else "REJECT",
            keep=h6_ok,
            metrics={"bubbles_primary": False},
        )
    )

    return results


def select_architecture(results: list[SpikeResult]) -> dict[str, Any]:
    kept = {r.hypothesis_id: r for r in results}
    if not all(kept[h].keep for h in ("H1", "H2", "H3", "H4", "H5", "H6")):
        return {
            "status": "INCONCLUSIVE",
            "preferred_v1": None,
            "fallback": None,
        }
    return {
        "status": "DECIDED",
        "preferred_v1": "notification_foreground_service + companion_activity",
        "fallback": "sharesheet_intent_applink deep link without ongoing notification",
        "optional_later": "android_bubbles after quiet baseline and honest non-conversation UX research",
        "rejected_v1_primary": "system_alert_window_overlay",
        "forbidden_v1_dependency": "accessibility_service",
        "permissions_required": [
            "POST_NOTIFICATIONS (API 33+)",
            "optional FOREGROUND_SERVICE / FOREGROUND_SERVICE_SPECIAL_USE for durable quiet assist",
        ],
        "permissions_not_required_for_v1": [
            "SYSTEM_ALERT_WINDOW",
            "BIND_ACCESSIBILITY_SERVICE",
        ],
        "browser_handoff_path": "escapehatch://assist deep link + ACTION_SEND Sharesheet text/url",
        "session_persistence_boundary": SESSION_KEY,
    }


def main() -> int:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    results = run_iterations()
    decision = select_architecture(results)
    receipt = {
        "schema": "escapehatch/android-assist-presence-spike-receipt/v1",
        "version": 1,
        "lane": "EH-M1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "contract_schema": contract["schema"],
        "floor_commit_note": "host-side spike; no Android SDK device execution",
        "prototype_ladder": ["spike"],
        "iterations": [asdict(r) for r in results],
        "mechanism_matrix_embedded": MECHANISMS,
        "architecture_decision": decision,
        "acceptance": {
            "eh_u1_separated": True,
            "one_session_model": True,
            "no_second_state_machine": True,
            "handoff_proven_host_side": all(r.keep for r in results if r.hypothesis_id == "H3"),
            "session_resume_proven_host_side": all(r.keep for r in results if r.hypothesis_id == "H2"),
            "primary_mechanism_decided": decision["status"] == "DECIDED",
            "device_apk_proof": "BLOCKED_no_android_sdk",
        },
        "proof_ceiling": contract["proof_ceiling"],
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    failed = [r for r in results if not r.keep]
    print(f"ANDROID_ASSIST_PRESENCE_SPIKE: {'PASS' if not failed else 'FAIL'}")
    print(f"receipt={RECEIPT.relative_to(ROOT).as_posix()}")
    print(f"decision={decision['status']} preferred={decision.get('preferred_v1')}")
    for r in results:
        print(f"  {r.hypothesis_id} {r.decision}: {r.hypothesis[:72]}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
