# ChatGPT image handoff capability spike

- Tested ChatGPT client: **Not yet tested**
- Tested date: **Not yet tested**
- Milestone owner: Milestone 9

## Planned procedure

1. Verify the current official MCP and Apps SDK file/resource input mechanisms.
2. Connect the local development MCP server through the supported Developer Mode flow.
3. Generate a fresh image in ChatGPT.
4. Attempt to call the documented candidate import tool with only officially exposed file/resource fields.
5. Record metadata actually supplied by the client, bytes received, filename/MIME behavior, success/failure, and any consent step.
6. Repeat with a user-uploaded attachment and compare behavior.

## Observed behavior

No direct generated-image handoff has been exercised, so support is not claimed. No undocumented transfer fields have been designed.

## Fallback behavior already available

- Drag-and-drop PNGs into the Candidate Gallery.
- Choose one to ten PNGs through the file picker.
- Paste image bytes from the browser clipboard.

These fallbacks remain required even if a later direct MCP handoff succeeds.

## Unresolved limitations

- Whether freshly generated ChatGPT images are exposed as tool-callable files/resources.
- Which file metadata and authorization signals the current client supplies.
- Whether supported behavior differs between ChatGPT surfaces or subscription types.
