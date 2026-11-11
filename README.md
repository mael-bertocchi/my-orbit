<div align="center">

# Orbit

### A personal portal for one person, on their own server.

One site, opened with a passkey, with two apps inside: a **budget** for daily spending, on the web and on the iPhone, and a **watchlist** of films and series, on the web. Claude can read and change both through an MCP connector the owner authorizes.

`Passkeys` &nbsp;•&nbsp; `Web · React` &nbsp;•&nbsp; `iOS 26 · SwiftUI` &nbsp;•&nbsp; `Fastify · PostgreSQL` &nbsp;•&nbsp; `MCP` &nbsp;•&nbsp; `English & French` &nbsp;•&nbsp; `Self-hosted`

</div>

---

## What it does

### The portal

- **One account, one passkey** • there is a single owner and no sign-up, password or code: the portal opens with a passkey (WebAuthn). The first one is created with an enrollment token set on the server for that purpose; the others are added from the account page, and the last one can't be removed.
- **Home and app switcher** • a tile per app with a glance at it, and a switcher in the bar to jump between them. Each app is loaded only once it is opened.
- **Account** • the passkeys, the apps connected through OAuth (such as Claude) with when each was authorized and last used, revoking one at once, the language, signing out.
- **English and French** • every screen follows the browser's or the device's language, or the one picked in the settings; amounts and dates are written the way that language writes them.

### The budget (web and iOS)

- **The month at a glance** • a ring with what is left to spend, the spent amount, the days left and what that leaves per day, and every category against its own limit, turning red once over it. Past months are measured against the budget frozen when they ended.
- **Compared with usual** • in the current month, a category that strays from its usual spending at the same day (by 15% and €10 or more) gets a badge with the change.
- **History** • operations grouped by day with day totals, a search, and filters by category and by date.
- **Operations** • amount in any currency, converted to euros at the reference rate of the operation's own day ([Frankfurter](https://frankfurter.dev), ECB data) plus the 1% a bank adds; category, name, note, place, online or not.
- **Recurring operations** • a rent or a subscription is kept apart, in Analysis: every 1, 3, 6 or 12 months from a first day, until an end day if any, paused or not. Each occurrence is logged on its day as a plain operation, which can then be changed on its own.
- **Analysis** • the last twelve months against their budget and the average, the recurring operations, and the habits of the last 90 days (weekdays, share paid online, places).
- **Trash** • a deleted operation goes to a trash it can be restored from.
- **Two clients, one budget** • the web page and the iOS app write the same budget entry by entry, so neither overwrites the other. The iOS app keeps working offline and merges its changes when the connection returns.

### The watchlist (web)

- **Three statuses** • every film or series is **to watch**, **watching** or **watched**.
- **To watch** • shelved by genre, by saga (in release order) or as one list, filtered by kind and searched.
- **Watching** • the titles started and not finished, latest started first.
- **Watched** • a wall of posters by year watched or by rating, filtered by year and kind, each title rated in half stars with a comment.
- **Catalog** • titles are searched and described by [TMDB](https://www.themoviedb.org), with where to watch them in France from JustWatch. The server calls TMDB itself, so its token never reaches the browser.

### Claude, through MCP

The backend serves an MCP endpoint (`/mcp`). Claude, or any MCP client, registers itself with OAuth 2.1, the owner approves it on the portal with the passkey, and it can then search and log budget operations, read a month's summary, search the watchlist, read a title's details, add a title and rate one. Write tools are marked as such, so the client asks before running them. Each connection shows in the account page and can be revoked at once.

## What's inside

| Component | What it is |
| --- | --- |
| **[Backend](backend/README.md)** | Fastify + PostgreSQL: the passkey identity, the OAuth server for MCP clients, the MCP endpoint, and the data of the budget and the watchlist |
| **[Web](web/README.md)** | The portal and its two apps, a single React build served by Caddy |
| **[iOS](ios/README.md)** | The budget on the iPhone, in SwiftUI with Liquid Glass; it signs in through the portal's passkey |

**Backend** • Node 24 · Fastify 5 · TypeScript · Prisma 7 · PostgreSQL · Zod · SimpleWebAuthn · MCP SDK
**Web** • React 19 · TypeScript · Vite · Tailwind CSS · React Router · SimpleWebAuthn · Caddy
**iOS** • Swift · SwiftUI · Observation · URLSession, with no third-party dependency

## Layout

```
├─ backend/    Fastify server, Prisma schema and migrations
├─ web/        The portal and its apps
├─ ios/        The iOS app (Xcode project Orbit.xcodeproj)
└─ .github/    Checks and deployment to Dokploy
```

Each folder's README explains how to run it locally: start with the **[backend](backend/README.md)**, then the **[web](web/README.md)**, then the **[iOS app](ios/README.md)**.

## Deployment

The backend and the web portal run on Dokploy; the iOS app is installed from Xcode and is not deployed from here.

Each push to `main` runs the workflow of the side it touches ([backend](.github/workflows/backend.yml), [web](.github/workflows/web.yml)): lint, types, tests and build, then a deployment that waits for approval in GitHub. Once approved, it asks Dokploy to deploy that application ([deploy-dokploy](.github/actions/deploy-dokploy/action.yml)) and follows it until it succeeds or fails.

To set it up, once:

1. In Dokploy, turn **Autodeploy** off on both applications, so that only the pipeline deploys, and generate an API key in your profile.
2. In GitHub, under *Settings › Environments*, create the **production** environment and add yourself as its required reviewer (leave *Prevent self-review* off). Give it:
   - the variables `DOKPLOY_URL` (the panel's address, without `/api`), `DOKPLOY_BACKEND_APPLICATION_ID` and `DOKPLOY_WEB_APPLICATION_ID` (each at the end of the application's address in Dokploy);
   - the secret `DOKPLOY_API_KEY`.

A failed deployment fails the run with Dokploy's error message; *Re-run jobs* tries again.
