export class StorageService {
    async initialise() {
        await this.migrateIfNeeded();
        await this.ensureDefaults();
    }
    async getProfiles() {
        const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.PROFILES);
        return result[StorageService.STORAGE_KEYS.PROFILES] || {};
    }
    async getProfile(id) {
        const profiles = await this.getProfiles();
        return profiles[id];
    }
    async saveProfile(profile) {
        const profiles = await this.getProfiles();
        profiles[profile.id] = profile;
        await browser.storage.local.set({
            [StorageService.STORAGE_KEYS.PROFILES]: profiles
        });
    }
    async deleteProfile(id) {
        const profiles = await this.getProfiles();
        delete profiles[id];
        await browser.storage.local.set({
            [StorageService.STORAGE_KEYS.PROFILES]: profiles
        });
    }
    async getRules() {
        const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.RULES);
        return result[StorageService.STORAGE_KEYS.RULES] || {};
    }
    async getRule(id) {
        const rules = await this.getRules();
        return rules[id];
    }
    async saveRule(rule) {
        const rules = await this.getRules();
        rules[rule.id] = rule;
        await browser.storage.local.set({
            [StorageService.STORAGE_KEYS.RULES]: rules
        });
    }
    async deleteRule(id) {
        const rules = await this.getRules();
        delete rules[id];
        await browser.storage.local.set({
            [StorageService.STORAGE_KEYS.RULES]: rules
        });
    }
    async getState() {
        const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.STATE);
        return { ...StorageService.DEFAULT_STATE, ...result[StorageService.STORAGE_KEYS.STATE] };
    }
    async updateState(updates) {
        const currentState = await this.getState();
        const newState = { ...currentState, ...updates };
        await browser.storage.local.set({
            [StorageService.STORAGE_KEYS.STATE]: newState
        });
    }
    async getAllData() {
        const [profiles, rules, state] = await Promise.all([
            this.getProfiles(),
            this.getRules(),
            this.getState()
        ]);
        return { profiles, rules, state };
    }
    async exportConfig() {
        const { profiles, rules, state } = await this.getAllData();
        return {
            profiles: Object.values(profiles),
            rules: Object.values(rules),
            state
        };
    }
    async importConfig(config) {
        const profiles = {};
        const rules = {};
        config.profiles.forEach(profile => {
            profiles[profile.id] = profile;
        });
        config.rules.forEach(rule => {
            rules[rule.id] = rule;
        });
        const updates = {
            [StorageService.STORAGE_KEYS.PROFILES]: profiles,
            [StorageService.STORAGE_KEYS.RULES]: rules
        };
        if (config.state) {
            const currentState = await this.getState();
            updates[StorageService.STORAGE_KEYS.STATE] = { ...currentState, ...config.state };
        }
        await browser.storage.local.set(updates);
    }
    async clearAll() {
        await browser.storage.local.clear();
        await this.ensureDefaults();
    }
    async migrateIfNeeded() {
        const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.VERSION);
        const currentVersion = result[StorageService.STORAGE_KEYS.VERSION] || 0;
        if (currentVersion < StorageService.STORAGE_VERSION) {
            await this.performMigration(currentVersion, StorageService.STORAGE_VERSION);
            await browser.storage.local.set({
                [StorageService.STORAGE_KEYS.VERSION]: StorageService.STORAGE_VERSION
            });
        }
    }
    async performMigration(fromVersion, toVersion) {
        console.log(`Migrating storage from version ${fromVersion} to ${toVersion}`);
        if (fromVersion === 0) {
            await this.ensureDefaults();
        }
    }
    async ensureDefaults() {
        const [profiles, rules, state] = await Promise.all([
            this.getProfiles(),
            this.getRules(),
            this.getState()
        ]);
        const updates = {};
        if (Object.keys(profiles).length === 0) {
            updates[StorageService.STORAGE_KEYS.PROFILES] = StorageService.DEFAULT_PROFILES;
        }
        if (Object.keys(rules).length === 0) {
            updates[StorageService.STORAGE_KEYS.RULES] = StorageService.DEFAULT_RULES;
        }
        if (!state.lastCheckTime) {
            updates[StorageService.STORAGE_KEYS.STATE] = { ...state, ...StorageService.DEFAULT_STATE };
        }
        if (Object.keys(updates).length > 0) {
            await browser.storage.local.set(updates);
        }
    }
    onChanged(callback) {
        browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                callback(changes);
            }
        });
    }
}
StorageService.STORAGE_VERSION = 1;
StorageService.STORAGE_KEYS = {
    PROFILES: 'profiles',
    RULES: 'rules',
    STATE: 'state',
    VERSION: 'version'
};
StorageService.DEFAULT_STATE = {
    autoMode: true,
    lastCheckTime: Date.now()
};
StorageService.DEFAULT_PROFILES = {
    'direct': {
        id: 'direct',
        name: 'Direct Connection',
        mode: 'direct'
    },
    'system': {
        id: 'system',
        name: 'System Proxy',
        mode: 'system'
    },
    'work-proxy': {
        id: 'work-proxy',
        name: 'Work Proxy (Example)',
        mode: 'manual',
        manual: {
            http: { host: 'proxy.company.com', port: 8080 },
            https: { host: 'proxy.company.com', port: 8080 },
            bypassList: ['localhost', '127.0.0.1', '*.local']
        }
    }
};
StorageService.DEFAULT_RULES = {
    'work-hours': {
        id: 'work-hours',
        name: 'Work Hours (Example)',
        enabled: false,
        priority: 100,
        stopOnMatch: true,
        when: {
            timeWindow: {
                days: [1, 2, 3, 4, 5],
                from: '09:00',
                to: '17:00'
            }
        },
        then: {
            setActiveProfile: 'work-proxy'
        }
    },
    'corporate-network': {
        id: 'corporate-network',
        name: 'Corporate Network (Example)',
        enabled: false,
        priority: 50,
        stopOnMatch: true,
        when: {
            dnsResolve: {
                hostname: 'intranet.company.com',
                matches: 'exact'
            }
        },
        then: {
            setActiveProfile: 'work-proxy'
        }
    },
    'home-network': {
        id: 'home-network',
        name: 'Home Network (Example)',
        enabled: false,
        priority: 200,
        stopOnMatch: true,
        when: {
            ipInfo: {
                expectOrg: 'Home ISP Provider'
            }
        },
        then: {
            setActiveProfile: 'direct'
        }
    }
};
export const storageService = new StorageService();
//# sourceMappingURL=storage.js.map