# ChatGPT setup

Milestone 1 uses ordinary ChatGPT conversations plus manual local import. There is no development MCP connection to add yet.

## Working setup now

1. Start Evolution Model Lab with `pnpm dev`.
2. Create a creature and Concept Round 1.
3. Copy the prompt from Model Lab.
4. Open an ordinary ChatGPT conversation using the user's existing subscription.
5. Paste the prompt and obtain the image results.
6. Save, drag, choose, or paste the actual PNG results into Model Lab.

No OpenAI API key or paid API image generation is used.

## Planned Developer Mode setup

After Milestone 8 implements and tests Streamable HTTP MCP:

1. Start the web, REST, and MCP services using their documented scripts.
2. Inspect `/mcp` using the then-current official MCP inspection tool.
3. For remote client testing only, expose the narrow MCP endpoint through a supported secure tunnel or a user-configured temporary HTTPS development tunnel.
4. Use the current ChatGPT Developer Mode interface to add the development MCP connection.
5. Review the discovered tools and annotations before enabling writes.
6. Start a new chat with the development connection enabled and run read-first evaluation prompts.
7. Refresh or recreate the connection after tool schemas or metadata change.
8. Stop the tunnel when testing finishes.

ChatGPT interface labels change over time. At implementation time, this document must be refreshed from current official documentation and the current Developer Mode interface rather than relying on obsolete menu names.

Never expose an unauthenticated MCP endpoint as a permanent public service and never commit tunnel credentials or tokens.
