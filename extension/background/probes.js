import { createLogger } from './log.js';
const log = createLogger('Probes');
export class ProbeService {
    constructor(timeouts = {}) {
        this.abortControllers = new Map();
        this.timeouts = { ...ProbeService.DEFAULT_TIMEOUTS, ...timeouts };
    }
    async testReachability(trigger) {
        const probeId = `reachability-${Date.now()}`;
        log.debug('Testing reachability', { url: trigger.url, method: trigger.method });
        try {
            const controller = new AbortController();
            this.abortControllers.set(probeId, controller);
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, this.timeouts.reachability);
            const response = await fetch(trigger.url, {
                method: trigger.method || 'HEAD',
                signal: controller.signal,
                cache: 'no-cache',
                redirect: 'manual'
            });
            clearTimeout(timeoutId);
            this.abortControllers.delete(probeId);
            const expectStatus = trigger.expectStatus || 200;
            const success = response.status === expectStatus;
            log.debug('Reachability test completed', {
                url: trigger.url,
                status: response.status,
                expected: expectStatus,
                success
            });
            return {
                success,
                data: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {}
                },
                timestamp: Date.now()
            };
        }
        catch (error) {
            this.abortControllers.delete(probeId);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.warn('Reachability test failed', { url: trigger.url, error: errorMessage });
            return {
                success: false,
                error: errorMessage,
                timestamp: Date.now()
            };
        }
    }
    async testDnsResolve(trigger) {
        log.debug('Testing DNS resolution', { hostname: trigger.hostname });
        try {
            const dnsResult = await browser.dns.resolve(trigger.hostname);
            if (!dnsResult || !dnsResult.addresses || dnsResult.addresses.length === 0) {
                return {
                    success: false,
                    error: 'No addresses resolved',
                    timestamp: Date.now()
                };
            }
            const addresses = dnsResult.addresses;
            let success = true;
            if (trigger.expectIPCIDR && trigger.expectIPCIDR.length > 0) {
                success = this.checkIPInCIDRRanges(addresses, trigger.expectIPCIDR);
            }
            if (trigger.matches === 'exact' && trigger.expectIPCIDR) {
                const expectedIPs = trigger.expectIPCIDR;
                success = addresses.some(addr => expectedIPs.includes(addr));
            }
            log.debug('DNS resolution completed', {
                hostname: trigger.hostname,
                addresses,
                success
            });
            return {
                success,
                data: {
                    addresses,
                    canonicalName: dnsResult.canonicalName
                },
                timestamp: Date.now()
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'DNS resolution failed';
            log.warn('DNS resolution failed', { hostname: trigger.hostname, error: errorMessage });
            return {
                success: false,
                error: errorMessage,
                timestamp: Date.now()
            };
        }
    }
    async testCaptivePortal(trigger) {
        log.debug('Testing captive portal state', { expectedState: trigger.state });
        try {
            const state = await browser.captivePortal.getState();
            const success = state === trigger.state;
            log.debug('Captive portal test completed', {
                currentState: state,
                expectedState: trigger.state,
                success
            });
            return {
                success,
                data: { state },
                timestamp: Date.now()
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Captive portal check failed';
            log.warn('Captive portal test failed', { error: errorMessage });
            return {
                success: false,
                error: errorMessage,
                timestamp: Date.now()
            };
        }
    }
    async testIpInfo(trigger) {
        const url = trigger.providerUrl || 'https://ipinfo.io/json';
        const probeId = `ipinfo-${Date.now()}`;
        log.debug('Testing IP info', { url, expectOrg: trigger.expectOrg, expectCountry: trigger.expectCountry });
        try {
            const controller = new AbortController();
            this.abortControllers.set(probeId, controller);
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, this.timeouts.ipInfo);
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);
            this.abortControllers.delete(probeId);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            let success = true;
            if (trigger.expectOrg && data.org) {
                success = success && data.org.toLowerCase().includes(trigger.expectOrg.toLowerCase());
            }
            if (trigger.expectCountry && data.country) {
                success = success && data.country.toLowerCase() === trigger.expectCountry.toLowerCase();
            }
            log.debug('IP info test completed', {
                org: data.org,
                country: data.country,
                success
            });
            return {
                success,
                data,
                timestamp: Date.now()
            };
        }
        catch (error) {
            this.abortControllers.delete(probeId);
            const errorMessage = error instanceof Error ? error.message : 'IP info request failed';
            log.warn('IP info test failed', { url, error: errorMessage });
            return {
                success: false,
                error: errorMessage,
                timestamp: Date.now()
            };
        }
    }
    testTimeWindow(trigger) {
        const now = new Date();
        const currentDay = now.getDay() || 7;
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        let success = true;
        if (trigger.days && trigger.days.length > 0) {
            success = success && trigger.days.includes(currentDay);
        }
        if (trigger.from && trigger.to) {
            success = success && currentTime >= trigger.from && currentTime <= trigger.to;
        }
        log.debug('Time window test completed', {
            currentDay,
            currentTime,
            expectedDays: trigger.days,
            timeRange: `${trigger.from}-${trigger.to}`,
            success
        });
        return {
            success,
            data: {
                currentDay,
                currentTime,
                timezone: trigger.tz || 'system'
            },
            timestamp: Date.now()
        };
    }
    testManualFlag(trigger) {
        const success = trigger.value;
        log.debug('Manual flag test completed', {
            expectedValue: trigger.value,
            success
        });
        return {
            success,
            data: { value: trigger.value },
            timestamp: Date.now()
        };
    }
    abortAllProbes() {
        log.info('Aborting all active probes');
        this.abortControllers.forEach((controller, probeId) => {
            controller.abort();
            log.debug('Aborted probe', { probeId });
        });
        this.abortControllers.clear();
    }
    checkIPInCIDRRanges(addresses, cidrs) {
        return addresses.some(address => {
            return cidrs.some(cidr => this.isIPInCIDR(address, cidr));
        });
    }
    isIPInCIDR(ip, cidr) {
        try {
            const parts = cidr.split('/');
            if (parts.length !== 2) {
                return false;
            }
            const network = parts[0];
            const prefixStr = parts[1];
            const prefix = parseInt(prefixStr, 10);
            if (isNaN(prefix)) {
                return false;
            }
            if (this.isIPv4(ip) && this.isIPv4(network)) {
                return this.isIPv4InCIDR(ip, network, prefix);
            }
            if (this.isIPv6(ip) && this.isIPv6(network)) {
                return this.isIPv6InCIDR(ip, network, prefix);
            }
            return false;
        }
        catch (error) {
            log.warn('Error checking IP in CIDR', { ip, cidr, error });
            return false;
        }
    }
    isIPv4(ip) {
        const parts = ip.split('.');
        return parts.length === 4 && parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255 && part === num.toString();
        });
    }
    isIPv6(ip) {
        return /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/.test(ip);
    }
    isIPv4InCIDR(ip, network, prefix) {
        const ipNum = this.ipv4ToNumber(ip);
        const networkNum = this.ipv4ToNumber(network);
        const mask = 0xFFFFFFFF << (32 - prefix);
        return (ipNum & mask) === (networkNum & mask);
    }
    isIPv6InCIDR(ip, network, prefix) {
        return ip.toLowerCase().startsWith(network.toLowerCase().substring(0, Math.floor(prefix / 4)));
    }
    ipv4ToNumber(ip) {
        return ip.split('.').reduce((acc, part) => (acc << 8) + parseInt(part, 10), 0) >>> 0;
    }
}
ProbeService.DEFAULT_TIMEOUTS = {
    dns: 5000,
    reachability: 10000,
    ipInfo: 15000
};
export const probeService = new ProbeService();
//# sourceMappingURL=probes.js.map