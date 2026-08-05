# Evolution Model Lab implementation plan

## Repository

- Resolved repository root: `C:\Users\krist\Desktop\coding\EvolutionModelLab`
- Verified on: 2026-08-05
- The repository is initialized directly at the workspace root.
- No nested `EvolutionModelLab` directory is used.
- Runtime data remains under `data/`, `workspace/`, and `exports/` in this repository.

## Product boundary

Evolution Model Lab is a local-first creature design workspace. ChatGPT supplies images through ordinary conversations; this application persists project state, builds prompts, imports and validates user-provided images, and maintains recoverable history. It does not call paid image-generation APIs and never pretends to generate images.

This pass implements **Milestone 3 only**, building on the completed Milestone 2 refinement workflow. Later workflow surfaces may remain visible as clearly disabled navigation, but their actions are not represented as working.

## Module boundaries

- `apps/web`: React/Vite interface, routing, uploads, numbered gallery, feedback/manifest editors, comparison workspace, lock/unlock confirmations, lock/history presentation, prompt history, and contact-sheet preview/confirmation.
- `apps/server`: localhost Express transport, request parsing, error mapping, and exact guarded media responses.
- `apps/mcp-server`: reserved application boundary for the later Streamable HTTP MCP server; no MCP SDK is installed through Milestone 2.
- `packages/core`: reusable workflow/application services, including manifest versioning and design-lock rules, used by future REST and MCP adapters.
- `packages/database`: SQLite connection, Drizzle schema, migrations, and database lifecycle.
- `packages/shared`: Zod request/response contracts and shared domain constants.
- `packages/image-processing`: PNG inspection, SHA-256 hashing, deterministic grid geometry, derived crop creation, and thumbnails.
- `packages/prompt-builder`: deterministic concept and refinement prompt construction.
- `packages/sprite-exporter`: reserved for later game-ready exports.
- `packages/test-fixtures`: deterministic PNG fixture generation for tests.

Transport handlers must not reimplement workflow rules. REST handlers call `packages/core`; the future MCP handlers will call the same services.

## Milestone 1 database schema

The first migration defines:

- `creature_projects`: identity, brief, workflow status, current round and selected/locked relationships, timestamps, soft deletion.
- `generation_rounds`: immutable concept/refinement lineage, deterministic prompt, feedback fields, timestamps, soft deletion.
- `candidates`: numbered original/thumbnail paths, verified PNG metadata, exact file hash, source, selection/rejection state, timestamps, soft deletion.
- `candidate_feedback`: structured ordered JSON arrays for future refinement work.
- `history_events`: append-only records for important successful actions.
- `project_settings`: repository-local storage and upload limits.

The schema includes a partial unique index enforcing one active selected candidate per round, uniqueness for active candidate numbers, and an exact-hash uniqueness rule within a round. Additional domain tables will be added in the milestone that first uses them.

## Milestone 2 additive schema

`0001_milestone_two.sql` preserves Milestone 1 rows while adding:

- a complete `feedback_snapshot` on refinement rounds so later feedback edits cannot alter prompt history;
- `contact_sheet_imports` with immutable source paths/hashes, explicit layout geometry, all calculated rectangles, and preview/confirmed status;
- contact-sheet/crop provenance columns on derived candidates.

An upgrade regression test constructs a database from the committed Milestone 1 migration, inserts a selected project, applies Milestone 2 on reopen, and then saves feedback and creates a refinement round without data loss.

## Milestone 3 additive schema

`0002_milestone_three.sql` preserves earlier rows while adding:

- `design_manifests`, which stores the current editable draft, ordered constraint lists, approved notes, production frame, and the set of fields explicitly approved by the project owner;
- `design_manifest_versions`, which records immutable version data and guarded snapshot paths;
- `design_locks`, which records candidate/round/manifest ownership, active or superseded state, reference/archive paths, hashes, and timestamps;
- candidate, round, manifest-version, and actor fields on append-only history events.

Existing projects receive a version-zero draft derived from their project settings. Those inherited values remain marked as project defaults until explicitly edited. The first successful lock freezes version 1; later confirmed edits and relocks advance monotonically and never overwrite a frozen row or numbered file.

## Filesystem ownership and safety

- Original uploads are written once under `workspace/creatures/<slug>/rounds/<round>/candidates/` with generated UUID filenames.
- Thumbnails are separately generated under the round's `thumbnails/` directory.
- Browser filenames are metadata only and never become destination paths.
- Every application path is resolved and checked against an allowed root before access.
- SHA-256 is calculated from the original bytes before persistence.
- A failed import removes only files staged by that failed operation; existing originals are never overwritten.
- SQLite is authoritative for application state; creature `manifest.json`, immutable numbered manifest snapshots, locked-reference copies/archives, `prompt.txt`, and `generation-context.json` are durable filesystem artifacts.
- Design locking rereads and decodes the guarded source PNG, compares its exact SHA-256 with the persisted hash, and copies bytes without modifying the original.
- Lock destinations use exclusive creation. A failed filesystem/database operation cleans up only files staged by that attempt and never overwrites an existing reference, archive, history snapshot, or candidate original.

## Technical risks

1. **Filesystem/database atomicity:** SQLite cannot atomically commit filesystem writes. Milestone 1 validates in memory, writes generated filenames exclusively, performs the database transaction, and cleans up only newly written files if the transaction fails. Recovery events will be expanded later.
2. **Native SQLite dependency on Windows:** `better-sqlite3` requires a compatible prebuild or compiler. Installation and a real database smoke test are acceptance checks.
3. **Untrusted image input:** MIME declarations and filenames are ignored for trust decisions. Sharp must decode the bytes as PNG, image dimensions and size are limited, and unsupported/corrupt files return structured errors.
4. **Concurrent candidate imports:** candidate numbering and count checks happen inside a database transaction. SQLite write serialization plus unique indexes protects the invariant.
5. **Development process coordination:** Vite and Express run together through one root command; ports and data roots are configurable without changing repository paths.
6. **MCP file transfer:** direct ChatGPT-generated image handoff is intentionally unclaimed and deferred until it is tested against current official SDK/client support.

## Milestone 1 acceptance criteria

- [x] One documented command starts the local web and REST services.
- [x] A creature named Dunkleosteus can be created.
- [x] Concept Round 1 can be created with a saved deterministic prompt and context.
- [x] Between one and ten valid PNGs can be imported by picker, drag/drop, or clipboard.
- [x] Imported originals remain byte-identical and thumbnails are separate files.
- [x] Candidates display in a clearly numbered responsive gallery.
- [x] Exactly one candidate can be selected and remains selected across restart.
- [x] Duplicate SHA-256 imports are rejected with a useful error.
- [x] Invalid, oversized, or dimensionally excessive inputs return useful errors.
- [x] Formatting, lint, typecheck, unit/integration tests, and build pass.
- [x] One Playwright concept vertical-slice test passes.
- [x] Windows setup and commands are documented in `README.md`.

## Milestones

| Milestone | Scope                                                | Status    |
| --------- | ---------------------------------------------------- | --------- |
| 1         | Repository and persisted concept vertical slice      | Completed |
| 2         | Feedback, refinement, prompt history, contact sheets | Completed |
| 3         | Design lock, manifest, history expansion             | Completed |
| 4         | Evolution lineage and mutations                      | Pending   |
| 5         | Canonical references and approval gates              | Pending   |
| 6         | Animation Lab and repair workflow                    | Pending   |
| 7         | Validation and game-ready export                     | Pending   |
| 8         | Streamable HTTP MCP server and tools                 | Pending   |
| 9         | ChatGPT Developer Mode integration and handoff spike | Pending   |
| 10        | Skills, evaluations, and optional ChatGPT UI         | Pending   |

## Milestone 1 test status

Final verification on 2026-08-02:

| Command                   | Result                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| `corepack pnpm format`    | Passed; final source formatted                                      |
| `corepack pnpm lint`      | Passed; 0 ESLint errors                                             |
| `corepack pnpm typecheck` | Passed; shared packages, server, and web compile in strict mode     |
| `corepack pnpm test`      | Passed; 4 files and 10 Vitest tests                                 |
| `corepack pnpm test:e2e`  | Passed; 1 Playwright browser test                                   |
| `corepack pnpm build`     | Passed; server/packages compiled and Vite transformed 1,674 modules |

The Playwright test created Dunkleosteus, created Concept Round 1, imported two programmatically generated PNG fixtures, displayed Candidates 1 and 2, selected Candidate 2, reloaded the page, and verified that exactly Candidate 2 remained selected.

The integration suite additionally closes and reopens SQLite to verify restart persistence, compares stored original bytes, verifies separate thumbnail output, rejects an exact SHA-256 duplicate, rejects invalid bytes, and exercises path guards.

## Milestone 2 acceptance criteria

- [x] All seven ordered structured-feedback categories and general notes persist for the correct selected candidate across reopen.
- [x] Refinement creation rejects a missing parent, references exactly one selected parent, increments the round, transitions to `REFINING`, and preserves previous rows/artifacts.
- [x] The deterministic refinement prompt includes identity, scientific name, round, parent, every feedback category, camera/facing/canvas/transparency/lighting/style constraints, ten outputs, and explicit no-animation/no-unrelated-anatomy instructions.
- [x] Every round prompt and refinement feedback snapshot is available in prompt history and can be copied.
- [x] Two candidates can be chosen independently of parent selection for checkerboard comparison with synchronized/independent zoom and pan plus optional overlay.
- [x] Contact-sheet import supports 2×5, 5×2, 3×3, 4×3, and custom layouts with four margins and horizontal/vertical gaps.
- [x] Contact-sheet originals are preserved before confirmation; calculated crops are visibly previewed and only explicit selected cells create candidates.
- [x] Derived crop files retain source rectangle metadata and deterministic row-major numbering without exceeding ten candidates.
- [x] Existing Milestone 1 SQLite data migrates additively and remains usable.
- [x] The Playwright vertical slice covers feedback, refinement prompt content, refinement imports, comparison, contact-sheet preview/confirmation, and reload persistence.

## Milestone 2 test status

Final verification on 2026-08-03:

| Command                          | Result                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `corepack pnpm format:check`     | Passed; every matched file uses Prettier style                                                |
| `corepack pnpm lint`             | Passed; 0 ESLint errors                                                                       |
| `corepack pnpm typecheck`        | Passed; packages, server, and web compile in strict mode                                      |
| `corepack pnpm test`             | Passed; 4 files and 17 Vitest unit/integration tests                                          |
| `corepack pnpm test:e2e`         | Passed; 1 complete Playwright concept/refinement workflow test                                |
| `corepack pnpm build`            | Passed; packages/server compiled and Vite transformed 1,675 modules                           |
| Manual primary workflow exercise | Passed; isolated prompt/refinement/comparison/contact-crop/history workflow, 0 console errors |

The manual workflow created a fresh creature in `.tmp/manual`, saved ordered feedback for Candidate 2, created Refinement Round 2, verified the frozen prompt, inspected side-by-side comparison, previewed and confirmed two explicit contact-sheet rectangles, verified crop provenance/candidate numbering, opened both prompt-history entries, and found no browser console warnings or errors. The isolated manual development server was stopped afterward.

## Milestone 3 acceptance criteria

- [x] Every creature has a persisted editable Design Manifest with ordered immutable, preferred, and forbidden lists; approved note fields; canvas dimensions; facing; anchors; and transparency.
- [x] The editor distinguishes project defaults from explicit owner-approved fields and does not invent anatomy or biology.
- [x] Meaningful post-lock edits require confirmation and create a new immutable version while preserving every previous row and `history/manifests/manifest-vNNN.json` snapshot.
- [x] Locking requires explicit consequence acknowledgement and exactly one valid, selected candidate in the current round belonging to the same creature.
- [x] Locking revalidates the guarded source path, PNG content, and SHA-256; copies the original unchanged; freezes the manifest; sets `DESIGN_LOCKED`; and records complete ownership/history.
- [x] The active locked candidate cannot be rejected or deleted, its source round cannot be deleted, and later imports cannot silently replace it.
- [x] Unlocking requires explicit acknowledgement, preserves all lock assets/history, clears the active locked candidate, and returns the creature to `REFINING`.
- [x] Relocking archives the former active copy to the next exclusive `history/locked-designs/locked-design-vNNN.png` path before activating the new selected candidate.
- [x] The creature page, manifest route, custom lock/unlock confirmations, prominent lock marker/reference, and creature-specific immutable history are implemented without enabling Milestone 4 or later actions.
- [x] Unit/integration and Playwright tests cover success, invalid ownership/state, protected dependencies, restart persistence, unchanged bytes, immutable versions, unlock/relock, archive creation, and filesystem collision rollback.

## Milestone 3 test status

Final verification on 2026-08-05:

| Command                          | Result                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `corepack pnpm format`           | Passed; final source and documentation formatted                                                                   |
| `corepack pnpm format:check`     | Passed; every matched file uses Prettier style                                                                     |
| `corepack pnpm lint`             | Passed; 0 ESLint errors                                                                                            |
| `corepack pnpm typecheck`        | Passed; packages, server, and web compile in strict mode                                                           |
| `corepack pnpm test`             | Passed; 5 files and 22 Vitest unit/integration tests                                                               |
| `corepack pnpm test:e2e`         | Passed; 2 Playwright workflows in 8.2 seconds                                                                      |
| `corepack pnpm build`            | Passed; packages/server compiled and Vite transformed 1,676 modules                                                |
| Manual primary workflow exercise | Passed; locked preview, manifest, confirmation, unlock/relock history, persistence, and 0 browser console warnings |

The design integration suite verifies draft persistence across service restart, ordered constraints and explicit/default provenance, invalid manifests, missing/current/cross-creature/rejected/deleted candidate gates, byte-identical active copies, immutable frozen snapshots, protected reject/delete/round operations, stable locks across imports, confirmed post-lock edits, unlock/relock/archive history, destination collisions, rollback cleanup, and non-overwrite behavior.

The Milestone 3 Playwright workflow creates concept and refinement rounds, edits and reorders manifest constraints, saves production fields, reviews the lock summary, confirms the first lock, reads the locked PNG endpoint and compares exact fixture bytes, verifies restart persistence and the locked marker, exercises protected REST operations, confirms unlock, selects a replacement, relocks, and verifies the archived first reference. The E2E services run as a Playwright worker fixture so Express and Vite are closed through direct handles on Windows.

Manual in-app browser QA reviewed the resulting `DESIGN_LOCKED` creature, opened and cancelled the explicit unlock confirmation, verified persisted manifest order/provenance/production values, reviewed active and superseded lock history plus manifest freeze/archive events, and confirmed the locked preview decoded at its real 80×52 dimensions with no console warnings or errors. This pass exposed Express's default refusal to serve test media beneath a dot-prefixed directory; exact paths already guarded by core are now sent with `dotfiles: "allow"`, and the automated byte assertion covers the regression. The isolated manual-QA services were stopped afterward.

## Known limitations

- Evolution, canonical references, animation, export, MCP, and plugin skills remain deferred to their planned milestones. The Milestone 3 locked PNG is an authoritative design copy, not a Milestone 5 canonical reference set.
- Local history actor values are `LOCAL_USER` and `SYSTEM`; authentication and named-user attribution are not implemented.
- The editable manifest begins at version 0. Frozen, immutable versions begin at `manifest-v001.json` on the first design lock.
- Unlock preserves the last active reference file for audit/relock safety; it is archived only when a later lock installs a replacement.
- Reject/delete protection is enforced and integration/E2E tested through core and REST. General destructive candidate/round controls are not surfaced as routine UI actions.
- History is scoped to the open creature; there is no cross-creature history dashboard.
- Only PNG candidate and contact-sheet imports are accepted.
- Contact-sheet geometry is explicit and rectangular; automatic/irregular cell detection is not implemented.
- Candidate comparison is scoped to two candidates in the open round and its view controls are not persisted.
- Clipboard import depends on browser clipboard image support and still uses the same validated upload service.
- No direct ChatGPT-generated image file handoff is claimed.
- Playwright's Chromium browser must be installed once with `pnpm exec playwright install chromium` on a new development machine.
