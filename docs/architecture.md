# Architecture

## Module boundaries

Evolution Model Lab is a pnpm TypeScript monorepo with strict module ownership:

- `apps/web` owns browser rendering, routing, drag/drop, file selection, clipboard events, and user-facing errors.
- `apps/server` owns localhost HTTP transport, multipart parsing, Zod boundary validation, and HTTP error mapping.
- `packages/core` owns creature and round workflows, history records, candidate invariants, filesystem orchestration, and service-level errors.
- `packages/database` owns the Drizzle schema, committed SQLite migrations, connection pragmas, and database lifecycle.
- `packages/prompt-builder` owns deterministic prompt text.
- `packages/image-processing` owns content-based PNG validation, SHA-256 hashing, image metadata, and derived thumbnails.
- `apps/mcp-server` is reserved for the Milestone 8 adapter and will call `packages/core`; it must not reimplement rules.
- `packages/sprite-exporter` is reserved for Milestone 7.

## Milestone 1 data flow

### REST flow

The React page submits a Zod-shaped request or multipart file set to Express. Express validates identifiers and basic payload shape, then calls a core service method. Core validates workflow state and persistence invariants, writes the database/filesystem, appends history, and returns stable IDs. Express maps known service errors to structured JSON.

### Database ownership

SQLite is authoritative for searchable state. `packages/database/drizzle/0000_milestone_one.sql` creates creature projects, generation rounds, candidates, candidate feedback, history events, and project settings. Partial unique indexes enforce one selected candidate, one candidate number, and one exact file hash per active round.

The default database is `data/evolution-model-lab.db`. WAL mode, foreign keys, a busy timeout, and committed migrations are applied on startup.

### Filesystem ownership

Core alone derives destination paths. It resolves every path against repository/workspace roots, uses generated UUID filenames, and stores repository-relative paths in SQLite. Browser filenames are retained only as sanitized metadata.

Original PNG bytes are written exclusively to `candidates/`; separately encoded thumbnails go to `thumbnails/`. `prompt.txt` and `generation-context.json` are immutable round artifacts. Creature `manifest.json` is the initial filesystem identity record.

### Prompt-building flow

Core retrieves stored creature fields and passes a typed value object to `packages/prompt-builder`. The builder emits deterministic text. Core persists the exact prompt in both SQLite and `prompt.txt`, so the UI and later MCP reads refer to the same revision.

### Filesystem/database failure handling

For imports, all bytes are validated and hashed in memory first. Generated filenames are written with exclusive-create semantics. SQLite changes occur in a transaction. If the transaction fails, only files created during that operation are removed. Existing originals are never cleanup targets.

## Future flows

### MCP flow

The future Streamable HTTP `/mcp` adapter will validate tool schemas at the transport boundary and call the same core methods as REST. Read/write/destructive annotations and confirmation gates will live in the adapter; workflow authorization remains in core.

### Export flow

The future generic exporter will read approved state from core, read guarded source paths, generate versioned packages under `exports/`, and append history only after successful completion. It will never silently replace an export.
