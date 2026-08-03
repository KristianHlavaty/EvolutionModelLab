# Architecture

## Module boundaries

Evolution Model Lab is a pnpm TypeScript monorepo with strict module ownership:

- `apps/web` owns browser rendering, routing, drag/drop, file selection, clipboard events, structured feedback editing, comparison controls, contact-sheet preview, and user-facing errors.
- `apps/server` owns localhost HTTP transport, multipart parsing, Zod boundary validation, and HTTP error mapping.
- `packages/core` owns creature and round workflows, history records, candidate invariants, filesystem orchestration, and service-level errors.
- `packages/database` owns the Drizzle schema, committed SQLite migrations, connection pragmas, and database lifecycle.
- `packages/prompt-builder` owns deterministic prompt text.
- `packages/image-processing` owns content-based PNG validation, SHA-256 hashing, image metadata, deterministic crop geometry, derived crops, and thumbnails.
- `apps/mcp-server` is reserved for the Milestone 8 adapter and will call `packages/core`; it must not reimplement rules.
- `packages/sprite-exporter` is reserved for Milestone 7.

## Milestone 2 data flow

### REST flow

The React page submits a Zod-shaped request or multipart file set to Express. Express validates identifiers and basic payload shape, then calls a core service method. Core validates workflow state and persistence invariants, writes the database/filesystem, appends history, and returns stable IDs. Express maps known service errors to structured JSON.

### Database ownership

SQLite is authoritative for searchable state. `packages/database/drizzle/0000_milestone_one.sql` creates creature projects, generation rounds, candidates, candidate feedback, history events, and project settings. `0001_milestone_two.sql` additively introduces frozen feedback snapshots, contact-sheet imports, and per-candidate crop provenance without replacing existing rows. Partial unique indexes enforce one selected candidate, one candidate number, and one exact file hash per active round.

The default database is `data/evolution-model-lab.db`. WAL mode, foreign keys, a busy timeout, and committed migrations are applied on startup.

### Filesystem ownership

Core alone derives destination paths. It resolves every path against repository/workspace roots, uses generated UUID filenames, and stores repository-relative paths in SQLite. Browser filenames are retained only as sanitized metadata.

Separate candidate PNG originals are written exclusively to `candidates/`; separately encoded thumbnails go to `thumbnails/`. Contact-sheet originals are written once to `source-contact-sheets/`, while confirmed crop PNGs are derived into `candidates/` and retain their rectangle metadata in SQLite. `prompt.txt` and `generation-context.json` are immutable round artifacts. Creature `manifest.json` is the initial filesystem identity record.

### Prompt-building flow

Core retrieves stored creature fields and passes a typed value object to `packages/prompt-builder`. The builder emits deterministic text. Core persists the exact prompt in both SQLite and `prompt.txt`, so the UI and later MCP reads refer to the same revision.

For refinement, core requires one selected candidate in the current round, reads its structured feedback, freezes a complete snapshot, and passes identity, parent, feedback, and production constraints to the prompt builder. The new round points back to the parent candidate; earlier prompt/context files and candidate rows remain unchanged.

### Contact-sheet flow

The server accepts one real PNG and explicit grid geometry. Core validates and hashes the bytes, preserves the source once, calculates row-major rectangles, and returns a visual preview. The user may revise geometry against the same preserved original. Only a separate confirmation call crops explicitly selected cells, imports those derived PNGs through the normal candidate validation path, stores crop provenance, and appends history.

### Filesystem/database failure handling

For imports, all bytes are validated and hashed in memory first. Generated filenames are written with exclusive-create semantics. SQLite changes occur in a transaction. If the transaction fails, only files created during that operation are removed. Existing originals are never cleanup targets.

## Future flows

### MCP flow

The future Streamable HTTP `/mcp` adapter will validate tool schemas at the transport boundary and call the same core methods as REST. Read/write/destructive annotations and confirmation gates will live in the adapter; workflow authorization remains in core.

### Export flow

The future generic exporter will read approved state from core, read guarded source paths, generate versioned packages under `exports/`, and append history only after successful completion. It will never silently replace an export.
