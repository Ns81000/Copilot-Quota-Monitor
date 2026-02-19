import * as vscode from 'vscode';

export class RateLimiter {
    private perAccountLastRefresh = new Map<string, number>();
    private lastRefreshAll = 0;
    private activeRequests = 0;
    private readonly maxConcurrent = 3;
    private requestQueue: Array<() => void> = [];

    getPerAccountCooldown(): number {
        return vscode.workspace.getConfiguration('copilotQuota').get<number>('refreshCooldown', 60);
    }

    getRefreshAllCooldown(): number {
        return vscode.workspace.getConfiguration('copilotQuota').get<number>('refreshAllCooldown', 120);
    }

    canRefresh(accountId: string): { allowed: boolean; waitSeconds: number } {
        const cooldown = this.getPerAccountCooldown() * 1000;
        const lastRefresh = this.perAccountLastRefresh.get(accountId) || 0;
        const elapsed = Date.now() - lastRefresh;
        if (elapsed >= cooldown) {
            return { allowed: true, waitSeconds: 0 };
        }
        return { allowed: false, waitSeconds: Math.ceil((cooldown - elapsed) / 1000) };
    }

    canRefreshAll(): { allowed: boolean; waitSeconds: number } {
        const cooldown = this.getRefreshAllCooldown() * 1000;
        const elapsed = Date.now() - this.lastRefreshAll;
        if (elapsed >= cooldown) {
            return { allowed: true, waitSeconds: 0 };
        }
        return { allowed: false, waitSeconds: Math.ceil((cooldown - elapsed) / 1000) };
    }

    recordRefresh(accountId: string): void {
        this.perAccountLastRefresh.set(accountId, Date.now());
    }

    recordRefreshAll(): void {
        this.lastRefreshAll = Date.now();
    }

    resetCooldown(accountId: string): void {
        this.perAccountLastRefresh.delete(accountId);
    }

    resetAllCooldowns(): void {
        this.perAccountLastRefresh.clear();
        this.lastRefreshAll = 0;
    }

    async acquireSlot(): Promise<void> {
        if (this.activeRequests < this.maxConcurrent) {
            this.activeRequests++;
            return;
        }
        return new Promise<void>((resolve) => {
            this.requestQueue.push(() => {
                this.activeRequests++;
                resolve();
            });
        });
    }

    releaseSlot(): void {
        this.activeRequests--;
        const next = this.requestQueue.shift();
        if (next) {
            next();
        }
    }
}
