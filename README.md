# SpaceBoard

SpaceBoard is a shared brainstorming board built with DeepSpace, React, Hono, and Cloudflare Workers. Create a board, add Markdown sticky notes, and share the link with collaborators. Notes and their positions persist. Collaborators can see live edits and each other's cursors.

## Run locally

Use Node 22.15+, 24, or 26 and npm 11.6 or newer.

```sh
npm ci
npx deepspace auth login
npx deepspace auth whoami
npx deepspace app init
npm run dev
```

Run `app init` once when `wrangler.toml` contains `__APP_ID__`. Commit the generated app ID so collaborators use the same DeepSpace app. Open [localhost:5173](http://localhost:5173) and sign in to SpaceBoard.

```sh
npm run type-check
npm run test:unit
npm run build
```

## Share and summarize

Everyone who signs in and has the board link can edit its notes. Share the URL only with people who should be able to edit. Open a board in two browser sessions signed in as different users to check live edits, movement, and cursors. Drag a note by its handle or move a focused handle with the arrow keys.

Use `npx deepspace deploy` to publish the app and provision its Anthropic sandbox identity. The summary sends a bounded snapshot of the board's notes to the sandbox, bills the signed-in caller, and displays themes and possible next steps. The result stays in the open board session. Recent boards are saved in the current browser per signed-in account.

## How it works

- **DeepSpace Auth** handles sign-in. The Worker verifies the caller before accessing board data.
- **Durable Objects** keep each board and its notes in a dedicated RecordRoom. Authenticated user IDs control attribution. The validated API writes records, and RecordRoom subscriptions distribute changes. A separate PresenceRoom carries transient cursor positions.
- **Anthropic sandbox** summarizes board notes using DeepSpace's provider integration. It requires the identity token that DeepSpace supplies to a deployed app.

The foundation comes from the DeepSpace [0.44.2 starter](https://github.com/deepdotspace/deepspace/tree/fc50d2e0ad0211bd69e68ca011bbdcb5efba871e/packages/create-deepspace/templates). Its [Apache 2.0 license](licenses/DeepSpace-Apache-2.0.txt) is included.
