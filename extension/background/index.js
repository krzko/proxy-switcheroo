import { storageService } from './storage.js';
import { logger, createLogger } from './log.js';
import { proxyService } from './proxy.js';
import { ruleEngine } from './rules.js';
const log = createLogger('Background');
class BackgroundService {
    constructor() {
        this.ALARM_NAME = 'rule_evaluation';
        this.ALARM_INTERVAL_MINUTES = 5;
        this.isInitialised = false;
    }
    async initialise() {
        if (this.isInitialised) {
            return;
        }
        try {
            this.setupEventListeners();
            this.isInitialised = true;
            this.initializeServicesInBackground();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Failed to initialise background service', { error: errorMessage });
            throw error;
        }
    }
    async initializeServicesInBackground() {
        try {
            await logger.initialise();
            await storageService.initialise();
            await proxyService.initialise();
            this.setupAlarms();
            this.startCacheCleanup();
            await this.performInitialEvaluation();
        }
        catch (error) {
            log.error('Background service initialization failed', { error });
        }
    }
    setupEventListeners() {
        log.debug('Setting up event listeners');
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
        browser.captivePortal.onConnectivityAvailable.addListener(() => {
            log.info('Captive portal connectivity available, triggering evaluation');
            this.evaluateRules().catch(error => {
                log.error('Error during captive portal evaluation', { error });
            });
        });
        browser.captivePortal.onStateChanged.addListener((state) => {
            log.info('Captive portal state changed', { state });
            this.evaluateRules().catch(error => {
                log.error('Error during captive portal state change evaluation', { error });
            });
        });
        browser.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === this.ALARM_NAME) {
                log.debug('Rule evaluation alarm triggered');
                this.evaluateRules().catch(error => {
                    log.error('Error during scheduled evaluation', { error });
                });
            }
        });
        log.debug('Event listeners set up');
    }
    setupAlarms() {
        log.debug('Setting up alarms');
        browser.alarms.create(this.ALARM_NAME, {
            delayInMinutes: this.ALARM_INTERVAL_MINUTES,
            periodInMinutes: this.ALARM_INTERVAL_MINUTES
        });
    }
    startCacheCleanup() {
        ruleEngine.startCacheCleanup();
    }
    async performInitialEvaluation() {
        log.info('Performing initial rule evaluation');
        const state = await storageService.getState();
        if (state.autoMode) {
            await this.evaluateRules();
        }
        else {
            log.info('Auto mode disabled, skipping initial evaluation');
        }
    }
    async evaluateRules() {
        log.info('Starting rule evaluation');
        try {
            const state = await storageService.getState();
            if (!state.autoMode) {
                log.info('Auto mode disabled, skipping rule evaluation');
                return;
            }
            const rules = await storageService.getRules();
            const result = await ruleEngine.evaluateRules(rules);
            const updateData = {
                lastCheckTime: Date.now()
            };
            if (result.rule?.id) {
                updateData.lastRuleMatched = result.rule.id;
            }
            await storageService.updateState(updateData);
            if (result.matched && result.profileId) {
                log.info('Rule evaluation completed with match', {
                    ruleId: result.rule?.id,
                    ruleName: result.rule?.name,
                    profileId: result.profileId,
                    evaluationTime: result.evaluationTime
                });
                await proxyService.setActiveProfile(result.profileId);
                await this.updateBadge(result.rule?.name || 'Auto');
                const profile = await storageService.getProfile(result.profileId);
                if (profile) {
                    await this.showNotification('Proxy Profile Changed', `Switched to "${profile.name}" profile via rule "${result.rule?.name}"`);
                }
            }
            else {
                log.info('Rule evaluation completed with no match', {
                    evaluationTime: result.evaluationTime
                });
                await this.updateBadge('No Match');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Error during rule evaluation', { error: errorMessage });
            await this.updateBadge('Error');
        }
    }
    async handleMessage(message, _sender, sendResponse) {
        try {
            let response;
            switch (message.type) {
                case 'getState':
                    response = await this.handleGetState();
                    break;
                case 'setState':
                    response = await this.handleSetState(message.data);
                    break;
                case 'setProfile':
                    response = await this.handleSetProfile(message.data);
                    break;
                case 'forceEvaluation':
                    response = await this.handleForceEvaluation();
                    break;
                case 'getProfiles':
                    response = await this.handleGetProfiles();
                    break;
                case 'saveProfile':
                    response = await this.handleSaveProfile(message.data);
                    break;
                case 'deleteProfile':
                    response = await this.handleDeleteProfile(message.data);
                    break;
                case 'getRules':
                    response = await this.handleGetRules();
                    break;
                case 'saveRule':
                    response = await this.handleSaveRule(message.data);
                    break;
                case 'deleteRule':
                    response = await this.handleDeleteRule(message.data);
                    break;
                case 'importConfig':
                    response = await this.handleImportConfig(message.data);
                    break;
                case 'exportConfig':
                    response = await this.handleExportConfig();
                    break;
                case 'testRule':
                    response = await this.handleTestRule(message.data);
                    break;
                case 'getLogs':
                    response = await this.handleGetLogs(message.data);
                    break;
                case 'clearLogs':
                    response = await this.handleClearLogs();
                    break;
                default:
                    throw new Error(`Unknown message type: ${message.type}`);
            }
            sendResponse(response);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Error handling message', { type: message.type, error: errorMessage });
            sendResponse({
                type: 'error',
                data: { error: errorMessage }
            });
        }
    }
    async handleGetState() {
        try {
            const [state, profiles] = await Promise.all([
                storageService.getState(),
                storageService.getProfiles()
            ]);
            const activeProfile = proxyService.getActiveProfile();
            return {
                type: 'state',
                data: {
                    state,
                    activeProfile,
                    profiles
                }
            };
        }
        catch (error) {
            log.warn('Storage not ready, returning minimal state', { error });
            return {
                type: 'state',
                data: {
                    state: { autoMode: false },
                    activeProfile: null,
                    profiles: {}
                }
            };
        }
    }
    async handleSetState(data) {
        await storageService.updateState(data);
        if (data.autoMode === false) {
            ruleEngine.abortAllProbes();
        }
        else if (data.autoMode === true) {
            await this.evaluateRules();
        }
        return { type: 'success', data: null };
    }
    async handleSetProfile(data) {
        const { profileId } = data;
        await proxyService.setActiveProfile(profileId);
        const profile = await storageService.getProfile(profileId);
        await this.updateBadge(profile?.name || 'Manual');
        return { type: 'success', data: null };
    }
    async handleForceEvaluation() {
        ruleEngine.clearCache();
        await this.evaluateRules();
        return { type: 'success', data: null };
    }
    async handleGetProfiles() {
        const profiles = await storageService.getProfiles();
        return { type: 'profiles', data: profiles };
    }
    async handleSaveProfile(data) {
        await storageService.saveProfile(data);
        return { type: 'success', data: null };
    }
    async handleDeleteProfile(data) {
        await storageService.deleteProfile(data.id);
        return { type: 'success', data: null };
    }
    async handleGetRules() {
        const rules = await storageService.getRules();
        return { type: 'rules', data: rules };
    }
    async handleSaveRule(data) {
        await storageService.saveRule(data);
        return { type: 'success', data: null };
    }
    async handleDeleteRule(data) {
        await storageService.deleteRule(data.id);
        return { type: 'success', data: null };
    }
    async handleImportConfig(data) {
        await storageService.importConfig(data);
        return { type: 'success', data: null };
    }
    async handleExportConfig() {
        const config = await storageService.exportConfig();
        return { type: 'config', data: config };
    }
    async handleTestRule(data) {
        const result = await ruleEngine.testRule(data);
        return { type: 'testResult', data: result };
    }
    async handleGetLogs(data) {
        const limit = Math.min(data?.limit || 20, 20);
        const logs = await logger.getLogs(data?.level, data?.component, limit);
        return { type: 'logs', data: logs };
    }
    async handleClearLogs() {
        await logger.clearLogs();
        return { type: 'success', data: null };
    }
    async updateBadge(text) {
        try {
            await browser.action.setBadgeText({ text: text.substring(0, 4) });
            await browser.action.setBadgeBackgroundColor({ color: '#4A90E2' });
        }
        catch (error) {
            log.warn('Failed to update badge', { error });
        }
    }
    async showNotification(title, message) {
        try {
            await browser.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icon-48.png',
                title,
                message
            });
        }
        catch (error) {
            log.warn('Failed to show notification', { error });
        }
    }
    async destroy() {
        log.info('Destroying background service');
        browser.alarms.clear(this.ALARM_NAME);
        ruleEngine.abortAllProbes();
        proxyService.destroy();
        await logger.flush();
        this.isInitialised = false;
    }
}
const backgroundService = new BackgroundService();
backgroundService.initialise().catch(error => {
    console.error('Failed to initialise background service immediately:', error);
});
browser.runtime.onInstalled.addListener(() => {
    backgroundService.initialise().catch(error => {
        console.error('Failed to initialise background service:', error);
    });
});
browser.runtime.onStartup.addListener(() => {
    backgroundService.initialise().catch(error => {
        console.error('Failed to initialise background service on startup:', error);
    });
});
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { backgroundService };
}
//# sourceMappingURL=index.js.map