import * as vscode from 'vscode';
import { QuotaData, CopilotUserInfoResponse, AuthenticatedAccount } from './types';
import { RateLimiter } from './rateLimiter';

const API_URL = 'https://api.github.com/copilot_internal/user';
const API_VERSION = '2025-05-01';

export class QuotaService {
    private outputChannel: vscode.OutputChannel;
    private rateLimiter: RateLimiter;

    constructor(outputChannel: vscode.OutputChannel, rateLimiter: RateLimiter) {
        this.outputChannel = outputChannel;
        this.rateLimiter = rateLimiter;
    }

    async fetchQuota(account: AuthenticatedAccount): Promise<QuotaData> {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(
            `[QuotaService] [${timestamp}] Fetching quota for ${account.label}...`
        );

        await this.rateLimiter.acquireSlot();
        try {
            const response = await fetch(API_URL, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${account.accessToken}`,
                    'X-GitHub-Api-Version': API_VERSION,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                const errorData = this.buildErrorQuota(account, response.status);
                this.outputChannel.appendLine(
                    `[QuotaService] HTTP ${response.status} for ${account.label}`
                );
                return errorData;
            }

            const json = (await response.json()) as CopilotUserInfoResponse;
            this.outputChannel.appendLine(
                `[QuotaService] Success for ${account.label}: plan=${json.copilot_plan}`
            );
            return this.parseResponse(account, json);
        } catch (err: unknown) {
            this.outputChannel.appendLine(
                `[QuotaService] Network error for ${account.label}: ${err}`
            );
            return {
                accountId: account.id,
                accountLabel: account.label,
                plan: '',
                entitlement: 0,
                percentRemaining: 0,
                percentUsed: 0,
                used: 0,
                overagePermitted: false,
                overageCount: 0,
                resetDate: '',
                fetchedAt: Date.now(),
                error: 'Network error',
                errorType: 'network',
            };
        } finally {
            this.rateLimiter.releaseSlot();
        }
    }

    async fetchAllQuotas(accounts: AuthenticatedAccount[]): Promise<QuotaData[]> {
        const results = await Promise.all(
            accounts.map((account) => this.fetchQuota(account))
        );
        return results;
    }

    private parseResponse(
        account: AuthenticatedAccount,
        json: CopilotUserInfoResponse
    ): QuotaData {
        const planName = this.getPlanDisplayName(json.copilot_plan);

        if (!json.quota_snapshots?.premium_interactions) {
            if (!json.copilot_plan) {
                return {
                    accountId: account.id,
                    accountLabel: account.label,
                    plan: '',
                    entitlement: 0,
                    percentRemaining: 0,
                    percentUsed: 0,
                    used: 0,
                    overagePermitted: false,
                    overageCount: 0,
                    resetDate: '',
                    fetchedAt: Date.now(),
                    error: 'No Copilot plan',
                    errorType: 'noPlan',
                };
            }

            const isFree =
                !json.quota_snapshots ||
                !json.quota_snapshots.premium_interactions;
            if (isFree) {
                return {
                    accountId: account.id,
                    accountLabel: account.label,
                    plan: json.copilot_plan,
                    entitlement: 0,
                    percentRemaining: 0,
                    percentUsed: 0,
                    used: 0,
                    overagePermitted: false,
                    overageCount: 0,
                    resetDate: json.quota_reset_date || '',
                    fetchedAt: Date.now(),
                    error: `${planName} -- No premium quota`,
                    errorType: 'freePlan',
                };
            }
        }

        const qi = json.quota_snapshots!.premium_interactions!;
        const entitlement = qi.entitlement;
        const percentRemaining = qi.percent_remaining;
        const used = Math.max(0, entitlement * (1 - percentRemaining / 100));
        const percentUsed = 100 - percentRemaining;

        return {
            accountId: account.id,
            accountLabel: account.label,
            plan: json.copilot_plan || '',
            entitlement,
            percentRemaining,
            percentUsed: Math.round(percentUsed * 10) / 10,
            used: Math.round(used),
            overagePermitted: qi.overage_permitted,
            overageCount: qi.overage_count,
            resetDate: json.quota_reset_date || '',
            fetchedAt: Date.now(),
        };
    }

    private getPlanDisplayName(plan?: string): string {
        switch (plan) {
            case 'individual': return 'Copilot Pro';
            case 'individual_pro': return 'Copilot Pro+';
            case 'business': return 'Copilot Business';
            case 'enterprise': return 'Copilot Enterprise';
            default: return 'Copilot Free';
        }
    }

    private buildErrorQuota(
        account: AuthenticatedAccount,
        status: number
    ): QuotaData {
        let error = 'Unknown error';
        let errorType: QuotaData['errorType'] = 'unknown';

        if (status === 401 || status === 403) {
            error = 'Authentication failed';
            errorType = 'auth';
        } else if (status === 429) {
            error = 'Rate limited';
            errorType = 'rateLimit';
        } else if (status === 404) {
            error = 'API endpoint not found';
            errorType = 'apiChanged';
        } else {
            error = `HTTP ${status}`;
            errorType = 'unknown';
        }

        return {
            accountId: account.id,
            accountLabel: account.label,
            plan: '',
            entitlement: 0,
            percentRemaining: 0,
            percentUsed: 0,
            used: 0,
            overagePermitted: false,
            overageCount: 0,
            resetDate: '',
            fetchedAt: Date.now(),
            error,
            errorType,
        };
    }
}
