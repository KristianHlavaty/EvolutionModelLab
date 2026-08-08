---
name: evolution-model-lab
description: Maintain and extend the Evolution Model Lab local-first TypeScript monorepo. Use when Codex changes repository code, workflow rules, SQLite migrations, REST or MCP adapters, image/file handling, tests, or milestone documentation in this project.
---

# Evolution Model Lab

## Establish scope

1. Read `AGENTS.md`, `docs/implementation-plan.md`, and `git status` before editing.
2. Identify the active milestone or narrowly requested change. Preserve completed milestones and do not present later disabled surfaces as working.
3. Inspect the owning service, schema, tests, and documentation instead of inferring behavior from the UI.
4. Read [references/architecture-and-paths.md](references/architecture-and-paths.md) for module, storage, or transport changes.
5. Read [references/development.md](references/development.md) for migrations, validation, and milestone handoff work.

## Preserve the architecture

- Put application rules and filesystem orchestration in `packages/core`.
- Keep `apps/server` and `apps/mcp-server` thin: validate transport input, call core, and map the result.
- Reuse shared Zod/domain contracts from `packages/shared`; keep deterministic prompt text in `packages/prompt-builder`.
- Store repository-relative paths in SQLite. Resolve and guard every path against its configured root before access.
- Never overwrite imported originals, locked history, manifest snapshots, repair revisions, or exports. Write derived files separately and use exclusive destinations.
- Preserve one selected active candidate per round and immutable round/history relationships.
- Bind local services to `127.0.0.1` by default. Do not add shell, arbitrary-file, or unrestricted-network MCP tools.
- Do not add paid image-generation calls or a UI action that pretends generation/import/approval/export succeeded.

## Implement safely

1. Trace the operation from transport to core, database, filesystem artifacts, history, and returned state.
2. Validate ownership and workflow state again in core even when the transport schema is narrow.
3. Stage filesystem writes with generated names, commit database relationships transactionally, and clean up only files created by the failed attempt.
4. Return stable IDs and structured domain errors. Do not expose unnecessary absolute paths.
5. Add focused unit/integration coverage for invariants and a browser workflow when user-visible behavior changes.
6. Preserve manual picker, drag/drop, and clipboard handoffs even when extending MCP behavior.

## Validate and hand off

Run with `CI=true`:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
```

Fix failures before marking work complete. Update `README.md` and `docs/implementation-plan.md` with exact results, migrations, external acceptance gaps, and honest limitations. Commit only when authorized; keep milestone checkpoints independently recoverable.
