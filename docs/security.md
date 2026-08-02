# Security

## Local binding

Vite and Express bind to `127.0.0.1` by default. Milestone 1 has no public endpoint, authentication system, generic file browser, command execution, or tunnel.

## Path validation

All application destinations are created by core from generated identifiers and known directory segments. Resolved paths must remain beneath the repository or workspace root. Absolute stored paths and traversal outside an allowed root are rejected. Database paths remain relative wherever practical.

## Upload validation

- Multer keeps incoming bytes in memory and imposes per-file/count limits.
- The server does not trust filenames, extensions, browser MIME declarations, or imported metadata.
- PNG signature and Sharp decoding must both succeed.
- File byte size and decoded dimensions are checked against configuration.
- Original filenames are basename-only metadata with control characters removed.
- UUIDs determine every destination filename.
- Uploaded content is never executed.
- SHA-256 detects exact duplicates before files are written.
- Derived thumbnails are stored separately; originals are never modified.

## MCP write risks

MCP is not exposed in Milestone 1. The later adapter must bind locally by default, use narrow domain tools, validate all inputs with explicit Zod schemas, and require confirmation for consequential actions. It must not expose shell access or unrestricted filesystem operations. A temporary secure HTTPS tunnel must be treated as public exposure and removed when testing ends.

Tokens, tunnel credentials, API keys, and secrets must not enter Git, prompts, manifests, logs, or tool descriptions.
