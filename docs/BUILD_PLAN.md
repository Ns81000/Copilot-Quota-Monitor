# Copilot Quota Monitor — Final Extension Build Plan

> **Status:** Prototype validated — API works, single-account fetch confirmed
> **Date:** February 19, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [UI Specification](#2-ui-specification)
3. [Rate Limiting & Safety](#3-rate-limiting--safety)
4. [Setup & Onboarding Flow](#4-setup--onboarding-flow)
5. [Architecture](#5-architecture)
6. [Data Flow](#6-data-flow)
7. [Settings & Configuration](#7-settings--configuration)
8. [Error Handling](#8-error-handling)
9. [File Structure](#9-file-structure)
10. [Detailed Component Specs](#10-detailed-component-specs)
11. [Build & Package](#11-build--package)

---

## 1. Overview

A VS Code extension that displays Copilot premium usage for **all GitHub accounts** in one place. The user clicks a status bar icon to open a Webview panel showing usage cards for every authenticated account.

### Core Features

| Feature | Description |
|---|---|
| Status bar icon | Shows lowest remaining % across all accounts as quick glance |
| Webview panel | Main UI — cards for each account with progress bars |
| Refresh All | Single button to refresh all accounts at once |
| Individual refresh | Per-account refresh button |
| More button | Initially show 5 accounts, expand rest on click |
| Username truncation | Long usernames get `..` suffix |
| Rate limit protection | Cooldown timers prevent excessive API calls |
| Auto-refresh | Configurable interval (default: 10 minutes) |
| Setup wizard | Step-by-step account discovery & authentication |
| Data caching | Persist last-known quota to show instantly on startup |

### Design Principles

- **No emojis anywhere in the UI.** The entire extension must look clean and professional. Use VS Code's built-in **codicon icons** (e.g., `$(refresh)`, `$(check)`, `$(error)`, `$(warning)`, `$(account)`) and standard UI patterns instead of emoji characters. This applies to:
  - Status bar text and tooltips
  - Webview panel (cards, buttons, status indicators)
  - Notifications and error messages
  - Setup wizard
- All icons must come from the [codicon library](https://microsoft.github.io/vscode-codicons/dist/codicon.html) or be rendered as clean SVG/CSS elements in the webview.

---

## 2. UI Specification

### 2.1 Status Bar Item

```
$(pulse) 41.3%     ← Shows the LOWEST remaining % across all accounts
```

- **Position:** Right side, priority 99
- **Click action:** Opens the Webview panel
- **Color coding:**
  - `>50%` remaining → default (white/gray)
  - `20-50%` remaining → yellow/warning
  - `<20%` remaining → red/error

### 2.2 Webview Panel Layout

Based on the provided wireframe:

```
┌─────────────────────────────────────────────┐
│                                             │
│   [Refresh All]      Usage     Last Refresh │
│                                 2:30 PM     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ns8pc                     15%  [↻] │    │
│  │ ████████████████░░░░░░░░░░░░░░░░░░ │    │
│  │            Reset on Mar 1, 2026     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ work-account-lo..         83%  [↻] │    │
│  │ ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │    │
│  │            Reset on Mar 1, 2026     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ another-user              42%  [↻] │    │
│  │ ████████████████████░░░░░░░░░░░░░░░ │    │
│  │            Reset on Mar 1, 2026     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│                  [More]                      │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Setup Accounts                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

### 2.3 Account Card Details

Each card shows:

| Element | Detail |
|---|---|
| **Username** | Truncated to 18 chars + `..` if longer |
| **Percentage** | `XX%` — percent USED (not remaining) — matches wireframe |
| **Progress bar** | Visual bar, filled portion = usage |
| **Refresh icon** | Codicon `$(refresh)` button, per-account, grayed out during cooldown |
| **Reset date** | `Reset on Mar 1, 2026` |

### 2.4 Progress Bar Colors

| Usage % | Bar Color | Meaning |
|---|---|---|
| 0–50% | Green (`#22c55e`) | Healthy |
| 51–80% | Yellow/Amber (`#eab308`) | Moderate |
| 81–100% | Red (`#ef4444`) | Running low |

### 2.5 "More" Button Behavior

- Initially show **first 5 accounts** (sorted by highest usage first)
- Click "More" → expands to show ALL accounts
- Button text changes to "Show Less" when expanded

### 2.6 Header Bar

- **Left:** `[Refresh All]` button
- **Center:** "Usage" title
- **Right:** `Last Refresh: 2:30 PM` timestamp
- Refresh All button shows spinner while refreshing, disabled during cooldown

---

## 3. Rate Limiting & Safety

### 3.1 GitHub's Rate Limits

| Limit Type | Value | Source |
|---|---|---|
| Authenticated REST API | 5,000 requests/hour per token | GitHub docs |
| Our usage per refresh | 1 request per account | We call only `GET copilot_internal/user` |

**Worst case scenario:** 10 accounts × refresh every 5 min = 120 req/hour per account.
This is **well within** the 5,000/hour limit. **No risk of banning.**

### 3.2 Our Safety Measures (Defense in Depth)

Even though we're safe, we implement cooldowns for good practice:

| Protection | Value | Purpose |
|---|---|---|
| **Per-account cooldown** | 60 seconds | Can't refresh same account within 60s |
| **Refresh All cooldown** | 120 seconds | Can't mass-refresh within 2 min |
| **Auto-refresh interval** | 10 min (configurable, min 5 min) | Background polling |
| **Startup delay** | 5 seconds | Don't fetch immediately on VS Code launch |
| **Concurrent limit** | Max 3 parallel requests | Don't fire all at once if 20 accounts |
| **Exponential backoff** | On HTTP errors | 2s → 4s → 8s → max 60s on repeated failures |

### 3.3 Cooldown UI Feedback

- During cooldown, the refresh button shows a **countdown timer** or is **grayed out**
- Tooltip on disabled button: "Wait Xs before refreshing again"
- "Refresh All" button text: `Refresh All (45s)` during cooldown

### 3.4 Caching Strategy

- **On every successful fetch:** Save quota data to `ExtensionContext.globalState`
- **On startup:** Immediately display cached data, then fetch fresh data in background
- **Cache TTL:** Data is shown as stale (dimmed) if older than 30 minutes
- **Cache key:** `quota_${accountId}` per account

---

## 4. Setup & Onboarding Flow

### 4.1 First-Time Experience

When the extension activates for the first time (no cached accounts):

1. Status bar shows: `$(pulse) Setup Quota`
2. Click → opens Webview with the **Setup Wizard**

### 4.2 Setup Wizard Steps

```
┌─────────────────────────────────────────────┐
│                                             │
│          Setup Copilot Quota Monitor        │
│                                             │
│  Discovering GitHub accounts...             │
│                                             │
│  Found 3 accounts:                          │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ [ok] ns8pc        Authenticated     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ [ok] work-account  Authenticated     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ [--] other-acct    [Authenticate]    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Skip Remaining]         [Done - View All] │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.3 How Setup Works Technically

```
Step 1: vscode.authentication.getAccounts('github')
        → Returns all GitHub accounts known to VS Code
        → e.g., [{id: "abc", label: "ns8pc"}, {id: "def", label: "work-acct"}]

Step 2: For each account, try:
        vscode.authentication.getSession('github', ['copilot'], {
          account: account,
          createIfNone: false  ← don't prompt yet
        })
        → Returns session if already authorized, null if not

Step 3: For accounts without a session, show [Authenticate] button
        → On click: getSession(..., { createIfNone: true })
        → This triggers VS Code's native auth prompt

Step 4: Once authenticated, immediately fetch quota to verify it works

Step 5: Save authenticated account IDs to globalState
```

### 4.4 "Setup Accounts" Button in Main Panel

Always visible at the bottom of the main Usage panel. Opens the setup wizard to:
- Add new accounts
- Re-authenticate expired accounts
- Remove accounts from monitoring

---

## 5. Architecture

### 5.1 Component Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Status Bar  │────▶│   Panel Manager  │────▶│   Webview     │
│  Item        │     │   (extension.ts) │     │   (HTML/CSS)  │
└──────────────┘     └──────┬───────────┘     └───────┬───────┘
                            │                         │
                    ┌───────▼────────┐        ┌───────▼───────┐
                    │  Account       │        │  Message      │
                    │  Manager       │        │  Protocol     │
                    └───────┬────────┘        │  (postMessage)│
                            │                 └───────────────┘
                    ┌───────▼────────┐
                    │  Quota         │
                    │  Service       │
                    │  (API calls)   │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │  Rate Limiter  │
                    │  & Cache       │
                    └────────────────┘
```

### 5.2 Communication: Extension ↔ Webview

Uses VS Code's `postMessage` protocol:

**Extension → Webview:**
```typescript
// Send updated quota data
panel.webview.postMessage({
  type: 'quotaUpdate',
  accounts: QuotaData[],
  lastRefresh: string,
});

// Send refresh state
panel.webview.postMessage({
  type: 'refreshState',
  accountId: string,
  state: 'loading' | 'done' | 'error' | 'cooldown',
  cooldownRemaining?: number,
});
```

**Webview → Extension:**
```typescript
// User clicked refresh for one account
vscode.postMessage({ type: 'refreshAccount', accountId: string });

// User clicked Refresh All
vscode.postMessage({ type: 'refreshAll' });

// User clicked More
vscode.postMessage({ type: 'showMore' });

// User clicked Setup
vscode.postMessage({ type: 'openSetup' });
```

---

## 6. Data Flow

### 6.1 Startup Sequence

```
1. Extension activates (onStartupFinished)
2. Create status bar item (shows cached % or "Setup")
3. Wait 5 seconds (startup delay)
4. Load cached quota data from globalState → display immediately
5. Discover accounts via getAccounts('github')
6. For each account with a cached session:
   a. Fetch fresh quota (max 3 concurrent)
   b. Update cache
   c. Update webview (if open)
   d. Update status bar (lowest remaining %)
7. Set up auto-refresh timer
8. Listen for authentication.onDidChangeSessions
```

### 6.2 Refresh Single Account

```
1. User clicks the refresh icon on an account card
2. Check cooldown → if cooling down, show message, abort
3. Send 'loading' state to webview (show spinner on that card)
4. Fetch quota for that account
5. Update cache
6. Send 'quotaUpdate' to webview
7. Start cooldown timer (60s)
8. Update status bar if this was the lowest account
```

### 6.3 Refresh All

```
1. User clicks [Refresh All]
2. Check cooldown → if cooling down, show remaining time, abort
3. Send 'loading' state to webview for ALL cards
4. Fetch quota for all accounts (batched, max 3 concurrent)
5. Update cache for each as they complete
6. Send progressive updates to webview
7. When all done: update lastRefresh timestamp
8. Start cooldown timer (120s)
```

---

## 7. Settings & Configuration

Extension contributes these settings under `copilotQuota.*`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `copilotQuota.autoRefreshInterval` | number | `10` | Auto-refresh interval in minutes (min: 5) |
| `copilotQuota.maxVisibleAccounts` | number | `5` | Accounts shown before "More" button |
| `copilotQuota.showInStatusBar` | boolean | `true` | Show status bar icon |
| `copilotQuota.statusBarAlignment` | `left` / `right` | `right` | Status bar position |
| `copilotQuota.refreshCooldown` | number | `60` | Per-account cooldown in seconds (min: 30) |
| `copilotQuota.refreshAllCooldown` | number | `120` | Refresh All cooldown in seconds (min: 60) |

---

## 8. Error Handling

### 8.1 Per-Account Error States

| Scenario | Card Display | Recovery |
|---|---|---|
| No Copilot subscription | Gray card: "No Copilot plan" | Link to github.com/copilot |
| Token expired | Yellow card: "Session expired" | [Re-authenticate] button |
| HTTP 401/403 | Red card: "Auth failed" | [Re-authenticate] button |
| HTTP 429 (rate limited) | Yellow card: "Rate limited" | Auto-retry with backoff |
| Network error | Red card: "Network error" | [Retry] button |
| API structure changed | Red card: "API changed" | Show raw response in output channel |
| Unknown error | Red card: error message | [Retry] button |

### 8.2 Global Error States

| Scenario | Status Bar | Panel |
|---|---|---|
| No accounts found | `$(pulse) Setup` | Show setup wizard |
| All accounts errored | `$(error) Quota` | Show error cards with retry |
| Partial failure | Show lowest % of working accounts | Working cards + error cards |

### 8.3 Logging

All API calls, responses, and errors logged to the **"Copilot Quota Monitor"** output channel with timestamps. This helps users report issues and helps us debug API changes.

---

## 9. File Structure

```
copilot-quota-monitor/
├── src/
│   ├── extension.ts           # Entry point: activate, deactivate, commands
│   ├── statusBar.ts           # Status bar item management
│   ├── panelManager.ts        # Webview panel lifecycle & message handling
│   ├── accountManager.ts      # GitHub account discovery & session management
│   ├── quotaService.ts        # API calls to copilot_internal/user
│   ├── rateLimiter.ts         # Cooldown tracking, concurrent request limiting
│   ├── cache.ts               # globalState read/write for quota data
│   ├── types.ts               # All TypeScript interfaces
│   └── webview/
│       ├── main.html          # Webview HTML template (main panel)
│       ├── setup.html         # Webview HTML template (setup wizard)
│       ├── style.css          # Webview styles (VS Code theme-aware)
│       └── script.js          # Webview client-side JavaScript
├── assets/
│   └── icon.png               # Extension icon
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── package.json
├── tsconfig.json
├── RESEARCH.md                # API research documentation
├── BUILD_PLAN.md              # This file
└── README.md                  # User-facing documentation
```

---

## 10. Detailed Component Specs

### 10.1 `extension.ts` — Entry Point

```
Responsibilities:
- Register commands: copilotQuota.refresh, copilotQuota.refreshAll,
  copilotQuota.openPanel, copilotQuota.setup
- Create status bar item
- Initialize all services
- Set up auto-refresh timer
- Listen to onDidChangeSessions
- Clean up on deactivate
```

### 10.2 `accountManager.ts` — Account Discovery

```
Responsibilities:
- getAccounts('github') → list all accounts
- getSession per account (with or without createIfNone)
- Track which accounts are authenticated
- Emit events when accounts change

Key methods:
- discoverAccounts(): Promise<Account[]>
- getSessionForAccount(account): Promise<Session | null>
- authenticateAccount(account): Promise<Session>   // createIfNone: true
- getAuthenticatedAccounts(): Promise<AuthenticatedAccount[]>
```

### 10.3 `quotaService.ts` — API Calls

```
Responsibilities:
- Call GET https://api.github.com/copilot_internal/user per token
- Parse response into QuotaData
- Handle HTTP errors gracefully
- Log everything to output channel

Key methods:
- fetchQuota(token, accountLabel): Promise<QuotaData>
- fetchAllQuotas(accounts): Promise<QuotaData[]>   // batched
```

### 10.4 `rateLimiter.ts` — Cooldown & Throttling

```
Responsibilities:
- Track per-account last-refresh timestamps
- Enforce cooldown periods
- Limit concurrent requests (max 3)
- Provide cooldown remaining time for UI

Key methods:
- canRefresh(accountId): { allowed: boolean, waitSeconds: number }
- canRefreshAll(): { allowed: boolean, waitSeconds: number }
- recordRefresh(accountId): void
- recordRefreshAll(): void
```

### 10.5 `cache.ts` — Persistence

```
Responsibilities:
- Save QuotaData[] to globalState
- Load QuotaData[] from globalState
- Save/load authenticated account list
- Save/load last refresh timestamps

Key methods:
- saveQuota(accountId, data): void
- loadQuota(accountId): QuotaData | null
- loadAllQuotas(): Map<string, QuotaData>
- saveAccountList(accounts): void
- loadAccountList(): string[]
```

### 10.6 `panelManager.ts` — Webview Panel

```
Responsibilities:
- Create/show/dispose WebviewPanel
- Generate HTML with current data
- Handle postMessage from webview
- Send data updates to webview
- Manage panel lifecycle (reveal existing or create new)

Key methods:
- openPanel(): void
- openSetup(): void
- updateQuotaDisplay(data: QuotaData[]): void
- sendRefreshState(accountId, state): void
```

### 10.7 `statusBar.ts` — Status Bar

```
Responsibilities:
- Create and manage the status bar item
- Update text with lowest remaining %
- Update color based on threshold
- Handle click → open panel

Key methods:
- update(quotas: QuotaData[]): void
- showLoading(): void
- showError(message): void
- showSetup(): void
```

### 10.8 Webview HTML/CSS/JS

```
HTML:
- Header bar: Refresh All button, "Usage" title, last refresh time
- Account cards container (scrollable)
- Each card: username, progress bar, %, reset date, refresh icon
- "More" / "Show Less" toggle button
- "Setup Accounts" button at bottom
- Loading skeletons for cards while fetching

CSS:
- Uses VS Code CSS variables for theme compatibility:
  --vscode-editor-background
  --vscode-editor-foreground
  --vscode-button-background
  --vscode-button-foreground
  --vscode-progressBar-background
  etc.
- Responsive: works in narrow side panel or wide editor area
- Smooth transitions on progress bar changes
- Hover effects on buttons and cards

JS:
- Receives messages from extension via window.addEventListener('message')
- Sends messages via vscode.postMessage()
- Manages DOM updates for cards, progress bars, cooldown timers
- Handles More/Less toggle (show/hide cards beyond maxVisible)
- Updates cooldown countdown timers every second
```

---

## 11. Build & Package

### 11.1 Development

```bash
pnpm install
pnpm run watch        # TypeScript watch mode
# Press F5 to launch Extension Development Host
```

### 11.2 Package as VSIX

```bash
pnpm add -D @vscode/vsce
pnpm exec vsce package --no-dependencies
# → copilot-quota-monitor-0.0.1.vsix
```

### 11.3 Install locally

```bash
code --install-extension copilot-quota-monitor-0.0.1.vsix
```

---

## Appendix: Commands Registered

| Command ID | Title | Trigger |
|---|---|---|
| `copilotQuota.openPanel` | Copilot Quota: Open Panel | Status bar click |
| `copilotQuota.refresh` | Copilot Quota: Refresh Account | Card refresh button |
| `copilotQuota.refreshAll` | Copilot Quota: Refresh All | Header refresh button |
| `copilotQuota.setup` | Copilot Quota: Setup Accounts | Setup button / first run |

## Appendix: Extension Contribution Points

```jsonc
// package.json contributes
{
  "commands": [...],                    // 4 commands above
  "configuration": {                    // Settings under copilotQuota.*
    "copilotQuota.autoRefreshInterval": ...,
    "copilotQuota.maxVisibleAccounts": ...,
    // etc.
  },
  "viewsContainers": {},               // Not needed, we use WebviewPanel
  "menus": {
    "commandPalette": [...]             // All 4 commands available in palette
  }
}
```
