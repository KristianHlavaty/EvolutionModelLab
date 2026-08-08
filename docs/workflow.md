# Workflow

The complete intended state sequence is:

`DRAFT → CONCEPT → CANDIDATE_SELECTED → REFINING → DESIGN_LOCKED → REFERENCE_BUILDING → REFERENCE_APPROVED → ANIMATING → ANIMATION_REVIEW → GAME_READY`

`ARCHIVED` is a soft-deleted terminal presentation state that may be restored later.

## States and gates

- **DRAFT:** creature identity and brief exist. A concept round may be created.
- **CONCEPT:** Concept Round 1 exists. One to ten real PNG candidates may be imported.
- **CANDIDATE_SELECTED:** exactly one active parent is selected in the current round. Ordered feedback may be saved for that parent and a refinement round may be created.
- **REFINING:** a new immutable refinement round references the selected parent and a frozen feedback snapshot. Real PNG refinements may be imported, compared, selected for another iteration, or explicitly design-locked.
- **DESIGN_LOCKED:** an explicitly confirmed candidate and frozen Design Manifest version are the active design authority. Unlocking explicitly returns the project to `REFINING`; a later lock may select a different current-round candidate without destroying prior lock history. A locked creature may seed one or more persisted descendants, each beginning in `CONCEPT` with an immutable `EVOLUTION` round.
- **REFERENCE_BUILDING:** one or more project-mandatory canonical views remain unapproved for the active design lock. Requests, imports, and rejected/unapproved attempts remain immutable history.
- **REFERENCE_APPROVED:** the active locked design plus every configured mandatory reference type have an explicit approval tied to that same design lock. Optional views may still be requested without closing the animation gate.
- **ANIMATING:** a reference-gated animation has a saved key-pose or intermediate handoff and is awaiting real frame imports.
- **ANIMATION_REVIEW:** imported frames, continuity warnings, order, roles, durations, notes, and non-destructive repair revisions are being reviewed. Explicitly approved animations remain here until export.
- **GAME_READY:** required designs, references, and animations have approved exports.

The application must never skip a gated state silently. Unlocking, locking, reference approval, animation approval, and export require explicit confirmation in the milestone that implements them.

## Rules enforced through Milestone 7

- A concept round can only be created from `DRAFT`.
- A concept round is immutable and saves its own prompt/context files.
- A round accepts at most ten active candidates numbered deterministically from 1.
- A candidate must belong to the round in which it is selected.
- The database permits at most one selected candidate in a round.
- Exact duplicate original bytes are rejected by SHA-256.
- Selecting a parent changes the creature to `CANDIDATE_SELECTED` and appends history.
- Feedback can only be recorded against a selected candidate; every ordered category is stored independently.
- Refinement creation requires exactly one selected parent in the current round.
- Creating a refinement round increments the round number, sets `REFINING`, references its parent candidate, and freezes the feedback/prompt/context without changing the previous round.
- Candidate imports and selection changes are rejected for historical rounds.
- Contact-sheet preview preserves the uploaded original before confirmation. Layout revisions reuse that immutable original.
- Confirmation creates candidates only from explicitly selected, visible crop rectangles and never permits more than ten active candidates in the round.
- Every creature has one persisted Design Manifest draft with ordered immutable, preferred, and forbidden feature lists; approved notes; canvas dimensions; facing; anchor; and transparency requirements.
- Manifest fields distinguish untouched project defaults from explicit project-owner edits. The application does not synthesize biological or anatomical facts.
- An active lock requires an explicitly acknowledged confirmation, exactly one selected candidate in the current round, matching creature ownership, a valid non-rejected candidate, and a source PNG whose guarded path, bytes, and saved hash still agree.
- A successful first lock freezes a numbered manifest snapshot, copies the selected original without changing it, sets `DESIGN_LOCKED`, and records candidate/round/manifest/actor history.
- Frozen manifest snapshots and numbered history files are never overwritten. Saving a changed manifest after a lock requires a separate explicit acknowledgement and creates the next immutable version.
- The active locked candidate cannot be rejected or deleted, and its source round cannot be deleted. Rejected protected actions are appended to history.
- Imports do not replace the active locked design. Relocking explicitly archives the previous active reference before activating the new selected candidate.
- Unlock requires explicit acknowledgement, preserves references and all history, clears the active locked candidate relationship, and returns the creature to `REFINING`.
- Filesystem work for locking is staged with exclusive creation. A failed database transaction removes only newly staged files and leaves existing originals, references, and history untouched.
- Descendant creation requires one active authoritative design lock whose candidate agrees with the parent project. A selected or historical candidate is insufficient.
- Before branching, core resolves the locked reference inside the configured workspace, rereads and decodes the PNG, and rejects missing, invalid, or hash-mismatched bytes.
- Every descendant has exactly one stored parent, a generation equal to its parent's generation plus one, an immutable Evolution Round 1, and one or more ordered mutation rows.
- Mutation category, description, order, optional intensity, and inherited/new designation are frozen when the descendant is created.
- Evolution prompts name the approved ancestor and parent candidate, preserve the approved ancestor manifest constraints, apply mutations in stored priority order, request ten images, and forbid animation, unrelated species changes, and unrequested anatomy.
- The child Design Manifest starts with safe project defaults. Ancestor facts remain explicit evolution context; the application does not silently claim them as owner-approved child anatomy or biology.
- Descendant staging creates a new exclusive creature directory. Failure cleanup is limited to that newly created directory and never targets the ancestor's originals, active reference, manifest snapshots, or history.
- Evolution candidates use the same content-based PNG validation, duplicate detection, selection invariant, and design-lock gates as earlier rounds.
- A locked descendant may seed another generation. The flat persisted lineage and ancestor/descendant comparison remain available after restart independently of the current UI layout.
- Canonical-reference requests require one current active authoritative design lock and a guarded locked PNG whose decoded bytes still match the lock hash.
- Every request asks for exactly one requestable reference type, uses the frozen manifest version from its design lock, and persists deterministic prompt/context files in a new exclusive UUID attempt directory.
- The locked design is the non-requestable identity anchor. Requestable types are strict side profile, opposite side, front, three-quarter, top, silhouette, colour/material, and anatomy diagram.
- A pending request cannot be duplicated. An unapproved imported attempt remains preserved and may be followed by a new attempt; an approved type cannot be requested again for the same active lock.
- Each attempt accepts at most one real PNG. Core ignores declared MIME trust, decodes and hashes the bytes, rejects an exact reference duplicate for the same lock, preserves the original, and stores its thumbnail separately.
- Mechanical validation records PNG/limit, transparency, canvas, and current-lock checks. Canvas/transparency mismatches are visible warnings; visual identity still requires human review.
- Approval requires explicit confirmation, one imported valid PNG, the same active design lock, and stored bytes whose guarded path, decoding, and SHA-256 still match the import record.
- Approved references are never silently replaced. A later unlock/relock preserves them as stale history, and they no longer satisfy the new lock's mandatory set.
- Project settings define an ordered unique mandatory-reference set and always include `LOCKED_DESIGN`. The default adds strict side profile, silhouette, and colour/material.
- `REFERENCE_APPROVED` is derived only when every mandatory type is satisfied for the active lock. Changing project rules re-evaluates locked creatures; animation remains gated while any mandatory type is missing.
- Animation creation requires `animationGateSatisfied` for the active design lock and permanently records that exact lock ID, frozen manifest context, canvas, expected frame count, deterministic key-pose prompt, and prompt/context paths.
- PNG frames are decoded and inspected before persistence. Exact SHA-256 duplicates within an animation are rejected; perceptual similarity and adjacent center/bounds/opacity shifts are warnings for human review.
- Imported frame originals and thumbnails have separate UUID paths. Reordering changes only active numbering, and removal is soft deletion after explicit confirmation; neither operation deletes original image files.
- Playback order contains every active frame exactly once. Roles are KEY_POSE, INTERMEDIATE, REPAIR, or HOLD, and FPS, looping, per-frame duration, notes, warnings, and repair flags persist.
- Intermediate prompts require at least two active key poses and use them as fixed endpoints while preserving the frozen identity and production constraints.
- Repair prompts require a marked frame and request exactly one targeted replacement. The replacement is a new active revision that points to the old frame; the old row and original bytes remain preserved.
- Animation approval requires explicit confirmation, the exact current design lock and mandatory reference set, exactly the configured active-frame count, and no pending repair flags.
- Export readiness is derived from the current active design lock, the current mandatory reference set, and at least one approved/current animation. Historical or stale approvals cannot satisfy the gate.
- Every export requires explicit confirmation and creates a new monotonic creature-scoped version. Existing export directories and database rows are never reused or overwritten.
- Locked designs, canonical references, and numbered animation-frame originals are copied byte-for-byte into the package. Sprite sheets are separate derived artifacts created by the selected exporter adapter.
- Generic animation metadata records frame order and rectangles, FPS, looping, per-frame duration, anchor, canvas, and validation evidence. Sheet dimensions and total pixels are guarded before composition.
- Creature, evolution, validation, and summary JSON are frozen in every package. Prompt history is included only by explicit choice.
- Filesystem work is staged in a new exclusive directory. Failure cleanup targets only that attempt; previous packages and source originals are never removed.
- A successful package appends export-owned history, marks included animations `EXPORTED`, sets the creature `GAME_READY`, and remains visible after restart.
