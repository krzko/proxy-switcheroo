// Popup types - prefixed to avoid conflicts
type PopupProxyMode = 'direct' | 'system' | 'manual' | 'pac' | 'perRequest';

interface PopupProxyServer {
  host: string;
  port: number;
}

interface PopupProfile {
  id: string;
  name: string;
  mode: PopupProxyMode;
  manual?: {
    http?: PopupProxyServer;
    https?: PopupProxyServer;
    ftp?: PopupProxyServer;
    socks?: PopupProxyServer;
    socksVersion?: 4 | 5;
    bypassList: string[];
  };
  pac?: {
    url: string;
  };
  perRequest?: {
    rules: any[];
  };
  auth?: {
    basicHeaderBase64?: string;
  };
}

interface PopupExtensionState {
  autoMode: boolean;
  lastCheckTime?: number;
  lastRuleMatched?: string;
}

interface PopupState {
  state: PopupExtensionState;
  activeProfile: PopupProfile | null;
  profiles: Record<string, PopupProfile>;
}

interface PopupMessage {
  type: string;
  data?: unknown;
}

interface PopupResponse {
  type: string;
  data?: unknown;
}

class PopupController {
  private currentState: PopupState | null = null;
  
  private elements = {
    autoModeToggle: document.getElementById('auto-mode-toggle') as HTMLInputElement,
    profileSelect: document.getElementById('profile-select') as HTMLSelectElement,
    statusText: document.getElementById('status-text') as HTMLElement,
    lastRule: document.getElementById('last-rule') as HTMLElement,
    lastCheck: document.getElementById('last-check') as HTMLElement,
    applyNowBtn: document.getElementById('apply-now-btn') as HTMLButtonElement,
    refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
    directBtn: document.getElementById('direct-btn') as HTMLButtonElement,
    systemBtn: document.getElementById('system-btn') as HTMLButtonElement,
    optionsBtn: document.getElementById('options-btn') as HTMLButtonElement,
    logsLink: document.getElementById('logs-link') as HTMLAnchorElement,
    loadingOverlay: document.getElementById('loading-overlay') as HTMLElement
  };

  constructor() {
    this.bindEvents();
    this.initialise();
  }

  private bindEvents(): void {
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

  private async initialise(): Promise<void> {
    try {
      this.showLoading(true);
      
      // Reduce timeout to 3 seconds for faster feedback
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Background service not responding')), 3000);
      });
      
      await Promise.race([
        this.loadState(),
        timeoutPromise
      ]);
      
      this.updateUI();
    } catch (error) {
      this.showError(`Failed to initialise popup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.showLoading(false);
    }
  }

  private async loadState(): Promise<void> {
    // Simplified - just try once with shorter timeout
    const response = await this.sendMessage({ type: 'getState' });
    
    if (response.type === 'error') {
      throw new Error((response.data as any)?.error || 'Unknown error');
    }
    
    this.currentState = response.data as PopupState;
  }

  private updateUI(): void {
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

  private updateProfileSelect(profiles: Record<string, PopupProfile>, activeProfile: PopupProfile | null): void {
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

  private updateStatus(state: PopupExtensionState, activeProfile: PopupProfile | null): void {
    if (activeProfile) {
      this.elements.statusText.textContent = `Active: ${activeProfile.name}`;
      this.elements.statusText.className = 'status-value success';
    } else {
      this.elements.statusText.textContent = 'No active profile';
      this.elements.statusText.className = 'status-value warning';
    }

    if (state.lastRuleMatched) {
      this.elements.lastRule.textContent = state.lastRuleMatched;
    } else {
      this.elements.lastRule.textContent = state.autoMode ? 'No match' : 'Manual mode';
    }

    if (state.lastCheckTime) {
      const lastCheck = new Date(state.lastCheckTime);
      this.elements.lastCheck.textContent = this.formatRelativeTime(lastCheck);
    } else {
      this.elements.lastCheck.textContent = 'Never';
    }
  }

  private updateQuickActions(activeProfile: PopupProfile | null): void {
    this.elements.directBtn.classList.toggle('active', activeProfile?.id === 'direct');
    this.elements.systemBtn.classList.toggle('active', activeProfile?.id === 'system');
  }

  private async handleAutoModeToggle(): Promise<void> {
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
    } catch (error) {
      this.showError('Failed to update auto mode');
      this.elements.autoModeToggle.checked = !this.elements.autoModeToggle.checked;
    } finally {
      this.showLoading(false);
    }
  }

  private async handleProfileChange(): Promise<void> {
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
    } catch (error) {
      this.showError('Failed to change profile');
      await this.loadState();
      this.updateUI();
    } finally {
      this.showLoading(false);
    }
  }

  private async handleApplyNow(): Promise<void> {
    try {
      this.showLoading(true);
      await this.sendMessage({ type: 'forceEvaluation' });
      await this.loadState();
      this.updateUI();
      this.showSuccess('Rules re-evaluated');
    } catch (error) {
      this.showError('Failed to apply rules');
    } finally {
      this.showLoading(false);
    }
  }

  private async handleRefresh(): Promise<void> {
    await this.initialise();
    this.showSuccess('Status refreshed');
  }

  private async handleQuickAction(profileId: string): Promise<void> {
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
    } catch (error) {
      this.showError('Failed to switch profile');
    } finally {
      this.showLoading(false);
    }
  }

  private handleOpenOptions(): void {
    browser.runtime.openOptionsPage();
    window.close();
  }

  private async handleViewLogs(): Promise<void> {
    const url = browser.runtime.getURL('options.html#logs');
    await browser.tabs.create({ url });
    window.close();
  }

  private async sendMessage(message: PopupMessage): Promise<PopupResponse> {
    const response = await browser.runtime.sendMessage(message) as PopupResponse;
    
    if (!response) {
      throw new Error('No response from background service - service may be busy or restarting');
    }
    
    if (response.type === 'error') {
      throw new Error((response.data as any)?.error || 'Unknown error');
    }
    
    return response;
  }

  private showLoading(show: boolean): void {
    this.elements.loadingOverlay.classList.toggle('hidden', !show);
  }

  private showSuccess(message: string): void {
    this.showTemporaryMessage(message, 'success');
  }

  private showError(message: string): void {
    this.showTemporaryMessage(message, 'error');
  }

  private showTemporaryMessage(message: string, type: 'success' | 'error'): void {
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

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else if (diffMins > 0) {
      return `${diffMins}m ago`;
    } else {
      return `${diffSecs}s ago`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});