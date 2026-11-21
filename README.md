# SpaceBoard

[Open the live app](https://spaceboard-nihal.app.space) · [Submission writeup and review guide](SUBMISSION.md)

SpaceBoard is a shared brainstorming board built with DeepSpace, React, Hono, and Cloudflare Workers. Create a board, add Markdown sticky notes, and share the link with collaborators. Notes and their positions persist. Collaborators can see live edits and each other's cursors.

## Run locally

Use Node 22.15+, 24, or 26 and npm 11.6 or newer.

```sh
npm ci
npx deepspace auth login
npx deepspace auth whoami
npm run dev
```

This checkout already contains the deployed app ID. Keep it when collaborating on this app. To deliberately create an independent fork, run `npx deepspace app init --new-id` before deploying. Open [localhost:5173](http://localhost:5173) and sign in to SpaceBoard.

```sh
npm run type-check
npm run test:unit
npm run test:runtime
npm run build
```

Press `Ctrl+K` or `Cmd+K` in the workspace to find a recent board or jump to creating or joining one.

## Share and summarize

Everyone who signs in and has the board link can edit its notes. Share the URL only with people who should be able to edit. Open a board in two browser sessions signed in as different users to check live edits, movement, and cursors. Drag a note by its handle or move a focused handle with the arrow keys.

Use `npx deepspace deploy` to publish the app and provision its Anthropic sandbox identity. The summary sends a bounded snapshot of the board's notes to the sandbox, bills the signed-in caller, and displays themes and possible next steps. The result stays in the open board session. Recent boards are saved in the current browser per signed-in account.

## How it works

- **DeepSpace Auth** handles sign-in. The Worker verifies the caller before accessing board data.
- **Durable Objects** keep each board and its notes in a dedicated RecordRoom. Authenticated user IDs control attribution. The validated API writes records, and RecordRoom subscriptions distribute changes. A separate PresenceRoom carries transient cursor positions.
- **Anthropic sandbox** summarizes board notes using DeepSpace's provider integration. It requires the identity token that DeepSpace supplies to a deployed app.

The foundation comes from the DeepSpace [0.44.2 starter](https://github.com/deepdotspace/deepspace/tree/fc50d2e0ad0211bd69e68ca011bbdcb5efba871e/packages/create-deepspace/templates). Its [Apache 2.0 license](licenses/DeepSpace-Apache-2.0.txt) is included.

## Scope and tradeoffs

Board links are edit capabilities for signed-in users. There are no invitations, per-board roles, view-only links, uploads, or custom profiles. Keep links private when a board contains private ideas.

Notes use field updates with last-write-wins behavior. Live cursors are transient, and a note's final position persists on release. This is a small brainstorming canvas, with 120 notes per board and 2,000 characters per note; it does not implement document-style character merging or an infinite canvas. AI summaries use a bounded snapshot and show how many notes were included. Summaries are suggestions and remain in the current board session.

## Review the code

- `src/schemas/board-schema.ts` defines board and note validation and layout bounds.
- `src/server/board-room.ts` and `board-routes.ts` handle authenticated, validated writes and bounded AI requests.
- `src/server/realtime-routes.ts` gates room connections.
- `src/components/BoardCanvas.tsx`, `StickyCard.tsx`, and `NoteComposer.tsx` implement the interactive board.
- `scripts/check-board-runtime.mjs` exercises the built Worker and real local Durable Objects with two independently signed test identities. Its provider fixture verifies that a tool-only sandbox response is followed by a final summary request. It makes no paid AI calls.

