# MCP tools

MCP is scheduled for Milestone 8 and is **not implemented or advertised as connected** in Milestone 1. Before installing an SDK, the implementation must verify the current official TypeScript package name, Streamable HTTP setup, supported annotations, output schemas, and file-input support in official documentation.

The planned endpoint is `/mcp`. Every tool will call `packages/core`, return stable IDs and useful local routes, avoid absolute filesystem details, and expose precise Zod input/output schemas.

## Planned read tools

| Tool                    | Purpose                                                                       | Side effects | Confirmation |
| ----------------------- | ----------------------------------------------------------------------------- | ------------ | ------------ |
| `list_creatures`        | List names, status, parent, current round, thumbnail reference, modified time | None         | No           |
| `get_creature_context`  | Return workflow context and recommended next action                           | None         | No           |
| `get_generation_prompt` | Return a persisted or deterministic prompt and reference requirements         | None         | No           |
| `get_current_round`     | Return the current immutable round                                            | None         | No           |
| `get_candidate_gallery` | Return numbered candidate metadata                                            | None         | No           |
| `get_validation_report` | Return creature/animation validation                                          | None         | No           |

## Planned write tools

| Tool                        | Purpose                                    | Side effects               | Confirmation                  |
| --------------------------- | ------------------------------------------ | -------------------------- | ----------------------------- |
| `create_creature`           | Create local project state and folders     | Creates records/files      | No                            |
| `create_generation_round`   | Create a gated immutable round and prompt  | Creates records/files      | No, but workflow errors apply |
| `select_candidate`          | Make exactly one candidate active          | Updates selection/history  | No                            |
| `record_candidate_feedback` | Persist structured feedback                | Updates feedback/history   | No                            |
| `lock_creature_design`      | Establish the canonical design             | Consequential records/copy | Required                      |
| `unlock_creature_design`    | Reopen refinement while preserving history | Consequential state change | Required                      |
| `create_descendant`         | Create a child from an approved parent     | Creates lineage/files      | No, parent gate applies       |
| `create_animation`          | Create an animation after all gates        | Creates records/files      | No, workflow gates apply      |
| `approve_reference`         | Approve one reference                      | Consequential approval     | Required                      |
| `approve_animation`         | Approve reviewed animation                 | Consequential approval     | Required                      |
| `export_creature`           | Create a versioned game-ready package      | Writes export files        | Required                      |
| `import_candidate_images`   | Validate and persist available image files | Writes originals/metadata  | No                            |
| `import_animation_frames`   | Validate and persist available frames      | Writes originals/metadata  | No                            |

Expected structured errors include invalid input, entity not found, invalid workflow state, missing parent selection, confirmation required, duplicate image, upload limit, invalid PNG, path violation, and persistence failure. Annotation details will be recorded only after verification against the current official SDK.
