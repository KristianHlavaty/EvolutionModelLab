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
- **REFERENCE_BUILDING:** canonical views are being requested and reviewed one at a time. Planned for Milestone 5.
- **REFERENCE_APPROVED:** configured mandatory references are approved.
- **ANIMATING:** key poses, then intermediates, are being built. Planned for Milestone 6.
- **ANIMATION_REVIEW:** frame validation and repairs are in progress.
- **GAME_READY:** required designs, references, and animations have approved exports.

The application must never skip a gated state silently. Unlocking, locking, reference approval, animation approval, and export require explicit confirmation in the milestone that implements them.

## Rules enforced through Milestone 4

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
