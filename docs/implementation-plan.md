# Evolution Model Lab implementation plan

## Repository

- Resolved repository root: `C:\Users\krist\Desktop\coding\EvolutionModelLab`
- Verified on: 2026-08-05
- The repository is initialized directly at the workspace root.
- No nested `EvolutionModelLab` directory is used.
- Runtime data remains under `data/`, `workspace/`, and `exports/` in this repository.

## Product boundary

Evolution Model Lab is a local-first creature design workspace. ChatGPT supplies images through ordinary conversations; this application persists project state, builds prompts, imports and validates user-provided images, and maintains recoverable history. It does not call paid image-generation APIs and never pretends to generate images.

The current release implements **Milestone 5**, building on locked designs and persisted lineage. Canonical references are enabled only through design-lock-aware request, import, validation, and explicit approval gates; animation, export, MCP, and ChatGPT plugin surfaces remain disabled or clearly documented as later work.

## Module boundaries

- `apps/web`: React/Vite interface, routing, uploads, numbered gallery, feedback/manifest/mutation editors, candidate and lineage comparison, persisted evolution tree, canonical-reference request/import/approval UI, mandatory-reference settings, lock/unlock confirmations, prompt history, and contact-sheet preview/confirmation.
- `apps/server`: localhost Express transport, request parsing, error mapping, and exact guarded media responses.
- `apps/mcp-server`: reserved application boundary for the later Streamable HTTP MCP server; no MCP SDK is installed through Milestone 4.
- `packages/core`: reusable workflow/application services, including manifest versioning, design-lock rules, approved-parent evolution branching, lineage reads, ordered mutations, canonical-reference integrity/approval, and mandatory-rule evaluation, used by REST and future MCP adapters.
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

## Milestone 4 additive schema

`0003_milestone_four.sql` preserves every earlier project while adding:

- an index for `creature_projects.parent_creature_id`, making persisted parent/child traversal independent of the UI layout;
- an index for `generation_rounds.source_creature_id`, supporting immutable evolution-round ancestry;
- `evolution_mutations`, with restrictive parent/child foreign keys plus stored category, description, explicit priority, optional intensity, inherited/new designation, and creation time.

Existing creatures remain generation zero roots. A descendant transaction writes its parent relationship, generation, source creature/candidate round lineage, mutations, and two-sided history together. No parent rows or files are rewritten.

## Milestone 5 additive schema

`0004_milestone_five.sql` preserves all previous rows while adding:

- `reference_images`, which represents an immutable canonical-reference attempt with its creature, exact design-lock relationship, type, status, generated prompt, prompt/context paths, guarded original/thumbnail paths, filename metadata, notes, validation JSON, decoded dimensions/alpha/hash/MIME, approval state, actor, and timestamps;
- a reference-image owner on `history_events`, plus indexes for creature history, design-lock/type lookup, status dashboards, and exclusive prompt/image paths.

The table deliberately permits multiple historical attempts of one type while core prevents duplicate pending requests and approved-type replacement for an active lock. Mandatory satisfaction uses only approved rows whose `design_lock_id` equals the current active lock.

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
| 4         | Evolution lineage and mutations                      | Completed |
| 5         | Canonical references and approval gates              | Completed |
| 6         | Animation Lab and repair workflow                    | Completed |
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

## Milestone 4 acceptance criteria

- [x] A descendant can be created only from a creature with one active authoritative design lock; selected, unlocked, missing, invalid, or hash-mismatched ancestor references are rejected.
- [x] Descendants persist one parent ID, a monotonically increasing evolutionary generation, one immutable `EVOLUTION` round, the approved parent candidate, and one or more ordered mutation records.
- [x] The deterministic evolution prompt includes the approved ancestor, inherited/preferred/forbidden manifest constraints, ordered mutation details, production constraints, ten outputs, and explicit no-animation/no-unrelated-anatomy rules.
- [x] Descendant staging creates separate directories and never changes the parent's candidate original, locked reference, manifest snapshots, or immutable round history.
- [x] Evolution rounds accept real PNG candidates through the existing validated import, selection, and lock services; a locked child can seed a later generation.
- [x] The responsive evolution route renders persisted generations, parent/child links, thumbnails and lock state, direct descendants, inherited constraints, mutation details, and ancestor/descendant image comparison.
- [x] The descendant editor supports ordered mutation categories, descriptions, intensity, inherited/new designation, insertion, removal, and priority movement without synthesizing child anatomy.
- [x] Unit/integration tests cover gates, prompt/context artifacts, order, restart persistence, unchanged ancestor bytes, multiple generations, comparison, evolution imports, and reference-integrity rejection.
- [x] Playwright covers parent manifest approval/lock, descendant creation, mutations, prompt content, child candidate import/selection/lock, lineage comparison, and reload persistence.

## Milestone 4 test status

Final verification on 2026-08-08:

| Command                          | Result                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm format:check`     | Passed; every matched file uses Prettier style                                                                   |
| `corepack pnpm lint`             | Passed; 0 ESLint errors                                                                                          |
| `corepack pnpm typecheck`        | Passed; packages, server, and web compile in strict mode                                                         |
| `corepack pnpm test`             | Passed; 6 files and 26 Vitest unit/integration tests                                                             |
| `corepack pnpm test:e2e`         | Passed; 3 complete Playwright concept/refinement, design-lock, and evolution workflows                           |
| `corepack pnpm build`            | Passed; packages/server compiled and Vite transformed 1,677 modules                                              |
| Manual primary workflow exercise | Passed; lineage, comparison, mutation editor, desktop/narrow layouts, persistence, and 0 console warnings/errors |

The Milestone 4 Playwright workflow creates and approves a parent manifest, locks a real imported PNG, creates a descendant with two ordered mutations, verifies its parent relationship and generated evolution prompt, imports/selects/locks a descendant PNG, compares both generations, reloads, and confirms persisted lineage. The core suite additionally verifies missing/unlocked parent gates, reference hash integrity, immutable prompt/context artifacts, mutation order, unchanged ancestor bytes, restart persistence, and a locked grandchild branch.

Manual in-app browser QA inspected a persisted three-root/two-generation tree, the focused ancestor/descendant comparison, inherited constraints, mutation details, and the descendant form at desktop and 700-pixel responsive widths. It found and corrected focused-lineage sidebar state plus previously unstyled descendant controls. The corrected page had no horizontal overflow and reported no browser console warnings or errors. Isolated QA services were stopped afterward.

## Milestone 5 acceptance criteria

- [x] The complete reference type set is modeled; `LOCKED_DESIGN` is the non-requestable identity anchor and all other types can be requested individually.
- [x] Reference creation requires and verifies the current active design lock, uses its immutable manifest snapshot, persists one deterministic prompt/context pair, and forbids multi-view/contact-sheet/animation output.
- [x] Every attempt is tied to an exact design-lock ID, stored in a new UUID directory, and preserved independently; old-lock approvals remain visible but stale after relock.
- [x] Import accepts exactly one real PNG, performs content/limit/hash checks, preserves the original and separate thumbnail, records transparency/canvas validation, and rejects duplicate bytes for the same lock.
- [x] Approval requires a separate confirmation plus current-lock and stored-file decoding/hash integrity checks; it never silently approves or replaces an image.
- [x] Project settings expose an ordered unique mandatory-reference set that always includes the locked design and defaults to locked design, strict side profile, silhouette, and colour/material.
- [x] Mandatory satisfaction and `REFERENCE_APPROVED` use only approvals belonging to the active design lock and re-evaluate after settings changes or relock.
- [x] The responsive reference UI presents the locked identity, mandatory progress, all reference types, saved prompts, immutable attempts, upload notes, validation warnings, explicit approval modal, and stale-history markers.
- [x] Existing concept/refinement, design-lock, and evolution browser workflows remain available; locked creatures retain both reference and current-round review actions.
- [x] Unit/integration and Playwright coverage exercise gates, prompts/artifacts, invalid/duplicate imports, unchanged bytes, explicit approvals, restart persistence, configurable rules, relock staleness, and full default-set completion.

## Milestone 5 test status

Final verification on 2026-08-08:

| Command                          | Result                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm format:check`     | Passed; every matched file uses Prettier style                                                                         |
| `corepack pnpm lint`             | Passed; 0 ESLint errors                                                                                                |
| `corepack pnpm typecheck`        | Passed; packages, server, and web compile in strict mode                                                               |
| `corepack pnpm test`             | Passed; 7 files and 30 Vitest unit/integration tests                                                                   |
| `corepack pnpm test:e2e`         | Passed; 4 complete Playwright workflows through canonical references                                                   |
| `corepack pnpm build`            | Passed; packages/server compiled and Vite transformed 1,678 modules                                                    |
| Manual primary workflow exercise | Passed; approved set, warnings, attempts, settings, desktop/narrow layouts, persistence, and 0 console warnings/errors |

The Milestone 5 Playwright workflow locks a real creature PNG, verifies the default three missing canonical views, creates and inspects one-view prompts, imports three distinct PNGs, explicitly confirms each approval, satisfies the mandatory gate, reloads, changes project rules to add a missing front view, observes the gate reopen, restores the rule, and verifies the creature remains `REFERENCE_APPROVED`. All earlier browser workflows remain green.

The core suite verifies missing-lock and duplicate-pending gates, frozen manifest prompt content, exclusive prompt/context artifacts, invalid and byte-duplicate imports, exact stored original bytes, mechanical validation, confirmation requirements, all-default approval, restart persistence, project-rule changes, old-lock staleness after relock, and unchanged locked candidate originals.

Manual in-app browser QA inspected the completed reference set and warnings, reference-type grid, collapsed prompt history, project settings, and mandatory-rule defaults at desktop and 700-pixel widths. The page had no horizontal overflow and reported no browser console warnings or errors. Isolated manual-QA services were stopped afterward.

## Milestone 6 acceptance criteria

- [x] Animation creation is blocked until the current design lock satisfies every configured mandatory reference and freezes the animation to that exact lock and manifest version.
- [x] Animation types, statuses, FPS, looping, canvas dimensions, expected frame count, prompts, frames, repair relationships, history ownership, and soft deletion persist through the additive `0005_milestone_six.sql` migration.
- [x] Deterministic key-pose, intermediate, and targeted-repair prompts preserve identity, anatomy, markings, scale, camera, canvas, facing, lighting, anchor, ordering, and transparent-output constraints.
- [x] Manual picker, drag/drop, and clipboard paths import real PNG frames without paid generation calls; originals and thumbnails use separate exclusive paths and exact duplicates are rejected before persistence.
- [x] Frame inspection stores alpha bounds, visible center, visible-pixel count, edge contact, SHA-256, and perceptual hash; adjacent canvas, center, bounds, opacity, and likely-duplicate differences remain visible review warnings rather than fake semantic judgments.
- [x] The responsive Animation Lab provides first/previous/play-pause/next/last controls, 0.25Ă—/0.5Ă—/1Ă—/2Ă— playback, FPS/loop settings, checkerboard rendering, previous/next onion skins, opacity controls, locked-reference overlay, bounds, center, and anchor overlays.
- [x] The frame strip supports deterministic numbering, KEY_POSE/INTERMEDIATE/REPAIR/HOLD roles, order changes, per-frame duration and notes, repair flags, explicit deletion confirmation, and warning markers.
- [x] Repair prompts require a marked frame. Replacement creates a new active `REPAIR` revision with `replacesFrameId`, preserves the old original and row as immutable history, and does not modify unrelated frames.
- [x] Approval requires explicit confirmation, the current design and mandatory references, the exact expected active-frame count, and no pending repair flags.
- [x] Unit/integration and Playwright coverage exercise gates, prompt content, stored bytes, image metrics, duplicate rejection, ordering, intermediate handoff, repair revision preservation, playback/overlays, and approval.

## Milestone 6 test status

Final verification on 2026-08-08:

| Command                          | Result                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `corepack pnpm format:check`     | Passed; every matched file uses Prettier style                                                                     |
| `corepack pnpm lint`             | Passed; 0 ESLint errors                                                                                            |
| `corepack pnpm typecheck`        | Passed; packages, server, and web compile in strict mode                                                           |
| `corepack pnpm test`             | Passed; 8 files and 35 Vitest unit/integration tests                                                               |
| `corepack pnpm test:e2e`         | Passed; 5 complete Playwright workflows through eight-frame animation approval                                     |
| `corepack pnpm build`            | Passed; packages/server compiled and Vite transformed 1,679 modules                                                |
| Manual primary workflow exercise | Passed; list/lab, playback workbench, warnings, prompts, desktop and 700-pixel layouts, and no horizontal overflow |

The Milestone 6 Playwright workflow reuses the fully approved reference fixture, creates an eight-frame swim, verifies the saved identity-constrained key-pose prompt, imports eight real PNGs, exercises playback, onion/bounds/center overlays and ordering, saves the intermediate prompt, and confirms approval. Earlier concept, refinement, design-lock, evolution, and reference workflows remain green.

The core suite additionally verifies the reference gate, frozen lock/manifest prompt context, original byte preservation, exact duplicate rejection, calculated frame metrics and warnings, deterministic reordering, marked-frame repair prompting, replacement lineage with preserved old bytes, and approval invariants.

Manual in-app browser QA inspected the persisted approved sequence at desktop and 700-pixel widths. Playback controls, frame review, validation warnings, checkerboard stage, frame strip, and prompt/approval surfaces remained readable, and the narrow layout had no horizontal overflow. The responsive override was reset, the browser tab finalized, and isolated QA services stopped afterward.

## Known limitations

- Export, MCP, ChatGPT integration, and plugin skills remain deferred to their planned milestones.
- Animation continuity checks are practical image heuristics, not semantic anatomy or identity recognition. Warnings require human review and do not auto-reject a frame.
- Milestone 6 imports finished PNG frames; it does not generate motion, interpolate frames, or integrate a game engine.
- Reference validation proves file integrity and records canvas/transparency checks; visual anatomy, identity, palette, and material consistency still require explicit human review.
- A reference attempt accepts one separate PNG. Contact-sheet reference extraction and automatic semantic comparison are not implemented.
- Evolution is a strict single-parent tree. Hybrid/multiple-parent descent and cross-project mutation merging are not modeled.
- Mutations are immutable after descendant creation in Milestone 4; corrections require a new descendant branch. Lineage comparison is side-by-side rather than a synchronized overlay.
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
