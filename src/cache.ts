import * as vscode from 'vscode';
import { QuotaData } from './types';

export class Cache {
    constructor(private globalState: vscode.Memento) {}

    saveQuota(accountId: string, data: QuotaData): void {
        this.globalState.update(`quota_${accountId}`, { ...data, cachedAt: Date.now() });
    }

    loadQuota(accountId: string): QuotaData | undefined {
        return this.globalState.get<QuotaData>(`quota_${accountId}`);
    }

    loadAllQuotas(): Map<string, QuotaData> {
        const accountIds = this.loadAccountList();
        const map = new Map<string, QuotaData>();
        for (const id of accountIds) {
            const data = this.loadQuota(id);
            if (data) {
                map.set(id, data);
            }
        }
        return map;
    }

    saveAccountList(accountIds: string[]): void {
        this.globalState.update('accountList', accountIds);
    }

    loadAccountList(): string[] {
        return this.globalState.get<string[]>('accountList', []);
    }

    saveLastRefresh(timestamp: number): void {
        this.globalState.update('lastRefresh', timestamp);
    }

    loadLastRefresh(): number {
        return this.globalState.get<number>('lastRefresh', 0);
    }

    clearAll(): void {
        const accountIds = this.loadAccountList();
        for (const id of accountIds) {
            this.globalState.update(`quota_${id}`, undefined);
        }
        this.globalState.update('accountList', undefined);
        this.globalState.update('lastRefresh', undefined);
    }

    removeAccount(accountId: string): void {
        this.globalState.update(`quota_${accountId}`, undefined);
        const accountIds = this.loadAccountList().filter(
            (id) => id !== accountId
        );
        this.saveAccountList(accountIds);
    }
}
