# Architecture

## Module boundaries

Evolution Model Lab is a pnpm TypeScript monorepo with strict module ownership:

- `apps/web` owns browser rendering, routing, drag/drop, file selection, clipboard events, structured feedback and manifest editing, candidate and lineage comparison, evolution-tree presentation, ordered mutation editing, canonical-reference requests/imports/approval confirmations, mandatory-reference settings, contact-sheet preview, history presentation, and user-facing errors.
- `apps/server` owns localhost HTTP transport, multipart parsing, Zod boundary validation, and HTTP error mapping.
- `packages/core` owns creature, round, manifest, lock/unlock, evolution lineage, mutation, canonical-reference integrity/approval gates, mandatory-rule evaluation, history, candidate-protection, filesystem orchestration, and service-level rules.
- `packages/database` owns the Drizzle schema, committed SQLite migrations, connection pragmas, and database lifecycle.
- `packages/prompt-builder` owns deterministic prompt text.
- `packages/image-processing` owns content-based PNG validation, SHA-256 hashing, image metadata, deterministic crop geometry, derived crops, and thumbnails.
- `packages/sprite-exporter` owns the format-neutral adapter contract and generic sprite-sheet export implementation.
- `apps/mcp-server` owns only Streamable HTTP transport, MCP schemas/metadata, safe result projection, and confirmation-aware tool registration. It calls `packages/core` and does not reimplement workflow rules.

## Data flow through Milestone 8

### REST flow

The React page submits a Zod-shaped request or multipart file set to Express. Express validates identifiers and basic payload shape, then calls a core service method. Core validates workflow state and persistence invariants, writes the database/filesystem, appends history, and returns stable IDs. Express maps known service errors to structured JSON.

### Database ownership

SQLite is authoritative for searchable state. `packages/database/drizzle/0000_milestone_one.sql` creates creature projects, generation rounds, candidates, candidate feedback, history events, and project settings. `0001_milestone_two.sql` additively introduces frozen feedback snapshots, contact-sheet imports, and per-candidate crop provenance. `0002_milestone_three.sql` additively introduces the current Design Manifest, immutable manifest versions, design-lock records, richer history ownership fields, and indexes for current/versioned lookups. `0003_milestone_four.sql` adds guarded lineage/source indexes and ordered `evolution_mutations` rows. `0004_milestone_five.sql` adds immutable canonical-reference requests/imports, their exact design-lock relationship, saved prompt/context paths, validation results, approval state, and reference ownership on history events. Existing project settings are backfilled into version-zero manifest drafts without treating untouched defaults as explicit owner approval.

The default database is `data/evolution-model-lab.db`. WAL mode, foreign keys, a busy timeout, and committed migrations are applied on startup.

### Filesystem ownership

Core alone derives destination paths. It resolves every path against repository/workspace roots, uses generated UUID filenames, and stores repository-relative paths in SQLite. Browser filenames are retained only as sanitized metadata.

Separate candidate PNG originals are written exclusively to `candidates/`; separately encoded thumbnails go to `thumbnails/`. Contact-sheet originals are written once to `source-contact-sheets/`, while confirmed crop PNGs are derived into `candidates/` and retain their rectangle metadata in SQLite. `prompt.txt` and `generation-context.json` are immutable round artifacts. Creature `manifest.json` mirrors the active editable manifest; numbered `history/manifests/manifest-vNNN.json` snapshots are immutable. The active authoritative PNG is copied to `references/locked-design.png`; superseded active copies move into new, exclusive `history/locked-designs/locked-design-vNNN.png` files.

### Prompt-building flow

Core retrieves stored creature fields and passes a typed value object to `packages/prompt-builder`. The builder emits deterministic text. Core persists the exact prompt in both SQLite and `prompt.txt`, so the UI and MCP reads refer to the same revision.

For refinement, core requires one selected candidate in the current round, reads its structured feedback, freezes a complete snapshot, and passes identity, parent, feedback, and production constraints to the prompt builder. The new round points back to the parent candidate; earlier prompt/context files and candidate rows remain unchanged.

### Contact-sheet flow

The server accepts one real PNG and explicit grid geometry. Core validates and hashes the bytes, preserves the source once, calculates row-major rectangles, and returns a visual preview. The user may revise geometry against the same preserved original. Only a separate confirmation call crops explicitly selected cells, imports those derived PNGs through the normal candidate validation path, stores crop provenance, and appends history.

### Filesystem/database failure handling

For imports, all bytes are validated and hashed in memory first. Generated filenames are written with exclusive-create semantics. SQLite changes occur in a transaction. If the transaction fails, only files created during that operation are removed. Existing originals are never cleanup targets.

### Manifest and design-lock flow

The web editor sends a complete typed manifest draft to REST. Core validates list uniqueness and order, canvas bounds, anchor placement, facing, and the explicit-field provenance set before updating SQLite and the active `manifest.json`. If a locked design exists and the draft meaningfully changes, core requires a separate acknowledgement and freezes the next version rather than altering the version used by the lock.

Lock requests contain confirmation acknowledgements, not trusted candidate metadata. Core reloads the selected current-round candidate, verifies creature ownership and protected state, resolves its path against the configured workspace, revalidates PNG bytes and SHA-256, stages the active copy and manifest snapshot exclusively, and then commits the lock plus history transaction. On failure, only files created by that attempt are removed. Unlocking preserves all filesystem artifacts and history while clearing the active relationship. A relock first archives the previous active copy and marks its lock record superseded, then installs the new verified copy.

REST exposes only transport-shaped manifest, lock, unlock, history, media, and protected delete/reject endpoints. All workflow decisions remain in `packages/core`, and the MCP adapter reuses exactly the same gates.

### Evolution flow

The web lineage route reads a flat, persistence-backed tree from core and groups it visually by generation without making layout authoritative. Descendant creation accepts only identity fields, a brief, and an ordered mutation list. Core reloads the proposed parent and requires one active authoritative lock whose candidate matches the project relationship. It guards and rereads the active locked-reference path, decodes the PNG, and verifies its SHA-256 before any descendant is staged.

Core derives inherited, preferred, and forbidden constraints from the approved ancestor manifest; it does not copy or invent anatomy in the child's editable manifest. A successful transaction creates the child, its parent link and generation number, one immutable `EVOLUTION` round linked to the source creature and parent candidate, ordered mutation rows, and history for both projects. The deterministic prompt and JSON context are staged under `round-001-evolution/`. A failed operation removes only the new child directory when that directory was created by the operation. Parent originals, locks, rounds, and manifest history are never modified.

Evolution candidate imports, selection, and design locking reuse the same validated candidate and lock services as concept/refinement work. Once a child is locked it may seed another generation. Tree reads, mutation reads, and comparison state are derived from persisted relationships and survive process restart.

### Canonical-reference flow

Reference creation requires an active authoritative design lock and verifies the guarded locked PNG bytes and SHA-256 before staging anything. Core reads the immutable manifest version associated with that lock, generates a one-view prompt, and writes `prompt.txt` plus `generation-context.json` under a new UUID attempt directory inside `references/<type>/`. The database row stores the exact design-lock ID, so an approval from a superseded lock never satisfies the current creature.

Each attempt accepts at most one real PNG. Core validates and hashes the bytes in memory, writes an exclusive original and separately encoded thumbnail, and records transparency/canvas checks as warnings without pretending those mechanical checks prove visual identity. The imported original is never overwritten. Approval requires a separate confirmation, rereads and decodes the guarded stored file, verifies its hash, then appends history and marks the row approved.

Project settings store an ordered unique mandatory-reference list that must include `LOCKED_DESIGN`. The default is locked design, strict side profile, silhouette, and colour/material. Core calculates satisfaction from the active lock plus approved rows tied to that same lock. `REFERENCE_APPROVED` means that mandatory set is complete; optional reference attempts do not block the workflow. Settings changes and relocks re-evaluate the gate while preserving prior attempts as stale history.

### MCP flow

The localhost Streamable HTTP `/mcp` adapter uses the stable v2 official TypeScript SDK. Each registered tool has a concrete Zod input and discriminated output schema, title, description, accurate closed-world annotations, and a thin handler that calls `EvolutionModelLabService`. Results project stable IDs, guarded relative package paths, and local application/media routes; absolute filesystem roots are never returned.

The server instructions require read-first context, one selected refinement parent, complete mandatory references before animation, explicit confirmation for consequential operations, and honest error handling. Transport confirmation fields make intent explicit, while core remains authoritative for ownership, state, file integrity, and persistence gates.

The MCP Express adapter binds to `127.0.0.1` by default and uses the SDK's host/origin protection. A modern v2 client may negotiate the 2026-07-28 protocol; the server also enables stateless legacy handling for compatible clients. No direct image-import tool is advertised because current documented tool input does not provide an interoperable ChatGPT-generated file handoff. Returned `appRoute` values lead users to the existing validated picker/drop/clipboard workflow.

### Export flow

The generic exporter reads approved state from core, rereads guarded source paths, creates a new exclusive staging/version directory under `exports/`, copies authoritative originals byte-for-byte, writes derived sheets and metadata separately, and appends history only after successful completion. It never silently replaces an export.
