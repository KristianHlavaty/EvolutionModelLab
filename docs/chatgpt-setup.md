# ChatGPT Developer Mode setup

Evolution Model Lab exposes a local Streamable HTTP MCP endpoint at `http://127.0.0.1:3002/mcp`. ChatGPT cannot connect directly to a localhost server. For private development, use OpenAI's Secure MCP Tunnel or a deliberately configured public HTTPS endpoint with appropriate authentication.

The current OpenAI product calls these integrations **plugins** or **custom apps**; some older UI and documentation uses **connectors**. Developer Mode availability and administrator controls depend on the ChatGPT plan and workspace. Follow the labels shown in the current ChatGPT interface when they differ from this guide.

Official references:

- [Connect from ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Developer Mode and full MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt)
- [MCP server concepts](https://developers.openai.com/plugins/concepts/mcp-server)
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy)

## 1. Verify the application locally

Open PowerShell in `C:\Users\krist\Desktop\coding\EvolutionModelLab`:

```powershell
pnpm dev
```

This starts the web app, REST server, and MCP server. Alternatively, use `pnpm dev:mcp` for MCP alone.

1. Open `http://127.0.0.1:5173` and confirm the local application loads.
2. Open `http://127.0.0.1:3002/health` and confirm it reports `ok`.
3. Run `pnpm inspect:mcp`.
4. Connect the MCP Inspector to `http://127.0.0.1:3002/mcp`.
5. Review the 17 tools, descriptions, input/output schemas, annotations, and server instructions.
6. Call `list_creatures`, then `get_creature_context` with a returned stable ID.
7. Use only disposable local data when exercising writes. Consequential tools require `confirmation=true`.

After a tool schema, description, annotation, or server-instruction change, rerun local checks and refresh or recreate the ChatGPT connection so its discovered metadata is current.

## 2. Preferred private connection: Secure MCP Tunnel

Secure MCP Tunnel is outbound-only: the tunnel client connects the private local MCP server to OpenAI without opening public ingress to the computer. It is intended for private development connections, not public plugin distribution.

Prerequisites:

- an eligible ChatGPT workspace with Developer Mode enabled;
- permission to create/use a Platform tunnel and associate it with the intended ChatGPT workspace;
- a tunnel runtime API key stored only in the environment;
- the current `tunnel-client` downloaded from the OpenAI Platform tunnel page or current official release.

Create a tunnel in the OpenAI Platform tunnel settings, associate the target ChatGPT workspace, then initialize a local profile. Use placeholders locally; never paste a real key into this repository, a prompt, logs, or screenshots.

```powershell
$env:OPENAI_API_KEY = '<runtime-key>'
tunnel-client init --profile evolution-model-lab --tunnel-id tunnel_... --mcp-server-url http://127.0.0.1:3002/mcp
tunnel-client doctor --profile evolution-model-lab --explain
tunnel-client run --profile evolution-model-lab
```

Keep both Evolution Model Lab and `tunnel-client run` active during testing. The tunnel client's local admin UI and diagnostics can be used to inspect readiness without exposing the Model Lab workspace itself.

## 3. Add the development connection in ChatGPT

The exact navigation can vary by plan and workspace policy. Current official documentation describes enabling Developer Mode in ChatGPT settings, then creating a custom plugin/app from the Plugins area.

1. Sign in to the intended ChatGPT web workspace.
2. Enable Developer Mode in the current settings interface. If the control is absent, ask the workspace administrator to verify plan access, workspace policy, and your role.
3. Open the ChatGPT **Plugins** area and choose the add/create control.
4. Choose **Tunnel** as the connection type, then select or enter the associated tunnel ID.
5. Review all 17 discovered tools before saving the development connection.
6. Start a new chat and enable the development plugin/app.
7. Run the prompts in `plugin/evals/mcp-tool-evals.json` and record results in `plugin/evals/mcp-tool-eval-results.md`.
8. Refresh or recreate the connection after MCP metadata changes.

Writes may show ChatGPT confirmation UI in addition to the server's explicit `confirmation` parameter. Treat the server confirmation gate as authoritative and never convert tentative user language into `confirmation=true`.

## 4. Public HTTPS alternative

A user-configured HTTPS development tunnel is a public ingress path, even when the URL is obscure. Use it only if Secure MCP Tunnel is unavailable and the exposure is deliberate.

- Expose only `/mcp`; do not expose the repository, REST API, database, uploads, or filesystem.
- Add authentication supported by the current ChatGPT connection flow.
- Retain the MCP server's Host and Origin checks at the public boundary or enforce equivalent controls in the proxy.
- Use a short-lived hostname and credential, monitor calls, and stop the tunnel immediately after testing.
- Never use the unauthenticated localhost server as a permanent public service.

Public plugin distribution has separate hosting, authentication, privacy, review, and policy requirements. It is outside this local-first milestone.

## 5. Evaluation and cleanup

Evaluate in a fresh chat so cached IDs and earlier instructions do not hide discovery problems. Cover direct reads, indirect intent, stable-ID reuse, writes, workflow gates, explicit confirmation, structured errors, and the unsupported direct-image-import request. Record the tools, arguments excluding secrets, results, errors, and confirmation behavior.

When finished:

1. Stop `tunnel-client run` and the local development services.
2. Remove the development connection if it was temporary.
3. Revoke the runtime key and delete the tunnel when it is no longer needed.
4. Confirm no credential was written to `.env`, shell history, logs, prompt files, or Git.

## Verification status (2026-08-08)

- Local MCP health, discovery, protocol negotiation, tools, schemas, confirmation gates, structured errors, and real localhost HTTP transport are automated and pass.
- File picker, contact-sheet import, browser drag/drop, and clipboard-paste fallbacks are exercised with real PNG bytes in Playwright and persist after reload.
- The public signed-out ChatGPT Plugins page was inspected in the current web client. It exposes the plugin directory but not authenticated Developer Mode or connection controls.
- A live ChatGPT-to-tunnel call was not executed because this environment has no authenticated eligible ChatGPT workspace, associated `tunnel_id`, or runtime API key. No connection success is claimed. Complete sections 2–5 with the intended account to close this external acceptance step.

## Troubleshooting

- **Tunnel is not visible in ChatGPT:** verify the tunnel is associated with the same workspace, your role has tunnel use permission, Developer Mode is enabled, and the tunnel client is healthy.
- **Tools are stale:** refresh or recreate the custom plugin/app after restarting the current MCP build.
- **Origin or host rejected:** connect the tunnel client to the exact local URL above. Do not weaken host/origin validation to accept arbitrary traffic.
- **Write does not run:** inspect the structured MCP error and ensure the workflow gate passes. Use `confirmation=true` only after explicit approval of that exact action.
- **Image cannot be handed directly to a tool:** use the returned local app route and import by picker, drag/drop, or clipboard. The server intentionally exposes no fictional import tool.
