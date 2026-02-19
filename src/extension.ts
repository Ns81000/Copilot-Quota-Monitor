import * as vscode from 'vscode';
import { StatusBar } from './statusBar';
import { PanelManager } from './panelManager';
import { AccountManager } from './accountManager';
import { QuotaService } from './quotaService';
import { RateLimiter } from './rateLimiter';
import { Cache } from './cache';
import { QuotaData } from './types';

let statusBar: StatusBar;
let panelManager: PanelManager;
let accountManager: AccountManager;
let quotaService: QuotaService;
let rateLimiter: RateLimiter;
let cache: Cache;
let outputChannel: vscode.OutputChannel;
let autoRefreshTimer: ReturnType<typeof setInterval> | undefined;
let allQuotas: QuotaData[] = [];
let lastRefreshTimestamp = 0;
let sessionChangeTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Copilot Quota Monitor');
    outputChannel.appendLine('[Extension] Activating...');

    rateLimiter = new RateLimiter();
    cache = new Cache(context.globalState);
    accountManager = new AccountManager(outputChannel);
    quotaService = new QuotaService(outputChannel, rateLimiter);
    statusBar = new StatusBar();
    panelManager = new PanelManager(context.extensionUri);

    panelManager.setHandlers({
        onRefreshAccount: (accountId) => refreshSingleAccount(accountId),
        onRefreshAll: () => refreshAllAccounts(),
        onOpenSetup: () => runSetup(),
        onAuthenticate: (accountId) => authenticateAccount(accountId),
        onRemoveAccount: (accountId) => removeAccount(accountId),
        onDoneSetup: () => finishSetup(),
        onCloseSetup: () => closeSetup(),
        onSaveSettings: (settings) => saveSettings(settings),
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('copilotQuota.openPanel', () => {
            if (
                allQuotas.length === 0 &&
                cache.loadAccountList().length === 0
            ) {
                runSetup();
            } else {
                panelManager.openPanel();
                sendCurrentData();
            }
        }),
        vscode.commands.registerCommand(
            'copilotQuota.refresh',
            (accountId?: string) => {
                if (accountId) {
                    refreshSingleAccount(accountId);
                }
            }
        ),
        vscode.commands.registerCommand('copilotQuota.refreshAll', () => {
            refreshAllAccounts();
        }),
        vscode.commands.registerCommand('copilotQuota.setup', () => {
            runSetup();
        }),
        vscode.authentication.onDidChangeSessions((e) => {
            if (e.provider.id === 'github') {
                outputChannel.appendLine(
                    '[Extension] GitHub sessions changed, refreshing...'
                );
                if (sessionChangeTimer) {
                    clearTimeout(sessionChangeTimer);
                }
                sessionChangeTimer = setTimeout(() => refreshAllAccounts(), 2000);
            }
        }),
        statusBar,
        panelManager,
        outputChannel
    );

    const cachedQuotas = cache.loadAllQuotas();
    if (cachedQuotas.size > 0) {
        allQuotas = Array.from(cachedQuotas.values());
        lastRefreshTimestamp = cache.loadLastRefresh();
        statusBar.update(allQuotas);
        outputChannel.appendLine(
            `[Extension] Loaded ${allQuotas.length} cached account(s)`
        );
    }

    setTimeout(() => {
        const config = vscode.workspace.getConfiguration('copilotQuota');
        if (
            config.get<boolean>('refreshOnStartup', true) &&
            cache.loadAccountList().length > 0
        ) {
            refreshAllAccounts();
        }
    }, 10000);

    startAutoRefresh();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration('copilotQuota.autoRefreshInterval')
            ) {
                startAutoRefresh();
            }
            if (e.affectsConfiguration('copilotQuota.showInStatusBar')) {
                statusBar.update(allQuotas);
            }
            if (e.affectsConfiguration('copilotQuota.statusBarAlignment')) {
                statusBar.recreate();
            }
        })
    );

    outputChannel.appendLine('[Extension] Activated successfully');
}

function startAutoRefresh(): void {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    const config = vscode.workspace.getConfiguration('copilotQuota');
    const intervalMinutes = Math.max(
        5,
        config.get<number>('autoRefreshInterval', 10)
    );
    autoRefreshTimer = setInterval(() => {
        outputChannel.appendLine('[Extension] Auto-refresh triggered');
        refreshAllAccounts(true);
    }, intervalMinutes * 60 * 1000);
}

async function refreshAllAccounts(bypassCooldown = false): Promise<void> {
    if (!bypassCooldown) {
        const check = rateLimiter.canRefreshAll();
        if (!check.allowed) {
            outputChannel.appendLine(
                `[Extension] Refresh All on cooldown (${check.waitSeconds}s remaining)`
            );
            panelManager.sendRefreshAllState('cooldown', check.waitSeconds);
            return;
        }
    }

    panelManager.sendRefreshAllState('loading');
    statusBar.showLoading();

    try {
        const knownIds = cache.loadAccountList();
        const authenticated =
            await accountManager.getAuthenticatedAccounts(knownIds);
        if (authenticated.length === 0) {
            outputChannel.appendLine(
                '[Extension] No authenticated accounts found'
            );
            statusBar.showSetup();
            return;
        }

        const results = await quotaService.fetchAllQuotas(authenticated);
        for (const result of results) {
            const idx = allQuotas.findIndex(
                (q) => q.accountId === result.accountId
            );
            if (idx >= 0) {
                allQuotas[idx] = result;
            } else {
                allQuotas.push(result);
            }
        }
        lastRefreshTimestamp = Date.now();

        for (const quota of results) {
            cache.saveQuota(quota.accountId, quota);
            rateLimiter.recordRefresh(quota.accountId);
        }
        cache.saveLastRefresh(lastRefreshTimestamp);
        rateLimiter.recordRefreshAll();

        statusBar.update(allQuotas);
        sendCurrentData();
        panelManager.sendRefreshAllState('done');

        outputChannel.appendLine(
            `[Extension] Refreshed ${results.length} account(s)`
        );
    } catch (err) {
        outputChannel.appendLine(`[Extension] Error refreshing all: ${err}`);
        statusBar.showError();
        panelManager.sendRefreshAllState('error');
    }
}

async function refreshSingleAccount(accountId: string): Promise<void> {
    const check = rateLimiter.canRefresh(accountId);
    if (!check.allowed) {
        outputChannel.appendLine(
            `[Extension] Account ${accountId} on cooldown (${check.waitSeconds}s)`
        );
        panelManager.sendRefreshState(
            accountId,
            'cooldown',
            check.waitSeconds
        );
        return;
    }

    panelManager.sendRefreshState(accountId, 'loading');

    try {
        const existing = allQuotas.find((q) => q.accountId === accountId);
        const label = existing?.accountLabel || accountId;
        const session = await accountManager.getSessionForAccount(
            { id: accountId, label },
            false
        );
        if (!session) {
            panelManager.sendRefreshState(accountId, 'error');
            return;
        }

        const result = await quotaService.fetchQuota({
            id: accountId,
            label,
            accessToken: session.accessToken,
        });
        rateLimiter.recordRefresh(accountId);
        cache.saveQuota(accountId, result);

        const idx = allQuotas.findIndex((q) => q.accountId === accountId);
        if (idx >= 0) {
            allQuotas[idx] = result;
        } else {
            allQuotas.push(result);
        }

        lastRefreshTimestamp = Date.now();
        cache.saveLastRefresh(lastRefreshTimestamp);

        statusBar.update(allQuotas);
        sendCurrentData();
        panelManager.sendRefreshState(accountId, 'done');
    } catch (err) {
        outputChannel.appendLine(
            `[Extension] Error refreshing ${accountId}: ${err}`
        );
        panelManager.sendRefreshState(accountId, 'error');
    }
}

async function runSetup(): Promise<void> {
    panelManager.openSetup();

    const accounts = await accountManager.discoverAccounts();
    const knownIds = cache.loadAccountList();
    const setupInfo = [];

    for (const account of accounts) {
        const isKnown = knownIds.includes(account.id);
        let authenticated = false;
        if (isKnown) {
            const session = await accountManager.getSessionForAccount(
                account,
                false
            );
            authenticated = !!session;
        }
        setupInfo.push({
            id: account.id,
            label: account.label,
            authenticated,
            hasQuota: false,
        });
    }

    panelManager.sendSetupData(setupInfo);

    const config = vscode.workspace.getConfiguration('copilotQuota');
    panelManager.sendSettings({
        autoRefreshInterval: config.get<number>('autoRefreshInterval', 10),
        refreshCooldown: config.get<number>('refreshCooldown', 60),
        refreshAllCooldown: config.get<number>('refreshAllCooldown', 120),
        showInStatusBar: config.get<boolean>('showInStatusBar', true),
        statusBarAlignment: config.get<'left' | 'right'>('statusBarAlignment', 'right'),
        staleThreshold: config.get<number>('staleThreshold', 30),
        refreshOnStartup: config.get<boolean>('refreshOnStartup', true),
    });
}

async function saveSettings(settings: {
    autoRefreshInterval: number;
    refreshCooldown: number;
    refreshAllCooldown: number;
    showInStatusBar: boolean;
    statusBarAlignment: 'left' | 'right';
    staleThreshold: number;
    refreshOnStartup: boolean;
}): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilotQuota');
    await Promise.all([
        config.update('autoRefreshInterval', settings.autoRefreshInterval, vscode.ConfigurationTarget.Global),
        config.update('refreshCooldown', settings.refreshCooldown, vscode.ConfigurationTarget.Global),
        config.update('refreshAllCooldown', settings.refreshAllCooldown, vscode.ConfigurationTarget.Global),
        config.update('showInStatusBar', settings.showInStatusBar, vscode.ConfigurationTarget.Global),
        config.update('statusBarAlignment', settings.statusBarAlignment, vscode.ConfigurationTarget.Global),
        config.update('staleThreshold', settings.staleThreshold, vscode.ConfigurationTarget.Global),
        config.update('refreshOnStartup', settings.refreshOnStartup, vscode.ConfigurationTarget.Global),
    ]);
    outputChannel.appendLine('[Extension] Settings saved');
}

async function authenticateAccount(accountId: string): Promise<void> {
    const accounts = await accountManager.discoverAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
        return;
    }

    const session = await accountManager.authenticateAccount(account);
    if (session) {
        outputChannel.appendLine(
            `[Extension] Account ${account.label} authenticated, fetching quota...`
        );
        rateLimiter.resetCooldown(account.id);
        try {
            const result = await quotaService.fetchQuota({
                id: account.id,
                label: account.label,
                accessToken: session.accessToken,
            });
            cache.saveQuota(account.id, result);
            const accountList = cache.loadAccountList();
            if (!accountList.includes(account.id)) {
                cache.saveAccountList([...accountList, account.id]);
            }
            const idx = allQuotas.findIndex(
                (q) => q.accountId === account.id
            );
            if (idx >= 0) {
                allQuotas[idx] = result;
            } else {
                allQuotas.push(result);
            }
            statusBar.update(allQuotas);
        } catch (err) {
            outputChannel.appendLine(
                `[Extension] Error fetching quota after auth for ${account.label}: ${err}`
            );
        }
        panelManager.sendAuthResult(account.id, true);
        runSetup();
    } else {
        outputChannel.appendLine(
            `[Extension] Authentication failed/cancelled for ${account.label}`
        );
        panelManager.sendAuthResult(account.id, false);
        runSetup();
    }
}

async function removeAccount(accountId: string): Promise<void> {
    cache.removeAccount(accountId);
    allQuotas = allQuotas.filter((q) => q.accountId !== accountId);
    statusBar.update(allQuotas);
    sendCurrentData();
    outputChannel.appendLine(`[Extension] Removed account ${accountId}`);
}

async function finishSetup(): Promise<void> {
    panelManager.showMainView();
    rateLimiter.resetAllCooldowns();
    await refreshAllAccounts();
    sendCurrentData();
}

function closeSetup(): void {
    panelManager.showMainView();
    sendCurrentData();
}

function sendCurrentData(): void {
    const config = vscode.workspace.getConfiguration('copilotQuota');
    const staleThreshold = config.get<number>('staleThreshold', 30);
    const timeStr = lastRefreshTimestamp
        ? new Date(lastRefreshTimestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
          })
        : '--';
    const sorted = [...allQuotas].sort((a, b) => {
        const aIsBottom = a.errorType === 'freePlan' || !!a.error;
        const bIsBottom = b.errorType === 'freePlan' || !!b.error;
        if (aIsBottom !== bIsBottom) return aIsBottom ? 1 : -1;
        return b.percentRemaining - a.percentRemaining;
    });
    panelManager.updateQuotaDisplay(sorted, timeStr, staleThreshold);
}

export function deactivate() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    if (sessionChangeTimer) {
        clearTimeout(sessionChangeTimer);
    }
}
