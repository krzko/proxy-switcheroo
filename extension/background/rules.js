import { probeService } from './probes.js';
import { createLogger } from './log.js';
const log = createLogger('RuleEngine');
export class RuleEngine {
    constructor() {
        this.probeCache = new Map();
        this.DEFAULT_OPTIONS = {
            timeout: 30000,
            enableCache: true,
            cacheTimeout: 60000
        };
    }
    async evaluateRules(rules, options = {}) {
        const startTime = Date.now();
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        log.info('Starting rule evaluation', { ruleCount: Object.keys(rules).length });
        const enabledRules = Object.values(rules)
            .filter(rule => rule.enabled)
            .sort((a, b) => a.priority - b.priority);
        if (enabledRules.length === 0) {
            log.warn('No enabled rules found');
            return {
                matched: false,
                results: {},
                evaluationTime: Date.now() - startTime
            };
        }
        let allResults = {};
        for (const rule of enabledRules) {
            log.debug('Evaluating rule', { ruleId: rule.id, ruleName: rule.name });
            try {
                const ruleResults = await this.evaluateRule(rule, opts);
                allResults = { ...allResults, ...ruleResults.results };
                if (ruleResults.matched) {
                    log.info('Rule matched', {
                        ruleId: rule.id,
                        ruleName: rule.name,
                        profileId: rule.then.setActiveProfile
                    });
                    return {
                        matched: true,
                        rule,
                        profileId: rule.then.setActiveProfile,
                        results: allResults,
                        evaluationTime: Date.now() - startTime
                    };
                }
                if (rule.stopOnMatch) {
                    log.debug('Rule did not match but has stopOnMatch, continuing to next rule', {
                        ruleId: rule.id
                    });
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                log.error('Error evaluating rule', {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    error: errorMessage
                });
                allResults[`${rule.id}_error`] = {
                    success: false,
                    error: errorMessage,
                    timestamp: Date.now()
                };
            }
        }
        log.info('No rules matched', { evaluatedRules: enabledRules.length });
        return {
            matched: false,
            results: allResults,
            evaluationTime: Date.now() - startTime
        };
    }
    async evaluateRule(rule, options = {}) {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        const results = {};
        log.debug('Evaluating individual rule triggers', { ruleId: rule.id });
        const triggerKeys = Object.keys(rule.when);
        if (triggerKeys.length === 0) {
            log.warn('Rule has no triggers', { ruleId: rule.id });
            return { matched: false, results };
        }
        let overallMatch = true;
        for (const triggerType of triggerKeys) {
            const trigger = rule.when[triggerType];
            if (!trigger)
                continue;
            const probeKey = `${rule.id}_${triggerType}`;
            try {
                let result = await this.getProbeResult(triggerType, trigger, opts);
                results[probeKey] = result;
                if (!result.success) {
                    overallMatch = false;
                    log.debug('Trigger failed', {
                        ruleId: rule.id,
                        triggerType,
                        error: result.error
                    });
                }
                else {
                    log.debug('Trigger succeeded', {
                        ruleId: rule.id,
                        triggerType
                    });
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                log.error('Error testing trigger', {
                    ruleId: rule.id,
                    triggerType,
                    error: errorMessage
                });
                results[probeKey] = {
                    success: false,
                    error: errorMessage,
                    timestamp: Date.now()
                };
                overallMatch = false;
            }
        }
        log.debug('Rule evaluation completed', {
            ruleId: rule.id,
            matched: overallMatch,
            triggerCount: triggerKeys.length
        });
        return { matched: overallMatch, results };
    }
    async testRule(rule) {
        log.info('Testing rule manually', { ruleId: rule.id, ruleName: rule.name });
        try {
            const evaluation = await this.evaluateRule(rule, { enableCache: false });
            return {
                success: evaluation.matched,
                results: evaluation.results
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error('Error testing rule', { ruleId: rule.id, error: errorMessage });
            return {
                success: false,
                results: {},
                error: errorMessage
            };
        }
    }
    async getProbeResult(triggerType, trigger, options) {
        const cacheKey = `${triggerType}_${JSON.stringify(trigger)}`;
        if (options.enableCache) {
            const cached = this.probeCache.get(cacheKey);
            if (cached && cached.expiry > Date.now()) {
                log.debug('Using cached probe result', { triggerType, cacheKey });
                return cached.result;
            }
        }
        let result;
        switch (triggerType) {
            case 'reachability':
                result = await probeService.testReachability(trigger);
                break;
            case 'dnsResolve':
                result = await probeService.testDnsResolve(trigger);
                break;
            case 'captivePortal':
                result = await probeService.testCaptivePortal(trigger);
                break;
            case 'ipInfo':
                result = await probeService.testIpInfo(trigger);
                break;
            case 'timeWindow':
                result = probeService.testTimeWindow(trigger);
                break;
            case 'manualFlag':
                result = probeService.testManualFlag(trigger);
                break;
            default:
                throw new Error(`Unknown trigger type: ${triggerType}`);
        }
        if (options.enableCache) {
            this.probeCache.set(cacheKey, {
                result,
                expiry: Date.now() + options.cacheTimeout
            });
        }
        return result;
    }
    clearCache() {
        log.info('Clearing probe cache');
        this.probeCache.clear();
    }
    getCacheStats() {
        const keys = Array.from(this.probeCache.keys());
        return {
            size: this.probeCache.size,
            keys
        };
    }
    abortAllProbes() {
        log.info('Aborting all active probes');
        probeService.abortAllProbes();
    }
    cleanExpiredCache() {
        const now = Date.now();
        const expiredKeys = [];
        this.probeCache.forEach((value, key) => {
            if (value.expiry <= now) {
                expiredKeys.push(key);
            }
        });
        expiredKeys.forEach(key => {
            this.probeCache.delete(key);
        });
        if (expiredKeys.length > 0) {
            log.debug('Cleaned expired cache entries', { count: expiredKeys.length });
        }
    }
    startCacheCleanup(intervalMs = 300000) {
        setInterval(() => {
            this.cleanExpiredCache();
        }, intervalMs);
    }
}
export const ruleEngine = new RuleEngine();
//# sourceMappingURL=rules.js.map