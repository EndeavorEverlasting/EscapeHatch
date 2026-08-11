#!/usr/bin/env python3
"""Fail-closed completeness checks for the EscapeHatch harness."""

import json
import re
import subprocess
import sys
from pathlib import Path

R = Path(__file__).resolve().parents[1]
M = R / "harness/manifest.v1.json"
S = "escapehatch-harness/v1"

C = {
    "codebase_map": "harness/CODEBASE_MAP.md",
    "workflow_specs": "harness/WORKFLOWS.md",
    "artifact_registry": "ARTIFACT_REGISTRY.md",
    "harness_validator": "scripts/validate_harness.py",
    "governance_validator": "scripts/validate_governance.py",
    "repo_resolver": "scripts/resolve_repo.ps1",
    "pre_commit_hook": ".githooks/pre-commit",
    "pre_push_hook": ".githooks/pre-push",
    "scoped_skill": "skills/harness-operations/SKILL.md",
    "operator_report": "harness/reports/CURRENT_STATE.md",
    "lua_design_constraints": "harness/constraints/LUA_EMBEDDING.md",
    "ci_workflow": ".github/workflows/harness.yml",
}

OWN = {
    "Agent governance doctrine": "AGENTS.md",
    "Harness manifest": "harness/manifest.v1.json",
    "Codebase map": "harness/CODEBASE_MAP.md",
    "Workflow specs": "harness/WORKFLOWS.md",
    "Windows repo resolver": "scripts/resolve_repo.ps1",
    "Lua embedding constraints": "harness/constraints/LUA_EMBEDDING.md",
    "Current-state report": "harness/reports/CURRENT_STATE.md",
    "Career-state schema": "contracts/career-state.v1.schema.json",
    "Career-state example fixture": "fixtures/career-state.v1.example.json",
    "Career-state validator": "scripts/validate_career_state.py",
}

MARK = {
    C["codebase_map"]: (
        "## Repository floor",
        "## Structure",
        "## Durable Windows repository root",
        "## Product entry points",
        "## Validation commands",
        "## Build, test, and deploy commands",
        "## Fresh-agent path",
    ),
    C["workflow_specs"]: (
        "## Repository Location",
        "## Task Pickup",
        "## Pre-commit validation",
        "## Failure Recovery",
        "## Artifact discipline",
        "## Handoff",
        "## Product-runtime introduction gate",
    ),
    C["artifact_registry"]: (
        "## Naming rules",
        "## Registered artifacts",
        "## Validation output",
        "## Product artifact gate",
    ),
    C["lua_design_constraints"]: (
        "## Host owns the application",
        "## State isolation",
        "## Error boundary",
        "## Sandboxing",
        "## Execution model",
        "## Type discipline",
        "## Conceptual integrity",
        "## Validation expectations for the first Lua product sprint",
    ),
    C["scoped_skill"]: (
        "## Trigger",
        "## Required inputs",
        "## Procedure",
        "## Failure behavior",
        "## Expected outputs",
    ),
    C["operator_report"]: (
        "## Working",
        "## Broken",
        "## Missing / intentionally not yet established",
        "## Principal risks",
    ),
}

PC = (
    'repo=$(git rev-parse --show-toplevel)',
    'git -C "$repo" checkout-index --all --prefix="$snapshot/"',
    "python scripts/validate_governance.py",
    "python scripts/validate_harness.py",
    'git -C "$repo" diff --cached --check',
)

PP = (
    "while read -r local_ref local_sha remote_ref remote_sha",
    'git archive --format=tar --output="$archive" "$local_sha"',
    "python scripts/validate_governance.py",
    "python scripts/validate_harness.py",
    'git diff --check "$base" "$local_sha" --',
)

PS_REQUIRED = (
    "[string]$RepositoryUrl = 'https://github.com/EndeavorEverlasting/EscapeHatch.git',",
    "if ($ResolveOnly) {",
    "$preferred = Join-Path $HOME 'Desktop\\Dev'",
    "if ($cursor.Name -ieq 'Dev' -and $cursor.Parent -and $cursor.Parent.Name -ieq 'Desktop') {",
    "Invoke-Git -Arguments @('-C', $canonical, 'fetch', 'origin', 'main')",
    "Invoke-Git -Arguments @('-C', $canonical, 'worktree', 'add', '--detach', $target, $targetCommit)",
    "Write-Output $resolvedDevRoot",
    "Write-Output $target",
)


class E(ValueError):
    pass


def rd(path):
    q = R / path
    if not q.is_file():
        raise E(f"missing component: {path}")
    return q.read_text(encoding="utf-8")


def need(path, markers):
    text = rd(path)
    missing = [m for m in markers if m not in text]
    if missing:
        raise E(f"{path} missing markers: " + ", ".join(missing))


def manifest():
    try:
        data = json.loads(M.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise E(f"invalid harness manifest: {exc}") from exc

    if data.get("schema") != S:
        raise E("manifest schema is not canonical")
    if data.get("canonical_governance") != "AGENTS.md":
        raise E("manifest governance owner is not canonical")
    if data.get("components") != C:
        raise E("manifest component map is not canonical")
    if len(set(C.values())) != len(C):
        raise E("manifest component paths must be unique")

    for path in C.values():
        p = Path(path)
        if p.is_absolute() or ".." in p.parts or not (R / path).is_file():
            raise E(f"invalid or missing manifest component: {path}")

    expected = [
        "python scripts/validate_governance.py",
        "python scripts/validate_harness.py",
        "git diff --check",
    ]
    if data.get("validation_order") != expected:
        raise E("manifest validation_order is not canonical")
    if data.get("artifact_registry") != C["artifact_registry"]:
        raise E("artifact_registry alias mismatch")
    return data


def active_shell(text):
    return {
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def hookbody(path, text, required):
    if not text.startswith("#!/bin/sh\nset -eu\n"):
        raise E(f"{path} must start with #!/bin/sh and set -eu")
    lines = active_shell(text)
    missing = [line for line in required if line not in lines]
    if missing:
        raise E(f"{path} missing active commands: " + ", ".join(missing))


def hooks():
    count = 0
    for path, required in ((C["pre_commit_hook"], PC), (C["pre_push_hook"], PP)):
        text = rd(path)
        hookbody(path, text, required)
        target = "python scripts/validate_harness.py"
        for replacement in ("# " + target, "echo '" + target + "'"):
            try:
                hookbody(path, text.replace(target, replacement, 1), required)
            except E:
                count += 1
            else:
                raise E(f"hook negative fixture unexpectedly passed: {path}")
    return count


def active_powershell(text):
    lines = []
    in_block_comment = False
    for raw in text.splitlines():
        stripped = raw.strip()
        if stripped.startswith("<#"):
            in_block_comment = True
        if not in_block_comment and stripped and not stripped.startswith("#"):
            lines.append(stripped)
        if in_block_comment and stripped.endswith("#>"):
            in_block_comment = False
    return set(lines)


def resolverbody(text):
    lines = active_powershell(text)
    missing = [line for line in PS_REQUIRED if line not in lines]
    if missing:
        raise E("repo resolver missing active controls: " + ", ".join(missing))

    joined = "\n".join(lines)
    forbidden = (
        r"\$env:(?:TEMP|TMP)\b",
        r"AppData[\\/]+Local[\\/]+Temp",
        r"Join-Path\s+\$env:(?:TEMP|TMP)",
    )
    if any(re.search(pattern, joined, re.IGNORECASE) for pattern in forbidden):
        raise E("repo resolver must not place durable repository state in temporary storage")


def resolver():
    text = rd(C["repo_resolver"])
    resolverbody(text)
    count = 0
    mutations = (
        text.replace("$preferred = Join-Path $HOME 'Desktop\\Dev'", "$preferred = $env:TEMP", 1),
        text.replace(
            "Invoke-Git -Arguments @('-C', $canonical, 'worktree', 'add', '--detach', $target, $targetCommit)",
            "# worktree disabled",
            1,
        ),
        text.replace(
            "if ($cursor.Name -ieq 'Dev' -and $cursor.Parent -and $cursor.Parent.Name -ieq 'Desktop') {",
            "if ($false) {",
            1,
        ),
    )
    for candidate in mutations:
        try:
            resolverbody(candidate)
        except E:
            count += 1
        else:
            raise E("repo resolver negative fixture unexpectedly passed")
    return count


def ylines(text):
    result = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        prefix = raw[: len(raw) - len(raw.lstrip(" "))]
        if "\t" in prefix:
            raise E("CI workflow indentation must use spaces")
        result.append((len(prefix), raw.strip()))
    return result


def sub(lines, key, indent):
    token = key + ":"
    for index, (depth, text) in enumerate(lines):
        if depth == indent and text == token:
            end = next(
                (j for j in range(index + 1, len(lines)) if lines[j][0] <= indent),
                len(lines),
            )
            return lines[index + 1 : end]
    raise E(f"CI workflow missing active mapping: {token}")


def step_runs(job_lines):
    steps = sub(job_lines, "steps", 4)
    runs = {}
    index = 0
    while index < len(steps):
        depth, text = steps[index]
        if depth != 6 or not text.startswith("- name: "):
            index += 1
            continue
        name = text[8:].strip()
        end = index + 1
        while end < len(steps) and not (
            steps[end][0] == 6 and steps[end][1].startswith("- ")
        ):
            end += 1
        part = steps[index + 1 : end]
        value = None
        for offset, (item_depth, item) in enumerate(part):
            if item_depth == 8 and item.startswith("run:"):
                tail = item[4:].strip()
                if tail and tail != "|":
                    value = tail
                elif tail == "|":
                    value = "\n".join(x for q, x in part[offset + 1 :] if q > 8)
                break
        if value is not None:
            runs[name] = value
        index = end
    return runs


def ci_structure(text):
    lines = ylines(text)
    if (0, "name: Harness Validation") not in lines:
        raise E("CI missing active top-level name")

    on = sub(lines, "on", 0)
    events = {text[:-1] for depth, text in on if depth == 2 and text.endswith(":")}
    if not {"push", "pull_request"} <= events:
        raise E("CI must actively enable push and pull_request")

    jobs = sub(lines, "jobs", 0)

    validate_job = sub(jobs, "validate", 2)
    if (4, "runs-on: ubuntu-latest") not in validate_job:
        raise E("CI validate job must run on ubuntu-latest")
    validate_runs = step_runs(validate_job)
    if validate_runs.get("Validate governance") != "python scripts/validate_governance.py":
        raise E("CI governance validator must be an active run step")
    if validate_runs.get("Validate harness") != "python scripts/validate_harness.py":
        raise E("CI harness validator must be an active run step")
    if validate_runs.get("Validate career-state contract") != "python scripts/validate_career_state.py":
        raise E("CI career-state validator must remain an active run step")
    whitespace = validate_runs.get("Check whitespace", "")
    if not any(line.strip().startswith("git diff --check") for line in whitespace.splitlines()):
        raise E("CI whitespace step must actively execute git diff --check")

    windows_job = sub(jobs, "windows-location", 2)
    if (4, "runs-on: windows-latest") not in windows_job:
        raise E("CI windows-location job must run on windows-latest")
    windows_runs = step_runs(windows_job)
    path_proof = windows_runs.get("Validate durable Windows repo root", "")
    for marker in (
        "$expected = Join-Path $HOME 'Desktop\\Dev'",
        "& ./scripts/resolve_repo.ps1 -ResolveOnly",
        "WINDOWS_REPO_ROOT=PASS",
    ):
        if marker not in path_proof:
            raise E(f"CI Windows path-policy proof missing active control: {marker}")


def ci():
    text = rd(C["ci_workflow"])
    ci_structure(text)
    count = 0
    mutations = (
        text.replace("  pull_request:\n", "  # pull_request:\n", 1),
        text.replace(
            "run: python scripts/validate_harness.py",
            "note: python scripts/validate_harness.py",
            1,
        ),
        text.replace(
            "run: python scripts/validate_career_state.py",
            "note: python scripts/validate_career_state.py",
            1,
        ),
        text.replace("  windows-location:\n", "  # windows-location:\n", 1),
        text.replace(
            "& ./scripts/resolve_repo.ps1 -ResolveOnly",
            "# resolver disabled",
            1,
        ),
    )
    for candidate in mutations:
        try:
            ci_structure(candidate)
        except E:
            count += 1
        else:
            raise E("CI negative fixture unexpectedly passed")
    return count


def section(text, heading):
    key = heading + "\n"
    if key not in text:
        raise E(f"artifact registry missing section: {heading}")
    return text.split(key, 1)[1].split("\n## ", 1)[0]


def rows(text):
    output = []
    for raw in section(text, "## Registered artifacts").splitlines():
        if not raw.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in raw.strip().strip("|").split("|")]
        if not cells or cells[0] in ("Artifact", "---"):
            continue
        if len(cells) != 5 or not (
            cells[1].startswith("`") and cells[1].endswith("`")
        ):
            raise E("artifact registry row/owner format invalid")
        output.append((cells[0], cells[1][1:-1], cells[2], cells[3], cells[4]))
    if not output:
        raise E("artifact registry has no rows")
    return output


def registrybody(text, check_files=True):
    artifacts = rows(text)
    names = [row[0] for row in artifacts]
    owners = [row[1] for row in artifacts]
    if len(names) != len(set(names)):
        raise E("artifact names must be unique")
    if len(owners) != len(set(owners)):
        raise E("artifact owner paths must be unique")

    by_name = {row[0]: row for row in artifacts}
    for name, owner in OWN.items():
        if name not in by_name:
            raise E(f"missing registered artifact: {name}")
        row = by_name[name]
        if row[1] != owner:
            raise E(f"wrong owner for {name}: expected {owner}, got {row[1]}")
        if not row[3] or not row[4]:
            raise E(f"missing generation/validation contract for {name}")
        if check_files and not (R / owner).is_file():
            raise E(f"artifact owner does not exist: {owner}")


def registry():
    text = rd(C["artifact_registry"])
    registrybody(text)
    count = 0
    mutations = (
        text.replace(
            "| Codebase map | `harness/CODEBASE_MAP.md` |",
            "| Codebase map | `AGENTS.md` |",
            1,
        ),
        text.replace(
            "| Codebase map | `harness/CODEBASE_MAP.md` |",
            "| Codebase map | `harness/DOES_NOT_EXIST.md` |",
            1,
        ),
        text.replace(
            "| Windows repo resolver | `scripts/resolve_repo.ps1` |",
            "| Windows repo resolver | `harness/CODEBASE_MAP.md` |",
            1,
        ),
    )
    for candidate in mutations:
        try:
            registrybody(candidate)
        except E:
            count += 1
        else:
            raise E("artifact registry negative fixture unexpectedly passed")
    return count


def gov():
    process = subprocess.run(
        [sys.executable, str(R / "scripts/validate_governance.py")],
        cwd=R,
        text=True,
        capture_output=True,
        check=False,
    )
    if process.returncode:
        raise E(
            "governance validator failed: "
            + (process.stdout + process.stderr).strip()
        )


def main():
    try:
        manifest()
        for path, markers in MARK.items():
            need(path, markers)
        artifact_tests = registry()
        hook_tests = hooks()
        resolver_tests = resolver()
        ci_tests = ci()
        for path in MARK:
            if re.search(r"\b(?:TODO|TBD|FIXME)\b", rd(path)):
                raise E(f"placeholder marker found in {path}")
        gov()
    except E as exc:
        print(f"HARNESS_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1

    print("HARNESS_VALIDATION: PASS")
    print(f"manifest={M.relative_to(R)}")
    print(f"components={len(C)}")
    print(f"schema={S}")
    print(f"artifact_self_tests={artifact_tests}")
    print(f"hook_self_tests={hook_tests}")
    print(f"repo_resolver_self_tests={resolver_tests}")
    print(f"ci_self_tests={ci_tests}")
    print("governance_validator=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
