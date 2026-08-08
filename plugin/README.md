# Evolution Model Lab ChatGPT development package

This directory contains the private-development material for connecting ChatGPT to Evolution Model Lab. It is not a public marketplace submission and contains no secret, tunnel credential, or claim of direct generated-image transfer.

## Milestone 9 contents

- `../docs/chatgpt-setup.md`: local MCP verification, Secure MCP Tunnel setup, current Developer Mode connection flow, cleanup, and troubleshooting.
- `evals/mcp-tool-evals.json`: versioned prompts and assertions for discovery, read-first behavior, stable-ID reuse, writes, workflow gates, confirmation, errors, and the unsupported file-handoff request.
- `evals/mcp-tool-eval-results.md`: reproducible local evidence and the explicit live-account acceptance gap.
- `../docs/image-handoff-spike.md`: direct-file capability finding and verified manual fallbacks.

The local server exposes 17 narrow tools and no import tool. Use the returned Model Lab route to import real PNGs through picker, drag/drop, clipboard, or contact-sheet confirmation.

## Milestone 10 contents

- `../.agents/skills/evolution-model-lab/SKILL.md`: repository Codex workflow with architecture/path and development/migration references.
- `skills/creature-generation/SKILL.md`: ChatGPT creature workflow skill with read-first state, persisted-prompt use, manual file fallback, and explicit gates.
- `skills/creature-generation/references/`: focused concept, refinement, evolution, canonical-reference, animation, targeted-repair, and quality rules.
- `evals/creature-generation-skill-evals.json`: behavior cases for all workflows, confirmation language, and unsupported direct file handoff.

Both skills include valid frontmatter and `agents/openai.yaml` discovery metadata. The project test suite validates their structure, reference links, UI metadata, and eval tool names.

An embedded ChatGPT component is deliberately not included. It is optional, the 17 tools already return current status and local routes, and candidate/reference/animation visual review belongs in the complete local Model Lab interface. Add a small status/next-action component only if a connected client later demonstrates a concrete need; never reproduce the gallery or Animation Lab inside ChatGPT.
