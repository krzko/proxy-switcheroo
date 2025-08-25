import type { Profile, PerRequestRule } from '../types/models.js';
import { storageService } from './storage.js';
import { createLogger } from './log.js';

const log = createLogger('ProxyService');

export interface ProxyRequestDetails {
  requestId: string;
  url: string;
  method: string;
  frameId: number;
  parentFrameId: number;
  tabId: number;
  type: string;
  timeStamp: number;
}

export class ProxyService {
  private activeProfile: Profile | null = null;
  private isListenerRegistered = false;

  public async initialise(): Promise<void> {
    // Reduced logging to prevent memory issues
    
    const state = await storageService.getState();
    if (state.activeProfileId) {
      await this.setActiveProfile(state.activeProfileId);
    }

    this.registerProxyListener();
    
    storageService.onChanged((changes) => {
      if (changes.state?.newValue?.activeProfileId) {
        this.setActiveProfile(changes.state.newValue.activeProfileId);
      }
    });

    // Only log completion, not initialization details
  }

  public async setActiveProfile(profileId: string): Promise<void> {
    // Reduced logging - only log errors
    
    const profile = await storageService.getProfile(profileId);
    if (!profile) {
      log.error('Profile not found', { profileId });
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.activeProfile = profile;
    await storageService.updateState({ activeProfileId: profileId });

    switch (profile.mode) {
      case 'direct':
        await this.setDirectProxy();
        break;
      case 'system':
        await this.setSystemProxy();
        break;
      case 'manual':
        await this.setManualProxy(profile);
        break;
      case 'pac':
        await this.setPacProxy(profile);
        break;
      case 'perRequest':
        break;
      default:
        log.warn('Unknown proxy mode', { mode: profile.mode });
    }

    // Only log errors, not successful operations
  }

  private async setDirectProxy(): Promise<void> {
    log.debug('Setting direct proxy');
    try {
      await browser.proxy.settings.set({
        value: { proxyType: 'none' }
      });
      log.info('Direct proxy set successfully via settings API');
    } catch (error) {
      log.warn('Using per-request proxy handling (settings API requires additional permissions)', { reason: error instanceof Error ? error.message : error });
      // This is expected and fine - the per-request handler will handle direct connections
    }
  }

  private async setSystemProxy(): Promise<void> {
    log.debug('Setting system proxy');
    try {
      await browser.proxy.settings.set({
        value: { proxyType: 'system' }
      });
      log.info('System proxy set successfully via settings API');
    } catch (error) {
      log.warn('Using per-request proxy handling (settings API requires additional permissions)', { reason: error instanceof Error ? error.message : error });
      // This is expected and fine - the per-request handler will handle system connections
    }
  }

  private async setManualProxy(profile: Profile): Promise<void> {
    if (!profile.manual) {
      throw new Error('Manual proxy configuration missing');
    }

    log.debug('Setting manual proxy', { config: profile.manual });

    const proxyConfig: browser.proxy.ProxyConfig = {
      proxyType: 'manual',
      http: profile.manual.http ? `${profile.manual.http.host}:${profile.manual.http.port}` : undefined,
      ssl: profile.manual.https ? `${profile.manual.https.host}:${profile.manual.https.port}` : undefined,
      socks: profile.manual.socks ? `${profile.manual.socks.host}:${profile.manual.socks.port}` : undefined,
      socksVersion: profile.manual.socksVersion || 5,
      passthrough: profile.manual.bypassList.join(',')
    };

    try {
      await browser.proxy.settings.set({
        value: proxyConfig
      });
      log.info('Manual proxy set successfully via settings API');
    } catch (error) {
      log.info('Converting manual proxy to per-request mode (settings API requires additional permissions)', { reason: error instanceof Error ? error.message : error });
      // Convert to per-request mode automatically
      this.activeProfile = {
        ...profile,
        mode: 'perRequest',
        perRequest: {
          rules: this.convertManualToPerRequestRules(profile.manual)
        }
      };
      log.info('Manual proxy converted to per-request mode successfully', { profileId: profile.id });
    }
  }

  private async setPacProxy(profile: Profile): Promise<void> {
    if (!profile.pac?.url) {
      throw new Error('PAC URL missing');
    }

    log.debug('Setting PAC proxy', { url: profile.pac.url });

    try {
      await browser.proxy.settings.set({
        value: {
          proxyType: 'autoConfig',
          autoConfigUrl: profile.pac.url
        }
      });
      log.info('PAC proxy set successfully via settings API');
    } catch (error) {
      log.warn('PAC proxy configuration requires additional permissions and cannot be used', { reason: error instanceof Error ? error.message : error });
      // PAC scripts can't be easily converted to per-request rules, so we'll warn the user
      throw new Error('PAC proxy configuration requires additional permissions that are not currently available');
    }
  }

  private registerProxyListener(): void {
    if (this.isListenerRegistered) {
      return;
    }

    log.debug('Registering proxy request listener');

    browser.proxy.onRequest.addListener(
      (details) => this.handleProxyRequest(details),
      { urls: ['<all_urls>'] }
    );

    this.isListenerRegistered = true;
  }

  private handleProxyRequest(details: any): any {
    if (!this.activeProfile) {
      // No logging for every request - this gets called constantly
      return { type: 'direct' };
    }

    // Handle different proxy modes - NO LOGGING to prevent memory issues
    switch (this.activeProfile.mode) {
      case 'direct':
        return { type: 'direct' };
        
      case 'system':
        // Let system handle it - return nothing to use system proxy
        return undefined;
        
      case 'manual':
        // Manual mode that fell back to per-request should have perRequest rules
        if (this.activeProfile.perRequest?.rules) {
          return this.handlePerRequestRules(details, this.activeProfile.perRequest.rules);
        }
        // Fallback to direct if no rules
        return { type: 'direct' };
        
      case 'perRequest':
        if (!this.activeProfile.perRequest?.rules) {
          return { type: 'direct' };
        }
        return this.handlePerRequestRules(details, this.activeProfile.perRequest.rules);
        
      case 'pac':
        // PAC should be handled by browser's PAC interpreter
        return undefined;
        
      default:
        // Only log unknown modes as warnings
        log.warn('Unknown proxy mode', { mode: this.activeProfile.mode });
        return { type: 'direct' };
    }
  }

  private handlePerRequestRules(details: any, rules: PerRequestRule[]): any {
    const matchingRule = this.findMatchingRule(details, rules);
    
    if (matchingRule) {
      // No logging for successful matches - this gets called constantly
      const proxyInfo = this.addAuthenticationIfNeeded(matchingRule.proxy, this.activeProfile!);
      return proxyInfo;
    }

    // No logging for non-matches - this gets called constantly
    return { type: 'direct' };
  }

  private findMatchingRule(details: any, rules: PerRequestRule[]): PerRequestRule | null {
    const url = new URL(details.url);
    
    for (const rule of rules) {
      if (this.matchesHostPattern(url.hostname, rule.hostPattern)) {
        if (!rule.scheme || url.protocol.startsWith(rule.scheme)) {
          return rule;
        }
      }
    }
    
    return null;
  }

  private matchesHostPattern(hostname: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.startsWith('*.')) {
      const domain = pattern.slice(2);
      return hostname === domain || hostname.endsWith('.' + domain);
    }

    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(hostname);
    }

    return hostname.toLowerCase() === pattern.toLowerCase();
  }

  private convertManualToPerRequestRules(manual: NonNullable<Profile['manual']>): PerRequestRule[] {
    const rules: PerRequestRule[] = [];
    
    // Add HTTP proxy rule
    if (manual.http) {
      rules.push({
        hostPattern: '*',
        scheme: 'http',
        proxy: {
          type: 'http',
          host: manual.http.host,
          port: manual.http.port
        }
      });
    }
    
    // Add HTTPS proxy rule
    if (manual.https) {
      rules.push({
        hostPattern: '*',
        scheme: 'https',
        proxy: {
          type: 'https',
          host: manual.https.host,
          port: manual.https.port
        }
      });
    }
    
    // Add SOCKS proxy rule (covers all protocols if no specific HTTP/HTTPS proxy)
    if (manual.socks && !manual.http && !manual.https) {
      rules.push({
        hostPattern: '*',
        proxy: {
          type: manual.socksVersion === 4 ? 'socks4' : 'socks',
          host: manual.socks.host,
          port: manual.socks.port
        }
      });
    }
    
    return rules;
  }

  private addAuthenticationIfNeeded(
    proxyInfo: any, 
    profile: Profile
  ): any {
    if (profile.auth?.basicHeaderBase64 && proxyInfo.type !== 'direct') {
      return {
        ...proxyInfo,
        proxyAuthorizationHeader: `Basic ${profile.auth.basicHeaderBase64}`
      };
    }
    
    return proxyInfo;
  }

  public async getCurrentProxy(): Promise<any> {
    try {
      const settings = await browser.proxy.settings.get({});
      return settings.value;
    } catch (error) {
      log.debug('Cannot access proxy settings API (requires additional permissions)', { reason: error instanceof Error ? error.message : error });
      return { proxyType: 'per-request', note: 'Using per-request proxy handling' };
    }
  }

  public getActiveProfile(): Profile | null {
    return this.activeProfile;
  }

  public async clearProxy(): Promise<void> {
    log.info('Clearing proxy settings');
    await this.setDirectProxy();
    this.activeProfile = null;
    const updateData: { activeProfileId?: string } = {};
    await storageService.updateState(updateData);
  }

  public async testProxyConnectivity(profile: Profile): Promise<{ success: boolean; error?: string }> {
    log.info('Testing proxy connectivity', { profileId: profile.id });

    try {
      const testUrl = 'https://httpbin.org/get';
      const currentProfile = this.activeProfile;
      
      await this.setActiveProfile(profile.id);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        cache: 'no-cache'
      });

      if (currentProfile) {
        await this.setActiveProfile(currentProfile.id);
      }

      if (response.ok) {
        log.info('Proxy connectivity test successful', { profileId: profile.id });
        return { success: true };
      } else {
        const error = `HTTP ${response.status}: ${response.statusText}`;
        log.warn('Proxy connectivity test failed', { profileId: profile.id, error });
        return { success: false, error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Proxy connectivity test error', { profileId: profile.id, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  public destroy(): void {
    log.info('Destroying proxy service');
    
    if (this.isListenerRegistered) {
      browser.proxy.onRequest.removeListener(this.handleProxyRequest);
      this.isListenerRegistered = false;
    }
    
    this.activeProfile = null;
  }
}

export const proxyService = new ProxyService();