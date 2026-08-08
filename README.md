# Evolution Model Lab

Evolution Model Lab is a local-first workspace for AI-assisted creature design. It manages deterministic generation prompts, imported concept candidates, controlled refinement, evolutionary lineage, canonical references, animation review and repair, validation, and versioned game-ready exports.

Image generation happens in ordinary ChatGPT conversations. The application does not call a paid image-generation API and never pretends that an image was generated, imported, approved, or exported when the corresponding operation did not succeed.

## What it supports

- Persistent creature projects, immutable generation rounds, and structured candidate feedback.
- Numbered PNG candidate galleries, comparison, contact-sheet splitting, and one selected parent per round.
- Versioned Design Manifests with explicit lock, unlock, and locked-reference history.
- Single-parent evolutionary descendants with ordered mutations and ancestry comparison.
- Canonical-reference prompts, imports, review, and configurable approval gates.
- Animation key poses, intermediate frames, playback, onion skinning, overlays, targeted repair, and approval.
- Mechanical image validation and immutable generic sprite-package exports.
- A localhost Streamable HTTP MCP server whose 17 tools reuse the same core workflow rules as the web application.

## Quick start

Requirements:

- Node.js 22 or newer.
- Corepack, included with standard Node.js distributions.

Docker and an OpenAI API key are not required. Development and automated browser coverage are tested on Windows.

From the repository root:

```powershell
corepack pnpm install
corepack pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The development command starts the web interface, REST server, and MCP server together. All services bind to `127.0.0.1` by default.

If Corepack shims are already enabled, `pnpm install` and `pnpm dev` are equivalent. Copy `.env.example` to `.env` only when you need to change ports, storage locations, or upload limits.

## Local data

Runtime state stays inside the checkout by default:

- SQLite database: `data/evolution-model-lab.db`
- Creature originals and derived workspace artifacts: `workspace/creatures/`
- Immutable export packages: `exports/<creature-slug>/export-vNNN/`

These runtime paths are ignored by Git. SQLite stores guarded relative paths, imported originals are never modified or overwritten, and derived thumbnails, crops, sprite sheets, repairs, and exports are stored separately.

## Typical workflow

1. Create a creature and its first concept round.
2. Copy the saved prompt into ChatGPT, generate real PNG concepts, and import them by picker, drag/drop, clipboard, or confirmed contact sheet.
3. Compare candidates, select one parent, save structured feedback, and create immutable refinement rounds until the design is ready.
4. Complete the Design Manifest and explicitly lock the selected design.
5. Create descendants from locked ancestors or build and approve the required canonical references one view at a time.
6. Create an animation after its reference gate passes, review key poses before intermediates, and repair individual frames without discarding history.
7. Review validation evidence and explicitly create the next immutable generic export version.

See [docs/workflow.md](docs/workflow.md) for the complete state machine and enforced gates.

## Commands

| Command                             | Purpose                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                          | Start web, REST, and MCP development services              |
| `pnpm dev:web`                      | Start only the Vite web interface                          |
| `pnpm dev:server`                   | Start only the REST server                                 |
| `pnpm dev:mcp`                      | Start only the Streamable HTTP MCP server                  |
| `pnpm inspect:mcp`                  | Inspect `http://127.0.0.1:3002/mcp` with the MCP Inspector |
| `pnpm format` / `pnpm format:check` | Apply or verify Prettier formatting                        |
| `pnpm lint`                         | Run ESLint                                                 |
| `pnpm typecheck`                    | Run strict TypeScript checks                               |
| `pnpm test`                         | Run Vitest unit and integration tests                      |
| `pnpm test:e2e`                     | Run production-backed Playwright workflows                 |
| `pnpm build`                        | Compile packages and create production builds              |
| `pnpm db:migrate`                   | Apply committed SQLite migrations                          |
| `pnpm db:generate`                  | Generate a migration after an intentional schema change    |

Prefix a command with `corepack` if pnpm shims are not enabled, for example `corepack pnpm test`.

## MCP and ChatGPT

The MCP endpoint is `http://127.0.0.1:3002/mcp`; its health check is `http://127.0.0.1:3002/health`. MCP and REST are thin adapters over the same `packages/core` application services.

ChatGPT cannot connect directly to localhost. Private Developer Mode testing requires the documented Secure MCP Tunnel flow and an eligible authenticated ChatGPT workspace. See [docs/chatgpt-setup.md](docs/chatgpt-setup.md) for connection, evaluation, cleanup, and troubleshooting instructions.

The MCP server deliberately exposes no fictional image-import tool. Direct ChatGPT-generated file handoff has not been established for this connection, so the supported boundary remains the local picker, drag/drop, clipboard, and contact-sheet workflow. Details are recorded in [docs/image-handoff-spike.md](docs/image-handoff-spike.md).

## Development resources

- [docs/architecture.md](docs/architecture.md): module and persistence boundaries.
- [docs/mcp-tools.md](docs/mcp-tools.md): MCP inventory, annotations, results, and errors.
- [docs/security.md](docs/security.md): local binding, path/upload protection, tunnelling, and confirmation risks.
- [docs/implementation-plan.md](docs/implementation-plan.md): completed milestones, validation evidence, technical decisions, and known limitations.
- [.agents/skills/evolution-model-lab/SKILL.md](.agents/skills/evolution-model-lab/SKILL.md): repository development skill.
- [plugin/skills/creature-generation/SKILL.md](plugin/skills/creature-generation/SKILL.md): connected creature-workflow skill.

## Troubleshooting

- **`pnpm` is not recognized:** run the command as `corepack pnpm <command>` or enable Corepack shims.
- **PowerShell blocks `npm.ps1`:** use pnpm through Corepack; npm is not required for project commands.
- **A port is already in use:** stop the conflicting process or override `SERVER_PORT`, `WEB_PORT`, or `MCP_PORT` in `.env`.
- **The database is locked:** stop duplicate local server processes and restart the development command. SQLite uses WAL mode and a write timeout.
- **A PNG is rejected:** the server validates actual PNG bytes, decoded dimensions, size, and duplicate hashes rather than trusting the extension or MIME declaration.
- **Playwright Chromium is missing:** run `pnpm exec playwright install chromium`, then rerun `pnpm test:e2e`.

## Current limitations

- Live ChatGPT Developer Mode and creature-skill evaluation still require the user's eligible workspace and Secure MCP Tunnel credentials.
- The localhost MCP endpoint is unauthenticated and must not be exposed as a permanent public service.
- Direct ChatGPT-generated image-file transfer is not claimed.
- The exporter currently provides a generic sprite package rather than engine-specific import metadata.
- Image/reference/animation checks provide mechanical evidence, not semantic anatomy or identity recognition; visual approval remains human-controlled.
- Evolution currently models one approved parent per descendant.
- Candidate, reference, and animation imports currently accept PNG files.

See [docs/implementation-plan.md](docs/implementation-plan.md) for the full limitation list and exact validation status.
