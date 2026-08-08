# Canonical reference workflow

1. Call `get_creature_context` and require the current active design lock.
2. Review `missingReferenceTypes` and work on one reference type at a time. `LOCKED_DESIGN` is the identity anchor, not a generated replacement.
3. If no pending request exists, direct the user to the returned References route to create the exact request; the current MCP inventory has no reference-request creation tool.
4. Call `get_generation_prompt` after the request exists. Use the exact prompt and attach the locked design.
5. Generate one standalone reference PNG, not a multi-view sheet, animation, or redesigned creature.
6. Direct the user to import and visually compare it in Model Lab. Mechanical PNG/canvas/transparency checks do not prove identity or anatomy.
7. Do not call `approve_reference` for “if it looks okay.” Name the exact reference and wait for explicit visual approval, then send `confirmation=true`.
8. Reread context. Only references tied to the current design lock satisfy the mandatory gate; earlier lock attempts remain stale history.
