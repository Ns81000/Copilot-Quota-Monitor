import * as vscode from 'vscode';
import { Account, AuthenticatedAccount } from './types';

export class AccountManager {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    async discoverAccounts(): Promise<Account[]> {
        try {
            const accounts = await vscode.authentication.getAccounts('github');
            this.outputChannel.appendLine(
                `[AccountManager] Discovered ${accounts.length} GitHub account(s)`
            );
            return accounts.map((a) => ({ id: a.id, label: a.label }));
        } catch (err) {
            this.outputChannel.appendLine(
                `[AccountManager] Error discovering accounts: ${err}`
            );
            return [];
        }
    }

    async getSessionForAccount(
        account: Account,
        createIfNone = false
    ): Promise<vscode.AuthenticationSession | null> {
        try {
            const session = await vscode.authentication.getSession(
                'github',
                ['copilot'],
                {
                    account: { id: account.id, label: account.label },
                    createIfNone,
                }
            );
            if (session) {
                this.outputChannel.appendLine(
                    `[AccountManager] Got session for ${account.label}`
                );
            }
            return session ?? null;
        } catch (err) {
            this.outputChannel.appendLine(
                `[AccountManager] Error getting session for ${account.label}: ${err}`
            );
            return null;
        }
    }

    async authenticateAccount(
        account: Account
    ): Promise<vscode.AuthenticationSession | null> {
        return this.getSessionForAccount(account, true);
    }

    async getAuthenticatedAccounts(
        knownAccountIds?: string[]
    ): Promise<AuthenticatedAccount[]> {
        const accounts = await this.discoverAccounts();
        const authenticated: AuthenticatedAccount[] = [];

        for (const account of accounts) {
            if (knownAccountIds && !knownAccountIds.includes(account.id)) {
                continue;
            }
            const session = await this.getSessionForAccount(account, false);
            if (session) {
                authenticated.push({
                    id: account.id,
                    label: account.label,
                    accessToken: session.accessToken,
                });
            }
        }

        this.outputChannel.appendLine(
            `[AccountManager] ${authenticated.length}/${accounts.length} accounts authenticated`
        );
        return authenticated;
    }
}
