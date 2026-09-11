#!/usr/bin/env python3
"""Fault-injection proofs for repository promotion pipeline.

Validates that the promotion DAG distinguishes harness vs application E2E,
pins exact candidate identity, fails closed on SKIP/stale/partial truth,
and that the provider-side guard blocks unauthorized or degraded promotions.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "repository-promotion.v1.json"
GUARD_PATH = ROOT / "scripts" / "promotion_guard.py"


def load_guard():
    spec = importlib.util.spec_from_file_location("promotion_guard", GUARD_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load promotion_guard")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class RepositoryPromotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.guard = load_guard()
        cls.contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    def test_contract_is_provider_agnostic_and_bound(self):
        # Provider-agnostic at contract, bound to one concrete adapter at runtime
        host = self.contract["host_identity"]
        self.assertEqual(host["observed_host"], "github.com")
        self.assertEqual(host["canonical_scm"], "github")
        self.assertEqual(host["active_adapter"], "github-actions")
        adapters = host["supported_adapters"]
        self.assertGreaterEqual(len(adapters), 2)
        gh = next(a for a in adapters if a["id"] == "github-actions")
        self.assertEqual(gh["workflow"], ".github/workflows/promotion.yml")
        self.assertIn("pull_request", str(gh["capability_map"]["readiness_events"]))

    def test_dag_is_cheapest_to_strongest_and_has_distinct_e2e(self):
        dag = self.contract["validation_dag"]
        gates = dag["gates"]
        categories = dag["categories"]
        self.assertEqual(categories[0], "structural/schema/format")
        self.assertEqual(categories[-1], "promotion")
        # harness and app e2e distinct and both required
        hre = self.contract["harness_vs_application_e2e"]
        self.assertTrue(hre["both_required"])
        self.assertEqual(hre["harness_e2e_gate"], "harness-e2e")
        self.assertEqual(hre["application_e2e_gate"], "application-e2e")
        harness_gate = next(g for g in gates if g["id"] == "harness-e2e")
        app_gate = next(g for g in gates if g["id"] == "application-e2e")
        self.assertEqual(harness_gate["cannot_substitute"], "application-e2e")
        self.assertEqual(app_gate["cannot_substitute"], "harness-e2e")
        # Every gate must compose canonical repo commands, not duplicate provider YAML
        for g in gates:
            cmd = g.get("command") or " ".join(g.get("commands", []))
            self.assertTrue(
                any(tok in cmd for tok in ["python scripts/", "python tests/", "node ", "git diff", "gh api", "python -m py_compile"]),
                f"gate {g['id']} does not compose canonical command: {cmd}",
            )

    def test_required_checks_manifest_is_explicit(self):
        manifest = self.contract["required_checks_manifest"]
        self.assertEqual(manifest["policy_version"], "1")
        main_checks = manifest["destinations"]["main"]["checks"]
        self.assertGreaterEqual(len(main_checks), 3)
        for chk in main_checks:
            self.assertIn("workflow", chk)
            self.assertIn("job", chk)
            self.assertIn(chk["workflow"], chk["name"])
            self.assertIn(chk["job"], chk["name"])
            self.assertEqual(chk["conclusion"], "success")

    def test_candidate_identity_pins_exact_sha(self):
        ci = self.contract["candidate_identity"]
        self.assertIn("head_sha", ci["fields"])
        self.assertIn("base_sha", ci["fields"])
        self.assertTrue(ci["pin_before_promotion"])
        self.assertTrue(ci["invalidate_on_move"])

    def test_green_exact_head_reaches_promotion(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40, merge_base="c"*40)
        required = self.guard.load_required_checks(destination="main")
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required]
        receipt = self.guard.promotion_guard_evaluate(
            candidate, required, checks,
            harness_conclusion="success", app_conclusion="success",
            review_decision="APPROVED", unresolved_threads=0,
            target="main", current_head=candidate.head_sha, current_base=candidate.base_sha, provider_status="OK"
        )
        self.assertEqual(receipt["status"], "READY")
        self.assertIn("expected_head_sha", receipt["compare_and_set"])

    def test_harness_failure_blocks(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required]
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, harness_conclusion="failure", app_conclusion="success", review_decision="APPROVED", unresolved_threads=0, current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("harness-e2e", receipt["reason"])

    def test_application_e2e_failure_blocks(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required]
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, harness_conclusion="success", app_conclusion="failure", review_decision="APPROVED", unresolved_threads=0, current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("application-e2e", receipt["reason"])

    def test_required_skip_blocks(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "skipped" if i == 0 else "success", candidate.head_sha) for i, r in enumerate(required)]
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("SKIP", receipt["reason"])

    def test_missing_required_check_blocks(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required[1:]]
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("missing", receipt["reason"])

    def test_unresolved_threads_block_even_when_ci_green(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required]
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, review_decision="APPROVED", unresolved_threads=3, current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("unresolved", receipt["reason"])

    def test_stale_candidate_blocks_at_final_reread(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", "a"*40) for r in required]
        # current head moved to b*40
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, current_head="b"*40, current_base="b"*40)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("stale", receipt["reason"])

    def test_unauthorized_target_blocks(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required]
        receipt = self.guard.promotion_guard_evaluate(candidate, required, checks, target="evil-branch", allowed_targets=["main"], current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(receipt["status"], "BLOCKED")
        self.assertIn("unauthorized", receipt["reason"])

    def test_duplicate_wakeups_idempotent(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        checks = [self.guard.CheckResult(r["workflow"], r["job"], r["name"], "success", candidate.head_sha) for r in required]
        r1 = self.guard.promotion_guard_evaluate(candidate, required, checks, current_head=candidate.head_sha, current_base=candidate.base_sha)
        r2 = self.guard.promotion_guard_evaluate(candidate, required, checks, current_head=candidate.head_sha, current_base=candidate.base_sha)
        self.assertEqual(r1["status"], "READY")
        self.assertEqual(r2["status"], "READY")
        self.assertEqual(r1["compare_and_set"], r2["compare_and_set"])
        self.assertTrue(r1["idempotent"])

    def test_degraded_provider_blocks_mutation(self):
        candidate = self.guard.Candidate(head_sha="a"*40, base_sha="b"*40)
        required = self.guard.load_required_checks()
        for status in ["PROVIDER_UNAVAILABLE", "PROVIDER_RATE_LIMITED", "PROVIDER_PARTIAL_TRUTH"]:
            receipt = self.guard.promotion_guard_evaluate(candidate, required, [], current_head=candidate.head_sha, current_base=candidate.base_sha, provider_status=status)
            self.assertEqual(receipt["status"], status)

    def test_compare_and_set_and_idempotent_markers_present(self):
        # Ensure guard implementation contains markers required by validator
        text = GUARD_PATH.read_text(encoding="utf-8")
        for marker in ["candidate_head_sha", "required_checks", "PROVIDER_UNAVAILABLE", "compare-and-set", "idempotent"]:
            self.assertIn(marker, text)

    def test_promotion_workflow_markers(self):
        wf = (ROOT / ".github" / "workflows" / "promotion.yml").read_text(encoding="utf-8")
        for marker in ["name: Repository Promotion", "pull_request:", "merge_group:", "push:", "workflow_dispatch:", "concurrency:", "expected_head_sha", "PROVIDER_UNAVAILABLE", "gh api", "merge-base --is-ancestor"]:
            self.assertIn(marker, wf)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RepositoryPromotionTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
