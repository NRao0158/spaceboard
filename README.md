# SpaceBoard

SpaceBoard is a shared brainstorming canvas built with DeepSpace, Vite, React, Hono, and Cloudflare Workers. This branch contains the schema and read-only canvas scaffold.

## Review locally

Use Node 22.15+, 24, or 26 and npm 11.6 or newer.

```sh
npm install
npx deepspace auth login
npx deepspace auth whoami
npm run dev
```

The first dev start registers the app under the account shown by `auth whoami`. Open [localhost:5173/board-preview](http://localhost:5173/board-preview) for the empty canvas. The preview uses fixture data and is available in dev. The controls are placeholders.

From a second terminal, run `npm run type-check` and `npm run build`. Keep the dev server running so Vite can generate the route types before the type check.

## Schema

| Entity | SpaceBoard fields | Storage |
| --- | --- | --- |
| Users | Auth ID, display name | SDK-managed users schema and roster |
| Boards | Title | One `boards` record keyed `board` per board scope |
| Notes | Markdown source, color, x/y canvas position | `notes` collection in the same board scope |

The SDK's record envelope stores the record ID, original author, and creation and update timestamps. The board ID in a share link maps to the `board:<uuid>` RecordRoom scope. Planned access is shared editing for any signed-in user with an existing board's link.

The planned integrations are DeepSpace Auth, real-time records and presence via Durable Objects, and the Anthropic sandbox for a temporary summary and themes panel.

## Starter

The foundation comes from the DeepSpace [0.44.2 starter](https://github.com/deepdotspace/deepspace/tree/fc50d2e0ad0211bd69e68ca011bbdcb5efba871e/packages/create-deepspace/templates). Its [Apache 2.0 license](licenses/DeepSpace-Apache-2.0.txt) is included.
