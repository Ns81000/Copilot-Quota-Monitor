export interface QuotaData {
    accountId: string;
    accountLabel: string;
    plan: string;
    entitlement: number;
    percentRemaining: number;
    percentUsed: number;
    used: number;
    overagePermitted: boolean;
    overageCount: number;
    resetDate: string;
    fetchedAt: number;
    error?: string;
    errorType?: 'auth' | 'network' | 'rateLimit' | 'noPlan' | 'freePlan' | 'apiChanged' | 'unknown';
}

export interface Account {
    id: string;
    label: string;
}

export interface AuthenticatedAccount extends Account {
    accessToken: string;
}

export interface CopilotUserInfoResponse {
    copilot_plan?: string;
    quota_snapshots?: {
        premium_interactions?: {
            entitlement: number;
            percent_remaining: number;
            overage_permitted: boolean;
            overage_count: number;
        };
    };
    quota_reset_date?: string;
    organization_list?: string[];
}

export interface RefreshState {
    accountId: string;
    state: 'loading' | 'done' | 'error' | 'cooldown';
    cooldownRemaining?: number;
}

export interface SetupAccountInfo {
    id: string;
    label: string;
    authenticated: boolean;
    hasQuota: boolean;
}

export type WebviewToExtensionMessage =
    | { type: 'refreshAccount'; accountId: string }
    | { type: 'refreshAll' }
    | { type: 'openSetup' }
    | { type: 'authenticate'; accountId: string }
    | { type: 'removeAccount'; accountId: string }
    | { type: 'doneSetup' }
    | { type: 'closeSetup' }
    | { type: 'saveSettings'; settings: SettingsPayload }
    | { type: 'ready' };

export interface SettingsPayload {
    autoRefreshInterval: number;
    refreshCooldown: number;
    refreshAllCooldown: number;
    showInStatusBar: boolean;
    statusBarAlignment: 'left' | 'right';
    staleThreshold: number;
    refreshOnStartup: boolean;
}

export type ExtensionToWebviewMessage =
    | { type: 'quotaUpdate'; accounts: QuotaData[]; lastRefresh: string; staleThreshold: number }
    | { type: 'refreshState'; accountId: string; state: string; cooldownRemaining?: number }
    | { type: 'refreshAllState'; state: string; cooldownRemaining?: number }
    | { type: 'setupData'; accounts: SetupAccountInfo[] }
    | { type: 'authResult'; accountId: string; success: boolean }
    | { type: 'settings'; settings: SettingsPayload }
    | { type: 'showView'; view: 'main' | 'setup' };
