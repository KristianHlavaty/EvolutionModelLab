# Workflow

The complete intended state sequence is:

`DRAFT → CONCEPT → CANDIDATE_SELECTED → REFINING → DESIGN_LOCKED → REFERENCE_BUILDING → REFERENCE_APPROVED → ANIMATING → ANIMATION_REVIEW → GAME_READY`

`ARCHIVED` is a soft-deleted terminal presentation state that may be restored later.

## States and gates

- **DRAFT:** creature identity and brief exist. A concept round may be created.
- **CONCEPT:** Concept Round 1 exists. One to ten real PNG candidates may be imported.
- **CANDIDATE_SELECTED:** exactly one active parent is selected in the current round. Milestone 1 ends here.
- **REFINING:** a new immutable refinement round references the selected parent and recorded feedback. Planned for Milestone 2.
- **DESIGN_LOCKED:** an explicitly confirmed candidate and design manifest are canonical. Planned for Milestone 3.
- **REFERENCE_BUILDING:** canonical views are being requested and reviewed one at a time. Planned for Milestone 5.
- **REFERENCE_APPROVED:** configured mandatory references are approved.
- **ANIMATING:** key poses, then intermediates, are being built. Planned for Milestone 6.
- **ANIMATION_REVIEW:** frame validation and repairs are in progress.
- **GAME_READY:** required designs, references, and animations have approved exports.

The application must never skip a gated state silently. Unlocking, locking, reference approval, animation approval, and export require explicit confirmation in the milestone that implements them.

## Milestone 1 rules enforced now

- A concept round can only be created from `DRAFT`.
- A concept round is immutable and saves its own prompt/context files.
- A round accepts at most ten active candidates numbered deterministically from 1.
- A candidate must belong to the round in which it is selected.
- The database permits at most one selected candidate in a round.
- Exact duplicate original bytes are rejected by SHA-256.
- Selecting a parent changes the creature to `CANDIDATE_SELECTED` and appends history.
