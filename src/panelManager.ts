import * as vscode from 'vscode';
import { QuotaData, SetupAccountInfo, SettingsPayload, WebviewToExtensionMessage } from './types';

export class PanelManager {
    private panel: vscode.WebviewPanel | undefined;
    private extensionUri: vscode.Uri;
    private currentView: 'main' | 'setup' = 'main';

    private onRefreshAccount: (accountId: string) => void = () => {};
    private onRefreshAll: () => void = () => {};
    private onOpenSetup: () => void = () => {};
    private onAuthenticate: (accountId: string) => void = () => {};
    private onRemoveAccount: (accountId: string) => void = () => {};
    private onDoneSetup: () => void = () => {};
    private onCloseSetup: () => void = () => {};
    private onSaveSettings: ((settings: SettingsPayload) => void) | null = null;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    setHandlers(handlers: {
        onRefreshAccount: (accountId: string) => void;
        onRefreshAll: () => void;
        onOpenSetup: () => void;
        onAuthenticate: (accountId: string) => void;
        onRemoveAccount: (accountId: string) => void;
        onDoneSetup: () => void;
        onCloseSetup?: () => void;
        onSaveSettings?: (settings: SettingsPayload) => void;
    }): void {
        this.onRefreshAccount = handlers.onRefreshAccount;
        this.onRefreshAll = handlers.onRefreshAll;
        this.onOpenSetup = handlers.onOpenSetup;
        this.onAuthenticate = handlers.onAuthenticate;
        this.onRemoveAccount = handlers.onRemoveAccount;
        this.onDoneSetup = handlers.onDoneSetup;
        this.onCloseSetup = handlers.onCloseSetup || (() => {});
        this.onSaveSettings = handlers.onSaveSettings || null;
    }

    openPanel(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.currentView = 'main';
        this.createPanel();
    }

    openSetup(): void {
        this.currentView = 'setup';
        if (this.panel) {
            this.panel.webview.html = this.getHtml();
            this.panel.reveal();
        } else {
            this.createPanel();
        }
    }

    showMainView(): void {
        this.currentView = 'main';
        if (this.panel) {
            this.panel.webview.html = this.getHtml();
        }
    }

    updateQuotaDisplay(accounts: QuotaData[], lastRefresh: string, staleThreshold?: number): void {
        this.panel?.webview.postMessage({
            type: 'quotaUpdate',
            accounts,
            lastRefresh,
            staleThreshold: staleThreshold ?? 30,
        });
    }

    sendRefreshState(
        accountId: string,
        state: string,
        cooldownRemaining?: number
    ): void {
        this.panel?.webview.postMessage({
            type: 'refreshState',
            accountId,
            state,
            cooldownRemaining,
        });
    }

    sendRefreshAllState(state: string, cooldownRemaining?: number): void {
        this.panel?.webview.postMessage({
            type: 'refreshAllState',
            state,
            cooldownRemaining,
        });
    }

    sendSetupData(accounts: SetupAccountInfo[]): void {
        this.panel?.webview.postMessage({
            type: 'setupData',
            accounts,
        });
    }

    sendAuthResult(accountId: string, success: boolean): void {
        this.panel?.webview.postMessage({
            type: 'authResult',
            accountId,
            success,
        });
    }

    sendSettings(settings: SettingsPayload): void {
        this.panel?.webview.postMessage({
            type: 'settings',
            settings,
        });
    }

    get isVisible(): boolean {
        return this.panel?.visible ?? false;
    }

    dispose(): void {
        this.panel?.dispose();
    }

    private createPanel(): void {
        this.panel = vscode.window.createWebviewPanel(
            'copilotQuota',
            'Copilot Quota',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'src', 'webview'),
                ],
                retainContextWhenHidden: true,
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.panel.webview.onDidReceiveMessage(
            (msg: WebviewToExtensionMessage) => {
                switch (msg.type) {
                    case 'refreshAccount':
                        this.onRefreshAccount(msg.accountId);
                        break;
                    case 'refreshAll':
                        this.onRefreshAll();
                        break;
                    case 'openSetup':
                        this.onOpenSetup();
                        break;
                    case 'authenticate':
                        this.onAuthenticate(msg.accountId);
                        break;
                    case 'removeAccount':
                        this.onRemoveAccount(msg.accountId);
                        break;
                    case 'doneSetup':
                        this.onDoneSetup();
                        break;
                    case 'closeSetup':
                        this.onCloseSetup();
                        break;
                    case 'saveSettings':
                        if (this.onSaveSettings) {
                            this.onSaveSettings(msg.settings);
                        }
                        break;
                    case 'ready':
                        break;
                }
            }
        );

        this.panel.webview.html = this.getHtml();
    }

    private getHtml(): string {
        if (!this.panel) {
            return '';
        }

        const webview = this.panel.webview;
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'style.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                'src',
                'webview',
                'script.js'
            )
        );

        const nonce = getNonce();
        const cspSource = webview.cspSource;

        if (this.currentView === 'setup') {
            return this.getSetupHtml(nonce, cspSource, styleUri, scriptUri);
        }
        return this.getMainHtml(
            nonce,
            cspSource,
            styleUri,
            scriptUri
        );
    }

    private getMainHtml(
        nonce: string,
        cspSource: string,
        styleUri: vscode.Uri,
        scriptUri: vscode.Uri
    ): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Copilot Quota</title>
</head>
<body>
    <div id="app" data-view="main">
        <header class="header">
            <button id="refreshAllBtn" class="btn btn-primary" title="Refresh All">
                <svg class="icon icon-refresh" viewBox="0 0 16 16" width="14" height="14">
                    <path fill="currentColor" d="M13.45 2.55a7 7 0 0 0-9.9 0L2.12 1.12A.5.5 0 0 0 1.5 1.5V5h3.5a.5.5 0 0 0 .35-.85L4.09 2.88a5.5 5.5 0 0 1 7.78 0A5.5 5.5 0 0 1 13.5 8a.75.75 0 0 0 1.5 0 7 7 0 0 0-1.55-5.45zM2.5 8a.75.75 0 0 0-1.5 0 7 7 0 0 0 11.45 5.45l1.43 1.43a.5.5 0 0 0 .85-.35V11h-3.5a.5.5 0 0 0-.35.85l1.26 1.27a5.5 5.5 0 0 1-7.78 0A5.5 5.5 0 0 1 2.5 8z"/>
                </svg>
                <span id="refreshAllText">Refresh All</span>
            </button>
            <h1 class="title">Usage</h1>
            <span id="lastRefresh" class="last-refresh">--</span>
        </header>
        <div id="accountsContainer" class="accounts-container"></div>
        <div class="setup-link-container">
            <button id="setupBtn" class="btn btn-outline">Setup Accounts</button>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getSetupHtml(
        nonce: string,
        cspSource: string,
        styleUri: vscode.Uri,
        scriptUri: vscode.Uri
    ): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Setup Copilot Quota</title>
</head>
<body>
    <div id="app" data-view="setup">
        <div class="setup-wizard">
            <h1 class="setup-title">Setup Copilot Quota Monitor</h1>
            <p id="setupStatus" class="setup-status">Discovering GitHub accounts...</p>
            <div id="setupAccountsContainer" class="setup-accounts-container"></div>
            <div class="setup-settings-section">
                <h2 class="setup-settings-title">Settings</h2>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Auto-refresh interval</span>
                        <span class="setup-setting-desc">How often to fetch fresh quota data (minutes)</span>
                    </div>
                    <input type="number" id="settingAutoRefresh" class="setup-setting-input" min="5" step="1" />
                </div>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Per-account cooldown</span>
                        <span class="setup-setting-desc">Minimum seconds between refreshes for one account</span>
                    </div>
                    <input type="number" id="settingAccountCooldown" class="setup-setting-input" min="30" step="10" />
                </div>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Refresh All cooldown</span>
                        <span class="setup-setting-desc">Minimum seconds between Refresh All actions</span>
                    </div>
                    <input type="number" id="settingAllCooldown" class="setup-setting-input" min="60" step="10" />
                </div>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Show in status bar</span>
                        <span class="setup-setting-desc">Display quota percentage in the VS Code status bar</span>
                    </div>
                    <label class="setup-toggle">
                        <input type="checkbox" id="settingStatusBar" />
                        <span class="setup-toggle-slider"></span>
                    </label>
                </div>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Status bar position</span>
                        <span class="setup-setting-desc">Which side of the status bar to show the icon</span>
                    </div>
                    <select id="settingBarAlign" class="setup-setting-select">
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                    </select>
                </div>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Stale threshold</span>
                        <span class="setup-setting-desc">Minutes after which a card is marked as stale</span>
                    </div>
                    <input type="number" id="settingStaleThreshold" class="setup-setting-input" min="5" step="5" />
                </div>
                <div class="setup-setting-row">
                    <div class="setup-setting-info">
                        <span class="setup-setting-label">Refresh on startup</span>
                        <span class="setup-setting-desc">Automatically refresh all accounts when VS Code starts</span>
                    </div>
                    <label class="setup-toggle">
                        <input type="checkbox" id="settingRefreshOnStartup" />
                        <span class="setup-toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="setup-actions">
                <button id="closeSetupBtn" class="btn btn-secondary">Close</button>
                <button id="doneSetupBtn" class="btn btn-primary">Save & Refresh</button>
            </div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
