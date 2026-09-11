#!/usr/bin/env python3
"""Fail-closed validator for EscapeHatch product-release version authority."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "product_version.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("escapehatch_product_version", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load product_version module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    mod = _load_module()
    try:
        info = mod.validate_all()
    except mod.VersionError as exc:
        print(f"PRODUCT_VERSION_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1
    print("PRODUCT_VERSION_VALIDATION: PASS")
    print(f"authority={info['authority']}")
    print(f"release={info['release']}")
    print(f"scheme={info['scheme']}")
    print(f"tag={info['tag']}")
    print(f"commit={info['commit']}")
    print(f"mirrors={len(info['mirrors'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
