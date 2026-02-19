# Copilot Multi-Account Premium Usage Monitor — Research Documentation

> **Date:** February 19, 2026
> **Extension Version Analyzed:** `github.copilot-1.388.0`
> **Source File:** `~/.vscode/extensions/github.copilot-1.388.0/dist/extension.js` (~12.7 MB bundled)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [What We're Building](#2-what-were-building)
3. [Research Methodology](#3-research-methodology)
4. [Discovered API Endpoints](#4-discovered-api-endpoints)
5. [Authentication Flow](#5-authentication-flow)
6. [Quota Data Structures](#6-quota-data-structures)
7. [How The Copilot Extension Works Internally](#7-how-the-copilot-extension-works-internally)
8. [Extension Architecture Plan](#8-extension-architecture-plan)
9. [Automation Strategy](#9-automation-strategy)
10. [Maintenance & Future-Proofing](#10-maintenance--future-proofing)
11. [Appendix: Raw Code Snippets](#11-appendix-raw-code-snippets)

---

## 1. Problem Statement

VS Code allows multiple GitHub accounts to be logged in simultaneously. The official Copilot extension only shows premium usage quota for **one account at a time** — whichever is set as the active account in "Extension Account Preferences." Checking each account requires:

1. Open Extension Account Preferences
2. Switch the active GitHub account for Copilot
3. Click the Copilot icon in the status bar
4. Read the hover tooltip

This is tedious when managing 2+ accounts (e.g., personal + work).

**Goal:** Build a VS Code extension that shows premium usage for **all** logged-in GitHub accounts at once — via a status bar icon and a Webview panel.

---

## 2. What We're Building

A VS Code extension that:

- Adds an icon to the **bottom status bar** showing the lowest remaining % across all accounts
- On **click**, opens a **Webview panel** showing account cards with:
  - Account name (truncated with `..` if too long)
  - Color-coded progress bar (green / yellow / red)
  - Premium requests used / total with percentage
  - Reset date
  - Individual refresh button per account
- **Refresh All** button in the panel header
- **More / Show Less** toggle (initially shows 5 accounts)
- **Setup wizard** for step-by-step account authentication
- **Auto-refreshes** on a configurable interval (default: 10 minutes)
- **Rate limit protection** with per-account and global cooldowns
- **Data caching** across restarts via `globalState`

> For the full UI specification, architecture, and component details, see [BUILD_PLAN.md](BUILD_PLAN.md).

---

## 3. Research Methodology

### 3.1 How We Found the API Endpoints

Since GitHub does **not** publish public APIs for Copilot premium quota, we reverse-engineered the official Copilot VS Code extension.

#### Step-by-step process:

**1. Located the extension on disk:**

```
~/.vscode/extensions/github.copilot-1.388.0/
```

Found by running:
```powershell
Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory | Where-Object { $_.Name -like "*copilot*" }
```

**2. Identified the main bundle:**

```
dist/extension.js  (~12.7 MB, single minified file)
```

**3. Searched for quota-related keywords using Node.js** (file too large for PowerShell `Get-Content`):

```bash
node -e "
  const fs = require('fs');
  const t = fs.readFileSync('<path>/dist/extension.js','utf8');
  const i = t.indexOf('processQuotaHeaders');
  console.log(t.substring(i, i + 3000));
"
```

**Keywords that led to discoveries:**
| Search Term | What It Revealed |
|---|---|
| `processQuotaHeaders` | How quota is parsed from HTTP response headers |
| `processUserInfoQuotaSnapshot` | How quota is parsed from the `/user` API response |
| `copilot_internal` | All internal API endpoint paths |
| `fetchCopilotUserInfo` | The function that calls the user info API |
| `quota_snapshots` | The response JSON structure |
| `quota_reset_date` | The reset date field in the response |
| `x-quota-snapshot-premium` | Response headers carrying quota data |
| `api.github.com` | Confirmed the base URL |
| `X-GitHub-Api-Version` | Required API version headers |
| `premium_interactions` | The specific quota category for premium requests |

**4. Traced the authentication flow** by finding `copilot_internal/v2/token` and the `jh` (apiFetch) helper function.

### 3.2 Tools Used

- **PowerShell** — file discovery, initial `Select-String` searches
- **Node.js** — reading & searching the 12.7 MB bundle (PowerShell choked on the line lengths)
- **Manual code reading** — tracing function calls through minified code

---

## 4. Discovered API Endpoints

### 4.1 Get Copilot Token

| | |
|---|---|
| **URL** | `POST https://api.github.com/copilot_internal/v2/token` |
| **Auth** | `Authorization: Bearer <github-oauth-token>` |
| **Required Header** | `X-GitHub-Api-Version: 2024-12-15` |

**Response (JSON):**
```json
{
  "token": "<short-lived-copilot-jwt>",
  "expires_at": 1708300000,
  "refresh_in": 1500,
  "user_notification": { ... },
  "error_details": { ... }
}
```

> **Note:** We do NOT need this endpoint for our extension. The `/user` endpoint accepts the raw GitHub OAuth token directly. This endpoint is used by Copilot to get a JWT for the completions API.

### 4.2 Get User Info + Quota (PRIMARY ENDPOINT)

| | |
|---|---|
| **URL** | `GET https://api.github.com/copilot_internal/user` |
| **Auth** | `Authorization: Bearer <github-oauth-token>` |
| **Required Header** | `X-GitHub-Api-Version: 2025-05-01` |

**Response (JSON):**
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
  "quota_reset_date": "2026-03-01T05:30:00Z",
  "organization_list": ["..."]
}
```

### 4.3 Quota from Response Headers (Alternative)

Every Copilot API response includes quota info in headers:

```
x-quota-snapshot-premium_models: ent=300&rem=41.3&ov=0.0&ovPerm=false&rst=2026-03-01T05:30:00Z
```

Or:

```
x-quota-snapshot-premium_interactions: ent=300&rem=41.3&ov=0.0&ovPerm=false&rst=2026-03-01T05:30:00Z
```

**Header value is URL-encoded params:**
| Param | Type | Meaning |
|---|---|---|
| `ent` | integer | Total entitlement (quota limit) |
| `rem` | float | Percent remaining (e.g., 41.3 = 41.3%) |
| `ov` | float | Overage amount used |
| `ovPerm` | `"true"` / `"false"` | Whether paid overage is enabled |
| `rst` | ISO 8601 string | Quota reset date |

**Parsed by the extension as:**
```javascript
used = Math.max(0, ent * (1 - rem / 100))
```

> **For our extension:** We only need endpoint 4.2 (`copilot_internal/user`). It returns everything in one call.

### 4.4 Other Internal Endpoints Found (for reference)

| Endpoint | Method | Purpose |
|---|---|---|
| `copilot_internal/v2/token` | POST | Get Copilot session JWT |
| `copilot_internal/user` | GET | Get user info + quota |
| `copilot_internal/notification` | POST | Acknowledge a notification |
| `copilot_internal/content_exclusion` | GET | Content restriction policies |
| `copilot_internal/subscribe_limited_user` | POST | Subscribe to limited user events |
| `repos/{owner}/{repo}/copilot_internal/embeddings_index` | GET | Check repo indexing status |

---

## 5. Authentication Flow

### How VS Code manages GitHub tokens:

```
vscode.authentication.getSession('github', scopes, options)
  → Returns { accessToken, account: { id, label } }
```

### How to get ALL accounts:

```
vscode.authentication.getAccounts('github')
  → Returns Array<{ id, label }>
```

Then for each account:

```
vscode.authentication.getSession('github', ['copilot'], {
  account: account,
  createIfNone: false
})
  → Returns { accessToken } for that specific account
```

### Required OAuth scopes:

The scope `['copilot']` is required. This was **confirmed working** in our prototype test on February 19, 2026. The `/copilot_internal/user` endpoint accepts the OAuth token returned by this session directly — no additional token exchange is needed.

### Full flow for our extension:

```
For each GitHub account in VS Code:
  1. getAccounts('github') → [account1, account2, ...]
  2. getSession('github', ['copilot'], { account }) → { accessToken }
  3. fetch('https://api.github.com/copilot_internal/user', {
       headers: {
         'Authorization': `Bearer ${accessToken}`,
         'X-GitHub-Api-Version': '2025-05-01'
       }
     })
  4. Parse response → quota data
  5. Display in status bar tooltip
```

---

## 6. Quota Data Structures

### 6.1 API Response Structure

```typescript
interface CopilotUserInfo {
  copilot_plan: 'individual' | 'individual_pro' | 'business' | 'enterprise';
  quota_snapshots: {
    premium_interactions: {
      entitlement: number;        // Total quota (e.g., 300)
      percent_remaining: number;  // % left (e.g., 41.3)
      overage_permitted: boolean; // Paid overage enabled
      overage_count: number;      // Overage requests used
    };
  };
  quota_reset_date: string; // ISO 8601 (e.g., "2026-03-01T05:30:00Z")
  organization_list?: string[];
}
```

### 6.2 Derived Calculations

```typescript
const total = response.quota_snapshots.premium_interactions.entitlement;
const percentRemaining = response.quota_snapshots.premium_interactions.percent_remaining;
const used = Math.max(0, total * (1 - percentRemaining / 100));
const percentUsed = 100 - percentRemaining;
const resetDate = new Date(response.quota_reset_date);
```

### 6.3 Plan Display Names

From the extension source:
```
'individual'     → Copilot Individual (Pro)
'individual_pro' → Copilot Pro+
'business'       → Copilot Business
'enterprise'     → Copilot Enterprise
(free user)      → Copilot Free
```

---

## 7. How The Copilot Extension Works Internally

### Key functions found in `extension.js`:

| Function (minified name) | Original name | Purpose |
|---|---|---|
| `jh` | `apiFetch` | Core fetch wrapper — adds auth header, constructs URL from base `apiUrl` |
| `wAn` | `fetchCopilotUserInfo` | Calls `GET copilot_internal/user` with API version header |
| `yye` | `authFromGitHubSession` | Full auth flow: get token → get user info → return CopilotToken |
| `processQuotaHeaders` | (same) | Parses `x-quota-snapshot-*` headers from any API response |
| `processUserInfoQuotaSnapshot` | (same) | Parses `quota_snapshots` from the `/user` JSON response |
| `zm` | `fillGitHubUrls` | Resolves `apiUrl` (defaults to `https://api.github.com/`) |

### The `apiFetch` function:

```javascript
async function apiFetch(ctx, session, path, options = {}) {
  options = {
    ...options,
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      ...options.headers
    }
  };
  const url = new URL(path, session.apiUrl).href;
  const response = await ctx.get(fetchService).fetch(url, options);
  if (response.status >= 500) throw new ServerError(response);
  if (!response.headers.get('x-github-request-id')) throw new InvalidResponseError(response);
  return response;
}
```

**Key insight:** The `path` (e.g., `copilot_internal/user`) is resolved against `session.apiUrl` (defaults to `https://api.github.com/`), forming the full URL `https://api.github.com/copilot_internal/user`.

---

## 8. Extension Architecture Plan

> **Note:** This section contains the initial architecture sketch from the research phase.
> The finalized and detailed architecture — including all component specs, Webview design,
> rate limiting, caching, settings, and error handling — is documented in
> [BUILD_PLAN.md](BUILD_PLAN.md).

### 8.1 Project Structure (finalized)

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
├── package.json
├── tsconfig.json
├── RESEARCH.md                # This file
└── BUILD_PLAN.md              # Full build specification
```

### 8.2 Key Components

**accountManager.ts** — Discovers and authenticates all GitHub accounts:
```
getAccounts('github') → for each → getSession(['copilot'], { account }) → tokens[]
```

**quotaService.ts** — Fetches quota per token:
```
For each token → GET copilot_internal/user → parse → QuotaData
```

**panelManager.ts** — Renders the Webview panel:
```
Status bar click → open Webview → display account cards with progress bars
```

**rateLimiter.ts** — Prevents excessive API calls:
```
Per-account cooldown: 60s | Refresh All cooldown: 120s | Max concurrent: 3
```

---

## 9. Automation Strategy

### 9.1 What Can Be Automated

| Step | Automation |
|---|---|
| Account discovery | Fully automatic via `vscode.authentication.getAccounts('github')` |
| Token retrieval | Fully automatic via `vscode.authentication.getSession()` per account |
| Quota fetching | Fully automatic — HTTP GET with token |
| Refresh | Timer-based auto-refresh (configurable interval) |
| Display | Automatic tooltip update on data change |
| Account changes | Listen to `vscode.authentication.onDidChangeSessions` event |

### 9.2 What Requires User Action

| Step | Why |
|---|---|
| Initial GitHub login | User must log in to each account at least once in VS Code |
| Extension install | One-time install from VSIX or marketplace |

### 9.3 Refresh Strategy

```
1. On extension activation → load cache, then fetch fresh data after 5s delay
2. Every N minutes (configurable, default 10, minimum 5) → re-fetch all
3. On authentication change event (onDidChangeSessions) → re-fetch
4. On Refresh All click → re-fetch all (with 120s cooldown)
5. On individual refresh click → re-fetch one account (with 60s cooldown)
```

---

## 10. Maintenance & Future-Proofing

### 10.1 What Could Break

| Risk | Likelihood | Impact |
|---|---|---|
| GitHub changes `copilot_internal/user` endpoint path | Low | Extension stops working |
| GitHub changes the API version requirement | Medium | 401/403 errors |
| GitHub changes the response JSON structure | Medium | Quota parsing fails |
| GitHub adds rate limiting to the endpoint | Low | Throttled requests |
| `vscode.authentication.getAccounts` API changes | Very Low | Account discovery fails |
| GitHub requires new OAuth scopes | Low | Auth fails silently |

### 10.2 How to Detect Breakage

Add error handling that surfaces clear messages:
- HTTP 401/403 → "API version or auth may have changed"
- Missing `quota_snapshots` in response → "Response structure changed"
- HTTP 404 → "Endpoint path may have changed"

### 10.3 How to Fix It (step-by-step)

**If the API stops working:**

1. **Check which Copilot extension version is installed:**
   ```powershell
   Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory | Where-Object { $_.Name -like "github.copilot-*" }
   ```

2. **Find the main bundle:**
   ```
   ~/.vscode/extensions/github.copilot-<version>/dist/extension.js
   ```

3. **Search for the updated endpoints** (use Node.js, the file is too large for text editors):
   ```bash
   node -e "
     const fs = require('fs');
     const t = fs.readFileSync('<path>/dist/extension.js', 'utf8');
     // Search for key terms:
     ['copilot_internal', 'quota_snapshot', 'processQuota', 'fetchCopilotUser', 'X-GitHub-Api-Version']
       .forEach(term => {
         let i = t.indexOf(term);
         if (i !== -1) {
           console.log('--- ' + term + ' ---');
           console.log(t.substring(Math.max(0, i - 100), i + 500));
           console.log();
         }
       });
   "
   ```

4. **Key things to look for:**
   - New endpoint path (replace `copilot_internal/user`)
   - New API version string (replace `2025-05-01`)
   - New response field names (replace `quota_snapshots.premium_interactions.*`)
   - New header names (replace `x-quota-snapshot-premium_interactions`)

5. **Update our extension** with the new values and republish.

### 10.4 Where Everything Lives (Quick Reference)

| What | Where to Find |
|---|---|
| Copilot extension source | `~/.vscode/extensions/github.copilot-<version>/dist/extension.js` |
| API endpoint paths | Search for `copilot_internal` in the bundle |
| API version strings | Search for `X-GitHub-Api-Version` in the bundle |
| Quota parsing logic | Search for `processQuotaHeaders` or `processUserInfoQuotaSnapshot` |
| Auth flow | Search for `copilot_internal/v2/token` or `authFromGitHubSession` |
| Response structure | Search for `quota_snapshots` or `premium_interactions` |
| Base URL logic | Search for `api.github.com` or `fillGitHubUrls` |
| OAuth token source | Search for `getSession` with `'github'` provider in the bundle |
| Status bar rendering | Search for `Premium request` or `Copilot Usage` in the bundle |
| Fetch helper function | Search for `apiFetch` or the pattern `Authorization.*Bearer.*accessToken` |

### 10.5 Useful Diagnostic Script

Save this as `diagnose.mjs` and run with `node diagnose.mjs` whenever the extension breaks:

```javascript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const extDir = join(homedir(), '.vscode', 'extensions');
const copilotDirs = readdirSync(extDir).filter(d => d.startsWith('github.copilot-') && !d.includes('chat'));
const latest = copilotDirs.sort().pop();

console.log(`Analyzing: ${latest}\n`);

const code = readFileSync(join(extDir, latest, 'dist', 'extension.js'), 'utf8');

const searches = [
  { label: 'User Info Endpoint', pattern: /copilotUserInfoUrl\?\?"([^"]+)"/ },
  { label: 'Token Endpoint', pattern: /copilotTokenUrl\?\?"([^"]+)"/ },
  { label: 'API Version (User Info)', pattern: /X-GitHub-Api-Version.*?["'](\d{4}-\d{2}-\d{2})["'].*?copilot_internal\/user/ },
  { label: 'API Version (Token)', pattern: /X-GitHub-Api-Version.*?["'](\d{4}-\d{2}-\d{2})["'].*?copilot_internal\/v2\/token/ },
  { label: 'Quota Header Names', pattern: /x-quota-snapshot-([a-z_]+)/ },
  { label: 'Base URL Default', pattern: /https:\/\/api\.github\.com\// },
];

// Simple indexOf-based searches for key structures
const structureSearches = [
  'premium_interactions.entitlement',
  'premium_interactions.percent_remaining',
  'premium_interactions.overage_permitted',
  'premium_interactions.overage_count',
  'quota_reset_date',
  'quota_snapshots',
  'copilot_plan',
];

console.log('=== Endpoint & Version Discovery ===\n');
for (const { label, pattern } of searches) {
  const match = code.match(pattern);
  console.log(`${label}: ${match ? match[1] || match[0] : '[NOT FOUND]'}`);
}

console.log('\n=== Response Structure Fields ===\n');
for (const field of structureSearches) {
  const found = code.includes(field);
  console.log(`${field}: ${found ? '[OK]' : '[NOT FOUND]'}`);
}

console.log('\n=== processQuotaHeaders snippet ===\n');
const idx = code.indexOf('processQuotaHeaders');
if (idx !== -1) {
  console.log(code.substring(idx, idx + 800));
}
```

---

## 11. Appendix: Raw Code Snippets

### A. The `apiFetch` function (deobfuscated)

```javascript
async function apiFetch(context, session, path, options = {}) {
  options = {
    ...options,
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      ...options.headers
    }
  };
  const url = new URL(path, session.apiUrl).href;
  const response = await context.get(fetchService).fetch(url, options);
  if (response.status >= 500) throw new ServerError(response);
  if (!response.headers.get('x-github-request-id')) throw new InvalidResponseError(response);
  return response;
}
```

### B. The `fetchCopilotUserInfo` function (deobfuscated)

```javascript
async function fetchCopilotUserInfo(context, session) {
  const headers = { 'X-GitHub-Api-Version': '2025-05-01' };
  const path = session.devOverride?.copilotUserInfoUrl ?? 'copilot_internal/user';
  return await apiFetch(context, session, path, { timeout: 120000, headers });
}
```

### C. The `processQuotaHeaders` method (deobfuscated)

```javascript
processQuotaHeaders(headers) {
  const snapshot = headers.get('x-quota-snapshot-premium_models')
                || headers.get('x-quota-snapshot-premium_interactions');
  if (snapshot) {
    try {
      const params = new URLSearchParams(snapshot);
      const entitlement = parseInt(params.get('ent') || '0', 10);
      const overage = parseFloat(params.get('ov') || '0.0');
      const overageEnabled = params.get('ovPerm') === 'true';
      const percentRemaining = parseFloat(params.get('rem') || '0.0');
      const resetStr = params.get('rst');
      let resetDate;
      if (resetStr) {
        resetDate = new Date(resetStr);
      } else {
        resetDate = new Date();
        resetDate.setMonth(resetDate.getMonth() + 1);
      }
      const used = Math.max(0, entitlement * (1 - percentRemaining / 100));
      this._quotaInfo = {
        quota: entitlement,
        used: used,
        overageUsed: overage,
        overageEnabled: overageEnabled,
        resetDate: resetDate
      };
    } catch (e) {
      console.error('Failed to parse quota header', e);
    }
  }
}
```

### D. The `processUserInfoQuotaSnapshot` method (deobfuscated)

```javascript
processUserInfoQuotaSnapshot(userInfo) {
  if (!userInfo || !userInfo.quota_snapshots || !userInfo.quota_reset_date) return;

  this._quotaInfo = {
    overageEnabled: userInfo.quota_snapshots.premium_interactions.overage_permitted,
    overageUsed: userInfo.quota_snapshots.premium_interactions.overage_count,
    quota: userInfo.quota_snapshots.premium_interactions.entitlement,
    resetDate: new Date(userInfo.quota_reset_date),
    used: Math.max(0,
      userInfo.quota_snapshots.premium_interactions.entitlement *
      (1 - userInfo.quota_snapshots.premium_interactions.percent_remaining / 100)
    )
  };
}
```

### E. Plan type detection (deobfuscated)

```javascript
get copilotPlan() {
  if (this.isFreeUser) return 'free';
  const plan = this.userInfo?.copilot_plan;
  switch (plan) {
    case 'individual':
    case 'individual_pro':
    case 'business':
    case 'enterprise':
      return plan;
    default:
      return 'individual';
  }
}
```

---

## Prototype Validation (February 19, 2026)

A minimal single-account prototype was built and tested successfully:

- **API confirmed working:** `GET https://api.github.com/copilot_internal/user` returns quota data
- **Auth confirmed:** `vscode.authentication.getSession('github', ['copilot'])` provides a valid token
- **Response structure confirmed:** `quota_snapshots.premium_interactions` fields match the documented structure
- **No issues:** No rate limiting, no auth errors, no unexpected response formats

The prototype source is preserved in [src/extension.ts](src/extension.ts) (single-account version).

## Quick-Start Checklist (for building the full extension)

- [x] Scaffold VS Code extension with TypeScript
- [x] Implement API fetch for `copilot_internal/user` per token
- [x] Parse quota data from JSON response
- [x] Create status bar item (prototype: tooltip-based)
- [x] Validate API works with real account
- [ ] Implement `getAccounts('github')` for multi-account discovery
- [ ] Implement `getSession('github', ['copilot'], { account })` per account
- [ ] Build Webview panel with account cards and progress bars
- [ ] Add per-account and global refresh with cooldowns
- [ ] Add auto-refresh timer (default 10 min)
- [ ] Add `onDidChangeSessions` listener
- [ ] Build setup wizard for step-by-step account authentication
- [ ] Add data caching via globalState
- [ ] Error handling + user-friendly messages
- [ ] Test with multiple accounts
- [ ] Package as VSIX
