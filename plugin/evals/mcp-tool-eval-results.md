# MCP tool evaluation results

- Evaluation set: `mcp-tool-evals.json`, version 1
- Local verification date: 2026-08-08
- Live ChatGPT workspace run: **not executed**

## Automated local evidence

| Area                   | Evidence                                                                                                                              | Result |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Discovery and metadata | Official v2 TypeScript MCP client negotiates Streamable HTTP and inspects all 17 tools, schemas, annotations, and server instructions | Passed |
| Read/write behavior    | Client calls creature creation, listing, context, current round, and prompt operations through the thin MCP adapter                   | Passed |
| Structured errors      | Workflow and not-found failures retain `isError`, stable error codes, and readable structured output                                  | Passed |
| Real HTTP transport    | Official client reaches the hardened Express `/mcp` endpoint on localhost                                                             | Passed |
| Confirmation boundary  | Core and adapter tests reject omitted/false confirmation for consequential actions                                                    | Passed |
| Tool inventory         | Fixture validation allows only the 17 registered tool names in expected call sequences                                                | Passed |
| Manual image fallback  | Production web build imports real PNG bytes by picker/contact sheet, drag/drop, and clipboard, then persists them after reload        | Passed |
| Unsupported import     | Discovery asserts that no fictional candidate/frame import tool is registered                                                         | Passed |

## Live ChatGPT run status

The current browser session could inspect only the signed-out public ChatGPT Plugins page. It did not have an authenticated eligible workspace, an associated Secure MCP Tunnel ID, or a runtime key. Consequently, the prompts have not been executed by ChatGPT against this private server, and this file does not claim that a development connection succeeded.

To complete the external acceptance run, follow `docs/chatgpt-setup.md`, execute every case in a fresh ChatGPT conversation where its preconditions can be satisfied, and append a table with:

- case ID and timestamp;
- ChatGPT plan/workspace and client surface;
- tools called in order;
- non-secret arguments;
- confirmation UI observed;
- result or structured error;
- pass/fail and notes.

Do not record runtime keys, tokens, absolute filesystem paths, image bytes, or private conversation content.
