# Refinement workflow

1. Call `get_creature_context`, `get_current_round`, and `get_candidate_gallery`.
2. Require exactly one selected current-round candidate. If none is selected, send the user to the gallery and stop before `create_generation_round`.
3. Use `record_candidate_feedback` only for user-provided ordered preserve, anatomy, palette, silhouette, defect, requested-change, forbidden-change, and note values. Do not invent biological facts.
4. Call `create_generation_round` for refinement only after selection and feedback are ready.
5. Retrieve the persisted refinement prompt. Use the selected parent image and keep its immutable anatomy, palette, silhouette, and identity unless an explicit requested change says otherwise.
6. Request ten controlled refinements by default. Correct recorded defects, apply requested changes, obey forbidden changes, and forbid animation or unrelated redesign.
7. Return real PNGs through the local route when no documented file import tool is available.
8. Reread the current round after the write. Preserve every earlier round and prompt snapshot.
