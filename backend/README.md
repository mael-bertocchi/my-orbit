# ⚙️ Orbit • Backend

The **Fastify + TypeScript** server behind the Orbit portal: it opens the single account with a passkey and keeps the data of every app (the budget and the watchlist), backed by PostgreSQL.

## Features

- **REST API** • versioned under `/v1`, split into focused modules: the portal's own (identity, health) and one folder per app under `modules/<app>/`, served under `/v1/<app>`. In the database too, every model and table starts with its app (`BudgetOperation` in `budget_operations`; `Identity…` for the portal's own), so apps never fight over a name.
- **Passkey-only identity** • the single account opens with a passkey (WebAuthn), nothing else: no password, no code, no user table, no registration. The first passkey is created with an enrollment token you set only for that; the iOS app signs in through the portal with a one-time code bound to a PKCE challenge. JWT access + refresh sessions.
- **Entry-by-entry writes** • clients read the whole budget document at once (`GET /v1/budget/state`) and write it one entry at a time: an operation, a category, the settings, a frozen month. No route can replace or wipe the whole budget. Each write bumps a revision, so a client can tell whether anything changed since it last read.
- **A trash for operations** • a deleted operation is kept with the moment it was deleted, out of the budget, and can be restored.
- **Watchlist** • films and series to watch, being watched (`startedAt`) or watched (`watchedAt`, with a rating in half stars and a comment) (`/v1/watchlist/entries`). What a title is comes from TMDB, which the server asks itself so its token never leaves it (`/v1/watchlist/catalog`): search, details with where to watch it in France (JustWatch data), sagas and genres, kept in memory for a while. A title and its saga's name are stored in English and in French, so the list reads right in either language.
- **MCP server** • Claude, or any MCP client, reads and changes the budget and the watchlist through `/mcp` (Streamable HTTP), with tools named after their app. The client is let in with OAuth 2.1: it registers itself, the owner authorizes it on the portal with the passkey, and it gets the same tokens as the apps.
- **Hardened** • Helmet, CORS open to the portal's origin only, rate limiting, Zod request validation, and a non-root Docker image.

## Stack

Node 24 · Fastify 5 · TypeScript · Prisma 7 · PostgreSQL · Zod · SimpleWebAuthn · TMDB

## API

| Method & path | Access | Purpose |
| --- | --- | --- |
| `POST /v1/identity/login/options` | public | A challenge for one of the owner's passkeys to sign |
| `POST /v1/identity/login` | public | Exchange the passkey's signed `{ response }` for an access/refresh token pair |
| `POST /v1/identity/connect` | public | For the portal's connect page: exchange a signed `{ response }` and the app's PKCE `{ challenge }` for a one-time `code` |
| `POST /v1/identity/connect/token` | public | For the app: exchange the `{ code, verifier }` for a token pair, once |
| `GET /v1/identity/enrollment` | public | Whether an enrollment token is set (`{ open }`) |
| `POST /v1/identity/enrollment/options` | token | A challenge to create a passkey, for whoever holds the enrollment `{ token }` |
| `POST /v1/identity/enrollment` | token | Store that passkey and sign in with it |
| `GET /v1/identity/passkeys` | access | List the owner's passkeys |
| `POST /v1/identity/passkeys/options` | access | A challenge to create another passkey |
| `POST /v1/identity/passkeys` | access | Store another passkey |
| `DELETE /v1/identity/passkeys/:id` | access | Forget a passkey; `409` for the last one |
| `POST /v1/identity/refresh` | public | Rotate a refresh token into a new pair |
| `POST /v1/identity/logout` | access | Revoke the caller's refresh session |
| `GET /v1/identity/me` | access | Return the signed-in account and the owner's name |
| `GET /v1/budget/state` | access | Read the whole budget document (trash left out) and its `revision` |
| `POST /v1/budget/operations` | access | Log an operation under the id the client minted; `409` if the id is taken, even in the trash |
| `PATCH /v1/budget/operations/:operationId` | access | Change some fields of an operation; `404` if it is unknown or in the trash |
| `DELETE /v1/budget/operations/:operationId` | access | Move an operation to the trash; already there is a success |
| `GET /v1/budget/operations/trash` | access | List the operations in the trash, the most recently deleted first |
| `POST /v1/budget/operations/:operationId/restore` | access | Take an operation out of the trash |
| `PUT /v1/budget/categories/:categoryId` | access | Create or replace a category (look, limit, position) |
| `DELETE /v1/budget/categories/:categoryId` | access | Remove a category |
| `PUT /v1/budget/settings` | access | Store the monthly budget |
| `PUT /v1/budget/history/:month` | access | Freeze the budget of a finished month (`YYYY-MM`) |
| `DELETE /v1/budget/history/:month` | access | Forget the budget frozen against a month |
| `GET /v1/budget/rates` | access | The latest euro reference rates |
| `GET /v1/budget/rates/:date` | access | The reference rates of one past day |
| `GET /v1/watchlist/entries` | access | Every title on the watchlist |
| `POST /v1/watchlist/entries` | access | Add a `{ mediaType, tmdbId }`, described by the catalog; `409` if it is already there |
| `PATCH /v1/watchlist/entries/:id` | access | Start it (`startedAt`), mark it watched (`watchedAt`), rate it (`rating`, 1 to 10 half stars), comment on it |
| `DELETE /v1/watchlist/entries/:id` | access | Take a title off the watchlist |
| `GET /v1/watchlist/catalog/search?query=` | access | Find films and series in the catalog |
| `GET /v1/watchlist/catalog/titles/:mediaType/:tmdbId` | access | A title's details, and where to watch it in France |
| `GET /v1/watchlist/catalog/collections/:id` | access | A saga's films, in the order they came out |
| `GET /v1/watchlist/catalog/genres` | access | Every genre of films and series |
| `GET /v1/health` | public | Liveness and database connectivity |
| `POST /mcp` | access | The MCP endpoint: one JSON-RPC message, answered as JSON; `401` with `WWW-Authenticate` pointing to the metadata without a token |
| `GET /.well-known/oauth-protected-resource/mcp` | public | Which server authorizes access to `/mcp` (RFC 9728) |
| `GET /.well-known/oauth-authorization-server` | public | Where to register, authorize and get tokens (RFC 8414) |
| `POST /oauth/register` | public | Register an MCP client and its redirect URIs (RFC 7591): HTTPS, or HTTP on the loopback address |
| `POST /oauth/token` | public | Trade a code and its PKCE verifier, or a refresh token, for tokens, in OAuth's shape |
| `GET /v1/oauth/client?clientId=&redirectUri=` | public | For the portal's authorization page: the client's name and the host it waits on |
| `POST /v1/oauth/authorize` | public | For that page: exchange the passkey's signed `{ response }` for the address to send the client back to, with its code |
| `GET /v1/oauth/connections` | access | The MCP clients the owner authorized and that still hold their access, with when they were authorized and last used |
| `DELETE /v1/oauth/connections/:id` | access | Revoke a client's access: its refresh token and its access token stop working at once |

Every response is wrapped in `{ "data": … }`; errors are `{ "message": …, "data": … }`. The catalog routes write in `?language=en` or `fr` (French by default).

## Getting Started

**Prerequisites:** Node 24 and a PostgreSQL database.

1. Install dependencies

```bash
npm install
```

2. Configure your environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, set the portal's origin in `IDENTITY_ORIGIN` (passkeys are bound to its host name) and your name in `IDENTITY_OWNER_NAME`, set a long random `JWT_SECRET` (≥ 32 chars), and list the portal's origin in `CORS_ORIGIN` too (comma-separated if there are several; leave it empty to allow no browser origin at all, since the iOS app doesn't need it). To create your first passkey, also set `IDENTITY_ENROLLMENT_TOKEN`, and for the watchlist's catalog, `WATCHLIST_TMDB_TOKEN` (both below). Locally, the portal runs at `http://localhost:5173`, which passkeys accept as a secure origin.

3. Apply the database migrations

```bash
npm run db:migrate
```

4. Start the server

```bash
npm run dev
```

The API is live; verify it with `GET /v1/health`.

## Identity

There is one account, and the only way in is a **passkey**: kept in your password manager, unlocked with Face ID or Touch ID, impossible to phish because it only signs for the portal's own site.

```bash
IDENTITY_ORIGIN="https://obole.mael-bertocchi.fr"
IDENTITY_OWNER_NAME="Maël"
```

Every passkey is bound to the host of `IDENTITY_ORIGIN`, and the server only accepts answers signed there, with the device's own check passed (user verification). Each challenge it hands out is single-use and lapses after five minutes. A signed answer gets a short-lived access token plus a long-lived refresh token whose session is persisted, so logout and rotation are real.

**The first passkey.** Generate a long random token and set it, then redeploy:

```bash
IDENTITY_ENROLLMENT_TOKEN="$(openssl rand -base64 32)"
```

While it is set, the portal's sign-in page offers **Set up a passkey**: paste the token, create the passkey, and you are signed in. Then **remove the variable** and redeploy: enrollment closes, and new passkeys are only added from the account settings, signed in. If you ever lose every passkey, set a new token the same way.

**The iOS app** can't use the portal's passkeys directly (that takes the Associated Domains capability, out of reach of a free developer team), so it signs in through the portal: it opens `/connect` in a browser sheet with a PKCE challenge, the page signs in with the passkey and gets a one-time code bound to that challenge (`POST /v1/identity/connect`), and the app trades it with its verifier (`POST /v1/identity/connect/token`). A code lives two minutes, works once, and is useless without the verifier.

The last passkey can't be removed, so the account can't be locked by mistake.

## Watchlist catalog

The watchlist reads films and series from [TMDB](https://www.themoviedb.org), free for a personal, non-commercial project. Create an account there, ask for an API key in its settings (*API*), and copy the **API Read Access Token** (the long one) into:

```bash
WATCHLIST_TMDB_TOKEN="eyJ…"
```

Without it, the watchlist still lists its titles, but searching and opening one answer `503`. Where to watch a title comes from JustWatch through TMDB, for France only. As both ask, the portal credits TMDB at the bottom of the watchlist and JustWatch under the offers.

## MCP

`/mcp` offers Orbit to Claude and other MCP clients. In Claude, add a custom connector with the URL `https://<api host>/mcp`: Claude registers itself, sends you to the portal's `/authorize` page to confirm with your passkey, then calls the tools as you.

- **Read** • `budget_list_categories`, `budget_search_operations`, `budget_month_summary`, `watchlist_search`, and `watchlist_title_details`, which reads a title's synopsis, genres and streaming services from TMDB.
- **Write** • `budget_create_operation` (priced at its day's rate with the bank's markup, as the apps price it, and dated at noon UTC on its day), `budget_update_operation`, `budget_delete_operation` (to the trash), `watchlist_rate_title` and `watchlist_add_title`. Each is marked as writing, and the delete as destructive, so the client asks before running them.

The server keeps no MCP session: each message is answered on its own. Client ids are signed with `JWT_SECRET` rather than stored, so they survive restarts; changing the secret signs every client out. The tokens are the apps' own (`JWT_ACCESS_EXPIRY`, refreshed with `JWT_REFRESH_EXPIRY`), but they name the client's connection, which keeps its id across every rotation: the portal's and the app's settings list the connections, and revoking one cuts the client off at once, since `/mcp` checks its connection on every message and marks it as used. Outside `localhost`, the addresses the metadata gives are always HTTPS.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Start with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Deploy migrations, then run |
| `npm test` | Run the Vitest suite |
| `npm run lint` | Lint with ESLint |
| `npm run db:migrate` | Create & apply a dev migration |
| `npm run db:deploy` | Apply migrations (production) |

## Docker

A multi-stage, non-root image lives at `.docker/Dockerfile`:

```bash
docker build -f .docker/Dockerfile -t my-orbit-backend .
```
