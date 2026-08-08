# Architecture and guarded paths

## Module ownership

- `apps/web`: rendering, routing, local interaction, visual review, and user-facing errors.
- `apps/server`: REST/HTTP parsing, multipart boundaries, Zod boundary checks, and error mapping.
- `apps/mcp-server`: Streamable HTTP MCP transport, tool metadata/schemas, safe projection, and confirmation parameters.
- `packages/core`: workflow rules, ownership checks, persistence orchestration, history, and filesystem/database failure handling.
- `packages/database`: Drizzle schema, additive SQLite migrations, connection pragmas, and lifecycle.
- `packages/shared`: shared Zod contracts and domain constants.
- `packages/prompt-builder`: deterministic prompts from stored typed context.
- `packages/image-processing`: PNG content validation, metadata, hashing, crop geometry, and derived images.
- `packages/sprite-exporter`: exporter contract and derived sprite package adapters.

REST and MCP must call the same core operation. Never copy a gate into both transports.

## Authoritative storage

- SQLite is authoritative for searchable application state.
- `workspace/creatures/<slug>/rounds/` holds immutable prompt/context artifacts, candidate originals, contact-sheet originals, crops, and thumbnails.
- `workspace/creatures/<slug>/history/` holds numbered manifest and locked-design history.
- `workspace/creatures/<slug>/references/` holds active and attempted canonical references.
- `workspace/creatures/<slug>/animations/` holds frame originals, revisions, thumbnails, prompts, and validation.
- `exports/<slug>/export-vNNN/` holds immutable versioned packages.

Treat browser filenames as sanitized metadata only. Derive destinations from generated IDs and known directory segments. Reject absolute stored paths, traversal, and any resolved path outside the explicit root. Reread and hash authoritative bytes before consequential reuse.

## Failure boundary

Validate and hash bytes before persistence. Write new files exclusively, perform the database transaction, and delete only the new attempt's staged files if the transaction fails. Never make an existing original, history artifact, active reference, or export a cleanup target.
