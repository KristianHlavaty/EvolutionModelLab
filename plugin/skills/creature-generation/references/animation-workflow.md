# Animation workflow

1. Call `get_creature_context`. Require `DESIGN_LOCKED` and a satisfied current mandatory-reference gate before `create_animation`.
2. Confirm animation type/name, FPS, looping, expected frame count, and canvas. Use `create_animation` only after these inputs are explicit.
3. Retrieve the saved key-pose prompt and attach the locked design plus required approved references.
4. Generate key poses first. Keep identity, canvas, facing convention, anchor, scale, and transparency stable; vary only the intended motion.
5. Direct the user to import separate PNG frames in Animation Lab and review roles, order, timing, onion skin, overlays, and mechanical warnings.
6. Create intermediate frames only after at least two key poses are approved as endpoints. The current MCP tool set may require the user to save that prompt in the local app.
7. Use [repair-workflow.md](repair-workflow.md) for a bad frame; do not discard a sound sequence by default.
8. Call `get_validation_report` before approval. Name the exact animation and remaining blockers.
9. Wait for explicit approval, then call `approve_animation` with `confirmation=true`. Reread context afterward.
