# 🪙 Orbit • iOS

The native **iOS** app, built entirely in SwiftUI against the iOS 26 "Liquid Glass" design language: translucent, blurred materials floating over ambient colour glows on a pure-black base.

## Highlights

- **Budget ring** • left to spend, spent, days left, and a per-day allowance that recomputes as the month runs down.
- **Per-category limits** • a tinted tile, a progress bar, and an over-budget state that turns everything red.
- **Month stepper** • walk back through previous months; every figure recomputes.
- **Compared with usual** • the current month shows, per category, a badge with the change from its usual spending at the same day of the last six months, once it strays by 15% and €10 or more.
- **History ledger** • day groups with day totals, each operation at the time it happened (latest first, read in the time zone the phone is in now), a search field, and filter chips for each category.
- **Multi-currency** • pick the entry currency; the euro equivalent recomputes live and is stored with the operation, so past entries keep the rate they were logged at. Every rate carries the 1% a bank adds on top of the reference rate, so the euro figure matches the statement rather than the mid-market quote.
- **English & French** • the language follows the device, or the one picked in Settings, and switches on the spot. Amounts and dates follow it too: `€1,234.50` in English, `1 234,50 €` in French.
- **Analysis** • what each of the last twelve months spent, in all or per category, against its budget and the average, with Swift Charts; the recurring operations, managed there: each one's frequency, next occurrence and cost over a year, in a card of fixed height whose list scrolls, and a sheet to add, change, pause or delete one; and the habits of the last 90 days: each weekday's average, the share paid online, the places most spent at. Worked out on the phone, from the budget it holds, but the recurring operations, which the server keeps and logs.
- **Trash** • a deleted operation leaves the budget but stays in the server's trash, listed under **Settings ▸ Trash**, until it is restored.
- **Connected apps** • the apps authorized with the passkey on the portal, such as Claude through its MCP connector, listed under **Settings ▸ Connected apps** with when each was authorized and last used; revoking one cuts its access at once.
- **Sign in & sync** • one account, opened with the passkey of the Orbit portal, behind Face ID; every change is pushed to the server and restored on a fresh device. Offline changes stay local and reconcile when the connection returns, and edits made in the web interface merge in rather than being overwritten.

## Screens

**Sign in** → **Budget · History · Analysis · Settings**. A **＋** in the Budget and History headers presents the *New operation* sheet. Navigation uses the native iOS 26 Liquid Glass tab bar, which minimizes as you scroll.

## Tech

Swift · SwiftUI · Observation · URLSession, in a single target (`Orbit`) with no third-party dependencies.

## Architecture

```
Orbit/
├─ Application/    App entry, root shell (auth gate + native TabView)
├─ Core/
│  ├─ Errors/      UserFacingError: the failures written for the person, and the generic message for any other
│  ├─ Budget/      Derived selectors (month summary, category spend, day groups) and the analysis (comparison with usual, trends, habits)
│  ├─ Formatting/  Euro, amount, rate and date formatting, in the interface's language
│  ├─ Models/      Domain types (Category, Operation, BudgetSettings)
│  ├─ Localization/ Interface language (automatic, English, French) and lookups in it
│  ├─ Money/       Currencies and euro exchange rates
│  ├─ Networking/  APIClient (bearer + refresh-on-401), Keychain token store
│  ├─ Preferences/ Last-used currency, haptics, language
│  ├─ Session/     ApplicationSession: auth state + pull/push sync; PortalConnection: sign-in through the portal (PKCE)
│  ├─ Storage/     LocalStore (JSON snapshot), BudgetDocument, sync base & merge, debug seed
│  └─ Theme/       Design tokens, haptics
├─ Features/       One folder per screen (Identity, Budget, History, Analysis, Operations, Settings)
└─ UIComponents/   Liquid glass surfaces, buttons, progress, tiles
```

### Languages

Every string lives in `Orbit/Localizable.xcstrings`, with English as the source and a French translation. The language can change while the app runs, which the main bundle can't follow, so the root sets the chosen locale in the environment (`Text("…")` resolves in it), and strings built outside a view go through `String(appLocalized:)`, which looks them up in that locale. Category names stay in English in the synced document and are translated by id when shown, so the app and the web never fight over them.

State lives in `@Observable` objects injected through the environment: `LocalStore` (data, persisted to Application Support as JSON), `ExchangeRates` (currencies), `Preferences` (UserDefaults), and `ApplicationSession` (auth + sync). Views read them directly and derive everything else through `BudgetMath`, with no view models.

### Sync model

The local JSON store is the working copy; the server holds the durable one, and the app is not its only writer: the web interface writes to it too. The app keeps the last document both sides agreed on, and its revision, as a *base* (`sync-base.json`).

- Every mutation debounces a sync; when the local document still matches the base, there is nothing to send.
- A sync, and the **reconcile** run on launch, on sign-in and each time the app becomes active, pulls the server's document, merges it with the local one against the base (`DocumentMerge`), applies the result, then sends the server only the entries it lacks (`DocumentDiff`), one write each: an operation created, changed or moved to the trash, a category, the monthly budget, a frozen month. No write can replace the whole budget. Each side's edits are kept; only when both changed the same entry does the device win, and an edit always beats a deletion: an operation edited here but deleted elsewhere is restored from the server's trash.
- Every write can be sent again safely, so a sync cut off halfway simply picks up where it stopped.
- Without a base (a first sign-in, or a server that was reset), the server wins, unless it is empty, in which case the device's budget seeds it.

A failed push flips the Settings badge to **Offline**, and the next reconcile catches up. Access tokens refresh automatically on a `401`; when the refresh token is gone, the app returns to the sign-in screen.

The app talks to a fixed HTTPS endpoint, `https://my-orbit-api.mael-bertocchi.fr` (`ApplicationSession.serverURL`). To develop against a local server, change that constant.

## Local Development

1. Open the project in Xcode

```bash
open Orbit.xcodeproj
```

2. Build the application

```bash
xcodebuild -project Orbit.xcodeproj -scheme Orbit -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

> Note: To run the simulator, go to Xcode and press the run button.

## Keeping It Installed On A Device

The project signs with a free personal Apple team, so each provisioning profile lasts **seven days**. When one lapses, iOS refuses to launch the app (*"Orbit" Is No Longer Available*, greyed-out icon) and also drops the developer trust, which only a tap on the phone can restore.

`Scripts/refresh-device-install.sh` rebuilds, re-signs and reinstalls over the network. The iPhone only needs to be paired for wireless debugging and on the same Wi-Fi, with no cable. Run it once a week, before the profile runs out, and the trust stays intact:

```bash
./Scripts/refresh-device-install.sh
```

| Flag | Effect |
| --- | --- |
| `--status` | Report the days left on the profile and exit |
| `--no-launch` | Install without launching the app |
| `--device <udid>` | Target a specific device instead of the paired iPhone |

It builds `Release` into `build/device`; set `ORBIT_CONFIGURATION=Debug` to match what Xcode's Run button installs.

If the profile has already expired, the reinstall works but the launch is refused: restore the trust under **Settings ▸ General ▸ VPN & Device Management** on the phone, then run the script again.

## Signing in

The only way in is the owner's **passkey**, which belongs to the Orbit portal's site (`my-orbit.mael-bertocchi.fr`). An app can only use a site's passkeys with the *Associated Domains* capability, which a free developer team doesn't get, so the app signs in **through the portal**, the way an app offers "Sign in with Apple":

1. **Sign in with a passkey** opens the portal's `/connect` page in an ephemeral browser sheet (`ASWebAuthenticationSession`), with a fresh PKCE challenge (`PortalConnection`).
2. The page asks for the passkey (Face ID); the backend checks it and hands back a one-time code, bound to that challenge, through the `my-orbit://` scheme.
3. The app trades the code, with the PKCE verifier only it knows, for its tokens (`POST /v1/identity/connect/token`).

Closing the sheet simply cancels. The app needs the backend at `https://my-orbit-api.mael-bertocchi.fr` and the portal at `https://my-orbit.mael-bertocchi.fr` (`ApplicationSession.portalURL`).

## Running Demonstration

The shared scheme launches with `-demo` **enabled**, so pressing Run seeds the sample month from the design handoff and skips sign-in entirely (no backend needed). Demo mode only exists in Debug builds and never touches the network.

To reach the real sign-in screen, edit the scheme (**Product ▸ Scheme ▸ Edit Scheme… ▸ Run ▸ Arguments**) and untick `-demo`.

| Flag | Effect |
| --- | --- |
| `-demo` | Seeds the sample month and skips sign-in (on by default) |
| `-demo-empty` | Skips sign-in with an empty store (use alone, not with `-demo`) |
| `-tab budget\|history\|analysis\|settings` | Opens directly on a given tab |
| `-open add` | Opens straight into the New operation sheet |

Example: `-demo -tab history` launches on the History tab with data.
