import { storageService } from './storage.js';
import { logger, createLogger } from './log.js';
import { proxyService } from './proxy.js';
import { ruleEngine } from './rules.js';
import type { PopupMessage, PopupResponse, OptionsMessage, OptionsResponse } from '../types/models';

const log = createLogger('Background');

class BackgroundService {
  private readonly ALARM_NAME = 'rule_evaluation';
  private readonly ALARM_INTERVAL_MINUTES = 5;
  private isInitialised = false;

  public async initialise(): Promise<void> {
    if (this.isInitialised) {
      return;
    }

    try {
      // Initialize core services quickly without waiting for storage defaults
      this.setupEventListeners();
      this.isInitialised = true;
      
      // Initialize other services in background (non-blocking)
      this.initializeServicesInBackground();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to initialise background service', { error: errorMessage });
      throw error;
    }
  }

  private async initializeServicesInBackground(): Promise<void> {
    try {
      await logger.initialise();
      await storageService.initialise();
      await proxyService.initialise();

      this.setupAlarms();
      this.startCacheCleanup();
      await this.performInitialEvaluation();
      
    } catch (error) {
      log.error('Background service initialization failed', { error });
    }
  }

  private setupEventListeners(): void {
    log.debug('Setting up event listeners');

    browser.runtime.onMessage.addListener(
      (message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Indicates async response
      }
    );

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

  private setupAlarms(): void {
    log.debug('Setting up alarms');

    browser.alarms.create(this.ALARM_NAME, {
      delayInMinutes: this.ALARM_INTERVAL_MINUTES,
      periodInMinutes: this.ALARM_INTERVAL_MINUTES
    });
  }

  private startCacheCleanup(): void {
    ruleEngine.startCacheCleanup();
  }

  private async performInitialEvaluation(): Promise<void> {
    log.info('Performing initial rule evaluation');
    
    const state = await storageService.getState();
    if (state.autoMode) {
      await this.evaluateRules();
    } else {
      log.info('Auto mode disabled, skipping initial evaluation');
    }
  }

  public async evaluateRules(): Promise<void> {
    log.info('Starting rule evaluation');

    try {
      const state = await storageService.getState();
      
      if (!state.autoMode) {
        log.info('Auto mode disabled, skipping rule evaluation');
        return;
      }

      const rules = await storageService.getRules();
      const result = await ruleEngine.evaluateRules(rules);

      const updateData: { lastCheckTime: number; lastRuleMatched?: string } = {
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
          await this.showNotification(
            'Proxy Profile Changed',
            `Switched to "${profile.name}" profile via rule "${result.rule?.name}"`
          );
        }
      } else {
        log.info('Rule evaluation completed with no match', {
          evaluationTime: result.evaluationTime
        });
        await this.updateBadge('No Match');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Error during rule evaluation', { error: errorMessage });
      await this.updateBadge('Error');
    }
  }

  private async handleMessage(
    message: PopupMessage | OptionsMessage,
    _sender: browser.runtime.MessageSender,
    sendResponse: (response: PopupResponse | OptionsResponse) => void
  ): Promise<void> {
    // Removed debug logging to prevent memory issues

    try {
      let response: PopupResponse | OptionsResponse;

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
          throw new Error(`Unknown message type: ${(message as any).type}`);
      }

      sendResponse(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Error handling message', { type: message.type, error: errorMessage });
      
      sendResponse({
        type: 'error',
        data: { error: errorMessage }
      });
    }
  }

  private async handleGetState(): Promise<PopupResponse> {
    try {
      // Use parallel execution to reduce total time
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
    } catch (error) {
      // If storage isn't ready, return minimal state
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

  private async handleSetState(data: any): Promise<PopupResponse> {
    await storageService.updateState(data);
    
    if (data.autoMode === false) {
      ruleEngine.abortAllProbes();
    } else if (data.autoMode === true) {
      await this.evaluateRules();
    }
    
    return { type: 'success', data: null };
  }

  private async handleSetProfile(data: any): Promise<PopupResponse> {
    const { profileId } = data;
    await proxyService.setActiveProfile(profileId);
    
    const profile = await storageService.getProfile(profileId);
    await this.updateBadge(profile?.name || 'Manual');
    
    return { type: 'success', data: null };
  }

  private async handleForceEvaluation(): Promise<PopupResponse> {
    ruleEngine.clearCache();
    await this.evaluateRules();
    return { type: 'success', data: null };
  }

  private async handleGetProfiles(): Promise<OptionsResponse> {
    const profiles = await storageService.getProfiles();
    return { type: 'profiles', data: profiles };
  }

  private async handleSaveProfile(data: any): Promise<OptionsResponse> {
    await storageService.saveProfile(data);
    return { type: 'success', data: null };
  }

  private async handleDeleteProfile(data: any): Promise<OptionsResponse> {
    await storageService.deleteProfile(data.id);
    return { type: 'success', data: null };
  }

  private async handleGetRules(): Promise<OptionsResponse> {
    const rules = await storageService.getRules();
    return { type: 'rules', data: rules };
  }

  private async handleSaveRule(data: any): Promise<OptionsResponse> {
    await storageService.saveRule(data);
    return { type: 'success', data: null };
  }

  private async handleDeleteRule(data: any): Promise<OptionsResponse> {
    await storageService.deleteRule(data.id);
    return { type: 'success', data: null };
  }

  private async handleImportConfig(data: any): Promise<OptionsResponse> {
    await storageService.importConfig(data);
    return { type: 'success', data: null };
  }

  private async handleExportConfig(): Promise<OptionsResponse> {
    const config = await storageService.exportConfig();
    return { type: 'config', data: config };
  }

  private async handleTestRule(data: any): Promise<OptionsResponse> {
    const result = await ruleEngine.testRule(data);
    return { type: 'testResult', data: result };
  }

  private async handleGetLogs(data: any): Promise<OptionsResponse> {
    // Drastically limit logs returned for performance - UI can paginate if needed
    const limit = Math.min(data?.limit || 20, 20); // Maximum 20 logs, default 20
    const logs = await logger.getLogs(data?.level, data?.component, limit);
    return { type: 'logs', data: logs };
  }

  private async handleClearLogs(): Promise<OptionsResponse> {
    await logger.clearLogs();
    return { type: 'success', data: null };
  }

  private async updateBadge(text: string): Promise<void> {
    try {
      await browser.action.setBadgeText({ text: text.substring(0, 4) });
      await browser.action.setBadgeBackgroundColor({ color: '#4A90E2' });
    } catch (error) {
      log.warn('Failed to update badge', { error });
    }
  }

  private async showNotification(title: string, message: string): Promise<void> {
    try {
      await browser.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icon-48.png',
        title,
        message
      });
    } catch (error) {
      log.warn('Failed to show notification', { error });
    }
  }

  public async destroy(): Promise<void> {
    log.info('Destroying background service');
    
    browser.alarms.clear(this.ALARM_NAME);
    ruleEngine.abortAllProbes();
    proxyService.destroy();
    
    // Flush any pending logs before shutdown
    await logger.flush();
    
    this.isInitialised = false;
  }
}

const backgroundService = new BackgroundService();

// Immediate initialisation for service worker
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