import * as vscode from 'vscode';
import { QuotaData } from './types';

export class StatusBar {
    private item: vscode.StatusBarItem;
    private latestQuotas: QuotaData[] = [];

    constructor() {
        this.item = this.createItem();
        this.showSetup();
    }

    private createItem(): vscode.StatusBarItem {
        const config = vscode.workspace.getConfiguration('copilotQuota');
        const alignment =
            config.get<string>('statusBarAlignment', 'right') === 'left'
                ? vscode.StatusBarAlignment.Left
                : vscode.StatusBarAlignment.Right;

        const item = vscode.window.createStatusBarItem(alignment, 99);
        item.command = 'copilotQuota.openPanel';
        item.name = 'Copilot Quota Monitor';
        return item;
    }

    recreate(): void {
        const wasVisible = this.item.text !== '';
        this.item.dispose();
        this.item = this.createItem();
        if (this.latestQuotas.length > 0) {
            this.update(this.latestQuotas);
        } else if (wasVisible) {
            this.showSetup();
        }
    }

    update(quotas: QuotaData[]): void {
        this.latestQuotas = quotas;
        const config = vscode.workspace.getConfiguration('copilotQuota');
        if (!config.get<boolean>('showInStatusBar', true)) {
            this.item.hide();
            return;
        }

        const validQuotas = quotas.filter((q) => !q.error);
        if (validQuotas.length === 0) {
            if (quotas.length === 0) {
                this.showSetup();
            } else {
                this.showError();
            }
            return;
        }

        let bestAccount = validQuotas[0];
        for (const q of validQuotas) {
            if (q.percentRemaining > bestAccount.percentRemaining) {
                bestAccount = q;
            }
        }
        const displayPercent =
            Math.round(Math.max(0, bestAccount.percentRemaining) * 10) / 10;

        this.item.text = `$(pulse) ${displayPercent}%`;

        if (bestAccount.percentRemaining > 50) {
            this.item.color = undefined;
            this.item.backgroundColor = undefined;
        } else if (bestAccount.percentRemaining >= 20) {
            this.item.color = new vscode.ThemeColor(
                'statusBarItem.warningForeground'
            );
            this.item.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        } else {
            this.item.color = new vscode.ThemeColor(
                'statusBarItem.errorForeground'
            );
            this.item.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.errorBackground'
            );
        }

        this.item.tooltip = `Copilot Quota: ${displayPercent}% remaining — ${bestAccount.accountLabel} (best of ${validQuotas.length} account(s))`;
        this.item.show();
    }

    showLoading(): void {
        this.item.text = '$(loading~spin) Quota';
        this.item.tooltip = 'Copilot Quota: Loading...';
        this.item.color = undefined;
        this.item.backgroundColor = undefined;
        this.item.show();
    }

    showError(): void {
        this.item.text = '$(error) Quota';
        this.item.tooltip = 'Copilot Quota: Error fetching data';
        this.item.color = new vscode.ThemeColor(
            'statusBarItem.errorForeground'
        );
        this.item.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.errorBackground'
        );
        this.item.show();
    }

    showSetup(): void {
        this.item.text = '$(pulse) Setup Quota';
        this.item.tooltip = 'Copilot Quota: Click to set up accounts';
        this.item.color = undefined;
        this.item.backgroundColor = undefined;
        this.item.show();
    }

    dispose(): void {
        this.item.dispose();
    }
}
