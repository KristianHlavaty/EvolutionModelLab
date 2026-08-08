---
name: creature-generation
description: Guide ChatGPT through Evolution Model Lab creature concepts, controlled refinements, descendants, canonical references, animation key poses/intermediates, targeted frame repair, approvals, and exports using the connected MCP tools. Use for creating or continuing a creature workflow while preserving stored constraints, state gates, explicit user choices, and honest manual image handoff.
---

# Creature generation

## Read authoritative state first

1. Resolve the stable creature ID with `list_creatures` when it is not already unambiguous.
2. Call `get_creature_context` before generating, refining, branching, creating references or animations, approving, or exporting.
3. Treat returned status, selected/locked relationships, manifest, mandatory-reference gate, validation report, IDs, and `nextAction` as authoritative.
4. Call `get_current_round`, `get_candidate_gallery`, `get_generation_prompt`, or `get_validation_report` when the next action needs their exact persisted evidence.
5. Never infer workflow success from the conversation or from viewing an image. Reread state after a write.

## Choose the workflow

Read only the reference needed for the requested action:

- [concept-workflow.md](references/concept-workflow.md) for first concepts.
- [refinement-workflow.md](references/refinement-workflow.md) for feedback-driven iteration.
- [evolution-workflow.md](references/evolution-workflow.md) for a descendant from an approved ancestor.
- [reference-workflow.md](references/reference-workflow.md) for canonical views and approval.
- [animation-workflow.md](references/animation-workflow.md) for key poses, intermediates, review, and approval.
- [repair-workflow.md](references/repair-workflow.md) for one broken animation frame.
- [quality-rules.md](references/quality-rules.md) whenever composing or checking image-generation instructions.

## Execute the handoff

1. Use the exact persisted prompt returned by Model Lab. Incorporate stored feedback and immutable constraints; do not silently replace them with conversational guesses.
2. Use the selected candidate as the refinement parent. Ask the user to attach the required selected/locked/reference image when the client has not supplied it.
3. Request ten concepts or controlled refinements unless the user explicitly requests another supported count.
4. Generate canonical references one view at a time. Generate animation key poses before intermediate frames.
5. Repair one marked frame instead of regenerating a complete animation unless the user explicitly chooses a reset.
6. Import generated files through MCP only when a discovered, documented import tool actually accepts those files. This connection currently exposes no import tool.
7. Otherwise direct the user to the returned local Model Lab route and ask them to choose, drag, or paste real PNG results.
8. Never claim an image was imported, persisted, selected, locked, approved, repaired, or exported unless the corresponding operation returned `ok` and state confirms it.

## Respect gates and confirmations

- Require exactly one selected parent before refinement; ask for selection rather than guessing.
- Do not generate animation before `DESIGN_LOCKED`, and do not create it until the current mandatory-reference gate passes.
- Never silently lock/unlock a design or approve a reference, animation, or export.
- Explain the exact target and consequence, then wait for explicit user approval before sending `confirmation=true`.
- Do not interpret “looks promising,” “if okay,” or “when ready” as confirmation.
- Surface structured errors and blockers exactly enough for the user to resolve them in the local app. Do not retry with fabricated IDs or unsupported tools.
- Preserve immutable locked assets, round history, reference attempts, repaired-frame predecessors, and export versions.
