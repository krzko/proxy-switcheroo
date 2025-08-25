"use strict";
class OptionsController {
    constructor() {
        this.profiles = {};
        this.rules = {};
        this.elements = {
            tabBtns: document.querySelectorAll('.tab-btn'),
            tabPanes: document.querySelectorAll('.tab-content'),
            profilesList: document.getElementById('profiles-list'),
            addProfileBtn: document.getElementById('add-profile-btn'),
            rulesList: document.getElementById('rules-list'),
            addRuleBtn: document.getElementById('add-rule-btn'),
            importBtn: document.getElementById('import-btn'),
            exportBtn: document.getElementById('export-btn'),
            importFile: document.getElementById('import-file'),
            statusDiv: document.getElementById('status'),
            logsContainer: document.getElementById('logs-container'),
            refreshLogsBtn: document.getElementById('refresh-logs'),
            clearLogsBtn: document.getElementById('clear-logs'),
            exportLogsBtn: document.getElementById('export-logs'),
            logLevelFilter: document.getElementById('log-level-filter'),
            logComponentFilter: document.getElementById('log-component-filter')
        };
        this.bindEvents();
        this.initialise();
    }
    bindEvents() {
        this.elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                this.switchTab(target.dataset.tab);
            });
        });
        this.elements.addProfileBtn?.addEventListener('click', () => {
            this.addNewProfile();
        });
        this.elements.profilesList?.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('edit-profile-btn')) {
                const profileId = target.dataset.profileId;
                if (profileId)
                    this.editProfile(profileId);
            }
            else if (target.classList.contains('delete-profile-btn')) {
                const profileId = target.dataset.profileId;
                if (profileId)
                    this.deleteProfile(profileId);
            }
        });
        this.elements.addRuleBtn?.addEventListener('click', () => {
            this.addNewRule();
        });
        this.elements.rulesList?.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('toggle-rule-btn')) {
                const ruleId = target.dataset.ruleId;
                if (ruleId)
                    this.toggleRule(ruleId);
            }
            else if (target.classList.contains('edit-rule-btn')) {
                const ruleId = target.dataset.ruleId;
                if (ruleId)
                    this.editRule(ruleId);
            }
            else if (target.classList.contains('delete-rule-btn')) {
                const ruleId = target.dataset.ruleId;
                if (ruleId)
                    this.deleteRule(ruleId);
            }
        });
        this.elements.exportBtn?.addEventListener('click', () => {
            this.handleExport();
        });
        this.elements.importBtn?.addEventListener('click', () => {
            this.elements.importFile?.click();
        });
        this.elements.importFile?.addEventListener('change', () => {
            this.handleImport();
        });
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
    async initialise() {
        try {
            await this.loadData();
            this.updateUI();
            this.switchTab('profiles');
        }
        catch (error) {
            this.showMessage('Failed to initialise options page', 'error');
            console.error('Options initialisation error:', error);
        }
    }
    async loadData() {
        const [profilesResponse, rulesResponse] = await Promise.all([
            this.sendMessage({ type: 'getProfiles' }),
            this.sendMessage({ type: 'getRules' })
        ]);
        if (profilesResponse.type === 'error') {
            throw new Error(profilesResponse.data?.error || 'Failed to load profiles');
        }
        if (rulesResponse.type === 'error') {
            throw new Error(rulesResponse.data?.error || 'Failed to load rules');
        }
        this.profiles = profilesResponse.data || {};
        this.rules = rulesResponse.data || {};
    }
    updateUI() {
        this.updateProfilesList();
        this.updateRulesList();
    }
    switchTab(tabName) {
        this.elements.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        this.elements.tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `${tabName}-tab`);
        });
        if (tabName === 'logs') {
            this.refreshLogs().catch(error => {
                console.error('Failed to load logs:', error);
                this.showMessage('Failed to load logs', 'error');
            });
        }
    }
    updateProfilesList() {
        if (!this.elements.profilesList)
            return;
        const profiles = Object.values(this.profiles);
        if (profiles.length === 0) {
            const emptyMessage = this.createSafeElement('p', 'empty-state', 'No profiles configured. Default profiles should load automatically.');
            this.clearAndAppendSafe(this.elements.profilesList, emptyMessage);
            return;
        }
        const profileElements = profiles.map(profile => this.createProfileElement(profile));
        this.clearAndAppendSafe(this.elements.profilesList, ...profileElements);
    }
    createProfileElement(profile) {
        const profileItem = this.createSafeElement('div', 'profile-item');
        profileItem.dataset.profileId = profile.id;
        const profileInfo = this.createSafeElement('div', 'profile-info');
        const profileName = this.createSafeElement('h3', 'profile-name', profile.name);
        const profileMode = this.createSafeElement('p', 'profile-details', this.capitalise(profile.mode));
        profileInfo.appendChild(profileName);
        profileInfo.appendChild(profileMode);
        const detailsElement = this.createProfileDetailsElement(profile);
        if (detailsElement) {
            profileInfo.appendChild(detailsElement);
        }
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
    createProfileDetailsElement(profile) {
        const details = this.getProfileDetailsText(profile);
        return details ? this.createSafeElement('p', 'profile-details', details) : null;
    }
    updateRulesList() {
        if (!this.elements.rulesList)
            return;
        const rules = Object.values(this.rules).sort((a, b) => a.priority - b.priority);
        if (rules.length === 0) {
            const emptyMessage = this.createSafeElement('p', 'empty-state', 'No rules configured. Default example rules should load automatically.');
            this.clearAndAppendSafe(this.elements.rulesList, emptyMessage);
            return;
        }
        const ruleElements = rules.map(rule => this.createRuleElement(rule));
        this.clearAndAppendSafe(this.elements.rulesList, ...ruleElements);
    }
    createRuleElement(rule) {
        const ruleItem = this.createSafeElement('div', `rule-item ${rule.enabled ? 'enabled' : 'disabled'}`);
        ruleItem.dataset.ruleId = rule.id;
        const ruleInfo = this.createSafeElement('div', 'rule-info');
        const ruleName = this.createSafeElement('h3', '', rule.name);
        const rulePriority = this.createSafeElement('p', 'rule-priority', `Priority: ${rule.priority}`);
        const ruleStatus = this.createSafeElement('p', 'rule-status', `Status: ${rule.enabled ? 'Enabled' : 'Disabled'}`);
        const ruleAction = this.createSafeElement('p', 'rule-action', `→ Set profile: ${rule.then.setActiveProfile}`);
        ruleInfo.appendChild(ruleName);
        ruleInfo.appendChild(rulePriority);
        ruleInfo.appendChild(ruleStatus);
        ruleInfo.appendChild(ruleAction);
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
    getProfileDetailsText(profile) {
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
    async handleExport() {
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
        }
        catch (error) {
            this.showMessage('Failed to export configuration', 'error');
        }
    }
    async handleImport() {
        const file = this.elements.importFile?.files?.[0];
        if (!file)
            return;
        try {
            const text = await file.text();
            const config = JSON.parse(text);
            await this.sendMessage({ type: 'importConfig', data: config });
            await this.loadData();
            this.updateUI();
            this.showMessage('Configuration imported successfully', 'success');
        }
        catch (error) {
            this.showMessage('Failed to import configuration', 'error');
        }
    }
    async sendMessage(message) {
        try {
            const response = await browser.runtime.sendMessage(message);
            if (response.type === 'error') {
                throw new Error(response.data?.error || 'Unknown error');
            }
            return response;
        }
        catch (error) {
            throw error instanceof Error ? error : new Error('Unknown error');
        }
    }
    showMessage(message, type) {
        if (!this.elements.statusDiv)
            return;
        this.elements.statusDiv.textContent = message;
        this.elements.statusDiv.className = `status ${type}`;
        setTimeout(() => {
            this.elements.statusDiv.textContent = '';
            this.elements.statusDiv.className = 'status';
        }, 5000);
    }
    capitalise(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    escapeHtml(unsafe) {
        const div = document.createElement('div');
        div.textContent = unsafe;
        return div.innerHTML;
    }
    createSafeElement(tagName, className, textContent) {
        const element = document.createElement(tagName);
        if (className)
            element.className = className;
        if (textContent)
            element.textContent = textContent;
        return element;
    }
    clearAndAppendSafe(container, ...elements) {
        container.textContent = '';
        elements.forEach(element => container.appendChild(element));
    }
    populateSelectSafe(selectElement, options, defaultText) {
        selectElement.textContent = '';
        if (defaultText) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = defaultText;
            selectElement.appendChild(defaultOption);
        }
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (opt.selected)
                option.selected = true;
            selectElement.appendChild(option);
        });
    }
    async toggleRule(ruleId) {
        const rule = this.rules[ruleId];
        if (!rule)
            return;
        try {
            const updatedRule = { ...rule, enabled: !rule.enabled };
            await this.sendMessage({ type: 'saveRule', data: updatedRule });
            this.rules[ruleId] = updatedRule;
            this.updateRulesList();
            this.showMessage(`Rule ${updatedRule.enabled ? 'enabled' : 'disabled'} successfully`, 'success');
        }
        catch (error) {
            this.showMessage('Failed to toggle rule', 'error');
        }
    }
    async deleteRule(ruleId) {
        const rule = this.rules[ruleId];
        if (!rule)
            return;
        if (!confirm(`Are you sure you want to delete the rule "${rule.name}"?`))
            return;
        try {
            await this.sendMessage({ type: 'deleteRule', data: { id: ruleId } });
            delete this.rules[ruleId];
            this.updateRulesList();
            this.showMessage('Rule deleted successfully', 'success');
        }
        catch (error) {
            this.showMessage('Failed to delete rule', 'error');
        }
    }
    editRule(ruleId) {
        const rule = this.rules[ruleId];
        if (!rule)
            return;
        this.showEditRuleDialog(rule);
    }
    addNewRule() {
        this.showEditRuleDialog(null);
    }
    showEditRuleDialog(rule) {
        const modal = document.getElementById('rule-modal');
        const title = document.getElementById('rule-modal-title');
        const saveBtn = document.getElementById('save-rule');
        if (!modal || !title || !saveBtn)
            return;
        const isEdit = rule !== null;
        title.textContent = isEdit ? 'Edit Rule' : 'Add New Rule';
        document.getElementById('rule-name').value = rule?.name || '';
        document.getElementById('rule-priority').value = String(rule?.priority || 100);
        document.getElementById('rule-enabled').checked = rule?.enabled !== false;
        document.getElementById('rule-stop-on-match').checked = rule?.stopOnMatch !== false;
        const profileSelect = document.getElementById('rule-action-profile');
        const profileOptions = Object.values(this.profiles).map(p => ({
            value: p.id,
            text: p.name,
            selected: rule?.then.setActiveProfile === p.id
        }));
        this.populateSelectSafe(profileSelect, profileOptions, 'Select profile...');
        this.setupTriggersSection(rule);
        saveBtn.replaceWith(saveBtn.cloneNode(true));
        const newSaveBtn = document.getElementById('save-rule');
        newSaveBtn.addEventListener('click', () => this.saveRule(rule?.id || ''));
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancel-rule');
        const testBtn = document.getElementById('test-rule');
        const newCloseBtn = closeBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newTestBtn = testBtn.cloneNode(true);
        closeBtn.replaceWith(newCloseBtn);
        cancelBtn.replaceWith(newCancelBtn);
        testBtn.replaceWith(newTestBtn);
        newCloseBtn.addEventListener('click', () => this.closeRuleDialog());
        newCancelBtn.addEventListener('click', () => this.closeRuleDialog());
        newTestBtn.addEventListener('click', () => this.testRule());
        modal.classList.remove('hidden');
    }
    setupTriggersSection(rule) {
        const triggersSection = document.getElementById('triggers-section');
        if (!triggersSection)
            return;
        triggersSection.textContent = '';
        let currentTrigger = '';
        if (rule?.when) {
            if (rule.when.timeWindow)
                currentTrigger = 'timeWindow';
            else if (rule.when.dnsResolve)
                currentTrigger = 'dnsResolve';
            else if (rule.when.reachability)
                currentTrigger = 'reachability';
            else if (rule.when.ipInfo)
                currentTrigger = 'ipInfo';
        }
        if (currentTrigger) {
            this.addTriggerUI(currentTrigger, rule);
        }
        else {
            this.showAddTriggerButton();
        }
    }
    showAddTriggerButton() {
        const triggersSection = document.getElementById('triggers-section');
        const addTriggerBtn = this.createSafeElement('button', 'btn secondary small add-trigger-btn', 'Add Trigger');
        addTriggerBtn.type = 'button';
        addTriggerBtn.addEventListener('click', () => this.showTriggerOptions());
        const formNote = this.createSafeElement('p', 'form-note', 'Rules need at least one trigger condition to activate.');
        this.clearAndAppendSafe(triggersSection, addTriggerBtn, formNote);
    }
    showTriggerOptions() {
        const triggersSection = document.getElementById('triggers-section');
        const triggerSelection = this.createSafeElement('div', 'trigger-selection');
        const header = this.createSafeElement('h4', '', 'Select Trigger Type:');
        triggerSelection.appendChild(header);
        const buttonsContainer = this.createSafeElement('div', 'trigger-type-buttons');
        const triggerTypes = [
            { type: 'timeWindow', label: 'Time Window' },
            { type: 'dnsResolve', label: 'DNS Resolution' },
            { type: 'reachability', label: 'URL Reachability' },
            { type: 'ipInfo', label: 'IP Info' }
        ];
        triggerTypes.forEach(trigger => {
            const btn = this.createSafeElement('button', 'btn secondary small trigger-type-btn', trigger.label);
            btn.type = 'button';
            btn.dataset.triggerType = trigger.type;
            btn.addEventListener('click', () => this.addTriggerType(trigger.type));
            buttonsContainer.appendChild(btn);
        });
        triggerSelection.appendChild(buttonsContainer);
        const cancelBtn = this.createSafeElement('button', 'btn secondary small cancel-trigger-btn', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => this.cancelAddTrigger());
        triggerSelection.appendChild(cancelBtn);
        this.clearAndAppendSafe(triggersSection, triggerSelection);
    }
    addTriggerType(triggerType) {
        this.addTriggerUI(triggerType, null);
    }
    cancelAddTrigger() {
        this.showAddTriggerButton();
    }
    addTriggerUI(triggerType, rule) {
        const triggersSection = document.getElementById('triggers-section');
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
        const parser = new DOMParser();
        const doc = parser.parseFromString(triggerHtml, 'text/html');
        const content = doc.body.firstElementChild;
        triggersSection.textContent = '';
        if (content)
            triggersSection.appendChild(content);
        const removeBtn = triggersSection.querySelector('.remove-trigger-btn');
        removeBtn?.addEventListener('click', () => this.removeTrigger());
    }
    removeTrigger() {
        this.showAddTriggerButton();
    }
    closeRuleDialog() {
        const modal = document.getElementById('rule-modal');
        if (modal)
            modal.classList.add('hidden');
    }
    async saveRule(existingRuleId) {
        try {
            const nameInput = document.getElementById('rule-name');
            const priorityInput = document.getElementById('rule-priority');
            const enabledInput = document.getElementById('rule-enabled');
            const stopOnMatchInput = document.getElementById('rule-stop-on-match');
            const profileSelect = document.getElementById('rule-action-profile');
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
            const rule = {
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
        }
        catch (error) {
            console.error('Failed to save rule:', error);
            this.showMessage('Failed to save rule', 'error');
        }
    }
    buildTriggerCondition() {
        const triggerItem = document.querySelector('.trigger-item');
        if (!triggerItem)
            return {};
        const triggerType = triggerItem.dataset.triggerType;
        if (!triggerType)
            return {};
        switch (triggerType) {
            case 'timeWindow':
                const daysInput = document.getElementById('time-days')?.value || '';
                const days = daysInput ? daysInput.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 7) : [];
                const from = document.getElementById('time-from')?.value || '';
                const to = document.getElementById('time-to')?.value || '';
                if (days.length === 0 || !from || !to)
                    return {};
                return {
                    timeWindow: { days, from, to }
                };
            case 'dnsResolve':
                const hostname = document.getElementById('dns-hostname')?.value?.trim() || '';
                return hostname ? { dnsResolve: { hostname, matches: 'exact' } } : {};
            case 'reachability':
                const url = document.getElementById('reach-url')?.value?.trim() || '';
                return url ? { reachability: { url, method: 'HEAD', expectStatus: 200 } } : {};
            case 'ipInfo':
                const org = document.getElementById('ip-org')?.value?.trim() || '';
                const country = document.getElementById('ip-country')?.value?.trim() || '';
                const ipInfo = {};
                if (org)
                    ipInfo.expectOrg = org;
                if (country)
                    ipInfo.expectCountry = country;
                return Object.keys(ipInfo).length > 0 ? { ipInfo } : {};
            default:
                return {};
        }
    }
    generateRuleId() {
        return 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    async testRule() {
        try {
            const nameInput = document.getElementById('rule-name');
            const priorityInput = document.getElementById('rule-priority');
            const stopOnMatchInput = document.getElementById('rule-stop-on-match');
            const profileSelect = document.getElementById('rule-action-profile');
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
            const testRule = {
                id: 'test_rule_' + Date.now(),
                name: nameInput.value.trim() + ' (Test)',
                priority: parseInt(priorityInput.value) || 100,
                enabled: true,
                stopOnMatch: stopOnMatchInput.checked,
                when,
                then: {
                    setActiveProfile: profileSelect.value
                }
            };
            const testBtn = document.getElementById('test-rule');
            const originalText = testBtn.textContent;
            testBtn.textContent = 'Testing...';
            testBtn.disabled = true;
            console.log('Sending test rule request:', testRule);
            const response = await this.sendMessage({ type: 'testRule', data: testRule });
            console.log('Test rule response received:', response);
            if (response.type === 'testResult') {
                const result = response.data;
                console.log('Test result data:', result);
                console.log('Result success:', result.success);
                console.log('Result results:', result.results);
                if (result.results && Object.keys(result.results).length > 0) {
                    console.log('Showing test results modal');
                    this.showTestResults(result.results);
                }
                else {
                    console.log('No results to show, showing message');
                    this.showMessage(result.error || 'Test completed but no results available', 'info');
                }
                if (result.success) {
                    this.showMessage('Rule test completed successfully', 'success');
                }
                else {
                    this.showMessage(`Test completed with issues: ${result.error || 'Check results for details'}`, 'error');
                }
            }
            else {
                this.showMessage(`Unexpected test response type: ${response.type}`, 'error');
                console.error('Unexpected response:', response);
            }
            testBtn.textContent = originalText;
            testBtn.disabled = false;
        }
        catch (error) {
            console.error('Failed to test rule:', error);
            this.showMessage('Failed to test rule', 'error');
            const testBtn = document.getElementById('test-rule');
            testBtn.textContent = 'Test Rule';
            testBtn.disabled = false;
        }
    }
    showTestResults(results) {
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
        modal.style.display = 'flex';
        const modalContent = this.createSafeElement('div', 'modal-content');
        const header = this.createSafeElement('div', 'modal-header');
        header.appendChild(this.createSafeElement('h3', '', 'Rule Test Results'));
        const closeBtn = this.createSafeElement('button', 'modal-close', '×');
        header.appendChild(closeBtn);
        modalContent.appendChild(header);
        const body = this.createSafeElement('div', 'modal-body');
        const resultsDiv = this.createSafeElement('div', 'test-results');
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
        const footer = this.createSafeElement('div', 'modal-footer');
        footer.appendChild(this.createSafeElement('button', 'btn secondary close-results', 'Close'));
        modalContent.appendChild(footer);
        modal.appendChild(modalContent);
        console.log('Appending modal to body');
        document.body.appendChild(modal);
        console.log('Modal appended, element:', modal);
        const modalCloseBtn = modal.querySelector('.modal-close');
        const closeResultsBtn = modal.querySelector('.close-results');
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
        modal.addEventListener('click', (e) => {
            if (e.target === modal)
                closeModal();
        });
        console.log('Modal setup complete');
    }
    addNewProfile() {
        this.showEditProfileDialog(null);
    }
    editProfile(profileId) {
        const profile = this.profiles[profileId];
        if (!profile)
            return;
        this.showEditProfileDialog(profile);
    }
    async deleteProfile(profileId) {
        const profile = this.profiles[profileId];
        if (!profile)
            return;
        if (!confirm(`Are you sure you want to delete the profile "${profile.name}"?`))
            return;
        try {
            await this.sendMessage({ type: 'deleteProfile', data: { id: profileId } });
            delete this.profiles[profileId];
            this.updateProfilesList();
            this.showMessage('Profile deleted successfully', 'success');
        }
        catch (error) {
            this.showMessage('Failed to delete profile', 'error');
        }
    }
    showEditProfileDialog(profile) {
        const modal = document.getElementById('profile-modal');
        const title = document.getElementById('profile-modal-title');
        const saveBtn = document.getElementById('save-profile');
        if (!modal || !title || !saveBtn)
            return;
        const isEdit = profile !== null;
        title.textContent = isEdit ? 'Edit Profile' : 'Add New Profile';
        document.getElementById('profile-name').value = profile?.name || '';
        document.getElementById('profile-mode').value = profile?.mode || 'direct';
        this.setupProfileModeHandling(profile);
        saveBtn.replaceWith(saveBtn.cloneNode(true));
        const newSaveBtn = document.getElementById('save-profile');
        newSaveBtn.addEventListener('click', () => this.saveProfile(profile?.id || ''));
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancel-profile');
        const newCloseBtn = closeBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        closeBtn.replaceWith(newCloseBtn);
        cancelBtn.replaceWith(newCancelBtn);
        newCloseBtn.addEventListener('click', () => this.closeProfileDialog());
        newCancelBtn.addEventListener('click', () => this.closeProfileDialog());
        modal.classList.remove('hidden');
    }
    setupProfileModeHandling(profile) {
        const modeSelect = document.getElementById('profile-mode');
        const manualConfig = document.getElementById('manual-config');
        const pacConfig = document.getElementById('pac-config');
        const updateConfigVisibility = () => {
            const mode = modeSelect.value;
            manualConfig.classList.add('hidden');
            pacConfig.classList.add('hidden');
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
    populateManualConfig(profile) {
        if (!profile?.manual)
            return;
        const manual = profile.manual;
        document.getElementById('http-host').value = manual.http?.host || '';
        document.getElementById('http-port').value = manual.http?.port?.toString() || '';
        document.getElementById('https-host').value = manual.https?.host || '';
        document.getElementById('https-port').value = manual.https?.port?.toString() || '';
        document.getElementById('socks-host').value = manual.socks?.host || '';
        document.getElementById('socks-port').value = manual.socks?.port?.toString() || '';
        document.getElementById('socks-version').value = manual.socksVersion?.toString() || '5';
        document.getElementById('bypass-list').value = manual.bypassList?.join(', ') || '';
    }
    populatePacConfig(profile) {
        if (!profile?.pac)
            return;
        document.getElementById('pac-url').value = profile.pac.url || '';
    }
    closeProfileDialog() {
        const modal = document.getElementById('profile-modal');
        if (modal)
            modal.classList.add('hidden');
    }
    async saveProfile(existingProfileId) {
        try {
            const nameInput = document.getElementById('profile-name');
            const modeSelect = document.getElementById('profile-mode');
            if (!nameInput?.value?.trim()) {
                this.showMessage('Profile name is required', 'error');
                return;
            }
            const profile = {
                id: existingProfileId || this.generateProfileId(),
                name: nameInput.value.trim(),
                mode: modeSelect.value
            };
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
        }
        catch (error) {
            console.error('Failed to save profile:', error);
            this.showMessage('Failed to save profile', 'error');
        }
    }
    buildManualConfig() {
        const httpHost = document.getElementById('http-host')?.value?.trim();
        const httpPort = parseInt(document.getElementById('http-port')?.value || '0');
        const httpsHost = document.getElementById('https-host')?.value?.trim();
        const httpsPort = parseInt(document.getElementById('https-port')?.value || '0');
        const socksHost = document.getElementById('socks-host')?.value?.trim();
        const socksPort = parseInt(document.getElementById('socks-port')?.value || '0');
        const socksVersion = parseInt(document.getElementById('socks-version')?.value || '5');
        const bypassList = document.getElementById('bypass-list')?.value?.split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0) || [];
        const manual = {
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
        if (!manual.http && !manual.https && !manual.socks) {
            return undefined;
        }
        return manual;
    }
    buildPacConfig() {
        const pacUrl = document.getElementById('pac-url')?.value?.trim();
        return pacUrl ? { url: pacUrl } : undefined;
    }
    generateProfileId() {
        return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    async refreshLogs() {
        try {
            const levelFilter = this.elements.logLevelFilter?.value || '';
            const componentFilter = this.elements.logComponentFilter?.value || '';
            const response = await this.sendMessage({
                type: 'getLogs',
                data: {
                    level: levelFilter || undefined,
                    component: componentFilter || undefined,
                    limit: 20
                }
            });
            if (response.type === 'logs') {
                const logs = response.data;
                this.displayLogs(logs);
                this.updateComponentFilter(logs);
            }
            else {
                this.showMessage('Failed to load logs', 'error');
            }
        }
        catch (error) {
            console.error('Failed to refresh logs:', error);
            this.showMessage('Failed to refresh logs', 'error');
        }
    }
    displayLogs(logs) {
        if (!this.elements.logsContainer)
            return;
        if (logs.length === 0) {
            const emptyMessage = this.createSafeElement('div', 'empty-state', 'No logs available');
            this.clearAndAppendSafe(this.elements.logsContainer, emptyMessage);
            return;
        }
        const logElements = logs.map(log => this.createLogElement(log));
        this.clearAndAppendSafe(this.elements.logsContainer, ...logElements);
        this.elements.logsContainer.scrollTop = this.elements.logsContainer.scrollHeight;
    }
    createLogElement(log) {
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
    updateComponentFilter(logs) {
        if (!this.elements.logComponentFilter)
            return;
        const currentValue = this.elements.logComponentFilter.value;
        const components = [...new Set(logs.map(log => log.component))].sort();
        const componentOptions = components.map(component => ({
            value: component,
            text: component,
            selected: component === currentValue
        }));
        this.populateSelectSafe(this.elements.logComponentFilter, componentOptions, 'All Components');
    }
    async clearLogs() {
        if (!confirm('Are you sure you want to clear all logs?'))
            return;
        try {
            await this.sendMessage({ type: 'clearLogs' });
            await this.refreshLogs();
            this.showMessage('Logs cleared successfully', 'success');
        }
        catch (error) {
            console.error('Failed to clear logs:', error);
            this.showMessage('Failed to clear logs', 'error');
        }
    }
    async exportLogs() {
        try {
            const response = await this.sendMessage({ type: 'getLogs' });
            if (response.type === 'logs') {
                const logs = response.data;
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
            }
            else {
                this.showMessage('Failed to export logs', 'error');
            }
        }
        catch (error) {
            console.error('Failed to export logs:', error);
            this.showMessage('Failed to export logs', 'error');
        }
    }
}
window.optionsController = null;
document.addEventListener('DOMContentLoaded', () => {
    window.optionsController = new OptionsController();
});
//# sourceMappingURL=options.js.map