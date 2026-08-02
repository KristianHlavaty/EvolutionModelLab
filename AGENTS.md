# Evolution Model Lab contributor guide

## Scope

This repository is a local-first TypeScript monorepo. Implement milestones in order and do not represent later disabled surfaces as working features.

## Invariants

- Keep REST and future MCP handlers thin; application rules belong in `packages/core`.
- Never overwrite imported originals. Derived images belong in separate directories.
- Store relative paths in SQLite and guard every resolved filesystem path against an allowed root.
- Require one selected candidate per round and preserve immutable round history.
- Bind local services to `127.0.0.1` by default.
- Do not introduce paid image-generation API calls or fake generation actions.

## Validation

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` for a working milestone. Update `docs/implementation-plan.md` with exact results and known limitations.
