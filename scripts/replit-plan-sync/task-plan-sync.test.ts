import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GENERATED_MARKER,
  renderIndex,
  previewPlans,
  slugifyTaskTitle,
  statusLabel,
  syncPlans,
  syncPlansFromJson,
  taskFilename,
  validateTaskExport,
  type TaskExportItem,
} from "./task-plan-sync.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "task-plan-sync-"));
  directories.push(directory);
  return directory;
}

function task(overrides: Partial<TaskExportItem> = {}): TaskExportItem {
  return {
    taskRef: "#2",
    title: "Make profile changes safe to recover from",
    state: "MERGED",
    updatedAt: "2026-09-20T12:00:00.000Z",
    dependsOn: [],
    artifactKinds: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    // Temporary directories are intentionally left for the OS cleanup; the
    // test output never writes into the repository.
    void directory;
  }
});

describe("task plan status and filenames", () => {
  it("maps every supported board state to a human-readable status", () => {
    assert.equal(statusLabel("PROPOSED"), "Drafts");
    assert.equal(statusLabel("PENDING"), "Active");
    assert.equal(statusLabel("IN_PROGRESS"), "Active");
    assert.equal(statusLabel("MAIN_PENDING"), "Active");
    assert.equal(statusLabel("MAIN_IN_PROGRESS"), "Active");
    assert.equal(statusLabel("IMPLEMENTED"), "Ready");
    assert.equal(statusLabel("MAIN_IMPLEMENTED"), "Ready");
    assert.equal(statusLabel("MERGING"), "Merging");
    assert.equal(statusLabel("QUEUED"), "Merging");
    assert.equal(statusLabel("MERGED"), "Merged");
    assert.equal(statusLabel("CANCELLED"), "Archived");
  });

  it("creates safe, deterministic slugs and filenames", () => {
    assert.equal(
      slugifyTaskTitle("Résumé: Keep / Work & Data"),
      "resume-keep-work-data",
    );
    const item = task({
      taskRef: "#7",
      title: 'A title with "quotes" and a / slash',
    });
    assert.equal(taskFilename(item), "task-007.md");
    assert.equal(taskFilename(item), taskFilename({ ...item }));
  });
});

describe("task plan rendering and validation", () => {
  it("escapes frontmatter values while preserving the complete plan body", () => {
    const directory = temporaryDirectory();
    const item = task({
      taskRef: "#1",
      title: 'Review "quoted" | plan',
      state: "PROPOSED",
      followUpCategory: "test_gaps",
      dependsOn: ["#3"],
      description: '# Review "quoted" | plan\n\nKeep the `full` description.',
    });
    syncPlans([item], directory);
    const content = readFileSync(join(directory, taskFilename(item)), "utf8");
    assert.ok(content.startsWith("---\n"));
    assert.match(content, /title: "Review \\"quoted\\" \\| plan"/);
    assert.match(content, /dependsOn: \["#3"\]/);
    assert.match(content, /Keep the `full` description\./);
  });

  it("rejects malformed and incomplete exports before any mirror write", () => {
    const directory = temporaryDirectory();
    const valid = JSON.stringify({ tasks: [task()] });
    syncPlansFromJson(valid, directory);
    const before = readdirSync(directory)
      .sort()
      .map((name) => [name, readFileSync(join(directory, name), "utf8")]);

    assert.throws(
      () =>
        syncPlansFromJson(
          JSON.stringify({
            tasks: [{ taskRef: "#3", title: "Missing state" }],
          }),
          directory,
        ),
      /state must be a non-empty string/,
    );
    assert.throws(
      () => syncPlansFromJson("{not json", directory),
      /not valid JSON/,
    );

    const after = readdirSync(directory)
      .sort()
      .map((name) => [name, readFileSync(join(directory, name), "utf8")]);
    assert.deepEqual(after, before);
  });

  it("normalizes and sorts valid exports by numeric task reference", () => {
    const exportData = validateTaskExport({
      tasks: [
        {
          taskRef: "#12",
          title: "Twelve",
          state: "MERGED",
          updatedAt: "2026-09-20T00:00:00Z",
        },
        {
          taskRef: "#2",
          title: "Two",
          state: "PROPOSED",
          updatedAt: "2026-09-19T00:00:00Z",
        },
      ],
    });
    assert.deepEqual(
      exportData.tasks.map((item) => item.taskRef),
      ["#2", "#12"],
    );
    assert.deepEqual(exportData.tasks[0].dependsOn, []);
  });
});

describe("task plan reconciliation", () => {
  it("previews additions, updates, removals, and unchanged files without writing", () => {
    const directory = temporaryDirectory();
    const initial = [
      task({ taskRef: "#1", title: "Existing task", state: "PROPOSED" }),
      task({ taskRef: "#2", title: "Removed task", state: "MERGED" }),
      task({ taskRef: "#4", title: "Unchanged task", state: "MERGED" }),
    ];
    syncPlans(initial, directory);
    writeFileSync(join(directory, "notes.md"), "Keep me");
    const before = readdirSync(directory)
      .sort()
      .map((name) => [name, readFileSync(join(directory, name))]);

    const result = previewPlans(
      [
        task({ taskRef: "#1", title: "Updated task", state: "IN_PROGRESS" }),
        task({ taskRef: "#3", title: "New task" }),
        task({ taskRef: "#4", title: "Unchanged task", state: "MERGED" }),
      ],
      directory,
    );

    assert.deepEqual(result.added, ["task-003.md"]);
    assert.deepEqual(result.updated, ["index.md", "task-001.md"]);
    assert.deepEqual(result.removed, ["task-002.md"]);
    assert.deepEqual(result.unchanged, ["task-004.md"]);
    assert.deepEqual(result.written, ["index.md", "task-001.md", "task-003.md"]);
    const after = readdirSync(directory)
      .sort()
      .map((name) => [name, readFileSync(join(directory, name))]);
    assert.deepEqual(after, before);
  });

  it("uses the same rendered output for preview and the following sync", () => {
    const directory = temporaryDirectory();
    syncPlans([task({ taskRef: "#1", title: "Before" })], directory);
    const next = [
      task({ taskRef: "#1", title: "After", state: "IMPLEMENTED" }),
      task({ taskRef: "#4", title: "New plan", state: "PROPOSED" }),
    ];

    const preview = previewPlans(next, directory);
    const synced = syncPlans(next, directory);

    assert.deepEqual(
      {
        added: preview.added,
        updated: preview.updated,
        removed: preview.removed,
        unchanged: preview.unchanged,
      },
      {
        added: synced.added,
        updated: synced.updated,
        removed: synced.removed,
        unchanged: synced.unchanged,
      },
    );
    assert.deepEqual(synced.removed, []);
  });

  it("updates a title in place without changing the task-reference path", () => {
    const directory = temporaryDirectory();
    const first = [
      task({ taskRef: "#1", title: "First task", state: "PROPOSED" }),
      task({ taskRef: "#2", title: "Second task", state: "MERGED" }),
    ];
    const initial = syncPlans(first, directory);
    assert.equal(initial.written.length, 3);
    writeFileSync(join(directory, "notes.md"), "Keep me");

    const next = syncPlans(
      [
        task({
          taskRef: "#1",
          title: "Updated first task",
          state: "IN_PROGRESS",
        }),
        task({ taskRef: "#3", title: "New task" }),
      ],
      directory,
    );
    assert.deepEqual(next.removed, ["task-002.md"]);
    assert.ok(next.written.includes("task-001.md"));
    assert.ok(next.written.includes("task-003.md"));
    assert.match(
      readFileSync(join(directory, "task-001.md"), "utf8"),
      /title: "Updated first task"/,
    );
    assert.equal(
      readdirSync(directory).some((name) => name.includes("updated-first")),
      false,
    );
    assert.equal(readFileSync(join(directory, "notes.md"), "utf8"), "Keep me");
    const stable = syncPlans(
      [
        task({
          taskRef: "#1",
          title: "Updated first task",
          state: "IN_PROGRESS",
        }),
        task({ taskRef: "#3", title: "New task" }),
      ],
      directory,
    );
    assert.equal(stable.written.length, 0);
    assert.equal(stable.removed.length, 0);
    assert.equal(stable.unchanged.length, 3);
  });

  it("removes stale legacy slugged files while preserving unrelated markdown", () => {
    const directory = temporaryDirectory();
    writeFileSync(
      join(directory, "task-001-original-title.md"),
      `${GENERATED_MARKER}\n\n# Original title\n`,
    );
    writeFileSync(join(directory, "notes.md"), "Keep me");

    const result = syncPlans(
      [task({ taskRef: "#1", title: "Current title" })],
      directory,
    );

    assert.deepEqual(result.removed, ["task-001-original-title.md"]);
    assert.equal(readdirSync(directory).includes("task-001.md"), true);
    assert.equal(
      readdirSync(directory).includes("task-001-original-title.md"),
      false,
    );
    assert.equal(readFileSync(join(directory, "notes.md"), "utf8"), "Keep me");
  });

  it("orders the generated index by status and then task reference", () => {
    const index = renderIndex([
      task({ taskRef: "#8", title: "Merged", state: "MERGED" }),
      task({ taskRef: "#2", title: "Draft", state: "PROPOSED" }),
      task({ taskRef: "#1", title: "Active", state: "IN_PROGRESS" }),
    ]);
    assert.ok(index.indexOf("## Drafts (1)") < index.indexOf("## Active (1)"));
    assert.ok(index.indexOf("## Active (1)") < index.indexOf("## Merged (1)"));
    assert.ok(
      index.indexOf("[#1]") < index.indexOf("[#2]") ||
        index.indexOf("## Drafts") < index.indexOf("## Active"),
    );
    assert.match(
      index,
      /\| Ref \| Title \| Follow-up \| Dependencies \| Last updated \|/,
    );
  });
});
