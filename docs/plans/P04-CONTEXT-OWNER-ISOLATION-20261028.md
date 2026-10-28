# P04 — Local user identity, collaborator isolation and agent-context binding

**Date:** 2026-10-28. **Repo:** EscapeHatch. **Parent:** issue #69. **Scope:** user data ownership and pre-generation context provenance; never store any developer's private career content in tracked source.

## Operator outcome

A released EscapeHatch agent must load the *currently bound user's* local profile or display a recovery state. It must never quietly populate that person's writing or job applications with the product developer's profile, another collaborator's profile, public fixtures, or stale agent chat memory. Development identity and applicant identity are separate principals. Being a repository contributor grants zero permission to read another person's career workspace.

### Existing floor and immediate risk

- Managed Windows lifecycle stores `workspace.v1.json` under the OS user's local app-data folder, with an explicit `ESCAPEHATCH_DATA_HOME` escape hatch; it is not an account-bound tenant store.
- React cockpit mirrors profile, assist profile, answers, applications and source bindings into same-origin browser storage. Bootstrap merges copies and protects explicit conflicts, but prior to the bounded guard it could combine an unidentifiable browser application queue with a saved applicant profile.
- `mergeSyncPayload` in `assist-contract.ts` can mix answers and résumé-derived details from separate imports. The source payload has no immutable profile owner ID.
- Source artifacts and derivative language prompts already have authority rules. They do not yet establish a signed-in user, selected local workspace and agent-model context owner as the same principal.
- Synthetic test mode and standalone mode have separate startup behavior. Passing unit/browser CI or reading the correct Windows path does not prove real customer session isolation.

### Immediate non-destructive fix in this draft PR

`context-owner-boundary.ts` provides a **legacy compatibility guard**. It rejects conflicting emails and complete names, checks profile against assist contact, and blocks merging personal data without comparable owner evidence. Startup keeps both copies for review. Imported assist-sync actions can refuse a merge/replace with an explanatory message. The test fixture uses only synthetic people. User edits to a name or email can now require an explicit recovery choice; it is not automatically presumed a different person or silently merged.

**Proof ceiling:** this guard is conflict detection, *not authentication*: two people may share names/emails, while one person may change them. It does not create or verify a tenant ID, protect a logged-in multi-user service, or attest that a model loaded the correct profile. It is a safe migration precursor, not a multi-tenant security certification.

## Required identity model (next contract)

Use an opaque, locally generated stable `workspaceOwnerId` (random 128+ bit), independent of name/email; additionally bind `installationId`, `workspaceId` and an explicit `principalRole: applicant | contributor | developer` for audit. A person's role is never a permission to access other workspaces. Explicit app instance and user scope are required even when multiple developers share a checkout or the same browser origin.

```text
installation selection -> workspace registry (local/private)
  -> explicit owner / workspace binding
  -> versioned source ledger -> reviewed career state
  -> per-turn agent context envelope -> candidate document
  -> review, provenance receipt and owned artifact writeback
```

Every agent invocation receives a structured `ContextEnvelope`:
`{ownerId,workspaceId,sourceRevisions,profileRevision,voiceProfileRevision,opportunityId,agentRole,contextHash,readinessState}`.
Only scoped private source pointers travel with the request. The runtime recomputes `ownerId`, confirms source artifact ownership and freshness, then hydrates facts. The model cannot pick an owner by guessing a name, following a pasted instruction, using its prior conversation, or reading developer fixtures. No raw owner name/email is a tenant key.

Invariants:
1. `ownerId(workspace) = ownerId(profile) = ownerId(answers) = ownerId(voice) = ownerId(source)` before any cross-record retrieval or generation.
2. Unknown/mismatched ownership means `OWNER_REVIEW_REQUIRED` and **no retrieval, generation, autofill, or derived write**.
3. Last active workspace must be explicitly selected on shared devices. No "developer profile" or sample identity fallback when the owner's data cannot be read.
4. Switching workspace invalidates cached retrieval/context embeddings, chat tool cache, draft and browser overlays; pending agent writes carry a revision and fail closed if the selection changed mid-run.
5. Sharing/collaboration is **artifact-scoped authorization** (minimum necessary, explicit grant, expiry/revoke, provenance and readback), never merging another collaborator's whole career profile or conversation memory.
6. The developer's generic language engine, prompt templates and tests may ship as application code; personal details and private voice examples never ship as defaults, sample payloads or public build assets.
7. Bounded stable root paths and local OS file permissions are necessary but insufficient if shared-host auth, service endpoints or browser sessions can cross owners. Server-side authorization must guard every read/write.
8. Privacy of the AI provider: owner-approved selected text only; disclose model/provider and retention options; prevent tenant-crossing retrieval. P04 does not invent implicit hosted identity.

## Versioned legacy migration: never hijack existing data

V1 personal files remain intact. Detect missing owner binding as `UNBOUND_LEGACY`. When one pre-existing populated local workspace is selected, ask the human to confirm that this is their workspace, then create a private immutable owner binding transactionally with backup and readback. Never infer ownership from the repository author, a remembered agent conversation, the current operating system username, or sample strings. Imported data with absent or conflicting IDs enters read-only staging, not the active user state. A user can export, revoke collaborator grants, switch between their own workspaces, and separately erase private data with explicit consent. Keep the public schema migration and private local records distinct.

## P04 launch order, ownership and proof

| Lane | Host; provider | Owned change | Hard proof gate |
| --- | --- | --- | --- |
| S0: Floor and risk reduction | CURRENT_CHAT_RUNTIME + GitHub provider | this isolated guard, tests and research record | exact-head CI, readback; not real runtime |
| S1: Owner-binding schema + migration | LOCAL_AGENT_RUNTIME + private local file system | extend existing `workspace-bootstrap`/`workspace-file` in a separate branch; no competing store | legacy import/backup/readback and identity switch; no personal fixture in Git |
| S2: Agent context gateway | LOCAL_AGENT_RUNTIME + existing agent harness | owner-scoped hydration and immutable `ContextEnvelope`, scoped AI calls | two-user, same-device, two-developer, stale-revision and mid-turn switch denial |
| S3: Integration at source and voice | LOCAL_AGENT_RUNTIME + owner-approved providers | enforce envelope at tracker/resume/answers/source-binding/generator/assist retrieval | zero cross-owner reads or generated assertions |
| S4: UI identity readiness | LOCAL_AGENT_RUNTIME | visible `Current workspace`, `Verified context`, change/recover actions, pending context warning | keyboard and mobile readback, no sample fallback |
| S5: Independent adversarial certification | CI_OR_REMOTE_RUNNER for synthetic; OPERATOR_OR_PHYSICAL_RUNTIME for installed host | fixture matrix, installed runtime and OS isolation receipts | explicit deny cases; no claim from synthetic-only green |

S1 and the pure S2 schema work can be investigated in parallel, with **one writer per separate branch**; S3/S4 wait for their shared owner binding. S5 follows a converged candidate. No CI runner has permission to inspect real applicant assets. Provider access and host placement remain separate: GitHub connector is not a local desktop file system, and ChatGPT's connected account is not the installed application's credential.

### Test matrix to require

- Two developers, separate clones but same machine; no profile/credential inheritance.
- Two applicants, separate OS accounts; no profile/answers/voice confusion.
- Two applicants in one browser/browser profile; explicit workspace switch, old caches invalidated.
- Blank local workspace alongside populated browser storage; no automatic wrong-owner adoption.
- Incoming assist export with same first name but no immutable ID; `REVIEW_REQUIRED`.
- Conflicting owner ID despite matching email, and matching ID despite owner-corrected email; ID dominates.
- Revoked collaborator grant and stale in-flight write; denies without destroying source.
- Offline restore, duplicate source, unreadable V1, legacy migration, crashes and reboots.
- Synthetic build launched in real-workflow context; never presents synthetic profile as applicant.
- Post-migration letter/resume generated with facts from another owner; hard failure on read and output.

**Next executable gate:** on the installed checkout, run existing `test:bootstrap`, `test:unit`, `typecheck`, and application parent/scene validators on the guard branch; then begin S1 with an additive versioned owner binding in a *new* branch after reviewing current private workspace backup. Do not merge a tenant-ownership claim on the basis of the preliminary guard.
