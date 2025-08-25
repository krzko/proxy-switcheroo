import type { StorageData, Profile, Rule, ExtensionState, ConfigData } from '../types/models.js';

export class StorageService {
  private static readonly STORAGE_VERSION = 1;
  private static readonly STORAGE_KEYS = {
    PROFILES: 'profiles',
    RULES: 'rules',
    STATE: 'state',
    VERSION: 'version'
  } as const;

  private static readonly DEFAULT_STATE: ExtensionState = {
    autoMode: true,
    lastCheckTime: Date.now()
  };

  private static readonly DEFAULT_PROFILES: Record<string, Profile> = {
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

  private static readonly DEFAULT_RULES: Record<string, Rule> = {
    'work-hours': {
      id: 'work-hours',
      name: 'Work Hours (Example)',
      enabled: false,
      priority: 100,
      stopOnMatch: true,
      when: {
        timeWindow: {
          days: [1, 2, 3, 4, 5], // Monday to Friday
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

  public async initialise(): Promise<void> {
    await this.migrateIfNeeded();
    await this.ensureDefaults();
  }

  public async getProfiles(): Promise<Record<string, Profile>> {
    const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.PROFILES);
    return result[StorageService.STORAGE_KEYS.PROFILES] || {};
  }

  public async getProfile(id: string): Promise<Profile | undefined> {
    const profiles = await this.getProfiles();
    return profiles[id];
  }

  public async saveProfile(profile: Profile): Promise<void> {
    const profiles = await this.getProfiles();
    profiles[profile.id] = profile;
    await browser.storage.local.set({
      [StorageService.STORAGE_KEYS.PROFILES]: profiles
    });
  }

  public async deleteProfile(id: string): Promise<void> {
    const profiles = await this.getProfiles();
    delete profiles[id];
    await browser.storage.local.set({
      [StorageService.STORAGE_KEYS.PROFILES]: profiles
    });
  }

  public async getRules(): Promise<Record<string, Rule>> {
    const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.RULES);
    return result[StorageService.STORAGE_KEYS.RULES] || {};
  }

  public async getRule(id: string): Promise<Rule | undefined> {
    const rules = await this.getRules();
    return rules[id];
  }

  public async saveRule(rule: Rule): Promise<void> {
    const rules = await this.getRules();
    rules[rule.id] = rule;
    await browser.storage.local.set({
      [StorageService.STORAGE_KEYS.RULES]: rules
    });
  }

  public async deleteRule(id: string): Promise<void> {
    const rules = await this.getRules();
    delete rules[id];
    await browser.storage.local.set({
      [StorageService.STORAGE_KEYS.RULES]: rules
    });
  }

  public async getState(): Promise<ExtensionState> {
    const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.STATE);
    return { ...StorageService.DEFAULT_STATE, ...result[StorageService.STORAGE_KEYS.STATE] };
  }

  public async updateState(updates: Partial<ExtensionState>): Promise<void> {
    const currentState = await this.getState();
    const newState = { ...currentState, ...updates };
    await browser.storage.local.set({
      [StorageService.STORAGE_KEYS.STATE]: newState
    });
  }

  public async getAllData(): Promise<StorageData> {
    const [profiles, rules, state] = await Promise.all([
      this.getProfiles(),
      this.getRules(),
      this.getState()
    ]);
    
    return { profiles, rules, state };
  }

  public async exportConfig(): Promise<ConfigData> {
    const { profiles, rules, state } = await this.getAllData();
    
    return {
      profiles: Object.values(profiles),
      rules: Object.values(rules),
      state
    };
  }

  public async importConfig(config: ConfigData): Promise<void> {
    const profiles: Record<string, Profile> = {};
    const rules: Record<string, Rule> = {};

    config.profiles.forEach(profile => {
      profiles[profile.id] = profile;
    });

    config.rules.forEach(rule => {
      rules[rule.id] = rule;
    });

    const updates: Record<string, unknown> = {
      [StorageService.STORAGE_KEYS.PROFILES]: profiles,
      [StorageService.STORAGE_KEYS.RULES]: rules
    };

    if (config.state) {
      const currentState = await this.getState();
      updates[StorageService.STORAGE_KEYS.STATE] = { ...currentState, ...config.state };
    }

    await browser.storage.local.set(updates);
  }

  public async clearAll(): Promise<void> {
    await browser.storage.local.clear();
    await this.ensureDefaults();
  }

  private async migrateIfNeeded(): Promise<void> {
    const result = await browser.storage.local.get(StorageService.STORAGE_KEYS.VERSION);
    const currentVersion = result[StorageService.STORAGE_KEYS.VERSION] || 0;

    if (currentVersion < StorageService.STORAGE_VERSION) {
      await this.performMigration(currentVersion, StorageService.STORAGE_VERSION);
      await browser.storage.local.set({
        [StorageService.STORAGE_KEYS.VERSION]: StorageService.STORAGE_VERSION
      });
    }
  }

  private async performMigration(fromVersion: number, toVersion: number): Promise<void> {
    console.log(`Migrating storage from version ${fromVersion} to ${toVersion}`);
    
    if (fromVersion === 0) {
      await this.ensureDefaults();
    }
  }

  private async ensureDefaults(): Promise<void> {
    const [profiles, rules, state] = await Promise.all([
      this.getProfiles(),
      this.getRules(),
      this.getState()
    ]);

    const updates: Record<string, unknown> = {};

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

  public onChanged(callback: (changes: Record<string, browser.storage.StorageChange>) => void): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes);
      }
    });
  }
}

export const storageService = new StorageService();