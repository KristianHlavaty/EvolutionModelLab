# Security

## Local binding and network boundary

Vite, REST, and MCP bind to `127.0.0.1` by default. The local MCP endpoint is unauthenticated because it is intended for the same machine; it must not be published as a permanent public service.

The Express MCP adapter rejects unapproved Host values and cross-origin browser requests while allowing trusted localhost clients that omit `Origin`. It exposes only `POST`, `GET`, and `DELETE` behavior required by Streamable HTTP plus a narrow `/health` check. It does not expose the repository, a shell, unrestricted files, or arbitrary network fetches.

## Tunnelling

Prefer OpenAI Secure MCP Tunnel for private Developer Mode testing. It makes an outbound connection from the local tunnel client and does not require public ingress to the computer. Keep its runtime API key in the process environment, grant only the tunnel permissions needed, and associate only the intended ChatGPT workspace.

A generic HTTPS development tunnel creates public ingress. If deliberately used, expose only the MCP route through a short-lived authenticated boundary, monitor access, and remove it immediately after the test. An obscure URL is not authentication.

Never store tunnel IDs with sensitive context, runtime keys, access tokens, or secrets in Git, prompts, manifests, tool arguments, tool results, example values, logs, or screenshots. Revoke temporary credentials after use.

## Path validation

All application destinations are created by core from generated identifiers and known directory segments. Every resolved path must remain below an explicitly allowed repository, data, workspace, or export root. Absolute stored paths and traversal outside an allowed root are rejected. SQLite stores relative application paths wherever practical.

MCP results expose stable IDs, repository-relative export package paths, and local application/media routes. They do not return absolute filesystem roots. No tool accepts a shell command, arbitrary local path, or unrestricted file-read target.

## Upload validation

- Multer keeps incoming bytes in memory and imposes per-file/count and request-body limits.
- Filenames, extensions, browser MIME declarations, MCP inputs, and imported metadata are untrusted.
- PNG signature and Sharp decoding must both succeed.
- File byte size and decoded dimensions are checked against configuration.
- Original filenames are basename-only metadata with control characters removed.
- UUIDs determine destination filenames; uploaded content is never executed.
- SHA-256 detects exact duplicates before files are written.
- Derived crops, sheets, and thumbnails are stored separately; originals are never modified.
- A failed operation cleans up only files staged by that operation.

Direct generated-image MCP transfer is not claimed. The server does not accept invented base64 payloads, user-supplied local paths, or arbitrary fetch URLs as a substitute.

## MCP write risks and confirmation

Every MCP input uses a precise Zod schema and delegates to the same core service as REST. Core owns workflow state, ownership checks, guarded paths, immutable history, and filesystem/database staging.

Locking, unlocking, canonical-reference approval, animation approval, and export require `confirmation=true` after the user explicitly approves that exact action. Tool annotations describe reads and state changes accurately, but annotations and client confirmation UI do not replace the server-side gate. Tentative statements must never be promoted to confirmation.

Selection and feedback can replace current editable state while preserving history. Creation operations are additive. Errors are structured and must be surfaced rather than converted into a success claim. The MCP client actor is recorded as `MCP_CLIENT`; this is attribution, not authentication or named-user identity.

## Operational checklist

1. Run local validation before opening any tunnel.
2. Inspect discovered tools, schemas, annotations, and instructions.
3. Use disposable test data for write evaluations.
4. Keep runtime credentials outside the repository and prompt context.
5. Review the exact target and confirmation before every consequential write.
6. Stop the tunnel, remove temporary connections, and revoke temporary credentials after testing.
