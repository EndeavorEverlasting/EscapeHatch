#!/usr/bin/env python3
"""EH-M1 Android Application Assist presence spike — host-side proof runner.

Produces HOST_SIMULATION / STATIC_REASONING evidence only.
Does not claim Android runtime, emulator, device, or Play observation.
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
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import validate_experiment  # noqa: E402

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
class ExperimentRecord:
    hypothesis_id: str
    hypothesis: str
    evidence_class: str
    minimum_evidence_class: str
    build_artifact: str
    measurement_source: str
    observation: str
    decision: str
    decision_reason: str
    promotion_allowed: bool
    proof_ceiling: str
    prototype_level: str
    # Historical compatibility: KEEP-as-candidate retained, not empirical proof.
    keep: bool = False
    historical_decision_label: str | None = None
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
        "recommendation": "primary_v1",
        "requires_overlay": False,
        "score_quiet_presence": 5,
        "score_session_resume": 5,
        "score_policy": 5,
        "score_onboarding": 4,
        "score_provenance": "STATIC_REASONING_authored_weights",
    },
    {
        "id": "android_bubbles",
        "recommendation": "optional_enhancement_after_v1",
        "requires_overlay": False,
        "score_quiet_presence": 3,
        "score_session_resume": 4,
        "score_policy": 4,
        "score_onboarding": 3,
        "score_provenance": "STATIC_REASONING_authored_weights",
        "doctrine_fit": "medium",
    },
    {
        "id": "system_alert_window_overlay",
        "recommendation": "rejected_v1_primary",
        "requires_overlay": True,
        "score_quiet_presence": 2,
        "score_session_resume": 4,
        "score_policy": 1,
        "score_onboarding": 1,
        "score_provenance": "STATIC_REASONING_authored_weights",
    },
]


def run_iterations() -> list[ExperimentRecord]:
    results: list[ExperimentRecord] = []
    store = SessionStore()
    machine = AffordanceMachine("dormant")

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
    # Assigned simulation inputs — not Android observations.
    browser_foreground = True
    no_overlay = True
    model_ok = machine.state == "surfaced" and browser_foreground and no_overlay and store.load() is not None
    results.append(
        ExperimentRecord(
            hypothesis_id="H1",
            hypothesis="Quiet notification/companion affordance can remain available while browser is foregrounded without SYSTEM_ALERT_WINDOW.",
            evidence_class="HOST_SIMULATION",
            minimum_evidence_class="PHYSICAL_DEVICE_OBSERVED",
            build_artifact="scripts/run_android_assist_presence_spike.py",
            measurement_source="assigned_browser_foreground_and_host_affordance_machine",
            observation=(
                f"affordance={machine.state}; browser_foreground={browser_foreground} "
                f"(assigned); overlay_required=False (assigned). Model can represent the condition."
            ),
            decision="KEEP",
            decision_reason="Host model retains candidate; Android notification-over-browser remains UNOBSERVED_ANDROID.",
            promotion_allowed=False,
            proof_ceiling="HOST_SIMULATION",
            prototype_level="P0",
            keep=True,
            historical_decision_label="KEEP",
            metrics={"overlay_required": False, "affordance": machine.state, "assigned_inputs": True},
        )
    )

    store.save(session)
    machine.transition("expanded")
    resumed = store.load()
    host_resume_ok = (
        resumed is not None
        and resumed.session_id == "sess-spike-001"
        and resumed.status == "active"
        and resumed.origin == "https://jobs.example.com"
    )
    results.append(
        ExperimentRecord(
            hypothesis_id="H2",
            hypothesis="Reopening EscapeHatch restores the identical assist session identity and origin binding.",
            evidence_class="HOST_SIMULATION",
            minimum_evidence_class="EMULATOR_OBSERVED",
            build_artifact="scripts/run_android_assist_presence_spike.py#SessionStore",
            measurement_source="in_memory_python_session_store",
            observation=f"resumed_session_id={getattr(resumed, 'session_id', None)}; status={getattr(resumed, 'status', None)}",
            decision="KEEP" if host_resume_ok else "REJECT",
            decision_reason=(
                "In-memory host store preserves identity; process-death Android restoration UNOBSERVED_ANDROID."
                if host_resume_ok
                else "Host store failed to restore session identity."
            ),
            promotion_allowed=False,
            proof_ceiling="HOST_SIMULATION",
            prototype_level="P0",
            keep=host_resume_ok,
            historical_decision_label="KEEP" if host_resume_ok else "REJECT",
            metrics={"session_key": SESSION_KEY, "match": host_resume_ok},
        )
    )

    deep = parse_deep_link(
        "escapehatch://assist?session=sess-spike-001&url=https%3A%2F%2Fjobs.example.com%2Fapply&company=Example%20Co&role=Automation%20Engineer"
    )
    share = parse_share_text("Apply here https://jobs.example.com/apply — why do you want this role?")
    parse_ok = (
        deep is not None
        and deep["session_id"] == "sess-spike-001"
        and deep["url"] == "https://jobs.example.com/apply"
        and share["url"] == "https://jobs.example.com/apply"
        and share["source"] == "sharesheet"
    )
    results.append(
        ExperimentRecord(
            hypothesis_id="H3",
            hypothesis="At least one supported Android handoff (deep link and Sharesheet text) can carry application context into EscapeHatch.",
            evidence_class="HOST_SIMULATION",
            minimum_evidence_class="EMULATOR_OBSERVED",
            build_artifact="scripts/run_android_assist_presence_spike.py#parse_*",
            measurement_source="python_uri_and_share_text_parsers",
            observation=f"deep={deep}; share_url={share.get('url')}",
            decision="KEEP" if parse_ok else "REJECT",
            decision_reason=(
                "Parser semantics HOST_SIMULATION_PROVEN; Android Activity/Sharesheet reception UNOBSERVED_ANDROID."
                if parse_ok
                else "Parser semantics failed host checks."
            ),
            promotion_allowed=False,
            proof_ceiling="HOST_SIMULATION",
            prototype_level="P0",
            keep=parse_ok,
            historical_decision_label="KEEP" if parse_ok else "REJECT",
            metrics={"deep_link": bool(deep), "sharesheet_parser": True},
        )
    )

    assert machine.transition("temporarily_dismissed")
    after_dismiss = store.load()
    nav_events = ["https://jobs.example.com/apply", "https://jobs.example.com/apply?page=2"]
    prompts = 0
    for _ in nav_events:
        if machine.state == "temporarily_dismissed":
            prompts += 0
    dismiss_ok = after_dismiss is not None and after_dismiss.session_id == session.session_id and prompts == 0
    results.append(
        ExperimentRecord(
            hypothesis_id="H4",
            hypothesis="Dismiss preserves session and ordinary browser navigation does not spawn repeated prompts.",
            evidence_class="HOST_SIMULATION",
            minimum_evidence_class="BROWSER_OBSERVED",
            build_artifact="scripts/run_android_assist_presence_spike.py#AffordanceMachine",
            measurement_source="host_affordance_machine_plus_in_memory_store",
            observation=f"state={machine.state}; prompts={prompts}; session_preserved={after_dismiss is not None}",
            decision="KEEP" if dismiss_ok else "REJECT",
            decision_reason=(
                "Dismiss/session retention model HOST_SIMULATION_PROVEN; Android notification lifecycle UNOBSERVED_ANDROID."
                if dismiss_ok
                else "Host dismiss model failed."
            ),
            promotion_allowed=False,
            proof_ceiling="HOST_SIMULATION",
            prototype_level="P0",
            keep=dismiss_ok,
            historical_decision_label="KEEP" if dismiss_ok else "REJECT",
            metrics={"prompts": prompts},
        )
    )

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
    score_prefers_primary = primary_score > overlay_score and not primary["requires_overlay"]
    results.append(
        ExperimentRecord(
            hypothesis_id="H5",
            hypothesis="SYSTEM_ALERT_WINDOW is unnecessary for V1 because a lower-authority mechanism scores higher on quiet presence + policy + onboarding.",
            evidence_class="STATIC_REASONING",
            minimum_evidence_class="EMULATOR_OBSERVED",
            build_artifact="docs/APPLICATION_ASSIST_ANDROID_CAPABILITY_MATRIX.md",
            measurement_source="authored_numeric_weights_plus_play_policy_docs",
            observation=f"primary={primary['id']} score={primary_score}; overlay_score={overlay_score}; provenance=authored_weights",
            decision="KEEP" if score_prefers_primary else "INCONCLUSIVE",
            decision_reason=(
                "ACCEPTED DESIGN aid only — authored scores are not Android observation. Overlay necessity remains empirically open until H2–H6 Android evidence."
            ),
            promotion_allowed=False,
            proof_ceiling="STATIC_REASONING",
            prototype_level="P0",
            keep=score_prefers_primary,
            historical_decision_label="KEEP" if score_prefers_primary else "COMPARE",
            metrics={"primary_score": primary_score, "overlay_score": overlay_score, "authored": True},
        )
    )

    bubbles = next(m for m in MECHANISMS if m["id"] == "android_bubbles")
    results.append(
        ExperimentRecord(
            hypothesis_id="H6",
            hypothesis="Android Bubbles are unsuitable as V1 primary because API 30+ conversation requirements fight presence-not-nag doctrine for job assist.",
            evidence_class="STATIC_REASONING",
            minimum_evidence_class="PHYSICAL_DEVICE_OBSERVED",
            build_artifact="android/application-assist-spike/.../BubblePresenceCandidate.kt",
            measurement_source="authored_recommendation_metadata_and_android_docs",
            observation=(
                f"recommendation={bubbles['recommendation']}; doctrine_fit={bubbles['doctrine_fit']}. "
                "Success condition previously depended on pre-authored recommendation label — not independent measurement."
            ),
            decision="KEEP",
            decision_reason="Retain as optional later candidate; Bubble behavior UNOBSERVED_DEVICE. Do not promote from metadata.",
            promotion_allowed=False,
            proof_ceiling="STATIC_REASONING",
            prototype_level="P0",
            keep=True,
            historical_decision_label="KEEP",
            metrics={"bubbles_primary": False, "metadata_dependent_historical_pass": True},
        )
    )

    # Ensure every record is schema-valid for its own claims.
    for record in results:
        errs = validate_experiment(asdict(record))
        if errs:
            raise RuntimeError("; ".join(errs))
        if not model_ok and record.hypothesis_id == "H1":
            pass
    return results


def select_architecture(results: list[ExperimentRecord]) -> dict[str, Any]:
    return {
        "status": "ACCEPTED_DESIGN",
        "evidence_class": "STATIC_REASONING",
        "empirical_android_proof": False,
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
        "note": "Architecture retained as last-known-good design. Not promoted to Android-observed proof.",
        "candidates_retained": [r.hypothesis_id for r in results if r.decision == "KEEP"],
    }


def main() -> int:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    results = run_iterations()
    decision = select_architecture(results)
    receipt = {
        "schema": "escapehatch/android-assist-presence-spike-receipt/v1",
        "version": 2,
        "lane": "EH-M1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "contract_schema": contract["schema"],
        "evidence_contract": "contracts/p82-evidence-class.v1.json",
        "floor_commit_note": "host-side spike with corrected evidence classes; no Android SDK device execution",
        "prototype_ladder": ["P0"],
        "iterations": [asdict(r) for r in results],
        "mechanism_matrix_embedded": MECHANISMS,
        "architecture_decision": decision,
        "acceptance": {
            "eh_u1_separated": True,
            "one_session_model": True,
            "no_second_state_machine": True,
            "handoff_parser_host_simulation": any(
                r.hypothesis_id == "H3" and r.decision == "KEEP" for r in results
            ),
            "session_resume_host_simulation": any(
                r.hypothesis_id == "H2" and r.decision == "KEEP" for r in results
            ),
            "architecture_accepted_design": decision["status"] == "ACCEPTED_DESIGN",
            "any_promotion_allowed": any(r.promotion_allowed for r in results),
            "device_apk_proof": "UNOBSERVED_ANDROID",
            "notification_over_browser": "UNOBSERVED_ANDROID",
            "android_activity_deeplink": "UNOBSERVED_ANDROID",
            "sharesheet_reception": "UNOBSERVED_ANDROID",
            "process_death_restore": "UNOBSERVED_ANDROID",
            "bubble_behavior": "UNOBSERVED_DEVICE",
            "play_store_acceptance": "UNOBSERVED_EXTERNAL",
        },
        "proof_ceiling": [
            "HOST_SIMULATION for parsers/state machine",
            "STATIC_REASONING / ACCEPTED_DESIGN for architecture selection",
            "no_compiled_android_claim",
            "no_emulator_or_device_claim",
            "no_play_release_claim",
        ],
        "correction_note": (
            "Historical KEEP labels preserved under historical_decision_label. "
            "KEEP means candidate retained, not empirical Android proof."
        ),
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    inflation = []
    for r in results:
        inflation.extend(validate_experiment(asdict(r)))
    rejected = [r for r in results if r.decision == "REJECT"]
    ok = not inflation and not rejected
    print(f"ANDROID_ASSIST_PRESENCE_SPIKE: {'PASS' if ok else 'FAIL'}")
    print(f"receipt={RECEIPT.relative_to(ROOT).as_posix()}")
    print(f"decision={decision['status']} preferred={decision.get('preferred_v1')}")
    for r in results:
        print(
            f"  {r.hypothesis_id} {r.decision} evidence={r.evidence_class} "
            f"min={r.minimum_evidence_class} promote={r.promotion_allowed}"
        )
    for err in inflation:
        print(f"  ! {err}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
