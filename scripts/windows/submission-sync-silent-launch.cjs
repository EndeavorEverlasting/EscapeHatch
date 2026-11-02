"use strict";
/**
 * EscapeHatch SubmissionSync child launch under Automation SILENT_BACKGROUND
 * when the pinned adapter is available. Task Scheduler remains the clock;
 * this bridge only owns no-console child policy + private Automation receipts.
 *
 * Usage:
 *   node submission-sync-silent-launch.cjs --root <repoRoot> --node <nodeExe> --worker <worker.ts>
 */
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  resolveAutomationSilentBackground,
} = require("./lib/resolve-automation-silent-background.cjs");

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function main() {
  const root = path.resolve(argValue("--root") || process.cwd());
  const nodeExe = argValue("--node");
  const worker = argValue("--worker");
  if (!nodeExe || !worker) {
    process.stderr.write("SUBMISSION_SYNC_SILENT_LAUNCH_ARGS_MISSING\n");
    process.exit(2);
  }
  const resolved = resolveAutomationSilentBackground(root);
  const argv = ["--experimental-strip-types", worker];
  if (resolved.module && typeof resolved.module.spawnBackground === "function") {
    const result = resolved.module.spawnBackground(nodeExe, argv, {
      jobId: "escapehatch-submission-sync",
      cwd: root,
      executionClass: "SILENT_BACKGROUND",
    });
    if (result.status === "DEFERRED_INTERACTION") {
      process.stderr.write(
        "SUBMISSION_SYNC_DEFERRED:" + (result.receiptPath || "") + "\n"
      );
      process.exit(3);
    }
    const child = result.child;
    if (!child) {
      process.stderr.write("SUBMISSION_SYNC_SILENT_SPAWN_FAILED\n");
      process.exit(4);
    }
    child.on("exit", (code, signal) => {
      if (signal) process.exit(1);
      process.exit(code == null ? 1 : code);
    });
    return;
  }
  // Local fallback: same CreateNoWindow semantics via windowsHide.
  const proc = spawnSync(nodeExe, argv, {
    cwd: root,
    windowsHide: true,
    shell: false,
    stdio: "inherit",
  });
  if (proc.error) {
    process.stderr.write(String(proc.error) + "\n");
    process.exit(4);
  }
  process.exit(proc.status == null ? 1 : proc.status);
}

main();
