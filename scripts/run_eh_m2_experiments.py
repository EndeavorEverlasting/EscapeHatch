#!/usr/bin/env python3
"""EH-M2 P82 experiment runner — executes every measurement available in this environment."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import (  # noqa: E402
    achieved_evidence_capabilities,
    capabilities_for,
    validate_experiment,
)

ANDROID = ROOT / "android" / "application-assist"
RECEIPT = ROOT / "harness" / "reports" / "eh-m2-p82-experiment-receipt.v1.json"
GRADLEW = ANDROID / ("gradlew.bat" if os.name == "nt" else "gradlew")


@dataclass
class ExperimentRecord:
    hypothesis_id: str
    hypothesis: str
    evidence_class: str
    minimum_evidence_class: str
    required_capabilities: list[str]
    evidence: list[dict[str, Any]]
    build_artifact: str
    measurement_source: str
    observation: str
    decision: str
    decision_reason: str
    promotion_allowed: bool
    proof_ceiling: str
    achieved_prototype_level: str
    target_prototype_level: str
    metrics: dict[str, Any] = field(default_factory=dict)


def evidence_for(cls: str) -> list[dict[str, Any]]:
    return [{"evidence_class": cls, "capabilities": capabilities_for(cls)}]


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True)


def probe_toolchain() -> dict[str, Any]:
    java = which("java")
    javac = which("javac")
    adb = which("adb")
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    local_props = ANDROID / "local.properties"
    sdk_from_props = None
    if local_props.is_file():
        for line in local_props.read_text(encoding="utf-8").splitlines():
            if line.startswith("sdk.dir="):
                sdk_from_props = line.split("=", 1)[1].strip().replace("\\\\", "\\")
    return {
        "java": java,
        "javac": javac,
        "adb": adb,
        "ANDROID_HOME": sdk,
        "sdk_dir_props": sdk_from_props,
        "gradlew": GRADLEW.is_file(),
    }


def h1_compile(toolchain: dict[str, Any]) -> ExperimentRecord:
    hyp = "The EH-M1 Android scaffold can be promoted into a valid installable Android application without changing the canonical Application Assist contract."
    required_caps = capabilities_for("COMPILED_ANDROID")
    required = [
        ANDROID / "settings.gradle.kts",
        ANDROID / "app" / "build.gradle.kts",
        ANDROID / "app" / "src" / "main" / "java" / "com" / "escapehatch" / "assist" / "CompanionActivity.kt",
        ANDROID / "app" / "src" / "main" / "AndroidManifest.xml",
    ]
    missing = [str(p.relative_to(ROOT)) for p in required if not p.is_file()]
    if missing:
        return ExperimentRecord(
            hypothesis_id="H1",
            hypothesis=hyp,
            evidence_class="STATIC_REASONING",
            minimum_evidence_class="COMPILED_ANDROID",
            required_capabilities=required_caps,
            evidence=evidence_for("STATIC_REASONING"),
            build_artifact="android/application-assist",
            measurement_source="filesystem_presence",
            observation=f"missing required sources: {missing}",
            decision="REJECT",
            decision_reason="Gradle application sources incomplete.",
            promotion_allowed=False,
            proof_ceiling="STATIC_REASONING",
            achieved_prototype_level="P0",
            target_prototype_level="P1",
            metrics={"missing": missing},
        )

    if not toolchain["java"] or not (toolchain["ANDROID_HOME"] or toolchain["sdk_dir_props"]):
        return ExperimentRecord(
            hypothesis_id="H1",
            hypothesis=hyp,
            evidence_class="HOST_SIMULATION",
            minimum_evidence_class="COMPILED_ANDROID",
            required_capabilities=required_caps,
            evidence=evidence_for("HOST_SIMULATION"),
            build_artifact="android/application-assist",
            measurement_source="toolchain_probe",
            observation=(
                f"sources_present=true; java={toolchain['java']}; "
                f"ANDROID_HOME={toolchain['ANDROID_HOME']}; sdk.dir={toolchain['sdk_dir_props']}; "
                f"gradlew={toolchain['gradlew']}"
            ),
            decision="BLOCKED",
            decision_reason="JDK 17+ and/or Android SDK unavailable in this environment; cannot claim COMPILED_ANDROID.",
            promotion_allowed=False,
            proof_ceiling="HOST_SIMULATION",
            achieved_prototype_level="P0",
            target_prototype_level="P1",
            metrics=toolchain,
        )

    if not GRADLEW.is_file():
        return ExperimentRecord(
            hypothesis_id="H1",
            hypothesis=hyp,
            evidence_class="HOST_SIMULATION",
            minimum_evidence_class="COMPILED_ANDROID",
            required_capabilities=required_caps,
            evidence=evidence_for("HOST_SIMULATION"),
            build_artifact="android/application-assist",
            measurement_source="gradle_wrapper_probe",
            observation="Toolchain present but gradle wrapper missing; refuse to invent unsigned wrapper binary.",
            decision="BLOCKED",
            decision_reason="Need gradle wrapper generation on a machine with Gradle installed.",
            promotion_allowed=False,
            proof_ceiling="HOST_SIMULATION",
            achieved_prototype_level="P0",
            target_prototype_level="P1",
            metrics=toolchain,
        )

    proc = run([str(GRADLEW), ":app:assembleDebug", "--no-daemon"], cwd=ANDROID)
    ok = proc.returncode == 0
    apk = ANDROID / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
    compiled = ok and apk.is_file()
    cls = "COMPILED_ANDROID" if compiled else "HOST_SIMULATION"
    return ExperimentRecord(
        hypothesis_id="H1",
        hypothesis=hyp,
        evidence_class=cls,
        minimum_evidence_class="COMPILED_ANDROID",
        required_capabilities=required_caps,
        evidence=evidence_for(cls),
        build_artifact=str(apk.relative_to(ROOT)) if apk.is_file() else "android/application-assist",
        measurement_source="gradle_assembleDebug",
        observation=(proc.stdout[-2000:] + "\n" + proc.stderr[-2000:]).strip(),
        decision="PROMOTE" if compiled else "REFINE",
        decision_reason=(
            "APK built successfully; host presence-surface tests must remain green separately."
            if compiled
            else "Gradle assembleDebug failed; see observation."
        ),
        promotion_allowed=bool(compiled),
        proof_ceiling="COMPILED_ANDROID" if compiled else "HOST_SIMULATION",
        achieved_prototype_level="P1" if compiled else "P0",
        target_prototype_level="P1",
        metrics={"returncode": proc.returncode, "apk": apk.is_file()},
    )


def blocked_android(
    hid: str,
    hyp: str,
    minimum: str,
    target: str,
    reason: str,
) -> ExperimentRecord:
    return ExperimentRecord(
        hypothesis_id=hid,
        hypothesis=hyp,
        evidence_class="HOST_SIMULATION",
        minimum_evidence_class=minimum,
        required_capabilities=capabilities_for(minimum),
        evidence=evidence_for("HOST_SIMULATION"),
        build_artifact="android/application-assist/app/src/main/java/com/escapehatch/assist",
        measurement_source="environment_capability_probe",
        observation=reason,
        decision="BLOCKED",
        decision_reason=reason,
        promotion_allowed=False,
        proof_ceiling="HOST_SIMULATION",
        achieved_prototype_level="P0",
        target_prototype_level=target,
    )


def run_all() -> list[ExperimentRecord]:
    toolchain = probe_toolchain()
    results = [h1_compile(toolchain)]

    results.append(
        blocked_android(
            "H2",
            "`escapehatch://assist` can invoke the companion Activity and deliver sanitized assist context.",
            "EMULATOR_OBSERVED",
            "P2",
            "No adb/emulator available; Activity deep-link reception UNOBSERVED_ANDROID. Sources implement intent filters.",
        )
    )
    results.append(
        blocked_android(
            "H3",
            "A browser can share job/application context into EscapeHatch through ACTION_SEND.",
            "BROWSER_OBSERVED",
            "P3",
            "No browser/emulator share path available. Manifest declares SEND text/plain target; reception UNOBSERVED_ANDROID.",
        )
    )
    results.append(
        blocked_android(
            "H4",
            "Application Assist survives Activity destruction/process restart with same workflow identity.",
            "EMULATOR_OBSERVED",
            "P2",
            "SharedPreferences store implemented replacing in-memory spike; lifecycle recreation not instrumented (no emulator).",
        )
    )
    results.append(
        blocked_android(
            "H5",
            "A low-attention Android notification provides persistent contextual availability while the browser remains the main work surface.",
            "BROWSER_OBSERVED",
            "P3",
            "QuietAssistNotification implemented (IMPORTANCE_LOW, silent, onlyAlertOnce). Notification-over-browser UNOBSERVED_ANDROID.",
        )
    )
    results.append(
        ExperimentRecord(
            hypothesis_id="H6",
            hypothesis="A foreground service is either necessary or unnecessary for the actual V1 lifecycle.",
            evidence_class="STATIC_REASONING",
            minimum_evidence_class="EMULATOR_OBSERVED",
            required_capabilities=capabilities_for("EMULATOR_OBSERVED"),
            evidence=evidence_for("STATIC_REASONING"),
            build_artifact="android/application-assist/.../QuietAssistNotification.kt",
            measurement_source="code_inspection_no_fgs_path",
            observation="V1 path implements notification/activity without FGS. Necessity undecided until H5 lifecycle evidence.",
            decision="INCONCLUSIVE",
            decision_reason="No FGS added yet (correct sequencing). Decision among NO_FGS_NEEDED_V1 / FGS_REQUIRED_V1 / FGS_CONDITIONAL requires emulator/device measurement.",
            promotion_allowed=False,
            proof_ceiling="STATIC_REASONING",
            achieved_prototype_level="P0",
            target_prototype_level="P2",
            metrics={"fgs_enabled": False, "p82_decision": "INCONCLUSIVE"},
        )
    )
    results.append(
        ExperimentRecord(
            hypothesis_id="H7",
            hypothesis="SYSTEM_ALERT_WINDOW remains unnecessary for V1.",
            evidence_class="STATIC_REASONING",
            minimum_evidence_class="EMULATOR_OBSERVED",
            required_capabilities=capabilities_for("EMULATOR_OBSERVED"),
            evidence=evidence_for("STATIC_REASONING"),
            build_artifact="android/application-assist/app/src/main/AndroidManifest.xml",
            measurement_source="manifest_inspection_plus_prior_lkg",
            observation="Manifest omits SYSTEM_ALERT_WINDOW. H2–H6 Android observations unavailable; no unmet V1 requirement empirically demonstrated that requires overlay.",
            decision="KEEP",
            decision_reason="Retain LKG (overlay not required). Do not reopen overlay without H2–H6 evidence of impossibility.",
            promotion_allowed=False,
            proof_ceiling="STATIC_REASONING",
            achieved_prototype_level="P0",
            target_prototype_level="P2",
            metrics={"overlay_permission_declared": False},
        )
    )
    results.append(
        ExperimentRecord(
            hypothesis_id="H8",
            hypothesis="Android Bubbles may or may not improve the post-V1 experience.",
            evidence_class="STATIC_REASONING",
            minimum_evidence_class="PHYSICAL_DEVICE_OBSERVED",
            required_capabilities=capabilities_for("PHYSICAL_DEVICE_OBSERVED"),
            evidence=evidence_for("STATIC_REASONING"),
            build_artifact="none — deferred until H5 quiet baseline OBSERVED",
            measurement_source="sequencing_gate",
            observation="H5 not BROWSER_OBSERVED/PHYSICAL_DEVICE_OBSERVED; Bubble experiment not admitted.",
            decision="BLOCKED",
            decision_reason="Requires known-good quiet notification baseline (H5) before Bubble comparison.",
            promotion_allowed=False,
            proof_ceiling="STATIC_REASONING",
            achieved_prototype_level="P0",
            target_prototype_level="P4",
            metrics={"admitted": False},
        )
    )

    for r in results:
        errs = validate_experiment(asdict(r))
        if errs:
            raise RuntimeError("; ".join(errs))
    return results


def main() -> int:
    results = run_all()
    iteration_dicts = [asdict(r) for r in results]
    achieved_caps = achieved_evidence_capabilities(iteration_dicts)
    # Display-only max class by display_order — never promotion authority.
    display_order = {
        "STATIC_REASONING": 10,
        "PLAY_POLICY_DOCUMENTED": 15,
        "HOST_SIMULATION": 20,
        "COMPILED_ANDROID": 30,
        "EMULATOR_OBSERVED": 40,
        "BROWSER_OBSERVED": 50,
        "PHYSICAL_DEVICE_OBSERVED": 60,
        "PLAY_RELEASE_OBSERVED": 70,
    }
    receipt = {
        "schema": "escapehatch/eh-m2-p82-experiment-receipt/v1",
        "version": 2,
        "lane": "EH-M2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "evidence_contract": "contracts/p82-evidence-class.v1.json",
        "promotion_authority": "capability_containment",
        "lkg_architecture": {
            "session": "escapeHatch.applicationAssistSession.v1",
            "presence_surface": "contracts/application-assist-presence-surface.v1.json",
            "android": ["quiet_notification", "companion_activity", "sharesheet_deep_link"],
            "system_alert_window": "not_required",
            "accessibility": "forbidden_v1",
            "bubbles": "optional_later",
            "fgs": "inconclusive_pending_lifecycle",
        },
        "toolchain": probe_toolchain(),
        "iterations": iteration_dicts,
        "achieved_evidence_capabilities": achieved_caps,
        "highest_evidence_class": max(
            (r.evidence_class for r in results),
            key=lambda c: display_order.get(c, 0),
        ),
        "highest_evidence_class_role": "display_only_non_authoritative",
        "proof_ceiling": [
            "capability-based evidence framework",
            "Gradle sources implemented",
            "COMPILED_ANDROID only if assembleDebug succeeds",
            "emulator/device/browser observations BLOCKED without SDK/adb",
        ],
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("EH_M2_P82_EXPERIMENTS: PASS")
    print(f"receipt={RECEIPT.relative_to(ROOT).as_posix()}")
    print(f"achieved_evidence_capabilities={achieved_caps}")
    for r in results:
        print(
            f"  {r.hypothesis_id} {r.decision} achieved={r.achieved_prototype_level} "
            f"target={r.target_prototype_level} caps={r.required_capabilities} "
            f"promote={r.promotion_allowed}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
