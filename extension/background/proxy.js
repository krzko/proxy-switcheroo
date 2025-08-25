import { storageService } from './storage.js';
import { createLogger } from './log.js';
const log = createLogger('ProxyService');
export class ProxyService {
    constructor() {
        this.activeProfile = null;
        this.isListenerRegistered = false;
    }
    async initialise() {
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
    }
    async setActiveProfile(profileId) {
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
    }
    async setDirectProxy() {
        log.debug('Setting direct proxy');
        try {
            await browser.proxy.settings.set({
                value: { proxyType: 'none' }
            });
            log.info('Direct proxy set successfully via settings API');
        }
        catch (error) {
            log.warn('Using per-request proxy handling (settings API requires additional permissions)', { reason: error instanceof Error ? error.message : error });
        }
    }
    async setSystemProxy() {
        log.debug('Setting system proxy');
        try {
            await browser.proxy.settings.set({
                value: { proxyType: 'system' }
            });
            log.info('System proxy set successfully via settings API');
        }
        catch (error) {
            log.warn('Using per-request proxy handling (settings API requires additional permissions)', { reason: error instanceof Error ? error.message : error });
        }
    }
    async setManualProxy(profile) {
        if (!profile.manual) {
            throw new Error('Manual proxy configuration missing');
        }
        log.debug('Setting manual proxy', { config: profile.manual });
        const proxyConfig = {
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
        }
        catch (error) {
            log.info('Converting manual proxy to per-request mode (settings API requires additional permissions)', { reason: error instanceof Error ? error.message : error });
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
    async setPacProxy(profile) {
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
        }
        catch (error) {
            log.warn('PAC proxy configuration requires additional permissions and cannot be used', { reason: error instanceof Error ? error.message : error });
            throw new Error('PAC proxy configuration requires additional permissions that are not currently available');
        }
    }
    registerProxyListener() {
        if (this.isListenerRegistered) {
            return;
        }
        log.debug('Registering proxy request listener');
        browser.proxy.onRequest.addListener((details) => this.handleProxyRequest(details), { urls: ['<all_urls>'] });
        this.isListenerRegistered = true;
    }
    handleProxyRequest(details) {
        if (!this.activeProfile) {
            return { type: 'direct' };
        }
        switch (this.activeProfile.mode) {
            case 'direct':
                return { type: 'direct' };
            case 'system':
                return undefined;
            case 'manual':
                if (this.activeProfile.perRequest?.rules) {
                    return this.handlePerRequestRules(details, this.activeProfile.perRequest.rules);
                }
                return { type: 'direct' };
            case 'perRequest':
                if (!this.activeProfile.perRequest?.rules) {
                    return { type: 'direct' };
                }
                return this.handlePerRequestRules(details, this.activeProfile.perRequest.rules);
            case 'pac':
                return undefined;
            default:
                log.warn('Unknown proxy mode', { mode: this.activeProfile.mode });
                return { type: 'direct' };
        }
    }
    handlePerRequestRules(details, rules) {
        const matchingRule = this.findMatchingRule(details, rules);
        if (matchingRule) {
            const proxyInfo = this.addAuthenticationIfNeeded(matchingRule.proxy, this.activeProfile);
            return proxyInfo;
        }
        return { type: 'direct' };
    }
    findMatchingRule(details, rules) {
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
    matchesHostPattern(hostname, pattern) {
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
    convertManualToPerRequestRules(manual) {
        const rules = [];
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
    addAuthenticationIfNeeded(proxyInfo, profile) {
        if (profile.auth?.basicHeaderBase64 && proxyInfo.type !== 'direct') {
            return {
                ...proxyInfo,
                proxyAuthorizationHeader: `Basic ${profile.auth.basicHeaderBase64}`
            };
        }
        return proxyInfo;
    }
    async getCurrentProxy() {
        try {
            const settings = await browser.proxy.settings.get({});
            return settings.value;
        }
        catch (error) {
            log.debug('Cannot access proxy settings API (requires additional permissions)', { reason: error instanceof Error ? error.message : error });
            return { proxyType: 'per-request', note: 'Using per-request proxy handling' };
        }
    }
    getActiveProfile() {
        return this.activeProfile;
    }
    async clearProxy() {
        log.info('Clearing proxy settings');
        await this.setDirectProxy();
        this.activeProfile = null;
        const updateData = {};
        await storageService.updateState(updateData);
    }
    async testProxyConnectivity(profile) {
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
            }
            else {
                const error = `HTTP ${response.status}: ${response.statusText}`;
                log.warn('Proxy connectivity test failed', { profileId: profile.id, error });
                return { success: false, error };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Proxy connectivity test error', { profileId: profile.id, error: errorMessage });
            return { success: false, error: errorMessage };
        }
    }
    destroy() {
        log.info('Destroying proxy service');
        if (this.isListenerRegistered) {
            browser.proxy.onRequest.removeListener(this.handleProxyRequest);
            this.isListenerRegistered = false;
        }
        this.activeProfile = null;
    }
}
export const proxyService = new ProxyService();
//# sourceMappingURL=proxy.js.map