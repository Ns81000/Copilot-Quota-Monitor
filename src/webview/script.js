(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const app = document.getElementById('app');
    const view = app ? app.getAttribute('data-view') : 'main';

    if (view === 'setup') {
        initSetupView();
    } else {
        initMainView();
    }

    vscode.postMessage({ type: 'ready' });

    /* ────────────────────────────────────────
       Main View
    ──────────────────────────────────────── */

    function initMainView() {
        const refreshAllBtn = document.getElementById('refreshAllBtn');
        const refreshAllText = document.getElementById('refreshAllText');
        const refreshAllIcon = refreshAllBtn
            ? refreshAllBtn.querySelector('.icon-refresh')
            : null;
        const setupBtn = document.getElementById('setupBtn');
        const accountsContainer = document.getElementById('accountsContainer');
        const lastRefreshEl = document.getElementById('lastRefresh');

        let allAccounts = [];
        let cooldownTimers = {};
        let refreshAllCooldownTimer = null;
        let staleThresholdMinutes = 30;

        if (refreshAllBtn) {
            refreshAllBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'refreshAll' });
            });
        }

        if (setupBtn) {
            setupBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'openSetup' });
            });
        }

        window.addEventListener('message', function (event) {
            var msg = event.data;
            switch (msg.type) {
                case 'quotaUpdate':
                    allAccounts = msg.accounts || [];
                    staleThresholdMinutes = msg.staleThreshold || 30;
                    if (lastRefreshEl) {
                        lastRefreshEl.textContent =
                            msg.lastRefresh && msg.lastRefresh !== '--'
                                ? 'Last: ' + msg.lastRefresh
                                : '--';
                    }
                    renderAccounts();
                    break;

                case 'refreshState':
                    updateCardRefreshState(
                        msg.accountId,
                        msg.state,
                        msg.cooldownRemaining
                    );
                    break;

                case 'refreshAllState':
                    updateRefreshAllState(msg.state, msg.cooldownRemaining);
                    break;
            }
        });

        function renderAccounts() {
            if (!accountsContainer) return;
            accountsContainer.innerHTML = '';

            if (allAccounts.length === 0) {
                accountsContainer.innerHTML =
                    '<div class="empty-state">' +
                    '<div class="empty-state-title">No accounts found</div>' +
                    '<div class="empty-state-text">Click "Setup Accounts" to get started.</div>' +
                    '</div>';
                return;
            }

            for (var i = 0; i < allAccounts.length; i++) {
                accountsContainer.appendChild(createAccountCard(allAccounts[i]));
            }
        }

        function createAccountCard(account) {
            var card = document.createElement('div');
            card.className = 'account-card';
            card.setAttribute('data-account-id', account.accountId);

            // Stale check — 30 minutes
            var age = Date.now() - (account.fetchedAt || 0);
            if (age > staleThresholdMinutes * 60 * 1000) {
                card.classList.add('card-stale');
            }

            // Free plan — show info card, not error
            if (account.errorType === 'freePlan') {
                card.classList.add('card-free');
                card.innerHTML = buildFreePlanCardHtml(account);
                attachCardListeners(card, account);
                return card;
            }

            if (account.error) {
                card.classList.add(
                    account.errorType === 'rateLimit' ||
                        account.errorType === 'auth'
                        ? 'card-warning'
                        : 'card-error'
                );
                card.innerHTML = buildErrorCardHtml(account);
                attachCardListeners(card, account);
                return card;
            }

            var username = truncateUsername(account.accountLabel, 18);
            var pctUsed = Math.round(account.percentUsed * 10) / 10;
            var barClass = getBarColorClass(Math.min(100, account.percentUsed));
            var resetStr = formatResetDate(account.resetDate);
            var usedCount = account.used || 0;
            var totalCount = account.entitlement || 0;
            var isOverage = pctUsed > 100;
            var fetchedStr = formatFetchedAt(account.fetchedAt);

            var pctDisplay = pctUsed + '%';
            if (isOverage) {
                pctDisplay =
                    '<span class="overage-badge">' + pctUsed + '%</span>';
            }

            var overageNote = '';
            if (isOverage) {
                overageNote =
                    '<span class="overage-note">Overage: ' +
                    (usedCount - totalCount) +
                    ' extra requests</span>';
            }

            card.innerHTML =
                '<div class="card-header">' +
                '<span class="card-username" title="' +
                escapeHtml(account.accountLabel) +
                '">' +
                escapeHtml(username) +
                '</span>' +
                '<div class="card-right">' +
                '<span class="card-percentage">' +
                pctDisplay +
                '</span>' +
                '<button class="btn-icon card-refresh-btn" data-action="refresh" data-account-id="' +
                escapeHtml(account.accountId) +
                '" title="Refresh">' +
                refreshIconSvg() +
                '</button>' +
                '<button class="btn-icon card-remove-btn" data-action="remove" data-account-id="' +
                escapeHtml(account.accountId) +
                '" title="Remove account">' +
                closeIconSvg() +
                '</button>' +
                '</div>' +
                '</div>' +
                '<div class="progress-bar-track">' +
                '<div class="progress-bar-fill ' +
                barClass +
                '" style="width:' +
                Math.min(100, Math.max(0, pctUsed)) +
                '%"></div>' +
                '</div>' +
                '<div class="card-details">' +
                '<span class="card-usage-text">' +
                usedCount +
                ' / ' +
                totalCount +
                ' requests</span>' +
                '<span class="card-reset-date">' +
                resetStr +
                '</span>' +
                '</div>' +
                (overageNote
                    ? '<div class="card-details">' + overageNote + '</div>'
                    : '') +
                '<div class="card-fetched-at">' +
                fetchedStr +
                '</div>';

            attachCardListeners(card, account);
            return card;
        }

        function buildFreePlanCardHtml(account) {
            var username = truncateUsername(account.accountLabel, 18);
            var fetchedStr = formatFetchedAt(account.fetchedAt);
            var planMsg = account.error || 'No premium quota';

            return (
                '<div class="card-header">' +
                '<span class="card-username" title="' +
                escapeHtml(account.accountLabel) +
                '">' +
                escapeHtml(username) +
                '</span>' +
                '<div class="card-right">' +
                '<span class="card-plan-badge">Free</span>' +
                '<button class="btn-icon card-refresh-btn" data-action="refresh" data-account-id="' +
                escapeHtml(account.accountId) +
                '" title="Refresh">' +
                refreshIconSvg() +
                '</button>' +
                '<button class="btn-icon card-remove-btn" data-action="remove" data-account-id="' +
                escapeHtml(account.accountId) +
                '" title="Remove account">' +
                closeIconSvg() +
                '</button>' +
                '</div>' +
                '</div>' +
                '<div class="card-free-message">' +
                escapeHtml(planMsg) +
                '</div>' +
                '<div class="card-fetched-at">' +
                fetchedStr +
                '</div>'
            );
        }

        function buildErrorCardHtml(account) {
            var username = truncateUsername(account.accountLabel, 18);
            var errorMsg = account.error || 'Unknown error';
            var fetchedStr = formatFetchedAt(account.fetchedAt);

            return (
                '<div class="card-header">' +
                '<span class="card-username" title="' +
                escapeHtml(account.accountLabel) +
                '">' +
                escapeHtml(username) +
                '</span>' +
                '<div class="card-right">' +
                '<button class="btn-icon card-refresh-btn" data-action="refresh" data-account-id="' +
                escapeHtml(account.accountId) +
                '" title="Refresh">' +
                refreshIconSvg() +
                '</button>' +
                '<button class="btn-icon card-remove-btn" data-action="remove" data-account-id="' +
                escapeHtml(account.accountId) +
                '" title="Remove account">' +
                closeIconSvg() +
                '</button>' +
                '</div>' +
                '</div>' +
                '<div class="card-error-message">' +
                escapeHtml(errorMsg) +
                '</div>' +
                '<div class="card-error-action">' +
                '<button class="btn btn-secondary btn-sm" data-action="refresh" data-account-id="' +
                escapeHtml(account.accountId) +
                '">Retry</button>' +
                '</div>' +
                '<div class="card-fetched-at">' +
                fetchedStr +
                '</div>'
            );
        }

        function attachCardListeners(card, account) {
            var btns = card.querySelectorAll('[data-action="refresh"]');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    vscode.postMessage({
                        type: 'refreshAccount',
                        accountId: account.accountId,
                    });
                });
            }
            var removeBtns = card.querySelectorAll('[data-action="remove"]');
            for (var j = 0; j < removeBtns.length; j++) {
                removeBtns[j].addEventListener('click', function () {
                    vscode.postMessage({
                        type: 'removeAccount',
                        accountId: account.accountId,
                    });
                });
            }
        }

        function updateCardRefreshState(accountId, state, cooldownRemaining) {
            var card = accountsContainer
                ? accountsContainer.querySelector(
                      '[data-account-id="' + accountId + '"]'
                  )
                : null;
            if (!card) return;

            var refreshBtn = card.querySelector('.card-refresh-btn');
            if (!refreshBtn) return;

            if (state === 'loading') {
                refreshBtn.disabled = true;
                var icon = refreshBtn.querySelector('.icon-refresh');
                if (icon) icon.classList.add('spinning');
            } else if (state === 'cooldown' && cooldownRemaining) {
                refreshBtn.disabled = true;
                var icon = refreshBtn.querySelector('.icon-refresh');
                if (icon) icon.classList.remove('spinning');
                startCooldownTimer(accountId, refreshBtn, cooldownRemaining);
            } else {
                refreshBtn.disabled = false;
                var icon = refreshBtn.querySelector('.icon-refresh');
                if (icon) icon.classList.remove('spinning');
                refreshBtn.innerHTML = refreshIconSvg();
            }
        }

        function startCooldownTimer(accountId, btn, seconds) {
            if (cooldownTimers[accountId]) {
                clearInterval(cooldownTimers[accountId]);
            }
            var remaining = seconds;
            btn.innerHTML =
                '<span class="cooldown-text">' + remaining + 's</span>';
            btn.disabled = true;

            cooldownTimers[accountId] = setInterval(function () {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(cooldownTimers[accountId]);
                    delete cooldownTimers[accountId];
                    btn.innerHTML = refreshIconSvg();
                    btn.disabled = false;
                } else {
                    btn.innerHTML =
                        '<span class="cooldown-text">' +
                        remaining +
                        's</span>';
                }
            }, 1000);
        }

        function updateRefreshAllState(state, cooldownRemaining) {
            if (!refreshAllBtn || !refreshAllText) return;

            if (state === 'loading') {
                refreshAllBtn.disabled = true;
                if (refreshAllIcon) refreshAllIcon.classList.add('spinning');
                refreshAllText.textContent = 'Refreshing...';
            } else if (state === 'cooldown' && cooldownRemaining) {
                refreshAllBtn.disabled = true;
                if (refreshAllIcon)
                    refreshAllIcon.classList.remove('spinning');
                startRefreshAllCooldown(cooldownRemaining);
            } else {
                refreshAllBtn.disabled = false;
                if (refreshAllIcon)
                    refreshAllIcon.classList.remove('spinning');
                refreshAllText.textContent = 'Refresh All';
                if (refreshAllCooldownTimer) {
                    clearInterval(refreshAllCooldownTimer);
                    refreshAllCooldownTimer = null;
                }
            }
        }

        function startRefreshAllCooldown(seconds) {
            if (refreshAllCooldownTimer) {
                clearInterval(refreshAllCooldownTimer);
            }
            var remaining = seconds;
            if (refreshAllText) {
                refreshAllText.textContent =
                    'Refresh All (' + remaining + 's)';
            }

            refreshAllCooldownTimer = setInterval(function () {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(refreshAllCooldownTimer);
                    refreshAllCooldownTimer = null;
                    if (refreshAllBtn) refreshAllBtn.disabled = false;
                    if (refreshAllText)
                        refreshAllText.textContent = 'Refresh All';
                } else {
                    if (refreshAllText)
                        refreshAllText.textContent =
                            'Refresh All (' + remaining + 's)';
                }
            }, 1000);
        }

        // Show skeleton loading initially
        if (accountsContainer && allAccounts.length === 0) {
            var skeletons = '';
            for (var s = 0; s < 2; s++) {
                skeletons +=
                    '<div class="skeleton-card">' +
                    '<div class="skeleton-line short"></div>' +
                    '<div class="skeleton-line full"></div>' +
                    '<div class="skeleton-line medium"></div>' +
                    '</div>';
            }
            accountsContainer.innerHTML = skeletons;
        }
    }

    /* ────────────────────────────────────────
       Setup View
    ──────────────────────────────────────── */

    function initSetupView() {
        var setupAccountsContainer = document.getElementById(
            'setupAccountsContainer'
        );
        var setupStatus = document.getElementById('setupStatus');
        var doneBtn = document.getElementById('doneSetupBtn');
        var closeBtn = document.getElementById('closeSetupBtn');
        var settingAutoRefresh = document.getElementById('settingAutoRefresh');
        var settingAccountCooldown = document.getElementById('settingAccountCooldown');
        var settingAllCooldown = document.getElementById('settingAllCooldown');
        var settingStatusBar = document.getElementById('settingStatusBar');
        var settingBarAlign = document.getElementById('settingBarAlign');
        var settingStaleThreshold = document.getElementById('settingStaleThreshold');
        var settingRefreshOnStartup = document.getElementById('settingRefreshOnStartup');

        function sendSettings() {
            vscode.postMessage({
                type: 'saveSettings',
                settings: {
                    autoRefreshInterval: parseInt(settingAutoRefresh.value, 10) || 10,
                    refreshCooldown: parseInt(settingAccountCooldown.value, 10) || 60,
                    refreshAllCooldown: parseInt(settingAllCooldown.value, 10) || 120,
                    showInStatusBar: settingStatusBar.checked,
                    statusBarAlignment: settingBarAlign.value || 'right',
                    staleThreshold: parseInt(settingStaleThreshold.value, 10) || 30,
                    refreshOnStartup: settingRefreshOnStartup.checked,
                },
            });
        }

        if (settingAutoRefresh) settingAutoRefresh.addEventListener('change', sendSettings);
        if (settingAccountCooldown) settingAccountCooldown.addEventListener('change', sendSettings);
        if (settingAllCooldown) settingAllCooldown.addEventListener('change', sendSettings);
        if (settingStatusBar) settingStatusBar.addEventListener('change', sendSettings);
        if (settingBarAlign) settingBarAlign.addEventListener('change', sendSettings);
        if (settingStaleThreshold) settingStaleThreshold.addEventListener('change', sendSettings);
        if (settingRefreshOnStartup) settingRefreshOnStartup.addEventListener('change', sendSettings);

        if (doneBtn) {
            doneBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'doneSetup' });
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'closeSetup' });
            });
        }

        window.addEventListener('message', function (event) {
            var msg = event.data;
            if (msg.type === 'setupData') {
                renderSetupAccounts(msg.accounts || []);
            }
            if (msg.type === 'settings') {
                var s = msg.settings;
                if (settingAutoRefresh) settingAutoRefresh.value = s.autoRefreshInterval;
                if (settingAccountCooldown) settingAccountCooldown.value = s.refreshCooldown;
                if (settingAllCooldown) settingAllCooldown.value = s.refreshAllCooldown;
                if (settingStatusBar) settingStatusBar.checked = s.showInStatusBar;
                if (settingBarAlign) settingBarAlign.value = s.statusBarAlignment || 'right';
                if (settingStaleThreshold) settingStaleThreshold.value = s.staleThreshold;
                if (settingRefreshOnStartup) settingRefreshOnStartup.checked = s.refreshOnStartup;
            }
            if (msg.type === 'authResult') {
                var row = setupAccountsContainer
                    ? setupAccountsContainer.querySelector(
                          '[data-account-id="' + msg.accountId + '"]'
                      )
                    : null;
                if (row) {
                    var parent = row.closest('.setup-account-row');
                    if (parent && !msg.success) {
                        var existing = parent.querySelector('.auth-error-msg');
                        if (!existing) {
                            var errSpan = document.createElement('span');
                            errSpan.className = 'auth-error-msg';
                            errSpan.textContent = 'Auth cancelled or failed';
                            parent.appendChild(errSpan);
                            setTimeout(function () {
                                errSpan.remove();
                            }, 5000);
                        }
                    }
                }
            }
        });

        function renderSetupAccounts(accounts) {
            if (!setupAccountsContainer) return;
            setupAccountsContainer.innerHTML = '';

            if (accounts.length === 0) {
                if (setupStatus) {
                    setupStatus.textContent =
                        'No GitHub accounts found. Please sign in to GitHub in VS Code first.';
                }
                return;
            }

            if (setupStatus) {
                setupStatus.textContent =
                    'Found ' + accounts.length + ' account(s):';
            }

            for (var i = 0; i < accounts.length; i++) {
                var acct = accounts[i];
                var row = document.createElement('div');
                row.className = 'setup-account-row';

                var iconClass = acct.authenticated
                    ? 'authenticated'
                    : 'not-authenticated';
                var iconSvg = acct.authenticated
                    ? checkIconSvg()
                    : dashIconSvg();
                var statusText = acct.authenticated
                    ? 'Authenticated'
                    : '';
                var actionBtn = acct.authenticated
                    ? ''
                    : '<button class="btn btn-primary btn-sm" data-action="authenticate" data-account-id="' +
                      escapeHtml(acct.id) +
                      '">Authenticate</button>';

                row.innerHTML =
                    '<div class="setup-account-left">' +
                    '<div class="setup-account-icon ' +
                    iconClass +
                    '">' +
                    iconSvg +
                    '</div>' +
                    '<span class="setup-account-label">' +
                    escapeHtml(acct.label) +
                    '</span>' +
                    '</div>' +
                    '<div>' +
                    (statusText
                        ? '<span class="setup-account-status">' +
                          statusText +
                          '</span>'
                        : '') +
                    actionBtn +
                    '</div>';

                if (!acct.authenticated) {
                    (function (accountId) {
                        var authBtn = row.querySelector(
                            '[data-action="authenticate"]'
                        );
                        if (authBtn) {
                            authBtn.addEventListener('click', function () {
                                vscode.postMessage({
                                    type: 'authenticate',
                                    accountId: accountId,
                                });
                            });
                        }
                    })(acct.id);
                }

                setupAccountsContainer.appendChild(row);
            }
        }
    }

    /* ────────────────────────────────────────
       Shared Utilities
    ──────────────────────────────────────── */

    function truncateUsername(name, maxLen) {
        if (!name) return '';
        if (name.length <= maxLen) return name;
        return name.substring(0, maxLen) + '..';
    }

    function getBarColorClass(percentUsed) {
        if (percentUsed <= 50) return 'bar-green';
        if (percentUsed <= 80) return 'bar-yellow';
        return 'bar-red';
    }

    function formatResetDate(isoStr) {
        if (!isoStr) return '';
        try {
            var d = new Date(isoStr);
            var months = [
                'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
            ];
            return (
                'Reset on ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
            );
        } catch (e) {
            return '';
        }
    }

    function formatFetchedAt(timestamp) {
        if (!timestamp) return '';
        try {
            var d = new Date(timestamp);
            var h = d.getHours();
            var m = d.getMinutes();
            var ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            if (h === 0) h = 12;
            var mStr = m < 10 ? '0' + m : '' + m;
            return 'Updated ' + h + ':' + mStr + ' ' + ampm;
        } catch (e) {
            return '';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function refreshIconSvg() {
        return '<svg class="icon icon-refresh" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M13.45 2.55a7 7 0 0 0-9.9 0L2.12 1.12A.5.5 0 0 0 1.5 1.5V5h3.5a.5.5 0 0 0 .35-.85L4.09 2.88a5.5 5.5 0 0 1 7.78 0A5.5 5.5 0 0 1 13.5 8a.75.75 0 0 0 1.5 0 7 7 0 0 0-1.55-5.45zM2.5 8a.75.75 0 0 0-1.5 0 7 7 0 0 0 11.45 5.45l1.43 1.43a.5.5 0 0 0 .85-.35V11h-3.5a.5.5 0 0 0-.35.85l1.26 1.27a5.5 5.5 0 0 1-7.78 0A5.5 5.5 0 0 1 2.5 8z"/></svg>';
    }

    function checkIconSvg() {
        return '<svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>';
    }

    function dashIconSvg() {
        return '<svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8z"/></svg>';
    }

    function closeIconSvg() {
        return '<svg class="icon" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/></svg>';
    }
})();
