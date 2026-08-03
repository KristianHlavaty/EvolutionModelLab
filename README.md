# Evolution Model Lab

Evolution Model Lab is a local-first workspace for AI-assisted creature design. It stores creature briefs, deterministic ChatGPT prompts, imported concept candidates, durable selection state, and recoverable history without calling an image-generation API.

Milestone 2 is the current release. It extends the real concept workflow with ordered feedback, immutable refinement rounds, prompt history, two-candidate visual comparison, and confirmed contact-sheet splitting. ChatGPT remains a manual handoff: the application builds and saves prompts but does not call an image-generation API.

> Screenshot placeholder: screenshots will be captured after the visual-review workflow stabilizes.

## Repository and local data

The repository must remain at:

```text
C:\Users\krist\Desktop\coding\EvolutionModelLab
```

There is no nested repository folder. Runtime state remains inside this repository:

- SQLite database: `data/evolution-model-lab.db`
- Creature originals, contact-sheet originals, derived crops, thumbnails, prompts, and manifests: `workspace/creatures/`
- Future game-ready packages: `exports/`

These runtime files are ignored by Git. Imported originals are never modified or overwritten; generated thumbnails are stored separately.

## Prerequisites

- Windows 10 or 11
- Node.js 22 or newer (Node.js 24 is supported)
- Corepack, included with the installed Node.js distribution

Docker, an OpenAI API key, and a paid image-generation API are not required.

## Exact Windows setup

Open PowerShell in the repository:

```powershell
Set-Location 'C:\Users\krist\Desktop\coding\EvolutionModelLab'
corepack enable
pnpm install
pnpm dev
```

If `corepack enable` needs administrator permission, every command can be run without changing the system installation:

```powershell
corepack pnpm install
corepack pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The single `pnpm dev` command starts the Vite interface and localhost REST server together. Both services bind to `127.0.0.1` by default.

## Concept and refinement workflow

1. Choose **New creature** and create `Dunkleosteus`.
2. Enter a generation brief and create **Concept Round 1**.
3. Copy the saved prompt into a normal ChatGPT conversation.
4. Generate or obtain the concept PNGs in ChatGPT. Evolution Model Lab does not fake this step.
5. Return to the round and import 1–10 PNGs by picker, drag-and-drop, or clipboard paste.
6. Compare any two candidates independently of parent selection, then select one numbered parent.
7. Record ordered preserve/anatomy/palette/silhouette guidance, defects, requested changes, forbidden changes, and general notes.
8. Save the feedback and create a refinement round. The selected parent, feedback snapshot, constraints, prompt, and context are frozen into the new round.
9. Attach the parent image in ChatGPT and use the saved refinement prompt to request ten refinements.
10. Import separate PNGs, or choose a contact-sheet layout, configure margins/gaps, inspect every calculated crop, and explicitly confirm the cells to create.
11. Use **Prompt history** to review or copy every prior concept/refinement prompt and its feedback snapshot.
12. Reloading or restarting preserves candidates, selection, feedback, prompts, contact-sheet provenance, and round history in SQLite.

## Commands

```powershell
pnpm dev              # web + REST server
pnpm dev:web          # Vite only
pnpm dev:server       # Express only
pnpm format           # apply Prettier
pnpm format:check     # verify formatting
pnpm lint             # ESLint
pnpm typecheck        # strict TypeScript checks
pnpm test             # Vitest unit/integration tests
pnpm test:e2e         # Playwright concept + refinement vertical slice
pnpm build            # production compile/build check
pnpm db:migrate       # apply committed Drizzle migrations
pnpm db:generate      # generate a migration after an intentional schema change
```

Use `corepack pnpm` instead of `pnpm` if Corepack shims are not enabled.

## MCP and ChatGPT connection

The MCP adapter is intentionally scheduled for Milestone 8. `pnpm dev:mcp` and `pnpm inspect:mcp` currently exit with a clear message instead of pretending a server exists. Manual picker, drag-and-drop, and clipboard imports are already available and will remain permanent fallbacks.

When MCP is implemented, it will use the same `packages/core` application service as REST, the then-current official TypeScript MCP SDK, and the recommended Streamable HTTP transport. See [docs/chatgpt-setup.md](docs/chatgpt-setup.md) and [docs/mcp-tools.md](docs/mcp-tools.md).

## Troubleshooting

- **`pnpm` is not recognized:** run the same command as `corepack pnpm <command>`, or run `corepack enable` from an elevated terminal.
- **PowerShell blocks `npm.ps1`:** use `pnpm`/`corepack pnpm`; the project does not require invoking the PowerShell npm shim.
- **Port already in use:** set `SERVER_PORT` or `WEB_PORT` in a local `.env` copied from `.env.example`.
- **Database is locked:** stop duplicate development-server processes and restart `pnpm dev`. SQLite uses WAL mode and a write timeout.
- **PNG rejected:** the server checks actual PNG bytes, decoding, size, and dimensions rather than trusting the filename or browser MIME declaration.
- **Playwright browser missing:** run `pnpm exec playwright install chromium`, then rerun `pnpm test:e2e`.

## Current limitations

Design locking/manifests, evolution, references, animation, exports, MCP, and plugin skills remain intentionally pending later milestones. Contact-sheet import supports PNG grids with explicit rows, columns, outer margins, and horizontal/vertical gaps; it does not guess irregular cell boundaries. Comparison is scoped to two candidates in the open round. See [docs/implementation-plan.md](docs/implementation-plan.md) for the exact status.
