# Workflow

The complete intended state sequence is:

`DRAFT → CONCEPT → CANDIDATE_SELECTED → REFINING → DESIGN_LOCKED → REFERENCE_BUILDING → REFERENCE_APPROVED → ANIMATING → ANIMATION_REVIEW → GAME_READY`

`ARCHIVED` is a soft-deleted terminal presentation state that may be restored later.

## States and gates

- **DRAFT:** creature identity and brief exist. A concept round may be created.
- **CONCEPT:** Concept Round 1 exists. One to ten real PNG candidates may be imported.
- **CANDIDATE_SELECTED:** exactly one active parent is selected in the current round. Ordered feedback may be saved for that parent and a refinement round may be created.
- **REFINING:** a new immutable refinement round references the selected parent and a frozen feedback snapshot. Real PNG refinements may be imported, compared, and selected for another iteration. Milestone 2 ends here.
- **DESIGN_LOCKED:** an explicitly confirmed candidate and design manifest are canonical. Planned for Milestone 3.
- **REFERENCE_BUILDING:** canonical views are being requested and reviewed one at a time. Planned for Milestone 5.
- **REFERENCE_APPROVED:** configured mandatory references are approved.
- **ANIMATING:** key poses, then intermediates, are being built. Planned for Milestone 6.
- **ANIMATION_REVIEW:** frame validation and repairs are in progress.
- **GAME_READY:** required designs, references, and animations have approved exports.

The application must never skip a gated state silently. Unlocking, locking, reference approval, animation approval, and export require explicit confirmation in the milestone that implements them.

## Rules enforced through Milestone 2

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
