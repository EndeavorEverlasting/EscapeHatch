"use strict";
/**
 * Resolve Automation PR #40 node silent_background adapter at the pinned SHA.
 * Falls back to null when AUTOMATION_ROOT / sibling checkout is missing or unpinned.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const CONTRACT_REL = path.join("contracts", "automation-silent-background-consumer.v1.json");
const ADAPTER_REL = path.join(
  "capabilities",
  "windows-silent-scheduled-task",
  "adapters",
  "node",
  "silent_background.cjs"
);

function readPinnedSha(repoRoot) {
  const contractPath = path.join(repoRoot, CONTRACT_REL);
  if (!fs.existsSync(contractPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const sha = data && data.upstream && data.upstream.commit_sha;
    return typeof sha === "string" && sha.trim() ? sha.trim() : null;
  } catch {
    return null;
  }
}

function gitHead(repo) {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

function candidates(repoRoot) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const resolved = path.resolve(value);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
  };
  const env = (process.env.AUTOMATION_ROOT || "").trim();
  if (env) push(env);
  // Walk parents so nested worktrees still find sibling ../Automation.
  let cursor = path.resolve(repoRoot);
  for (let i = 0; i < 6; i += 1) {
    push(path.join(cursor, "..", "Automation"));
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return out;
}

function resolveAutomationSilentBackground(repoRoot) {
  const pin = readPinnedSha(repoRoot);
  for (const root of candidates(repoRoot)) {
    const adapter = path.join(root, ADAPTER_REL);
    if (!fs.existsSync(adapter)) continue;
    if (pin) {
      const head = gitHead(root);
      if (!head || head !== pin) continue;
    }
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const mod = require(adapter);
    return {
      backend: "automation",
      automationRoot: root,
      pinnedSha: pin,
      observedSha: gitHead(root),
      adapterPath: adapter,
      module: mod,
    };
  }
  return {
    backend: "local_fallback",
    automationRoot: null,
    pinnedSha: pin,
    observedSha: null,
    adapterPath: null,
    module: null,
  };
}

module.exports = {
  CONTRACT_REL,
  ADAPTER_REL,
  readPinnedSha,
  resolveAutomationSilentBackground,
};
