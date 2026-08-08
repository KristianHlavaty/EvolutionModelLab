# ChatGPT image-handoff capability spike

- Tested ChatGPT client: **ChatGPT web, public signed-out Plugins view**
- Tested date: **2026-08-08**
- Local fallback client: **Playwright Chromium against the production web build**

## Question

Can a freshly generated ChatGPT image or a user-uploaded ChatGPT attachment be passed directly into an ordinary Evolution Model Lab MCP tool using a current documented file/resource input?

## Procedure and evidence

1. Reviewed the current official OpenAI plugin connection, MCP server, metadata, security, and Secure MCP Tunnel documentation.
2. Reviewed the current official MCP TypeScript SDK tool input/result types used by the server.
3. Inspected the current public ChatGPT Plugins page in the web client. The available browser session was signed out, so authenticated Developer Mode controls and a live custom connection were not available.
4. Searched the current official documentation for a ChatGPT-generated-image or attachment handoff field for ordinary MCP tool calls.
5. Kept the server inventory free of `import_candidate_images` and `import_animation_frames`, because no supported interoperable input contract was established.
6. Exercised the local picker/contact-sheet flow and actual browser drag/drop and paste events with decoded PNG bytes, then reloaded to verify persistence.

## Observed behavior

No current official source reviewed for this milestone established that a freshly generated ChatGPT image is delivered to an arbitrary MCP tool as file bytes, a stable resource, or an authorized fetch URL. The signed-out client could not be connected to the private server, so no authenticated runtime metadata was available to contradict that finding.

The following direct-handoff details therefore remain **unobserved**:

- file bytes or a resource handle;
- filename and MIME metadata;
- authorization or consent signal;
- lifetime and fetch semantics for any client-provided URL;
- differences between generated images and user-uploaded attachments.

Direct ChatGPT image handoff is not supported or claimed by this release. The MCP server does not accept local paths, invented base64 fields, or undocumented URLs.

## Verified fallback behavior

- The file picker imports one to ten real PNG originals.
- Contact-sheet import preserves the original, previews explicit crop geometry, and creates separate derived candidates only after confirmation.
- Drag-and-drop dispatches real PNG bytes through the same validated candidate import service.
- Clipboard paste dispatches image bytes with source `CLIPBOARD` through that service.
- Imported candidates survive page reload and application restart through SQLite and guarded relative filesystem paths.
- Animation frames retain equivalent picker, drop, and clipboard controls.

All fallback inputs share byte limits, PNG signature/decoding checks, dimension limits, generated destination names, hash duplicate detection, and original-file immutability.

## Live follow-up procedure

When an authenticated eligible ChatGPT workspace and Secure MCP Tunnel credentials are available:

1. Connect the server using `docs/chatgpt-setup.md`.
2. Generate a fresh image in ChatGPT.
3. Ask ChatGPT to save it to the current round without suggesting a transfer mechanism.
4. Record the discovered tool, complete non-secret argument shape, confirmation UI, and tool result.
5. Repeat with a user-uploaded attachment.
6. Add an import tool only if the current official client exposes a documented, bounded file/resource contract that can be validated without trusting arbitrary local paths or URLs.
7. Retain all manual fallbacks even if the direct path succeeds.

## Decision

Keep image import as a narrow core service behind the local REST upload route. MCP can add another thin adapter later without changing validation, persistence, or history rules. Until the live follow-up proves otherwise, return user-openable local routes and instruct the user to choose, drag, or paste the generated PNG.
