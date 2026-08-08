# MCP tools

Milestone 8 serves the stable v2 TypeScript MCP SDK over Streamable HTTP at `http://127.0.0.1:3002/mcp`. The adapter is intentionally thin: every operation calls `packages/core`, so REST and MCP enforce the same persisted workflow gates.

Start all local services with `pnpm dev`, or start only MCP with `pnpm dev:mcp`. With the server running, `pnpm inspect:mcp` launches the latest official MCP Inspector for the endpoint. The health check is `GET http://127.0.0.1:3002/health`. ChatGPT connection and Secure MCP Tunnel instructions are in `docs/chatgpt-setup.md`; evaluation cases are in `plugin/evals/mcp-tool-evals.json`.

## Server instructions

Clients are instructed to:

- use read tools first and call `get_creature_context` before refinement, reference, animation, or export work;
- select exactly one candidate before refinement;
- complete mandatory canonical-reference approvals before animation;
- request explicit user approval before lock, unlock, reference approval, animation approval, or export;
- preserve locked assets and immutable history;
- use the returned local app route for real image import and visual review;
- never report success when a structured error was returned.

## Read tools

| Tool                    | Returns                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `list_creatures`        | Stable IDs, status, lineage/current-round relationships, thumbnail route, and modification time |
| `get_creature_context`  | Current round/selection/lock/manifest, lineage, references, animations, gates, and next action  |
| `get_generation_prompt` | Persisted generation, canonical-reference, or animation prompt and required local image routes  |
| `get_current_round`     | The current immutable prompt, parent, feedback snapshot, and candidate metadata                 |
| `get_candidate_gallery` | Numbered candidate state and local image/thumbnail routes                                       |
| `get_validation_report` | Current export blockers, warnings, reference approvals, animation state, and frame evidence     |

All read tools advertise `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`.

## Write tools

| Tool                        | Core behavior                                                                 | Explicit confirmation |
| --------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| `create_creature`           | Creates a root creature project; lineage must use `create_descendant`         | No                    |
| `create_generation_round`   | Creates a concept or gated refinement round with an immutable prompt snapshot | No                    |
| `select_candidate`          | Replaces the current round selection while preserving history                 | No                    |
| `record_candidate_feedback` | Updates current structured feedback and appends history                       | No                    |
| `lock_creature_design`      | Verifies and establishes the canonical design authority                       | Yes                   |
| `unlock_creature_design`    | Reopens refinement without removing immutable lock history                    | Yes                   |
| `create_descendant`         | Creates a child and immutable first evolution round from an approved parent   | No                    |
| `create_animation`          | Creates an animation only after the exact current reference gate passes       | No                    |
| `approve_reference`         | Approves one imported reference tied to the exact current design lock         | Yes                   |
| `approve_animation`         | Approves a complete, reviewed, unrepaired current animation                   | Yes                   |
| `export_creature`           | Creates the next non-overwriting immutable generic package version            | Yes                   |

Creature, round, descendant, and animation creation advertise additive/non-idempotent hints. Selection, feedback, lock/unlock, approvals, and export advertise destructive state-change hints because they replace current workflow state even though immutable history is preserved. Every write advertises a closed-world boundary. The confirmation-gated tools require `confirmation: true`; core rejects false or omitted confirmation.

## Results and errors

Every tool has a Zod input schema, a discriminated structured output schema, title, description, and annotations. Success is returned in both structured content and a readable JSON text block:

```json
{
  "ok": true,
  "data": { "id": "stable-uuid", "appRoute": "/creatures/stable-uuid" }
}
```

Expected failures use MCP `isError: true` and preserve the core error code:

```json
{
  "ok": false,
  "error": {
    "code": "REFINEMENT_PARENT_REQUIRED",
    "message": "Select exactly one parent candidate before refinement."
  }
}
```

Tool results expose stable entity IDs, guarded repository-relative package paths where appropriate, and user-openable local application routes. They do not expose absolute filesystem paths.

## Image handoff boundary

No `import_candidate_images` or `import_animation_frames` tool is registered. As verified against the current official MCP SDK documentation for Milestone 8, ordinary MCP tool schemas do not establish an interoperable direct ChatGPT-generated file parameter that this local server can safely consume. Inventing path, base64, or URL fields would misrepresent support and could weaken the path boundary.

Use the returned round/reference/animation route, then import real PNGs with the local picker, drag-and-drop, or clipboard. This fallback remains part of the product even if a later verified client file mechanism is added.

## Implementation references

- [Official TypeScript SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [Official tool registration guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md)
- [Official 2026-07-28 migration/support guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)
