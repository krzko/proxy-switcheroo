export type ProxyMode = 'direct' | 'system' | 'manual' | 'pac' | 'perRequest';

export type ProxyType = 'http' | 'https' | 'socks' | 'socks4';

export interface ProxyServer {
  host: string;
  port: number;
}

export interface ManualProxyConfig {
  http?: ProxyServer;
  https?: ProxyServer;
  ftp?: ProxyServer;
  socks?: ProxyServer;
  socksVersion?: 4 | 5;
  bypassList: string[];
}

export interface PacProxyConfig {
  url: string;
}

export interface PerRequestRule {
  hostPattern: string;
  scheme?: string;
  proxy: browser.proxy.ProxyInfo;
}

export interface PerRequestProxyConfig {
  rules: PerRequestRule[];
}

export interface ProxyAuth {
  basicHeaderBase64?: string;
}

export interface Profile {
  id: string;
  name: string;
  mode: ProxyMode;
  manual?: ManualProxyConfig;
  pac?: PacProxyConfig;
  perRequest?: PerRequestProxyConfig;
  auth?: ProxyAuth;
}

export interface ReachabilityTrigger {
  url: string;
  method?: 'HEAD' | 'GET';
  expectStatus?: number;
}

export interface DnsResolveTrigger {
  hostname: string;
  matches?: 'regex' | 'exact';
  expectIPCIDR?: string[];
}

export interface CaptivePortalTrigger {
  state: 'locked' | 'unlocked' | 'unknown';
}

export interface IpInfoTrigger {
  providerUrl?: string;
  expectOrg?: string;
  expectCountry?: string;
}

export interface TimeWindowTrigger {
  tz?: 'system';
  days?: number[];
  from?: string;
  to?: string;
}

export interface ManualFlagTrigger {
  value: boolean;
}

export interface RuleTriggers {
  reachability?: ReachabilityTrigger;
  dnsResolve?: DnsResolveTrigger;
  captivePortal?: CaptivePortalTrigger;
  ipInfo?: IpInfoTrigger;
  timeWindow?: TimeWindowTrigger;
  manualFlag?: ManualFlagTrigger;
}

export interface RuleAction {
  setActiveProfile: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  stopOnMatch: boolean;
  when: RuleTriggers;
  then: RuleAction;
}

export interface ExtensionState {
  activeProfileId?: string;
  autoMode: boolean;
  lastRuleMatched?: string;
  lastCheckTime?: number;
}

export interface StorageData {
  profiles: Record<string, Profile>;
  rules: Record<string, Rule>;
  state: ExtensionState;
}

export interface ProbeResult {
  success: boolean;
  error?: string;
  data?: unknown;
  timestamp: number;
}

export interface EvaluationContext {
  profiles: Record<string, Profile>;
  rules: Record<string, Rule>;
  state: ExtensionState;
}

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  message: string;
  data?: unknown;
}

export interface ConfigData {
  profiles: Profile[];
  rules: Rule[];
  state?: Partial<ExtensionState>;
}

export interface PopupMessage {
  type: 'getState' | 'setState' | 'setProfile' | 'forceEvaluation';
  data?: unknown;
}

export interface PopupResponse {
  type: 'state' | 'success' | 'error';
  data?: unknown;
}

export interface OptionsMessage {
  type: 'getProfiles' | 'saveProfile' | 'deleteProfile' | 'getRules' | 'saveRule' | 'deleteRule' | 'importConfig' | 'exportConfig' | 'testRule';
  data?: unknown;
}

export interface OptionsResponse {
  type: 'profiles' | 'rules' | 'config' | 'testResult' | 'success' | 'error';
  data?: unknown;
}