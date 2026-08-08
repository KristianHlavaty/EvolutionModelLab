# Evolution workflow

1. Call `get_creature_context` for the proposed ancestor.
2. Require an active approved design lock. A selected candidate or historical lock is not sufficient.
3. Confirm the descendant identity, generation brief, and ordered mutation list. Preserve the single approved parent; do not combine unmodeled multiple parents.
4. Call `create_descendant` once with explicit mutation categories, descriptions, order, optional intensity, and inherited/new intent.
5. Use the returned child ID to call `get_creature_context` and `get_generation_prompt`.
6. Attach the approved locked ancestor image. Preserve the ancestor's approved constraints, apply mutations in order, and request ten still-image descendant candidates.
7. Forbid unrelated species/anatomy changes and animation.
8. Import and select real child candidates through the normal workflow. Locking the descendant remains a separate explicitly confirmed action.

Never rewrite or imply changes to the ancestor's originals, lock, manifest snapshots, or history.
