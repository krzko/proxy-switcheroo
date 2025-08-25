"use strict";
class PopupController {
    constructor() {
        this.currentState = null;
        this.elements = {
            autoModeToggle: document.getElementById('auto-mode-toggle'),
            profileSelect: document.getElementById('profile-select'),
            statusText: document.getElementById('status-text'),
            lastRule: document.getElementById('last-rule'),
            lastCheck: document.getElementById('last-check'),
            applyNowBtn: document.getElementById('apply-now-btn'),
            refreshBtn: document.getElementById('refresh-btn'),
            directBtn: document.getElementById('direct-btn'),
            systemBtn: document.getElementById('system-btn'),
            optionsBtn: document.getElementById('options-btn'),
            logsLink: document.getElementById('logs-link'),
            loadingOverlay: document.getElementById('loading-overlay')
        };
        this.bindEvents();
        this.initialise();
    }
    bindEvents() {
        this.elements.autoModeToggle.addEventListener('change', () => {
            this.handleAutoModeToggle();
        });
        this.elements.profileSelect.addEventListener('change', () => {
            this.handleProfileChange();
        });
        this.elements.applyNowBtn.addEventListener('click', () => {
            this.handleApplyNow();
        });
        this.elements.refreshBtn.addEventListener('click', () => {
            this.handleRefresh();
        });
        this.elements.directBtn.addEventListener('click', () => {
            this.handleQuickAction('direct');
        });
        this.elements.systemBtn.addEventListener('click', () => {
            this.handleQuickAction('system');
        });
        this.elements.optionsBtn.addEventListener('click', () => {
            this.handleOpenOptions();
        });
        this.elements.logsLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleViewLogs();
        });
    }
    async initialise() {
        try {
            this.showLoading(true);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Background service not responding')), 3000);
            });
            await Promise.race([
                this.loadState(),
                timeoutPromise
            ]);
            this.updateUI();
        }
        catch (error) {
            this.showError(`Failed to initialise popup: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        finally {
            this.showLoading(false);
        }
    }
    async loadState() {
        const response = await this.sendMessage({ type: 'getState' });
        if (response.type === 'error') {
            throw new Error(response.data?.error || 'Unknown error');
        }
        this.currentState = response.data;
    }
    updateUI() {
        if (!this.currentState) {
            return;
        }
        const { state, activeProfile, profiles } = this.currentState;
        this.elements.autoModeToggle.checked = state.autoMode;
        this.updateProfileSelect(profiles, activeProfile);
        this.updateStatus(state, activeProfile);
        this.updateQuickActions(activeProfile);
        this.elements.profileSelect.disabled = state.autoMode;
        this.elements.applyNowBtn.disabled = !state.autoMode;
    }
    updateProfileSelect(profiles, activeProfile) {
        this.elements.profileSelect.textContent = '';
        if (Object.keys(profiles).length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No profiles available';
            this.elements.profileSelect.appendChild(option);
            return;
        }
        Object.values(profiles).forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            option.selected = activeProfile?.id === profile.id;
            this.elements.profileSelect.appendChild(option);
        });
    }
    updateStatus(state, activeProfile) {
        if (activeProfile) {
            this.elements.statusText.textContent = `Active: ${activeProfile.name}`;
            this.elements.statusText.className = 'status-value success';
        }
        else {
            this.elements.statusText.textContent = 'No active profile';
            this.elements.statusText.className = 'status-value warning';
        }
        if (state.lastRuleMatched) {
            this.elements.lastRule.textContent = state.lastRuleMatched;
        }
        else {
            this.elements.lastRule.textContent = state.autoMode ? 'No match' : 'Manual mode';
        }
        if (state.lastCheckTime) {
            const lastCheck = new Date(state.lastCheckTime);
            this.elements.lastCheck.textContent = this.formatRelativeTime(lastCheck);
        }
        else {
            this.elements.lastCheck.textContent = 'Never';
        }
    }
    updateQuickActions(activeProfile) {
        this.elements.directBtn.classList.toggle('active', activeProfile?.id === 'direct');
        this.elements.systemBtn.classList.toggle('active', activeProfile?.id === 'system');
    }
    async handleAutoModeToggle() {
        try {
            this.showLoading(true);
            const autoMode = this.elements.autoModeToggle.checked;
            await this.sendMessage({
                type: 'setState',
                data: { autoMode }
            });
            await this.loadState();
            this.updateUI();
            this.showSuccess(autoMode ? 'Auto mode enabled' : 'Auto mode disabled');
        }
        catch (error) {
            this.showError('Failed to update auto mode');
            this.elements.autoModeToggle.checked = !this.elements.autoModeToggle.checked;
        }
        finally {
            this.showLoading(false);
        }
    }
    async handleProfileChange() {
        try {
            this.showLoading(true);
            const profileId = this.elements.profileSelect.value;
            if (profileId) {
                await this.sendMessage({
                    type: 'setProfile',
                    data: { profileId }
                });
                await this.loadState();
                this.updateUI();
                const profileName = this.currentState?.profiles[profileId]?.name || 'Unknown';
                this.showSuccess(`Switched to ${profileName}`);
            }
        }
        catch (error) {
            this.showError('Failed to change profile');
            await this.loadState();
            this.updateUI();
        }
        finally {
            this.showLoading(false);
        }
    }
    async handleApplyNow() {
        try {
            this.showLoading(true);
            await this.sendMessage({ type: 'forceEvaluation' });
            await this.loadState();
            this.updateUI();
            this.showSuccess('Rules re-evaluated');
        }
        catch (error) {
            this.showError('Failed to apply rules');
        }
        finally {
            this.showLoading(false);
        }
    }
    async handleRefresh() {
        await this.initialise();
        this.showSuccess('Status refreshed');
    }
    async handleQuickAction(profileId) {
        try {
            this.showLoading(true);
            await this.sendMessage({
                type: 'setState',
                data: { autoMode: false }
            });
            await this.sendMessage({
                type: 'setProfile',
                data: { profileId }
            });
            await this.loadState();
            this.updateUI();
            const profileName = profileId === 'direct' ? 'Direct Connection' : 'System Proxy';
            this.showSuccess(`Switched to ${profileName}`);
        }
        catch (error) {
            this.showError('Failed to switch profile');
        }
        finally {
            this.showLoading(false);
        }
    }
    handleOpenOptions() {
        browser.runtime.openOptionsPage();
        window.close();
    }
    async handleViewLogs() {
        const url = browser.runtime.getURL('options.html#logs');
        await browser.tabs.create({ url });
        window.close();
    }
    async sendMessage(message) {
        const response = await browser.runtime.sendMessage(message);
        if (!response) {
            throw new Error('No response from background service - service may be busy or restarting');
        }
        if (response.type === 'error') {
            throw new Error(response.data?.error || 'Unknown error');
        }
        return response;
    }
    showLoading(show) {
        this.elements.loadingOverlay.classList.toggle('hidden', !show);
    }
    showSuccess(message) {
        this.showTemporaryMessage(message, 'success');
    }
    showError(message) {
        this.showTemporaryMessage(message, 'error');
    }
    showTemporaryMessage(message, type) {
        const existingMessage = document.querySelector('.temporary-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        const messageElement = document.createElement('div');
        messageElement.className = `temporary-message ${type}`;
        messageElement.textContent = message;
        messageElement.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 1001;
      background: ${type === 'success' ? '#5CB85C' : '#D9534F'};
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: opacity 0.3s ease;
    `;
        document.body.appendChild(messageElement);
        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                messageElement.remove();
            }, 300);
        }, 2000);
    }
    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) {
            return `${diffDays}d ago`;
        }
        else if (diffHours > 0) {
            return `${diffHours}h ago`;
        }
        else if (diffMins > 0) {
            return `${diffMins}m ago`;
        }
        else {
            return `${diffSecs}s ago`;
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
//# sourceMappingURL=popup.js.map