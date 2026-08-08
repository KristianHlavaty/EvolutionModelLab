# ChatGPT setup

Milestone 8 provides and locally verifies the Streamable HTTP MCP server. Milestone 9 owns current ChatGPT Developer Mode connection instructions, secure temporary remote exposure, live ChatGPT evaluation, and the image-handoff capability spike. Until that work is completed, the supported production workflow remains ordinary ChatGPT conversations plus manual local PNG import.

## Local MCP verification now

1. Open PowerShell at `C:\Users\krist\Desktop\coding\EvolutionModelLab`.
2. Run `pnpm dev` for the web, REST, and MCP services together, or `pnpm dev:mcp` for MCP alone.
3. Confirm `http://127.0.0.1:3002/health` returns an `ok` response.
4. Run `pnpm inspect:mcp` and connect the official MCP Inspector to `http://127.0.0.1:3002/mcp`.
5. Review the 17 discovered tools, schemas, annotations, and server instructions.
6. Call `list_creatures`, then `get_creature_context` for a chosen stable creature ID.
7. Exercise writes only against disposable local data. Consequential tools still require explicit `confirmation=true`.

The automated integration suite also negotiates the current protocol through the official v2 TypeScript client and calls both an in-process Streamable HTTP handler and the real localhost Express endpoint.

## Supported image workflow

1. Copy a persisted generation/reference/animation prompt from the local app or `get_generation_prompt`.
2. Use the prompt and required approved image attachments in an ordinary ChatGPT conversation.
3. Return to the tool's `appRoute` in Evolution Model Lab.
4. Import actual PNG results using the picker, drag-and-drop, or clipboard.
5. Review, select, repair, or approve them through the persisted local workflow.

The MCP server does not claim direct generated-file transfer and registers no fictional import parameters. No OpenAI API key or paid image-generation API is used.

## Milestone 9 boundary

Do not expose `127.0.0.1:3002/mcp` as a permanent public unauthenticated endpoint. Milestone 9 will refresh this guide from current official OpenAI documentation, select a supported temporary HTTPS tunnel for development testing, document the current Developer Mode controls, evaluate read/write/confirmation behavior in ChatGPT, and stop/remove temporary exposure afterward.
