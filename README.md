<p align="center">
  <img src="icon.png" alt="Copilot Quota Monitor" width="128" height="128">
</p>

<h1 align="center">Copilot Quota Monitor</h1>

<p align="center">
  <strong>Monitor GitHub Copilot premium usage across all your accounts — at a glance.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-^1.85.0-007ACC?logo=visual-studio-code&logoColor=white" alt="VS Code">
  <img src="https://img.shields.io/badge/TypeScript-5.3+-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/Version-0.0.1-blue" alt="Version">
  <img src="https://img.shields.io/badge/API-Reverse%20Engineered-ff6b6b" alt="API">
  <img src="https://img.shields.io/badge/Accounts-Multi%20Account-orange" alt="Multi Account">
  <img src="https://img.shields.io/badge/Build-Passing-22c55e" alt="Build">
</p>

---

## The Problem

VS Code allows multiple GitHub accounts to be logged in simultaneously. But the **official Copilot extension only shows premium usage for one account at a time** — whichever is set as the active account in Extension Account Preferences. Checking each account requires:

1. Open Extension Account Preferences
2. Switch the active GitHub account for Copilot
3. Click the Copilot icon in the status bar
4. Read the hover tooltip
5. Repeat for every account

This is painful when managing 2+ accounts (personal, work, organization, etc.).

**Copilot Quota Monitor** solves this by showing premium usage for **all** logged-in GitHub accounts at once — via a status bar icon and a rich webview panel.

---

## Features

| Feature | Description |
|---|---|
| 📊 **Multi-Account Dashboard** | See quota usage for every GitHub account in a single panel |
| 🔄 **Auto-Refresh** | Configurable background polling (default: every 10 minutes) |
| 📌 **Status Bar Integration** | Displays the best account's remaining percentage at all times |
| ⚡ **Per-Account Refresh** | Refresh individual accounts without touching the others |
| 🛡️ **Rate Limit Protection** | Configurable cooldowns prevent excessive API calls |
| 💾 **Data Caching** | Persists quota data across VS Code restarts via `globalState` |
| 🎨 **Theme-Aware UI** | Respects your VS Code theme (dark, light, high contrast) |
| ⚙️ **7 Configurable Settings** | Auto-refresh interval, cooldowns, stale threshold, status bar position, and more |
| 🧙 **Setup Wizard** | Step-by-step account discovery and authentication |
| 🆓 **Free Plan Detection** | Gracefully handles accounts without premium quota |

---

## How It Looks

### Status Bar
The extension adds a compact indicator to your VS Code status bar showing the best remaining percentage across all your accounts:

```
$(pulse) 72.5%        ← Healthy (>50%): default color
$(pulse) 38.1%        ← Moderate (20-50%): yellow/warning
$(pulse) 12.4%        ← Low (<20%): red/error
$(pulse) Setup Quota  ← First run: click to set up
```

### Main Panel
Click the status bar item (or run `Copilot Quota: Open Panel`) to see:

- **Account cards** with color-coded progress bars (green → yellow → red)
- **Usage stats**: requests used / total entitlement, percentage used
- **Reset dates** for each account
- **Per-account timestamps** showing when each was last fetched
- **Stale indicators** (dimmed cards) when data hasn't been refreshed recently
- **Overage badges** when usage exceeds 100%
- **Free plan cards** for accounts without premium quota

### Setup Wizard
A guided flow that discovers all GitHub accounts in VS Code, lets you authenticate each one, and configure all settings in one place.

---

## Installation

### Quick Install (Recommended)

1. **Download** the latest `.vsix` file from the [Releases](https://github.com/Ns81000/Copilot-Quota-Monitor/releases) page
2. Open VS Code
3. Press `Ctrl+Shift+P` → type **"Install from VSIX"** → select the downloaded `.vsix` file
4. Reload VS Code when prompted

**Or** install via terminal:

```bash
code --install-extension copilot-quota-monitor-0.0.1.vsix
```

### Build from Source

```bash
git clone https://github.com/Ns81000/Copilot-Quota-Monitor.git
cd Copilot-Quota-Monitor
pnpm install
pnpm run compile
pnpm exec vsce package --no-dependencies --allow-missing-repository
code --install-extension copilot-quota-monitor-0.0.1.vsix
```

---

## Configuration

All settings are available under `copilotQuota.*` in VS Code Settings, or through the **Setup Wizard** panel.

| Setting | Type | Default | Description |
|---|---|---|---|
| `copilotQuota.autoRefreshInterval` | `number` | `10` | Auto-refresh interval in minutes (minimum: 5) |
| `copilotQuota.refreshCooldown` | `number` | `60` | Per-account cooldown in seconds (minimum: 30) |
| `copilotQuota.refreshAllCooldown` | `number` | `120` | Refresh All cooldown in seconds (minimum: 60) |
| `copilotQuota.showInStatusBar` | `boolean` | `true` | Show quota percentage in the status bar |
| `copilotQuota.statusBarAlignment` | `"left" \| "right"` | `"right"` | Which side of the status bar to place the icon |
| `copilotQuota.staleThreshold` | `number` | `30` | Minutes after which a card is marked as stale |
| `copilotQuota.refreshOnStartup` | `boolean` | `true` | Auto-refresh all accounts when VS Code starts |

---

## Commands

| Command | Description |
|---|---|
| `Copilot Quota: Open Panel` | Opens the main quota dashboard |
| `Copilot Quota: Refresh All` | Refreshes quota for all accounts |
| `Copilot Quota: Refresh Account` | Refreshes a specific account |
| `Copilot Quota: Setup Accounts` | Opens the setup wizard |

---

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Status Bar  │────▶│  Extension Core  │────▶│   Webview     │
│  (statusBar) │     │  (extension.ts)  │     │  (HTML/CSS/JS)│
└──────────────┘     └──────┬───────────┘     └───────┬───────┘
                            │                         │
                    ┌───────▼────────┐        ┌───────▼───────┐
                    │   Account      │        │   postMessage │
                    │   Manager      │        │   Protocol    │
                    └───────┬────────┘        └───────────────┘
                            │
                    ┌───────▼────────┐
                    │   Quota        │
                    │   Service      │
                    └───────┬────────┘
                            │
                 ┌──────────┼──────────┐
                 │                     │
          ┌──────▼──────┐      ┌──────▼──────┐
          │ Rate Limiter │      │    Cache    │
          │ (cooldowns)  │      │ (globalState)│
          └─────────────┘      └─────────────┘
```

### File Structure

```
copilot-quota-monitor/
├── src/
│   ├── extension.ts        # Entry point — activate, commands, orchestration
│   ├── statusBar.ts        # Status bar item with dynamic alignment
│   ├── panelManager.ts     # Webview panel lifecycle & HTML generation
│   ├── accountManager.ts   # GitHub account discovery & authentication
│   ├── quotaService.ts     # API calls to GitHub's internal endpoint
│   ├── rateLimiter.ts      # Cooldown tracking & concurrent request limiting
│   ├── cache.ts            # globalState persistence layer
│   ├── types.ts            # All TypeScript interfaces & message types
│   └── webview/
│       ├── style.css       # Theme-aware CSS (600+ lines)
│       └── script.js       # Client-side JS — main view & setup view
├── icon.svg                # Source icon (SVG)
├── icon.png                # Extension marketplace icon (128×128 PNG)
├── package.json            # Extension manifest, settings, commands
├── tsconfig.json           # TypeScript configuration
└── .vscodeignore           # Package exclusion rules
```

---

## The Research: How We Found the API

GitHub does **not** publish public APIs for Copilot premium quota. The entire API surface used by this extension was reverse-engineered from the official Copilot VS Code extension.

### The Discovery Process

**1. Located the Copilot extension bundle on disk:**

```
~/.vscode/extensions/github.copilot-1.388.0/dist/extension.js
```

A single minified JavaScript file, approximately **12.7 MB**.

**2. Searched for quota-related keywords using Node.js** (the file was too large for PowerShell's `Select-String` or most text editors):

```javascript
node -e "
  const fs = require('fs');
  const t = fs.readFileSync('<path>/dist/extension.js','utf8');
  const i = t.indexOf('processQuotaHeaders');
  console.log(t.substring(i, i + 3000));
"
```

**3. Key search terms that led to discoveries:**

| Search Term | What It Revealed |
|---|---|
| `processQuotaHeaders` | How quota is parsed from HTTP response headers |
| `processUserInfoQuotaSnapshot` | How quota is parsed from the `/user` API response |
| `copilot_internal` | All internal API endpoint paths |
| `fetchCopilotUserInfo` | The function that calls the user info API |
| `quota_snapshots` | The response JSON structure |
| `X-GitHub-Api-Version` | Required API version header: `2025-05-01` |
| `premium_interactions` | The specific quota category for premium requests |

**4. Traced the full authentication flow** through minified function calls, discovering that VS Code's own `vscode.authentication.getSession('github', ['copilot'])` provides a token that the `/copilot_internal/user` endpoint accepts directly.

### The API We Found

```
GET https://api.github.com/copilot_internal/user
Authorization: Bearer <github-oauth-token>
X-GitHub-Api-Version: 2025-05-01
```

**Response:**

```json
{
  "copilot_plan": "individual",
  "quota_snapshots": {
    "premium_interactions": {
      "entitlement": 300,
      "percent_remaining": 41.3,
      "overage_permitted": false,
      "overage_count": 0
    }
  },
  "quota_reset_date": "2026-03-01T05:30:00Z"
}
```

**Multi-account trick:** `vscode.authentication.getAccounts('github')` returns all logged-in GitHub accounts, and we can call `getSession` with each one to get separate tokens — then hit the API for each.

---

## The Build: Problems Faced & Solutions

Building this extension involved **10+ rounds of iterative development**, testing, and bug fixing. Here's the full story of challenges encountered and how they were solved.

---

### 🐛 Problem 1: CSP Blocking Progress Bars

**Symptom:** All progress bars showed as 100% full regardless of actual usage.

**Root Cause:** The progress bar fill width was set via inline styles (`style="width:72%"`), but the Content Security Policy (CSP) in the webview only allowed `style-src ${cspSource}` — blocking all inline styles silently.

**Solution:** Added `'unsafe-inline'` to the `style-src` directive in both the main and setup view CSP headers:

```
style-src ${cspSource} 'unsafe-inline'
```

> **Lesson:** CSP violations in webviews are silent — no error, no console warning. The browser just ignores the style, making the cause extremely hard to find.

---

### 🐛 Problem 2: Status Bar Alignment Couldn't Change

**Symptom:** Changing the `statusBarAlignment` setting from "right" to "left" had no effect until VS Code was restarted.

**Root Cause:** The VS Code `StatusBarItem` API does not allow changing alignment after creation. The alignment is set once in `createStatusBarItem()` and is immutable.

**Solution:** Implemented a `recreate()` method on the `StatusBar` class that disposes the old item, creates a new one with the updated alignment, and restores the latest quota data:

```typescript
recreate(): void {
    this.item.dispose();
    this.item = this.createItem(); // reads fresh config
    this.update(this.latestQuotas); // restores state
}
```

---

### 🐛 Problem 3: "Sign in with GitHub" Popup Spam

**Symptom:** Every time the extension refreshed, VS Code showed a "Sign in with GitHub" prompt for accounts that weren't fully authenticated.

**Root Cause:** `getSession('github', ['copilot'], { account })` was being called for all discovered accounts, including ones never authenticated. Without `createIfNone: false`, VS Code would prompt the user.

**Solution:** Changed `getAuthenticatedAccounts()` to only call `getSession` for **known account IDs** (those already in the cached account list). Unknown accounts are only probed during the setup wizard.

---

### 🐛 Problem 4: Free Plan Accounts Showing as Errors

**Symptom:** GitHub Free accounts (no premium quota) displayed as red error cards saying "Unknown error."

**Root Cause:** The API returns a valid response for free accounts, but with no `quota_snapshots.premium_interactions` field. The parser didn't handle this case.

**Solution:** Added explicit free plan detection — if the response has `copilot_plan` but no `premium_interactions`, it's classified as `errorType: 'freePlan'` and rendered as a special informational card with a "Free" badge instead of an error card. Free plan accounts are also sorted to the bottom of the list.

---

### 🐛 Problem 5: Account List Overwritten on Refresh

**Symptom:** If an account's session temporarily expired during a refresh cycle, it would disappear from the account list entirely. Re-authenticating would bring it back, but cached data was lost.

**Root Cause:** `refreshAllAccounts()` was overwriting the cached account list with only currently-authenticated accounts: `cache.saveAccountList(authenticated.map(a => a.id))`. This dropped any account whose token was temporarily invalid.

**Solution:** Removed the account list overwrite from the refresh flow. Accounts are now only added via `authenticateAccount()` and removed via explicit `removeAccount()`. Quotas are merged into the existing array instead of replaced.

---

### 🐛 Problem 6: Session Change Event Storm

**Symptom:** When a GitHub token refreshed, `onDidChangeSessions` fired multiple times in rapid succession, triggering 3-5 simultaneous full refreshes.

**Solution:** Added debounce logic — multiple session change events within 2 seconds collapse into a single refresh:

```typescript
let sessionChangeTimer: ReturnType<typeof setTimeout> | undefined;

vscode.authentication.onDidChangeSessions((e) => {
    if (e.provider.id === 'github') {
        if (sessionChangeTimer) clearTimeout(sessionChangeTimer);
        sessionChangeTimer = setTimeout(() => refreshAllAccounts(), 2000);
    }
});
```

---

### 🐛 Problem 7: Stale Threshold Not Configurable

**Symptom:** The stale threshold (cards dimmed when data is old) was hardcoded to 30 minutes in the webview JavaScript, ignoring the user's `staleThreshold` setting.

**Solution:** Added the configurable threshold to the `quotaUpdate` message payload, flowing from `extension.ts` → `panelManager.ts` → webview `script.js`. The webview now reads `msg.staleThreshold` instead of using a hardcoded value.

---

### 🐛 Problem 8: Single Account Refresh Was O(n)

**Symptom:** Refreshing one account called `getAuthenticatedAccounts(knownIds)` which fetched sessions for **all** accounts just to find one.

**Solution:** Optimized `refreshSingleAccount()` to call `getSessionForAccount()` directly for the target account — O(1) instead of O(n) API calls.

---

### ⚡ Optimization: Sequential Settings Save

**Problem:** Saving 7 settings made 7 sequential `config.update()` calls, each writing to disk.

**Solution:** Wrapped all 7 calls in `Promise.all()` for parallel execution.

---

### 📦 Optimization: Missing .vscodeignore

**Problem:** The `.vsix` package included TypeScript source files, `tsconfig.json`, lock files, and markdown docs — unnecessary bloat.

**Solution:** Added a `.vscodeignore` file to exclude development files. Package size reduced significantly.

---

### 🎨 Design Fix: Progress Bar Track Invisible

**Problem:** Used `var(--vscode-progressBar-background)` for the track — but that's the same vibrant accent color as the fill, making them indistinguishable.

**Solution:** Replaced with a neutral `rgba(128, 128, 128, 0.35)` that works across all themes.

---

### 🎨 Design Fix: Missing CSS Class

**Problem:** Error card retry buttons used a `btn-sm` class that was never defined in the stylesheet.

**Solution:** Added the `.btn-sm` class with appropriate compact sizing.

---

## Rate Limiting & Safety

The extension uses GitHub's **internal** API, so rate limit safety was a priority:

| Protection | Value | Purpose |
|---|---|---|
| **Per-account cooldown** | 60s (configurable) | Prevents spamming one account |
| **Refresh All cooldown** | 120s (configurable) | Prevents mass-refreshing |
| **Auto-refresh interval** | 10 min (configurable, min 5) | Background polling |
| **Startup delay** | 10 seconds | Doesn't fetch on VS Code launch immediately |
| **Concurrent limit** | Max 3 parallel requests | Doesn't fire all at once for 20 accounts |
| **Session debounce** | 2 seconds | Collapses rapid auth change events |

**Worst case:** 10 accounts × refresh every 5 min = 120 requests/hour. GitHub's authenticated limit is 5,000/hour. We use **2.4%** of the budget.

---

## How It Works Internally

### Startup Sequence

```
1. Extension activates (onStartupFinished)
2. Create status bar item → show cached % or "Setup Quota"
3. Load cached quota data from globalState → display immediately
4. Wait 10 seconds (startup delay)
5. If refreshOnStartup is enabled → refresh all accounts
6. Start auto-refresh timer
7. Listen for authentication.onDidChangeSessions
```

### Refresh Flow

```
1. User clicks refresh (or auto-refresh triggers)
2. Check cooldown → if cooling down, show countdown timer, abort
3. Send 'loading' state to webview (show spinner)
4. Get session token for the account
5. Call GET https://api.github.com/copilot_internal/user
6. Parse response → QuotaData
7. Update cache, update in-memory array
8. Send data to webview + update status bar
9. Record refresh timestamp for cooldown tracking
```

### Data Sorting

Accounts in the main panel are sorted by:
1. **Active accounts first** — sorted by most remaining percentage (highest at top)
2. **Free plan accounts** — pushed to the bottom
3. **Error accounts** — pushed to the bottom

---

## Maintenance & Future-Proofing

Since this extension depends on an **undocumented internal API**, it may break if GitHub changes things. Here's what could happen and how to fix it:

| Risk | Likelihood | How to Detect |
|---|---|---|
| Endpoint path changes | Low | HTTP 404 errors |
| API version header changes | Medium | HTTP 401/403 errors |
| Response JSON structure changes | Medium | Parsing returns zeroes |
| New OAuth scopes required | Low | Auth fails silently |

### Diagnosis Steps

1. Find the latest Copilot extension: `~/.vscode/extensions/github.copilot-<version>/dist/extension.js`
2. Search for `copilot_internal`, `X-GitHub-Api-Version`, `quota_snapshots` to find updated values
3. Update `API_URL` and `API_VERSION` in `quotaService.ts`
4. Recompile and repackage

A full diagnostic script is available in [RESEARCH.md](docs/RESEARCH.md#105-useful-diagnostic-script).

---

## Documentation

Detailed technical documentation is included in the [`docs/`](docs/) folder:

| Document | Description |
|---|---|
| [RESEARCH.md](docs/RESEARCH.md) | Full reverse-engineering research — how the API was discovered, deobfuscated code snippets, authentication flow, response structures, diagnostic scripts, and maintenance guide |
| [BUILD_PLAN.md](docs/BUILD_PLAN.md) | Complete build specification — UI wireframes, architecture diagrams, component specs, rate limiting strategy, data flows, error handling matrix, and settings schema |

---

## Tech Stack

| Component | Technology |
|---|---|
| **Language** | TypeScript 5.3+ |
| **Runtime** | VS Code Extension API ^1.85.0 |
| **Build** | `tsc` (TypeScript Compiler) |
| **Package Manager** | pnpm |
| **Packaging** | @vscode/vsce |
| **UI** | Webview (HTML + CSS + vanilla JS) |
| **API** | GitHub internal REST API (reverse-engineered) |
| **Auth** | VS Code Authentication API (`vscode.authentication`) |
| **Persistence** | `ExtensionContext.globalState` (Memento API) |

---

## Development

### Prerequisites

- Node.js ≥ 18
- pnpm
- VS Code ≥ 1.85.0

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm run compile
```

### Watch Mode

```bash
pnpm run watch
```

### Package

```bash
pnpm exec vsce package --no-dependencies --allow-missing-repository
```

### Debug

Press `F5` in VS Code to launch the Extension Development Host. Check the **"Copilot Quota Monitor"** output channel for detailed logs of all API calls, responses, and errors.

---

## Acknowledgments

This extension was built through deep research into the official GitHub Copilot VS Code extension (version 1.388.0). The entire API surface, authentication flow, and data structures were reverse-engineered by reading through 12.7 MB of minified JavaScript — function by function, search term by search term.

No official GitHub API documentation was used or available for the internal quota endpoints.

---

<p align="center">
  <sub>Built with ☕ and curiosity — because checking quota shouldn't require 5 clicks per account.</sub>
</p>
