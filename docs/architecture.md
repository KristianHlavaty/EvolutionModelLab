# Architecture

## Module boundaries

Evolution Model Lab is a pnpm TypeScript monorepo with strict module ownership:

- `apps/web` owns browser rendering, routing, drag/drop, file selection, clipboard events, structured feedback and manifest editing, comparison controls, contact-sheet preview, confirmation dialogs, history presentation, and user-facing errors.
- `apps/server` owns localhost HTTP transport, multipart parsing, Zod boundary validation, and HTTP error mapping.
- `packages/core` owns creature, round, manifest, lock/unlock, history, candidate-protection, filesystem orchestration, and service-level rules.
- `packages/database` owns the Drizzle schema, committed SQLite migrations, connection pragmas, and database lifecycle.
- `packages/prompt-builder` owns deterministic prompt text.
- `packages/image-processing` owns content-based PNG validation, SHA-256 hashing, image metadata, deterministic crop geometry, derived crops, and thumbnails.
- `apps/mcp-server` is reserved for the Milestone 8 adapter and will call `packages/core`; it must not reimplement rules.
- `packages/sprite-exporter` is reserved for Milestone 7.

## Data flow through Milestone 3

### REST flow

The React page submits a Zod-shaped request or multipart file set to Express. Express validates identifiers and basic payload shape, then calls a core service method. Core validates workflow state and persistence invariants, writes the database/filesystem, appends history, and returns stable IDs. Express maps known service errors to structured JSON.

### Database ownership

SQLite is authoritative for searchable state. `packages/database/drizzle/0000_milestone_one.sql` creates creature projects, generation rounds, candidates, candidate feedback, history events, and project settings. `0001_milestone_two.sql` additively introduces frozen feedback snapshots, contact-sheet imports, and per-candidate crop provenance. `0002_milestone_three.sql` additively introduces the current Design Manifest, immutable manifest versions, design-lock records, richer history ownership fields, and indexes for current/versioned lookups. Existing project settings are backfilled into version-zero manifest drafts without treating untouched defaults as explicit owner approval.

The default database is `data/evolution-model-lab.db`. WAL mode, foreign keys, a busy timeout, and committed migrations are applied on startup.

### Filesystem ownership

Core alone derives destination paths. It resolves every path against repository/workspace roots, uses generated UUID filenames, and stores repository-relative paths in SQLite. Browser filenames are retained only as sanitized metadata.

Separate candidate PNG originals are written exclusively to `candidates/`; separately encoded thumbnails go to `thumbnails/`. Contact-sheet originals are written once to `source-contact-sheets/`, while confirmed crop PNGs are derived into `candidates/` and retain their rectangle metadata in SQLite. `prompt.txt` and `generation-context.json` are immutable round artifacts. Creature `manifest.json` mirrors the active editable manifest; numbered `history/manifests/manifest-vNNN.json` snapshots are immutable. The active authoritative PNG is copied to `references/locked-design.png`; superseded active copies move into new, exclusive `history/locked-designs/locked-design-vNNN.png` files.

### Prompt-building flow

Core retrieves stored creature fields and passes a typed value object to `packages/prompt-builder`. The builder emits deterministic text. Core persists the exact prompt in both SQLite and `prompt.txt`, so the UI and later MCP reads refer to the same revision.

For refinement, core requires one selected candidate in the current round, reads its structured feedback, freezes a complete snapshot, and passes identity, parent, feedback, and production constraints to the prompt builder. The new round points back to the parent candidate; earlier prompt/context files and candidate rows remain unchanged.

### Contact-sheet flow

The server accepts one real PNG and explicit grid geometry. Core validates and hashes the bytes, preserves the source once, calculates row-major rectangles, and returns a visual preview. The user may revise geometry against the same preserved original. Only a separate confirmation call crops explicitly selected cells, imports those derived PNGs through the normal candidate validation path, stores crop provenance, and appends history.

### Filesystem/database failure handling

For imports, all bytes are validated and hashed in memory first. Generated filenames are written with exclusive-create semantics. SQLite changes occur in a transaction. If the transaction fails, only files created during that operation are removed. Existing originals are never cleanup targets.

### Manifest and design-lock flow

The web editor sends a complete typed manifest draft to REST. Core validates list uniqueness and order, canvas bounds, anchor placement, facing, and the explicit-field provenance set before updating SQLite and the active `manifest.json`. If a locked design exists and the draft meaningfully changes, core requires a separate acknowledgement and freezes the next version rather than altering the version used by the lock.

Lock requests contain confirmation acknowledgements, not trusted candidate metadata. Core reloads the selected current-round candidate, verifies creature ownership and protected state, resolves its path against the configured workspace, revalidates PNG bytes and SHA-256, stages the active copy and manifest snapshot exclusively, and then commits the lock plus history transaction. On failure, only files created by that attempt are removed. Unlocking preserves all filesystem artifacts and history while clearing the active relationship. A relock first archives the previous active copy and marks its lock record superseded, then installs the new verified copy.

REST exposes only transport-shaped manifest, lock, unlock, history, media, and protected delete/reject endpoints. All workflow decisions remain in `packages/core`, so a later MCP adapter can reuse exactly the same gates.

## Future flows

### MCP flow

The future Streamable HTTP `/mcp` adapter will validate tool schemas at the transport boundary and call the same core methods as REST. Read/write/destructive annotations and confirmation gates will live in the adapter; workflow authorization remains in core.

### Export flow

The future generic exporter will read approved state from core, read guarded source paths, generate versioned packages under `exports/`, and append history only after successful completion. It will never silently replace an export.
