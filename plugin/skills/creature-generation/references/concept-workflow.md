# Concept workflow

1. Call `get_creature_context`. Continue only for a root creature that can create its first concept round.
2. If the user has not yet created the creature, confirm its display name and generation brief, then call `create_creature` once.
3. Call `create_generation_round` for the concept round only after the user asks to begin concepts.
4. Call `get_generation_prompt` and use the exact persisted prompt. Do not attach a parent image for a first concept round.
5. Request ten visibly distinct concepts unless the user explicitly requests another supported count. Keep them as still design candidates, not animation frames.
6. Direct the user to the returned round route to import real PNGs by picker, drag/drop, clipboard, or confirmed contact sheet.
7. Call `get_candidate_gallery` after import. Ask the user to choose one parent; do not select from aesthetics without an explicit choice.

Never say concepts were saved merely because they were generated in the chat.
