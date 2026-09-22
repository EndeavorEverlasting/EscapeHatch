# Local task-plan mirror

`docs/plans/` is a generated, searchable snapshot of the Replit project task
board. The board is the source of truth. Do not hand-edit files in
`docs/plans/`; a later sync replaces generated task documents and the index
from the next export.

## Sync the mirror

Obtain a JSON task export from the project task board, then run:

```sh
pnpm sync-plans -- --input path/to/task-export.json
```

The command also accepts standard input:

```sh
cat path/to/task-export.json | pnpm sync-plans -- --input -
```

The default output directory is `docs/plans`. A different directory can be
used for a review or test run:

```sh
pnpm sync-plans -- --input path/to/task-export.json --output tmp/plans
```

To review the changes without modifying the output directory, add `--preview`:

```sh
pnpm sync-plans -- --input path/to/task-export.json --preview
```

Preview mode validates and renders the export exactly like a real sync, then
reports each added, updated, removed, and unchanged file. It does not create
the output directory or write, update, or delete any files. `--dry-run` is
accepted as an alias for `--preview`.

The input is a JSON object with a `tasks` array. Each task requires a numeric
`taskRef` (for example `"#42"`), a non-empty `title`, a supported board
`state`, and an ISO-8601 `updatedAt` timestamp. `description`, `dependsOn`,
`followUpCategory`, `createdAt`, `proposedFromRef`, and `artifactKinds` are
optional. Dependency and source references are kept exactly as supplied.

Supported states and their index labels are:

| Board state                                                  | Local status |
| ------------------------------------------------------------ | ------------ |
| `PROPOSED`                                                   | Drafts       |
| `PENDING`, `IN_PROGRESS`, `MAIN_PENDING`, `MAIN_IN_PROGRESS` | Active       |
| `IMPLEMENTED`, `MAIN_IMPLEMENTED`                            | Ready        |
| `MERGING`, `QUEUED`                                          | Merging      |
| `MERGED`                                                     | Merged       |
| `CANCELLED`                                                  | Archived     |

The sync validates the entire export before writing. It updates changed
documents, creates new task files, removes only older files carrying the
generator marker, and preserves unrelated files. Re-running with identical
input is a no-op. Invalid JSON or incomplete tasks exits with an actionable
error and leaves the existing mirror untouched.

The generated index is `docs/plans/index.md`. Task filenames use only the
numeric task reference, for example `task-042.md`, so a title edit updates the
existing document instead of changing its task-reference URL. On the next
sync, older generated files using the former title-slug naming scheme are
removed; the sync does not create redirect files, and unrelated Markdown files
are preserved. Generated files include frontmatter with stable board metadata
and retain the complete plan description when one is supplied.
