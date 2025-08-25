// Options types - prefixed to avoid conflicts
type OptionsProxyMode = 'direct' | 'system' | 'manual' | 'pac' | 'perRequest';

interface OptionsProfile {
  id: string;
  name: string;
  mode: OptionsProxyMode;
  manual?: {
    http?: { host: string; port: number };
    https?: { host: string; port: number };
    ftp?: { host: string; port: number };
    socks?: { host: string; port: number };
    socksVersion?: 4 | 5;
    bypassList: string[];
  };
  pac?: {
    url: string;
  };
}

interface OptionsRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  when: any; // Simplified for now
  then: { setActiveProfile: string };
}

interface OptionsMessage {
  type: string;
  data?: unknown;
}

interface OptionsResponse {
  type: string;
  data?: unknown;
}

class OptionsController {
  private profiles: Record<string, OptionsProfile> = {};
  private rules: Record<string, OptionsRule> = {};

  private elements = {
    // Tab navigation
    tabBtns: document.querySelectorAll('.tab-btn') as NodeListOf<HTMLButtonElement>,
    tabPanes: document.querySelectorAll('.tab-content') as NodeListOf<HTMLElement>,

    // Profiles section
    profilesList: document.getElementById('profiles-list') as HTMLElement,
    addProfileBtn: document.getElementById('add-profile-btn') as HTMLButtonElement,

    // Rules section  
    rulesList: document.getElementById('rules-list') as HTMLElement,
    addRuleBtn: document.getElementById('add-rule-btn') as HTMLButtonElement,

    // Import/Export section
    importBtn: document.getElementById('import-btn') as HTMLButtonElement,
    exportBtn: document.getElementById('export-btn') as HTMLButtonElement,
    importFile: document.getElementById('import-file') as HTMLInputElement,

    // Status
    statusDiv: document.getElementById('status') as HTMLElement,

    // Logs section
    logsContainer: document.getElementById('logs-container') as HTMLElement,
    refreshLogsBtn: document.getElementById('refresh-logs') as HTMLButtonElement,
    clearLogsBtn: document.getElementById('clear-logs') as HTMLButtonElement,
    exportLogsBtn: document.getElementById('export-logs') as HTMLButtonElement,
    logLevelFilter: document.getElementById('log-level-filter') as HTMLSelectElement,
    logComponentFilter: document.getElementById('log-component-filter') as HTMLSelectElement
  };

  constructor() {
    this.bindEvents();
    this.initialise();
  }

  private bindEvents(): void {
    // Tab navigation
    this.elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        this.switchTab(target.dataset.tab!);
      });
    });

    // Profile events
    this.elements.addProfileBtn?.addEventListener('click', () => {
      this.addNewProfile();
    });

    // Profile list event delegation
    this.elements.profilesList?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('edit-profile-btn')) {
        const profileId = target.dataset.profileId;
        if (profileId) this.editProfile(profileId);
      } else if (target.classList.contains('delete-profile-btn')) {
        const profileId = target.dataset.profileId;
        if (profileId) this.deleteProfile(profileId);
      }
    });

    // Rule events
    this.elements.addRuleBtn?.addEventListener('click', () => {
      this.addNewRule();
    });

    // Rule list event delegation
    this.elements.rulesList?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('toggle-rule-btn')) {
        const ruleId = target.dataset.ruleId;
        if (ruleId) this.toggleRule(ruleId);
      } else if (target.classList.contains('edit-rule-btn')) {
        const ruleId = target.dataset.ruleId;
        if (ruleId) this.editRule(ruleId);
      } else if (target.classList.contains('delete-rule-btn')) {
        const ruleId = target.dataset.ruleId;
        if (ruleId) this.deleteRule(ruleId);
      }
    });

    // Import/Export events
    this.elements.exportBtn?.addEventListener('click', () => {
      this.handleExport();
    });

    this.elements.importBtn?.addEventListener('click', () => {
      this.elements.importFile?.click();
    });

    this.elements.importFile?.addEventListener('change', () => {
      this.handleImport();
    });

    // Logs events
    this.elements.refreshLogsBtn?.addEventListener('click', () => {
      this.refreshLogs();
    });

    this.elements.clearLogsBtn?.addEventListener('click', () => {
      this.clearLogs();
    });

    this.elements.exportLogsBtn?.addEventListener('click', () => {
      this.exportLogs();
    });

    this.elements.logLevelFilter?.addEventListener('change', () => {
      this.refreshLogs();
    });

    this.elements.logComponentFilter?.addEventListener('change', () => {
      this.refreshLogs();
    });
  }

  private async initialise(): Promise<void> {
    try {
      await this.loadData();
      this.updateUI();
      // DON'T load logs on startup - only load when logs tab is accessed
      this.switchTab('profiles');
    } catch (error) {
      this.showMessage('Failed to initialise options page', 'error');
      console.error('Options initialisation error:', error);
    }
  }

  private async loadData(): Promise<void> {
    const [profilesResponse, rulesResponse] = await Promise.all([
      this.sendMessage({ type: 'getProfiles' }),
      this.sendMessage({ type: 'getRules' })
    ]);

    if (profilesResponse.type === 'error') {
      throw new Error((profilesResponse.data as any)?.error || 'Failed to load profiles');
    }

    if (rulesResponse.type === 'error') {
      throw new Error((rulesResponse.data as any)?.error || 'Failed to load rules');
    }

    this.profiles = (profilesResponse.data as Record<string, OptionsProfile>) || {};
    this.rules = (rulesResponse.data as Record<string, OptionsRule>) || {};
  }

  private updateUI(): void {
    this.updateProfilesList();
    this.updateRulesList();
  }

  private switchTab(tabName: string): void {
    this.elements.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    this.elements.tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });

    // Lazy load logs only when logs tab is accessed
    if (tabName === 'logs') {
      this.refreshLogs().catch(error => {
        console.error('Failed to load logs:', error);
        this.showMessage('Failed to load logs', 'error');
      });
    }
  }

  private updateProfilesList(): void {
    if (!this.elements.profilesList) return;
    
    const profiles = Object.values(this.profiles);
    
    if (profiles.length === 0) {
      const emptyMessage = this.createSafeElement('p', 'empty-state', 'No profiles configured. Default profiles should load automatically.');
      this.clearAndAppendSafe(this.elements.profilesList, emptyMessage);
      return;
    }

    const profileElements = profiles.map(profile => this.createProfileElement(profile));
    this.clearAndAppendSafe(this.elements.profilesList, ...profileElements);
  }

  private createProfileElement(profile: OptionsProfile): HTMLElement {
    const profileItem = this.createSafeElement('div', 'profile-item');
    profileItem.dataset.profileId = profile.id;

    // Profile info section
    const profileInfo = this.createSafeElement('div', 'profile-info');
    
    const profileName = this.createSafeElement('h3', 'profile-name', profile.name);
    const profileMode = this.createSafeElement('p', 'profile-details', this.capitalise(profile.mode));
    
    profileInfo.appendChild(profileName);
    profileInfo.appendChild(profileMode);
    
    // Add profile details if available
    const detailsElement = this.createProfileDetailsElement(profile);
    if (detailsElement) {
      profileInfo.appendChild(detailsElement);
    }

    // Profile actions section
    const profileActions = this.createSafeElement('div', 'profile-actions');
    
    const editBtn = this.createSafeElement('button', 'btn small secondary edit-profile-btn', 'Edit');
    editBtn.dataset.profileId = profile.id;
    
    const deleteBtn = this.createSafeElement('button', 'btn small danger delete-profile-btn', 'Delete');
    deleteBtn.dataset.profileId = profile.id;
    
    profileActions.appendChild(editBtn);
    profileActions.appendChild(deleteBtn);

    profileItem.appendChild(profileInfo);
    profileItem.appendChild(profileActions);
    
    return profileItem;
  }

  private createProfileDetailsElement(profile: OptionsProfile): HTMLElement | null {
    const details = this.getProfileDetailsText(profile);
    return details ? this.createSafeElement('p', 'profile-details', details) : null;
  }

  private updateRulesList(): void {
    if (!this.elements.rulesList) return;
    
    const rules = Object.values(this.rules).sort((a, b) => a.priority - b.priority);
    
    if (rules.length === 0) {
      const emptyMessage = this.createSafeElement('p', 'empty-state', 'No rules configured. Default example rules should load automatically.');
      this.clearAndAppendSafe(this.elements.rulesList, emptyMessage);
      return;
    }

    const ruleElements = rules.map(rule => this.createRuleElement(rule));
    this.clearAndAppendSafe(this.elements.rulesList, ...ruleElements);
  }

  private createRuleElement(rule: OptionsRule): HTMLElement {
    const ruleItem = this.createSafeElement('div', `rule-item ${rule.enabled ? 'enabled' : 'disabled'}`);
    ruleItem.dataset.ruleId = rule.id;

    // Rule info section
    const ruleInfo = this.createSafeElement('div', 'rule-info');
    
    const ruleName = this.createSafeElement('h3', '', rule.name);
    const rulePriority = this.createSafeElement('p', 'rule-priority', `Priority: ${rule.priority}`);
    const ruleStatus = this.createSafeElement('p', 'rule-status', `Status: ${rule.enabled ? 'Enabled' : 'Disabled'}`);
    const ruleAction = this.createSafeElement('p', 'rule-action', `→ Set profile: ${rule.then.setActiveProfile}`);
    
    ruleInfo.appendChild(ruleName);
    ruleInfo.appendChild(rulePriority);
    ruleInfo.appendChild(ruleStatus);
    ruleInfo.appendChild(ruleAction);

    // Rule actions section
    const ruleActions = this.createSafeElement('div', 'rule-actions');
    
    const toggleBtn = this.createSafeElement('button', `btn small ${rule.enabled ? 'secondary' : 'primary'} toggle-rule-btn`, rule.enabled ? 'Disable' : 'Enable');
    toggleBtn.dataset.ruleId = rule.id;
    
    const editBtn = this.createSafeElement('button', 'btn small secondary edit-rule-btn', 'Edit');
    editBtn.dataset.ruleId = rule.id;
    
    const deleteBtn = this.createSafeElement('button', 'btn small danger delete-rule-btn', 'Delete');
    deleteBtn.dataset.ruleId = rule.id;
    
    ruleActions.appendChild(toggleBtn);
    ruleActions.appendChild(editBtn);
    ruleActions.appendChild(deleteBtn);

    ruleItem.appendChild(ruleInfo);
    ruleItem.appendChild(ruleActions);
    
    return ruleItem;
  }

  private getProfileDetailsText(profile: OptionsProfile): string {
    switch (profile.mode) {
      case 'manual':
        const details = [];
        if (profile.manual?.http) {
          details.push(`HTTP: ${profile.manual.http.host}:${profile.manual.http.port}`);
        }
        if (profile.manual?.https) {
          details.push(`HTTPS: ${profile.manual.https.host}:${profile.manual.https.port}`);
        }
        if (profile.manual?.socks) {
          details.push(`SOCKS: ${profile.manual.socks.host}:${profile.manual.socks.port}`);
        }
        return details.join(', ');
      
      case 'pac':
        return profile.pac?.url ? `PAC: ${profile.pac.url}` : '';
      
      default:
        return '';
    }
  }


  private async handleExport(): Promise<void> {
    try {
      const response = await this.sendMessage({ type: 'exportConfig' });
      
      if (response.type === 'config') {
        const config = response.data;
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'proxy-switcheroo-config.json';
        a.click();
        
        URL.revokeObjectURL(url);
        this.showMessage('Configuration exported successfully', 'success');
      }
    } catch (error) {
      this.showMessage('Failed to export configuration', 'error');
    }
  }

  private async handleImport(): Promise<void> {
    const file = this.elements.importFile?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      
      await this.sendMessage({ type: 'importConfig', data: config });
      await this.loadData();
      this.updateUI();
      
      this.showMessage('Configuration imported successfully', 'success');
    } catch (error) {
      this.showMessage('Failed to import configuration', 'error');
    }
  }

  private async sendMessage(message: OptionsMessage): Promise<OptionsResponse> {
    try {
      const response = await browser.runtime.sendMessage(message) as OptionsResponse;
      if (response.type === 'error') {
        throw new Error((response.data as any)?.error || 'Unknown error');
      }
      return response;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }

  private showMessage(message: string, type: 'success' | 'error' | 'info'): void {
    if (!this.elements.statusDiv) return;
    
    this.elements.statusDiv.textContent = message;
    this.elements.statusDiv.className = `status ${type}`;
    
    setTimeout(() => {
      this.elements.statusDiv.textContent = '';
      this.elements.statusDiv.className = 'status';
    }, 5000);
  }

  private capitalise(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private escapeHtml(unsafe: string): string {
    const div = document.createElement('div');
    div.textContent = unsafe;
    return div.innerHTML;
  }

  // Secure DOM manipulation utilities
  private createSafeElement(tagName: string, className?: string, textContent?: string): HTMLElement {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
  }

  private clearAndAppendSafe(container: HTMLElement, ...elements: HTMLElement[]): void {
    container.textContent = ''; // Clear safely
    elements.forEach(element => container.appendChild(element));
  }


  private populateSelectSafe(selectElement: HTMLSelectElement, options: Array<{value: string, text: string, selected?: boolean}>, defaultText?: string): void {
    // Clear existing options
    selectElement.textContent = '';
    
    // Add default option if provided
    if (defaultText) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = defaultText;
      selectElement.appendChild(defaultOption);
    }
    
    // Add all options safely
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.selected) option.selected = true;
      selectElement.appendChild(option);
    });
  }

  // Rule management methods
  public async toggleRule(ruleId: string): Promise<void> {
    const rule = this.rules[ruleId];
    if (!rule) return;

    try {
      const updatedRule = { ...rule, enabled: !rule.enabled };
      await this.sendMessage({ type: 'saveRule', data: updatedRule });
      
      this.rules[ruleId] = updatedRule;
      this.updateRulesList();
      
      this.showMessage(`Rule ${updatedRule.enabled ? 'enabled' : 'disabled'} successfully`, 'success');
    } catch (error) {
      this.showMessage('Failed to toggle rule', 'error');
    }
  }

  public async deleteRule(ruleId: string): Promise<void> {
    const rule = this.rules[ruleId];
    if (!rule) return;

    if (!confirm(`Are you sure you want to delete the rule "${rule.name}"?`)) return;

    try {
      await this.sendMessage({ type: 'deleteRule', data: { id: ruleId } });
      
      delete this.rules[ruleId];
      this.updateRulesList();
      
      this.showMessage('Rule deleted successfully', 'success');
    } catch (error) {
      this.showMessage('Failed to delete rule', 'error');
    }
  }

  public editRule(ruleId: string): void {
    const rule = this.rules[ruleId];
    if (!rule) return;

    this.showEditRuleDialog(rule);
  }

  public addNewRule(): void {
    this.showEditRuleDialog(null);
  }

  private showEditRuleDialog(rule: OptionsRule | null): void {
    const modal = document.getElementById('rule-modal') as HTMLElement;
    const title = document.getElementById('rule-modal-title') as HTMLElement;
    const saveBtn = document.getElementById('save-rule') as HTMLButtonElement;
    
    if (!modal || !title || !saveBtn) return;
    
    const isEdit = rule !== null;
    title.textContent = isEdit ? 'Edit Rule' : 'Add New Rule';
    
    // Populate form fields
    (document.getElementById('rule-name') as HTMLInputElement).value = rule?.name || '';
    (document.getElementById('rule-priority') as HTMLInputElement).value = String(rule?.priority || 100);
    (document.getElementById('rule-enabled') as HTMLInputElement).checked = rule?.enabled !== false;
    (document.getElementById('rule-stop-on-match') as HTMLInputElement).checked = rule?.stopOnMatch !== false;
    
    // Populate profile dropdown
    const profileSelect = document.getElementById('rule-action-profile') as HTMLSelectElement;
    const profileOptions = Object.values(this.profiles).map(p => ({
      value: p.id,
      text: p.name,
      selected: rule?.then.setActiveProfile === p.id
    }));
    this.populateSelectSafe(profileSelect, profileOptions, 'Select profile...');
    
    // Set up trigger section
    this.setupTriggersSection(rule);
    
    // Remove existing listeners
    saveBtn.replaceWith(saveBtn.cloneNode(true));
    const newSaveBtn = document.getElementById('save-rule') as HTMLButtonElement;
    
    // Update save button handler
    newSaveBtn.addEventListener('click', () => this.saveRule(rule?.id || ''));
    
    // Set up modal close handlers
    const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-rule') as HTMLButtonElement;
    const testBtn = document.getElementById('test-rule') as HTMLButtonElement;
    
    // Remove existing listeners and add new ones
    const newCloseBtn = closeBtn.cloneNode(true) as HTMLButtonElement;
    const newCancelBtn = cancelBtn.cloneNode(true) as HTMLButtonElement;
    const newTestBtn = testBtn.cloneNode(true) as HTMLButtonElement;
    
    closeBtn.replaceWith(newCloseBtn);
    cancelBtn.replaceWith(newCancelBtn);
    testBtn.replaceWith(newTestBtn);
    
    newCloseBtn.addEventListener('click', () => this.closeRuleDialog());
    newCancelBtn.addEventListener('click', () => this.closeRuleDialog());
    newTestBtn.addEventListener('click', () => this.testRule());
    
    // Show modal
    modal.classList.remove('hidden');
  }

  private setupTriggersSection(rule: OptionsRule | null): void {
    const triggersSection = document.getElementById('triggers-section') as HTMLElement;
    if (!triggersSection) return;
    
    // Clear existing triggers and rebuild
    triggersSection.textContent = '';
    
    // Determine current trigger type
    let currentTrigger = '';
    if (rule?.when) {
      if (rule.when.timeWindow) currentTrigger = 'timeWindow';
      else if (rule.when.dnsResolve) currentTrigger = 'dnsResolve';
      else if (rule.when.reachability) currentTrigger = 'reachability';
      else if (rule.when.ipInfo) currentTrigger = 'ipInfo';
    }
    
    // Add trigger if one exists, otherwise show add button
    if (currentTrigger) {
      this.addTriggerUI(currentTrigger, rule);
    } else {
      this.showAddTriggerButton();
    }
  }
  
  private showAddTriggerButton(): void {
    const triggersSection = document.getElementById('triggers-section') as HTMLElement;
    
    const addTriggerBtn = this.createSafeElement('button', 'btn secondary small add-trigger-btn', 'Add Trigger') as HTMLButtonElement;
    addTriggerBtn.type = 'button';
    addTriggerBtn.addEventListener('click', () => this.showTriggerOptions());
    
    const formNote = this.createSafeElement('p', 'form-note', 'Rules need at least one trigger condition to activate.');
    
    this.clearAndAppendSafe(triggersSection, addTriggerBtn, formNote);
  }
  
  public showTriggerOptions(): void {
    const triggersSection = document.getElementById('triggers-section') as HTMLElement;
    
    // Create main container
    const triggerSelection = this.createSafeElement('div', 'trigger-selection');
    
    // Create header
    const header = this.createSafeElement('h4', '', 'Select Trigger Type:');
    triggerSelection.appendChild(header);
    
    // Create buttons container
    const buttonsContainer = this.createSafeElement('div', 'trigger-type-buttons');
    
    // Define trigger types
    const triggerTypes = [
      { type: 'timeWindow', label: 'Time Window' },
      { type: 'dnsResolve', label: 'DNS Resolution' },
      { type: 'reachability', label: 'URL Reachability' },
      { type: 'ipInfo', label: 'IP Info' }
    ];
    
    // Create trigger type buttons
    triggerTypes.forEach(trigger => {
      const btn = this.createSafeElement('button', 'btn secondary small trigger-type-btn', trigger.label) as HTMLButtonElement;
      btn.type = 'button';
      btn.dataset.triggerType = trigger.type;
      btn.addEventListener('click', () => this.addTriggerType(trigger.type));
      buttonsContainer.appendChild(btn);
    });
    
    triggerSelection.appendChild(buttonsContainer);
    
    // Create cancel button
    const cancelBtn = this.createSafeElement('button', 'btn secondary small cancel-trigger-btn', 'Cancel') as HTMLButtonElement;
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => this.cancelAddTrigger());
    triggerSelection.appendChild(cancelBtn);
    
    this.clearAndAppendSafe(triggersSection, triggerSelection);
  }
  
  public addTriggerType(triggerType: string): void {
    this.addTriggerUI(triggerType, null);
  }
  
  public cancelAddTrigger(): void {
    this.showAddTriggerButton();
  }
  
  private addTriggerUI(triggerType: string, rule: OptionsRule | null): void {
    const triggersSection = document.getElementById('triggers-section') as HTMLElement;
    
    let triggerHtml = '';
    
    switch (triggerType) {
      case 'timeWindow':
        const days = rule?.when?.timeWindow?.days?.join(',') || '';
        triggerHtml = `
          <div class="trigger-item" data-trigger-type="timeWindow">
            <span class="trigger-type">Time Window</span>
            <div class="trigger-config">
              <label>Days (1=Mon-7=Sun):</label>
              <input type="text" id="time-days" placeholder="1,2,3,4,5" value="${days}">
              <label>From:</label>
              <input type="time" id="time-from" value="${rule?.when?.timeWindow?.from || ''}">
              <label>To:</label>
              <input type="time" id="time-to" value="${rule?.when?.timeWindow?.to || ''}">
            </div>
            <button type="button" class="btn danger small remove-trigger-btn">Remove</button>
          </div>
        `;
        break;
        
      case 'dnsResolve':
        triggerHtml = `
          <div class="trigger-item" data-trigger-type="dnsResolve">
            <span class="trigger-type">DNS Resolution</span>
            <div class="trigger-config">
              <label>Hostname:</label>
              <input type="text" id="dns-hostname" placeholder="intranet.company.com" value="${rule?.when?.dnsResolve?.hostname || ''}">
            </div>
            <button type="button" class="btn danger small remove-trigger-btn">Remove</button>
          </div>
        `;
        break;
        
      case 'reachability':
        triggerHtml = `
          <div class="trigger-item" data-trigger-type="reachability">
            <span class="trigger-type">URL Reachability</span>
            <div class="trigger-config">
              <label>URL:</label>
              <input type="url" id="reach-url" placeholder="https://intranet.company.com/ping" value="${rule?.when?.reachability?.url || ''}">
            </div>
            <button type="button" class="btn danger small remove-trigger-btn">Remove</button>
          </div>
        `;
        break;
        
      case 'ipInfo':
        triggerHtml = `
          <div class="trigger-item" data-trigger-type="ipInfo">
            <span class="trigger-type">IP Info</span>
            <div class="trigger-config">
              <label>Expected Organisation:</label>
              <input type="text" id="ip-org" placeholder="Company Name" value="${rule?.when?.ipInfo?.expectOrg || ''}">
              <label>Expected Country:</label>
              <input type="text" id="ip-country" placeholder="AU" value="${rule?.when?.ipInfo?.expectCountry || ''}">
            </div>
            <button type="button" class="btn danger small remove-trigger-btn">Remove</button>
          </div>
        `;
        break;
    }
    
    // Use DOMParser for complex HTML as a safer alternative to innerHTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(triggerHtml, 'text/html');
    const content = doc.body.firstElementChild;
    triggersSection.textContent = '';
    if (content) triggersSection.appendChild(content);
    
    // Add event listener for remove button
    const removeBtn = triggersSection.querySelector('.remove-trigger-btn') as HTMLButtonElement;
    removeBtn?.addEventListener('click', () => this.removeTrigger());
  }
  
  public removeTrigger(): void {
    this.showAddTriggerButton();
  }

  public closeRuleDialog(): void {
    const modal = document.getElementById('rule-modal') as HTMLElement;
    if (modal) modal.classList.add('hidden');
  }

  public async saveRule(existingRuleId: string): Promise<void> {
    try {
      const nameInput = document.getElementById('rule-name') as HTMLInputElement;
      const priorityInput = document.getElementById('rule-priority') as HTMLInputElement;
      const enabledInput = document.getElementById('rule-enabled') as HTMLInputElement;
      const stopOnMatchInput = document.getElementById('rule-stop-on-match') as HTMLInputElement;
      const profileSelect = document.getElementById('rule-action-profile') as HTMLSelectElement;
      
      // Validate required fields
      if (!nameInput?.value?.trim()) {
        this.showMessage('Rule name is required', 'error');
        return;
      }
      
      if (!profileSelect?.value) {
        this.showMessage('Please select a target profile', 'error');
        return;
      }
      
      const when = this.buildTriggerCondition();
      if (Object.keys(when).length === 0) {
        this.showMessage('Please add at least one trigger condition', 'error');
        return;
      }

      const rule: OptionsRule = {
        id: existingRuleId || this.generateRuleId(),
        name: nameInput.value.trim(),
        priority: parseInt(priorityInput.value) || 100,
        enabled: enabledInput.checked,
        stopOnMatch: stopOnMatchInput.checked,
        when,
        then: {
          setActiveProfile: profileSelect.value
        }
      };

      await this.sendMessage({ type: 'saveRule', data: rule });
      
      this.rules[rule.id] = rule;
      this.updateRulesList();
      this.closeRuleDialog();
      
      this.showMessage(`Rule ${existingRuleId ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
      console.error('Failed to save rule:', error);
      this.showMessage('Failed to save rule', 'error');
    }
  }

  private buildTriggerCondition(): any {
    const triggerItem = document.querySelector('.trigger-item') as HTMLElement;
    if (!triggerItem) return {};

    const triggerType = triggerItem.dataset.triggerType;
    if (!triggerType) return {};

    switch (triggerType) {
      case 'timeWindow':
        const daysInput = (document.getElementById('time-days') as HTMLInputElement)?.value || '';
        const days = daysInput ? daysInput.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 7) : [];
        const from = (document.getElementById('time-from') as HTMLInputElement)?.value || '';
        const to = (document.getElementById('time-to') as HTMLInputElement)?.value || '';
        
        if (days.length === 0 || !from || !to) return {};
        
        return {
          timeWindow: { days, from, to }
        };
        
      case 'dnsResolve':
        const hostname = (document.getElementById('dns-hostname') as HTMLInputElement)?.value?.trim() || '';
        return hostname ? { dnsResolve: { hostname, matches: 'exact' } } : {};
        
      case 'reachability':
        const url = (document.getElementById('reach-url') as HTMLInputElement)?.value?.trim() || '';
        return url ? { reachability: { url, method: 'HEAD', expectStatus: 200 } } : {};
        
      case 'ipInfo':
        const org = (document.getElementById('ip-org') as HTMLInputElement)?.value?.trim() || '';
        const country = (document.getElementById('ip-country') as HTMLInputElement)?.value?.trim() || '';
        const ipInfo: any = {};
        if (org) ipInfo.expectOrg = org;
        if (country) ipInfo.expectCountry = country;
        return Object.keys(ipInfo).length > 0 ? { ipInfo } : {};
        
      default:
        return {};
    }
  }

  private generateRuleId(): string {
    return 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  public async testRule(): Promise<void> {
    try {
      // Build the rule from the current form state
      const nameInput = document.getElementById('rule-name') as HTMLInputElement;
      const priorityInput = document.getElementById('rule-priority') as HTMLInputElement;
      const stopOnMatchInput = document.getElementById('rule-stop-on-match') as HTMLInputElement;
      const profileSelect = document.getElementById('rule-action-profile') as HTMLSelectElement;
      
      // Validate required fields
      if (!nameInput?.value?.trim()) {
        this.showMessage('Rule name is required to test', 'error');
        return;
      }
      
      if (!profileSelect?.value) {
        this.showMessage('Please select a target profile to test', 'error');
        return;
      }
      
      const when = this.buildTriggerCondition();
      if (Object.keys(when).length === 0) {
        this.showMessage('Please add at least one trigger condition to test', 'error');
        return;
      }

      const testRule: OptionsRule = {
        id: 'test_rule_' + Date.now(),
        name: nameInput.value.trim() + ' (Test)',
        priority: parseInt(priorityInput.value) || 100,
        enabled: true, // Always test as enabled
        stopOnMatch: stopOnMatchInput.checked,
        when,
        then: {
          setActiveProfile: profileSelect.value
        }
      };

      // Show loading state
      const testBtn = document.getElementById('test-rule') as HTMLButtonElement;
      const originalText = testBtn.textContent;
      testBtn.textContent = 'Testing...';
      testBtn.disabled = true;

      // Send test request to background
      console.log('Sending test rule request:', testRule);
      const response = await this.sendMessage({ type: 'testRule', data: testRule });
      
      console.log('Test rule response received:', response);
      
      if (response.type === 'testResult') {
        const result = response.data as { success: boolean; results: Record<string, any>; error?: string };
        
        console.log('Test result data:', result);
        console.log('Result success:', result.success);
        console.log('Result results:', result.results);
        
        // Always show results, regardless of success/failure
        if (result.results && Object.keys(result.results).length > 0) {
          console.log('Showing test results modal');
          this.showTestResults(result.results);
        } else {
          console.log('No results to show, showing message');
          this.showMessage(result.error || 'Test completed but no results available', 'info');
        }
        
        if (result.success) {
          this.showMessage('Rule test completed successfully', 'success');
        } else {
          this.showMessage(`Test completed with issues: ${result.error || 'Check results for details'}`, 'error');
        }
      } else {
        this.showMessage(`Unexpected test response type: ${response.type}`, 'error');
        console.error('Unexpected response:', response);
      }

      // Restore button state
      testBtn.textContent = originalText;
      testBtn.disabled = false;

    } catch (error) {
      console.error('Failed to test rule:', error);
      this.showMessage('Failed to test rule', 'error');
      
      // Restore button state
      const testBtn = document.getElementById('test-rule') as HTMLButtonElement;
      testBtn.textContent = 'Test Rule';
      testBtn.disabled = false;
    }
  }

  private showTestResults(results: Record<string, any>): void {
    console.log('showTestResults called with:', results);
    
    if (!results || Object.keys(results).length === 0) {
      console.log('No results to display');
      this.showMessage('Test completed but no results to display', 'info');
      return;
    }
    
    const resultsHtml = Object.entries(results).map(([triggerType, result]) => {
      console.log(`Processing result for ${triggerType}:`, result);
      const success = result.success ? '✅' : '❌';
      const details = result.details || result.error || 'No details available';
      return `
        <div class="test-result-item">
          <strong>${success} ${this.capitalise(triggerType)}:</strong>
          <div class="test-details">${this.escapeHtml(String(details))}</div>
        </div>
      `;
    }).join('');
    
    console.log('Generated results HTML:', resultsHtml);

    console.log('Creating modal element');
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex'; // Ensure it's visible
    // Build modal content safely
    const modalContent = this.createSafeElement('div', 'modal-content');
    
    // Header
    const header = this.createSafeElement('div', 'modal-header');
    header.appendChild(this.createSafeElement('h3', '', 'Rule Test Results'));
    const closeBtn = this.createSafeElement('button', 'modal-close', '×');
    header.appendChild(closeBtn);
    modalContent.appendChild(header);
    
    // Body
    const body = this.createSafeElement('div', 'modal-body');
    const resultsDiv = this.createSafeElement('div', 'test-results');
    
    // Parse and append results safely
    if (resultsHtml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(resultsHtml, 'text/html');
      Array.from(doc.body.children).forEach(child => resultsDiv.appendChild(child));
    }
    
    body.appendChild(resultsDiv);
    
    const note = this.createSafeElement('p', 'test-note');
    note.appendChild(this.createSafeElement('strong', '', 'Note:'));
    note.appendChild(document.createTextNode(' This test evaluates the rule\'s trigger conditions with current network state. Results may vary based on your current network environment.'));
    body.appendChild(note);
    modalContent.appendChild(body);
    
    // Footer
    const footer = this.createSafeElement('div', 'modal-footer');
    footer.appendChild(this.createSafeElement('button', 'btn secondary close-results', 'Close'));
    modalContent.appendChild(footer);
    
    modal.appendChild(modalContent);

    console.log('Appending modal to body');
    document.body.appendChild(modal);
    console.log('Modal appended, element:', modal);

    // Add event listeners for closing
    const modalCloseBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
    const closeResultsBtn = modal.querySelector('.close-results') as HTMLButtonElement;
    
    const closeModal = () => {
      console.log('Closing modal');
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    };

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
      console.log('Close button listener added');
    }
    
    if (closeResultsBtn) {
      closeResultsBtn.addEventListener('click', closeModal);
      console.log('Close results button listener added');
    }
    
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    console.log('Modal setup complete');
  }

  // Profile management methods
  public addNewProfile(): void {
    this.showEditProfileDialog(null);
  }

  public editProfile(profileId: string): void {
    const profile = this.profiles[profileId];
    if (!profile) return;
    this.showEditProfileDialog(profile);
  }

  public async deleteProfile(profileId: string): Promise<void> {
    const profile = this.profiles[profileId];
    if (!profile) return;

    if (!confirm(`Are you sure you want to delete the profile "${profile.name}"?`)) return;

    try {
      await this.sendMessage({ type: 'deleteProfile', data: { id: profileId } });
      
      delete this.profiles[profileId];
      this.updateProfilesList();
      
      this.showMessage('Profile deleted successfully', 'success');
    } catch (error) {
      this.showMessage('Failed to delete profile', 'error');
    }
  }

  private showEditProfileDialog(profile: OptionsProfile | null): void {
    const modal = document.getElementById('profile-modal') as HTMLElement;
    const title = document.getElementById('profile-modal-title') as HTMLElement;
    const saveBtn = document.getElementById('save-profile') as HTMLButtonElement;
    
    if (!modal || !title || !saveBtn) return;
    
    const isEdit = profile !== null;
    title.textContent = isEdit ? 'Edit Profile' : 'Add New Profile';
    
    // Populate form fields
    (document.getElementById('profile-name') as HTMLInputElement).value = profile?.name || '';
    (document.getElementById('profile-mode') as HTMLSelectElement).value = profile?.mode || 'direct';
    
    // Clear and setup configuration sections
    this.setupProfileModeHandling(profile);
    
    // Remove existing listeners
    saveBtn.replaceWith(saveBtn.cloneNode(true));
    const newSaveBtn = document.getElementById('save-profile') as HTMLButtonElement;
    
    // Update save button handler
    newSaveBtn.addEventListener('click', () => this.saveProfile(profile?.id || ''));
    
    // Set up modal close handlers
    const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-profile') as HTMLButtonElement;
    
    // Remove existing listeners and add new ones
    const newCloseBtn = closeBtn.cloneNode(true) as HTMLButtonElement;
    const newCancelBtn = cancelBtn.cloneNode(true) as HTMLButtonElement;
    
    closeBtn.replaceWith(newCloseBtn);
    cancelBtn.replaceWith(newCancelBtn);
    
    newCloseBtn.addEventListener('click', () => this.closeProfileDialog());
    newCancelBtn.addEventListener('click', () => this.closeProfileDialog());
    
    // Show modal
    modal.classList.remove('hidden');
  }

  private setupProfileModeHandling(profile: OptionsProfile | null): void {
    const modeSelect = document.getElementById('profile-mode') as HTMLSelectElement;
    const manualConfig = document.getElementById('manual-config') as HTMLElement;
    const pacConfig = document.getElementById('pac-config') as HTMLElement;
    
    const updateConfigVisibility = () => {
      const mode = modeSelect.value;
      
      // Hide all config sections
      manualConfig.classList.add('hidden');
      pacConfig.classList.add('hidden');
      
      // Show relevant config section
      switch (mode) {
        case 'manual':
          manualConfig.classList.remove('hidden');
          this.populateManualConfig(profile);
          break;
        case 'pac':
          pacConfig.classList.remove('hidden');
          this.populatePacConfig(profile);
          break;
      }
    };
    
    modeSelect.addEventListener('change', updateConfigVisibility);
    updateConfigVisibility();
  }

  private populateManualConfig(profile: OptionsProfile | null): void {
    if (!profile?.manual) return;
    
    const manual = profile.manual;
    
    // HTTP proxy
    (document.getElementById('http-host') as HTMLInputElement).value = manual.http?.host || '';
    (document.getElementById('http-port') as HTMLInputElement).value = manual.http?.port?.toString() || '';
    
    // HTTPS proxy
    (document.getElementById('https-host') as HTMLInputElement).value = manual.https?.host || '';
    (document.getElementById('https-port') as HTMLInputElement).value = manual.https?.port?.toString() || '';
    
    // SOCKS proxy
    (document.getElementById('socks-host') as HTMLInputElement).value = manual.socks?.host || '';
    (document.getElementById('socks-port') as HTMLInputElement).value = manual.socks?.port?.toString() || '';
    (document.getElementById('socks-version') as HTMLSelectElement).value = manual.socksVersion?.toString() || '5';
    
    // Bypass list
    (document.getElementById('bypass-list') as HTMLTextAreaElement).value = manual.bypassList?.join(', ') || '';
  }

  private populatePacConfig(profile: OptionsProfile | null): void {
    if (!profile?.pac) return;
    (document.getElementById('pac-url') as HTMLInputElement).value = profile.pac.url || '';
  }

  public closeProfileDialog(): void {
    const modal = document.getElementById('profile-modal') as HTMLElement;
    if (modal) modal.classList.add('hidden');
  }

  public async saveProfile(existingProfileId: string): Promise<void> {
    try {
      const nameInput = document.getElementById('profile-name') as HTMLInputElement;
      const modeSelect = document.getElementById('profile-mode') as HTMLSelectElement;
      
      // Validate required fields
      if (!nameInput?.value?.trim()) {
        this.showMessage('Profile name is required', 'error');
        return;
      }
      
      const profile: OptionsProfile = {
        id: existingProfileId || this.generateProfileId(),
        name: nameInput.value.trim(),
        mode: modeSelect.value as OptionsProxyMode
      };
      
      // Add mode-specific configuration
      switch (profile.mode) {
        case 'manual':
          const manualConfig = this.buildManualConfig();
          if (manualConfig) {
            profile.manual = manualConfig;
          }
          break;
        case 'pac':
          const pacConfig = this.buildPacConfig();
          if (!pacConfig?.url) {
            this.showMessage('PAC URL is required', 'error');
            return;
          }
          profile.pac = pacConfig;
          break;
      }

      await this.sendMessage({ type: 'saveProfile', data: profile });
      
      this.profiles[profile.id] = profile;
      this.updateProfilesList();
      this.closeProfileDialog();
      
      this.showMessage(`Profile ${existingProfileId ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
      console.error('Failed to save profile:', error);
      this.showMessage('Failed to save profile', 'error');
    }
  }

  private buildManualConfig(): OptionsProfile['manual'] | undefined {
    const httpHost = (document.getElementById('http-host') as HTMLInputElement)?.value?.trim();
    const httpPort = parseInt((document.getElementById('http-port') as HTMLInputElement)?.value || '0');
    
    const httpsHost = (document.getElementById('https-host') as HTMLInputElement)?.value?.trim();
    const httpsPort = parseInt((document.getElementById('https-port') as HTMLInputElement)?.value || '0');
    
    const socksHost = (document.getElementById('socks-host') as HTMLInputElement)?.value?.trim();
    const socksPort = parseInt((document.getElementById('socks-port') as HTMLInputElement)?.value || '0');
    const socksVersion = parseInt((document.getElementById('socks-version') as HTMLSelectElement)?.value || '5') as 4 | 5;
    
    const bypassList = (document.getElementById('bypass-list') as HTMLTextAreaElement)?.value?.split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0) || [];
    
    const manual: NonNullable<OptionsProfile['manual']> = {
      bypassList
    };
    
    if (httpHost && httpPort > 0) {
      manual.http = { host: httpHost, port: httpPort };
    }
    
    if (httpsHost && httpsPort > 0) {
      manual.https = { host: httpsHost, port: httpsPort };
    }
    
    if (socksHost && socksPort > 0) {
      manual.socks = { host: socksHost, port: socksPort };
      manual.socksVersion = socksVersion;
    }
    
    // Return undefined if no proxy configuration is provided
    if (!manual.http && !manual.https && !manual.socks) {
      return undefined;
    }
    
    return manual;
  }

  private buildPacConfig(): OptionsProfile['pac'] | undefined {
    const pacUrl = (document.getElementById('pac-url') as HTMLInputElement)?.value?.trim();
    return pacUrl ? { url: pacUrl } : undefined;
  }

  private generateProfileId(): string {
    return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  // Logs management methods
  public async refreshLogs(): Promise<void> {
    try {
      const levelFilter = this.elements.logLevelFilter?.value || '';
      const componentFilter = this.elements.logComponentFilter?.value || '';
      
      const response = await this.sendMessage({
        type: 'getLogs',
        data: {
          level: levelFilter || undefined,
          component: componentFilter || undefined,
          limit: 20 // Only load 20 most recent logs to prevent memory issues
        }
      });
      
      if (response.type === 'logs') {
        const logs = response.data as Array<{
          timestamp: string;
          level: string;
          component: string;
          message: string;
          details?: any;
        }>;
        
        this.displayLogs(logs);
        this.updateComponentFilter(logs);
      } else {
        this.showMessage('Failed to load logs', 'error');
      }
    } catch (error) {
      console.error('Failed to refresh logs:', error);
      this.showMessage('Failed to refresh logs', 'error');
    }
  }

  private displayLogs(logs: Array<any>): void {
    if (!this.elements.logsContainer) return;
    
    if (logs.length === 0) {
      const emptyMessage = this.createSafeElement('div', 'empty-state', 'No logs available');
      this.clearAndAppendSafe(this.elements.logsContainer, emptyMessage);
      return;
    }
    
    const logElements = logs.map(log => this.createLogElement(log));
    this.clearAndAppendSafe(this.elements.logsContainer, ...logElements);
    
    // Scroll to bottom to show latest logs
    this.elements.logsContainer.scrollTop = this.elements.logsContainer.scrollHeight;
  }

  private createLogElement(log: any): HTMLElement {
    const logEntry = this.createSafeElement('div', `log-entry ${log.level.toLowerCase()}`);
    
    const timestamp = new Date(log.timestamp).toLocaleString();
    logEntry.appendChild(this.createSafeElement('span', 'log-timestamp', timestamp));
    logEntry.appendChild(this.createSafeElement('span', 'log-level', log.level));
    logEntry.appendChild(this.createSafeElement('span', 'log-component', `[${log.component}]`));
    logEntry.appendChild(this.createSafeElement('span', 'log-message', log.message));
    
    if (log.details) {
      const details = JSON.stringify(log.details, null, 2);
      const pre = this.createSafeElement('pre', 'log-details', details);
      logEntry.appendChild(pre);
    }
    
    return logEntry;
  }

  private updateComponentFilter(logs: Array<any>): void {
    if (!this.elements.logComponentFilter) return;
    
    const currentValue = this.elements.logComponentFilter.value;
    const components = [...new Set(logs.map(log => log.component))].sort();
    
    const componentOptions = components.map(component => ({
      value: component,
      text: component,
      selected: component === currentValue
    }));
    this.populateSelectSafe(this.elements.logComponentFilter, componentOptions, 'All Components');
  }

  public async clearLogs(): Promise<void> {
    if (!confirm('Are you sure you want to clear all logs?')) return;
    
    try {
      await this.sendMessage({ type: 'clearLogs' });
      await this.refreshLogs();
      this.showMessage('Logs cleared successfully', 'success');
    } catch (error) {
      console.error('Failed to clear logs:', error);
      this.showMessage('Failed to clear logs', 'error');
    }
  }

  public async exportLogs(): Promise<void> {
    try {
      const response = await this.sendMessage({ type: 'getLogs' });
      
      if (response.type === 'logs') {
        const logs = response.data as Array<any>;
        const exportData = {
          exportedAt: new Date().toISOString(),
          totalLogs: logs.length,
          logs: logs
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `proxy-switcheroo-logs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showMessage('Logs exported successfully', 'success');
      } else {
        this.showMessage('Failed to export logs', 'error');
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      this.showMessage('Failed to export logs', 'error');
    }
  }
}

// Global instance for HTML onclick handlers
(window as any).optionsController = null;

document.addEventListener('DOMContentLoaded', () => {
  (window as any).optionsController = new OptionsController();
});