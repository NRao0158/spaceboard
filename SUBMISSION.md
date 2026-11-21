# SpaceBoard submission

## Portal fields

- Live app: https://spaceboard-nihal.app.space
- Repository: https://github.com/NRao0158/spaceboard

## Copy-ready writeup

SpaceBoard is a shared brainstorming canvas. Sign in, create a board, share its link, and work together with Markdown sticky notes, persistent note positions, and live cursors. A focused AI action turns the current notes into a summary, themes, and possible next steps.

I chose three DeepSpace integrations: Auth for identity and note attribution; RecordRoom and PresenceRoom Durable Objects for persistent data, live subscriptions, and transient cursors; and the Anthropic sandbox for bounded analysis of board notes. Provider credentials stay in the Worker.

The main scope tradeoff is link-based editing: any signed-in person with the link can edit. I deliberately left out invitations, granular permissions, uploads, and custom profiles to concentrate on the multiplayer flow. Concurrent field edits use last-write-wins behavior.

I directed the agent through schema and canvas review before authorizing implementation and visual polish. The agent wrote the implementation and tests and checked the deployed workflow. I personally reviewed the initial layout and ran the deployment commands. Automated verification is documented below separately from my own review.

## Review the important path

1. Open the live app and sign in. Create a board from the workspace.
2. Add notes with a Markdown heading, a list, and bold text.
3. Copy the board link. Open it in another browser or private window, signed in as a different user.
4. Edit a note, drag its handle, and move each pointer. Confirm changes and cursors reach the other session.
5. Reload a session. Confirm the notes and positions persist.
6. Choose **Summarize board**. Check that the summary refers to the actual notes and displays the number included.

AI uses the signed-in caller's DeepSpace credits. No separate provider key is required.

## Verification evidence

Agent-run checks:

| Check | Evidence |
| --- | --- |
| TypeScript, lint, unit tests, production build | Passed |
| Built Worker and local Durable Objects | Passed authentication guards, validation, retry-safe creation, shared editing, live subscriptions, cursor presence, persisted snapshots, and deletion |
| Sandbox regression fixture | Passed a tool-only first response followed by a separate final summary request |
| Live Anthropic sandbox | Passed a real deployed summary request, returning grounded themes and next steps with the correct included-note count |
| Deployed two-user browser check | Passed Markdown, edits, cursors, and persisted positions with real accounts and production services; network requests were relayed through the test process because direct browser networking was restricted |

Temporary test accounts and notes were removed after verification. Browser test identities and management credentials are not committed.

Applicant verification reported in the project conversation: initial layout reviewed and deployment commands run. The automated checks above were performed by the agent.

## Deliberate limits and next work

- The canvas is a fixed, scrollable 3,200 × 2,400 area. Boards allow 120 notes with 2,000 characters per note.
- Field edits use last-write-wins behavior. There is no character-level collaborative text editor or undo history.
- Cursor positions are transient. A dragged note's final position is saved on release.
- AI receives a bounded snapshot and reports omitted notes. It produces suggestions; it does not edit the board. Summary results remain in the current session.
- Recent boards are stored per signed-in account in the current browser. Keep board links for access from another device.
- If extended, I would first add conflict and reconnect coverage, then undo history and a deliberate board lifecycle. Granular permissions would be a separate scope decision.
