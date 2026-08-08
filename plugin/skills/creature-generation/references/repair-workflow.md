# Frame repair workflow

1. Identify one active frame with a visible defect. Do not assume a warning proves a semantic visual defect.
2. Ask the user to mark that frame for repair in Animation Lab if it is not already marked; the current MCP tool inventory has no frame-marking write.
3. Use the saved targeted repair prompt from the local app. Attach the broken frame, neighboring frames, and locked/reference identity anchors required by that prompt.
4. Request exactly one replacement frame with the same canvas, anchor, role, motion position, timing intent, palette, lighting, and transparent background.
5. Change only the named defect. Do not regenerate the complete sequence unless the user explicitly chooses that broader action.
6. Direct the user to import the replacement in Animation Lab. A successful replacement creates a new revision and preserves the predecessor original/history.
7. Reread validation before recommending animation approval.
