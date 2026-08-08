# Development workflow

## Milestones and baseline

Implement milestones in order. Before a new milestone, inspect the current implementation plan, Git status, committed migrations, and recent relevant tests. Run the existing six validation gates; fix regressions before expanding scope.

Do not mark an external account/device acceptance step as passed from a local surrogate. Record the precise gap while completing independent repository work.

## Additive SQLite migrations

Committed migrations are:

- `0000_milestone_one.sql`
- `0001_milestone_two.sql`
- `0002_milestone_three.sql`
- `0003_milestone_four.sql`
- `0004_milestone_five.sql`
- `0005_milestone_six.sql`
- `0006_milestone_seven.sql`

For a schema change:

1. Update `packages/database/src/schema.ts`.
2. Generate the next additive migration with `corepack pnpm db:generate` or author it deliberately when required by SQLite compatibility.
3. Inspect the SQL and Drizzle journal; never renumber or edit an applied migration casually.
4. Add an upgrade regression from prior committed state when backfill, constraints, or data preservation is material.
5. Run `corepack pnpm db:migrate` against disposable data and the full test suite.

## Change checklist

1. Add or update shared input/output contracts.
2. Implement business behavior in core with stable domain errors.
3. Add thin REST/MCP adapters only where required.
4. Add core tests for success, rejection, rollback, immutability, and restart persistence.
5. Add Playwright coverage for material UI workflows using deterministic fixture PNGs.
6. Run format, lint, typecheck, tests, E2E, and build with `CI=true`.
7. Update architecture/workflow docs when ownership or gates change and record exact counts/results in `docs/implementation-plan.md`.
